from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_between(text, start, end, replacement, label):
    i = text.find(start)
    if i < 0:
        raise RuntimeError(f'{label}: start marker not found')
    j = text.find(end, i)
    if j < 0:
        raise RuntimeError(f'{label}: end marker not found')
    return text[:i] + replacement + text[j:]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


sync_path = ROOT / 'app/src/main/assets/www/open-finance-sync-accounts.js'
sync = sync_path.read_text(encoding='utf-8')
sync = replace_once(sync, '  const VERSION=1;', '  const VERSION=2;', 'sync version')

build_transfer = r'''  function candidateBalanceImpact(candidate){
    if(candidate?.existingRecord)return candidate.existingRecord.balanceImpact===true;
    return balanceImpactFor(candidate?.entity,candidate?.date);
  }

  function buildTransfer(expense,income){
    const keys=[externalKey(expense.transaction),externalKey(income.transaction)].filter(Boolean);
    const byAccount={};
    byAccount[expense.entity.id]=candidateBalanceImpact(expense);
    byAccount[income.entity.id]=candidateBalanceImpact(income);
    return{
      id:typeof global.uid==='function'?global.uid():Date.now()+Math.floor(Math.random()*1000),
      desc:clean(expense.transaction?.description)||clean(income.transaction?.description)||'Transferência Open Finance',
      amount:expense.amount,
      date:expense.date,
      settledDate:income.date,
      fromId:expense.entity.id,
      toId:income.entity.id,
      tags:['open-finance','pluggy','transferência'],
      note:'Transferência entre contas conciliada automaticamente pelo Open Finance (Pluggy).',
      matchedBy:'open-finance-bank-pair',
      balanceImpactByAccount:byAccount,
      balanceImpact:Object.values(byAccount).some(Boolean),
      externalId:keys[0]||'',
      openFinanceExternalIds:keys,
      openFinanceProvider:'pluggy',
      openFinanceSyncedAt:new Date().toISOString()
    };
  }

'''
sync = replace_between(sync, '  function buildTransfer(expense,income){', '  function pairTransfers(candidates){', build_transfer, 'buildTransfer')

plan_bank = r'''  function planBankSync(result){
    const api=global.SFPOpenFinancePersonal;
    const plan={create:[],link:[],transferCreate:[],transferPromote:[],transferLink:[],already:0,pending:0,review:0,unmapped:0,partial:0,errors:0,bankAccounts:0};
    const raw=[];

    for(const item of Array.isArray(result?.items)?result.items:[]){
      const name=itemName(item);
      for(const account of Array.isArray(item?.accounts)?item.accounts:[]){
        if(account?.type==='CREDIT')continue;
        plan.bankAccounts++;
        const suggestion=api?.suggestSfpEntity?.(account,name);
        if(!suggestion){plan.unmapped++;continue;}
        if(account?.transactionsError){plan.errors++;continue;}
        if(account?.transactionPreviewHasMore)plan.partial++;

        for(const transaction of Array.isArray(account?.transactions)?account.transactions:[]){
          const amount=Math.abs(Number(transaction?.amount));
          if(!Number.isFinite(amount)||amount===0){plan.review++;continue;}
          if(isPending(transaction)){plan.pending++;continue;}
          const kind=transactionKind(account,transaction);
          if(kind!=='expense'&&kind!=='income'){plan.review++;continue;}
          if(kind==='expense'&&isCardPaymentDescription(transaction?.description)){plan.review++;continue;}

          const candidate={account,item,entity:suggestion.entity,transaction,kind,date:dateOnly(transaction?.date),amount};
          const exact=exactBankRecord(suggestion.entity,transaction);
          if(exact){
            if(transferSignal(transaction?.description))raw.push({...candidate,existingRecord:exact});
            else plan.already++;
            continue;
          }
          const heuristic=api?.likelyExisting?.(account,transaction,suggestion);
          if(heuristic?.record){plan.link.push({record:heuristic.record,account,item,transaction});continue;}
          raw.push(candidate);
        }
      }
    }

    const paired=pairTransfers(raw);
    for(const pair of paired.pairs){
      const keys=[externalKey(pair.expense.transaction),externalKey(pair.income.transaction)].filter(Boolean);
      const exact=exactTransferRecord(keys);
      if(exact){plan.already++;continue;}
      const heuristic=heuristicTransferRecord(pair.expense,pair.income);
      if(heuristic){plan.transferLink.push({record:heuristic,pair});continue;}
      if(pair.expense.existingRecord||pair.income.existingRecord){
        plan.transferPromote.push(pair);
        continue;
      }
      plan.transferCreate.push(pair);
    }
    plan.create=paired.remaining.filter(candidate=>{
      if(candidate.existingRecord){plan.already++;return false;}
      return true;
    });
    return plan;
  }

'''
sync = replace_between(sync, '  function planBankSync(result){', '  function summaryFor(result){', plan_bank, 'planBankSync')

