package com.jhony.sfp;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

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
    private static final Pattern ITEM_PATH_PATTERN = Pattern.compile(
            "^/items/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private final Context context;
    private final Set<String> lastRefreshIds = new LinkedHashSet<>();
    private final OkHttpClient http = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .writeTimeout(25, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build();

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

    private static String failureKind(Exception error) {
        if (error instanceof java.net.UnknownHostException) return "DNS";
        if (error instanceof java.net.SocketTimeoutException) return "TIMEOUT";
        if (error instanceof javax.net.ssl.SSLException) return "TLS";
        if (error instanceof org.json.JSONException) return "INVALID_JSON";
        if (error instanceof java.io.IOException) return "IO";
        return "UNEXPECTED";
    }

    private static int failureStatus(String kind) {
        if ("INVALID_JSON".equals(kind)) return 502;
        if ("UNEXPECTED".equals(kind)) return 500;
        return 503;
    }

    static boolean isMeuPluggyManagedFailure(int status, String providerMessage) {
        return status == 400
                && providerMessage != null
                && providerMessage.matches("(?i).*MeuPluggy\\s+item\\s+cant\\s+be\\s+updated.*");
    }

    static boolean needsUserAction(String providerCode, String providerMessage) {
        String evidence = (clean(providerCode) + " " + clean(providerMessage)).toUpperCase();
        return evidence.contains("WAITING_USER_INPUT")
                || evidence.contains("MFA")
                || evidence.contains("LOGIN_ERROR")
                || evidence.contains("AUTH_REQUIRED")
                || evidence.contains("INVALID_CREDENTIAL")
                || evidence.contains("CREDENTIAL");
    }

    static String classifyRefreshFailure(int status, String providerCode, String providerMessage) {
        String code = clean(providerCode);
        if (status == 429 || code.contains("BEFORE_ALLOWED_FREQUENCY")) return "REFRESH_RATE_LIMITED";
        if (isMeuPluggyManagedFailure(status, providerMessage)) return "REFRESH_PROVIDER_MANAGED";
        if (needsUserAction(providerCode, providerMessage)) return "REFRESH_NEEDS_USER";
        if (status == 404) return "REFRESH_ITEM_NOT_FOUND";
        if (status == 400 || status == 409) return "REFRESH_NEEDS_ATTENTION";
        return "REFRESH_HTTP_" + status;
    }

    private static boolean allowedPath(String path) {
        return "/auth".equals(path)
                || "/items".equals(path)
                || "/v2/items".equals(path)
                || ITEM_PATH_PATTERN.matcher(path).matches();
    }

    private HttpResult execute(Request request) throws Exception {
        try (Response response = http.newCall(request).execute()) {
            ResponseBody responseBody = response.body();
            return new HttpResult(response.code(), responseBody == null ? "" : responseBody.string());
        }
    }

    private HttpResult request(String method, String path, JSONObject body, String apiKey) throws Exception {
        if (!allowedPath(path)) throw new SecurityException("Endpoint Pluggy não autorizado");

        Request.Builder builder = new Request.Builder()
                .url(API_BASE + path)
                .header("Accept", "application/json")
                .header("User-Agent", "SmartFinancialPlanner/" + BuildConfig.VERSION_NAME + " OpenFinanceRefresh/1.2");
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            builder.header("X-API-KEY", apiKey.trim());
        }

        RequestBody requestBody = body == null ? null : RequestBody.create(body.toString(), JSON);
        if ("GET".equals(method)) {
            builder.get();
        } else if ("POST".equals(method)) {
            builder.post(requestBody == null ? RequestBody.create("{}", JSON) : requestBody);
        } else if ("PATCH".equals(method)) {
            builder.patch(requestBody == null ? RequestBody.create("{}", JSON) : requestBody);
        } else {
            throw new SecurityException("Método HTTP não autorizado");
        }

        Request request = builder.build();
        try {
            return execute(request);
        } catch (java.io.IOException firstFailure) {
            // GET e POST /auth são seguros para uma segunda tentativa. PATCH nunca
            // é repetido: a instituição pode ter recebido a primeira solicitação.
            if ("PATCH".equals(method)) throw firstFailure;
            try {
                Thread.sleep(250L);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw firstFailure;
            }
            return execute(request);
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

    private boolean persistItemIds(Set<String> ids) {
        SharedPreferences.Editor editor = prefs().edit();
        if (ids == null || ids.isEmpty()) editor.remove(PREF_ITEM_IDS);
        else editor.putString(PREF_ITEM_IDS, String.join(",", ids));
        return editor.commit();
    }

    private Set<String> listItemIds(String key) throws Exception {
        Set<String> ids = new LinkedHashSet<>();
        HttpResult response = request("GET", "/v2/items", null, key);
        if (response.status == 401) throw new SecurityException("API_KEY_REJECTED");
        // Algumas aplicações pessoais não têm a listagem habilitada. Nesse caso,
        // as referências explícitas continuam sendo a fonte de verdade local.
        if (response.status == 403 || response.status == 404) return ids;
        if (response.status < 200 || response.status >= 300) {
            throw new IllegalStateException("ITEMS_HTTP_" + response.status);
        }
        JSONArray items = collection(response.body);
        for (int index = 0; index < items.length(); index++) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) continue;
            String id = clean(item.optString("id", ""));
            if (UUID_PATTERN.matcher(id).matches()) ids.add(id);
        }
        return ids;
    }

    private static final class ItemDiscovery {
        final Set<String> ids;
        final int staleReferencesRemoved;
        final int rediscovered;
        final boolean referencesUpdated;

        ItemDiscovery(Set<String> ids, int staleReferencesRemoved, int rediscovered, boolean referencesUpdated) {
            this.ids = ids;
            this.staleReferencesRemoved = staleReferencesRemoved;
            this.rediscovered = rediscovered;
            this.referencesUpdated = referencesUpdated;
        }
    }

    private ItemDiscovery discoverItemIds(String key) throws Exception {
        Set<String> saved = savedItemIds();
        Set<String> active = new LinkedHashSet<>();
        int stale = 0;

        // Referências salvas são validadas antes do PATCH. Um 404 é definitivo
        // para aquele Item ID e pode ser removido com segurança. Outros erros
        // são preservados para não apagar vínculo por indisponibilidade temporária.
        for (String id : saved) {
            HttpResult response = request("GET", "/items/" + id, null, key);
            if (response.status >= 200 && response.status < 300) {
                active.add(id);
            } else if (response.status == 404) {
                stale++;
            } else if (response.status == 401) {
                throw new SecurityException("API_KEY_REJECTED");
            } else {
                active.add(id);
            }
        }

        int rediscovered = 0;
        if (saved.isEmpty() || stale > 0 || active.isEmpty()) {
            Set<String> listed = new LinkedHashSet<>();
            try {
                listed = listItemIds(key);
            } catch (IllegalStateException discoveryError) {
                // Se já existe referência válida, uma falha da listagem não deve
                // bloquear o refresh. Sem nenhuma referência, o erro continua útil.
                if (active.isEmpty() && saved.isEmpty()) throw discoveryError;
            }
            for (String id : listed) {
                if (active.add(id) && !saved.contains(id)) rediscovered++;
            }
        }

        boolean changed = stale > 0 || rediscovered > 0;
        boolean updated = !changed || persistItemIds(active);
        return new ItemDiscovery(active, stale, rediscovered, updated);
    }

    @JavascriptInterface
    public synchronized String refreshItems() {
        String stage = "AUTH";
        try {
            String key = apiKey();
            stage = "ITEM_DISCOVERY";
            ItemDiscovery discovery = discoverItemIds(key);
            Set<String> ids = discovery.ids;
            if (ids.isEmpty()) {
                JSONObject empty = envelope(false);
                empty.put("code", discovery.staleReferencesRemoved > 0 ? "ITEM_REFERENCES_STALE" : "ITEMS_NOT_FOUND");
                empty.put("message", discovery.staleReferencesRemoved > 0
                        ? "As referências antigas não existem mais na Pluggy. Salve ou reconecte os Items atuais."
                        : "Nenhuma conexão Open Finance foi encontrada para atualizar.");
                empty.put("status", 404);
                empty.put("requested", 0);
                empty.put("started", 0);
                empty.put("staleReferencesRemoved", discovery.staleReferencesRemoved);
                empty.put("rediscovered", discovery.rediscovered);
                empty.put("referenceCount", 0);
                return empty.toString();
            }

            stage = "ITEM_REFRESH";
            JSONArray results = new JSONArray();
            lastRefreshIds.clear();
            Set<String> staleDuringRefresh = new LinkedHashSet<>();
            int started = 0;
            int providerManaged = 0;
            boolean needsUser = false;
            for (String id : ids) {
                JSONObject row = new JSONObject();
                row.put("id", id);
                try {
                    HttpResult response = request("PATCH", "/items/" + id, new JSONObject(), key);
                    row.put("status", response.status);
                    boolean accepted = response.status >= 200 && response.status < 300;
                    row.put("accepted", accepted);
                    PluggyRefreshError providerError = new PluggyRefreshError(accepted ? "{}" : response.body, key);
                    String providerCode = providerError.code;
                    if (!providerError.message.isEmpty()) row.put("providerMessage", providerError.message);
                    if (!providerCode.isEmpty()) row.put("providerCode", providerCode);
                    if (accepted) {
                        started++;
                        lastRefreshIds.add(id);
                    } else {
                        String failureCode = classifyRefreshFailure(response.status, providerCode, providerError.message);
                        row.put("code", failureCode);
                        if ("REFRESH_PROVIDER_MANAGED".equals(failureCode)) providerManaged++;
                        if ("REFRESH_NEEDS_USER".equals(failureCode)) needsUser = true;
                        if ("REFRESH_ITEM_NOT_FOUND".equals(failureCode)) staleDuringRefresh.add(id);
                    }
                } catch (Exception itemError) {
                    row.put("accepted", false);
                    row.put("code", "REFRESH_REQUEST_" + failureKind(itemError));
                }
                results.put(row);
            }

            int staleRemoved = discovery.staleReferencesRemoved;
            if (!staleDuringRefresh.isEmpty()) {
                Set<String> remaining = new LinkedHashSet<>(ids);
                remaining.removeAll(staleDuringRefresh);
                if (persistItemIds(remaining)) staleRemoved += staleDuringRefresh.size();
            }

            boolean providerManagedOnly = started == 0
                    && providerManaged > 0
                    && providerManaged + staleDuringRefresh.size() == ids.size()
                    && !needsUser;
            JSONObject output = envelope(started > 0 || providerManagedOnly);
            output.put("requested", ids.size());
            output.put("started", started);
            output.put("providerManaged", providerManaged);
            output.put("needsUser", needsUser);
            output.put("staleReferencesRemoved", staleRemoved);
            output.put("rediscovered", discovery.rediscovered);
            output.put("referenceCount", Math.max(0, ids.size() - staleDuringRefresh.size()));
            output.put("referencesUpdated", discovery.referencesUpdated && staleDuringRefresh.isEmpty());
            output.put("items", results);
            if (started > 0) {
                output.put("message", "Sincronização em tempo real solicitada à instituição.");
            } else if (needsUser) {
                output.put("code", "REFRESH_NEEDS_USER");
                output.put("message", "Uma conexão precisa de autenticação ou ação do usuário para atualizar.");
            } else if (providerManagedOnly) {
                output.put("code", "REFRESH_PROVIDER_MANAGED");
                output.put("message", "O MeuPluggy gerencia a atualização destas conexões; o SFP não pode forçar um novo refresh por API.");
            } else {
                output.put("message", "A Pluggy não iniciou uma nova sincronização agora.");
            }
            return output.toString();
        } catch (SecurityException authError) {
            return error("AUTH_REJECTED", "A Pluggy recusou as credenciais do Open Finance.", 401);
        } catch (IllegalStateException stateError) {
            String code = stateError.getMessage() == null ? "REFRESH_FAILED" : stateError.getMessage();
            if ("AUTH_REQUIRED".equals(code)) return error("AUTH_REQUIRED", "Configure a Pluggy antes de atualizar.", 428);
            return error(code, "Não foi possível solicitar a atualização do Open Finance.", 502);
        } catch (Exception requestError) {
            String kind = failureKind(requestError);
            return error("REFRESH_" + stage + "_" + kind,
                    "Não foi possível solicitar a atualização do Open Finance.", failureStatus(kind));
        }
    }

    @JavascriptInterface
    public synchronized String refreshStatus() {
        String stage = "AUTH";
        try {
            if (lastRefreshIds.isEmpty()) {
                JSONObject empty = envelope(true);
                empty.put("complete", true);
                empty.put("items", new JSONArray());
                return empty.toString();
            }

            String key = apiKey();
            stage = "ITEM_STATUS";
            JSONArray results = new JSONArray();
            boolean complete = true;
            boolean needsUser = false;
            boolean failed = false;
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

                    PluggyRefreshState state = new PluggyRefreshState(status, executionStatus);
                    row.put("complete", state.complete);
                    row.put("needsUser", state.needsUser);
                    row.put("failed", state.failed);
                    if (!state.complete) complete = false;
                    if (state.needsUser) needsUser = true;
                    if (state.failed) failed = true;
                } else {
                    row.put("status", "HTTP_" + response.status);
                    complete = false;
                }
                results.put(row);
            }

            JSONObject output = envelope(true);
            output.put("complete", complete);
            output.put("needsUser", needsUser);
            output.put("failed", failed);
            output.put("items", results);
            return output.toString();
        } catch (SecurityException authError) {
            return error("AUTH_REJECTED", "A Pluggy recusou as credenciais do Open Finance.", 401);
        } catch (IllegalStateException stateError) {
            String code = stateError.getMessage() == null ? "REFRESH_STATUS_FAILED" : stateError.getMessage();
            if ("AUTH_REQUIRED".equals(code)) return error("AUTH_REQUIRED", "Configure a Pluggy antes de atualizar.", 428);
            return error(code, "Não foi possível consultar o andamento da atualização.", 502);
        } catch (Exception statusError) {
            String kind = failureKind(statusError);
            return error("REFRESH_STATUS_" + stage + "_" + kind,
                    "Não foi possível consultar o andamento da atualização.", failureStatus(kind));
        }
    }
}
