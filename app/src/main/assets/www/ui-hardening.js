(function(){
  'use strict';

  const labelMap = {
    globalSearch: 'Buscar em todo o SFP',
    txSearch: 'Buscar lançamentos',
    txFilter: 'Filtrar lançamentos por tipo'
  };
  let dialogLayerSeq=0;

  function textOfIds(ids){
    return String(ids||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim().replace(/\s+/g,' ');
  }

  function fieldLabel(select){
    if(!select) return '';
    const explicit=select.getAttribute('aria-label');
    if(explicit) return explicit.trim();
    const labelled=textOfIds(select.getAttribute('aria-labelledby'));
    if(labelled) return labelled;
    if(select.id){
      const label=document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
      const text=(label?.textContent||'').trim().replace(/\s+/g,' ');
      if(text) return text;
    }
    const wrapping=select.closest('label');
    return (wrapping?.textContent||'').trim().replace(/\s+/g,' ');
  }

  function redirectSelectLabel(select,host){
    if(!select||!host) return;
    const id=select.id;
    const focusVisible=()=>{
      const button=host.querySelector('.sfp-select-button');
      if(button && !button.hasAttribute('disabled')) button.focus();
    };
    select.tabIndex=-1;
    select.setAttribute('aria-hidden','true');
    if(select.dataset.sfpFocusRedirect!=='1'){
      select.dataset.sfpFocusRedirect='1';
      select.addEventListener('focus',focusVisible);
    }
    const labels=select.labels?Array.from(select.labels):id?Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)):[];
    labels.forEach(label=>{
      if(label.dataset.sfpSelectRedirect==='1') return;
      label.dataset.sfpSelectRedirect='1';
      label.addEventListener('click',event=>{
        if(event.target.closest?.('.sfp-select,button,input,textarea,a')) return;
        event.preventDefault();
        focusVisible();
      });
    });
  }

  function hardenCustomSelect(host){
    if(!host?.matches?.('.sfp-select')) return;
    const id=host.dataset.forSelect;
    const select=id?document.getElementById(id):host.previousElementSibling?.matches?.('select')?host.previousElementSibling:null;
    const button=host.querySelector('.sfp-select-button');
    const value=(host.querySelector('.sfp-select-label')?.textContent||'').trim().replace(/\s+/g,' ');
    if(!button) return;
    const label=fieldLabel(select);
    const accessible=label&&value?`${label}: ${value}`:label||value||'Selecionar opção';
    button.setAttribute('aria-label',accessible);
    if(value) button.setAttribute('title',value);
    redirectSelectLabel(select,host);
  }

  function applyAccessibleNames(root=document){
    for(const [id,label] of Object.entries(labelMap)){
      const el=root.querySelector?.(`#${CSS.escape(id)}`);
      if(el && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')){
        el.setAttribute('aria-label',label);
      }
    }

    const toast=root.querySelector?.('#toast');
    if(toast){
      if(!toast.getAttribute('role')) toast.setAttribute('role','status');
      if(!toast.getAttribute('aria-live')) toast.setAttribute('aria-live','polite');
      if(!toast.getAttribute('aria-atomic')) toast.setAttribute('aria-atomic','true');
    }

    root.querySelectorAll?.('.sfp-select-label,.sfp-select-option').forEach(el=>{
      const text=(el.textContent||'').trim().replace(/\s+/g,' ');
      if(text && el.getAttribute('title')!==text) el.setAttribute('title',text);
    });
    if(root.matches?.('.sfp-select')) hardenCustomSelect(root);
    root.querySelectorAll?.('.sfp-select').forEach(hardenCustomSelect);
  }

  function normalizeTransactionToolbar(){
    const search=document.getElementById('txSearch');
    const filter=document.getElementById('txFilter');
    search?.style.removeProperty('width');
    search?.style.removeProperty('margin');
    filter?.style.removeProperty('width');
    filter?.style.removeProperty('margin');
  }

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    })[ch]);
  }

  function focusables(root){
    if(!root) return [];
    return Array.from(root.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]):not([aria-hidden="true"]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter(el=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden');
  }

  function trapTab(event,dialog){
    if(event.key!=='Tab') return false;
    const items=focusables(dialog);
    if(!items.length){event.preventDefault();dialog.focus?.();return true;}
    const first=items[0],last=items[items.length-1],active=document.activeElement;
    if(event.shiftKey && (active===first || !dialog.contains(active))){event.preventDefault();last.focus();return true;}
    if(!event.shiftKey && (active===last || !dialog.contains(active))){event.preventDefault();first.focus();return true;}
    return false;
  }

  function acquireDialogLayer(){
    const base=document.getElementById('modalRoot');
    if(!base) return null;
    const nested=!base.classList.contains('hidden') && !!base.querySelector('.modal');
    if(!nested){
      base.className='modalback';
      return {root:base,nested:false};
    }
    const root=document.createElement('div');
    root.className='modalback sfp-nested-dialog-layer';
    root.dataset.sfpDialogLayer=String(++dialogLayerSeq);
    document.body.appendChild(root);
    return {root,nested:true};
  }

  function releaseDialogLayer(layer,opener){
    if(!layer) return;
    if(layer.nested) layer.root.remove();
    else {layer.root.className='hidden';layer.root.innerHTML='';}
    requestAnimationFrame(()=>{
      if(opener?.isConnected && typeof opener.focus==='function') opener.focus({preventScroll:true});
    });
  }

  function installDialogs(){
    if(typeof window.sfpConfirm==='function' && !window.sfpConfirm.__sfpHardened){
      const hardenedConfirm=function({title='Confirmação',message='Deseja prosseguir com esta ação?',confirmText='Confirmar',cancelText='Cancelar',danger=false}={}){
        return new Promise(resolve=>{
          const opener=document.activeElement;
          const layer=acquireDialogLayer();
          if(!layer){resolve(window.confirm?window.confirm(message):true);return;}
          const iconSvg=danger
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
          layer.root.innerHTML=`<div class="modal sfp-dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
            <div class="sfp-dialog-head">
              <div class="sfp-dialog-badge ${danger?'danger':'confirmation'}">${iconSvg}</div>
              <div class="sfp-dialog-title"><h2 id="dialogTitle">${esc(title)}</h2><p>${danger?'Ação destrutiva ou de atenção':'Confirmação necessária'}</p></div>
              <button class="sfp-dialog-close icon-button" id="dialogCloseBtn" aria-label="Fechar">×</button>
            </div>
            <div class="sfp-dialog-body">${esc(message).replace(/\n/g,'<br>')}</div>
            <div class="sfp-dialog-actions">
              <button class="btn2" id="dialogCancelBtn">${esc(cancelText)}</button>
              <button class="${danger?'danger':'btn'}" id="dialogConfirmBtn">${esc(confirmText)}</button>
            </div>
          </div>`;
          const dialog=layer.root.querySelector('.sfp-dialog');
          const closeBtn=layer.root.querySelector('#dialogCloseBtn');
          const cancelBtn=layer.root.querySelector('#dialogCancelBtn');
          const confirmBtn=layer.root.querySelector('#dialogConfirmBtn');
          let done=false;
          const finish=result=>{
            if(done)return;done=true;
            window.removeEventListener('keydown',onKey,true);
            releaseDialogLayer(layer,opener);
            resolve(result);
          };
          const onKey=event=>{
            if(!layer.root.isConnected && layer.nested) return;
            if(trapTab(event,dialog)) return;
            if(event.key==='Escape'){
              event.preventDefault();event.stopPropagation();finish(false);return;
            }
            if(event.key!=='Enter') return;
            const active=document.activeElement;
            if(active===cancelBtn || active===closeBtn){
              event.preventDefault();event.stopPropagation();finish(false);
            }else if(active===confirmBtn){
              event.preventDefault();event.stopPropagation();finish(true);
            }
          };
          window.addEventListener('keydown',onKey,true);
          closeBtn.onclick=()=>finish(false);
          cancelBtn.onclick=()=>finish(false);
          confirmBtn.onclick=()=>finish(true);
          confirmBtn.focus();
        });
      };
      hardenedConfirm.__sfpHardened=true;
      window.sfpConfirm=hardenedConfirm;
    }

    if(typeof window.sfpPrompt==='function' && !window.sfpPrompt.__sfpHardened){
      const hardenedPrompt=function({title='Informe um valor',message='',defaultValue='',confirmText='Confirmar',cancelText='Cancelar',inputType='text',sensitive=false}={}){
        return new Promise(resolve=>{
          const opener=document.activeElement;
          const layer=acquireDialogLayer();
          if(!layer){resolve(window.prompt?window.prompt(message,defaultValue):defaultValue);return;}
          const safeType=inputType==='password'?'password':'text';
          layer.root.innerHTML=`<div class="modal sfp-dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
            <div class="sfp-dialog-head">
              <div class="sfp-dialog-badge info">i</div>
              <div class="sfp-dialog-title"><h2 id="dialogTitle">${esc(title)}</h2><p>Preencha para continuar</p></div>
              <button class="sfp-dialog-close icon-button" id="dialogCloseBtn" aria-label="Fechar">×</button>
            </div>
            <div class="sfp-dialog-body">${message?`<p>${esc(message).replace(/\n/g,'<br>')}</p>`:''}<input id="dialogPromptInput" type="${safeType}" value="${esc(defaultValue)}" autocomplete="${sensitive?'off':'on'}"></div>
            <div class="sfp-dialog-actions">
              <button class="btn2" id="dialogCancelBtn">${esc(cancelText)}</button>
              <button class="btn" id="dialogConfirmBtn">${esc(confirmText)}</button>
            </div>
          </div>`;
          const dialog=layer.root.querySelector('.sfp-dialog');
          const input=layer.root.querySelector('#dialogPromptInput');
          const closeBtn=layer.root.querySelector('#dialogCloseBtn');
          const cancelBtn=layer.root.querySelector('#dialogCancelBtn');
          const confirmBtn=layer.root.querySelector('#dialogConfirmBtn');
          let done=false;
          const finish=value=>{
            if(done)return;done=true;
            window.removeEventListener('keydown',onKey,true);
            if(sensitive)input.value='';
            releaseDialogLayer(layer,opener);
            resolve(value);
          };
          const onKey=event=>{
            if(trapTab(event,dialog)) return;
            if(event.key==='Escape'){
              event.preventDefault();event.stopPropagation();finish(null);return;
            }
            if(event.key!=='Enter') return;
            const active=document.activeElement;
            if(active===cancelBtn || active===closeBtn){
              event.preventDefault();event.stopPropagation();finish(null);
            }else if(active===confirmBtn || active===input){
              event.preventDefault();event.stopPropagation();finish(input.value);
            }
          };
          window.addEventListener('keydown',onKey,true);
          closeBtn.onclick=()=>finish(null);
          cancelBtn.onclick=()=>finish(null);
          confirmBtn.onclick=()=>finish(input.value);
          input.focus();input.select();
        });
      };
      hardenedPrompt.__sfpHardened=true;
      window.sfpPrompt=hardenedPrompt;
    }
  }

  function installAndroidBackBridge(){
    const original=window.handleAndroidBack;
    if(typeof original!=='function' || original.__sfpNestedAware) return;
    const wrapped=function(){
      const nested=Array.from(document.querySelectorAll('.sfp-nested-dialog-layer')).filter(el=>el.getClientRects().length).pop();
      if(nested){
        const closer=nested.querySelector('#dialogCancelBtn,#dialogCloseBtn,.sfp-dialog-close,[data-close]');
        closer?.click();
        return true;
      }
      return original.apply(this,arguments);
    };
    wrapped.__sfpNestedAware=true;
    window.handleAndroidBack=wrapped;
  }

  function installPseudoButtonKeyboard(){
    document.addEventListener('keydown',event=>{
      if(event.key!=='Enter' && event.key!==' ') return;
      const target=event.target?.closest?.('.category-row[role="button"][tabindex="0"],#dashboard .item[role="button"][tabindex="0"]');
      if(!target) return;
      event.preventDefault();
      target.click();
    });
  }


  let passiveModalSession=null;

  function visiblePassiveModal(){
    const root=document.getElementById('modalRoot');
    if(!root || root.classList.contains('hidden')) return null;
    const dialog=root.querySelector('.modal:not(.sfp-dialog)');
    return dialog?{root,dialog}:null;
  }

  function passiveModalCloser(root,dialog){
    const selectors=[
      '#closeProgressive','#closeDetail','#closeSophyMemories','#closeSophySettings',
      '#closeAutoBackups','#closeTrash','#skipOnboard','[data-close]',
      'button[aria-label="Fechar"]','button[title="Fechar"]','.head > button'
    ];
    for(const selector of selectors){
      const button=dialog.querySelector(selector)||root.querySelector(selector);
      if(button && !button.disabled) return button;
    }
    return null;
  }

  function restorePassiveModalFocus(session){
    requestAnimationFrame(()=>{
      if(session?.opener?.isConnected && typeof session.opener.focus==='function'){
        session.opener.focus({preventScroll:true});
        return;
      }
      const next=visiblePassiveModal();
      if(next){
        const target=passiveModalCloser(next.root,next.dialog)||focusables(next.dialog)[0]||next.dialog;
        target.focus?.({preventScroll:true});
      }
    });
  }

  function releasePassiveModal({restore=true}={}){
    const session=passiveModalSession;
    if(!session) return;
    window.removeEventListener('keydown',session.onKey,true);
    passiveModalSession=null;
    if(restore) restorePassiveModalFocus(session);
  }

  function activatePassiveModal(root,dialog,opener){
    if(passiveModalSession?.dialog===dialog) return;
    if(passiveModalSession) releasePassiveModal({restore:false});
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    if(!dialog.hasAttribute('aria-label')&&!dialog.hasAttribute('aria-labelledby')){
      const heading=dialog.querySelector('h1,h2,h3');
      if(heading){
        if(!heading.id) heading.id='sfpModalTitle'+(++dialogLayerSeq);
        dialog.setAttribute('aria-labelledby',heading.id);
      }
    }
    if(!dialog.hasAttribute('tabindex')) dialog.tabIndex=-1;
    const onKey=event=>{
      if(document.querySelector('.sfp-nested-dialog-layer .sfp-dialog')) return;
      if(event.key==='Escape'){
        const closer=passiveModalCloser(root,dialog);
        event.preventDefault();event.stopPropagation();
        if(closer) closer.click();
        else root.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        return;
      }
      trapTab(event,dialog);
    };
    passiveModalSession={root,dialog,opener,onKey};
    window.addEventListener('keydown',onKey,true);
    requestAnimationFrame(()=>{
      if(passiveModalSession?.dialog!==dialog || !dialog.isConnected) return;
      if(!dialog.contains(document.activeElement)){
        const target=passiveModalCloser(root,dialog)||focusables(dialog)[0]||dialog;
        target.focus?.({preventScroll:true});
      }
    });
  }

  function syncPassiveModal(){
    const current=visiblePassiveModal();
    if(!current){
      if(passiveModalSession) releasePassiveModal({restore:true});
      return;
    }
    if(passiveModalSession?.dialog===current.dialog) return;
    const opener=passiveModalSession?.opener || (current.root.contains(document.activeElement)?null:document.activeElement);
    activatePassiveModal(current.root,current.dialog,opener);
  }

  function install(){
    applyAccessibleNames(document);
    normalizeTransactionToolbar();
    installDialogs();
    installAndroidBackBridge();
    installPseudoButtonKeyboard();
    syncPassiveModal();

    const observer=new MutationObserver(records=>{
      for(const record of records){
        const target=record.target?.nodeType===1?record.target:record.target?.parentElement;
        const host=target?.closest?.('.sfp-select');
        if(host) hardenCustomSelect(host);
        for(const node of record.addedNodes){
          if(node.nodeType!==1) continue;
          if(node.matches?.('.sfp-select,.sfp-select-label,.sfp-select-option,#toast,#globalSearch,#txSearch,#txFilter')){
            applyAccessibleNames(node.matches('.sfp-select')?node:(node.parentElement||document));
          } else if(node.querySelector?.('.sfp-select,.sfp-select-label,.sfp-select-option,#toast,#globalSearch,#txSearch,#txFilter')){
            applyAccessibleNames(node);
          }
        }
      }
      syncPassiveModal();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