sync = replace_once(
    sync,
    "      const bankBits=[`${bank.create.length} lançamento(s) novo(s)`,`${bank.transferCreate.length} transferência(s) pareável(is)`,`${bank.link.length+bank.transferLink.length} conciliável(is)`,`${bank.already} já sincronizado(s)`];",
    "      const bankBits=[`${bank.create.length} lançamento(s) novo(s)`,`${bank.transferCreate.length+bank.transferPromote.length} transferência(s) pareável(is)`,`${bank.link.length+bank.transferLink.length} conciliável(is)`,`${bank.already} já sincronizado(s)`];",
    'preview transfer count'
)

apply_bank = r'''  function removeExistingBankRecord(record){
    const list=global.state?.transactions;
    if(!Array.isArray(list)||!record)return false;
    let index=list.indexOf(record);
    if(index<0&&record?.id!==undefined)index=list.findIndex(entry=>sameId(entry?.id,record.id));
    if(index<0)return false;
    list.splice(index,1);
    return true;
  }

  function applyBankPlan(bank){
    let linked=0,created=0,transfers=0,promoted=0;
    for(const row of bank.link){if(markLinked(row.record,row.account,row.item,row.transaction))linked++}
    for(const row of bank.transferLink){
      const {record,pair}=row;
      const first=markLinked(record,pair.expense.account,pair.expense.item,pair.expense.transaction);
      const second=markLinked(record,pair.income.account,pair.income.item,pair.income.transaction);
      if(first||second)linked++;
    }
    for(const candidate of bank.create){global.state.transactions.push(buildBankTransaction(candidate));created++}
    for(const pair of bank.transferPromote||[]){
      const transfer=buildTransfer(pair.expense,pair.income);
      if(pair.expense.existingRecord)removeExistingBankRecord(pair.expense.existingRecord);
      if(pair.income.existingRecord)removeExistingBankRecord(pair.income.existingRecord);
      global.state.transfers.push(transfer);
      transfers++;promoted++;
    }
    for(const pair of bank.transferCreate){global.state.transfers.push(buildTransfer(pair.expense,pair.income));transfers++}
    return{created,linked,transfers,promoted};
  }

'''
sync = replace_between(sync, '  function applyBankPlan(bank){', '  function mutedPreview(){', apply_bank, 'applyBankPlan')
sync_path.write_text(sync, encoding='utf-8')


personal_path = ROOT / 'app/src/main/assets/www/open-finance-personal.js'
personal = personal_path.read_text(encoding='utf-8')
personal = replace_once(personal, '  const VERSION=3;', '  const VERSION=4;', 'personal version')

