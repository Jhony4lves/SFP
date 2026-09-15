package com.jhony.sfp;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.InstallSourceInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private static final String TARGET_RELEASE = "com.jhony.sfp";
    private static final String TARGET_DEBUG = "com.jhony.sfp.debug";
    private static final String EXPECTED_CERT = "bf036c1668644f9c5b739e827472c7b29392de54554cdfbf2890d3b764aed2d9";

    private TextView reportView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("SFP Diagnóstico de Instalação");

        int pad = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("SFP — Diagnóstico de atualização");
        title.setTextSize(22f);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView help = new TextView(this);
        help.setText("Este app não altera nem abre o banco do SFP. Ele apenas lê versão, package e certificado de assinatura que o Android informa para o SFP instalado.");
        help.setTextSize(15f);
        help.setPadding(0, dp(8), 0, dp(16));
        root.addView(help);

        reportView = new TextView(this);
        reportView.setTextSize(14f);
        reportView.setTypeface(Typeface.MONOSPACE);
        reportView.setTextIsSelectable(true);
        reportView.setPadding(0, 0, 0, dp(16));
        root.addView(reportView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        Button refresh = new Button(this);
        refresh.setText("Ler novamente");
        refresh.setOnClickListener(v -> refreshReport());
        root.addView(refresh);

        Button copy = new Button(this);
        copy.setText("Copiar diagnóstico");
        copy.setOnClickListener(v -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText("SFP diagnóstico", reportView.getText()));
            Toast.makeText(this, "Diagnóstico copiado.", Toast.LENGTH_SHORT).show();
        });
        root.addView(copy);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
        refreshReport();
    }

    private void refreshReport() {
        StringBuilder out = new StringBuilder();
        out.append("Android: ").append(Build.VERSION.RELEASE)
                .append(" (SDK ").append(Build.VERSION.SDK_INT).append(")\n");
        out.append("Modelo: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append("\n\n");
        out.append("Certificado esperado para as novas builds:\n")
                .append(EXPECTED_CERT).append("\n\n");

        appendPackage(out, TARGET_RELEASE, "SFP RELEASE");
        out.append("\n");
        appendPackage(out, TARGET_DEBUG, "SFP DEBUG");

        out.append("\n--- INTERPRETAÇÃO ---\n");
        out.append("Se RELEASE existir e 'assinatura compatível' = SIM, a instalação deve depender de versionCode/política do instalador.\n");
        out.append("Se RELEASE existir e 'assinatura compatível' = NÃO, o APK atualmente instalado veio de outra chave e não pode ser atualizado por cima com a chave nova.\n");
        out.append("Se apenas DEBUG existir, você está usando com.jhony.sfp.debug e o APK Release é outro aplicativo para o Android.\n");

        reportView.setText(out.toString());
    }

    private void appendPackage(StringBuilder out, String packageName, String label) {
        out.append("=== ").append(label).append(" ===\n");
        try {
            PackageManager pm = getPackageManager();
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? PackageManager.GET_SIGNING_CERTIFICATES
                    : PackageManager.GET_SIGNATURES;
            PackageInfo info = pm.getPackageInfo(packageName, flags);

            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode()
                    : info.versionCode;

            out.append("instalado: SIM\n");
            out.append("package: ").append(info.packageName).append("\n");
            out.append("versionName: ").append(info.versionName).append("\n");
            out.append("versionCode: ").append(versionCode).append("\n");
            out.append("primeira instalação: ").append(formatDate(info.firstInstallTime)).append("\n");
            out.append("última atualização: ").append(formatDate(info.lastUpdateTime)).append("\n");
            out.append("instalador: ").append(installerFor(pm, packageName)).append("\n");

            Signature[] signatures;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
                signatures = info.signingInfo.hasMultipleSigners()
                        ? info.signingInfo.getApkContentsSigners()
                        : info.signingInfo.getSigningCertificateHistory();
            } else {
                signatures = info.signatures;
            }

            boolean compatible = false;
            if (signatures == null || signatures.length == 0) {
                out.append("SHA-256 assinatura: indisponível\n");
            } else {
                for (int i = 0; i < signatures.length; i++) {
                    String digest = sha256(signatures[i].toByteArray());
                    out.append("SHA-256 assinatura");
                    if (signatures.length > 1) out.append(' ').append(i + 1);
                    out.append(": ").append(digest).append("\n");
                    if (EXPECTED_CERT.equalsIgnoreCase(digest)) compatible = true;
                }
            }
            out.append("assinatura compatível com build nova: ")
                    .append(compatible ? "SIM" : "NÃO").append("\n");
        } catch (PackageManager.NameNotFoundException e) {
            out.append("instalado: NÃO\n");
        } catch (Exception e) {
            out.append("erro ao ler: ").append(e.getClass().getSimpleName())
                    .append(": ").append(e.getMessage()).append("\n");
        }
    }

    private String installerFor(PackageManager pm, String packageName) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                InstallSourceInfo source = pm.getInstallSourceInfo(packageName);
                String installing = source.getInstallingPackageName();
                String initiating = source.getInitiatingPackageName();
                if (installing != null) return installing;
                if (initiating != null) return initiating;
                return "desconhecido/sideload";
            }
            String legacy = pm.getInstallerPackageName(packageName);
            return legacy == null ? "desconhecido/sideload" : legacy;
        } catch (Exception e) {
            return "indisponível";
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder hex = new StringBuilder();
        for (byte b : digest) hex.append(String.format(Locale.US, "%02x", b));
        return hex.toString();
    }

    private static String formatDate(long timestamp) {
        if (timestamp <= 0) return "indisponível";
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date(timestamp));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    // Mantido para compatibilidade de compilação com AndroidBridge nesta branch de diagnóstico.
    boolean ensureNotificationPermissionForContextualAlert() {
        return false;
    }
}
