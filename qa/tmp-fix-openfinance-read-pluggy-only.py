from pathlib import Path

JS = Path('app/src/main/assets/www/open-finance-real-refresh.js')
SPEC = Path('qa/open-finance-real-refresh.spec.js')


def replace_section(text: str, start: str, end: str, replacement: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f'marcador inicial não encontrado: {start}')
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f'marcador final não encontrado: {end}')
    return text[:a] + replacement + text[b:]


source = JS.read_text(encoding='utf-8')
old_note = "return `Atualização automática ativa: o SFP relê a Pluggy ao abrir, ao voltar para o app e a cada 15 minutos enquanto ele estiver visível. Items MeuPluggy não aceitam refresh forçado pelo SFP; a coleta bancária é gerenciada pelo provedor.${suffix}`;"
new_note = "return `Sincronização automática ativa: o SFP consulta os dados já disponíveis na Pluggy ao abrir, ao voltar para o app e a cada 15 minutos enquanto ele estiver visível. A atualização das instituições é gerenciada pelo MeuPluggy; o SFP apenas lê e aplica o snapshot disponível.${suffix}`;"
if old_note not in source:
    raise SystemExit('texto de auto-sync esperado não encontrado')
source = source.replace(old_note, new_note, 1)

handle_start = "  async function handleRefresh(event,button){"
hook_start = "  function hook(){"
new_handle = r'''  async function handleRefresh(event,button){
    if(event){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    if(busy)return;
    busy=true;
    lastAttempt={schema:'sfp-refresh-diagnostic-v2',attemptedAt:new Date().toISOString(),request:null,status:null,polls:0,outcome:'reading-pluggy',privacy:{credentials:false,itemIds:false,accountIds:false}};

    const originalText=button?.textContent||'Atualizar dados agora';
    if(button){
      button.disabled=true;
      button.textContent='Consultando Pluggy…';
    }

    try{
      const applied=await syncCurrentData();
      if(!applied){
        lastAttempt.request={ok:false,source:'pluggy',mode:'read-only',message:'Sincronização Open Finance indisponível neste APK.'};
        lastAttempt.outcome='sync-unavailable';
        message('A leitura da Pluggy está indisponível neste APK. Os dados anteriores foram preservados.','error');
        return;
      }

      lastAttempt.request={
        ok:applied.ok!==false,
        source:'pluggy',
        mode:'read-only',
        message:safeText(applied.message),
        bank:{unmapped:Number(applied?.bank?.unmapped)||0},
        card:{unmapped:Number(applied?.card?.unmapped)||0}
      };

      if(applied.ok===false){
        lastAttempt.outcome='apply-failed';
        message(applied.message||'A Pluggy respondeu, mas a leitura não pôde ser aplicada. Os dados anteriores foram preservados.','error');
        return;
      }

      lastAttempt.outcome='completed';
      if(Number(applied?.card?.unmapped||0)+Number(applied?.bank?.unmapped||0)>0){
        message('Dados da Pluggy consultados. Há contas ou cartões sem vínculo: cadastre-os no SFP e confira os vínculos para importar.');
      }else{
        message('Dados mais recentes disponíveis na Pluggy foram aplicados ao SFP.','success');
      }
      try{global.renderAll?.();}catch(_){}
    }catch(error){
      console.error('SFP Open Finance snapshot sync:',error);
      lastAttempt.outcome='request-failed';
      lastAttempt.request={ok:false,source:'pluggy',mode:'read-only',message:safeText(error?.message)};
      message('Falha ao consultar os dados disponíveis na Pluggy. Os dados anteriores foram preservados.','error');
    }finally{
      global.SFPOpenFinanceBankTruth?.patchGrid?.();
      global.SFPOpenFinanceBankTruth?.patchInvoiceFocus?.();
      busy=false;
      if(button){
        button.disabled=false;
        button.textContent=originalText;
      }
      updateAutoNote(baseAutoText());
    }
  }

'''
source = replace_section(source, handle_start, hook_start, new_handle)
source = source.replace('    version:5,', '    version:6,', 1)
JS.write_text(source, encoding='utf-8')

