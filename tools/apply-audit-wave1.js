const fs = require('fs');

function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,content){ fs.writeFileSync(path,content); }
function replaceOnce(text, pattern, replacement, label){
  const next = text.replace(pattern, replacement);
  if(next === text) throw new Error(`Pattern not found: ${label}`);
  return next;
}

// ---- Android privacy / notifications / export ----
{
  const path='app/src/main/java/com/jhony/sfp/AndroidBridge.java';
  let s=read(path);

  if(!s.includes('static String redactFinancialValues(String value)')){
    s=replaceOnce(s,
      'import android.app.Activity;\n',
      'import android.Manifest;\nimport android.app.Activity;\n',
      'AndroidBridge Manifest import');
    s=replaceOnce(s,
      'import android.content.Intent;\n',
      'import android.content.Intent;\nimport android.content.pm.PackageManager;\n',
      'AndroidBridge PackageManager import');
    s=replaceOnce(s,
      'import androidx.core.app.NotificationManagerCompat;\n',
      'import androidx.core.app.NotificationManagerCompat;\nimport androidx.core.content.ContextCompat;\n',
      'AndroidBridge ContextCompat import');

    const marker='    @JavascriptInterface\n    public void showNotification(String title, String message) {';
    const helper=`    static String redactFinancialValues(String value) {\n        if (value == null) return \"\";\n        return value.replaceAll(\n                \"(?i)(?:[-−+]\\\\s*)?R\\\\$[\\\\s\\\\u00A0]*(?:(?:\\\\d{1,3}(?:\\\\.\\\\d{3})+)(?:,\\\\d{2})?|\\\\d+(?:[.,]\\\\d{2})?)\",\n                \"***\");\n    }\n\n    @JavascriptInterface\n    public String getNotificationPermissionState() {\n        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return \"not_required\";\n        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {\n            return \"denied\";\n        }\n        return NotificationManagerCompat.from(context).areNotificationsEnabled() ? \"granted\" : \"disabled\";\n    }\n\n${marker}`;
    s=replaceOnce(s, marker, helper, 'AndroidBridge notification helper insertion');
  }

  s=s.replace(/    @JavascriptInterface\n    public void showNotification\(String title, String message\) \{[\s\S]*?\n    \}\n\n    @JavascriptInterface\n    public (?:void|String) saveTextFile/,
`    @JavascriptInterface
    public void showNotification(String title, String message) {
        try {
            String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Smart Financial Planner";
            String safeMessage = (message != null && !message.trim().isEmpty()) ? message.trim() : "Há uma atualização importante no Smart Financial Planner.";
            safeTitle = redactFinancialValues(safeTitle);
            safeMessage = redactFinancialValues(safeMessage);

            if (context instanceof MainActivity) {
                MainActivity activity = (MainActivity) context;
                if (!activity.ensureNotificationPermissionForContextualAlert()) {
                    Toast.makeText(context,
                            "Autorize as notificações do Android para receber este aviso fora do SFP.",
                            Toast.LENGTH_SHORT).show();
                    return;
                }
            }

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, pendingFlags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_notification_small)
                    .setContentTitle(safeTitle)
                    .setContentText(safeMessage)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true);

            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            if (manager.areNotificationsEnabled()) {
                manager.notify(NOTIFICATION_ID, builder.build());
            } else {
                Toast.makeText(context,
                        "Notificações do Android estão desativadas. O aviso continua disponível dentro do SFP.",
                        Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(context, title != null ? redactFinancialValues(title) : "Aviso do Smart Financial Planner", Toast.LENGTH_SHORT).show();
        }
    }

    @JavascriptInterface
    public String saveTextFile`);

  s=s.replace(/    @JavascriptInterface\n    public String saveTextFile\(String filename, String mimeType, String content\) \{[\s\S]*?\n    \}\n\n\n    @JavascriptInterface\n    public String extractPdfText/,
`    @JavascriptInterface
    public String saveTextFile(String filename, String mimeType, String content) {
        JSONObject result = new JSONObject();
        try {
            OutputStream out;
            String location;
            boolean publicDownloads;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType == null ? "text/plain" : mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SFP");
                Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("Não foi possível criar o arquivo.");
                out = context.getContentResolver().openOutputStream(uri);
                location = "Downloads/SFP/" + filename;
                publicDownloads = true;
            } else {
                File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) throw new Exception("Armazenamento externo do aplicativo indisponível.");
                File file = new File(dir, filename);
                out = new FileOutputStream(file);
                location = file.getAbsolutePath();
                publicDownloads = false;
            }

            if (out == null) throw new Exception("Não foi possível abrir o arquivo.");
            try (OutputStream target = out) {
                target.write((content == null ? "" : content).getBytes(StandardCharsets.UTF_8));
                target.flush();
            }

            result.put("ok", true);
            result.put("location", location);
            result.put("publicDownloads", publicDownloads);
            return result.toString();
        } catch (Exception e) {
            try {
                result.put("ok", false);
                result.put("error", e.getMessage() == null ? "Falha ao salvar arquivo." : e.getMessage());
                return result.toString();
            } catch (Exception ignored) {
                return "{\\"ok\\":false,\\"error\\":\\"Falha ao salvar arquivo.\\"}";
            }
        }
    }


    @JavascriptInterface
    public String extractPdfText`);

  if(!s.includes('R.drawable.ic_notification_small')) throw new Error('AndroidBridge notification icon patch failed');
  if(!s.includes('public String saveTextFile')) throw new Error('AndroidBridge save result patch failed');
  write(path,s);
}

