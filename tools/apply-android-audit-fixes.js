const fs = require('fs');

function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,content){ fs.writeFileSync(path,content); }
function replaceOnce(text,pattern,replacement,label){
  const next=text.replace(pattern,replacement);
  if(next===text) throw new Error('Pattern not found: '+label);
  return next;
}

const bridgePath='app/src/main/java/com/jhony/sfp/AndroidBridge.java';
let bridge=read(bridgePath);

if(!bridge.includes('static String redactFinancialValues(String value)')){
  bridge=replaceOnce(bridge,'import android.app.Activity;\n','import android.Manifest;\nimport android.app.Activity;\n','Manifest import');
  bridge=replaceOnce(bridge,'import android.content.Intent;\n','import android.content.Intent;\nimport android.content.pm.PackageManager;\n','PackageManager import');
  bridge=replaceOnce(bridge,'import androidx.core.app.NotificationManagerCompat;\n','import androidx.core.app.NotificationManagerCompat;\nimport androidx.core.content.ContextCompat;\n','ContextCompat import');
  const anchor='    @JavascriptInterface\n    public void showNotification(String title, String message) {';
  const helper=[
    '    static String redactFinancialValues(String value) {',
    '        if (value == null) return "";',
    '        return value.replaceAll(',
    '                "(?i)(?:[-−+]\\\\s*)?R\\\\$[\\\\s\\\\u00A0]*(?:(?:\\\\d{1,3}(?:\\\\.\\\\d{3})+)(?:,\\\\d{2})?|\\\\d+(?:[.,]\\\\d{2})?)",',
    '                "***");',
    '    }',
    '',
    '    @JavascriptInterface',
    '    public String getNotificationPermissionState() {',
    '        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "not_required";',
    '        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return "denied";',
    '        return NotificationManagerCompat.from(context).areNotificationsEnabled() ? "granted" : "disabled";',
    '    }',
    '',
    anchor
  ].join('\n');
  bridge=replaceOnce(bridge,anchor,helper,'notification helpers');
}

const showPattern=/    @JavascriptInterface\n    public void showNotification\(String title, String message\) \{[\s\S]*?\n    \}\n\n    @JavascriptInterface\n    public (?:void|String) saveTextFile/;
const showReplacement=[
'    @JavascriptInterface',
'    public void showNotification(String title, String message) {',
'        try {',
'            String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Smart Financial Planner";',
'            String safeMessage = (message != null && !message.trim().isEmpty()) ? message.trim() : "Há uma atualização importante no Smart Financial Planner.";',
'            safeTitle = redactFinancialValues(safeTitle);',
'            safeMessage = redactFinancialValues(safeMessage);',
'',
'            if (context instanceof MainActivity) {',
'                MainActivity activity = (MainActivity) context;',
'                if (!activity.ensureNotificationPermissionForContextualAlert()) {',
'                    Toast.makeText(context, "Autorize as notificações do Android para receber este aviso fora do SFP.", Toast.LENGTH_SHORT).show();',
'                    return;',
'                }',
'            }',
'',
'            Intent intent = new Intent(context, MainActivity.class);',
'            intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);',
'            int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;',
'            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;',
'            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, pendingFlags);',
'',
'            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)',
'                    .setSmallIcon(R.drawable.ic_notification_small)',
'                    .setContentTitle(safeTitle)',
'                    .setContentText(safeMessage)',
'                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)',
'                    .setContentIntent(pendingIntent)',
'                    .setAutoCancel(true);',
'',
'            NotificationManagerCompat manager = NotificationManagerCompat.from(context);',
'            if (manager.areNotificationsEnabled()) manager.notify(NOTIFICATION_ID, builder.build());',
'            else Toast.makeText(context, "Notificações do Android estão desativadas. O aviso continua disponível dentro do SFP.", Toast.LENGTH_SHORT).show();',
'        } catch (Exception e) {',
'            Toast.makeText(context, title != null ? redactFinancialValues(title) : "Aviso do Smart Financial Planner", Toast.LENGTH_SHORT).show();',
'        }',
'    }',
'',
'    @JavascriptInterface',
'    public String saveTextFile'
].join('\n');
bridge=replaceOnce(bridge,showPattern,showReplacement,'showNotification block');

