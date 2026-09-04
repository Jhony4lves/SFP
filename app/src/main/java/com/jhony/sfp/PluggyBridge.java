package com.jhony.sfp;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Ponte nativa e opcional para o fluxo pessoal da Pluggy.
 *
 * A Pluggy não disponibiliza a listagem de todos os Items por padrão. O endpoint
 * GET /v2/items é opt-in. Por isso esta bridge tenta a descoberta v2 quando
 * disponível e, como caminho oficial/fallback, trabalha com itemIds que o usuário
 * copia uma única vez do Dashboard. Nenhuma nova conexão bancária é criada.
 */
public final class PluggyBridge {
    private static final String API_BASE = "https://api.pluggy.ai";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "sfp_open_finance_pluggy_v1";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private static final String PREFS = "sfp_open_finance_secure_vault";
    private static final String PREF_CIPHERTEXT = "pluggy_credentials_ciphertext";
    private static final String PREF_IV = "pluggy_credentials_iv";
    private static final String PREF_VERSION = "pluggy_credentials_version";
    private static final String PREF_ITEM_IDS = "pluggy_item_references";

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");
    private static final Pattern ITEM_PATH_PATTERN = Pattern.compile(
            "^/items/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");

    // API key: 2h documentadas; renova com 10 min de margem.
    private static final long API_KEY_CACHE_MS = 110L * 60L * 1000L;

    private final Context context;
    private volatile String apiKey;
    private volatile long apiKeyExpiresAtMs;

    PluggyBridge(Context context) {
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

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private void deleteKeyAlias() {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {}
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean persistCredentials(String clientId, String clientSecret) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("clientId", clientId);
            payload.put("clientSecret", clientSecret);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] ciphertext = cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            boolean saved = prefs().edit()
                    .putString(PREF_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                    .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                    .putString(PREF_VERSION, "v1-keystore-gcm")
                    .commit();
            if (!saved) return false;
            Credentials verified = readCredentials();
            return verified != null && clientId.equals(verified.clientId) && clientSecret.equals(verified.clientSecret);
        } catch (Exception error) {
            return false;
        }
    }