// ---- Android file picker extension fidelity ----
{
  const path='app/src/main/java/com/jhony/sfp/MainActivity.java';
  let s=read(path);
  if(!s.includes('static String mapAcceptExtension(String extension)')){
    const anchor='    static String[] resolveAcceptMimeTypes(@Nullable WebChromeClient.FileChooserParams params) {';
    const helper=`    static String mapAcceptExtension(String extension) {\n        if (extension == null) return null;\n        switch (extension.toLowerCase(Locale.ROOT)) {\n            case \"csv\": return \"text/csv\";\n            case \"ofx\": return \"application/x-ofx\";\n            case \"qfx\": return \"application/x-ofx\";\n            case \"json\": return \"application/json\";\n            case \"pdf\": return \"application/pdf\";\n            case \"jpg\":\n            case \"jpeg\": return \"image/jpeg\";\n            case \"png\": return \"image/png\";\n            case \"webp\": return \"image/webp\";\n            case \"txt\": return \"text/plain\";\n            case \"sfp\": return \"application/octet-stream\";\n            default:\n                return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);\n        }\n    }\n\n${anchor}`;
    s=replaceOnce(s,anchor,helper,'MainActivity accept extension helper');
    s=replaceOnce(s,
`                        String extension = type.substring(1);
                        String mapped = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                        if (mapped != null && !mapped.trim().isEmpty()) types.add(mapped);`,
`                        String extension = type.substring(1);
                        String mapped = mapAcceptExtension(extension);
                        if (mapped != null && !mapped.trim().isEmpty()) types.add(mapped);`,
      'MainActivity accept mapping use');
  }
  write(path,s);
}

// ---- Explicit local-first Android backup policy ----
{
  const path='app/src/main/AndroidManifest.xml';
  let s=read(path);
  s=s.replace('android:allowBackup="true"','android:allowBackup="false"');
  s=s.replace('android:fullBackupContent="true"','android:fullBackupContent="false"');
  if(!s.includes('android:allowBackup="false"')) throw new Error('Manifest backup policy failed');
  write(path,s);
}

// ---- Dedicated notification small icon ----
{
  const path='app/src/main/res/drawable/ic_notification_small.xml';
  fs.mkdirSync('app/src/main/res/drawable',{recursive:true});
  if(!fs.existsSync(path)){
    write(path,`<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="24dp"\n    android:height="24dp"\n    android:viewportWidth="24"\n    android:viewportHeight="24">\n    <path\n        android:fillColor="#FFFFFFFF"\n        android:pathData="M4,4h16c1.1,0 2,0.9 2,2v12c0,1.1 -0.9,2 -2,2H4c-1.1,0 -2,-0.9 -2,-2V6c0,-1.1 0.9,-2 2,-2zM4,6v12h16v-3h-5c-1.66,0 -3,-1.34 -3,-3s1.34,-3 3,-3h5V6H4zM15,11c-0.55,0 -1,0.45 -1,1s0.45,1 1,1h5v-2h-5z" />\n</vector>\n`);
  }
}

