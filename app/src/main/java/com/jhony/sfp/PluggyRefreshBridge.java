package com.jhony.sfp;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Ponte mínima dedicada ao refresh explícito dos Items da Pluggy.
 *
 * O preview normal do SFP é somente leitura. Esta ponte existe porque a Pluggy
 * exige PATCH /items/{id} para pedir uma nova sincronização com a instituição.
 * Ela não cria lançamentos nem altera o estado financeiro do SFP: apenas pede
 * atualização ao provedor e expõe o status do refresh para a WebView.
 */
public final class PluggyRefreshBridge {
    private static final String API_BASE = "https://api.pluggy.ai";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "sfp_open_finance_pluggy_v1";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private static final String PREFS = "sfp_open_finance_secure_vault";
    private static final String PREF_CIPHERTEXT = "pluggy_credentials_ciphertext";
    private static final String PREF_IV = "pluggy_credentials_iv";
    private static final String PREF_ITEM_IDS = "pluggy_item_references";

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");

    private final Context context;
    private final Set<String> lastRefreshIds = new LinkedHashSet<>();

    PluggyRefreshBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    private static final class Credentials {
        final String clientId;
        final String clientSecret;

        Credentials(String clientId, String clientSecret) {
            this.clientId = clientId;
            this.clientSecret = clientSecret;
        }
    }

    private static final class HttpResult {
        final int status;
        final String body;

        HttpResult(int status, String body) {
            this.status = status;
            this.body = body == null ? "" : body;
        }
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey existingKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        if (!keyStore.containsAlias(KEY_ALIAS)) return null;
        KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
        return entry instanceof KeyStore.SecretKeyEntry
                ? ((KeyStore.SecretKeyEntry) entry).getSecretKey()
                : null;
    }

