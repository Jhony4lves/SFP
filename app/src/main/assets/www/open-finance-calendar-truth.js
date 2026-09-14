(function installOpenFinanceCalendarTruth(global){
  'use strict';

  const VERSION=1;
  const FLAG='__SFP_OF_CALENDAR_TRUTH_V1';
  if(global[FLAG])return;

  const round2=value=>Math.round((Number(value)||0)*100)/100;
  const sameId=(a,b)=>String(a)===String(b);
  const validMonth=value=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(value||''));
  const isoDate=value=>String(value||'').slice(0,10);
  const isoMonth=value=>{const date=isoDate(value);return /^\d{4}-\d{2}-\d{2}$/.test(date)?date.slice(0,7):'';};
  const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const localMonth=()=>localToday().slice(0,7);
  const monthAdd=(month,delta)=>{
    if(!validMonth(month))return month;
    const [year,number]=month.split('-').map(Number);
    const d=new Date(year,number-1+Number(delta||0),1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const activeMonth=()=>validMonth(global.state?.mesAtual)?global.state.mesAtual:localMonth();

  function isOpenFinanceCard(card){
    if(!card)return false;
    return Number.isFinite(Number(card.openFinanceUsedAmount))
      ||Boolean(card.openFinanceBalanceDueDate)
      ||Boolean(card.openFinanceBalanceCloseDate)
      ||Boolean(card.openFinanceLastSyncedAt)
      ||Boolean(card.openFinancePendingByMonth);
  }

  function autoImportedPurchase(purchase){
    if(!purchase)return false;
    const tags=Array.isArray(purchase.tags)?purchase.tags:[];
    return tags.includes('open-finance')&&tags.includes('pluggy')
      ||String(purchase.note||'').includes('Importado automaticamente pelo Open Finance (Pluggy).');
  }

  function expectedFirstMonth(purchase){
    const observedMonth=isoMonth(purchase?.purchaseDate);
    if(!observedMonth)return'';
    const meta=purchase?.openFinanceInstallment||{};
    const number=Math.trunc(Number(meta.installmentNumber)||0);
    const total=Math.trunc(Number(meta.totalInstallments)||0);
    if(Number(purchase?.installments)>1&&number>0&&total>1)return monthAdd(observedMonth,-(number-1));
    return observedMonth;
  }

  function normalizeImportedPurchases(){
    if(!Array.isArray(global.state?.purchases))return false;
    let changed=false;
    for(const purchase of global.state.purchases){
      if(!autoImportedPurchase(purchase))continue;
      const expected=expectedFirstMonth(purchase);
      if(!expected||purchase.firstMonth===expected)continue;
      purchase.firstMonth=expected;
      purchase.openFinanceMonthRule='transaction-calendar-month';
      changed=true;
    }
    return changed;
  }

  function preview(){
    try{return global.SFPOpenFinanceBills?.getLastPreview?.()||null;}
    catch(_){return null;}
  }

  function itemName(item){
    return String(item?.institution||item?.connectorName||'').trim();
  }

  function suggestedCard(account,item){
    try{
      const suggestion=global.SFPOpenFinancePersonal?.suggestSfpEntity?.(account,itemName(item));
      return suggestion?.entity||null;
    }catch(_){return null;}
  }

  function livePendingMap(){
    const result=preview();
    if(!result)return null;
    const map=new Map();
    for(const item of Array.isArray(result.items)?result.items:[]){
      for(const account of Array.isArray(item?.accounts)?item.accounts:[]){
        if(account?.type!=='CREDIT')continue;
        const card=suggestedCard(account,item);
        if(!card)continue;
        for(const transaction of Array.isArray(account.transactions)?account.transactions:[]){
          if(!String(transaction?.status||'').toUpperCase().includes('PENDING'))continue;
          const month=isoMonth(transaction?.date);
          const amount=Number(transaction?.amount);
          if(!month||!Number.isFinite(amount)||amount<=0)continue;
          const key=`${card.id}:${month}`;
          map.set(key,round2((map.get(key)||0)+Math.abs(amount)));
        }
      }
    }
    return map;
  }

  function rememberPendingSnapshot(){
    const map=livePendingMap();
    if(!map||!Array.isArray(global.state?.cards))return false;
    let changed=false;
    for(const card of global.state.cards){
      const next={...(card.openFinancePendingByMonth||{})};
      let touched=false;
      for(const [key,amount] of map.entries()){
        const [cardId,month]=key.split(':');
        if(!sameId(cardId,card.id))continue;
        next[month]={debit:amount,updatedAt:new Date().toISOString()};
        touched=true;
      }
      if(touched){card.openFinancePendingByMonth=next;changed=true;}
    }
    return changed;
  }

  function pendingDebit(card,month){
    const live=livePendingMap();
    if(live){
      const key=`${card?.id}:${month}`;
      return round2(live.get(key)||0);
    }
    return round2(card?.openFinancePendingByMonth?.[month]?.debit||0);
  }

  function officialTotal(cardId,month){
    try{
      const status=global.invoiceStatus?.(cardId,month);
      const value=Number(status?.officialTotal);
      return Number.isFinite(value)?round2(value):null;
    }catch(_){return null;}
  }

  function displayTotal(card,month){
    const official=officialTotal(card?.id,month);
    if(official!==null)return official;
    let calculated=0;
    try{calculated=Number(global.invoiceCalculated?.(card?.id,month))||0;}catch(_){}
    return round2(calculated+pendingDebit(card,month));
  }

  function paidAmount(cardId,month){
    try{return round2(global.invoiceStatus?.(cardId,month)?.paidAmount||0);}
    catch(_){return 0;}
  }

  function duePassed(card,month,referenceDate=localToday()){
    if(!card||!validMonth(month))return false;
    const ref=isoDate(referenceDate);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(ref))return false;
    const [year,number]=month.split('-').map(Number);
    const dueDay=Math.max(1,Math.trunc(Number(card.dueDay)||1));
    const lastDay=new Date(year,number,0).getDate();
    const due=`${month}-${String(Math.min(dueDay,lastDay)).padStart(2,'0')}`;
    return ref>due;
  }

  function monthLabel(month){
    try{return typeof global.monthName==='function'?global.monthName(month):month;}
    catch(_){return month;}
  }

  function money(value){
    try{return typeof global.brl==='function'?global.brl(value):`R$ ${Number(value||0).toFixed(2).replace('.',',')}`;}
    catch(_){return`R$ ${Number(value||0).toFixed(2).replace('.',',')}`;}
  }

  function patchGrid(){
    if(!Array.isArray(global.state?.cards))return;
    const month=activeMonth();
    const nodes=[...document.querySelectorAll('#cardsGrid > .management-card--interactive')];
    nodes.forEach((node,index)=>{
      const card=global.state.cards[index];
      if(!card||!isOpenFinanceCard(card))return;
      const primary=node.querySelector('.sfp-card-v2-primary');
      if(primary){
        const total=displayTotal(card,month);
        const paid=paidAmount(card.id,month);
        const remaining=Math.max(0,round2(total-paid));
        const label=primary.querySelector('small');
        const strong=primary.querySelector('strong');
        const status=primary.querySelector('span');
        if(label)label.textContent=`Fatura atual · ${monthLabel(month)}`;
        if(strong)strong.textContent=money(total);
        if(status)status.textContent=duePassed(card,month)?'Fechada':remaining>0?`${money(remaining)} ainda em aberto`:'Fatura quitada';
      }
      const next=[...node.querySelectorAll('.sfp-card-v2-stat')].find(el=>/Próxima fatura/i.test(el.textContent||''));
      const nextStrong=next?.querySelector('strong');
      if(nextStrong)nextStrong.textContent=money(displayTotal(card,monthAdd(month,1)));
      if(node.dataset.sfpCalendarTruthClick!=='1'){
        node.dataset.sfpCalendarTruthClick='1';
        node.addEventListener('click',()=>{
          global.state.ui??={};global.state.ui.invoiceMonthByCard??={};
          global.state.ui.invoiceMonthByCard[card.id]=activeMonth();
        },true);
      }
    });
  }

  function selectedCard(){
    const id=Number(document.getElementById('invoiceCard')?.value||global.state?.ui?.invoiceCardId||0);
    return (global.state?.cards||[]).find(card=>sameId(card.id,id))||null;
  }

  function patchInvoiceFocus(){
    const card=selectedCard();
    if(!card||!isOpenFinanceCard(card))return;
    const month=document.getElementById('invoiceMonth')?.value||global.state?.ui?.invoiceMonthByCard?.[card.id]||activeMonth();
    if(!validMonth(month))return;
    const total=displayTotal(card,month);
    const paid=paidAmount(card.id,month);
    const remaining=Math.max(0,round2(total-paid));
    const totalNode=document.getElementById('invoiceTotalView');
    const remainingNode=document.getElementById('invoiceRemainingView');
    const statusNode=document.getElementById('invoiceStatusView');
    if(totalNode)totalNode.textContent=money(total);
    if(remainingNode)remainingNode.textContent=money(remaining);
    if(statusNode&&duePassed(card,month))statusNode.textContent='Fechada';
  }

  function patchCardDetail(card){
    if(!card||!isOpenFinanceCard(card))return;
    const month=activeMonth();
    global.state.ui??={};global.state.ui.invoiceMonthByCard??={};
    global.state.ui.invoiceMonthByCard[card.id]=month;
    const modal=document.querySelector('#modalRoot .modal');
    if(!modal)return;
    const metrics=[...modal.querySelectorAll('.metric')];
    const current=metrics.find(el=>/Fatura atual/i.test(el.textContent||''));
    const next=metrics.find(el=>/Próxima fatura/i.test(el.textContent||''));
    if(current){
      const strong=current.querySelector('strong');const small=current.querySelector('small');
      if(strong)strong.textContent=money(displayTotal(card,month));
      if(small)small.textContent=monthLabel(month);
    }
    if(next){const strong=next.querySelector('strong');if(strong)strong.textContent=money(displayTotal(card,monthAdd(month,1)));}
  }

  function installSaveGuard(){
    const original=global.save;
    if(typeof original!=='function')return false;
    if(original.__sfpCalendarInvoiceTruth)return true;
    const wrapped=async function(){
      normalizeImportedPurchases();
      rememberPendingSnapshot();
      return original.apply(this,arguments);
    };
    Object.defineProperty(wrapped,'__sfpCalendarInvoiceTruth',{value:true});
    Object.defineProperty(wrapped,'__sfpOriginalSave',{value:original});
    global.save=wrapped;
    try{save=wrapped}catch(_){}
    return true;
  }

  function installRenderGuard(){
    const original=global.renderCards;
    if(typeof original!=='function')return false;
    if(original.__sfpCalendarInvoiceTruth)return true;
    const wrapped=function(){
      normalizeImportedPurchases();
      const output=original.apply(this,arguments);
      patchGrid();
      patchInvoiceFocus();
      return output;
    };
    Object.defineProperty(wrapped,'__sfpCalendarInvoiceTruth',{value:true});
    Object.defineProperty(wrapped,'__sfpOriginalRenderCards',{value:original});
    global.renderCards=wrapped;
    try{renderCards=wrapped}catch(_){}
    return true;
  }

  function installDetailGuard(){
    const original=global.openCardDetail;
    if(typeof original!=='function')return false;
    if(original.__sfpCalendarInvoiceTruth)return true;
    const wrapped=function(id){
      const output=original.apply(this,arguments);
      const card=(global.state?.cards||[]).find(item=>sameId(item.id,id));
      patchCardDetail(card);
      return output;
    };
    Object.defineProperty(wrapped,'__sfpCalendarInvoiceTruth',{value:true});
    global.openCardDetail=wrapped;
    return true;
  }

  function install(){
    if(!global.state||!global.SFPOpenFinanceBills||!global.SFPOpenFinancePersonal)return false;
    const a=installSaveGuard(),b=installRenderGuard(),c=installDetailGuard();
    if(!(a&&b&&c))return false;
    normalizeImportedPurchases();
    patchGrid();
    patchInvoiceFocus();
    global[FLAG]=true;
    global.SFPOpenFinanceCalendarTruth=Object.freeze({
      version:VERSION,
      activeMonth,
      invoiceMonthForTransaction:isoMonth,
      normalizeImportedPurchases,
      displayTotal,
      pendingDebit,
      duePassed,
      patchGrid,
      patchInvoiceFocus
    });
    return true;
  }

  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(install()||attempts>=240)clearInterval(timer);},25);
  install();
})(typeof window!=='undefined'?window:globalThis);