// ---- Localized money/date copy in Financial Intelligence ----
{
  const path='app/src/main/assets/www/financial-intelligence.js';
  let s=read(path);
  if(!s.includes('const moneyCents=')){
    s=replaceOnce(s,
      "  const cents = value => Math.round(Number(value) || 0);\n",
      "  const cents = value => Math.round(Number(value) || 0);\n  const moneyCents = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents(value)/100);\n  const civilDate = value => { const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/); return m?`${m[3]}/${m[2]}/${m[1]}`:String(value||'—'); };\n",
      'Financial Intelligence format helpers');
  }
  s=s.replace('message:`A projeção determinística encontra saldo mínimo de ${(cents(risky.minBalanceCents)/100).toFixed(2)} antes do fim da janela.`',
              'message:`A projeção determinística encontra saldo mínimo de ${moneyCents(risky.minBalanceCents)} antes do fim da janela.`');
  s=s.replace('message:`Total conhecido de ${(totalCents/100).toFixed(2)} nessa janela.`',
              'message:`Total conhecido de ${moneyCents(totalCents)} nessa janela.`');
  s=s.replace('message:`Duas movimentações idênticas de ${(d.amountCents/100).toFixed(2)} foram encontradas em ${d.date}.`',
              'message:`Duas movimentações idênticas de ${moneyCents(d.amountCents)} foram encontradas em ${civilDate(d.date)}.`');
  if(s.includes('(totalCents/100).toFixed(2)')) throw new Error('Financial Intelligence localization incomplete');
  write(path,s);
}

