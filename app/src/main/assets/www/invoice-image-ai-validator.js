(function(root){
  'use strict';

  const INSTALL_FLAG='__SFP_INVOICE_IMAGE_AI_VALIDATOR_INSTALLED';
  const KEY_GUARD_FLAG='__SFP_IMAGE_AI_IMPORT_KEY_GUARD_INSTALLED';
  const MIN_AUTO_CONFIDENCE=.90;
  const MAX_ROWS=40;
  const MAX_CONTEXT_LINES=7;
  const MAX_CONTEXT_DISTANCE=520;
  const GENERIC_TOKENS=new Set(['do','da','de','dos','das','e','em','no','na','nos','nas','br','brasil','ltda','sa','s','a']);

  if(root[INSTALL_FLAG])return;

  function normalize(value){
    return String(value||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function sanitize(value){
    return String(value||'')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'***@***')
      .replace(/(?:R\$\s*)?[+-]?\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2}|\.\d{2})/gi,'***')
      .replace(/\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/g,'**/**')
      .replace(/\b\d{5,}\b/g,'***')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,140);
  }

  function median(values){
    const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
    return sorted.length?sorted[Math.floor(sorted.length/2)]:28;
  }

  function parseGroqJson(content){
    const text=String(content||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start<0||end<start)throw new Error('Resposta da IA validadora sem JSON.');
    return JSON.parse(text.slice(start,end+1));
  }

  function aiAvailable(){
    try{
      if(typeof navigator!=='undefined'&&navigator.onLine===false)return false;
      if(root.state?.sophy?.settings?.onlineEnabled===false)return false;
      return Boolean(root.AndroidBridge&&typeof root.AndroidBridge.callSophyGroq==='function'&&typeof root.AndroidBridge.hasSophyApiKey==='function'&&root.AndroidBridge.hasSophyApiKey());
    }catch{return false}
  }

  function contextForRow(lines,row){
    const page=Number(row?.sourcePage)||0,sourceTop=Number(row?.sourceTop)||0;
    const samePage=lines.filter(line=>Number(line.page)===page);
    const lineHeight=median(samePage.map(line=>Math.max(1,Number(line.bottom)-Number(line.top))));
    const maxDistance=Math.min(MAX_CONTEXT_DISTANCE,Math.max(240,lineHeight*10));
    return samePage
      .map(line=>({line,dy:Math.round(Number(line.top)-sourceTop),distance:Math.abs(Number(line.top)-sourceTop)}))
      .filter(item=>item.distance<=maxDistance)
      .sort((a,b)=>a.distance-b.distance||a.dy-b.dy)
      .slice(0,MAX_CONTEXT_LINES)
      .sort((a,b)=>a.dy-b.dy)
      .map(item=>({dy:item.dy,text:sanitize(item.line.text)}))
      .filter(item=>item.text&&!/^\*+(?:\s*\*+)*$/.test(item.text));
  }

  function proposalSupported(description,currentDescription,context){
    const proposed=normalize(description),current=normalize(currentDescription),contextText=normalize([current,...(context||[]).map(item=>item.text)].join(' '));
    if(!proposed||proposed.length>120||proposed===current)return false;
    const contextTokens=new Set(contextText.split(' ').filter(Boolean));
    const tokens=[...new Set(proposed.split(' ').filter(Boolean))];
    const evidenceTokens=tokens.filter(token=>token.length>=3);
    const merchantTokens=evidenceTokens.filter(token=>token.length>=4&&!GENERIC_TOKENS.has(token));
    if(!merchantTokens.length)return false;
    return evidenceTokens.every(token=>contextTokens.has(token));
  }

  function safeEvidence(values,context){
    const allowed=normalize((context||[]).map(item=>item.text).join(' '));
    return (Array.isArray(values)?values:[]).slice(0,4).map(sanitize).filter(value=>value&&normalize(value).split(' ').filter(Boolean).every(token=>allowed.includes(token)));
  }

  function finalizeSummary(parsed,summary){
    parsed.meta=parsed.meta||{};
    parsed.meta.aiDescriptionValidation={...summary};
    addIntegrityCheck(parsed,summary);
    return summary;
  }

  function addIntegrityCheck(parsed,summary){
    if(!parsed||!parsed.integrity)return;
    parsed.integrity.checks=Array.isArray(parsed.integrity.checks)?parsed.integrity.checks:[];
    parsed.integrity.checks=parsed.integrity.checks.filter(check=>check?.id!=='ai_description_validation');
    parsed.integrity.checks.push({
      id:'ai_description_validation',
      label:'IA contextual para descrições OCR',
      status:summary.used?'pass':'unknown',
      reconstructed:summary.reconstructed,
      review:summary.review,
      rejected:summary.rejected
    });
    if(summary.reconstructed>0){
      parsed.integrity.reason=`${parsed.integrity.reason||''} IA validadora reconstruiu ${summary.reconstructed} descrição(ões) somente com evidências do OCR; data, valor e parcelas permaneceram do motor local.`.trim();
    }else if(summary.used&&summary.review>0){
      parsed.integrity.reason=`${parsed.integrity.reason||''} IA validadora encontrou ${summary.review} descrição(ões) incerta(s) e manteve o resultado local.`.trim();
    }
  }

  function validateDescriptions(engine,input,parsed){
    const rows=Array.isArray(parsed?.rows)?parsed.rows:[];
    rows.forEach(row=>{
      if(row&&row.ocrRawDescription==null)row.ocrRawDescription=String(row.desc||'');
    });

    const summary={provider:'groq',used:false,reconstructed:0,review:0,rejected:0,reason:null};
    if(!rows.length){summary.reason='no_rows';return finalizeSummary(parsed,summary)}
    if(!aiAvailable()){summary.reason='unavailable';return finalizeSummary(parsed,summary)}

    let lines=[];
    try{lines=engine.logicalLines(input)}catch{lines=[]}
    const samples=rows.slice(0,MAX_ROWS).map((row,index)=>({
      index,
      currentDescription:sanitize(row.desc),
      context:contextForRow(lines,row)
    })).filter(sample=>sample.currentDescription||sample.context.length);
    if(!samples.length){summary.reason='no_context';return finalizeSummary(parsed,summary)}

    const instruction=[
      'Você valida descrições de lançamentos de uma fatura brasileira depois de um OCR local.',
      'Responda SOMENTE JSON no formato {"rows":[{"index":0,"action":"keep|reconstruct|review","description":"texto","confidence":0.0,"evidence":["trecho"]}],"warnings":[]}.',
      'Sua única tarefa é reconstruir a DESCRIÇÃO/ESTABELECIMENTO usando as linhas OCR fornecidas e a posição relativa dy.',
      'Nunca altere, infira ou corrija data, valor, parcela, quantidade de parcelas, tipo financeiro ou sinal. Esses campos nem são enviados.',
      'Só use action=reconstruct quando as palavras relevantes da descrição proposta aparecem literalmente no currentDescription ou no context. Não use conhecimento de mundo para adivinhar marcas ausentes.',
      'Linhas próximas podem pertencer a outro lançamento: use dy e seja conservador. Se houver dúvida, use review ou keep.',
      'Exemplo válido: contexto contém AMAZON e BR, então AMAZON BR pode ser reconstruído. Exemplo inválido: contexto contém apenas BR, então não invente AMAZON.'
    ].join(' ');
    const model=(root.state?.sophy?.settings?.model&&root.state.sophy.settings.model!=='default')?root.state.sophy.settings.model:'openai/gpt-oss-120b';
    const payload={model,messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify({source:'image-ocr-context',rows:samples})}],temperature:0,max_tokens:1400};

    try{
      const raw=root.AndroidBridge.callSophyGroq(JSON.stringify(payload));
      const data=JSON.parse(raw||'{}');
      if(data.error)throw new Error(data.error.message||'Groq indisponível');
      const response=parseGroqJson(data?.choices?.[0]?.message?.content||'');
      const suggestions=Array.isArray(response.rows)?response.rows:[];
      summary.used=true;

      for(const suggestion of suggestions){
        const index=Number(suggestion?.index);
        if(!Number.isInteger(index)||index<0||index>=rows.length)continue;
        const row=rows[index],sample=samples.find(item=>item.index===index);
        if(!sample)continue;
        const action=String(suggestion.action||'keep').toLowerCase(),confidence=Math.max(0,Math.min(1,Number(suggestion.confidence)||0)),description=String(suggestion.description||'').replace(/\s+/g,' ').trim().slice(0,120);
        if(action==='reconstruct'&&confidence>=MIN_AUTO_CONFIDENCE&&proposalSupported(description,row.ocrRawDescription,sample.context)){
          row.desc=description;
          row.descriptionValidation={validator:'groq',status:'reconstructed',confidence,evidence:safeEvidence(suggestion.evidence,sample.context),rawDescription:row.ocrRawDescription};
          summary.reconstructed++;
        }else if(action==='review'||(action==='reconstruct'&&confidence<MIN_AUTO_CONFIDENCE)){
          row.descriptionValidation={validator:'groq',status:'review',confidence,rawDescription:row.ocrRawDescription};
          summary.review++;
        }else if(action==='reconstruct'){
          row.descriptionValidation={validator:'groq',status:'rejected',confidence,rawDescription:row.ocrRawDescription};
          summary.rejected++;
        }else{
          row.descriptionValidation={validator:'groq',status:'kept',confidence,rawDescription:row.ocrRawDescription};
        }
      }
      summary.reason='completed';
    }catch(error){
      summary.reason='error';
      summary.error=String(error?.message||error||'Falha na IA validadora').slice(0,160);
    }

    return finalizeSummary(parsed,summary);
  }

  function installEngineWrapper(){
    const engine=root.SFPInvoiceImageEngine;
    if(!engine||typeof engine.parse!=='function')return false;
    if(engine.__sfpContextAI===true)return true;
    const originalParse=engine.parse.bind(engine);
    const wrappedParse=function(input,options){
      const parsed=originalParse(input,options);
      try{
        validateDescriptions(engine,input,parsed);
      }catch(error){
        console.error('SFP image AI validator:',error);
      }
      return parsed;
    };
    root.SFPInvoiceImageEngine=Object.freeze({...engine,parse:wrappedParse,__sfpContextAI:true});
    root[INSTALL_FLAG]=true;
    return true;
  }

  function installImportKeyGuard(){
    if(root[KEY_GUARD_FLAG])return true;
    if(typeof root.invoiceImportBaseKey!=='function')return false;
    const original=root.invoiceImportBaseKey;
    if(original.__sfpImageAIRawIdentity===true){root[KEY_GUARD_FLAG]=true;return true}
    const guarded=function(cardId,row){
      const raw=row?.importSource==='image-ocr'&&row?.ocrRawDescription!=null?String(row.ocrRawDescription):null;
      return original(cardId,raw!=null?{...row,desc:raw}:row);
    };
    Object.defineProperty(guarded,'__sfpImageAIRawIdentity',{value:true});
    Object.defineProperty(guarded,'__sfpOriginalInvoiceImportBaseKey',{value:original});
    root.invoiceImportBaseKey=guarded;
    try{invoiceImportBaseKey=guarded}catch{}
    root[KEY_GUARD_FLAG]=true;
    return true;
  }

  let installAttempts=0;
  function install(){
    const engineReady=installEngineWrapper(),keyReady=installImportKeyGuard();
    if(!engineReady||!keyReady){installAttempts++;if(installAttempts<400)setTimeout(install,10)}
  }

  root.SFPInvoiceImageAIValidator=Object.freeze({
    version:1,
    minAutoConfidence:MIN_AUTO_CONFIDENCE,
    sanitize,
    proposalSupported,
    validateDescriptions
  });

  install();
})(typeof window!=='undefined'?window:globalThis);