    private Credentials readCredentials() {
        String ciphertextB64 = prefs().getString(PREF_CIPHERTEXT, null);
        String ivB64 = prefs().getString(PREF_IV, null);
        if (ciphertextB64 == null || ivB64 == null
                || ciphertextB64.trim().isEmpty() || ivB64.trim().isEmpty()) return null;
        try {
            SecretKey key = existingKey();
            if (key == null) return null;
            byte[] ciphertext = Base64.decode(ciphertextB64, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
            JSONObject payload = new JSONObject(new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8));
            String clientId = clean(payload.optString("clientId", ""));
            String clientSecret = clean(payload.optString("clientSecret", ""));
            if (clientId.isEmpty() || clientSecret.isEmpty()) return null;
            return new Credentials(clientId, clientSecret);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String clean(String value) {
        if (value == null) return "";
        String clean = value.trim();
        return "null".equalsIgnoreCase(clean) || "undefined".equalsIgnoreCase(clean) ? "" : clean;
    }

    private static JSONObject envelope(boolean ok) throws Exception {
        JSONObject value = new JSONObject();
        value.put("ok", ok);
        return value;
    }

    private static String error(String code, String message, int status) {
        try {
            JSONObject value = envelope(false);
            value.put("code", code);
            value.put("message", message);
            value.put("status", status);
            return value.toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"code\":\"REFRESH_FAILED\"}";
        }
    }

    private HttpResult request(String method, String path, JSONObject body, String apiKey) throws Exception {
        if (!("/auth".equals(path) || "/items".equals(path) || path.matches("^/items/[0-9a-fA-F-]{36}$"))) {
            throw new SecurityException("Endpoint Pluggy não autorizado");
        }
        URL url = new URL(API_BASE + path);
        if (!"https".equalsIgnoreCase(url.getProtocol()) || !"api.pluggy.ai".equalsIgnoreCase(url.getHost())) {
            throw new SecurityException("Host Pluggy não autorizado");
        }

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "SmartFinancialPlanner/" + BuildConfig.VERSION_NAME + " OpenFinanceRefresh/1.0");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(25000);
            if (apiKey != null && !apiKey.trim().isEmpty()) {
                connection.setRequestProperty("X-API-KEY", apiKey.trim());
            }
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                    output.flush();
                }
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            if (stream == null) return new HttpResult(status, "");
            try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                return new HttpResult(status, output.toString("UTF-8"));
            }
        } finally {
            if (connection != null) {
                try { connection.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    private String apiKey() throws Exception {
        Credentials credentials = readCredentials();
        if (credentials == null) throw new IllegalStateException("AUTH_REQUIRED");
        try {
            JSONObject payload = new JSONObject();
            payload.put("clientId", credentials.clientId);
            payload.put("clientSecret", credentials.clientSecret);
            HttpResult response = request("POST", "/auth", payload, null);
            if (response.status == 401 || response.status == 403) throw new SecurityException("INVALID_CREDENTIALS");
            if (response.status < 200 || response.status >= 300) throw new IllegalStateException("AUTH_HTTP_" + response.status);
            JSONObject value = new JSONObject(response.body);
            String key = clean(value.optString("apiKey", ""));
            if (key.isEmpty()) key = clean(value.optString("accessToken", ""));
            if (key.isEmpty()) key = clean(value.optString("access_token", ""));
            if (key.isEmpty()) throw new IllegalStateException("AUTH_TOKEN_MISSING");
            return key;
        } finally {
            credentials = null;
        }
    }

    private Set<String> savedItemIds() {
        Set<String> ids = new LinkedHashSet<>();
        String raw = prefs().getString(PREF_ITEM_IDS, "");
        if (raw == null || raw.trim().isEmpty()) return ids;
        for (String token : raw.split(",")) {
            String id = clean(token);
            if (UUID_PATTERN.matcher(id).matches()) ids.add(id);
        }
        return ids;
    }

    private static JSONArray collection(String raw) throws Exception {
        if (raw == null || raw.trim().isEmpty()) return new JSONArray();
        String clean = raw.trim();
        if (clean.startsWith("[")) return new JSONArray(clean);
        JSONObject root = new JSONObject(clean);
        JSONArray values = root.optJSONArray("results");
        if (values == null) values = root.optJSONArray("data");
        if (values == null) values = root.optJSONArray("items");
        return values == null ? new JSONArray() : values;
    }

    private Set<String> discoverItemIds(String key) throws Exception {
        Set<String> ids = savedItemIds();
        if (!ids.isEmpty()) return ids;
        HttpResult response = request("GET", "/items", null, key);
        if (response.status < 200 || response.status >= 300) throw new IllegalStateException("ITEMS_HTTP_" + response.status);
        JSONArray items = collection(response.body);
        for (int index = 0; index < items.length(); index++) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) continue;
            String id = clean(item.optString("id", ""));
            if (UUID_PATTERN.matcher(id).matches()) ids.add(id);
        }
        return ids;
    }

    @JavascriptInterface
    public synchronized String refreshItems() {
        try {
            String key = apiKey();
            Set<String> ids = discoverItemIds(key);
            if (ids.isEmpty()) return error("ITEMS_NOT_FOUND", "Nenhuma conexão Open Finance foi encontrada para atualizar.", 404);

            JSONArray results = new JSONArray();
            lastRefreshIds.clear();
            int started = 0;
            for (String id : ids) {
                JSONObject row = new JSONObject();
                row.put("id", id);
                try {
                    HttpResult response = request("PATCH", "/items/" + id, new JSONObject(), key);
                    row.put("status", response.status);
                    boolean accepted = response.status >= 200 && response.status < 300;
                    row.put("accepted", accepted);
                    if (accepted) {
                        started++;
                        lastRefreshIds.add(id);
                    } else if (response.status == 429) {
                        row.put("code", "REFRESH_RATE_LIMITED");
                    } else if (response.status == 400 || response.status == 409) {
                        row.put("code", "REFRESH_NOT_AVAILABLE_YET");
                    } else {
                        row.put("code", "REFRESH_HTTP_" + response.status);
                    }
                } catch (Exception itemError) {
                    row.put("accepted", false);
                    row.put("code", "REFRESH_REQUEST_FAILED");
                }
                results.put(row);
            }

            JSONObject output = envelope(started > 0);
            output.put("requested", ids.size());
            output.put("started", started);
            output.put("items", results);
            if (started > 0) output.put("message", "Sincronização solicitada à instituição.");
            else output.put("message", "A Pluggy não aceitou uma nova sincronização agora.");
            return output.toString();
        } catch (SecurityException error) {
            return error("AUTH_REJECTED", "A Pluggy recusou as credenciais do Open Finance.", 401);
        } catch (IllegalStateException error) {
            String code = error.getMessage() == null ? "REFRESH_FAILED" : error.getMessage();
            if ("AUTH_REQUIRED".equals(code)) return error("AUTH_REQUIRED", "Configure a Pluggy antes de atualizar.", 428);
            return error(code, "Não foi possível solicitar a atualização do Open Finance.", 502);
        } catch (Exception error) {
            return error("REFRESH_FAILED", "Não foi possível solicitar a atualização do Open Finance.", 500);
        }
    }

    @JavascriptInterface
    public synchronized String refreshStatus() {
        try {
            if (lastRefreshIds.isEmpty()) {
                JSONObject empty = envelope(true);
                empty.put("complete", true);
                empty.put("items", new JSONArray());
                return empty.toString();
            }
            String key = apiKey();
            JSONArray results = new JSONArray();
            boolean complete = true;
            boolean needsUser = false;
            for (String id : lastRefreshIds) {
                HttpResult response = request("GET", "/items/" + id, null, key);
                JSONObject row = new JSONObject();
                row.put("id", id);
                if (response.status >= 200 && response.status < 300) {
                    JSONObject item = new JSONObject(response.body);
                    String status = clean(item.optString("status", ""));
                    String executionStatus = clean(item.optString("executionStatus", ""));
                    row.put("status", status);
                    row.put("executionStatus", executionStatus);
                    row.put("lastUpdatedAt", clean(item.optString("lastUpdatedAt", item.optString("updatedAt", ""))));
                    String upper = status.toUpperCase();
                    String executionUpper = executionStatus.toUpperCase();
                    boolean updating = upper.contains("UPDAT") || executionUpper.contains("UPDAT") || executionUpper.contains("RUNNING");
                    boolean waiting = upper.contains("WAITING") || upper.contains("LOGIN") || executionUpper.contains("WAITING") || executionUpper.contains("MFA");
                    if (updating || waiting) complete = false;
                    if (waiting) needsUser = true;
                } else {
                    row.put("status", "HTTP_" + response.status);
                    complete = false;
                }
                results.put(row);
            }
            JSONObject output = envelope(true);
            output.put("complete", complete);
            output.put("needsUser", needsUser);
            output.put("items", results);
            return output.toString();
        } catch (Exception error) {
            return error("REFRESH_STATUS_FAILED", "Não foi possível consultar o andamento da atualização.", 502);
        }
    }
}
