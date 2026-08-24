package com.jhony.sfp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

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
    // SOPHY V3 SECURE KEYSTORE & NATIVE GROQ BRIDGE
    // ============================================================
    private static final String PREF_SECURE_VAULT = "sfp_sophy_secure_vault";
    private static final String KEY_GROQ_SECRET = "sophy_groq_api_key";

    @JavascriptInterface
    public boolean setSophyApiKey(String key) {
        try {
            if (key == null || key.trim().isEmpty()) {
                clearSophyApiKey();
                return true;
            }
            context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_GROQ_SECRET, key.trim())
                    .apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean hasSophyApiKey() {
        try {
            String key = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                    .getString(KEY_GROQ_SECRET, null);
            return key != null && !key.trim().isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String getSophyApiKeyMasked() {
        try {
            String key = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                    .getString(KEY_GROQ_SECRET, null);
            if (key == null || key.trim().isEmpty()) return "";
            key = key.trim();
            if (key.length() <= 4) return "••••";
            String last4 = key.substring(key.length() - 4);
            return "••••••••" + last4;
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public boolean clearSophyApiKey() {
        try {
            context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                    .edit()
                    .remove(KEY_GROQ_SECRET)
                    .apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String callSophyGroq(String endpointUrl, String payloadJson) {
        java.net.HttpURLConnection conn = null;
        try {
            String key = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                    .getString(KEY_GROQ_SECRET, null);
            if (key == null || key.trim().isEmpty()) {
                return "{\"error\":{\"message\":\"AUTH_REQUIRED\",\"status\":401}}";
            }

            String targetUrl = (endpointUrl != null && !endpointUrl.trim().isEmpty())
                    ? endpointUrl.trim()
                    : "https://api.groq.com/openai/v1/chat/completions";

            java.net.URL url = new java.net.URL(targetUrl);
            conn = (java.net.HttpURLConnection) url.openConnection();
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
            java.io.InputStream is = (responseCode >= 200 && responseCode < 300)
                    ? conn.getInputStream()
                    : conn.getErrorStream();

            if (is == null) {
                return "{\"error\":{\"message\":\"HTTP " + responseCode + " - No response stream\",\"status\":" + responseCode + "}}";
            }

            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
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
        } catch (java.net.SocketTimeoutException te) {
            return "{\"error\":{\"message\":\"Timeout\",\"status\":408}}";
        } catch (Exception e) {
            return "{\"error\":{\"message\":\"" + e.getMessage() + "\",\"status\":500}}";
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }
}
