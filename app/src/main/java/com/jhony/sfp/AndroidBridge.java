package com.jhony.sfp;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class AndroidBridge {
    private final Context context;

    AndroidBridge(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public String getAppVersion() {
        return "2.0.2";
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
}
