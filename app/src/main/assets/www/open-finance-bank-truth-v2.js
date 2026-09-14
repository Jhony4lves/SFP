(function installOpenFinanceBankTruthV2(global){
  'use strict';

  const VERSION=2;
  const FLAG='__SFP_OF_BANK_TRUTH_V2';
  if(global[FLAG])return;

  const round2=value=>Math.round((Number(value)||0)*100)/100;
  const sameId=(a,b)=>String(a)===String(b);
  const clean=value=>String(value??'').trim();
  const isoDate=value=>clean(value).slice(0,10);
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(isoDate(value));
  const isoMonth=value=>validDate(value)?isoDate(value).slice(0,7):'';
  const validMonth=value=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(clean(value));
  const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const localMonth=()=>localToday().slice(0,7);
  const activeMonth=()=>validMonth(global.state?.mesAtual)?global.state.mesAtual:localMonth();
  const monthAdd=(month,delta)=>{if(!validMonth(month))return month;const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+Number(delta||0),1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
  let persistenceBusy=false;

  function preview(){
    try{return global.SFPOpenFinanceBills?.getLastPreview?.()||null;}
    catch(_){return null;}
  }

  function itemName(item){return clean(item?.institution)||clean(item?.connectorName);}

  function cardFor(account,item){
    try{return global.SFPOpenFinancePersonal?.suggestSfpEntity?.(account,itemName(item))?.entity||null;}
    catch(_){return null;}
  }

  function previewAccount(card){
    const result=preview();
    if(!result?.ok||!card)return null;
    for(const item of Array.isArray(result.items)?result.items:[]){
      for(const account of Array.isArray(item?.accounts)?item.accounts:[]){
        if(account?.type!=='CREDIT')continue;
        const linked=cardFor(account,item);
        if(linked&&sameId(linked.id,card.id))return{item,account};
      }
    }
    return null;
  }

  function dateForMonth(card,month,kind,account=null){
    const key=kind==='due'?'balanceDueDate':'balanceCloseDate';
    const persisted=kind==='due'?card?.openFinanceBalanceDueDate:card?.openFinanceBalanceCloseDate;
    const live=account?.creditData?.[key];
    for(const candidate of [live,persisted]){
      const value=isoDate(candidate);
      if(validDate(value)&&value.slice(0,7)===month)return value;
    }
    const dayRaw=kind==='due'?card?.dueDay:card?.closeDay;
    const day=Math.max(1,Math.trunc(Number(dayRaw)||1));
    if(!validMonth(month))return'';
    const [year,number]=month.split('-').map(Number);
    const lastDay=new Date(year,number,0).getDate();
    return `${month}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
  }

  function bankCalendar(card,month){
    const linked=previewAccount(card);
    const account=linked?.account||null;
    const dueDate=dateForMonth(card,month,'due',account);
    const closeDate=dateForMonth(card,month,'close',account);
    return{
      dueDate,
      closeDate,
      dueDay:validDate(dueDate)?Number(dueDate.slice(8,10)):Math.max(1,Math.trunc(Number(card?.dueDay)||1)),
      closeDay:validDate(closeDate)?Number(closeDate.slice(8,10)):Math.max(1,Math.trunc(Number(card?.closeDay)||1)),
      account
    };
  }

  function liveBill(card,month){
    const account=previewAccount(card)?.account;
    if(!account)return null;
    const bills=Array.isArray(account.bills)?account.bills:[];
    const candidates=bills.filter(bill=>isoMonth(bill?.dueDate)===month||isoMonth(bill?.billClosingDate)===month);
    if(!candidates.length)return null;
    const selected=candidates.sort((a,b)=>isoDate(b?.dueDate).localeCompare(isoDate(a?.dueDate)))[0];
    const amount=Math.abs(Number(selected?.totalAmount));
    if(!Number.isFinite(amount))return null;
    return{
      amount:round2(amount),
      source:'open-finance-bill',
      official:true,
      billId:clean(selected?.id)||null,
      dueDate:isoDate(selected?.dueDate)||null,
      closeDate:isoDate(selected?.billClosingDate)||null
    };
  }

  function isPaymentCredit(transaction){
    const text=clean(transaction?.description).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return /pagamento|payment|pgto|pag fatura|debito automatico|autopay|liquidacao/.test(text);
  }

  function linkedBillFromAccount(card,month){
    const linked=previewAccount(card);
    const account=linked?.account;
    if(!account||account.transactionsError||account.transactionPreviewHasMore)return null;
    const transactions=Array.isArray(account.transactions)?account.transactions:[];
    const groups=new Map();
    for(const transaction of transactions){
      const status=clean(transaction?.status).toUpperCase();
      const billId=clean(transaction?.billId);
      const amount=Number(transaction?.amount);
      if(status!=='POSTED'||!billId||!Number.isFinite(amount))continue;
      const date=isoDate(transaction?.date);
      const group=groups.get(billId)||{billId,amount:0,count:0,maxDate:'',dates:[]};
      if(amount>0)group.amount+=amount;
      else if(amount<0&&!isPaymentCredit(transaction))group.amount+=amount;
      group.count++;
      if(validDate(date)){
        group.dates.push(date);
        if(!group.maxDate||date>group.maxDate)group.maxDate=date;
      }
      groups.set(billId,group);
    }
    if(!groups.size)return null;

    const calendar=bankCalendar(card,month);
    let candidates=[...groups.values()].filter(group=>group.amount>0);
    if(!candidates.length)return null;
    if(validDate(calendar.closeDate)){
      const beforeClose=candidates.filter(group=>group.maxDate&&group.maxDate<=calendar.closeDate);
      if(beforeClose.length)candidates=beforeClose;
    }
    candidates.sort((a,b)=>{
      const byDate=clean(b.maxDate).localeCompare(clean(a.maxDate));
      if(byDate)return byDate;
      return b.amount-a.amount;
    });
    const selected=candidates[0];
    if(!selected||selected.count<1)return null;
    return{
      amount:round2(Math.max(0,selected.amount)),
      source:'open-finance-linked-transactions',
      official:false,
      bankBacked:true,
      billId:selected.billId,
      transactionCount:selected.count,
      maxDate:selected.maxDate||null,
      dueDate:calendar.dueDate||null,
      closeDate:calendar.closeDate||null
    };
  }

  function storedBankBill(card,month){
    const record=card?.openFinanceBankBills?.[month];
    const amount=Number(record?.amount);
    if(!Number.isFinite(amount)||amount<0)return null;
    return{...record,amount:round2(amount),bankBacked:true};
  }

  function invoiceOfficial(card,month){
    try{
      const status=global.invoiceStatus?.(card?.id,month);
      const amount=Number(status?.officialTotal);
      if(!Number.isFinite(amount))return null;
      return{amount:round2(amount),source:clean(status?.officialTotalSource)||'sfp-official',official:true};
    }catch(_){return null;}
  }

  function pendingDebit(card,month){
    const account=previewAccount(card)?.account;
    if(account&&!account.transactionsError&&!account.transactionPreviewHasMore){
      return round2((account.transactions||[]).filter(tx=>{
        const status=clean(tx?.status).toUpperCase();
        const amount=Number(tx?.amount);
        return status.includes('PENDING')&&Number.isFinite(amount)&&amount>0&&isoMonth(tx?.date)===month;
      }).reduce((sum,tx)=>sum+Math.abs(Number(tx.amount)||0),0));
    }
    return round2(card?.openFinancePendingByMonth?.[month]?.debit||0);
  }

  function localCalculated(card,month){
    try{return round2(Number(global.invoiceCalculated?.(card?.id,month))||0);}
    catch(_){return 0;}
  }

  function bankTruth(card,month){
    const live=liveBill(card,month);
    if(live)return live;
    const linked=linkedBillFromAccount(card,month);
    if(linked)return linked;
    const stored=storedBankBill(card,month);
    if(stored)return stored;
    const official=invoiceOfficial(card,month);
    if(official)return official;
    return null;
  }

  function displayTotal(card,month){
    const truth=bankTruth(card,month);
    if(truth)return truth.amount;
    return round2(localCalculated(card,month)+pendingDebit(card,month));
  }

  function paidAmount(card,month){
    try{return round2(Number(global.invoiceStatus?.(card?.id,month)?.paidAmount)||0);}
    catch(_){return 0;}
  }

  function closed(card,month,referenceDate=localToday()){
    const truth=bankTruth(card,month);
    if(truth?.source==='open-finance-bill'||truth?.source==='open-finance-linked-transactions')return true;
    const ref=isoDate(referenceDate);
    const close=bankCalendar(card,month).closeDate;
    return validDate(ref)&&validDate(close)&&ref>=close;
  }

  function monthLabel(month){try{return global.monthName?.(month)||month;}catch(_){return month;}}
  function money(value){try{return global.brl?.(value)||`R$ ${Number(value||0).toFixed(2).replace('.',',')}`;}catch(_){return`R$ ${Number(value||0).toFixed(2).replace('.',',')}`;}}

  function statusText(card,month){
    const total=displayTotal(card,month),remaining=Math.max(0,round2(total-paidAmount(card,month)));
    if(remaining<=.009)return'Fatura quitada';
    return closed(card,month)?'Fechada':`${money(remaining)} ainda em aberto`;
  }

  function patchCalendarText(root,card,month){
    if(!root||!card)return;
    const calendar=bankCalendar(card,month);
    const text=`Fecha dia ${calendar.closeDay} · vence dia ${calendar.dueDay}`;
    const nodes=[...root.querySelectorAll('small,p,span')];
    const node=nodes.find(el=>/^Fecha dia \d+\s*·\s*vence dia \d+/i.test(clean(el.textContent)));
    if(node)node.textContent=text;
  }

  function patchGrid(){
    const cards=global.state?.cards||[];
    const month=activeMonth();
    const nodes=[...document.querySelectorAll('#cardsGrid .management-card--interactive')];
    nodes.forEach((node,index)=>{
      const card=cards[index];
      if(!card)return;
      const truth=bankTruth(card,month);
      const hasOpenFinance=truth||Number.isFinite(Number(card.openFinanceUsedAmount))||card.openFinanceBalanceDueDate||card.openFinanceBalanceCloseDate;
      if(!hasOpenFinance)return;
      patchCalendarText(node,card,month);
      const primary=node.querySelector('.sfp-card-v2-primary');
      if(primary){
        const label=primary.querySelector('small'),strong=primary.querySelector('strong'),status=primary.querySelector('span');
        if(label)label.textContent=`Fatura atual · ${monthLabel(month)}`;
        if(strong)strong.textContent=money(displayTotal(card,month));
        if(status)status.textContent=statusText(card,month);
      }
      if(node.dataset.sfpBankTruthClick!=='1'){
        node.dataset.sfpBankTruthClick='1';
        node.addEventListener('click',()=>{global.state.ui??={};global.state.ui.invoiceMonthByCard??={};global.state.ui.invoiceMonthByCard[card.id]=activeMonth();},true);
      }
    });
  }

  function selectedCard(){
    const id=Number(document.getElementById('invoiceCard')?.value||global.state?.ui?.invoiceCardId||0);
    return (global.state?.cards||[]).find(card=>sameId(card.id,id))||null;
  }

  function patchInvoiceFocus(){
    const card=selectedCard();
    if(!card)return;
    const month=document.getElementById('invoiceMonth')?.value||global.state?.ui?.invoiceMonthByCard?.[card.id]||activeMonth();
    if(!validMonth(month))return;
    const truth=bankTruth(card,month);
    if(!truth&&!Number.isFinite(Number(card.openFinanceUsedAmount)))return;
    const total=displayTotal(card,month),remaining=Math.max(0,round2(total-paidAmount(card,month)));
    const totalNode=document.getElementById('invoiceTotalView'),remainingNode=document.getElementById('invoiceRemainingView'),statusNode=document.getElementById('invoiceStatusView');
    if(totalNode)totalNode.textContent=money(total);
    if(remainingNode)remainingNode.textContent=money(remaining);
    if(statusNode)statusNode.textContent=statusText(card,month);
  }

  function patchDetail(card){
    if(!card)return;
    const month=activeMonth(),modal=document.querySelector('#modalRoot .modal');
    if(!modal)return;
    patchCalendarText(modal,card,month);
    const metrics=[...modal.querySelectorAll('.metric')];
    const current=metrics.find(el=>/Fatura atual/i.test(el.textContent||''));
    if(current){const strong=current.querySelector('strong'),small=current.querySelector('small');if(strong)strong.textContent=money(displayTotal(card,month));if(small)small.textContent=monthLabel(month);}
  }

  function rememberBankTruth(){
    const result=preview();
    if(!result?.ok||!Array.isArray(global.state?.cards))return false;
    let changed=false;
    const month=activeMonth();
    for(const card of global.state.cards){
      const linked=linkedBillFromAccount(card,month);
      if(!linked)continue;
      card.openFinanceBankBills??={};
      const previous=card.openFinanceBankBills[month];
      const next={amount:linked.amount,billId:linked.billId,source:linked.source,dueDate:linked.dueDate,closeDate:linked.closeDate,transactionCount:linked.transactionCount,updatedAt:new Date().toISOString()};
      const same=previous&&Number(previous.amount)===Number(next.amount)&&clean(previous.billId)===clean(next.billId)&&clean(previous.dueDate)===clean(next.dueDate)&&clean(previous.closeDate)===clean(next.closeDate);
      if(!same){card.openFinanceBankBills[month]=next;changed=true;}
    }
    return changed;
  }

  function persistRememberedTruth(){
    if(persistenceBusy||!rememberBankTruth()||typeof global.save!=='function')return;
    persistenceBusy=true;
    Promise.resolve(global.save('Atualizar verdade bancária da fatura')).catch(error=>console.error('SFP bank truth persistence:',error)).finally(()=>{persistenceBusy=false;});
  }

  function installRenderGuard(){
    const original=global.renderCards;
    if(typeof original!=='function')return false;
    if(original.__sfpBankTruthV2)return true;
    const wrapped=function(){const output=original.apply(this,arguments);patchGrid();patchInvoiceFocus();persistRememberedTruth();return output;};
    Object.defineProperty(wrapped,'__sfpBankTruthV2',{value:true});
    global.renderCards=wrapped;try{renderCards=wrapped}catch(_){}
    return true;
  }

  function installDetailGuard(){
    const original=global.openCardDetail;
    if(typeof original!=='function')return false;
    if(original.__sfpBankTruthV2)return true;
    const wrapped=function(id){const output=original.apply(this,arguments);const card=(global.state?.cards||[]).find(item=>sameId(item.id,id));patchDetail(card);return output;};
    Object.defineProperty(wrapped,'__sfpBankTruthV2',{value:true});
    global.openCardDetail=wrapped;
    return true;
  }

  function install(){
    if(!global.state||!global.SFPOpenFinanceBills||!global.SFPOpenFinancePersonal)return false;
    if(!installRenderGuard()||!installDetailGuard())return false;
    patchGrid();patchInvoiceFocus();rememberBankTruth();
    global[FLAG]=true;
    global.SFPOpenFinanceBankTruth=Object.freeze({version:VERSION,activeMonth,bankCalendar,bankTruth,displayTotal,closed,linkedBillFromAccount,rememberBankTruth,patchGrid,patchInvoiceFocus});
    return true;
  }

  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(install()||attempts>=240)clearInterval(timer);},25);
  install();
})(typeof window!=='undefined'?window:globalThis);
