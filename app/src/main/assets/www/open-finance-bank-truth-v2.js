(function installOpenFinanceBankTruthV7(global){
  'use strict';

  const VERSION=7;
  const FLAG='__SFP_OF_BANK_TRUTH_V7';
  if(global[FLAG])return;

  const round2=value=>Math.round((Number(value)||0)*100)/100;
  const sameId=(a,b)=>String(a)===String(b);
  const clean=value=>String(value??'').trim();
  const isoDate=value=>clean(value).slice(0,10);
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(isoDate(value));
  const isoMonth=value=>validDate(value)?isoDate(value).slice(0,7):'';
  const validMonth=value=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(clean(value));
  const stateToday=()=>validDate(global.state?.baseDate)?isoDate(global.state.baseDate):'';
  const localToday=()=>{
    const fixed=stateToday();
    if(fixed)return fixed;
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const localMonth=()=>localToday().slice(0,7);
  const activeMonth=card=>{
    const fallback=validMonth(global.state?.mesAtual)?global.state.mesAtual:localMonth();
    if(!card)return fallback;
    try{
      const account=previewAccount(card)?.account||null;
      const cycle=global.SFPOpenFinanceBills?.cycleForCard?.(card,account);
      const bankMonth=cycle?.month;
      if(!cycle?.source||cycle.source==='sfp-local'||!validMonth(bankMonth))return fallback;
      // Snapshot bancário antigo nunca faz a UI voltar de mês. O banco só pode
      // confirmar o mês selecionado ou avançar exatamente um ciclo, e o avanço
      // já foi validado por cycleForCard() contra a liquidação da fatura anterior.
      if(bankMonth===fallback||bankMonth===shiftMonth(fallback,1))return bankMonth;
      return fallback;
    }catch(_){return fallback;}
  };
  let persistenceBusy=false;

  function shiftMonth(month,delta){
    if(!validMonth(month))return'';
    const [year,number]=month.split('-').map(Number);
    const d=new Date(Date.UTC(year,number-1+Number(delta||0),1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  }

  function addDays(value,delta){
    const date=isoDate(value);
    if(!validDate(date))return'';
    const [y,m,d]=date.split('-').map(Number);
    const cursor=new Date(Date.UTC(y,m-1,d+Number(delta||0)));
    return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}-${String(cursor.getUTCDate()).padStart(2,'0')}`;
  }

  function preview(){
    try{return global.SFPOpenFinanceBills?.getLastPreview?.()||null;}
    catch(_){return null;}
  }

  function itemName(item){return global.SFPOpenFinancePersonal?.itemDisplayName?.(item)||clean(item?.institution)||clean(item?.connectorName);}

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
    const candidates=bills.filter(bill=>(isoMonth(bill?.dueDate)||isoMonth(bill?.billClosingDate))===month);
    if(!candidates.length)return null;
    return [...candidates].sort((a,b)=>isoDate(b?.dueDate).localeCompare(isoDate(a?.dueDate)))[0]||null;
  }

  function explicitDateForMonth(card,month,kind,account=null,bill=null){
    const inv=invoiceRecord(card,month);
    const key=kind==='due'?'balanceDueDate':'balanceCloseDate';
    const candidates=kind==='due'
      ?[bill?.dueDate,inv?.documentDueDate,account?.creditData?.[key],card?.openFinanceBalanceDueDate,(card?.openFinanceBankBills?.[month]?.source==='open-finance-bill'?card.openFinanceBankBills[month].dueDate:card?.openFinanceBankBills?.[month]?.bankDueDate)]
      :[bill?.billClosingDate,inv?.documentCloseDate,account?.creditData?.[key],card?.openFinanceBalanceCloseDate,(card?.openFinanceBankBills?.[month]?.source==='open-finance-bill'?card.openFinanceBankBills[month].closeDate:card?.openFinanceBankBills?.[month]?.bankCloseDate)];
    for(const candidate of candidates){
      const value=isoDate(candidate);
      // Datas de outro mês são snapshot antigo da instituição. Nunca ancoram o ciclo atual.
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

  function cycleBounds(card,month){
    const calendar=bankCalendar(card,month);
    const closeDate=validDate(calendar.closeDate)?calendar.closeDate:fallbackDate(card,month,'close');
    const previousMonth=shiftMonth(month,-1);
    // O dia nominal cadastrado é mais seguro que reutilizar um balanceCloseDate antigo
    // (que pode ter sido deslocado por fim de semana/feriado).
    const previousClose=fallbackDate(card,previousMonth,'close');
    const startDate=addDays(previousClose,1);
    let endDate=closeDate;
    const today=localToday();
    if(month===localMonth()&&validDate(today)&&validDate(endDate)&&today<endDate)endDate=today;
    return{startDate,endDate,closeDate,dueDate:calendar.dueDate,calendar};
  }

  function liveBill(card,month){
    const bill=currentBill(card,month);
    if(!bill)return null;
    if(bill.totalAmount==null||clean(bill.totalAmount)==='')return null;
    const amount=Math.abs(Number(bill.totalAmount));
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
    const text=normalizedText(transaction?.description);
    return /\b(pagamento|payment|pgto|pag fatura|pagar fatura|fatura paga|debito automatico|autopay|liquidacao)\b/.test(text);
  }

  function cancelled(transaction){
    const status=clean(transaction?.status).toUpperCase();
    return status.includes('CANCEL')||status.includes('REVERSED')||status.includes('DECLINED')||status.includes('FAILED');
  }

  function confirmed(transaction){
    const status=clean(transaction?.status).toUpperCase();
    if(!status)return true;
    if(status.includes('PENDING')||cancelled(transaction))return false;
    return ['POSTED','COMPLETED','CLEARED','SETTLED','CONFIRMED'].some(token=>status.includes(token));
  }

  function purchaseHasTransactionKey(purchase,key){
    if(!purchase||!key)return false;
    if(clean(purchase.externalId)===key)return true;
    return Array.isArray(purchase.openFinanceExternalIds)&&purchase.openFinanceExternalIds.includes(key);
  }

  function linkedInstallmentEvidence(card,transaction,month){
    if(!card||!validMonth(month)||typeof global.purchaseInstallment!=='function')return false;
    const id=clean(transaction?.id),amount=Math.abs(Number(transaction?.amount));
    if(!id||!Number.isFinite(amount)||amount<=0)return false;
    const key=`pluggy:${id}`;
    const purchase=(global.state?.purchases||[]).find(p=>
      sameId(p?.cardId,card.id)
      &&p?.status!=='cancelled'
      &&purchaseHasTransactionKey(p,key)
    );
    if(!purchase)return false;
    try{
      const installment=global.purchaseInstallment(purchase,month);
      const localAmount=Math.abs(Number(installment?.amount));
      return Number.isFinite(localAmount)&&Math.abs(localAmount-amount)<.02;
    }catch(_){return false;}
  }

  function belongsToCycle(transaction,month,bounds,card=null){
    const forecast=clean(transaction?.billForecastDate);
    // Quando o banco informa explicitamente a fatura, essa evidência continua soberana.
    if(validMonth(forecast))return forecast===month;
    const txDate=isoDate(transaction?.date);
    if(!validDate(txDate))return false;

    const active=card?activeMonth(card):'';
    if(validMonth(active)&&linkedInstallmentEvidence(card,transaction,active)){
      // Alguns emissores (Nubank confirmado fisicamente) tratam uma compra do próprio
      // dia de fechamento como pertencente à fatura seguinte. O SFP antes deixava esse
      // dia no ciclo anterior. Para uma transação Pluggy já vinculada à parcela local,
      // movemos a fronteira inteira: sai do ciclo anterior e entra no ciclo ativo.
      if(month===active&&addDays(txDate,1)===bounds.startDate)return true;
      if(shiftMonth(month,1)===active&&txDate===bounds.endDate)return false;
    }
    return txDate>=bounds.startDate&&txDate<=bounds.endDate;
  }

  function cycleTransactions(card,month,{confirmedOnly=false}={}){
    const account=previewAccount(card)?.account;
    if(!account||account.transactionsError||account.transactionPreviewHasMore)return null;
    const bounds=cycleBounds(card,month);
    if(!validDate(bounds.startDate)||!validDate(bounds.endDate))return null;

    let debits=0,credits=0,paymentsExcluded=0,count=0,pendingCount=0,maxDate='';
    for(const transaction of Array.isArray(account.transactions)?account.transactions:[]){
      if(cancelled(transaction))continue;
      if(confirmedOnly&&!confirmed(transaction))continue;
      const txDate=isoDate(transaction?.date),amount=Number(transaction?.amount);
      if(!belongsToCycle(transaction,month,bounds,card)||!Number.isFinite(amount)||Math.abs(amount)<.0001)continue;

      if(amount<0){
        if(isPaymentCredit(transaction)){paymentsExcluded+=Math.abs(amount);continue;}
        credits+=Math.abs(amount);
      }else{
        debits+=amount;
      }
      count++;
      if(!confirmed(transaction))pendingCount++;
      if(!maxDate||txDate>maxDate)maxDate=txDate;
    }

    const supplement=confirmedOnly?{amount:0,count:0,evidence:[]}:missingInstallmentSupplement(card,month,account,bounds);
    if(!count&&!supplement.count)return null;
    const bankDebits=round2(debits);
    debits+=supplement.amount;
    const amount=round2(Math.max(0,debits-credits));
    return{
      amount,
      source:supplement.count?'open-finance-cycle-reconciled':(pendingCount?'open-finance-cycle-transactions':'open-finance-posted-cycle'),
      official:false,
      bankBacked:true,
      billId:null,
      transactionCount:count,
      pendingCount,
      debitAmount:round2(debits),
      bankDebitAmount:bankDebits,
      localSupplementAmount:supplement.amount,
      localSupplementCount:supplement.count,
      localSupplementEvidence:supplement.evidence,
      creditAmount:round2(credits),
      paymentsExcluded:round2(paymentsExcluded),
      periodStart:bounds.startDate,
      periodEnd:bounds.endDate,
      maxDate:maxDate||null,
      dueDate:bounds.calendar.bankDueDate||bounds.dueDate||null,
      bankDueDate:bounds.calendar.bankDueDate,
      bankCloseDate:bounds.calendar.bankCloseDate,
      closeDate:bounds.calendar.bankCloseDate||bounds.closeDate||null
    };
  }

  function linkedBillFromAccount(card,month){
    const account=previewAccount(card)?.account;
    if(!account||account.transactionsError||account.transactionPreviewHasMore)return null;
    const bounds=cycleBounds(card,month);
    const groups=new Map();

    for(const transaction of Array.isArray(account.transactions)?account.transactions:[]){
      const billId=clean(transaction?.billId),amount=Number(transaction?.amount),txDate=isoDate(transaction?.date);
      if(cancelled(transaction)||!billId||!Number.isFinite(amount)||!validDate(txDate))continue;
      if(!belongsToCycle(transaction,month,bounds,card))continue;
      const group=groups.get(billId)||{billId,debits:0,credits:0,paymentsExcluded:0,count:0,pendingCount:0,maxDate:''};
      if(amount<0){
        if(isPaymentCredit(transaction))group.paymentsExcluded+=Math.abs(amount);
        else group.credits+=Math.abs(amount);
      }else group.debits+=amount;
      // A payment alone is not evidence of an invoice total, even with a billId.
      if(amount<0&&isPaymentCredit(transaction)){groups.set(billId,group);continue;}
      group.count++;
      if(!confirmed(transaction))group.pendingCount++;
      if(!group.maxDate||txDate>group.maxDate)group.maxDate=txDate;
      groups.set(billId,group);
    }

    const candidates=[...groups.values()]
      .map(group=>({...group,amount:round2(Math.max(0,group.debits-group.credits))}))
      .filter(group=>group.count&&group.amount>=0)
      .sort((a,b)=>clean(b.maxDate).localeCompare(clean(a.maxDate))||b.amount-a.amount);
    const selected=candidates[0];
    if(!selected)return null;

    return{
      amount:selected.amount,
      source:'open-finance-linked-transactions',
      official:false,
      bankBacked:true,
      billId:selected.billId,
      transactionCount:selected.count,
      pendingCount:selected.pendingCount,
      debitAmount:round2(selected.debits),
      creditAmount:round2(selected.credits),
      paymentsExcluded:round2(selected.paymentsExcluded),
      periodStart:bounds.startDate,
      periodEnd:bounds.endDate,
      maxDate:selected.maxDate||null,
      dueDate:bounds.calendar.bankDueDate||bounds.dueDate||null,
      bankDueDate:bounds.calendar.bankDueDate,
      bankCloseDate:bounds.calendar.bankCloseDate,
      closeDate:bounds.calendar.bankCloseDate||bounds.closeDate||null
    };
  }

  function postedCycleFromAccount(card,month){
    return cycleTransactions(card,month,{confirmedOnly:true});
  }

  function storedBankBill(card,month){
    const record=card?.openFinanceBankBills?.[month];
    const amount=Number(record?.amount);
    if(!Number.isFinite(amount)||amount<0)return null;
    // V3 podia persistir uma soma por mês-calendário. Não reutilize esse cache como verdade do ciclo.
    if(Number(record?.schema||0)<4&&record?.source!=='open-finance-bill')return null;
    // Older V4 builds cached payment-only groups as a zero-value invoice.
    if(record.source==='open-finance-linked-transactions'&&!record.official
      &&Number(record.debitAmount)===0&&Number(record.creditAmount)===0
      &&Number(record.paymentsExcluded)>0)return null;
    return{...record,amount:round2(amount),bankBacked:true};
  }

  function invoiceOfficial(card,month){
    try{
      const status=global.invoiceStatus?.(card?.id,month),amount=Number(status?.officialTotal);
      if(!Number.isFinite(amount))return null;
      const source=clean(status?.officialTotalSource);
      if(source!=='open-finance-bill'&&source!=='document')return null;
      return{amount:round2(amount),source:source||'sfp-official',official:true,bankBacked:source==='open-finance-bill'};
    }catch(_){return null;}
  }

  function localCalculated(card,month){
    try{return round2(Number(global.invoiceCalculated?.(card?.id,month))||0);}
    catch(_){return 0;}
  }

  function bankTruth(card,month){
    return liveBill(card,month)
      ||invoiceOfficial(card,month)
      ||(storedBankBill(card,month)?.official?storedBankBill(card,month):null)
      ||linkedBillFromAccount(card,month)
      ||cycleTransactions(card,month)
      ||storedBankBill(card,month)
      ||null;
  }

  function displayTotal(card,month){
    const truth=bankTruth(card,month);
    if(truth)return truth.amount;
    // Regra de segurança: nunca some "SFP local + pendências do banco".
    // Os mesmos lançamentos podem existir dos dois lados e isso duplica a fatura.
    return localCalculated(card,month);
  }

  function installmentMerchant(description,n,total){
    const text=normalizedText(description).replace(/\s+/g,' ');
    const suffix=text.match(/(\d{1,3})\s*\/\s*(\d{1,3})\s*$/);
    // Remove a changing installment label only when both numbers match bank metadata.
    return suffix&&Number(suffix[1])===n&&Number(suffix[2])===total
      ?text.slice(0,suffix.index).trim():text;
  }

  function merchantTokens(value){
    return normalizedText(value)
      .replace(/\bparcela\b/g,' ')
      .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ')
      .trim().split(/\s+/).filter(token=>token.length>=3);
  }

  function merchantAffinity(a,b){
    const left=merchantTokens(a),right=merchantTokens(b);
    if(!left.length||!right.length)return false;
    let common=0;
    for(const token of left){
      if(right.some(other=>token===other||(token.length>=5&&other.length>=5&&(token.startsWith(other)||other.startsWith(token)))))common++;
    }
    return common>=2||(common===1&&left.length===1&&right.length===1);
  }

  function installmentMeta(transaction){
    const meta=transaction?.installment||{};
    const n=Math.trunc(Number(meta.installmentNumber)||0),total=Math.trunc(Number(meta.totalInstallments)||0);
    return{n,total,valid:n>0&&total>1&&n<=total&&total<=120};
  }

  function sameLocalInstallment(transaction,purchase,installment,{requireNumber=true}={}){
    const amount=Math.abs(Number(transaction?.amount)),localAmount=Math.abs(Number(installment?.amount));
    if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(localAmount)||Math.abs(amount-localAmount)>=.02)return false;
    if(!merchantAffinity(purchase?.desc,transaction?.description))return false;
    const meta=installmentMeta(transaction);
    if(requireNumber){
      return meta.valid&&meta.total===Number(installment?.total)&&meta.n===Number(installment?.n);
    }
    return !meta.valid||(meta.total===Number(installment?.total)&&meta.n===Number(installment?.n));
  }

  function missingInstallmentSupplement(card,month,account,bounds){
    if(!card||month!==activeMonth(card)||typeof global.purchaseInstallment!=='function')return{amount:0,count:0,evidence:[]};
    const transactions=Array.isArray(account?.transactions)?account.transactions:[];
    const evidence=[];
    let amount=0,count=0;

    for(const purchase of global.state?.purchases||[]){
      if(!sameId(purchase?.cardId,card.id)||purchase?.status==='cancelled'||Number(purchase?.installments)<=1)continue;
      let installment=null;
      try{installment=global.purchaseInstallment(purchase,month);}catch(_){}
      if(!installment||Number(installment.total)<=1||Number(installment.n)<=0)continue;

      // Se qualquer cobrança da mesma série já existe no ciclo atual, nunca complemente.
      // Isso cobre estados legados em que o mês local da parcela ficou deslocado,
      // mas a cobrança bancária correta já foi reclassificada para o ciclo ativo.
      const currentPresent=transactions.some(tx=>{
        if(cancelled(tx)||Number(tx?.amount)<=0||!belongsToCycle(tx,month,bounds,card))return false;
        const txAmount=Math.abs(Number(tx.amount)),localAmount=Math.abs(Number(installment.amount));
        if(!Number.isFinite(txAmount)||!Number.isFinite(localAmount)||Math.abs(txAmount-localAmount)>=.02)return false;
        if(!merchantAffinity(purchase?.desc,tx?.description))return false;
        const meta=installmentMeta(tx);
        return !meta.valid||meta.total===Number(installment.total);
      });
      if(currentPresent)continue;

      // Exigimos uma parcela adjacente explicitamente numerada pela instituição.
      const adjacent=transactions
        .map(tx=>({tx,meta:installmentMeta(tx)}))
        .filter(row=>
          !cancelled(row.tx)&&Number(row.tx?.amount)>0&&row.meta.valid
          &&row.meta.total===Number(installment.total)
          &&Math.abs(row.meta.n-Number(installment.n))===1
          &&merchantAffinity(purchase?.desc,row.tx?.description)
          &&Math.abs(Math.abs(Number(row.tx.amount))-Math.abs(Number(installment.amount)))<.02
        )
        .sort((a,b)=>Math.abs(a.meta.n-Number(installment.n))-Math.abs(b.meta.n-Number(installment.n)))[0];

      if(!adjacent)continue;
      const providerAmount=Math.abs(Number(adjacent.tx.amount));
      amount+=providerAmount;count++;
      evidence.push({
        purchaseId:purchase.id,
        installmentNumber:Number(installment.n),
        totalInstallments:Number(installment.total),
        localAmount:round2(installment.amount),
        providerAmount:round2(providerAmount),
        adjacentTransactionId:clean(adjacent.tx.id)||null,
        adjacentInstallmentNumber:adjacent.meta.n
      });
    }
    return{amount:round2(amount),count,evidence};
  }

  // These are identified future commitments, not an assertion of complete bank coverage.
  function liveFutureCommitments(card,month){
    const account=previewAccount(card)?.account;
    if(!account||account.transactionsError||account.transactionPreviewHasMore)return null;
    const seen=new Set(),rows=[];
    for(const tx of account.transactions||[]){
      if(tx.id&&seen.has(tx.id))continue;
      if(tx.id)seen.add(tx.id);
      if(cancelled(tx)||isPaymentCredit(tx)||!Number.isFinite(Number(tx.amount))||Number(tx.amount)===0)continue;
      const forecast=clean(tx.billForecastDate);
      if(!validMonth(forecast)||forecast<month)continue;
      const meta=tx.installment||{},n=Number(meta.installmentNumber),total=Number(meta.totalInstallments);
      const valid=Number(tx.amount)>0&&Number.isInteger(n)&&Number.isInteger(total)&&n>0&&total>=n&&total<=120;
      const group=JSON.stringify([valid?installmentMerchant(tx.description,n,total):normalizedText(tx.description),total,valid?shiftMonth(forecast,1-n):forecast]);
      rows.push({tx,forecast,n,total,valid,group});
    }
    const projected=new Map(),explicit=new Set(),monthly=new Map();
    let amount=0,nextAmount=0,count=0;
    for(const row of rows){
      if(row.forecast<=month)continue;
      amount+=Number(row.tx.amount);
      monthly.set(row.forecast,(monthly.get(row.forecast)||0)+Number(row.tx.amount));
      if(row.forecast===shiftMonth(month,1))nextAmount+=Number(row.tx.amount);
      if(row.valid){count++;explicit.add(`${row.group}|${row.n}|${row.forecast}`);}
    }
    for(const row of rows){
      if(!row.valid)continue;
      // Repeated indistinguishable purchases cannot safely be grouped for projection.
      if(rows.filter(other=>other.group===row.group&&other.n===row.n&&other.forecast===row.forecast).length>1)continue;
      for(let n=row.n+1;n<=row.total;n++){
        const target=shiftMonth(row.forecast,n-row.n),key=`${row.group}|${n}|${target}`;
        if(target<=month||explicit.has(key)||projected.has(key))continue;
        projected.set(key,{month:target,amount:Number(row.tx.amount)});
      }
    }
    for(const row of projected.values()){
      amount+=row.amount;count++;
      monthly.set(row.month,(monthly.get(row.month)||0)+row.amount);
      if(row.month===shiftMonth(month,1))nextAmount+=row.amount;
    }
    const lastMonth=[...monthly].filter(([,value])=>round2(value)>0).map(([key])=>key).sort().pop()||null;
    const monthIndex=value=>{const [y,m]=value.split('-').map(Number);return y*12+m;};
    const monthsRemaining=lastMonth?monthIndex(lastMonth)-monthIndex(month):null;
    return {schema:3,month,monthsRemaining,lastMonth,count:count||null,amount:amount>0?round2(amount):null,
      nextAmount:nextAmount>0?round2(nextAmount):null,estimated:true,complete:false};
  }

  function futureCommitments(card,month){
    const live=liveFutureCommitments(card,month);
    if(live)return {...live,stale:false};
    const stored=card?.openFinanceFutureCommitments;
    return stored?.schema===3&&stored.month===month?{...stored,stale:true}:null;
  }

  function patchFutureGrid(node,card,month){
    // Local plans remain authoritative when present; never add a second bank projection to them.
    if((global.state?.purchases||[]).some(p=>sameId(p.cardId,card.id)&&p.status!=='cancelled'))return;
    const future=futureCommitments(card,month);
    const stat=label=>[...node.querySelectorAll('.sfp-card-v2-stat')].find(el=>clean(el.querySelector('small')?.textContent)===label)?.querySelector('strong');
    const installments=stat('Meses restantes'),next=stat('Próxima fatura');
    if(installments)installments.textContent=future?.monthsRemaining?`${future.monthsRemaining} meses${future.stale?' (última leitura)':''}`:'Não informado';
    if(next)next.textContent=future?.nextAmount?`${money(future.nextAmount)} estimados`:'Não informada';
    const total=node.querySelector('.sfp-card-v2-progress-top span:last-child');
    if(total)total.textContent=future?.amount?`${money(future.amount)} futuros identificados${future.stale?' · última leitura':''}`:'Compromissos futuros não confirmados';
  }

  function paidAmount(card,month){
    try{return round2(Number(global.invoiceStatus?.(card?.id,month)?.paidAmount)||0);}
    catch(_){return 0;}
  }

  function closed(card,month,referenceDate=localToday()){
    const ref=isoDate(referenceDate),calendar=bankCalendar(card,month);
    if(!validDate(ref))return false;
    if(validDate(calendar.closeDate)&&ref>=calendar.closeDate)return true;
    if(calendar.bankDueDate&&ref>calendar.bankDueDate)return true;
    const truth=bankTruth(card,month);
    if(truth?.source==='open-finance-bill'&&truth?.closeDate&&validDate(truth.closeDate))return ref>=truth.closeDate;
    return false;
  }

  function monthLabel(month){try{return global.monthName?.(month)||month;}catch(_){return month;}}
  function money(value){try{return global.brl?.(value)||`R$ ${Number(value||0).toFixed(2).replace('.',',')}`;}catch(_){return`R$ ${Number(value||0).toFixed(2).replace('.',',')}`;}}

  function statusText(card,month){
    const truth=bankTruth(card,month);
    const total=truth?.amount??localCalculated(card,month);
    const remaining=Math.max(0,round2(total-paidAmount(card,month)));
    if(remaining<=.009){
      if(paidAmount(card,month)>.009)return truth?.official?'Fatura quitada':'Estimativa quitada';
      return truth?.official?'Sem valor a pagar informado pelo banco':'Fatura sem total confirmado';
    }
    if(previewAccount(card)?.account?.transactionsError&&!truth?.official)return 'Última leitura · transações indisponíveis';
    if(truth?.official)return closed(card,month)?'Fechada':`${money(remaining)} ainda em aberto`;
    if(truth?.bankBacked)return closed(card,month)?'Estimativa bancária · ciclo fechado':`Estimativa bancária · ${money(remaining)} no ciclo`;
    return closed(card,month)?'Estimativa SFP · ciclo fechado':`${money(remaining)} estimados no SFP`;
  }

  function patchCalendarText(root,card,month){
    if(!root||!card)return;
    const calendar=bankCalendar(card,month),text=`Fecha dia ${calendar.closeDay} · vence dia ${calendar.dueDay}`;
    const node=[...root.querySelectorAll('small,p,span')].find(el=>/^Fecha dia \d+\s*·\s*vence dia \d+/i.test(clean(el.textContent)));
    if(node)node.textContent=text;
  }

  function patchGrid(){
    const cards=global.state?.cards||[];
    const nodes=[...document.querySelectorAll('#cardsGrid .management-card--interactive')];
    nodes.forEach((node,index)=>{
      const card=cards[index];
      if(!card)return;
      const month=activeMonth(card);
      const truth=bankTruth(card,month);
      const hasOpenFinance=truth||Number.isFinite(Number(card.openFinanceUsedAmount))||card.openFinanceBalanceDueDate||card.openFinanceBalanceCloseDate;
      if(!hasOpenFinance)return;
      patchCalendarText(node,card,month);
      patchFutureGrid(node,card,month);
      const primary=node.querySelector('.sfp-card-v2-primary');
      if(primary){
        const label=primary.querySelector('small'),strong=primary.querySelector('strong'),status=primary.querySelector('span');
        if(label)label.textContent=`Fatura atual · ${monthLabel(month)}`;
        if(strong)strong.textContent=money(displayTotal(card,month));
        if(status)status.textContent=statusText(card,month);
      }
      const hasLocalPlans=(global.state?.purchases||[]).some(p=>sameId(p.cardId,card.id)&&p.status!=='cancelled');
      if(hasLocalPlans){
        const next=[...node.querySelectorAll('.sfp-card-v2-stat')].find(el=>clean(el.querySelector('small')?.textContent)==='Próxima fatura')?.querySelector('strong');
        if(next)next.textContent=money(displayTotal(card,shiftMonth(month,1)));
      }
      if(node.dataset.sfpBankTruthClick!=='1'){
        node.dataset.sfpBankTruthClick='1';
        node.addEventListener('click',()=>{global.state.ui??={};global.state.ui.invoiceMonthByCard??={};global.state.ui.invoiceMonthByCard[card.id]=activeMonth(card);},true);
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
    const month=activeMonth(card),modal=document.querySelector('#modalRoot .modal');
    if(!modal)return;
    // O detalhe aberto representa o ciclo bancário ativo. Persista esse mês antes
    // do botão "Abrir fatura" para impedir que currentInvoiceMonth() salte para
    // o próximo ciclo depois do dia de fechamento.
    global.state.ui??={};
    global.state.ui.invoiceMonthByCard??={};
    global.state.ui.invoiceMonthByCard[card.id]=month;
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
    for(const card of global.state.cards){
      const month=activeMonth(card);
      const future=liveFutureCommitments(card,month);
      if(future&&JSON.stringify(card.openFinanceFutureCommitments)!==JSON.stringify(future)){
        card.openFinanceFutureCommitments=future;changed=true;
      }
      const truth=liveBill(card,month)||linkedBillFromAccount(card,month)||cycleTransactions(card,month);
      if(!truth)continue;
      card.openFinanceBankBills??={};
      const previous=card.openFinanceBankBills[month];
      if(previous?.official&&!truth.official)continue;
      const next={
        schema:4,
        amount:truth.amount,
        official:Boolean(truth.official),
        billId:truth.billId||null,
        source:truth.source,
        dueDate:truth.dueDate||null,
        closeDate:truth.closeDate||null,
        bankDueDate:truth.bankDueDate||null,
        bankCloseDate:truth.bankCloseDate||null,
        periodStart:truth.periodStart||null,
        periodEnd:truth.periodEnd||null,
        transactionCount:truth.transactionCount||null,
        pendingCount:truth.pendingCount||0,
        debitAmount:truth.debitAmount??null,
        creditAmount:truth.creditAmount??null,
        paymentsExcluded:truth.paymentsExcluded??null,
        updatedAt:new Date().toISOString()
      };
      const comparable=value=>JSON.stringify({
        schema:value?.schema||0,amount:Number(value?.amount),official:Boolean(value?.official),billId:clean(value?.billId),
        source:clean(value?.source),dueDate:clean(value?.dueDate),closeDate:clean(value?.closeDate),bankDueDate:clean(value?.bankDueDate),bankCloseDate:clean(value?.bankCloseDate),
        periodStart:clean(value?.periodStart),periodEnd:clean(value?.periodEnd),transactionCount:Number(value?.transactionCount||0),
        pendingCount:Number(value?.pendingCount||0),debitAmount:value?.debitAmount??null,creditAmount:value?.creditAmount??null,paymentsExcluded:value?.paymentsExcluded??null
      });
      if(!previous||comparable(previous)!==comparable(next)){card.openFinanceBankBills[month]=next;changed=true;}
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
    if(original.__sfpBankTruthV4)return true;
    const wrapped=function(){
      const output=original.apply(this,arguments);
      patchGrid();patchInvoiceFocus();persistRememberedTruth();
      return output;
    };
    Object.defineProperty(wrapped,'__sfpBankTruthV4',{value:true});
    global.renderCards=wrapped;try{renderCards=wrapped}catch(_){}
    return true;
  }

  function installDetailGuard(){
    const original=global.openCardDetail;
    if(typeof original!=='function')return false;
    if(original.__sfpBankTruthV4)return true;
    const wrapped=function(id){
      const output=original.apply(this,arguments);
      const card=(global.state?.cards||[]).find(item=>sameId(item.id,id));
      patchDetail(card);
      return output;
    };
    Object.defineProperty(wrapped,'__sfpBankTruthV4',{value:true});
    global.openCardDetail=wrapped;try{openCardDetail=wrapped}catch(_){}
    return true;
  }

  function installInvoiceGuard(){
    const original=global.openInvoiceDetail;
    if(typeof original!=='function')return false;
    if(original.__sfpBankTruthV4)return true;
    const wrapped=function(id){
      const card=(global.state?.cards||[]).find(item=>sameId(item.id,id));
      if(card){
        global.state.ui??={};
        global.state.ui.invoiceMonthByCard??={};
        global.state.ui.invoiceMonthByCard[card.id]=activeMonth();
      }
      return original.apply(this,arguments);
    };
    Object.defineProperty(wrapped,'__sfpBankTruthV4',{value:true});
    global.openInvoiceDetail=wrapped;try{openInvoiceDetail=wrapped}catch(_){}
    return true;
  }

  function install(){
    if(global[FLAG])return true;
    if(!global.state||!global.SFPOpenFinanceBills||!global.SFPOpenFinancePersonal)return false;
    if(!installRenderGuard()||!installDetailGuard()||!installInvoiceGuard())return false;
    patchGrid();patchInvoiceFocus();rememberBankTruth();
    // Other renderers may replace the card HTML after renderCards returns.
    const grid=document.getElementById('cardsGrid');
    if(grid&&typeof global.MutationObserver==='function'){
      new global.MutationObserver(()=>{patchGrid();patchInvoiceFocus();}).observe(grid,{childList:true});
    }
    global[FLAG]=true;
    global.SFPOpenFinanceBankTruth=Object.freeze({
      version:VERSION,
      activeMonth,
      bankCalendar,
      cycleBounds,
      bankTruth,
      displayTotal,
      futureCommitments,
      closed,
      linkedBillFromAccount,
      postedCycleFromAccount,
      cycleTransactions,
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
