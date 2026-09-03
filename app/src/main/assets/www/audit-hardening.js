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
    const makeEstimatedInput=row=>{
      if(!row||row.authoritativeInstallmentPlan||!row.currentChargeOnly)return row;
      const current=Math.trunc(Number(row.installment)),total=Math.trunc(Number(row.installments)),amount=roundMoney(Math.abs(Number(row.amount)||0));
      if(!Number.isInteger(current)||!Number.isInteger(total)||current<1||total<2||current>total||total>120||!(amount>0))return row;
      const remaining=total-current+1;
      return{...row,currentChargeOnly:false,installment:1,installments:remaining,installmentSchedule:Array(remaining).fill(amount),authoritativeInstallmentPlan:true,sfpEstimatedInstallmentProjection:true,sfpDocumentInstallment:{installment:current,installments:total}};
    };

    const matchWrapped=function(cardId,row,reserved=new Set()){
      const direct=matchOriginal.apply(this,arguments);
      if(direct||row?.kind!=='purchase'||typeof state==='undefined'||!Array.isArray(state?.purchases))return direct;
      const doc=documentInstallment(row),invoiceMonth=row.invoiceMonth||row.targetMonth||row.firstMonth;
      if(!doc||!validMonth(invoiceMonth)||doc.installments<2)return null;
      const candidate=state.purchases.find(p=>{
        const saved=p?.documentInstallment;
        if(p?.cardId!==cardId||saved?.projection!=='estimated-current-value'||Number(saved.installments)!==doc.installments)return false;
        if(merchant(p.desc)!==merchant(row.desc))return false;
        if(p.purchaseDate&&row.date&&p.purchaseDate!==row.date)return false;
        const distance=monthDistance(p.firstMonth,invoiceMonth);
        return distance!=null&&Number(saved.installment)+distance===doc.installment&&!reserved.has(`purchase:${p.id}`);
      });
      return candidate?{source:'purchase',id:candidate.id,token:`purchase:${candidate.id}`,legacy:false,crossSource:true,projectionReconcile:true}:null;
    };
    matchWrapped.__sfpFutureInstallments=true;
    window.existingInvoiceImportMatch=matchWrapped;

    const attachWrapped=function(match,key,row=null){
      let changed=attachOriginal.apply(this,arguments);
      if(!match||match.source!=='purchase'||!row||typeof state==='undefined')return changed;
      const p=state.purchases.find(item=>String(item.id)===String(match.id));
      if(!p||p.documentInstallment?.projection!=='estimated-current-value')return changed;

      if(row.authoritativeInstallmentPlan&&Array.isArray(row.installmentSchedule)&&row.installmentSchedule.length===Number(row.installments)){
        p.total=roundMoney(row.total);
        p.installments=Number(row.installments);
        p.firstMonth=row.firstMonth;
        p.installmentSchedule=row.installmentSchedule.map(roundMoney);
        p.documentInstallment={installment:Number(row.installment)||1,installments:Number(row.installments),projection:'document-verified'};
        p.note='Projeção de parcelas futuras substituída pelo cronograma conferido do documento.';
        if(String(p.importSource||'').includes('image'))p.importSource='image-ocr+document';
        else if(row.importSource)p.importSource=row.importSource;
        return true;
      }

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

  function install(){
    installOfxCreditSemantics();
    installLiveFeedback();
    installGlobalSearchA11y();
    installPrivacyCoverage();
    installSecondaryModalManager();
    installNotificationPermissionStatus();
    installDebtSchemaCompatibility();
    installInvoiceInstallmentProjection();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
