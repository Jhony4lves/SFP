(function(root){
  'use strict';

  const MONEY_SOURCE='(?:[+-]\\s*)?(?:R\\$\\s*)?(?:[+-]\\s*)?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{2}|\\.\\d{2})';
  const MONTHS={jan:1,janeiro:1,fev:2,fevereiro:2,mar:3,marco:3,abr:4,abril:4,mai:5,maio:5,jun:6,junho:6,jul:7,julho:7,ago:8,agosto:8,set:9,setembro:9,out:10,outubro:10,nov:11,novembro:11,dez:12,dezembro:12};

  function normalize(value){
    return String(value||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
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

  function moneyMatches(value){
    const regex=new RegExp(MONEY_SOURCE,'gi');
    return [...String(value||'').matchAll(regex)].map(match=>({raw:match[0],index:match.index,value:parseMoney(match[0])})).filter(match=>Number.isFinite(match.value));
  }

  function cents(value){return Math.round(Number(value||0)*100)}
  function money(value){return Math.round(Number(value||0)*100)/100}

  function validDate(year,month,day){
    const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,date=new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime())&&date.getFullYear()===year&&date.getMonth()+1===month&&date.getDate()===day?value:null;
  }

  function dateIn(value,{month=null}={}){
    const raw=String(value||''),invoiceYear=Number(String(month||'').slice(0,4))||new Date().getFullYear(),invoiceMonth=Number(String(month||'').slice(5,7))||12;
    let match=raw.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
    if(match){
      const day=Number(match[1]),monthNumber=Number(match[2]),before=normalize(raw.slice(0,match.index));
      // “LOJA 01/10” normalmente é parcela, não 1º de outubro. Datas
      // abreviadas seguem aceitas quando abrem a linha ou vêm após “data”.
      const looksLikeInstallment=!match[3]&&day<=monthNumber&&monthNumber<=120&&before.length>0&&!/(?:^|\b)data\s*$/.test(before);
      if(!looksLikeInstallment){
        let year=match[3]?(match[3].length===2?Number(`20${match[3]}`):Number(match[3])):invoiceYear;
        if(!match[3]&&monthNumber>invoiceMonth+6)year--;
        const date=validDate(year,monthNumber,day);if(date)return{raw:match[0],date};
      }
    }
    const plain=normalize(raw);
    match=plain.match(/\b(\d{1,2})(?:\s+de)?\s+(jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)(?:\s+(?:de\s+)?(\d{2,4}))?\b/);
    if(!match)return null;
    const day=Number(match[1]),monthNumber=MONTHS[match[2]],year=match[3]?(match[3].length===2?Number(`20${match[3]}`):Number(match[3])):invoiceYear,date=validDate(year,monthNumber,day);
    return date?{raw:match[0],date}:null;
  }

  function coercePages(input){
    const values=Array.isArray(input)?input:[input];
    return values.filter(Boolean).map((page,pageIndex)=>{
      const width=Math.max(1,Number(page.width)||1080),height=Math.max(1,Number(page.height)||Math.max(1200,(page.lines||[]).length*42));
      let lines=Array.isArray(page.lines)?page.lines.filter(line=>String(line?.text||'').trim()).map((line,index)=>({
        text:String(line.text).replace(/\s+/g,' ').trim(),
        left:Number(line.left)||0,
        top:Number(line.top)||index*36,
        right:Number(line.right)||width,
        bottom:Number(line.bottom)||index*36+28,
        page:pageIndex
      })):[];
      if(!lines.length&&page.text){
        lines=String(page.text).split(/\r?\n/).map(text=>text.trim()).filter(Boolean).map((text,index)=>({text,left:0,top:index*36,right:width,bottom:index*36+28,page:pageIndex}));
      }
      return{name:String(page.name||`Imagem ${pageIndex+1}`),width,height,page:pageIndex,lines};
    });
  }

  function verticalOverlap(a,b){return Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))}

  function logicalLines(pages){
    const output=[];
    for(const page of pages){
      const raw=[...page.lines].sort((a,b)=>a.top-b.top||a.left-b.left),groups=[];
      for(const line of raw){
        const lineHeight=Math.max(1,line.bottom-line.top),center=(line.top+line.bottom)/2;
        let group=groups.find(candidate=>{
          const candidateHeight=Math.max(1,candidate.bottom-candidate.top),candidateCenter=(candidate.top+candidate.bottom)/2,overlap=verticalOverlap(candidate,line)/Math.min(candidateHeight,lineHeight);
          return Math.abs(center-candidateCenter)<=Math.max(7,Math.min(candidateHeight,lineHeight)*.42)||overlap>=.38;
        });
        if(!group){group={page:page.page,top:line.top,bottom:line.bottom,left:line.left,right:line.right,parts:[]};groups.push(group)}
        group.parts.push(line);group.top=Math.min(group.top,line.top);group.bottom=Math.max(group.bottom,line.bottom);group.left=Math.min(group.left,line.left);group.right=Math.max(group.right,line.right);
      }
      groups.sort((a,b)=>a.top-b.top||a.left-b.left).forEach(group=>{
        const parts=group.parts.sort((a,b)=>a.left-b.left),texts=[];
        for(const part of parts){if(!texts.some(text=>normalize(text)===normalize(part.text)))texts.push(part.text)}
        output.push({...group,text:texts.join(' ').replace(/\s+/g,' ').trim(),pageHeight:page.height,pageWidth:page.width});
      });
    }
    return output;
  }

  function issuerOf(text){
    const value=normalize(text);
    if(/\bitau\b|\bitaucard\b|\bitau click\b/.test(value))return{id:'itau',label:'Itaú'};
    if(/\bnubank\b|\bnupay\b/.test(value))return{id:'nubank',label:'Nubank'};
    if(/\bmercado pago\b/.test(value))return{id:'mercado-pago',label:'Mercado Pago'};
    if(/\bbradesco\b|\bnext\b/.test(value))return{id:'bradesco',label:'Bradesco'};
    if(/\bsantander\b/.test(value))return{id:'santander',label:'Santander'};
    if(/\bbanco inter\b|\bcartao inter\b/.test(value))return{id:'inter',label:'Inter'};
    if(/\bc6 bank\b|\bcartao c6\b/.test(value))return{id:'c6',label:'C6'};
    if(/\bcaixa\b/.test(value))return{id:'caixa',label:'Caixa'};
    if(/\bbanco do brasil\b|\bourocard\b/.test(value))return{id:'banco-do-brasil',label:'Banco do Brasil'};
    return null;
  }

  function summaryLabel(value){
    const text=normalize(value);
    return /\b(fatura atual|fatura em aberto|valor da fatura|total da fatura|total atual|total a pagar|limite disponivel|limite total|melhor dia|pagamento minimo|data de vencimento|vencimento|fechamento|proxima fatura|saldo anterior)\b/.test(text);
  }

  function transactionNoise(value){
    const text=normalize(value);
    return !text||/^(?:hoje|ontem|lancamentos|compras|transacoes|detalhes|ver detalhes|mostrar mais|fatura|cartao|data|valor|estabelecimento)$/.test(text)||/\b(?:limite disponivel|limite total|melhor dia de compra|pagar fatura|parcelar fatura|vencimento|fechamento|total da fatura|fatura atual|fatura em aberto|valor da fatura|pagamento minimo)\b/.test(text);
  }

  function findTotal(lines,excluded){
    const label=/\b(fatura atual|fatura em aberto|valor da fatura|total da fatura|total atual|total a pagar)\b/;
    for(let index=0;index<lines.length;index++){
      if(!label.test(normalize(lines[index].text)))continue;
      const same=moneyMatches(lines[index].text);
      if(same.length){excluded.add(index);return Math.abs(money(same[same.length-1].value))}
      for(let next=index+1;next<Math.min(lines.length,index+4);next++){
        if(lines[next].page!==lines[index].page)break;
        if(/\b(limite|vencimento|fechamento|pagamento minimo)\b/.test(normalize(lines[next].text)))break;
        const values=moneyMatches(lines[next].text);
        if(values.length){excluded.add(index);excluded.add(next);return Math.abs(money(values[values.length-1].value))}
      }
    }
    return null;
  }

  function findDueDate(lines,month,excluded){
    for(let index=0;index<lines.length;index++){
      const text=normalize(lines[index].text);
      if(!/\b(?:data de )?vencimento\b|\bvence em\b/.test(text))continue;
      let found=dateIn(lines[index].text,{month}),fromNext=false;
      if(!found&&lines[index+1]?.page===lines[index].page){found=dateIn(lines[index+1].text,{month});fromNext=Boolean(found)}
      if(found){excluded.add(index);if(fromNext)excluded.add(index+1);return found.date}
    }
    return null;
  }

  function removeMatches(value,matches){
    let output=String(value||'');
    [...matches].sort((a,b)=>b.index-a.index).forEach(match=>{output=output.slice(0,match.index)+output.slice(match.index+match.raw.length)});
    return output;
  }

  function cleanDescription(value,date){
    let output=String(value||'');
    output=removeMatches(output,moneyMatches(output));
    if(date?.raw)output=output.replace(date.raw,' ');
    output=output.replace(/\b(?:compra )?(?:aprovada|processada|confirmada|pendente)\b/gi,' ').replace(/\bcart[aã]o\s+(?:final|terminado em)\s+\d+\b/gi,' ').replace(/^[\-–—|:;\s]+|[\-–—|:;\s]+$/g,' ').replace(/\s+/g,' ').trim();
    return transactionNoise(output)?'':output;
  }

  function installmentInfo(description){
    const raw=String(description||''),match=raw.match(/(?:\bparcela\s*)?\b(\d{1,2})\s*(?:\/|\bde\b)\s*(\d{1,3})\b/i);
    if(!match)return null;
    const installment=Number(match[1]),installments=Number(match[2]);
    if(!Number.isInteger(installment)||!Number.isInteger(installments)||installment<1||installments<2||installment>installments||installments>120)return null;
    const desc=raw.replace(match[0],' ').replace(/\s+/g,' ').replace(/^[\-–—|:;\s]+|[\-–—|:;\s]+$/g,'').trim();
    return{installment,installments,desc:desc||raw.trim()};
  }

  function semanticKind(description){
    const text=normalize(description);
    if(/\bpagamento(?: recebido| da fatura| cartao)?\b/.test(text))return'payment';
    if(/\b(estorno|reembolso|refund|cashback|credito recebido|ajuste credor)\b/.test(text))return'credit';
    return'purchase';
  }

  function median(values){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:28}

  function descriptionFor(lines,index,date,medianHeight){
    const source=lines[index],sourceCenter=(source.top+source.bottom)/2,maxDistance=Math.max(90,medianHeight*4.5),candidates=[];
    const own=cleanDescription(source.text,date);if(own)candidates.push({text:own,distance:0,top:source.top});
    for(let otherIndex=Math.max(0,index-3);otherIndex<=Math.min(lines.length-1,index+3);otherIndex++){
      if(otherIndex===index)continue;const line=lines[otherIndex];if(line.page!==source.page)continue;
      const center=(line.top+line.bottom)/2,distance=Math.abs(center-sourceCenter);if(distance>maxDistance)continue;
      const otherDate=dateIn(line.text,{month:date?.date?.slice(0,7)}),text=cleanDescription(line.text,otherDate);
      if(!text||summaryLabel(text)||moneyMatches(line.text).length&&text.length<2)continue;
      candidates.push({text,distance,top:line.top});
    }
    const selected=candidates.sort((a,b)=>a.distance-b.distance||a.top-b.top).slice(0,2).sort((a,b)=>a.top-b.top),parts=[];
    selected.forEach(candidate=>{if(!parts.some(part=>normalize(part)===normalize(candidate.text)))parts.push(candidate.text)});
    return parts.join(' ').replace(/\s+/g,' ').trim();
  }

  function rowSignature(row){return `${row.date}|${normalize(row.desc).replace(/[^a-z0-9]+/g,'')}|${cents(row.amount)}|${row.invoiceKind}`}

  function removeScreenshotOverlap(rows){
    const output=[],removed=[];
    for(const row of rows){
      const existing=output.find(candidate=>candidate.sourcePage+1===row.sourcePage&&rowSignature(candidate)===rowSignature(row)&&candidate.sourceTop/candidate.sourceHeight>=.62&&row.sourceTop/row.sourceHeight<=.38);
      if(existing){removed.push(row);continue}
      output.push(row);
    }
    return{rows:output,removed};
  }

  function extractRows(lines,pages,excluded,{month=null}={}){
    const heights=lines.map(line=>Math.max(1,line.bottom-line.top)),medianHeight=median(heights),dates=[];
    lines.forEach((line,index)=>{
      if(excluded.has(index)||summaryLabel(line.text))return;
      const found=dateIn(line.text,{month});if(found)dates.push({index,page:line.page,center:(line.top+line.bottom)/2,...found});
    });
    const rows=[],usedCandidates=new Set(),maxDateDistance=Math.max(180,Math.min(520,medianHeight*14));
    lines.forEach((line,index)=>{
      if(excluded.has(index)||summaryLabel(line.text))return;
      const matches=moneyMatches(line.text);if(!matches.length)return;
      const center=(line.top+line.bottom)/2,dateCandidates=dates.filter(candidate=>candidate.page===line.page).map(candidate=>({...candidate,distance:Math.abs(candidate.center-center)})).filter(candidate=>candidate.distance<=maxDateDistance).sort((a,b)=>a.distance-b.distance);
      const date=dateCandidates[0];if(!date)return;
      for(let matchIndex=0;matchIndex<matches.length;matchIndex++){
        const match=matches[matchIndex],token=`${index}:${match.index}`;if(usedCandidates.has(token))continue;
        const desc=descriptionFor(lines,index,date,medianHeight);if(!desc)continue;
        const kind=semanticKind(desc),installment=kind==='purchase'?installmentInfo(desc):null;
        rows.push({
          date:date.date,
          desc:installment?.desc||desc,
          amount:kind==='purchase'?Math.abs(match.value):-Math.abs(match.value),
          fitid:null,
          invoiceKind:kind,
          installment:installment?.installment||null,
          installments:installment?.installments||null,
          currentChargeOnly:Boolean(installment),
          extractionConfidence:.9,
          sourceSection:'current_charges',
          sourcePage:line.page,
          sourceTop:line.top,
          sourceHeight:pages[line.page]?.height||line.pageHeight||1
        });
        usedCandidates.add(token);
      }
    });
    return removeScreenshotOverlap(rows);
  }

  function parse(input,{month=null}={}){
    const pages=coercePages(input),lines=logicalLines(pages),fullText=lines.map(line=>line.text).join('\n'),excluded=new Set(),issuer=issuerOf(fullText),officialTotal=findTotal(lines,excluded),dueDate=findDueDate(lines,month,excluded),extracted=extractRows(lines,pages,excluded,{month:dueDate?.slice(0,7)||month});
    const payments=extracted.rows.filter(row=>row.invoiceKind==='payment'),currentRows=extracted.rows.filter(row=>row.invoiceKind!=='payment'),currentNetCents=currentRows.reduce((sum,row)=>sum+(row.invoiceKind==='credit'?-Math.abs(cents(row.amount)):Math.abs(cents(row.amount))),0),checks=[];
    checks.push({id:'ocr_rows',label:'Lançamentos reconhecidos na captura',status:currentRows.length?'pass':'fail',count:currentRows.length});
    if(Number.isFinite(Number(officialTotal)))checks.push({id:'official_total',label:'Total exibido na captura',status:currentNetCents===cents(officialTotal)?'pass':'fail',actual:money(currentNetCents/100),expected:money(officialTotal)});
    else checks.push({id:'official_total',label:'Total exibido na captura',status:'unknown',actual:money(currentNetCents/100)});
    checks.push({id:'ocr_local',label:'OCR executado localmente',status:'pass'});
    checks.push({id:'due_date',label:'Vencimento localizado',status:dueDate?'pass':'unknown',value:dueDate||null});
    if(extracted.removed.length)checks.push({id:'overlap',label:'Sobreposição entre capturas removida',status:'pass',count:extracted.removed.length});
    if(payments.length)checks.push({id:'payments',label:'Pagamentos separados dos lançamentos atuais',status:'pass',count:payments.length});
    const failed=checks.filter(check=>check.status==='fail'),missingTotal=!Number.isFinite(Number(officialTotal));
    const status=failed.length?'blocked':missingTotal?'review':'verified',importAllowed=status==='verified';
    const reason=failed.length
      ?`A captura não passou na conferência (${failed.map(check=>check.label.toLowerCase()).join(', ')}). Confira se a imagem contém a fatura inteira e está legível.`
      :missingTotal
        ?'Os lançamentos foram lidos, mas o total da fatura não apareceu na captura; a importação permanece bloqueada.'
        :`OCR conferido: ${currentRows.length} lançamento(s) somam R$ ${money(currentNetCents/100).toFixed(2).replace('.',',')} e fecham com o total exibido.`;
    const profile={id:issuer?`${issuer.id}-card-image-v1`:'card-image-v1',label:issuer?`Captura ${issuer.label}`:'Captura de fatura',confidence:issuer?.id==='itau'?.97:issuer?.id?.9:.82};
    const meta={source:'image-ocr'};if(officialTotal!=null)meta.officialTotal=officialTotal;if(dueDate)meta.dueDate=dueDate;
    return{profile,rows:currentRows,meta,integrity:{status,importAllowed,profileId:profile.id,reason,checks,currentRows:currentRows.length,payments:payments.length,futureRowsExcluded:0,currentNet:money(currentNetCents/100)},diagnostics:{payments,overlapDuplicates:extracted.removed,logicalLines:lines.length,pages:pages.length},text:fullText};
  }

  const api={parse,normalize,logicalLines,dateIn};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SFPInvoiceImageEngine=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
