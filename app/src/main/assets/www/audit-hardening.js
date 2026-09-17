(function(){
  'use strict';
  if(window.__SFP_AUDIT_HARDENING_INSTALLED) return;
  window.__SFP_AUDIT_HARDENING_INSTALLED = true;

  const MONEY_TEXT_RE = /(?:[-−+]\s*)?R\$[\s\u00a0]*(?:(?:\d{1,3}(?:\.\d{3})+)|\d+)(?:,\d{2})?/;
  let modalSeq = 0;

  function visible(el){
    return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function focusables(root){
    if(!root) return [];
    return Array.from(root.querySelectorAll(
      'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]):not([aria-hidden="true"]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(visible);
  }

  function trapTab(event, dialog){
    if(event.key !== 'Tab') return false;
    const items = focusables(dialog);
    if(!items.length){
      event.preventDefault();
      if(!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
      dialog.focus();
      return true;
    }
    const first = items[0], last = items[items.length - 1], active = document.activeElement;
    if(event.shiftKey && (active === first || !dialog.contains(active))){
      event.preventDefault(); last.focus(); return true;
    }
    if(!event.shiftKey && (active === last || !dialog.contains(active))){
      event.preventDefault(); first.focus(); return true;
    }
    return false;
  }

  function installOfxCreditSemantics(){
    const original = window.parseOFX;
    if(typeof original !== 'function' || original.__sfpOfxCreditSemantics) return;

    const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const readTag = (block, name) => {
      const match = String(block || '').match(new RegExp(`<${name}>\\s*([^<\\r\\n]+)`, 'i'));
      return match ? match[1].trim() : '';
    };
    const paymentHint = desc => /\b(pagamento recebido|pagamento da fatura|pagamento de fatura|payment received|pagamento cartao)\b/.test(normalize(desc));

    const wrapped = function(text){
      const rows = original.apply(this, arguments);
      if(!Array.isArray(rows) || !text) return rows;

      const blocks = String(text).match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || String(text).split(/<STMTTRN>/i).slice(1);
      const typeByFitid = new Map();
      for(const block of blocks){
        const fitid = readTag(block, 'FITID');
        const type = readTag(block, 'TRNTYPE').toUpperCase();
        if(fitid && type) typeByFitid.set(fitid, type);
      }

      for(const row of rows){
        const type = typeByFitid.get(String(row.fitid || '').trim());
        if(!type) continue;
        row.ofxType = type;
        if(type !== 'CREDIT') continue;

        const semanticHint = typeof window.invoiceSemanticHint === 'function' ? window.invoiceSemanticHint(row.desc) : null;
        row.invoiceKind = semanticHint === 'payment' || paymentHint(row.desc) ? 'payment' : 'credit';
        row.extractionConfidence = 1;
      }
      return rows;
    };

    wrapped.__sfpOfxCreditSemantics = true;
    window.parseOFX = wrapped;
  }

  function installLiveFeedback(){
    const sync = el => {
      if(!el) return;
      const urgent = /error|danger|negative|falha|erro/i.test(`${el.className} ${el.textContent || ''}`);
      el.setAttribute('role', urgent ? 'alert' : 'status');
      el.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
      el.setAttribute('aria-atomic', 'true');
    };
    const nodes = [document.getElementById('toast'), document.getElementById('feedbackCard')].filter(Boolean);
    nodes.forEach(el => {
      sync(el);
      new MutationObserver(() => sync(el)).observe(el, {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class']
      });
    });
  }

  function installGlobalSearchA11y(){
    const input = document.getElementById('globalSearch');
    const list = document.getElementById('globalResults');
    if(!input || !list || input.dataset.sfpCombobox === '1') return;

    input.dataset.sfpCombobox = '1';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'globalResults');
    input.setAttribute('aria-haspopup', 'listbox');
    if(!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')){
      input.setAttribute('aria-label', 'Buscar em todo o SFP');
    }
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Resultados da busca global');
    list.setAttribute('aria-live', 'polite');
    list.setAttribute('aria-relevant', 'additions text');

    let active = -1;
    const items = () => Array.from(list.querySelectorAll('.item'));

    function sync(){
      const rows = items();
      rows.forEach((el, index) => {
        el.id = `globalSearchOption-${index}`;
        el.setAttribute('role', 'option');
        el.tabIndex = -1;
        el.setAttribute('aria-selected', String(index === active));
      });
      const expanded = !list.classList.contains('hidden') && rows.length > 0;
      input.setAttribute('aria-expanded', String(expanded));
      if(!expanded){
        active = -1;
        input.removeAttribute('aria-activedescendant');
      }else if(active >= rows.length){
        active = rows.length - 1;
      }
    }

    function activate(index){
      const rows = items();
      if(!rows.length) return;
      active = (index + rows.length) % rows.length;
      rows.forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', rows[active].id);
      rows[active].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('keydown', event => {
      const rows = items();
      if(event.key === 'ArrowDown' && rows.length){
        event.preventDefault(); activate(active < 0 ? 0 : active + 1);
      }else if(event.key === 'ArrowUp' && rows.length){
        event.preventDefault(); activate(active < 0 ? rows.length - 1 : active - 1);
      }else if(event.key === 'Enter' && active >= 0 && rows[active]){
        event.preventDefault(); rows[active].click();
      }else if(event.key === 'Escape' && !list.classList.contains('hidden')){
        event.preventDefault();
        list.classList.add('hidden');
        sync();
      }
    });

    input.addEventListener('input', () => requestAnimationFrame(sync));
    list.addEventListener('click', () => requestAnimationFrame(sync));
    new MutationObserver(sync).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
  }

  function installPrivacyCoverage(){
    if(document.documentElement.dataset.sfpPrivacyCoverage === '1') return;
    document.documentElement.dataset.sfpPrivacyCoverage = '1';

    let scheduled = false;
    const privacyOn = () => !!window.state?.settings?.privacy;
    const ownText = el => Array.from(el.childNodes || [])
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.nodeValue || '')
      .join(' ');

    function financialInput(el){
      if(!(el instanceof HTMLInputElement)) return false;
      const probe = [
        el.id || '', el.name || '', el.getAttribute('aria-label') || '', el.closest('label')?.textContent || ''
      ].join(' ');
      return /amount|valor|saldo|balance|limite|limit|fatura|parcela|payment|aporte|meta|principal|total|initial|inicial/i.test(probe);
    }

    function scan(){
      scheduled = false;
      const on = privacyOn();
      const toggle = document.getElementById('privacyToggle');
      if(toggle){
        toggle.setAttribute('aria-pressed', String(on));
        toggle.setAttribute('aria-label', on ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros');
        toggle.setAttribute('title', on ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros');
      }

      document.querySelectorAll('body *').forEach(el => {
        if(el.matches('script,style,svg,path,option')) return;
        if(MONEY_TEXT_RE.test(ownText(el))) el.dataset.sfpMoneyAuto = '1';
        if(el.dataset.sfpMoneyAuto === '1') el.classList.toggle('private-value', on);

        if(financialInput(el)){
          el.dataset.sfpFinancialInput = '1';
          if(document.activeElement !== el) el.classList.toggle('private-value', on);
        }
      });
    }

    function schedule(){
      if(scheduled) return;
      scheduled = true;
      requestAnimationFrame(scan);
    }

    document.addEventListener('focusin', event => {
      if(event.target?.dataset?.sfpFinancialInput === '1') event.target.classList.remove('private-value');
    });
    document.addEventListener('focusout', event => {
      if(event.target?.dataset?.sfpFinancialInput === '1' && privacyOn()) event.target.classList.add('private-value');
    });

    const original = window.applyPrivacy;
    if(typeof original === 'function' && !original.__sfpPrivacyCoverage){
      const wrapped = function(){
        const output = original.apply(this, arguments);
        schedule();
        return output;
      };
      wrapped.__sfpPrivacyCoverage = true;
      window.applyPrivacy = wrapped;
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
    document.getElementById('privacyToggle')?.addEventListener('click', schedule);
    scan();
  }

  function installSecondaryModalManager(){
    if(document.documentElement.dataset.sfpModalManager === '1') return;
    document.documentElement.dataset.sfpModalManager = '1';
    const openers = new Map();

    const candidates = () => Array.from(document.querySelectorAll(
      '.modalback:not(.hidden) .modal,[role="dialog"][aria-modal="true"],.priority-more-menu:not(.hidden),.more-menu:not(.hidden)'
    )).filter(el => visible(el) && !el.matches('.sfp-dialog'));

    function labelDialog(dialog){
      if(!dialog.getAttribute('role')) dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      if(!dialog.getAttribute('aria-label') && !dialog.getAttribute('aria-labelledby')){
        const heading = dialog.querySelector('h1,h2,h3,.head h2,.head h3');
        if(heading){
          if(!heading.id) heading.id = `sfpModalTitle-${++modalSeq}`;
          dialog.setAttribute('aria-labelledby', heading.id);
        }else{
          dialog.setAttribute('aria-label', 'Diálogo do SFP');
        }
      }
    }

    function enhance(){
      const visibleDialogs = new Set(candidates());
      for(const dialog of visibleDialogs){
        labelDialog(dialog);
        if(!openers.has(dialog)){
          const opener = document.activeElement && !dialog.contains(document.activeElement) ? document.activeElement : null;
          openers.set(dialog, opener);
          requestAnimationFrame(() => {
            if(dialog.isConnected && !dialog.contains(document.activeElement)){
              const first = focusables(dialog)[0];
              if(first) first.focus({ preventScroll: true });
              else { dialog.tabIndex = -1; dialog.focus({ preventScroll: true }); }
            }
          });
        }
      }

      for(const [dialog, opener] of Array.from(openers.entries())){
        if(visibleDialogs.has(dialog) && dialog.isConnected) continue;
        openers.delete(dialog);
        requestAnimationFrame(() => opener?.isConnected && opener.focus?.({ preventScroll: true }));
      }
    }

    window.addEventListener('keydown', event => {
      const visibleDialogs = candidates();
      const dialog = visibleDialogs[visibleDialogs.length - 1];
      if(!dialog) return;
      if(trapTab(event, dialog)) return;
      if(event.key !== 'Escape') return;

      event.preventDefault();
      event.stopPropagation();
      const closer = dialog.querySelector(
        '#closeDetail,#closeProgressive,[data-close],.sfp-dialog-close,.icon-button[aria-label*="Fechar"],button[aria-label*="Fechar"],button[title*="Fechar"]'
      );
      if(closer){ closer.click(); return; }

      const overlay = dialog.closest('#modalRoot,.modalback');
      if(overlay){
        overlay.classList.add('hidden');
        if(overlay.id === 'modalRoot') overlay.innerHTML = '';
      }else{
        dialog.classList.add('hidden');
      }
      enhance();
    }, true);

    new MutationObserver(enhance).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden']
    });
    enhance();
  }

  function installNotificationPermissionStatus(){
    if(!window.AndroidBridge || typeof AndroidBridge.getNotificationPermissionState !== 'function') return;
    const host = document.querySelector('#configuracoes .panel, #settings .panel, [data-page="configuracoes"] .panel');
    if(!host || document.getElementById('androidNotificationPermissionStatus')) return;
    let stateValue = 'unknown';
    try { stateValue = AndroidBridge.getNotificationPermissionState(); } catch(_){ return; }
    const labels = {
      granted: 'Notificações do Android: permitidas',
      denied: 'Notificações do Android: permissão não concedida',
      disabled: 'Notificações do Android: desativadas no sistema',
      not_required: 'Notificações do Android: disponíveis'
    };
    const row = document.createElement('p');
    row.id = 'androidNotificationPermissionStatus';
    row.className = 'field-help';
    row.setAttribute('role','status');
    row.textContent = labels[stateValue] || 'Notificações do Android: estado indisponível';
    host.appendChild(row);
  }

  function installDebtSchemaCompatibility(){
    const original = window.save;
    if(typeof original !== 'function' || original.__sfpDebtSchemaCompatibility) return;
    const wrapped = async function(){
      if(typeof state !== 'undefined' && Array.isArray(state?.debts)){
        for(const debt of state.debts){
          if(debt?.amortizationMethod !== 'contract-total' && debt?.rateKnown === true){
            delete debt.rateKnown;
          }
        }
      }
      return original.apply(this, arguments);
    };
    wrapped.__sfpDebtSchemaCompatibility = true;
    window.save = wrapped;
  }

  function installInvoiceInstallmentProjection(){
    const prepareOriginal=window.prepareCardImport;
    const matchOriginal=window.existingInvoiceImportMatch;
    const attachOriginal=window.attachInvoiceImportKey;
    const installmentOriginal=window.purchaseInstallment;
    const natureOriginal=window.cardImportNatureLabel;
    const normalizeOriginal=window.normalize;
    if(typeof prepareOriginal!=='function'||prepareOriginal.__sfpFutureInstallments||typeof matchOriginal!=='function'||typeof attachOriginal!=='function'||typeof installmentOriginal!=='function')return;

    const roundMoney=value=>Math.round((Number(value)||0)*100)/100;
    const validMonth=value=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(value||''));
    const monthDistance=(start,end)=>{
      if(!validMonth(start)||!validMonth(end))return null;
      let current=start;
      for(let distance=0;distance<=120;distance++){
        if(current===end)return distance;
        current=monthAdd(current,1);
      }
      return null;
    };
    const merchant=value=>{
      if(typeof window.invoiceMerchantIdentity==='function')return window.invoiceMerchantIdentity(value);
      return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(?:parcela\s*)?\d+\s*(?:\/|de)\s*\d+\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
    };
    const documentInstallment=row=>{
      const marker=row?.sfpDocumentInstallment||row?.documentInstallment;
      if(Number.isInteger(Number(marker?.installment))&&Number.isInteger(Number(marker?.installments)))return{installment:Number(marker.installment),installments:Number(marker.installments)};
      if(row?.authoritativeInstallmentPlan&&Number.isInteger(Number(row.installment))&&Number.isInteger(Number(row.installments)))return{installment:Number(row.installment),installments:Number(row.installments)};
      return null;
    };
    const legacyProjectionInfo=p=>{
      const marker=p?.documentInstallment,current=Math.trunc(Number(marker?.installment)),total=Math.trunc(Number(marker?.installments));
      const schedule=Array.isArray(p?.installmentSchedule)?p.installmentSchedule:null;
      const amount=roundMoney(schedule?.length===1?schedule[0]:p?.total);
      if(marker?.projection!=='not-inferred'||Number(p?.installments)!==1||!validMonth(p?.firstMonth)||!Number.isInteger(current)||!Number.isInteger(total)||current<1||total<2||current>=total||total>120||!(amount>0))return null;
      return{current,total,amount,remaining:total-current+1};
    };
    const promoteLegacyPurchase=p=>{
      const legacy=legacyProjectionInfo(p);if(!legacy)return false;
      p.total=roundMoney(legacy.amount*legacy.remaining);
      p.installments=legacy.remaining;
      p.installmentSchedule=Array(legacy.remaining).fill(legacy.amount);
      p.documentInstallment={installment:legacy.current,installments:legacy.total,projection:'estimated-current-value'};
      const suffix='Parcelas futuras estimadas a partir do valor documental já importado; uma fatura posterior pode refinar a projeção.';
      const note=String(p.note||'').trim();if(!note.includes(suffix))p.note=note?`${note} ${suffix}`:suffix;
      return true;
    };
    const promoteLegacyState=()=>{
      if(typeof state==='undefined'||!Array.isArray(state?.purchases))return false;
      let changed=false;for(const purchase of state.purchases)changed=promoteLegacyPurchase(purchase)||changed;return changed;
    };
    const makeEstimatedInput=row=>{
      if(!row||row.authoritativeInstallmentPlan||!row.currentChargeOnly)return row;
      const current=Math.trunc(Number(row.installment)),total=Math.trunc(Number(row.installments)),amount=roundMoney(Math.abs(Number(row.amount)||0));
      if(!Number.isInteger(current)||!Number.isInteger(total)||current<1||total<2||current>total||total>120||!(amount>0))return row;
      const remaining=total-current+1;
      return{...row,currentChargeOnly:false,installment:1,installments:remaining,installmentSchedule:Array(remaining).fill(amount),authoritativeInstallmentPlan:true,sfpEstimatedInstallmentProjection:true,sfpDocumentInstallment:{installment:current,installments:total}};
    };

    if(typeof normalizeOriginal==='function'&&!normalizeOriginal.__sfpFutureInstallmentMigration){
      const normalizeWrapped=function(){
        const output=normalizeOriginal.apply(this,arguments);
        promoteLegacyState();
        return output;
      };
      normalizeWrapped.__sfpFutureInstallmentMigration=true;
      window.normalize=normalizeWrapped;
    }

    const matchWrapped=function(cardId,row,reserved=new Set()){
      const direct=matchOriginal.apply(this,arguments);
      if(direct||row?.kind!=='purchase'||typeof state==='undefined'||!Array.isArray(state?.purchases))return direct;
      const doc=documentInstallment(row),invoiceMonth=row.invoiceMonth||row.targetMonth||row.firstMonth;
      if(!doc||!validMonth(invoiceMonth)||doc.installments<2)return null;
      const candidate=state.purchases.find(p=>{
        const saved=p?.documentInstallment;
        if(p?.cardId!==cardId||Number(saved?.installments)!==doc.installments)return false;
        if(merchant(p.desc)!==merchant(row.desc))return false;
        if(p.purchaseDate&&row.date&&p.purchaseDate!==row.date)return false;
        if(saved?.projection==='estimated-current-value'){
          const distance=monthDistance(p.firstMonth,invoiceMonth);
          return distance!=null&&Number(saved.installment)+distance===doc.installment&&!reserved.has(`purchase:${p.id}`);
        }
        if(saved?.projection==='not-inferred'){
          return Number(p.installments)===1&&p.firstMonth===invoiceMonth&&Number(saved.installment)===doc.installment&&Math.abs(roundMoney(p.total)-roundMoney(Math.abs(Number(row.amount)||0)))<.01&&!reserved.has(`purchase:${p.id}`);
        }
        return false;
      });
      return candidate?{source:'purchase',id:candidate.id,token:`purchase:${candidate.id}`,legacy:false,crossSource:true,projectionReconcile:true,legacyProjection:candidate.documentInstallment?.projection==='not-inferred'}:null;
    };
    matchWrapped.__sfpFutureInstallments=true;
    window.existingInvoiceImportMatch=matchWrapped;

    const applyVerifiedPlan=(p,row)=>{
      if(!row?.authoritativeInstallmentPlan||!Array.isArray(row.installmentSchedule)||row.installmentSchedule.length!==Number(row.installments))return false;
      p.total=roundMoney(row.total);
      p.installments=Number(row.installments);
      p.firstMonth=row.firstMonth;
      p.installmentSchedule=row.installmentSchedule.map(roundMoney);
      p.documentInstallment={installment:Number(row.installment)||1,installments:Number(row.installments),projection:'document-verified'};
      p.note='Projeção de parcelas futuras substituída pelo cronograma conferido do documento.';
      if(String(p.importSource||'').includes('image'))p.importSource='image-ocr+document';
      else if(row.importSource)p.importSource=row.importSource;
      return true;
    };

    const attachWrapped=function(match,key,row=null){
      let changed=attachOriginal.apply(this,arguments);
      if(!match||match.source!=='purchase'||!row||typeof state==='undefined')return changed;
      const p=state.purchases.find(item=>String(item.id)===String(match.id));
      if(!p)return changed;

      if(p.documentInstallment?.projection==='not-inferred'){
        if(row.sfpEstimatedInstallmentProjection)changed=promoteLegacyPurchase(p)||changed;
        else if(applyVerifiedPlan(p,row))return true;
      }
      if(p.documentInstallment?.projection!=='estimated-current-value')return changed;

      if(row.authoritativeInstallmentPlan&&!row.sfpEstimatedInstallmentProjection&&applyVerifiedPlan(p,row))return true;

      if(row.sfpEstimatedInstallmentProjection){
        const invoiceMonth=row.invoiceMonth||row.targetMonth||row.firstMonth,distance=monthDistance(p.firstMonth,invoiceMonth),observed=roundMoney(Math.abs(Number(row.amount)||0));
        if(distance!=null&&distance>=0&&distance<Number(p.installments)&&observed>0){
          const currentSchedule=Array.isArray(p.installmentSchedule)&&p.installmentSchedule.length===Number(p.installments)?p.installmentSchedule.map(roundMoney):null;
          if(currentSchedule){
            const next=[...currentSchedule];for(let index=distance;index<next.length;index++)next[index]=observed;
            const nextTotal=roundMoney(next.reduce((sum,value)=>sum+value,0));
            const differs=next.some((value,index)=>Math.abs(value-currentSchedule[index])>.009)||Math.abs(nextTotal-Number(p.total||0))>.009;
            if(differs){
              p.installmentSchedule=next;p.total=nextTotal;
              p.note=`Projeção de parcelas futuras atualizada pela fatura de ${invoiceMonth}; meses seguintes usam o último valor observado até nova confirmação.`;
              changed=true;
            }
          }
        }
      }
      return changed;
    };
    attachWrapped.__sfpFutureInstallments=true;
    window.attachInvoiceImportKey=attachWrapped;

    const installmentWrapped=function(p,m){
      const result=installmentOriginal.apply(this,arguments);
      const doc=p?.documentInstallment;
      if(!result||doc?.projection!=='estimated-current-value')return result;
      const base=Math.trunc(Number(doc.installment)),total=Math.trunc(Number(doc.installments));
      if(!Number.isInteger(base)||!Number.isInteger(total)||base<1||total<base)return result;
      return{...result,n:base+result.n-1,total,projectionEstimate:true};
    };
    installmentWrapped.__sfpFutureInstallments=true;
    window.purchaseInstallment=installmentWrapped;

    if(typeof natureOriginal==='function'){
      const natureWrapped=function(r,options){
        const label=natureOriginal.apply(this,arguments);
        return r?.documentInstallment?.projection==='estimated-current-value'?String(label).replace('(só a cobrança atual)','(futuras estimadas pelo valor atual)'):label;
      };
      natureWrapped.__sfpFutureInstallments=true;
      window.cardImportNatureLabel=natureWrapped;
    }

    const prepareWrapped=function(rows){
      const projected=Array.isArray(rows)?rows.map(makeEstimatedInput):rows;
      if(Array.isArray(projected)&&rows&&Object.prototype.hasOwnProperty.call(rows,'invalid'))projected.invalid=rows.invalid;
      const args=[...arguments];args[0]=projected;
      const result=prepareOriginal.apply(this,args);
      if(typeof cardImportDraft!=='undefined'&&cardImportDraft?.rows){
        let changed=false;
        for(const row of cardImportDraft.rows){
          if(!row.sfpEstimatedInstallmentProjection)continue;
          const doc=row.sfpDocumentInstallment;
          row.authoritativeInstallmentPlan=false;
          row.documentInstallment={installment:Number(doc?.installment)||1,installments:Number(doc?.installments)||Number(row.installments),projection:'estimated-current-value'};
          row.projectionEstimate=true;
          changed=true;
        }
        if(changed&&typeof renderCardImportDraft==='function')renderCardImportDraft();
      }
      return result;
    };
    prepareWrapped.__sfpFutureInstallments=true;
    window.prepareCardImport=prepareWrapped;
  }

  function installAuditIntegrityRepair(){
    if(window.__SFP_SAFE_AUDIT_REPAIR_V1) return;
    const originalAuditData=window.auditData;
    const originalRenderAudit=window.renderAudit;
    if(typeof originalAuditData!=='function'||typeof originalRenderAudit!=='function')return;
    window.__SFP_SAFE_AUDIT_REPAIR_V1=true;

    const roundMoney=value=>Math.round((Number(value)||0)*100)/100;
    const monthNow=()=>{
      if(typeof localCivilMonth==='function')return localCivilMonth();
      const d=new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    };
    const invoiceById=id=>(state.invoices||[]).find(inv=>String(inv.id)===String(id));
    const cardName=inv=>card(inv?.cardId)?.name||inv?.cardId||'cartão';

    const sameEntityId=(a,b)=>String(a)===String(b);

    function invoiceHasLocalDetail(inv){
      if(!inv)return false;
      let purchaseRows=[];
      try{
        purchaseRows=typeof installments==='function'
          ?(installments(inv.month)||[]).filter(row=>sameEntityId(row?.card?.id??row?.purchase?.cardId,inv.cardId))
          :[];
      }catch(_){purchaseRows=[]}
      let adjustments=[];
      try{adjustments=typeof invoiceAdjustments==='function'?(invoiceAdjustments(inv.cardId,inv.month)||[]):[]}catch(_){adjustments=[]}
      const imports=(state.invoiceImports||[]).filter(row=>sameEntityId(row?.cardId,inv.cardId)&&[row?.month,row?.invoiceMonth,row?.targetMonth].includes(inv.month));
      const importedRows=imports.some(row=>Number(row?.count??row?.importedCount??row?.created??0)>0);
      return purchaseRows.length>0||adjustments.length>0||importedRows;
    }

    function openFinanceOfficialWithoutLocalDetail(inv){
      if(!inv)return false;
      const official=Number(inv.officialTotal);
      const calc=Number(invoiceCalculated(inv.cardId,inv.month))||0;
      const authoritative=String(inv.officialTotalSource||'').trim()==='open-finance-bill'||Boolean(String(inv.openFinanceBillId||'').trim());
      return authoritative&&Number.isFinite(official)&&official>0&&Math.abs(calc)<=.01&&!invoiceHasLocalDetail(inv);
    }

    function duplicateTransactionGroups(){
      const groups=new Map();
      for(const tx of state.transactions||[]){
        const key=String(tx?.id);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(tx);
      }
      return Array.from(groups.entries()).filter(([,rows])=>rows.length>1).map(([id,rows])=>({id,rows}));
    }

    function transactionReferencePaths(id){
      const hits=[],seen=new Set(),target=String(id);
      const visit=(value,path)=>{
        if(!value||typeof value!=='object'||seen.has(value))return;
        seen.add(value);
        if(Array.isArray(value)){
          value.forEach((child,index)=>visit(child,`${path}[${index}]`));
          return;
        }
        for(const [key,child] of Object.entries(value)){
          const next=path?`${path}.${key}`:key;
          if(/transaction.*id/i.test(key)&&child!==null&&child!==undefined&&String(child)===target)hits.push(next);
          if(child&&typeof child==='object')visit(child,next);
        }
      };
      for(const [key,value] of Object.entries(state||{})){
        if(key==='transactions')continue;
        visit(value,key);
      }
      return hits;
    }

    function duplicateTransactionPlans(){
      return duplicateTransactionGroups().map(group=>({...group,references:transactionReferencePaths(group.id)}));
    }

    function safeDuplicateTransactionPlans(){
      return duplicateTransactionPlans().filter(group=>group.references.length===0);
    }

    function nextUniqueTransactionId(used){
      let candidate=Date.now();
      while(used.has(String(candidate)))candidate++;
      used.add(String(candidate));
      return candidate;
    }

    function historicalRepairPlan(inv){
      if(!inv||inv.historicalOnly)return null;
      const official=Number(inv.officialTotal);
      const paid=Number(inv.paidAmount)||0;
      const calc=Number(invoiceCalculated(inv.cardId,inv.month))||0;
      if(!Number.isFinite(official)||official<=0||Math.abs(official-paid)>.01)return null;
      const payments=Array.isArray(inv.payments)?inv.payments:[];
      const neutralEvidence=payments.length>0&&payments.every(p=>p&&p.balanceImpact===false&&(Number(p.amount)||0)>0);
      if(!neutralEvidence)return null;
      const sourceEvidence=payments.every(p=>String(p.sourceDesc||p.source||'').trim());
      if(calc<=.01&&sourceEvidence){
        return{mode:'placeholder',official:roundMoney(official),paid:roundMoney(paid),calc:roundMoney(calc)};
      }
      const month=String(inv.month||'');
      const settledStatus=inv.status==='paid'||inv.status==='closed';
      if(!settledStatus||!/^\d{4}-\d{2}$/.test(month)||month>=monthNow())return null;
      if(calc<=.01||Math.abs(calc-official)<=.01)return null;
      return{mode:'partial-history',official:roundMoney(official),paid:roundMoney(paid),calc:roundMoney(calc)};
    }

    function safeRows(){
      return(state.invoices||[]).map(inv=>({inv,plan:historicalRepairPlan(inv)})).filter(row=>row.plan);
    }

    function criticalSolution(issue){
      if(issue?.solution||issue?.level!=='critical')return issue?.solution||'';
      const text=String(issue?.text||'');
      if(issue?.type==='orphan-reference')return 'Não apague registros no escuro. Exporte o diagnóstico e refaça o vínculo com a conta ou cartão correto.';
      if(/ID duplicado/i.test(text))return 'Exporte o diagnóstico antes de alterar. IDs são chaves internas e precisam ser reconciliados sem apagar histórico financeiro.';
      if(/valor inválido/i.test(text))return 'Abra o lançamento correspondente e corrija o valor para um número positivo; se veio de importação, confira também a origem.';
      if(/parcelas inválidas/i.test(text))return 'Abra a compra e defina pelo menos 1 parcela, preservando o valor total e a data original.';
      if(/saldo negativo/i.test(text))return 'Revise o contrato e o histórico da dívida antes de ajustar o saldo devedor.';
      if(/limite inválido/i.test(text))return 'Revise o orçamento da categoria e informe um limite maior que zero.';
      return 'Exporte o diagnóstico antes de alterar dados. Este caso não é corrigido automaticamente porque pode afetar dinheiro ou vínculos.';
    }

    const wrappedAuditData=function(){
      const result=originalAuditData.apply(this,arguments)||{issues:[],dups:0};
      const issues=[];
      for(const raw of Array.isArray(result.issues)?result.issues:[]){
        const issue={...raw};
        const inv=issue.invoiceId!=null?invoiceById(issue.invoiceId):null;
        if(issue.type==='invoice-total-mismatch'&&openFinanceOfficialWithoutLocalDetail(inv))continue;
        if(inv?.historicalOnly&&issue.type==='invoice-total-mismatch')continue;
        const duplicateMatch=issue.level==='critical'?String(issue.text||'').match(/^ID duplicado em transactions:\s*(.+)$/i):null;
        if(duplicateMatch){
          const duplicateId=duplicateMatch[1].trim();
          const duplicatePlan=duplicateTransactionPlans().find(row=>row.id===duplicateId);
          issue.type='duplicate-transaction-id';
          issue.duplicateId=duplicateId;
          issue.solution=duplicatePlan?.references?.length
            ?`Este ID é referenciado em ${duplicatePlan.references.length} vínculo(s) interno(s). O SFP não vai reindexá-lo automaticamente; exporte o diagnóstico para revisão.`
            :'O SFP pode reindexar somente as cópias extras desse ID, preservando todos os valores e saldos.';
        }
        const plan=inv?historicalRepairPlan(inv):null;
        if(plan&&issue.type==='invoice-total-mismatch'){
          issue.type='historical-invoice-partial';
          issue.repairable=true;
          issue.text=`Fatura ${cardName(inv)} ${inv.month}: liquidada por ${brl(plan.official)}, mas o histórico local soma ${brl(plan.calc)}.`;
          issue.solution='Classifique como histórico seguro: o SFP mantém pagamento e total oficial e não altera saldo de conta.';
        }else if(plan&&issue.type==='historical-invoice-placeholder'){
          issue.repairable=true;
          issue.solution='Marque como pagamento histórico para remover o falso conflito sem inventar compras ou alterar saldo.';
        }else if(!issue.solution){
          issue.solution=criticalSolution(issue);
        }
        issues.push(issue);
      }
      return{...result,issues,critical:issues.filter(i=>i.level==='critical').length,warnings:issues.filter(i=>i.level==='warning').length};
    };
    wrappedAuditData.__sfpSafeHistoricalRepair=true;
    window.auditData=wrappedAuditData;

    function applyHistoricalRepair(inv,plan){
      inv.historicalOnly=true;
      inv.historicalRepairMode=plan.mode;
      inv.historicalRepairAt=new Date().toISOString();
      if(plan.mode==='placeholder')inv.officialTotal=null;
    }

    function balancesSnapshot(){
      return(state.accounts||[]).map(a=>[String(a.id),Math.round((Number(accountBalance(a.id))||0)*100)]).sort((a,b)=>a[0].localeCompare(b[0]));
    }

    function sameBalances(a,b){
      return a.length===b.length&&a.every((row,index)=>row[0]===b[index][0]&&row[1]===b[index][1]);
    }

    async function persistRepairs(rows,label){
      const before=balancesSnapshot();
      const backup=rows.map(({inv})=>({
        id:inv.id,
        officialTotal:inv.officialTotal,
        historicalOnly:inv.historicalOnly,
        historicalRepairMode:inv.historicalRepairMode,
        historicalRepairAt:inv.historicalRepairAt
      }));
      rows.forEach(({inv,plan})=>applyHistoricalRepair(inv,plan));
      await save(label);
      const after=balancesSnapshot();
      if(!sameBalances(before,after)){
        backup.forEach(old=>{
          const inv=invoiceById(old.id);if(!inv)return;
          if(old.officialTotal===undefined)delete inv.officialTotal;else inv.officialTotal=old.officialTotal;
          if(old.historicalOnly===undefined)delete inv.historicalOnly;else inv.historicalOnly=old.historicalOnly;
          if(old.historicalRepairMode===undefined)delete inv.historicalRepairMode;else inv.historicalRepairMode=old.historicalRepairMode;
          if(old.historicalRepairAt===undefined)delete inv.historicalRepairAt;else inv.historicalRepairAt=old.historicalRepairAt;
        });
        await save('Reverter correção de integridade por proteção de saldo');
        renderAll();
        showFeedback('A correção foi revertida porque o saldo de uma conta mudaria. Nenhum ajuste financeiro foi mantido.',{title:'Proteção de integridade',type:'error'});
        return false;
      }
      renderAll();
      return true;
    }

    window.repairHistoricalInvoice=async invoiceId=>{
      const inv=invoiceById(invoiceId),plan=historicalRepairPlan(inv);
      if(!inv||!plan)return toast('Esse registro não pode ser corrigido automaticamente com segurança.','warning');
      const partial=plan.mode==='partial-history';
      const ok=await sfpConfirm({
        title:partial?'Classificar fatura histórica':'Marcar pagamento histórico',
        message:partial
          ?`A fatura ${inv.month} está liquidada e o pagamento confere com o total oficial, mas faltam compras antigas na base. O SFP manterá o total oficial e o pagamento, marcará o ciclo como histórico e não alterará saldo. Continuar?`
          :'As compras desta fatura não estão na base. O SFP vai remover o total inferido pelo pagamento e manter o pagamento histórico, sem alterar saldo de conta. Continuar?',
        confirmText:'Corrigir registro',cancelText:'Cancelar'
      });
      if(!ok)return;
      if(await persistRepairs([{inv,plan}],'Corrigir fatura histórica com segurança')){
        showFeedback(partial?'Fatura histórica classificada sem alterar saldo, pagamento ou total oficial.':'Pagamento histórico preservado sem inventar o total da fatura.',{title:'Integridade corrigida',type:'success'});
      }
    };

    window.repairSafeHistoricalAudit=async()=>{
      const rows=safeRows();
      if(!rows.length){toast('Nenhuma inconsistência histórica pode ser corrigida automaticamente com segurança.','success');return false}
      const partial=rows.filter(row=>row.plan.mode==='partial-history').length;
      const placeholders=rows.length-partial;
      const details=[partial?`${partial} fatura(s) liquidada(s) com histórico parcial`:null,placeholders?`${placeholders} pagamento(s) histórico(s) sem compras locais`:null].filter(Boolean).join(' e ');
      const ok=await sfpConfirm({
        title:'Corrigir integridade histórica',
        message:`Foram encontrados ${details}. O SFP vai apenas classificar evidências históricas comprovadas, sem criar compras, sem apagar pagamentos e sem alterar saldos. Continuar?`,
        confirmText:`Corrigir ${rows.length} registro${rows.length===1?'':'s'}`,cancelText:'Cancelar'
      });
      if(!ok)return false;
      const done=await persistRepairs(rows,'Corrigir integridade histórica segura');
      if(done)showFeedback(`${rows.length} registro(s) histórico(s) corrigido(s) sem alterar saldos.`,{title:'Integridade corrigida',type:'success'});
      return done;
    };

    window.repairSafeDuplicateTransactionIds=async()=>{
      const allPlans=duplicateTransactionPlans();
      const rows=allPlans.filter(group=>group.references.length===0);
      if(!rows.length){
        const blocked=allPlans.length;
        toast(blocked?'Os IDs duplicados encontrados possuem referências internas e não serão alterados automaticamente.':'Nenhum ID duplicado de transação precisa de correção.','info');
        return false;
      }
      const changedCount=rows.reduce((sum,row)=>sum+Math.max(0,row.rows.length-1),0);
      const ok=await sfpConfirm({
        title:'Corrigir IDs duplicados',
        message:`O SFP encontrou ${rows.length} grupo(s) de ID duplicado sem referências ambíguas. Apenas ${changedCount} cópia(s) extra(s) receberão novos IDs internos; valores, datas, contas, descrições, saldos e quantidade de lançamentos serão preservados. Continuar?`,
        confirmText:'Corrigir IDs',cancelText:'Cancelar'
      });
      if(!ok)return false;
      const beforeBalances=balancesSnapshot(),beforeCount=(state.transactions||[]).length;
      const changed=[];
      const used=new Set((state.transactions||[]).map(tx=>String(tx.id)));
      for(const group of rows){
        for(const tx of group.rows.slice(1)){
          changed.push({tx,id:tx.id});
          tx.id=nextUniqueTransactionId(used);
        }
      }
      await save('Corrigir IDs duplicados de transações');
      const safe=sameBalances(beforeBalances,balancesSnapshot())&&beforeCount===(state.transactions||[]).length;
      if(!safe){
        changed.forEach(row=>{row.tx.id=row.id});
        await save('Reverter correção de IDs duplicados por proteção de integridade');
        renderAll();
        showFeedback('A correção de IDs foi revertida porque alteraria a integridade financeira. Nenhuma mudança foi mantida.',{title:'Proteção de integridade',type:'error'});
        return false;
      }
      renderAll();
      showFeedback(`${changed.length} ID(s) interno(s) duplicado(s) foram reindexados sem alterar nenhum valor financeiro.`,{title:'IDs corrigidos',type:'success'});
      return true;
    };

    window.renderAudit=function(){
      if(!state)return null;
      const out=originalRenderAudit.apply(this,arguments);
      const rows=safeRows();
      const button=document.getElementById('repairSafeHistoricalAudit');
      if(button){
        button.disabled=!rows.length;
        button.textContent=rows.length?`Corrigir ${rows.length} inconsistência${rows.length===1?'':'s'} histórica${rows.length===1?'':'s'} segura${rows.length===1?'':'s'}`:'Nenhuma correção histórica segura';
      }
      const duplicatePlans=duplicateTransactionPlans();
      const safeDuplicates=duplicatePlans.filter(group=>group.references.length===0);
      const duplicateButton=document.getElementById('repairSafeDuplicateTransactionIds');
      if(duplicateButton){
        const copies=safeDuplicates.reduce((sum,row)=>sum+Math.max(0,row.rows.length-1),0);
        duplicateButton.disabled=!copies;
        duplicateButton.textContent=copies?`Corrigir ${copies} ID${copies===1?'':'s'} duplicado${copies===1?'':'s'} com segurança`:(duplicatePlans.length?'IDs duplicados exigem revisão':'Nenhum ID duplicado');
      }
      document.querySelectorAll('[data-audit-repair]').forEach(btn=>btn.onclick=()=>window.repairHistoricalInvoice(+btn.dataset.auditRepair));
      return out;
    };

    const anchor=document.getElementById('repairOrphans');
    if(anchor&&!document.getElementById('repairSafeHistoricalAudit')){
      const button=document.createElement('button');
      button.type='button';button.className='btn2 wide';button.id='repairSafeHistoricalAudit';
      button.onclick=()=>window.repairSafeHistoricalAudit();
      anchor.parentElement?.insertBefore(button,anchor);
    }
    if(anchor&&!document.getElementById('repairSafeDuplicateTransactionIds')){
      const button=document.createElement('button');
      button.type='button';button.className='btn2 wide';button.id='repairSafeDuplicateTransactionIds';
      button.onclick=()=>window.repairSafeDuplicateTransactionIds();
      anchor.parentElement?.insertBefore(button,anchor);
    }
    const run=document.getElementById('runAudit');
    if(run)run.onclick=window.renderAudit;
    window.renderAudit();
  }

  function install(){
    installOfxCreditSemantics();
    installLiveFeedback();
    installGlobalSearchA11y();
    installPrivacyCoverage();
    installSecondaryModalManager();
    installNotificationPermissionStatus();
    installDebtSchemaCompatibility();
    installInvoiceInstallmentProjection();
    installAuditIntegrityRepair();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();