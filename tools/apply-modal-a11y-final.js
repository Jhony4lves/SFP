const fs=require('fs');
const path='app/src/main/assets/www/ui-hardening.js';
let s=fs.readFileSync(path,'utf8');
const anchor='  function install(){';
if(!s.includes(anchor)) throw new Error('install anchor not found');
if(s.includes('function syncPassiveModal(){')) process.exit(0);
const patch=`
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

`;
s=s.replace(anchor,patch+anchor);
const installAnchor='    installPseudoButtonKeyboard();\n';
if(!s.includes(installAnchor)) throw new Error('install call anchor not found');
s=s.replace(installAnchor,installAnchor+'    syncPassiveModal();\n');
const observerAnchor='      }\n    });\n    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});';
if(!s.includes(observerAnchor)) throw new Error('observer anchor not found');
s=s.replace(observerAnchor,'      }\n      syncPassiveModal();\n    });\n    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});');
fs.writeFileSync(path,s);
console.log('Modal a11y hardening applied');
