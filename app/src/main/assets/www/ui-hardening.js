(function(){
  'use strict';

  const labelMap = {
    globalSearch: 'Buscar em todo o SFP',
    txSearch: 'Buscar lançamentos',
    txFilter: 'Filtrar lançamentos por tipo'
  };

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

  function install(){
    applyAccessibleNames(document);
    normalizeTransactionToolbar();

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
    });
    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
