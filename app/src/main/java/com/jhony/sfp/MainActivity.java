package com.jhony.sfp;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private static final int FILE_CHOOSER_REQUEST = 7001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7002;
    private boolean backRequestPending;
    private boolean notificationPermissionRequestPending;

    private static final String[] FALLBACK_FILE_MIME_TYPES = new String[]{
            "text/csv",
            "application/csv",
            "text/comma-separated-values",
            "application/vnd.ms-excel",
            "application/json",
            "application/octet-stream",
            "application/x-ofx",
            "application/ofx",
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "text/plain"
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView view, android.webkit.WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return true;
                return handleNavigation(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null) return true;
                return handleNavigation(Uri.parse(url));
            }

            private boolean handleNavigation(Uri uri) {
                if (uri == null) return true;
                String scheme = uri.getScheme();
                String host = uri.getHost();
                if ("https".equalsIgnoreCase(scheme) && "appassets.androidplatform.net".equalsIgnoreCase(host)) {
                    return false;
                }
                try {
                    if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(browserIntent);
                    }
                } catch (Exception ignored) {}
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {

                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;

                String[] acceptedMimeTypes = resolveAcceptMimeTypes(fileChooserParams);
                boolean broadFinancialPicker = requiresBroadFinancialPicker(fileChooserParams);
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (broadFinancialPicker) {
                    // Samsung/Android providers commonly expose OFX/QFX/CSV as application/octet-stream
                    // or with no reliable MIME. MIME filtering would grey out perfectly valid files.
                    intent.setType("*/*");
                } else if (acceptedMimeTypes.length == 1) {
                    intent.setType(acceptedMimeTypes[0]);
                } else {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes);
                }
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                        fileChooserParams != null && fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    fileChooserCallback.onReceiveValue(null);
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "Não foi possível abrir o seletor de arquivos.", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
        webView.addJavascriptInterface(new PluggyBridge(this), "PluggyBridge");
        // Always rebuild the document from the APK bundle. IndexedDB/local storage remain intact,
        // while stale WebView DOM/cache from an older APK can no longer resurrect old navigation.
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    static String mapAcceptExtension(String extension) {
        if (extension == null) return null;
        switch (extension.toLowerCase(Locale.ROOT)) {
            case "csv": return "text/csv";
            case "ofx": return "application/x-ofx";
            case "qfx": return "application/x-ofx";
            case "json": return "application/json";
            case "pdf": return "application/pdf";
            case "jpg":
            case "jpeg": return "image/jpeg";
            case "png": return "image/png";
            case "webp": return "image/webp";
            case "txt": return "text/plain";
            case "sfp": return "application/octet-stream";
            default: return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        }
    }

    static boolean requiresBroadFinancialPicker(@Nullable WebChromeClient.FileChooserParams params) {
        if (params == null || params.getAcceptTypes() == null) return false;
        for (String rawGroup : params.getAcceptTypes()) {
            if (rawGroup == null) continue;
            for (String raw : rawGroup.split(",")) {
                String type = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
                if (type.equals(".ofx") || type.equals(".qfx") || type.equals(".csv") || type.equals(".sfp") ||
                        type.contains("/ofx") || type.contains("csv") || type.equals("application/octet-stream")) {
                    return true;
                }
            }
        }
        return false;
    }

    static String[] resolveAcceptMimeTypes(@Nullable WebChromeClient.FileChooserParams params) {
        Set<String> types = new LinkedHashSet<>();
        if (params != null && params.getAcceptTypes() != null) {
            for (String rawGroup : params.getAcceptTypes()) {
                if (rawGroup == null) continue;
                for (String raw : rawGroup.split(",")) {
                    String type = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
                    if (type.isEmpty()) continue;
                    if (type.startsWith(".")) {
                        String extension = type.substring(1);
                        String mapped = mapAcceptExtension(extension);
                        if (mapped != null && !mapped.trim().isEmpty()) types.add(mapped);
                    } else if (type.contains("/")) {
                        types.add(type);
                    }
                }
            }
        }
        if (types.isEmpty()) {
            for (String fallback : FALLBACK_FILE_MIME_TYPES) types.add(fallback);
        }
        return types.toArray(new String[0]);
    }

    boolean ensureNotificationPermissionForContextualAlert() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return true;
        }
        if (!notificationPermissionRequestPending) {
            notificationPermissionRequestPending = true;
            runOnUiThread(() -> ActivityCompat.requestPermissions(
                    MainActivity.this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST));
        }
        return false;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            notificationPermissionRequestPending = false;
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (!granted) {
                Toast.makeText(this,
                        "Notificações do Android estão desativadas. Os avisos continuam disponíveis dentro do SFP.",
                        Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onRestoreInstanceState(@NonNull Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int index = 0; index < count; index++) {
                        results[index] = data.getClipData().getItemAt(index).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            fileChooserCallback.onReceiveValue(results);
            fileChooserCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null || backRequestPending) return;
        backRequestPending = true;
        webView.evaluateJavascript(
                "typeof window.handleAndroidBack === 'function' && window.handleAndroidBack()",
                result -> {
                    backRequestPending = false;
                    if (!"true".equals(result)) MainActivity.super.onBackPressed();
                });
    }
}
