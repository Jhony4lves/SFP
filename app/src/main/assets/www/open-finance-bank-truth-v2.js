(function installOpenFinanceBankTruthV3(global){
  'use strict';

  const VERSION=3;
  const FLAG='__SFP_OF_BANK_TRUTH_V3';
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

  function invoiceRecord(card,month){
    return (global.state?.invoices||[]).find(inv=>sameId(inv?.cardId,card?.id)&&inv?.month===month)||null;
  }

  function currentBill(card,month){
    const account=previewAccount(card)?.account;
    if(!account)return null;
    const bills=Array.isArray(account.bills)?account.bills:[];
    const candidates=bills.filter(bill=>isoMonth(bill?.dueDate)===month||isoMonth(bill?.billClosingDate)===month);
    if(!candidates.length)return null;
    return [...candidates].sort((a,b)=>isoDate(b?.dueDate).localeCompare(isoDate(a?.dueDate)))[0]||null;
  }

  function explicitDateForMonth(card,month,kind,account=null,bill=null){
    const inv=invoiceRecord(card,month);
    const key=kind==='due'?'balanceDueDate':'balanceCloseDate';
    const candidates=kind==='due'
      ?[bill?.dueDate,inv?.documentDueDate,account?.creditData?.[key],card?.openFinanceBalanceDueDate,card?.openFinanceBankBills?.[month]?.dueDate]
      :[bill?.billClosingDate,inv?.documentCloseDate,account?.creditData?.[key],card?.openFinanceBalanceCloseDate,card?.openFinanceBankBills?.[month]?.closeDate];
    for(const candidate of candidates){
      const value=isoDate(candidate);
      if(validDate(value)&&value.slice(0,7)===month)return value;
    }
    return'';
  }

  function fallbackDate(card,month,kind){
    if(!validMonth(month))return'';
    const raw=kind==='due'?card?.dueDay:card?.closeDay;
    const day=Math.max(1,Math.trunc(Number(raw)||1));
    const [year,number]=month.split('-').map(Number);
    const lastDay=new Date(year,number,0).getDate();
    return `${month}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
  }

  function bankCalendar(card,month){
    const linked=previewAccount(card);
    const account=linked?.account||null;
    const bill=currentBill(card,month);
    const bankDueDate=explicitDateForMonth(card,month,'due',account,bill);
    const bankCloseDate=explicitDateForMonth(card,month,'close',account,bill);
    const dueDate=bankDueDate||fallbackDate(card,month,'due');
    const closeDate=bankCloseDate||fallbackDate(card,month,'close');
    return{
      dueDate,
      closeDate,
      bankDueDate:bankDueDate||null,
      bankCloseDate:bankCloseDate||null,
      dueDay:validDate(dueDate)?Number(dueDate.slice(8,10)):Math.max(1,Math.trunc(Number(card?.dueDay)||1)),
      closeDay:validDate(closeDate)?Number(closeDate.slice(8,10)):Math.max(1,Math.trunc(Number(card?.closeDay)||1)),
      account,
      bill
    };
  }

  function liveBill(card,month){
    const bill=currentBill(card,month);
    if(!bill)return null;
    const amount=Math.abs(Number(bill?.totalAmount));
    if(!Number.isFinite(amount))return null;
    const calendar=bankCalendar(card,month);
    return{
      amount:round2(amount),
      source:'open-finance-bill',
      official:true,
      bankBacked:true,
      billId:clean(bill?.id)||null,
      dueDate:isoDate(bill?.dueDate)||calendar.bankDueDate||null,
      closeDate:isoDate(bill?.billClosingDate)||calendar.bankCloseDate||null
    };
  }

  function normalizedText(value){
    return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  }

  function isPaymentCredit(transaction){
    return /pagamento|payment|pgto|pag fatura|debito automatico|autopay|liquidacao/.test(normalizedText(transaction?.description));
  }

  function confirmed(transaction){
    const status=clean(transaction?.status).toUpperCase();
    if(!status)return true;
    if(status.includes('PENDING')||status.includes('CANCEL'))return false;
    return ['POSTED','COMPLETED','CLEARED','SETTLED','CONFIRMED'].some(token=>status.includes(token));
  }

  function linkedBillFromAccount(card,month){
    const account=previewAccount(card)?.account;
    if(!account||account.transactionsError||account.transactionPreviewHasMore)return null;
    const groups=new Map();
    for(const transaction of Array.isArray(account.transactions)?account.transactions:[]){
      const billId=clean(transaction?.billId),amount=Number(transaction?.amount);
      if(!confirmed(transaction)||!billId||!Number.isFinite(amount))continue;
      const date=isoDate(transaction?.date);
      const group=groups.get(billId)||{billId,amount:0,count:0,maxDate:''};
      if(amount>0)group.amount+=amount;
      else if(amount<0&&!isPaymentCredit(transaction))group.amount+=amount;
      group.count++;
      if(validDate(date)&&(!group.maxDate||date>group.maxDate))group.maxDate=date;
      groups.set(billId,group);
    }
    if(!groups.size)return null;
    const calendar=bankCalendar(card,month);
    let candidates=[...groups.values()].filter(group=>group.amount>0);
    if(calendar.bankCloseDate){
      const bounded=candidates.filter(group=>group.maxDate&&group.maxDate<=calendar.bankCloseDate);
      if(bounded.length)candidates=bounded;
    }
    candidates.sort((a,b)=>clean(b.maxDate).localeCompare(clean(a.maxDate))||b.amount-a.amount);
    const selected=candidates[0];
    if(!selected)return null;
    return{
      amount:round2(selected.amount),
      source:'open-finance-linked-transactions',
      official:false,
      bankBacked:true,
      billId:selected.billId,
      transactionCount:selected.count,
      maxDate:selected.maxDate||null,
      dueDate:calendar.bankDueDate||calendar.dueDate||null,
      closeDate:calendar.bankCloseDate||calendar.closeDate||null
    };
  }

  function postedCycleFromAccount(card,month){
    const account=previewAccount(card)?.account;
    if(!account||account.transactionsError||account.transactionPreviewHasMore)return null;
    const calendar=bankCalendar(card,month);
    let amount=0,count=0,maxDate='';
    for(const transaction of Array.isArray(account.transactions)?account.transactions:[]){
      if(!confirmed(transaction))continue;
      const date=isoDate(transaction?.date),value=Number(transaction?.amount);
      if(!validDate(date)||date.slice(0,7)!==month||!Number.isFinite(value))continue;
      if(calendar.bankCloseDate&&date>calendar.bankCloseDate)continue;
      if(value>0){amount+=value;count++;}
      else if(value<0&&!isPaymentCredit(transaction)){amount+=value;count++;}
      if(!maxDate||date>maxDate)maxDate=date;
    }
    amount=round2(Math.max(0,amount));
    if(!count||amount<=0)return null;
    return{
      amount,
      source:'open-finance-posted-cycle',
      official:false,
      bankBacked:true,
      billId:null,
      transactionCount:count,
      maxDate:maxDate||null,
      dueDate:calendar.bankDueDate||calendar.dueDate||null,
      closeDate:calendar.bankCloseDate||calendar.closeDate||null
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
      const status=global.invoiceStatus?.(card?.id,month),amount=Number(status?.officialTotal);
      if(!Number.isFinite(amount))return null;
      return{amount:round2(amount),source:clean(status?.officialTotalSource)||'sfp-official',official:true};
    }catch(_){return null;}
  }

  function pendingDebit(card,month){
    const account=previewAccount(card)?.account;
    if(account&&!account.transactionsError&&!account.transactionPreviewHasMore){
      return round2((account.transactions||[]).filter(tx=>{
        const status=clean(tx?.status).toUpperCase(),amount=Number(tx?.amount);
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
    return liveBill(card,month)
      ||linkedBillFromAccount(card,month)
      ||postedCycleFromAccount(card,month)
      ||storedBankBill(card,month)
      ||invoiceOfficial(card,month)
      ||null;
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
    const ref=isoDate(referenceDate),calendar=bankCalendar(card,month);
    if(!validDate(ref))return false;
    if(calendar.bankCloseDate&&ref>=calendar.bankCloseDate)return true;
    if(calendar.bankDueDate&&ref>calendar.bankDueDate)return true;
    const truth=bankTruth(card,month);
    if(truth?.source==='open-finance-bill'&&truth?.closeDate&&validDate(truth.closeDate))return ref>=truth.closeDate;
    return false;
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
    const calendar=bankCalendar(card,month),text=`Fecha dia ${calendar.closeDay} · vence dia ${calendar.dueDay}`;
    const node=[...root.querySelectorAll('small,p,span')].find(el=>/^Fecha dia \d+\s*·\s*vence dia \d+/i.test(clean(el.textContent)));
    if(node)node.textContent=text;
  }

  function patchGrid(){
    const cards=global.state?.cards||[],month=activeMonth();
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
    const current=[...modal.querySelectorAll('.metric')].find(el=>/Fatura atual/i.test(el.textContent||''));
    if(current){
      const strong=current.querySelector('strong'),small=current.querySelector('small');
      if(strong)strong.textContent=money(displayTotal(card,month));
      if(small)small.textContent=monthLabel(month);
    }
  }

  function rememberBankTruth(){
    const result=preview();
    if(!result?.ok||!Array.isArray(global.state?.cards))return false;
    let changed=false;
    const month=activeMonth();
    for(const card of global.state.cards){
      const truth=liveBill(card,month)||linkedBillFromAccount(card,month)||postedCycleFromAccount(card,month);
      if(!truth)continue;
      card.openFinanceBankBills??={};
      const previous=card.openFinanceBankBills[month];
      const next={
        amount:truth.amount,
        billId:truth.billId||null,
        source:truth.source,
        dueDate:truth.dueDate||null,
        closeDate:truth.closeDate||null,
        transactionCount:truth.transactionCount||null,
        updatedAt:new Date().toISOString()
      };
      const same=previous&&Number(previous.amount)===Number(next.amount)&&clean(previous.billId)===clean(next.billId)&&clean(previous.source)===clean(next.source)&&clean(previous.dueDate)===clean(next.dueDate)&&clean(previous.closeDate)===clean(next.closeDate);
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
    if(original.__sfpBankTruthV3)return true;
    const wrapped=function(){
      const output=original.apply(this,arguments);
      patchGrid();patchInvoiceFocus();persistRememberedTruth();
      return output;
    };
    Object.defineProperty(wrapped,'__sfpBankTruthV3',{value:true});
    global.renderCards=wrapped;try{renderCards=wrapped}catch(_){}
    return true;
  }

  function installDetailGuard(){
    const original=global.openCardDetail;
    if(typeof original!=='function')return false;
    if(original.__sfpBankTruthV3)return true;
    const wrapped=function(id){
      const output=original.apply(this,arguments);
      const card=(global.state?.cards||[]).find(item=>sameId(item.id,id));
      patchDetail(card);
      return output;
    };
    Object.defineProperty(wrapped,'__sfpBankTruthV3',{value:true});
    global.openCardDetail=wrapped;try{openCardDetail=wrapped}catch(_){}
    return true;
  }

  function install(){
    if(global[FLAG])return true;
    if(!global.state||!global.SFPOpenFinanceBills||!global.SFPOpenFinancePersonal)return false;
    if(!installRenderGuard()||!installDetailGuard())return false;
    patchGrid();patchInvoiceFocus();rememberBankTruth();
    global[FLAG]=true;
    global.SFPOpenFinanceBankTruth=Object.freeze({
      version:VERSION,
      activeMonth,
      bankCalendar,
      bankTruth,
      displayTotal,
      closed,
      linkedBillFromAccount,
      postedCycleFromAccount,
      rememberBankTruth,
      patchGrid,
      patchInvoiceFocus
    });
    return true;
  }

  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(install()||attempts>=240)clearInterval(timer);},25);
  install();
})(typeof window!=='undefined'?window:globalThis);
