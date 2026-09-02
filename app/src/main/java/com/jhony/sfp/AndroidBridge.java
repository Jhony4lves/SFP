package com.jhony.sfp;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
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
import org.json.JSONArray;
import org.json.JSONObject;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException;
import com.tom_roush.pdfbox.text.PDFTextStripper;

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
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class AndroidBridge {
    private static final String CHANNEL_ID = "sfp_important_alerts";
    private static final int NOTIFICATION_ID = 1001;
    private static final int MAX_OCR_FILE_BYTES = 24 * 1024 * 1024;
    private static final long MAX_OCR_PIXELS = 28_000_000L;
    private static final int OCR_CORE_HEIGHT = 1800;
    private static final int OCR_OVERLAP = 120;
    private final Context context;

    AndroidBridge(Context context) {
        this.context = context;
        PDFBoxResourceLoader.init(context.getApplicationContext());
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
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public void setSystemBarTheme(String theme) {
        if (context instanceof Activity) {
            Activity activity = (Activity) context;
            activity.runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        boolean isLight = "light".equalsIgnoreCase(theme);
                        int statusBarColor = isLight ? 0xFFF4F7FA : 0xFF07111E;
                        int navBarColor = isLight ? 0xFFFFFFFF : 0xFF06101D;
                        activity.getWindow().setStatusBarColor(statusBarColor);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            activity.getWindow().setNavigationBarColor(navBarColor);
                            int flags = activity.getWindow().getDecorView().getSystemUiVisibility();
                            if (isLight) {
                                flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                                flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                            } else {
                                flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                                flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                            }
                            activity.getWindow().getDecorView().setSystemUiVisibility(flags);
                        } else {
                            int flags = activity.getWindow().getDecorView().getSystemUiVisibility();
                            if (isLight) {
                                flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                            } else {
                                flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                            }
                            activity.getWindow().getDecorView().setSystemUiVisibility(flags);
                        }
                    }
                } catch (Exception ignored) {}
            });
        }
    }

    @JavascriptInterface
    public void showNotification(String title, String message) {
        try {
            String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Smart Financial Planner";
            String safeMessage = (message != null && !message.trim().isEmpty()) ? message.trim() : "Há uma atualização importante no Smart Financial Planner.";
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


    @JavascriptInterface
    public String extractPdfText(String base64Pdf) {
        return extractPdfTextInternal(base64Pdf, "", false);
    }

    @JavascriptInterface
    public String extractPdfTextWithPassword(String base64Pdf, String password) {
        return extractPdfTextInternal(base64Pdf, password, true);
    }

    private String extractPdfTextInternal(String base64Pdf, String password, boolean passwordWasProvided) {
        JSONObject result = new JSONObject();
        try {
            if (base64Pdf == null || base64Pdf.trim().isEmpty()) {
                result.put("ok", false);
                result.put("error", "PDF vazio.");
                return result.toString();
            }
            byte[] bytes = Base64.decode(base64Pdf, Base64.DEFAULT);
            if (bytes.length == 0) {
                result.put("ok", false);
                result.put("error", "PDF vazio.");
                return result.toString();
            }
            if (bytes.length > 20 * 1024 * 1024) {
                result.put("ok", false);
                result.put("error", "PDF maior que 20 MB. Exporte uma versão menor para importar no SFP.");
                return result.toString();
            }
            String transientPassword = password == null ? "" : password;
            try (PDDocument document = PDDocument.load(bytes, transientPassword)) {
                PDFTextStripper stripper = new PDFTextStripper();
                stripper.setSortByPosition(true);
                String text = stripper.getText(document);
                result.put("ok", text != null && !text.trim().isEmpty());
                result.put("text", text == null ? "" : text);
                result.put("pages", document.getNumberOfPages());
                if (text == null || text.trim().isEmpty()) {
                    result.put("error", "O PDF não contém texto pesquisável. PDFs escaneados ainda precisam de OCR.");
                }
                return result.toString();
            }
        } catch (InvalidPasswordException e) {
            try {
                result.put("ok", false);
                result.put("passwordRequired", true);
                result.put("errorCode", passwordWasProvided ? "invalid_password" : "password_required");
                result.put("error", passwordWasProvided
                    ? "Senha incorreta. Confira e tente novamente."
                    : "Este PDF é protegido por senha.");
                return result.toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"passwordRequired\":true,\"errorCode\":\"password_required\"}";
            }
        } catch (Exception e) {
            try {
                result.put("ok", false);
                result.put("error", "Não foi possível extrair o texto deste PDF.");
                return result.toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"error\":\"Falha ao ler PDF.\"}";
            }
        }
    }

    /**
     * Extrai texto e coordenadas de capturas de fatura sem enviar a imagem para
     * nenhum serviço. O modelo latino do ML Kit é empacotado no próprio APK.
     * Capturas longas são divididas em faixas sobrepostas para evitar que uma
     * linha cortada na borda desapareça do resultado.
     */
    @JavascriptInterface
    public String extractImageText(String base64Image) {
        JSONObject result = new JSONObject();
        Bitmap bitmap = null;
        TextRecognizer recognizer = null;
        try {
            if (base64Image == null || base64Image.trim().isEmpty()) {
                result.put("ok", false);
                result.put("error", "Imagem vazia.");
                return result.toString();
            }

            byte[] bytes = Base64.decode(base64Image, Base64.DEFAULT);
            if (bytes.length == 0) {
                result.put("ok", false);
                result.put("error", "Imagem vazia.");
                return result.toString();
            }
            if (bytes.length > MAX_OCR_FILE_BYTES) {
                result.put("ok", false);
                result.put("error", "Imagem maior que 24 MB. Use a captura com rolagem original ou divida em duas imagens.");
                return result.toString();
            }

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                result.put("ok", false);
                result.put("error", "Formato de imagem inválido ou ilegível.");
                return result.toString();
            }

            int sampleSize = 1;
            while ((long) Math.ceil((double) bounds.outWidth / sampleSize)
                    * (long) Math.ceil((double) bounds.outHeight / sampleSize) > MAX_OCR_PIXELS
                    || bounds.outWidth / sampleSize > 2400) {
                sampleSize *= 2;
            }
            BitmapFactory.Options decode = new BitmapFactory.Options();
            decode.inSampleSize = sampleSize;
            decode.inPreferredConfig = Bitmap.Config.ARGB_8888;
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, decode);
            if (bitmap == null || bitmap.getWidth() <= 0 || bitmap.getHeight() <= 0) {
                result.put("ok", false);
                result.put("error", "Não foi possível abrir esta imagem.");
                return result.toString();
            }

            recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            JSONArray lines = new JSONArray();
            StringBuilder extractedText = new StringBuilder();
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();

            for (int coreTop = 0; coreTop < height; coreTop += OCR_CORE_HEIGHT) {
                int coreBottom = Math.min(height, coreTop + OCR_CORE_HEIGHT);
                int tileTop = Math.max(0, coreTop - OCR_OVERLAP);
                int tileBottom = Math.min(height, coreBottom + OCR_OVERLAP);
                Bitmap tile = Bitmap.createBitmap(bitmap, 0, tileTop, width, tileBottom - tileTop);
                try {
                    Text recognized = Tasks.await(
                            recognizer.process(InputImage.fromBitmap(tile, 0)),
                            45,
                            TimeUnit.SECONDS);
                    for (Text.TextBlock block : recognized.getTextBlocks()) {
                        for (Text.Line line : block.getLines()) {
                            String value = line.getText() == null ? "" : line.getText().trim();
                            Rect box = line.getBoundingBox();
                            if (value.isEmpty() || box == null) continue;
                            int absoluteTop = box.top + tileTop;
                            int absoluteBottom = box.bottom + tileTop;
                            int center = absoluteTop + Math.max(1, absoluteBottom - absoluteTop) / 2;
                            // Cada linha pertence ao núcleo de apenas uma faixa. A margem
                            // sobreposta serve somente para o reconhecedor enxergar a linha inteira.
                            if (center < coreTop || (center >= coreBottom && coreBottom < height)) continue;
                            JSONObject item = new JSONObject();
                            item.put("text", value);
                            item.put("left", Math.max(0, box.left));
                            item.put("top", Math.max(0, absoluteTop));
                            item.put("right", Math.min(width, box.right));
                            item.put("bottom", Math.min(height, absoluteBottom));
                            lines.put(item);
                            if (extractedText.length() > 0) extractedText.append('\n');
                            extractedText.append(value);
                        }
                    }
                } finally {
                    if (tile != bitmap && !tile.isRecycled()) tile.recycle();
                }
            }

            boolean ok = lines.length() > 0 && extractedText.toString().trim().length() > 0;
            result.put("ok", ok);
            result.put("text", extractedText.toString());
            result.put("lines", lines);
            result.put("width", width);
            result.put("height", height);
            result.put("sampleSize", sampleSize);
            result.put("engine", "mlkit-latin-bundled");
            if (!ok) result.put("error", "Não encontrei texto legível nesta imagem.");
            return result.toString();
        } catch (OutOfMemoryError error) {
            try {
                result.put("ok", false);
                result.put("error", "A imagem é grande demais para leitura segura. Divida a captura em duas partes.");
                return result.toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"error\":\"Imagem grande demais.\"}";
            }
        } catch (Exception error) {
            try {
                result.put("ok", false);
                result.put("error", "Não foi possível reconhecer o texto desta imagem.");
                return result.toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"error\":\"Falha ao ler imagem.\"}";
            }
        } finally {
            if (recognizer != null) recognizer.close();
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        }
    }

    // ============================================================
    // SOPHY V3 SECURE ANDROID KEYSTORE & NATIVE GROQ BRIDGE
    // ============================================================
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "sfp_sophy_groq_v3_master_key";
    private static final String CIPHER_TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;

    private static final String GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

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

    private void resetSecretKeyAlias() {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS);
            }
        } catch (Exception ignored) {
        }
    }

    private boolean encryptAndSaveApiKey(String rawKey) {
        if (rawKey == null || rawKey.trim().isEmpty()) {
            // Empty input must never behave like an implicit destructive action.
            // Key removal is only allowed through clearSophyApiKey().
            return false;
        }
        final String trimmed = rawKey.trim();
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                SecretKey secretKey = getOrCreateSecretKey();
                Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
                cipher.init(Cipher.ENCRYPT_MODE, secretKey);
                byte[] iv = cipher.getIV();
                byte[] ciphertext = cipher.doFinal(trimmed.getBytes(StandardCharsets.UTF_8));

                String ciphertextB64 = Base64.encodeToString(ciphertext, Base64.NO_WRAP);
                String ivB64 = Base64.encodeToString(iv, Base64.NO_WRAP);

                boolean persisted = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_CIPHERTEXT, ciphertextB64)
                        .putString(KEY_IV, ivB64)
                        .putString(KEY_VERSION, "v3-keystore-gcm")
                        .remove(LEGACY_KEY_GROQ_SECRET)
                        .commit();
                if (!persisted) return false;

                String verified = getDecryptedApiKeyInternal(false);
                boolean ok = trimmed.equals(verified);
                verified = null;
                return ok;
            } catch (Exception e) {
                if (attempt == 0) {
                    // A stale/invalidated AndroidKeyStore alias can survive an app update.
                    // Recreate it once, then persist the newly entered key again.
                    resetSecretKeyAlias();
                    continue;
                }
                return false;
            }
        }
        return false;
    }

    private void migrateLegacyKeyIfNeeded(SharedPreferences prefs) {
        String legacyKey = prefs.getString(LEGACY_KEY_GROQ_SECRET, null);
        if (legacyKey == null) {
            return;
        }
        try {
            String trimmed = legacyKey.trim();
            if (!trimmed.isEmpty()) {
                encryptAndSaveApiKey(trimmed);
            }
        } catch (Exception ignored) {
            // Fail-secure: migration failure leaves API key unconfigured
        } finally {
            // Legacy plaintext must never remain on disk, even if migration fails.
            prefs.edit().remove(LEGACY_KEY_GROQ_SECRET).apply();
        }
    }

    private String getDecryptedApiKeyInternal() {
        return getDecryptedApiKeyInternal(true);
    }

    private String getDecryptedApiKeyInternal(boolean allowLegacyMigration) {
        SharedPreferences prefs = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE);

        if (allowLegacyMigration) {
            migrateLegacyKeyIfNeeded(prefs);
        }

        String ciphertextB64 = prefs.getString(KEY_CIPHERTEXT, null);
        String ivB64 = prefs.getString(KEY_IV, null);

        if (ciphertextB64 == null || ivB64 == null || ciphertextB64.trim().isEmpty() || ivB64.trim().isEmpty()) {
            return null;
        }

        try {
            byte[] ciphertext = Base64.decode(ciphertextB64, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);

            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);
            byte[] decrypted = cipher.doFinal(ciphertext);
            if (decrypted == null || decrypted.length == 0) {
                return null;
            }
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
        String key = null;
        try {
            key = getDecryptedApiKeyInternal();
            return key != null && !key.trim().isEmpty();
        } catch (Exception e) {
            return false;
        } finally {
            key = null;
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
            key = null;
        }
    }

    @JavascriptInterface
    public String getSophyKeyStatus() {
        try {
            boolean configured = hasSophyApiKey();
            String masked = configured ? getSophyApiKeyMasked() : "";
            JSONObject status = new JSONObject();
            status.put("configured", configured);
            status.put("masked", masked != null ? masked : "");
            return status.toString();
        } catch (Exception e) {
            return "{\"configured\":false,\"masked\":\"\"}";
        }
    }

    @JavascriptInterface
    public boolean clearSophyApiKey() {
        try {
            return context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                    .edit()
                    .remove(KEY_CIPHERTEXT)
                    .remove(KEY_IV)
                    .remove(KEY_VERSION)
                    .remove(LEGACY_KEY_GROQ_SECRET)
                    .commit();
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String callSophyGroq(String payloadJson) {
        HttpURLConnection conn = null;
        String key = null;
        try {
            key = getDecryptedApiKeyInternal();
            if (key == null || key.trim().isEmpty()) {
                JSONObject errEnvelope = new JSONObject();
                JSONObject errObj = new JSONObject();
                errObj.put("message", "AUTH_REQUIRED");
                errObj.put("status", 401);
                errEnvelope.put("error", errObj);
                return errEnvelope.toString();
            }

            URL url = new URL(GROQ_CHAT_COMPLETIONS_URL);
            if (!"https".equalsIgnoreCase(url.getProtocol()) ||
                !"api.groq.com".equalsIgnoreCase(url.getHost()) ||
                !"/openai/v1/chat/completions".equals(url.getPath()) ||
                (url.getPort() != -1 && url.getPort() != 443)) {
                throw new SecurityException("Endpoint Groq inválido ou não autorizado");
            }

            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Authorization", "Bearer " + key.trim());
            conn.setRequestProperty("User-Agent", "SmartFinancialPlanner/" + BuildConfig.VERSION_NAME + " Sophy/3.0");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);

            byte[] bodyBytes = payloadJson != null ? payloadJson.getBytes(StandardCharsets.UTF_8) : new byte[0];
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyBytes);
                os.flush();
            }

            int responseCode = conn.getResponseCode();

            if (responseCode >= 300 && responseCode < 400) {
                JSONObject errEnvelope = new JSONObject();
                JSONObject errObj = new JSONObject();
                errObj.put("message", "HTTP " + responseCode + " - Redirecionamento não permitido.");
                errObj.put("status", responseCode);
                errEnvelope.put("error", errObj);
                return errEnvelope.toString();
            }

            InputStream is = (responseCode >= 200 && responseCode < 300)
                    ? conn.getInputStream()
                    : conn.getErrorStream();

            if (is == null) {
                JSONObject errEnvelope = new JSONObject();
                JSONObject errObj = new JSONObject();
                errObj.put("message", "HTTP " + responseCode + " - No response stream");
                errObj.put("status", responseCode);
                errEnvelope.put("error", errObj);
                return errEnvelope.toString();
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
                try {
                    JSONObject parsedBody = new JSONObject(responseStr);
                    JSONObject errEnvelope = new JSONObject();
                    errEnvelope.put("error", parsedBody.optJSONObject("error") != null ? parsedBody.getJSONObject("error") : parsedBody);
                    return errEnvelope.toString();
                } catch (Exception parseEx) {
                    JSONObject errEnvelope = new JSONObject();
                    JSONObject errObj = new JSONObject();
                    errObj.put("message", "HTTP " + responseCode);
                    errObj.put("status", responseCode);
                    errObj.put("rawBody", responseStr != null && responseStr.length() > 500 ? responseStr.substring(0, 500) : responseStr);
                    errEnvelope.put("error", errObj);
                    return errEnvelope.toString();
                }
            }
        } catch (SocketTimeoutException te) {
            try {
                JSONObject errEnvelope = new JSONObject();
                JSONObject errObj = new JSONObject();
                errObj.put("message", "Tempo limite de conexão esgotado");
                errObj.put("status", 408);
                errEnvelope.put("error", errObj);
                return errEnvelope.toString();
            } catch (Exception ignored) {
                return "{\"error\":{\"message\":\"Timeout\",\"status\":408}}";
            }
        } catch (Exception e) {
            try {
                JSONObject errEnvelope = new JSONObject();
                JSONObject errObj = new JSONObject();
                errObj.put("message", e.getMessage() != null ? e.getMessage() : "Erro interno nativo");
                errObj.put("status", 500);
                errEnvelope.put("error", errObj);
                return errEnvelope.toString();
            } catch (Exception ignored) {
                return "{\"error\":{\"message\":\"Internal Error\",\"status\":500}}";
            }
        } finally {
            key = null;
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }
}