compact_preview = r'''  function appendAccount(container,account,itemName,staging){
    const block=document.createElement('div');
    block.dataset.openFinanceAccount='1';
    block.style.marginBottom='10px';
    const row=document.createElement('div');row.className='item';
    const left=document.createElement('div');
    const title=document.createElement('b');title.textContent=accountLabel(account);
    const meta=document.createElement('small');
    const bits=[account?.type,account?.subtype,cleanText(account?.lastFour)?`final ${account.lastFour}`:''].filter(Boolean);
    meta.textContent=bits.join(' • ')||'Conta detectada pela Pluggy';
    left.append(title,meta);

    const suggestion=suggestSfpEntity(account,itemName);
    const mapping=document.createElement('small');
    mapping.textContent=suggestion?`Vínculo sugerido SFP: ${suggestion.entity.name}`:'Sem vínculo automático seguro';
    left.appendChild(mapping);

    const right=document.createElement('div');right.style.textAlign='right';
    const balance=document.createElement('b');balance.textContent=money(account?.balance,account?.currencyCode);
    const meaning=document.createElement('small');
    meaning.textContent=account?.type==='CREDIT'?'uso do crédito informado':'saldo disponível';
    right.append(balance,meaning);

    const creditData=account?.creditData||{};
    if(account?.type==='CREDIT'&&Number.isFinite(Number(creditData.availableCreditLimit))){
      const available=document.createElement('small');
      available.textContent=`Disponível: ${money(creditData.availableCreditLimit,account?.currencyCode)}`;
      right.appendChild(available);
    }
    row.append(left,right);block.appendChild(row);

    const transactions=Array.isArray(account?.transactions)?account.transactions:[];
    if(account?.transactionsError||account?.transactionPreviewHasMore||!transactions.length){
      const txNote=document.createElement('div');txNote.className='note';txNote.style.marginTop='6px';
      if(account?.transactionsError){
        txNote.textContent='Conta lida, mas as transações recentes não puderam ser consultadas agora.';
        staging.transactionErrors++;
      }else if(account?.transactionPreviewHasMore){
        txNote.textContent='A consulta retornou apenas parte das transações recentes. Por segurança, este cartão não será alterado até a leitura vir completa.';
        staging.partialAccounts++;
      }else{
        txNote.textContent=`Nenhuma transação retornada na janela recente de ${Number(account?.transactionWindowDays)||45} dias.`;
      }
      block.appendChild(txNote);
    }

    if(transactions.length){
      const details=document.createElement('details');
      details.dataset.openFinanceTransactions='1';
      details.style.marginTop='6px';
      const summary=document.createElement('summary');
      summary.textContent=`Ver ${transactions.length} transação(ões) recentes`;
      summary.style.cursor='pointer';
      summary.style.padding='8px 4px';
      details.appendChild(summary);

      const txList=document.createElement('div');txList.className='list';txList.style.marginTop='6px';
      transactions.slice(0,6).forEach(transaction=>appendTransaction(txList,account,transaction,suggestion,staging));
      if(transactions.length>6){
        const more=document.createElement('div');more.className='note';
        more.textContent=`+ ${transactions.length-6} transação(ões) recebidas. Todas entram na análise, mesmo que a tela mostre só as primeiras.`;
        txList.appendChild(more);
      }
      details.appendChild(txList);block.appendChild(details);
    }
    container.appendChild(block);
  }

  function renderPreview(result){
    const root=$('openFinancePreview');
    if(!root)return;
    root.replaceChildren();

    const items=Array.isArray(result?.items)?result.items:[];
    if(!items.length){
      const empty=document.createElement('div');empty.className='note';
      empty.textContent='A aplicação autenticou, mas nenhum Item foi retornado para estas credenciais.';
      root.appendChild(empty);return;
    }

    const staging={existing:0,candidates:0,review:0,pending:0,transactionErrors:0,partialAccounts:0};
    let accountCount=0;
    let transactionCount=0;

    for(const item of items){
      const accounts=Array.isArray(item?.accounts)?item.accounts:[];
      accountCount+=accounts.length;
      transactionCount+=accounts.reduce((sum,account)=>sum+(Array.isArray(account?.transactions)?account.transactions.length:0),0);
      const name=itemDisplayName(item);
      const needsAttention=Boolean(item?.accountsError)||accounts.some(account=>
        account?.transactionsError||account?.transactionPreviewHasMore||!suggestSfpEntity(account,name)
      );

      const section=document.createElement('details');
      section.dataset.openFinanceItem='1';
      section.style.marginTop='10px';
      section.open=needsAttention;

      const heading=document.createElement('summary');
      heading.className='item';
      heading.style.cursor='pointer';
      heading.style.listStylePosition='inside';
      const headingText=document.createElement('div');
      const title=document.createElement('b');title.textContent=name;
      const subtitle=document.createElement('small');
      subtitle.textContent=`${cleanText(item?.connectorName)||'MeuPluggy'} • ${cleanText(item?.status)||'status não informado'} • ${accounts.length} conta(s)`;
      headingText.append(title,subtitle);
      const hint=document.createElement('small');hint.textContent=needsAttention?'Requer atenção':'Toque para conferir';
      heading.append(headingText,hint);section.appendChild(heading);

      const list=document.createElement('div');list.className='list';list.style.marginTop='6px';
      if(accounts.length)accounts.forEach(account=>appendAccount(list,account,name,staging));
      else{
        const empty=document.createElement('div');empty.className='note';
        empty.textContent=item?.accountsError?'O Item foi encontrado, mas as contas não puderam ser consultadas agora.':'Nenhuma conta retornada para este Item.';
        list.appendChild(empty);
      }
      section.appendChild(list);root.appendChild(section);
    }

    const summary=document.createElement('div');summary.className='note';summary.style.marginTop='12px';
    summary.textContent=`Consulta concluída: ${items.length} Item(s), ${accountCount} conta(s)/cartão(ões) e ${transactionCount} transação(ões) recentes. Abra apenas a instituição que quiser conferir.`;
    root.prepend(summary);

    const stagingBox=document.createElement('div');stagingBox.className='note';stagingBox.style.marginTop='8px';
    stagingBox.id='openFinanceStagingSummary';
    stagingBox.textContent=`Análise: ${staging.existing} já existente(s) ou conciliável(is) • ${staging.candidates} novo(s) candidato(s) • ${staging.review} crédito(s)/pagamento(s) para revisar • ${staging.pending} pendente(s) aguardando confirmação${staging.partialAccounts?` • ${staging.partialAccounts} conta(s) com leitura parcial`:''}${staging.transactionErrors?` • ${staging.transactionErrors} conta(s) com falha`:''}.`;
    summary.insertAdjacentElement('afterend',stagingBox);
  }

'''
personal = replace_between(personal, '  function appendAccount(container,account,itemName,staging){', '  function inferCategory(description){', compact_preview, 'compact preview')
personal_path.write_text(personal, encoding='utf-8')


