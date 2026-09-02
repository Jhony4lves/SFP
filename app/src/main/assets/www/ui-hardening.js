(function(){
  'use strict';

  const labelMap = {
    globalSearch: 'Buscar em todo o SFP',
    txSearch: 'Buscar lançamentos',
    txFilter: 'Filtrar lançamentos por tipo'
  };

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
        for(const node of record.addedNodes){
          if(node.nodeType!==1) continue;
          if(node.matches?.('.sfp-select-label,.sfp-select-option,#toast,#globalSearch,#txSearch,#txFilter')){
            applyAccessibleNames(node.parentElement||document);
          } else if(node.querySelector?.('.sfp-select-label,.sfp-select-option,#toast,#globalSearch,#txSearch,#txFilter')){
            applyAccessibleNames(node);
          }
        }
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