// ---- User-facing locale + native export result in main UI ----
{
  const path='app/src/main/assets/www/index.html';
  let s=read(path);

  if(!s.includes('function sfpDatePt(value)')){
    s=replaceOnce(s,/function brl\(/,
`function sfpDatePt(value){
 const m=String(value||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
 return m?\`${'${m[3]}/${m[2]}/${m[1]}'}\`:String(value||'—')
}
function brl(`,
      'index civil date helper');
  }

  // Native save result must be authoritative: no false success toast.
  s=s.replace(/if\(window\.AndroidBridge && typeof AndroidBridge\.saveTextFile === 'function'\)\{\s*try\{\s*AndroidBridge\.saveTextFile\(name,type \|\| 'text\/plain',String\(content\)\);\s*toast\('Arquivo salvo em Downloads\.'\);\s*return;\s*\}catch\(e\)\{\}\s*\}/,
`if(window.AndroidBridge && typeof AndroidBridge.saveTextFile === 'function'){
   try{
     const rawResult=AndroidBridge.saveTextFile(name,type || 'text/plain',String(content));
     const result=typeof rawResult==='string'?JSON.parse(rawResult):rawResult;
     if(!result||result.ok!==true)throw new Error(result?.error||'Falha ao salvar arquivo.');
     toast(result.publicDownloads===false
       ?`Arquivo salvo no armazenamento privado do SFP: ${result.location||name}`
       :`Arquivo salvo em ${result.location||'Downloads/SFP'}.`);
     return;
   }catch(e){
     toast(`Falha ao salvar arquivo: ${e?.message||'erro desconhecido'}`);
     return;
   }
 }`);

  // Locale presentation only; persisted enums and ISO dates stay unchanged.
  s=s.replace(/\$\{sfpEsc\(r\.type\)\}\s*•\s*\$\{brl\(r\.amount\)\}/g,'${sfpEsc(kindLabel(r.type))} • ${brl(r.amount)}');
  s=s.replace(/\$\{r\.type\}\s*•\s*\$\{brl\(r\.amount\)\}/g,'${kindLabel(r.type)} • ${brl(r.amount)}');
  s=s.replace(/sub:`\$\{t\.date\} • \$\{brl\(t\.amount\)\} • \$\{t\.kind\}`/g,
              'sub:`${sfpDatePt(t.date)} • ${brl(t.amount)} • ${kindLabel(t.kind)}`');
  s=s.replace(/Última conciliação em \$\{a\.reconciled\.date\}/g,'Última conciliação em ${sfpDatePt(a.reconciled.date)}');
  s=s.replace(/<small>\$\{t\.date\} ·/g,'<small>${sfpDatePt(t.date)} ·');
  s=s.replace(/\$\{d\.firstDue\|\|'—'\}/g,"${d.firstDue?sfpDatePt(d.firstDue):'—'}");
  s=s.replace(/\$\{h\.date\|\|new Date\(h\.at\)\.toLocaleDateString\('pt-BR'\)\}/g,"${h.date?sfpDatePt(h.date):new Date(h.at).toLocaleDateString('pt-BR')}");
  s=s.replace(/\$\{g\.targetDate\|\|'Sem prazo definido'\}/g,"${g.targetDate?sfpDatePt(g.targetDate):'Sem prazo definido'}");
  s=s.replace(/<span>\$\{h\.date\}<\/span>/g,'<span>${sfpDatePt(h.date)}</span>');

  write(path,s);
}

// ---- Accessibility, privacy coverage, modal contract, live feedback ----
{
  const path='app/src/main/assets/www/ui-hardening.js';
  let s=read(path);
  if(!s.includes('__SFP_AUDIT_WAVE1__')){
    const block=`
  const __SFP_AUDIT_WAVE1__=true;
  const MONEY_TEXT_RE=/(?:[-−+]\\s*)?R\\$[\\s\\u00a0]*(?:(?:\\d{1,3}(?:\\.\\d{3})+)|\\d+)(?:,\\d{2})?/;

  function installLiveFeedback(){
    const sync=el=>{
      if(!el)return;
      const urgent=/error|danger|negative|falha|erro/i.test(el.className+' '+(el.textContent||''));
      el.setAttribute('role',urgent?'alert':'status');
      el.setAttribute('aria-live',urgent?'assertive':'polite');
      el.setAttribute('aria-atomic','true');
    };
    const toast=document.getElementById('toast'),feedback=document.getElementById('feedbackCard');
    sync(toast);sync(feedback);
    [toast,feedback].filter(Boolean).forEach(el=>new MutationObserver(()=>sync(el)).observe(el,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']}));
  }

  function installGlobalSearchA11y(){
    const input=document.getElementById('globalSearch'),list=document.getElementById('globalResults');
    if(!input||!list||input.dataset.sfpCombobox==='1')return;
    input.dataset.sfpCombobox='1';
    input.setAttribute('role','combobox');
    input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-controls','globalResults');
    input.setAttribute('aria-haspopup','listbox');
    list.setAttribute('role','listbox');
    list.setAttribute('aria-label','Resultados da busca global');
    list.setAttribute('aria-live','polite');
    let active=-1;
    const items=()=>Array.from(list.querySelectorAll('.item'));
    const sync=()=>{
      const rows=items();
      rows.forEach((el,i)=>{el.id=\`globalSearchOption-\${i}\`;el.setAttribute('role','option');el.tabIndex=-1;el.setAttribute('aria-selected',String(i===active));});
      const expanded=!list.classList.contains('hidden')&&rows.length>0;
      input.setAttribute('aria-expanded',String(expanded));
      if(!expanded){active=-1;input.removeAttribute('aria-activedescendant');}
      else if(active>=rows.length)active=rows.length-1;
    };
    const activate=index=>{
      const rows=items(); if(!rows.length)return;
      active=(index+rows.length)%rows.length;
      rows.forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));
      input.setAttribute('aria-activedescendant',rows[active].id);
      rows[active].scrollIntoView({block:'nearest'});
    };
    input.addEventListener('keydown',event=>{
      const rows=items();
      if(event.key==='ArrowDown'&&rows.length){event.preventDefault();activate(active<0?0:active+1);}
      else if(event.key==='ArrowUp'&&rows.length){event.preventDefault();activate(active<0?rows.length-1:active-1);}
      else if(event.key==='Enter'&&active>=0&&rows[active]){event.preventDefault();rows[active].click();}
      else if(event.key==='Escape'&&!list.classList.contains('hidden')){event.preventDefault();list.classList.add('hidden');sync();}
    });
    input.addEventListener('input',()=>requestAnimationFrame(sync));
    list.addEventListener('click',()=>requestAnimationFrame(sync));
    new MutationObserver(sync).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    sync();
  }

  function installPrivacyCoverage(){
    if(document.documentElement.dataset.sfpPrivacyCoverage==='1')return;
    document.documentElement.dataset.sfpPrivacyCoverage='1';
    let scheduled=false;
    const privacy=()=>!!window.state?.settings?.privacy;
    const ownText=el=>Array.from(el.childNodes||[]).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.nodeValue||'').join(' ');
    const financialInput=el=>{
      if(!(el instanceof HTMLInputElement))return false;
      const probe=\`${'${el.id||\'\'} ${el.name||\'\'} ${el.getAttribute(\'aria-label\')||\'\'} ${el.closest(\'label\')?.textContent||\'\'}'}\`;
      return /amount|valor|saldo|balance|limite|limit|fatura|parcela|payment|aporte|meta|principal|total|initial|inicial/i.test(probe);
    };
    const scan=()=>{
      scheduled=false; const on=privacy();
      const toggle=document.getElementById('privacyToggle');
      if(toggle){
        toggle.setAttribute('aria-pressed',String(on));
        toggle.setAttribute('aria-label',on?'Mostrar valores financeiros':'Ocultar valores financeiros');
        toggle.setAttribute('title',on?'Mostrar valores financeiros':'Ocultar valores financeiros');
      }
      document.querySelectorAll('body *').forEach(el=>{
        if(el.matches('script,style,svg,path,option'))return;
        const text=ownText(el);
        if(MONEY_TEXT_RE.test(text))el.dataset.sfpMoneyAuto='1';
        if(el.dataset.sfpMoneyAuto==='1')el.classList.toggle('private-value',on);
        if(financialInput(el)){
          el.dataset.sfpFinancialInput='1';
          if(document.activeElement!==el)el.classList.toggle('private-value',on);
        }
      });
    };
    const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(scan);};
    document.addEventListener('focusin',event=>{if(event.target?.dataset?.sfpFinancialInput==='1')event.target.classList.remove('private-value');});
    document.addEventListener('focusout',event=>{if(event.target?.dataset?.sfpFinancialInput==='1'&&privacy())event.target.classList.add('private-value');});
    const original=window.applyPrivacy;
    if(typeof original==='function'&&!original.__sfpPrivacyCoverage){
      const wrapped=function(){const out=original.apply(this,arguments);schedule();return out;};
      wrapped.__sfpPrivacyCoverage=true;window.applyPrivacy=wrapped;
    }
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
    document.getElementById('privacyToggle')?.addEventListener('click',schedule);
    scan();
  }

  function installSecondaryModalManager(){
    if(document.documentElement.dataset.sfpModalManager==='1')return;
    document.documentElement.dataset.sfpModalManager='1';
    const openers=new Map();
    const candidates=()=>Array.from(document.querySelectorAll('.modalback:not(.hidden) .modal,[role="dialog"][aria-modal="true"],.priority-more-menu:not(.hidden),.more-menu:not(.hidden)'))
      .filter(el=>el.getClientRects().length>0&&!el.matches('.sfp-dialog'));
    const labelDialog=dialog=>{
      if(!dialog.getAttribute('role'))dialog.setAttribute('role','dialog');
      dialog.setAttribute('aria-modal','true');
      if(!dialog.getAttribute('aria-label')&&!dialog.getAttribute('aria-labelledby')){
        const heading=dialog.querySelector('h1,h2,h3,.head h2,.head h3');
        if(heading){if(!heading.id)heading.id=\`sfpModalTitle-\${++dialogLayerSeq}\`;dialog.setAttribute('aria-labelledby',heading.id);}
        else dialog.setAttribute('aria-label','Diálogo do SFP');
      }
    };
    const enhance=()=>{
      const visible=new Set(candidates());
      for(const dialog of visible){
        labelDialog(dialog);
        if(!openers.has(dialog)){
          const opener=document.activeElement&&!dialog.contains(document.activeElement)?document.activeElement:null;
          openers.set(dialog,opener);
          requestAnimationFrame(()=>{if(dialog.isConnected&&!dialog.contains(document.activeElement)){const first=focusables(dialog)[0];(first||dialog).focus?.({preventScroll:true});}});
        }
      }
      for(const [dialog,opener] of Array.from(openers.entries())){
        if(visible.has(dialog)&&dialog.isConnected)continue;
        openers.delete(dialog);
        requestAnimationFrame(()=>opener?.isConnected&&opener.focus?.({preventScroll:true}));
      }
    };
    window.addEventListener('keydown',event=>{
      const visible=candidates(),dialog=visible[visible.length-1]; if(!dialog)return;
      if(trapTab(event,dialog))return;
      if(event.key!=='Escape')return;
      event.preventDefault();event.stopPropagation();
      const closer=dialog.querySelector('#closeDetail,#closeProgressive,[data-close],.sfp-dialog-close,.icon-button[aria-label*="Fechar"],button[aria-label*="Fechar"],button[title*="Fechar"]');
      if(closer){closer.click();return;}
      const overlay=dialog.closest('#modalRoot,.modalback');
      if(overlay){overlay.classList.add('hidden');if(overlay.id==='modalRoot')overlay.innerHTML='';enhance();}
      else {dialog.classList.add('hidden');enhance();}
    },true);
    new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
    enhance();
  }

`;
    s=replaceOnce(s,'  function install(){',block+'  function install(){','ui hardening wave1 block');
    s=replaceOnce(s,
      '    installPseudoButtonKeyboard();\n',
      '    installPseudoButtonKeyboard();\n    installLiveFeedback();\n    installGlobalSearchA11y();\n    installPrivacyCoverage();\n    installSecondaryModalManager();\n',
      'ui hardening wave1 install calls');
  }
  write(path,s);
}

console.log('audit wave1 patches applied');
