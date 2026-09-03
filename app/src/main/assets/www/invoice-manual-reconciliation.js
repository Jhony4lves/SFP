(function installManualInvoiceReconciliation(global){
  'use strict';
  if(typeof document==='undefined')return;

  const INSTALLED='__SFP_MANUAL_INVOICE_RECONCILIATION_INSTALLED';
  const money=value=>Math.round((Math.abs(Number(value)||0))*100)/100;
  const normalize=value=>String(value||'')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\b(?:parcela\s*)?\d+\s*(?:\/|de)\s*\d+\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  function merchantTokens(value){
    const identity=typeof global.invoiceMerchantIdentity==='function'
      ? global.invoiceMerchantIdentity(value)
      : normalize(value);
    return String(identity||'').split(/\s+/).filter(token=>token.length>=2);
  }

  function merchantMatch(left,right){
    const a=merchantTokens(left),b=merchantTokens(right);
    if(!a.length||!b.length)return false;
    const aKey=a.join(' '),bKey=b.join(' ');
    if(aKey===bKey)return true;
    const small=a.length<=b.length?a:b;
    const large=a.length<=b.length?b:a;
    return small.some(token=>token.length>=4)&&small.every(token=>large.includes(token));
  }

  function importedInstallment(row){
    const marker=row?.sfpDocumentInstallment||row?.documentInstallment;
    const markerN=Math.trunc(Number(marker?.installment));
    const markerTotal=Math.trunc(Number(marker?.installments));
    if(Number.isInteger(markerN)&&Number.isInteger(markerTotal)&&markerN>=1&&markerTotal>=markerN&&markerTotal>1){
      return{n:markerN,total:markerTotal};
    }
    const n=Math.trunc(Number(row?.installment));
    const total=Math.trunc(Number(row?.installments));
    if(Number.isInteger(n)&&Number.isInteger(total)&&n>=1&&total>=n&&total>1)return{n,total};
    return null;
  }

  function isManualPurchase(p){
    if(!p||p.invoiceImportKey||(p.invoiceImportAliases||[]).length)return false;
    if((p.tags||[]).includes('fatura-importada'))return false;
    if(p.status&&p.status!=='active')return false;
    return true;
  }

  function matchesCandidate(p,cardId,row,reserved){
    if(!isManualPurchase(p)||p.cardId!==cardId||reserved.has(`purchase:${p.id}`))return false;
    if(!p.purchaseDate||!row?.date||p.purchaseDate!==row.date)return false;
    if(!merchantMatch(p.desc,row.desc))return false;

    const invoiceMonth=row.invoiceMonth||row.targetMonth||row.firstMonth;
    if(!invoiceMonth||typeof global.purchaseInstallment!=='function')return false;
    const charge=global.purchaseInstallment(p,invoiceMonth);
    if(!charge||Math.abs(money(charge.amount)-money(row.amount))>=.01)return false;

    const imported=importedInstallment(row);
    const purchaseTotal=Math.trunc(Number(p.installments)||1);
    if(imported){
      if(Number(charge.n)!==imported.n||Number(charge.total)!==imported.total)return false;
    }else if(purchaseTotal>1){
      // Sem marcador de parcela no documento não há evidência suficiente para
      // fundir automaticamente uma cobrança com uma compra parcelada manual.
      return false;
    }
    return true;
  }

  function install(){
    if(global[INSTALLED])return;
    const original=global.existingInvoiceImportMatch;
    if(typeof original!=='function'){
      setTimeout(install,0);
      return;
    }

    const wrapped=function(cardId,row,reserved=new Set()){
      const direct=original.apply(this,arguments);
      if(direct||row?.kind!=='purchase'||typeof global.state==='undefined'||!Array.isArray(global.state?.purchases))return direct;

      const candidates=global.state.purchases.filter(p=>matchesCandidate(p,cardId,row,reserved));
      if(candidates.length!==1)return null;

      const candidate=candidates[0];
      return{
        source:'purchase',
        id:candidate.id,
        token:`purchase:${candidate.id}`,
        legacy:false,
        manualReconcile:true
      };
    };

    Object.defineProperty(wrapped,'__sfpManualInvoiceReconciliation',{value:true});
    global.existingInvoiceImportMatch=wrapped;
    global[INSTALLED]=true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  setTimeout(install,0);
})(typeof window!=='undefined'?window:globalThis);