qa_path = ROOT / 'qa/open-finance-unified-sync.spec.js'
qa = qa_path.read_text(encoding='utf-8')
qa = replace_once(qa, "window.SFPOpenFinanceUnifiedSync?.version === 1", "window.SFPOpenFinanceUnifiedSync?.version === 2", 'QA version wait')

helper_marker = "function stateFor(name) {"
helper = r'''async function installMutableTransferBridge(page) {
  await page.addInitScript(() => {
    window.__qaTransferPayload = { ok:true, provider:'pluggy-personal', readOnly:true, itemCount:0, accountCount:0, transactionPreviewCount:0, items:[] };
    Object.defineProperty(window, 'PluggyBridge', {
      configurable: true,
      value: {
        getCredentialStatus: () => JSON.stringify({ ok:true, configured:true, clientIdMasked:'11111111…1111', itemReferenceCount:2 }),
        saveCredentials: () => JSON.stringify({ ok:true, configured:true }),
        previewData: () => JSON.stringify(window.__qaTransferPayload),
        clearCredentials: () => true,
        saveItemIds: () => JSON.stringify({ ok:true, itemReferenceCount:2 })
      }
    });
  });
}

function transferPayload(includeIncome) {
  const items = [{
    id:'item-itau', connectorName:'MeuPluggy', institution:'Itaú', status:'UPDATED',
    accounts:[{
      id:'acc-itau', type:'BANK', subtype:'CHECKING_ACCOUNT', name:'Itaú', presentationName:'Itaú', balance:500, currencyCode:'BRL',
      transactions:[{ id:'pix-out', date:'2026-09-15T12:00:00.000Z', description:'Pix enviado JHONY RIBEIRO DA ROCHA ALVES', amount:149.69, type:'DEBIT', status:'POSTED', currencyCode:'BRL' }]
    }]
  }];
  if(includeIncome)items.push({
    id:'item-nubank', connectorName:'MeuPluggy', institution:'Nubank', status:'UPDATED',
    accounts:[{
      id:'acc-nubank', type:'BANK', subtype:'CHECKING_ACCOUNT', name:'Nubank', presentationName:'Nubank', balance:300, currencyCode:'BRL',
      transactions:[{ id:'pix-in', date:'2026-09-15T12:05:00.000Z', description:'Pix recebido JHONY RIBEIRO DA ROCHA ALVES', amount:149.69, type:'CREDIT', status:'POSTED', currencyCode:'BRL' }]
    }]
  });
  return { ok:true, provider:'pluggy-personal', readOnly:true, itemCount:items.length, accountCount:items.length, transactionPreviewCount:items.length, items };
}

'''
if helper_marker not in qa:
    raise RuntimeError('QA helper marker missing')
qa = qa.replace(helper_marker, helper + helper_marker, 1)

