package com.jhony.sfp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class AndroidBridge {
    private static final String CHANNEL_ID = "sfp_important_alerts";
    private static final int NOTIFICATION_ID = 1001;
    private final Context context;

    AndroidBridge(Context context) {
        this.context = context;
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "Smart Financial Planner - Alertas";
            String description = "Notificações de ações importantes do aplicativo";
            int importance = NotificationManager.IMPORTANCE_DEFAULT;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            NotificationManager notificationManager = context.getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    @JavascriptInterface
    public String getAppVersion() {
        return "2.0.2";
    }

    @JavascriptInterface
    public void showNotification(String title, String message) {
        try {
            // Privacy protection: sanitize sensitive financial values if accidentally passed
            String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Smart Financial Planner";
            String safeMessage = (message != null && !message.trim().isEmpty()) ? message.trim() : "Há uma atualização importante no Smart Financial Planner.";

            // Remove direct bank figures / currency patterns for lockscreen privacy protection
            safeMessage = safeMessage.replaceAll("R\\$\\s*[0-9]+([.,][0-9]{2})?", "***");

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, pendingFlags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(safeTitle)
                    .setContentText(safeMessage)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true);

            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            if (manager.areNotificationsEnabled()) {
                manager.notify(NOTIFICATION_ID, builder.build());
            } else {
                Toast.makeText(context, safeTitle + ": " + safeMessage, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            // Safe fallback without interrupting application flow
            Toast.makeText(context, title != null ? title : "Aviso do Smart Financial Planner", Toast.LENGTH_SHORT).show();
        }
    }

    @JavascriptInterface
    public void saveTextFile(String filename, String mimeType, String content) {
        try {
            OutputStream out;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType == null ? "text/plain" : mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SFP");
                Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("Não foi possível criar o arquivo.");
                out = context.getContentResolver().openOutputStream(uri);
            } else {
                File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) throw new Exception("Pasta Downloads indisponível.");
                File file = new File(dir, filename);
                out = new FileOutputStream(file);
            }

            if (out == null) throw new Exception("Não foi possível abrir o arquivo.");
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.flush();
            out.close();

            Toast.makeText(context, "Salvo em Downloads/SFP", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(context, "Falha ao salvar: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    // ============================================================
    // SOPHY V3 SECURE ANDROID KEYSTORE & NATIVE GROQ BRIDGE
    // ============================================================
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "sfp_sophy_groq_v3_master_key";
    private static final String CIPHER_TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;

    private static final String PREF_SECURE_VAULT = "sfp_sophy_secure_vault";
    private static final String KEY_CIPHERTEXT = "sophy_groq_ciphertext";
    private static final String KEY_IV = "sophy_groq_iv";
    private static final String KEY_VERSION = "sophy_groq_version";
    private static final String LEGACY_KEY_GROQ_SECRET = "sophy_groq_api_key";

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            }
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        KeyGenParameterSpec keyGenParameterSpec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build();
        keyGenerator.init(keyGenParameterSpec);
        return keyGenerator.generateKey();
    }

    private boolean encryptAndSaveApiKey(String rawKey) {
        if (rawKey == null || rawKey.trim().isEmpty()) {
            return clearSophyApiKey();
        }
        try {
            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(rawKey.trim().getBytes(StandardCharsets.UTF_8));

            String ciphertextB64 = Base64.encodeToString(ciphertext, Base64.NO_WRAP);
            String ivB64 = Base64.encodeToString(iv, Base64.NO_WRAP);

            context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_CIPHERTEXT, ciphertextB64)
                    .putString(KEY_IV, ivB64)
                    .putString(KEY_VERSION, "v3-keystore-gcm")
                    .remove(LEGACY_KEY_GROQ_SECRET)
                    .apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String getDecryptedApiKeyInternal() {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE);
            String ciphertextB64 = prefs.getString(KEY_CIPHERTEXT, null);
            String ivB64 = prefs.getString(KEY_IV, null);

            // Legacy migration: if ciphertext is absent but legacy plaintext was set, migrate and wipe legacy
            if (ciphertextB64 == null || ivB64 == null) {
                String legacyKey = prefs.getString(LEGACY_KEY_GROQ_SECRET, null);
                if (legacyKey != null && !legacyKey.trim().isEmpty()) {
                    encryptAndSaveApiKey(legacyKey.trim());
                    ciphertextB64 = prefs.getString(KEY_CIPHERTEXT, null);
                    ivB64 = prefs.getString(KEY_IV, null);
                }
            }

            if (ciphertextB64 == null || ivB64 == null) {
                return null;
            }

            byte[] ciphertext = Base64.decode(ciphertextB64, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);

            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);
            byte[] decrypted = cipher.doFinal(ciphertext);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    @JavascriptInterface
    public boolean setSophyApiKey(String key) {
        return encryptAndSaveApiKey(key);
    }

    @JavascriptInterface
    public boolean hasSophyApiKey() {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE);
            boolean hasCipher = prefs.contains(KEY_CIPHERTEXT) && prefs.contains(KEY_IV);
            if (hasCipher) return true;
            String legacy = prefs.getString(LEGACY_KEY_GROQ_SECRET, null);
            return legacy != null && !legacy.trim().isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String getSophyApiKeyMasked() {
        String key = null;
        try {
            key = getDecryptedApiKeyInternal();
            if (key == null || key.trim().isEmpty()) return "";
            key = key.trim();
            if (key.length() <= 4) return "••••";
            String last4 = key.substring(key.length() - 4);
            return "••••••••" + last4;
        } catch (Exception e) {
            return "";
        } finally {
            key = null; // discard in-memory reference immediately
        }
    }

    @JavascriptInterface
    public String getSophyKeyStatus() {
        try {
            String masked = getSophyApiKeyMasked();
            boolean configured = masked != null && !masked.isEmpty();
            return "{\"configured\":" + configured + ",\"masked\":\"" + (masked != null ? masked : "") + "\"}";
        } catch (Exception e) {
            return "{\"configured\":false,\"masked\":\"\"}";
        }
    }

    @JavascriptInterface
    public boolean clearSophyApiKey() {
        try {
            context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                    .edit()
                    .remove(KEY_CIPHERTEXT)
                    .remove(KEY_IV)
                    .remove(KEY_VERSION)
                    .remove(LEGACY_KEY_GROQ_SECRET)
                    .apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String callSophyGroq(String endpointUrl, String payloadJson) {
        HttpURLConnection conn = null;
        String key = null;
        try {
            key = getDecryptedApiKeyInternal();
            if (key == null || key.trim().isEmpty()) {
                return "{\"error\":{\"message\":\"AUTH_REQUIRED\",\"status\":401}}";
            }

            String targetUrl = (endpointUrl != null && !endpointUrl.trim().isEmpty())
                    ? endpointUrl.trim()
                    : "https://api.groq.com/openai/v1/chat/completions";

            URL url = new URL(targetUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Authorization", "Bearer " + key.trim());
            conn.setRequestProperty("User-Agent", "SmartFinancialPlanner/2.0 Sophy/3.0");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);

            byte[] bodyBytes = payloadJson.getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyBytes);
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            InputStream is = (responseCode >= 200 && responseCode < 300)
                    ? conn.getInputStream()
                    : conn.getErrorStream();

            if (is == null) {
                return "{\"error\":{\"message\":\"HTTP " + responseCode + " - No response stream\",\"status\":" + responseCode + "}}";
            }

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                buffer.write(buf, 0, n);
            }
            String responseStr = buffer.toString("UTF-8");

            if (responseCode >= 200 && responseCode < 300) {
                return responseStr;
            } else {
                return "{\"error\":{\"message\":\"HTTP " + responseCode + "\",\"status\":" + responseCode + ",\"body\":" + responseStr + "}}";
            }
        } catch (SocketTimeoutException te) {
            return "{\"error\":{\"message\":\"Timeout\",\"status\":408}}";
        } catch (Exception e) {
            return "{\"error\":{\"message\":\"" + e.getMessage() + "\",\"status\":500}}";
        } finally {
            key = null; // discard in-memory secret immediately
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }
}