    private Credentials readCredentials() {
        String ciphertextB64 = prefs().getString(PREF_CIPHERTEXT, null);
        String ivB64 = prefs().getString(PREF_IV, null);
        if (ciphertextB64 == null || ivB64 == null || ciphertextB64.trim().isEmpty() || ivB64.trim().isEmpty()) return null;
        try {
            byte[] ciphertext = Base64.decode(ciphertextB64, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            JSONObject payload = new JSONObject(new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8));
            String clientId = payload.optString("clientId", "").trim();
            String clientSecret = payload.optString("clientSecret", "").trim();
            if (clientId.isEmpty() || clientSecret.isEmpty()) return null;
            return new Credentials(clientId, clientSecret);
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONObject envelope(boolean ok) throws Exception {
        JSONObject result = new JSONObject();
        result.put("ok", ok);
        return result;
    }

    private static String safeError(String code, String message, int status) {
        try {
            JSONObject result = envelope(false);
            result.put("code", code == null ? "UNKNOWN" : code);
            result.put("message", message == null ? "Falha na integração Open Finance." : message);
            result.put("status", status);
            return result.toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"code\":\"UNKNOWN\",\"message\":\"Falha na integração Open Finance.\"}";
        }
    }

    @JavascriptInterface
    public String saveCredentials(String clientIdRaw, String clientSecretRaw) {
        String clientId = clientIdRaw == null ? "" : clientIdRaw.trim();
        String clientSecret = clientSecretRaw == null ? "" : clientSecretRaw.trim();
        if (!UUID_PATTERN.matcher(clientId).matches()) return safeError("INVALID_CLIENT_ID", "Client ID inválido.", 400);
        if (clientSecret.length() < 8 || clientSecret.length() > 512) return safeError("INVALID_CLIENT_SECRET", "Client Secret inválido.", 400);

        boolean saved = persistCredentials(clientId, clientSecret);
        if (!saved) {
            deleteKeyAlias();
            saved = persistCredentials(clientId, clientSecret);
        }
        apiKey = null;
        apiKeyExpiresAtMs = 0L;
        try {
            JSONObject result = envelope(saved);
            result.put("configured", saved);
            if (!saved) {
                result.put("code", "VAULT_WRITE_FAILED");
                result.put("message", "Não foi possível proteger as credenciais no Android Keystore.");
            }
            return result.toString();
        } catch (Exception error) {
            return safeError("VAULT_WRITE_FAILED", "Não foi possível proteger as credenciais.", 500);
        }
    }

    private Set<String> readItemIdSet() {
        Set<String> ids = new LinkedHashSet<>();
        String raw = prefs().getString(PREF_ITEM_IDS, "");
        if (raw == null || raw.trim().isEmpty()) return ids;
        for (String token : raw.split(",")) {
            String id = token == null ? "" : token.trim();
            if (UUID_PATTERN.matcher(id).matches()) ids.add(id);
        }
        return ids;
    }

    @JavascriptInterface
    public String saveItemIds(String raw) {
        Set<String> ids = new LinkedHashSet<>();
        String source = raw == null ? "" : raw.trim();
        if (!source.isEmpty()) {
            for (String token : source.split("[\\s,;]+")) {
                String id = token == null ? "" : token.trim();
                if (id.isEmpty()) continue;
                if (!UUID_PATTERN.matcher(id).matches()) {
                    return safeError("INVALID_ITEM_ID", "Há um Item ID inválido. Copie somente o campo id do Item no Dashboard.", 400);
                }
                ids.add(id);
                if (ids.size() > 20) return safeError("TOO_MANY_ITEM_IDS", "Use no máximo 20 Item IDs.", 400);
            }
        }
        if (ids.isEmpty()) return safeError("ITEM_IDS_REQUIRED", "Informe pelo menos um Item ID.", 400);
        boolean saved = prefs().edit().putString(PREF_ITEM_IDS, String.join(",", ids)).commit();
        try {
            JSONObject result = envelope(saved);
            result.put("itemReferenceCount", saved ? ids.size() : 0);
            if (!saved) result.put("message", "Não foi possível salvar as referências dos Items.");
            return result.toString();
        } catch (Exception error) {
            return safeError("ITEM_IDS_SAVE_FAILED", "Não foi possível salvar as referências dos Items.", 500);
        }
    }

    @JavascriptInterface
    public String getCredentialStatus() {
        Credentials credentials = readCredentials();
        try {
            JSONObject result = envelope(true);
            boolean configured = credentials != null;
            result.put("configured", configured);
            if (configured) {
                String id = credentials.clientId;
                result.put("clientIdMasked", id.length() > 13 ? id.substring(0, 8) + "…" + id.substring(id.length() - 4) : "••••");
            } else result.put("clientIdMasked", "");
            result.put("itemReferenceCount", readItemIdSet().size());
            return result.toString();
        } catch (Exception error) {
            return safeError("STATUS_FAILED", "Não foi possível consultar o cofre local.", 500);
        } finally {
            credentials = null;
        }
    }

    @JavascriptInterface
    public boolean clearCredentials() {
        apiKey = null;
        apiKeyExpiresAtMs = 0L;
        boolean cleared = prefs().edit().clear().commit();
        deleteKeyAlias();
        return cleared;
    }

    private boolean isAllowedPath(String path) {
        // Keep the original fixed endpoints explicit and add only the documented v2 list
        // plus GET /items/{uuid}. No caller can provide an arbitrary URL/host.
        return "/auth".equals(path) || "/items".equals(path) || "/accounts".equals(path)
                || "/v2/items".equals(path) || ITEM_PATH_PATTERN.matcher(path).matches();
    }

    private HttpResult request(String method, String path, String query, JSONObject body, String key) throws Exception {
        if (!isAllowedPath(path)) throw new SecurityException("Endpoint Pluggy não autorizado");
        String urlText = API_BASE + path + (query == null || query.isEmpty() ? "" : "?" + query);
        URL url = new URL(urlText);
        if (!"https".equalsIgnoreCase(url.getProtocol()) || !"api.pluggy.ai".equalsIgnoreCase(url.getHost()) || (url.getPort() != -1 && url.getPort() != 443)) {
            throw new SecurityException("Host Pluggy não autorizado");
        }

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "SmartFinancialPlanner/" + BuildConfig.VERSION_NAME + " OpenFinance/1.1");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(25000);
            if (key != null && !key.trim().isEmpty()) connection.setRequestProperty("X-API-KEY", key.trim());
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
            if (status >= 300 && status < 400) return new HttpResult(status, "");
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            if (stream == null) return new HttpResult(status, "");
            try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                return new HttpResult(status, output.toString("UTF-8"));
            }
        } finally {
            if (connection != null) try { connection.disconnect(); } catch (Exception ignored) {}
        }
    }

    private static String authFailureCode(String body) {
        String lower = body == null ? "" : body.toLowerCase();
        return lower.contains("disabled") ? "CLIENT_DISABLED" : "INVALID_CREDENTIALS";
    }

    private synchronized String requireApiKey() throws Exception {
        long now = System.currentTimeMillis();
        if (apiKey != null && !apiKey.trim().isEmpty() && now < apiKeyExpiresAtMs) return apiKey;
        Credentials credentials = readCredentials();
        if (credentials == null) throw new IllegalStateException("AUTH_REQUIRED");
        try {
            JSONObject payload = new JSONObject();
            payload.put("clientId", credentials.clientId);
            payload.put("clientSecret", credentials.clientSecret);
            HttpResult response = request("POST", "/auth", null, payload, null);
            if (response.status == 401 || response.status == 403) throw new SecurityException(authFailureCode(response.body));
            if (response.status < 200 || response.status >= 300) throw new IllegalStateException("AUTH_HTTP_" + response.status);
            JSONObject json = new JSONObject(response.body);
            String recovered = json.optString("apiKey", "").trim();
            if (recovered.isEmpty()) recovered = json.optString("accessToken", "").trim();
            if (recovered.isEmpty()) recovered = json.optString("access_token", "").trim();
            if (recovered.isEmpty()) throw new IllegalStateException("AUTH_TOKEN_MISSING");
            apiKey = recovered;
            apiKeyExpiresAtMs = now + API_KEY_CACHE_MS;
            return apiKey;
        } finally {
            credentials = null;
        }
    }

    private static JSONArray extractCollection(String raw) throws Exception {
        if (raw == null || raw.trim().isEmpty()) return new JSONArray();
        String trimmed = raw.trim();
        if (trimmed.startsWith("[")) return new JSONArray(trimmed);
        JSONObject root = new JSONObject(trimmed);
        JSONArray results = root.optJSONArray("results");
        if (results != null) return results;
        JSONArray data = root.optJSONArray("data");
        if (data != null) return data;
        JSONArray items = root.optJSONArray("items");
        return items != null ? items : new JSONArray();
    }

    private static JSONObject summarizeItem(JSONObject item) throws Exception {
        JSONObject summary = new JSONObject();
        summary.put("id", item.optString("id", ""));
        summary.put("status", item.optString("status", ""));
        summary.put("createdAt", item.optString("createdAt", ""));
        summary.put("updatedAt", item.optString("updatedAt", item.optString("lastUpdatedAt", "")));
        JSONObject connector = item.optJSONObject("connector");
        if (connector != null) {
            summary.put("connectorId", connector.optInt("id", 0));
            summary.put("connectorName", connector.optString("name", "MeuPluggy"));
            summary.put("institution", connector.optString("institutionName", connector.optString("name", "MeuPluggy")));
        } else {
            summary.put("connectorId", item.optInt("connectorId", 0));
            summary.put("connectorName", item.optString("connectorName", "MeuPluggy"));
            summary.put("institution", item.optString("institution", item.optString("connectorName", "MeuPluggy")));
        }
        return summary;
    }

    private static JSONObject summarizeAccount(JSONObject account) throws Exception {
        JSONObject summary = new JSONObject();
        summary.put("id", account.optString("id", ""));
        summary.put("itemId", account.optString("itemId", ""));
        summary.put("type", account.optString("type", ""));
        summary.put("subtype", account.optString("subtype", ""));
        summary.put("name", account.optString("name", ""));
        summary.put("marketingName", account.optString("marketingName", ""));
        summary.put("number", account.optString("number", ""));
        summary.put("currencyCode", account.optString("currencyCode", "BRL"));
        if (account.has("balance") && !account.isNull("balance")) summary.put("balance", account.optDouble("balance", 0d));
        return summary;
    }

    private JSONArray discoverItemsInternal(String key) throws Exception {
        HttpResult response = request("GET", "/v2/items", null, null, key);
        if (response.status == 401) {
            apiKey = null;
            apiKeyExpiresAtMs = 0L;
            throw new SecurityException("API_KEY_REJECTED");
        }
        // Listing is opt-in and commonly returns 403 for free/personal teams.
        if (response.status == 403 || response.status == 404) return null;
        if (response.status < 200 || response.status >= 300) throw new IllegalStateException("ITEM_DISCOVERY_HTTP_" + response.status);
        JSONArray source = extractCollection(response.body);
        JSONArray result = new JSONArray();
        for (int index = 0; index < source.length(); index++) {
            JSONObject item = source.optJSONObject(index);
            if (item != null) result.put(summarizeItem(item));
        }
        return result;
    }

    private JSONObject retrieveItemInternal(String key, String itemId) throws Exception {
        if (!UUID_PATTERN.matcher(itemId).matches()) throw new IllegalArgumentException("INVALID_ITEM_ID");
        HttpResult response = request("GET", "/items/" + itemId, null, null, key);
        if (response.status == 401) {
            apiKey = null;
            apiKeyExpiresAtMs = 0L;
            throw new SecurityException("API_KEY_REJECTED");
        }
        if (response.status == 404) return null;
        if (response.status == 403) throw new SecurityException("ITEM_ACCESS_FORBIDDEN");
        if (response.status < 200 || response.status >= 300) throw new IllegalStateException("ITEM_HTTP_" + response.status);
        return summarizeItem(new JSONObject(response.body));
    }

    private JSONArray listAccountsInternal(String key, String itemId) throws Exception {
        if (!UUID_PATTERN.matcher(itemId).matches()) throw new IllegalArgumentException("INVALID_ITEM_ID");
        String query = "itemId=" + URLEncoder.encode(itemId, StandardCharsets.UTF_8.name());
        HttpResult response = request("GET", "/accounts", query, null, key);
        if (response.status == 401) {
            apiKey = null;
            apiKeyExpiresAtMs = 0L;
            throw new SecurityException("API_KEY_REJECTED");
        }
        if (response.status == 403) throw new SecurityException("ACCOUNT_ACCESS_FORBIDDEN");
        if (response.status < 200 || response.status >= 300) throw new IllegalStateException("ACCOUNTS_HTTP_" + response.status);
        JSONArray source = extractCollection(response.body);
        JSONArray result = new JSONArray();
        for (int index = 0; index < source.length(); index++) {
            JSONObject account = source.optJSONObject(index);
            if (account != null) result.put(summarizeAccount(account));
        }
        return result;
    }

    private JSONArray itemsFromSavedReferences(String key) throws Exception {
        JSONArray result = new JSONArray();
        for (String itemId : readItemIdSet()) {
            JSONObject item = retrieveItemInternal(key, itemId);
            if (item != null) result.put(item);
        }
        return result;
    }

    @JavascriptInterface
    public String previewData() {
        try {
            String key = requireApiKey();
            JSONArray items = discoverItemsInternal(key);
            String discoveryMode = "v2-items";
            if (items == null || items.length() == 0) {
                Set<String> savedIds = readItemIdSet();
                if (savedIds.isEmpty()) {
                    JSONObject result = envelope(false);
                    result.put("code", "ITEM_REFERENCES_REQUIRED");
                    result.put("status", 428);
                    result.put("authConfirmed", true);
                    result.put("message", "Autenticação confirmada. A listagem de Items não está habilitada nesta aplicação; salve os Item IDs mostrados no Dashboard da Pluggy e tente novamente.");
                    return result.toString();
                }
                items = itemsFromSavedReferences(key);
                discoveryMode = "saved-item-ids";
            }

            if (items.length() == 0) {
                return safeError("ITEM_REFERENCES_NOT_FOUND", "As credenciais foram aceitas, mas os Item IDs salvos não pertencem a esta aplicação.", 404);
            }

            JSONArray output = new JSONArray();
            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.getJSONObject(index);
                JSONObject copy = new JSONObject(item.toString());
                String itemId = item.optString("id", "");
                try {
                    copy.put("accounts", listAccountsInternal(key, itemId));
                } catch (Exception accountError) {
                    copy.put("accounts", new JSONArray());
                    copy.put("accountsError", true);
                }
                output.put(copy);
            }

            JSONObject result = envelope(true);
            result.put("provider", "pluggy-personal");
            result.put("readOnly", true);
            result.put("authConfirmed", true);
            result.put("discoveryMode", discoveryMode);
            result.put("items", output);
            result.put("itemCount", output.length());
            return result.toString();
        } catch (SecurityException error) {
            String message = error.getMessage();
            if ("INVALID_CREDENTIALS".equals(message)) return safeError("INVALID_CREDENTIALS", "Client ID ou Client Secret rejeitados pela Pluggy.", 401);
            if ("CLIENT_DISABLED".equals(message)) return safeError("CLIENT_DISABLED", "A aplicação Pluggy está desativada para autenticação. Confira o status da aplicação no Dashboard.", 401);
            if ("ITEM_ACCESS_FORBIDDEN".equals(message)) return safeError("ITEM_ACCESS_FORBIDDEN", "Um Item ID não pertence a esta aplicação Pluggy.", 403);
            return safeError("AUTH_FAILED", "A API Key foi rejeitada ao consultar os dados da Pluggy.", 401);
        } catch (IllegalStateException error) {
            if ("AUTH_REQUIRED".equals(error.getMessage())) return safeError("AUTH_REQUIRED", "Configure Client ID e Client Secret neste aparelho.", 401);
            return safeError("PROVIDER_UNAVAILABLE", "Não foi possível consultar a Pluggy agora.", 503);
        } catch (Exception error) {
            return safeError("NETWORK_FAILED", "Falha de rede ao consultar a Pluggy.", 503);
        }
    }
}