spec = SPEC.read_text(encoding='utf-8')
old_test = "test('Atualizar dados solicita refresh da instituição antes de reler a Pluggy'"
next_test = "test('Items MeuPluggy são tratados como limitação do provedor e relidos sem erro genérico'"
manual_tests = r'''test('Atualizar dados relê a Pluggy sem solicitar refresh da instituição',async({page})=>{
  await boot(page);
  const before=await page.evaluate(()=>({...window.__sfpRefreshCalls}));
  const button=page.locator('#openFinanceSyncBtn');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Atualizar dados agora');

  await button.click();

  await page.waitForFunction(beforePreview=>window.__sfpRefreshCalls.preview>beforePreview,before.preview);
  const after=await page.evaluate(()=>({...window.__sfpRefreshCalls}));
  expect(after.refresh).toBe(0);
  expect(after.status).toBe(0);
  expect(after.preview).toBeGreaterThan(before.preview);
  const diagnostic=await page.evaluate(()=>SFPOpenFinanceRealRefresh.diagnostic());
  expect(diagnostic.outcome).toBe('completed');
  expect(diagnostic.request).toMatchObject({ok:true,source:'pluggy',mode:'read-only'});
  await expect(page.locator('#openFinancePreview')).toContainText('Dados mais recentes disponíveis na Pluggy foram aplicados ao SFP');
});

test('sincronização manual continua funcionando mesmo se refresh/PATCH do provedor estiver proibido',async({page})=>{
  await boot(page);
  await page.evaluate(()=>Object.defineProperty(window,'PluggyRefreshBridge',{configurable:true,value:{
    refreshItems:()=>{throw new Error('refreshItems não deveria ser chamado');},
    refreshStatus:()=>{throw new Error('refreshStatus não deveria ser chamado');}
  }}));
  const before=await page.evaluate(()=>window.__sfpRefreshCalls.preview);
  await page.locator('#openFinanceSyncBtn').click();
  await page.waitForFunction(beforePreview=>window.__sfpRefreshCalls.preview>beforePreview,before);
  expect(await page.evaluate(()=>window.__sfpRefreshCalls.refresh)).toBe(0);
  expect(await page.evaluate(()=>window.__sfpRefreshCalls.status)).toBe(0);
  expect(await page.evaluate(()=>SFPOpenFinanceRealRefresh.diagnostic().outcome)).toBe('completed');
});

'''
spec = replace_section(spec, old_test, next_test, manual_tests)

obsolete_start = "test('Items MeuPluggy são tratados como limitação do provedor e relidos sem erro genérico'"
bill_start = "test('refresh aplica o Bill novo do banco mesmo sem compras novas'"
spec = replace_section(spec, obsolete_start, bill_start, '')

spec = spec.replace("test('refresh aplica o Bill novo do banco mesmo sem compras novas'", "test('leitura da Pluggy aplica o Bill novo mesmo sem compras novas'", 1)
spec = spec.replace("        if(window.__sfpRefreshCalls.status>0){\n          payload.items[0].accounts[0].bills=[{id:'itau-sep',dueDate:'2026-09-21',\n            billClosingDate:'2026-09-12',totalAmount:327.59,payments:[]}];\n        }", "        payload.items[0].accounts[0].bills=[{id:'itau-sep',dueDate:'2026-09-21',\n          billClosingDate:'2026-09-12',totalAmount:327.59,payments:[]}];", 1)
spec = spec.replace("  expect(await page.evaluate(()=>window.__sfpRefreshCalls.refresh)).toBe(1);", "  expect(await page.evaluate(()=>window.__sfpRefreshCalls.refresh)).toBe(0);", 1)

provider_error_start = "test('recusa mostra HTTP e código sem incluir credenciais ou identificadores no diagnóstico'"
app_zero_start = "test('app zerado informa vínculo pendente sem anunciar atualização total'"
spec = replace_section(spec, provider_error_start, app_zero_start, '')

http400_start = "test('HTTP 400 sem código específico mostra a explicação sanitizada do provedor'"
installment_start = "test('cartão sem compras locais mostra parcelas bancárias identificadas e não zera durante falha'"
spec = replace_section(spec, http400_start, installment_start, '')

SPEC.write_text(spec, encoding='utf-8')

print('patched', JS, SPEC)
