(function(root){
  'use strict';

  const MONEY_SOURCE='(?:[+-]\\s*)?(?:R\\$\\s*)?(?:[+-]\\s*)?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{2}|\\.\\d{2})';

  function normalize(value){
    return String(value||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  }

  function linesOf(text){
    return String(text||'').replace(/\u00a0/g,' ').split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
  }

  function parseMoney(value){
    let raw=String(value||'').trim(),negative=/-/.test(raw),clean=raw.replace(/R\$/gi,'').replace(/[+\-\s]/g,'');
    if(clean.includes(',')&&clean.includes('.'))clean=clean.lastIndexOf(',')>clean.lastIndexOf('.')?clean.replace(/\./g,'').replace(',','.'):clean.replace(/,/g,'');
    else if(clean.includes(','))clean=clean.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(?:\.\d{3})+$/.test(clean))clean=clean.replace(/\./g,'');
    const number=Number.parseFloat(clean);
    if(!Number.isFinite(number))return null;
    return negative?-Math.abs(number):number;
  }

  function moneyMatches(line){
    const regex=new RegExp(MONEY_SOURCE,'gi');
    return [...String(line||'').matchAll(regex)].map(match=>({raw:match[0],index:match.index,value:parseMoney(match[0])})).filter(match=>Number.isFinite(match.value));
  }

  function cents(value){return Math.round(Number(value||0)*100)}
  function money(value){return Math.round(Number(value||0)*100)/100}

  function fullDateIn(value){
    const match=String(value||'').match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
    if(!match)return null;
    const year=match[3].length===2?Number(`20${match[3]}`):Number(match[3]),month=Number(match[2]),day=Number(match[1]);
    const date=new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T12:00:00`);
    if(Number.isNaN(date.getTime())||date.getFullYear()!==year||date.getMonth()+1!==month||date.getDate()!==day)return null;
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function transactionDate(line,{invoiceMonth=null,dueDate=null}={}){
    const match=String(line||'').match(/^\s*(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
    if(!match)return null;
    const dueYear=Number((dueDate||invoiceMonth||'').slice(0,4))||new Date().getFullYear(),dueMonth=Number((dueDate||invoiceMonth||'').slice(5,7))||12;
    const month=Number(match[2]),day=Number(match[1]);
    let year=match[3]?(match[3].length===2?Number(`20${match[3]}`):Number(match[3])):dueYear;
    if(!match[3]&&month>dueMonth+6)year--;
    const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,date=new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime())&&date.getFullYear()===year&&date.getMonth()+1===month&&date.getDate()===day?{raw:match[0],date:value}:null;
  }

  function moneyNear(lines,predicate,{pick='last',lookAhead=2}={}){
    for(let index=0;index<lines.length;index++){
      if(!predicate(normalize(lines[index])))continue;
      for(let offset=0;offset<=lookAhead&&index+offset<lines.length;offset++){
        const matches=moneyMatches(lines[index+offset]);
        if(matches.length){
          const selected=pick==='first'?matches[0]:matches[matches.length-1];
          return money(selected.value);
        }
      }
    }
    return null;
  }

  function dateNear(lines,predicate,{lookAhead=2}={}){
    for(let index=0;index<lines.length;index++){
      if(!predicate(normalize(lines[index])))continue;
      for(let offset=0;offset<=lookAhead&&index+offset<lines.length;offset++){
        const date=fullDateIn(lines[index+offset]);
        if(date)return date;
      }
    }
    return null;
  }

  function exactOrNextMoney(lines,predicates,{pick='last'}={}){
    for(const predicate of predicates){
      const result=moneyNear(lines,predicate,{pick});
      if(result!=null)return result;
    }
    return null;
  }

  function extractMeta(lines){
    const officialTotal=exactOrNextMoney(lines,[
      line=>/\btotal desta fatura\b/.test(line),
      line=>/\bo total da sua fatura e\b/.test(line),
      line=>/^(?:=\s*)?total da fatura(?: atual)?\b/.test(line)&&!line.includes('anterior'),
      line=>/^valor da fatura\b/.test(line)
    ],{pick:'first'});
    const meta={source:'pdf'};
    if(officialTotal!=null)meta.officialTotal=Math.abs(officialTotal);
    const previousInvoiceTotal=moneyNear(lines,line=>/\btotal da fatura anterior\b/.test(line),{pick:'last'});
    if(previousInvoiceTotal!=null)meta.previousInvoiceTotal=Math.abs(previousInvoiceTotal);
    const financedBalance=moneyNear(lines,line=>/\bsaldo financiado\b/.test(line),{pick:'last'});
    if(financedBalance!=null)meta.financedBalance=Math.abs(financedBalance);
    const currentChargesTotal=exactOrNextMoney(lines,[
      line=>/\btotal dos lancamentos atuais\b/.test(line),
      line=>/(?:^|\s)lancamentos atuais\b/.test(line)&&!line.includes('total da fatura anterior')
    ],{pick:'last'});
    if(currentChargesTotal!=null)meta.currentChargesTotal=Math.abs(currentChargesTotal);
    const previousPaymentsTotal=moneyNear(lines,line=>/\btotal dos pagamentos\b/.test(line),{pick:'first'});
    if(previousPaymentsTotal!=null)meta.previousPaymentsTotal=Math.abs(previousPaymentsTotal);
    const futureInstallmentsTotal=moneyNear(lines,line=>/\btotal para proximas faturas\b/.test(line),{pick:'first'});
    if(futureInstallmentsTotal!=null)meta.futureInstallmentsTotal=Math.abs(futureInstallmentsTotal);
    const nextInvoiceTotal=moneyNear(lines,line=>/^proxima fatura\b/.test(line),{pick:'first'});
    if(nextInvoiceTotal!=null)meta.nextInvoiceTotal=Math.abs(nextInvoiceTotal);
    const minimumPayment=moneyNear(lines,line=>/\bpagamento minimo\b/.test(line),{pick:'first'});
    if(minimumPayment!=null)meta.minimumPayment=Math.abs(minimumPayment);
    const availableLimit=moneyNear(lines,line=>/\blimite disponivel\b/.test(line),{pick:'first'});
    if(availableLimit!=null)meta.availableLimit=Math.abs(availableLimit);
    const totalLimit=moneyNear(lines,line=>/\blimite total(?: de credito)?\b/.test(line)&&!line.includes('utilizado'),{pick:'last'});
    if(totalLimit!=null)meta.totalLimit=Math.abs(totalLimit);
    const dueDate=dateNear(lines,line=>(/^vencimento\b|\bcom vencimento em\b|\bdata de vencimento\b/.test(line))&&!line.includes('apos o vencimento'));
    if(dueDate)meta.dueDate=dueDate;
    const nextClosingDate=dateNear(lines,line=>/\bprevisao(?: prox(?:ima)?)?\.? fechamento\b|\bprevisao para o proximo fechamento\b/.test(line));
    if(nextClosingDate)meta.nextClosingDate=nextClosingDate;
    return meta;
  }

  function section(lines,startPredicate,endPredicates){
    const start=lines.findIndex(line=>startPredicate(normalize(line)));
    if(start<0)return [];
    let end=lines.length;
    for(let index=start+1;index<lines.length;index++){
      const normalized=normalize(lines[index]);
      if(endPredicates.some(predicate=>predicate(normalized))){end=index;break}
    }
    return lines.slice(start+1,end);
  }

  function installmentInfo(description){
    const raw=String(description||'');
    const match=raw.match(/(?:\bparcela\s*)?\b(\d{1,2})\s*\/\s*(\d{1,3})\b/i);
    if(!match)return null;
    const installment=Number(match[1]),installments=Number(match[2]);
    if(!Number.isInteger(installment)||!Number.isInteger(installments)||installment<1||installments<2||installment>installments||installments>120)return null;
    const desc=raw.replace(match[0],' ').replace(/\s+/g,' ').replace(/^[-–—|:;\s]+|[-–—|:;\s]+$/g,'').trim();
    return {installment,installments,desc:desc||raw.trim()};
  }

  function semanticKind(description,amount,{paymentSection=false}={}){
    const text=normalize(description);
    if(paymentSection||/\bpagamento(?: recebido| da fatura| cartao)?\b/.test(text))return 'payment';
    if(/\b(estorno|reembolso|refund|cashback|credito recebido|ajuste credor)\b/.test(text))return 'credit';
    return 'purchase';
  }

  function parseDatedRows(sectionLines,{invoiceMonth=null,dueDate=null,paymentSection=false,allowContinuation=false}={}){
    const rows=[];
    let pending=null;
    const cleanFragment=value=>String(value||'').split(/\b(?:Juros e encargos|Valor original da dívida|Novo teto de juros|Crédito Rotativo|Encargos cobrados|Fique atento aos encargos|Limites? de crédito)\b/i)[0].replace(/^[-–—|:;\s]+|[-–—|:;\s]+$/g,'').replace(/\s+/g,' ').trim();
    const pushRow=(date,description,value,confidence=1)=>{
      description=cleanFragment(description);
      if(!description||/^(total|data|valor|estabelecimento)$/i.test(description))return false;
      const kind=semanticKind(description,value,{paymentSection}),info=kind==='purchase'?installmentInfo(description):null;
      rows.push({
        date,
        desc:info?.desc||description,
        amount:kind==='purchase'?Math.abs(value):-Math.abs(value),
        fitid:null,
        invoiceKind:kind,
        installment:info?.installment||null,
        installments:info?.installments||null,
        sourceSection:paymentSection?'previous_payments':'current_charges',
        extractionConfidence:confidence
      });
      return true;
    };
    for(const line of sectionLines){
      const normalized=normalize(line);
      if(/\bdata\b/.test(normalized)&&/\bvalor(?: em r\$)?\b/.test(normalized))continue;
      const date=transactionDate(line,{invoiceMonth,dueDate});
      if(date){
        const body=String(line).slice(date.raw.length).trim(),amounts=moneyMatches(body);
        if(amounts.length){
          const selected=amounts[0],description=body.slice(0,selected.index);
          pushRow(date.date,description,selected.value);
          pending=null;
        }else{
          pending={date:date.date,parts:[cleanFragment(body)].filter(Boolean)};
        }
        continue;
      }
      if(pending){
        const amounts=moneyMatches(line);
        if(amounts.length){
          const selected=amounts[0],prefix=cleanFragment(String(line).slice(0,selected.index)),description=[...pending.parts,prefix].filter(Boolean).join(' ');
          if(pushRow(pending.date,description,selected.value,.96)){pending=null;continue}
        }
        if(!/^(?:data|valor(?: em r\$)?|estabelecimento|total\b)/.test(normalized)&&!/(?:encargos cobrados|juros|novo teto|credito rotativo|fique atento|limites? de credito)/.test(normalized)){
          const fragment=cleanFragment(line);if(fragment)pending.parts.push(fragment);
        }
        continue;
      }
      if(!date){
        if(allowContinuation&&rows.length&&/^(outros?|local)\b/.test(normalized)){
          const continuation=cleanFragment(line);
          if(continuation)rows[rows.length-1].desc=`${rows[rows.length-1].desc} ${continuation}`.replace(/\s+/g,' ').trim();
        }
        continue;
      }
    }
    return rows;
  }

  function merchantKey(row){return normalize(row?.desc).replace(/\boutros?\b.*$/,'').replace(/[^a-z0-9]+/g,' ').trim()}

  function attachVerifiedInstallmentPlans(currentRows,futureRows,meta){
    const planned=[];
    for(const current of currentRows){
      if(current.invoiceKind!=='purchase'||current.installment!==1||!current.installments)continue;
      const future=futureRows.find(row=>row.installment===2&&row.installments===current.installments&&merchantKey(row)===merchantKey(current));
      if(!future)continue;
      const schedule=[money(current.amount),...Array(current.installments-1).fill(money(future.amount))],total=money(schedule.reduce((sum,value)=>sum+value,0));
      planned.push({current,future,schedule,total,futureTotal:money(schedule.slice(1).reduce((sum,value)=>sum+value,0))});
    }
    if(!planned.length||planned.length!==currentRows.filter(row=>row.invoiceKind==='purchase'&&row.installments>1).length)return {verified:false,planned:[]};
    const predictedFuture=money(planned.reduce((sum,plan)=>sum+plan.futureTotal,0));
    if(!Number.isFinite(Number(meta.futureInstallmentsTotal))||cents(predictedFuture)!==cents(meta.futureInstallmentsTotal))return {verified:false,planned:[]};
    for(const plan of planned){
      plan.current.total=plan.total;
      plan.current.installmentSchedule=plan.schedule;
      plan.current.authoritativeInstallmentPlan=true;
    }
    return {verified:true,predictedFuture,planned};
  }

  function validateStructuredInvoice({rows,meta,profileId,structured,futureRows=[],installmentPlanVerified=false}){
    const currentRows=rows.filter(row=>row.sourceSection==='current_charges'),payments=rows.filter(row=>row.invoiceKind==='payment');
    const currentNetCents=currentRows.reduce((sum,row)=>sum+(row.invoiceKind==='credit'?-Math.abs(cents(row.amount)):Math.abs(cents(row.amount))),0);
    const checks=[];
    const add=(id,label,status,details={})=>checks.push({id,label,status,...details});
    if(currentRows.length||cents(meta.officialTotal)===0)add('current_rows','Lançamentos atuais localizados','pass',{count:currentRows.length});
    else add('current_rows','Lançamentos atuais localizados','fail',{count:0});
    if(Number.isFinite(Number(meta.currentChargesTotal))){
      add('current_sum','Soma dos lançamentos atuais',currentNetCents===cents(meta.currentChargesTotal)?'pass':'fail',{actual:money(currentNetCents/100),expected:money(meta.currentChargesTotal)});
    }else add('current_sum','Soma dos lançamentos atuais','unknown',{actual:money(currentNetCents/100)});
    if(Number.isFinite(Number(meta.officialTotal))){
      const expected=Number.isFinite(Number(meta.financedBalance))&&Number.isFinite(Number(meta.currentChargesTotal))?cents(meta.financedBalance)+cents(meta.currentChargesTotal):currentNetCents;
      add('official_total','Total oficial da fatura',expected===cents(meta.officialTotal)?'pass':'fail',{actual:money(expected/100),expected:money(meta.officialTotal)});
    }else add('official_total','Total oficial da fatura','unknown');
    if(Number.isFinite(Number(meta.previousInvoiceTotal))&&Number.isFinite(Number(meta.previousPaymentsTotal))&&Number.isFinite(Number(meta.financedBalance))){
      const remainder=Math.max(0,cents(meta.previousInvoiceTotal)-cents(meta.previousPaymentsTotal));
      add('previous_cycle','Ciclo anterior separado',remainder===cents(meta.financedBalance)?'pass':'fail',{previous:money(meta.previousInvoiceTotal),payments:money(meta.previousPaymentsTotal),financed:money(meta.financedBalance)});
    }
    add('due_date','Vencimento localizado',meta.dueDate?'pass':'unknown',{value:meta.dueDate||null});
    if(futureRows.length)add('future_scope','Parcelas futuras separadas','pass',{excluded:futureRows.length,planVerified:installmentPlanVerified});
    if(payments.length)add('payment_scope','Pagamento anterior separado','pass',{count:payments.length});
    if(!structured)add('layout','Layout estrutural reconhecido','unknown');
    const failed=checks.filter(check=>check.status==='fail'),officialCheck=checks.find(check=>check.id==='official_total'),unknownCore=checks.some(check=>['official_total','due_date'].includes(check.id)&&check.status==='unknown')||(checks.find(check=>check.id==='current_sum')?.status==='unknown'&&officialCheck?.status!=='pass');
    const status=failed.length?'blocked':unknownCore?'review':'verified',importAllowed=status==='verified';
    const reason=failed.length
      ?`Os valores extraídos não fecham com o documento (${failed.map(check=>check.label.toLowerCase()).join(', ')}).`
      :status==='review'
        ?'O PDF foi lido, mas faltam dados para comprovar a soma com segurança.'
        :`Leitura conferida: ${currentRows.length} lançamento(s) atual(is) somam R$ ${money(currentNetCents/100).toFixed(2).replace('.',',')} e fecham com o total oficial.`;
    return {status,importAllowed,profileId,reason,checks,currentRows:currentRows.length,payments:payments.length,futureRowsExcluded:futureRows.length,currentNet:money(currentNetCents/100)};
  }

  function detectProfile(text){
    const normalized=normalize(text);
    if((/\bitau\b|\bitau unibanco\b/.test(normalized))&&/\bresumo da fatura\b/.test(normalized)&&/\blancamentos: compras e saques\b/.test(normalized))return {id:'itau-card-v1',label:'Fatura Itaú',confidence:.99};
    return {id:'generic-invoice-v2',label:'Fatura genérica',confidence:.62};
  }

  function parseItau(lines,{month=null}={}){
    const meta=extractMeta(lines),context={invoiceMonth:month,dueDate:meta.dueDate};
    const paymentLines=section(lines,line=>/\bpagamentos efetuados\b/.test(line),[
      line=>/\btotal dos pagamentos\b/.test(line),
      line=>/\blancamentos: compras e saques\b/.test(line)
    ]);
    const currentLines=section(lines,line=>/\blancamentos: compras e saques\b/.test(line),[
      line=>/\btotal dos lancamentos atuais\b/.test(line),
      line=>/\bcompras parceladas\s*-?\s*proximas faturas\b/.test(line)
    ]);
    const futureLines=section(lines,line=>/\bcompras parceladas\s*-?\s*proximas faturas\b/.test(line),[
      line=>/^proxima fatura\b/.test(line),
      line=>/\blimites de credito\b/.test(line)
    ]);
    const payments=parseDatedRows(paymentLines,{...context,paymentSection:true}),currentRows=parseDatedRows(currentLines,{...context,allowContinuation:true}),futureRows=parseDatedRows(futureLines,{...context,allowContinuation:true});
    const plan=attachVerifiedInstallmentPlans(currentRows,futureRows,meta);
    for(const row of currentRows){
      if(row.installments>1&&!row.authoritativeInstallmentPlan)row.currentChargeOnly=true;
    }
    const validationRows=[...payments,...currentRows],integrity=validateStructuredInvoice({rows:validationRows,meta,profileId:'itau-card-v1',structured:true,futureRows,installmentPlanVerified:plan.verified});
    // O pagamento exibido nesta fatura pertence ao ciclo anterior. Ele ajuda a
    // provar a equação contábil, mas não é um lançamento da fatura atual e não
    // deve ser oferecido para importação automática.
    return {rows:currentRows,meta,integrity,diagnostics:{previousPayments:payments,futureRows,installmentPlanVerified:plan.verified}};
  }

  function isGenericExcludedLine(normalized){
    return /\b(total da fatura anterior|total desta fatura|total da fatura|pagamento minimo|limite (?:total|disponivel)|saldo financiado|valor do documento|codigo de barras|vencimento|fechamento|resumo da fatura)\b/.test(normalized);
  }

  function parseGeneric(lines,{month=null}={}){
    const meta=extractMeta(lines),context={invoiceMonth:month,dueDate:meta.dueDate};
    const currentSection=section(lines,line=>(line==='lancamentos atuais'||/\b(lancamentos: compras e saques|transacoes da fatura|detalhamento da fatura)\b/.test(line))&&!/^total\b/.test(line),[
      line=>/\b(total dos lancamentos|compras parceladas|parcelas futuras|proximas faturas|pagamentos efetuados)\b/.test(line)
    ]);
    const fallback=[];
    if(!currentSection.length){for(const line of lines){const normalized=normalize(line);if(/\b(compras parceladas|parcelas futuras|proximas faturas)\b/.test(normalized))break;if(!isGenericExcludedLine(normalized))fallback.push(line)}}
    const source=currentSection.length?currentSection:fallback;
    const rows=parseDatedRows(source,{...context,allowContinuation:false}).filter(row=>row.invoiceKind!=='payment');
    for(const row of rows){if(row.installments>1)row.currentChargeOnly=true}
    const integrity=validateStructuredInvoice({rows,meta,profileId:'generic-invoice-v2',structured:Boolean(currentSection.length)});
    return {rows,meta,integrity,diagnostics:{futureRows:[],installmentPlanVerified:false}};
  }

  function parse(text,{month=null}={}){
    const lines=linesOf(text),profile=detectProfile(text),parsed=profile.id==='itau-card-v1'?parseItau(lines,{month}):parseGeneric(lines,{month});
    return {...parsed,profile};
  }

  const api={parse,detectProfile,extractMeta,normalize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SFPInvoicePdfEngine=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
