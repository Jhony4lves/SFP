from pathlib import Path
import re

# 1) Bills module: direct integration hook, no API/save monkey-patching.
p = Path('app/src/main/assets/www/open-finance-bills.js')
s = p.read_text()
s = s.replace('let lastPreview=null,coreSave=null;', 'let lastPreview=null;')
s = s.replace("function apply(result){if(!result?.ok||!global.state)return{changed:false,bills:0,inferred:0};", "function apply(result){if(result?.ok)lastPreview=result;if(!result?.ok||!global.state)return{changed:false,bills:0,inferred:0};")
s = re.sub(r"function capture\(r\)\{.*?function previewAccount", "function previewAccount", s, flags=re.S)
s = s.replace("adj=global.invoiceAdjustments?.(cardId,m)||[]", "adj=(global.state.invoiceAdjustments||[]).filter(a=>same(a.cardId,cardId)&&a.month===m)")
s = s.replace("if(!global.state||!wrapApi()||!wrapSave()||!ui())", "if(!global.state||!ui())")
p.write_text(s)

# 2) Unified sync: apply bill reconciliation even when no new purchase/bank tx exists.
p = Path('app/src/main/assets/www/open-finance-sync-accounts.js')
s = p.read_text()
old = """        const cardApplied=applyCardPlan(card);\n        const bankApplied=applyBankPlan(bank);\n        const mutations=cardApplied.created+cardApplied.linked+bankApplied.created+bankApplied.linked+bankApplied.transfers;"""
new = """        const cardApplied=applyCardPlan(card);\n        const bankApplied=applyBankPlan(bank);\n        const billApplied=global.SFPOpenFinanceBills?.apply?.(result)||{changed:false,bills:0,inferred:0};\n        const mutations=cardApplied.created+cardApplied.linked+bankApplied.created+bankApplied.linked+bankApplied.transfers+(billApplied.changed?1:0);"""
if old not in s:
    raise SystemExit('sync mutation block not found')
s = s.replace(old, new)
s = s.replace("""        if(card.pending+bank.pending)detail.push(`${card.pending+bank.pending} pendente(s) aguardando confirmação`);""", """        if(billApplied.bills)detail.push(`${billApplied.bills} fatura(s) oficial(is) conciliada(s)`);\n        if(billApplied.inferred)detail.push(`${billApplied.inferred} fatura(s) aberta(s) conciliada(s) pelo limite usado`);\n        if(card.pending+bank.pending)detail.push(`${card.pending+bank.pending} pendente(s) aguardando confirmação`);""")
s = s.replace("return{ok:true,card,bank,cardApplied,bankApplied};", "return{ok:true,card,bank,cardApplied,bankApplied,billApplied};")
p.write_text(s)

# 3) QA: do not navigate away from the Open Finance panel before clicking sync.
p = Path('qa/open-finance-bills.spec.js')
s = p.read_text().replace("  await page.evaluate(()=>setPage('dados'));\n  await page.locator('#openFinanceSyncBtn').click();", "  await page.locator('#openFinanceSyncBtn').click();")
p.write_text(s)