extra_tests = r'''

test('#229 promove saída antiga para transferência quando a entrada chega em sincronização posterior', async ({ page }) => {
  const errors = monitor(page);
  await installMutableTransferBridge(page);
  const value = fixture('open-finance-base.json');
  value.settings = value.settings || {};
  value.settings.name = 'Transferência retroativa #229';
  value.mesAtual = '2026-09';
  value.baseDate = '2026-09-01';
  value.accounts = [
    { id:1, name:'Itaú', type:'Conta corrente', initial:1000, balanceMode:'snapshot', balanceDate:'2026-09-01' },
    { id:2, name:'Nubank', type:'Conta corrente', initial:500, balanceMode:'snapshot', balanceDate:'2026-09-01' }
  ];
  value.cards = [];
  value.transactions = [];
  value.purchases = [];
  value.transfers = [];
  await boot(page, value);
  await page.waitForTimeout(900);

  await page.evaluate(payload => { window.__qaTransferPayload = payload; }, transferPayload(false));
  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(() => page.evaluate(() => state.transactions.filter(t => t.externalId === 'pluggy:pix-out').length)).toBe(1);
  expect(await page.evaluate(() => state.transfers.length)).toBe(0);
  const oldImpact = await page.evaluate(() => state.transactions.find(t => t.externalId === 'pluggy:pix-out')?.balanceImpact);

  await page.evaluate(payload => { window.__qaTransferPayload = payload; }, transferPayload(true));
  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(() => page.evaluate(() => state.transfers.length)).toBe(1);

  const promoted = await page.evaluate(() => ({
    standalone: state.transactions.filter(t => ['pluggy:pix-out','pluggy:pix-in'].includes(t.externalId)),
    transfers: state.transfers.map(t => ({ amount:t.amount, fromId:t.fromId, toId:t.toId, keys:t.openFinanceExternalIds, byAccount:t.balanceImpactByAccount, matchedBy:t.matchedBy }))
  }));
  expect(promoted.standalone).toHaveLength(0);
  expect(promoted.transfers).toHaveLength(1);
  expect(promoted.transfers[0]).toMatchObject({ amount:149.69, fromId:1, toId:2, matchedBy:'open-finance-bank-pair' });
  expect(promoted.transfers[0].keys).toEqual(expect.arrayContaining(['pluggy:pix-out','pluggy:pix-in']));
  expect(promoted.transfers[0].byAccount['1']).toBe(oldImpact);

  await page.locator('#openFinanceSyncBtn').click();
  await expect.poll(() => page.evaluate(() => state.transfers.length)).toBe(1);
  expect(await page.evaluate(() => state.transactions.filter(t => ['pluggy:pix-out','pluggy:pix-in'].includes(t.externalId)).length)).toBe(0);
  expect(errors).toEqual([]);
});

test('Sincronização mantém instituições e transações recolhidas por padrão', async ({ page }) => {
  await installBridge(page);
  const value = stateFor('Open Finance compacto');
  await boot(page, value);
  await page.locator('#openFinancePreviewBtn').click();

  const institution = page.locator('#openFinancePreview details[data-open-finance-item]').first();
  await expect(institution).toBeVisible();
  expect(await institution.evaluate(node => node.open)).toBe(false);
  await institution.locator(':scope > summary').click();

  const txDetails = institution.locator('details[data-open-finance-transactions]').first();
  await expect(txDetails).toBeVisible();
  expect(await txDetails.evaluate(node => node.open)).toBe(false);
  await txDetails.locator(':scope > summary').click();
  await expect(txDetails.locator('.item').first()).toBeVisible();
});
'''
if "#229 promove saída antiga" not in qa:
    qa += extra_tests
qa_path.write_text(qa, encoding='utf-8')


gradle_path = ROOT / 'gradle.properties'
gradle = gradle_path.read_text(encoding='utf-8')
gradle = replace_once(gradle, 'SFP_VERSION_CODE=45', 'SFP_VERSION_CODE=46', 'versionCode')
gradle = replace_once(gradle, 'SFP_VERSION_NAME=2.2.0-openfinance.26', 'SFP_VERSION_NAME=2.2.0-openfinance.27', 'versionName')
gradle_path.write_text(gradle, encoding='utf-8')

print('Issue #229 + compact Open Finance UI applied successfully.')