const savePattern=/    @JavascriptInterface\n    public String saveTextFile\(String filename, String mimeType, String content\) \{[\s\S]*?\n    \}\n\n\n    @JavascriptInterface\n    public String extractPdfText/;
const saveReplacement=[
'    @JavascriptInterface',
'    public String saveTextFile(String filename, String mimeType, String content) {',
'        JSONObject result = new JSONObject();',
'        try {',
'            OutputStream out;',
'            String location;',
'            boolean publicDownloads;',
'            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {',
'                ContentValues values = new ContentValues();',
'                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);',
'                values.put(MediaStore.Downloads.MIME_TYPE, mimeType == null ? "text/plain" : mimeType);',
'                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SFP");',
'                Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);',
'                if (uri == null) throw new Exception("Não foi possível criar o arquivo.");',
'                out = context.getContentResolver().openOutputStream(uri);',
'                location = "Downloads/SFP/" + filename;',
'                publicDownloads = true;',
'            } else {',
'                File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);',
'                if (dir == null) throw new Exception("Armazenamento externo do aplicativo indisponível.");',
'                File file = new File(dir, filename);',
'                out = new FileOutputStream(file);',
'                location = file.getAbsolutePath();',
'                publicDownloads = false;',
'            }',
'            if (out == null) throw new Exception("Não foi possível abrir o arquivo.");',
'            try (OutputStream target = out) {',
'                target.write((content == null ? "" : content).getBytes(StandardCharsets.UTF_8));',
'                target.flush();',
'            }',
'            result.put("ok", true);',
'            result.put("location", location);',
'            result.put("publicDownloads", publicDownloads);',
'            return result.toString();',
'        } catch (Exception e) {',
'            try {',
'                result.put("ok", false);',
'                result.put("error", e.getMessage() == null ? "Falha ao salvar arquivo." : e.getMessage());',
'                return result.toString();',
'            } catch (Exception ignored) {',
'                return "{\\"ok\\":false,\\"error\\":\\"Falha ao salvar arquivo.\\"}";',
'            }',
'        }',
'    }',
'',
'',
'    @JavascriptInterface',
'    public String extractPdfText'
].join('\n');
bridge=replaceOnce(bridge,savePattern,saveReplacement,'saveTextFile block');
write(bridgePath,bridge);

const activityPath='app/src/main/java/com/jhony/sfp/MainActivity.java';
let activity=read(activityPath);
if(!activity.includes('static String mapAcceptExtension(String extension)')){
  const anchor='    static String[] resolveAcceptMimeTypes(@Nullable WebChromeClient.FileChooserParams params) {';
  const helper=[
'    static String mapAcceptExtension(String extension) {',
'        if (extension == null) return null;',
'        switch (extension.toLowerCase(Locale.ROOT)) {',
'            case "csv": return "text/csv";',
'            case "ofx": return "application/x-ofx";',
'            case "qfx": return "application/x-ofx";',
'            case "json": return "application/json";',
'            case "pdf": return "application/pdf";',
'            case "jpg":',
'            case "jpeg": return "image/jpeg";',
'            case "png": return "image/png";',
'            case "webp": return "image/webp";',
'            case "txt": return "text/plain";',
'            case "sfp": return "application/octet-stream";',
'            default: return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);',
'        }',
'    }',
'',
anchor
  ].join('\n');
  activity=replaceOnce(activity,anchor,helper,'accept extension helper');
  activity=replaceOnce(activity,
'                        String extension = type.substring(1);\n                        String mapped = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);\n                        if (mapped != null && !mapped.trim().isEmpty()) types.add(mapped);',
'                        String extension = type.substring(1);\n                        String mapped = mapAcceptExtension(extension);\n                        if (mapped != null && !mapped.trim().isEmpty()) types.add(mapped);',
'accept extension mapping');
}
write(activityPath,activity);

const manifestPath='app/src/main/AndroidManifest.xml';
let manifest=read(manifestPath)
  .replace('android:allowBackup="true"','android:allowBackup="false"')
  .replace('android:fullBackupContent="true"','android:fullBackupContent="false"');
if(!manifest.includes('android:allowBackup="false"')) throw new Error('backup policy not applied');
write(manifestPath,manifest);

const iconPath='app/src/main/res/drawable/ic_notification_small.xml';
fs.mkdirSync('app/src/main/res/drawable',{recursive:true});
if(!fs.existsSync(iconPath)){
  write(iconPath,[
'<?xml version="1.0" encoding="utf-8"?>',
'<vector xmlns:android="http://schemas.android.com/apk/res/android"',
'    android:width="24dp"',
'    android:height="24dp"',
'    android:viewportWidth="24"',
'    android:viewportHeight="24">',
'    <path',
'        android:fillColor="#FFFFFFFF"',
'        android:pathData="M4,4h16c1.1,0 2,0.9 2,2v12c0,1.1 -0.9,2 -2,2H4c-1.1,0 -2,-0.9 -2,-2V6c0,-1.1 0.9,-2 2,-2zM4,6v12h16v-3h-5c-1.66,0 -3,-1.34 -3,-3s1.34,-3 3,-3h5V6H4zM15,11c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h5v-2h-5z" />',
'</vector>',
''
  ].join('\n'));
}

console.log('android audit fixes applied');
