from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    text = text.replace(old, new, 1)
    print('patched', label)


replace_once(
    "<script>\nconst VERSION=202, SCHEMA_VERSION=12, DB_NAME='SFP_JHONY_STABLE', STORE='state', DB_KEY='main';",
    "<script src=\"financial-intelligence.js\"></script>\n<script>\nconst VERSION=202, SCHEMA_VERSION=12, DB_NAME='SFP_JHONY_STABLE', STORE='state', DB_KEY='main';",
    'module-loader'
)

old_exports = "window.financialContextSnapshot=financialContextSnapshot;window.sfpFinancialContextSnapshot=financialContextSnapshot;window.financialCalendarEvents=financialCalendarEvents;window.FINANCIAL_SEMANTICS=FINANCIAL_SEMANTICS;"
adapter = r'''function financialIntelligenceSnapshot({reference=new Date(),months=4}={}){
 const historyMonths=Math.max(2,Math.min(12,Number(months)||4)),currentMonth=localCivilMonth(reference),snapshot=financialContextSnapshot({reference,months:historyMonths});
 const categoryMonths=Math.min(4,historyMonths),categoryMonthly=Array.from({length:categoryMonths},(_,i)=>monthAdd(currentMonth,i-categoryMonths+1)).map(month=>({month,categoriesCents:Object.fromEntries(Object.entries(categoriesSpent(month)).map(([category,value])=>[category,toCents(value)]))}));
 const transactions=(state.transactions||[]).map(t=>({id:t.id,accountId:t.accountId,date:t.date,kind:t.kind,amountCents:toCents(t.amount),desc:t.desc||'',statementKey:t.statementKey||null,economicImpact:t.economicImpact||null}));
 if(!window.SFPFinancialIntelligence||typeof window.SFPFinancialIntelligence.analyze!=='function')return{version:0,generatedFor:snapshot.referenceDate,currentMonth,summary:{total:0,critical:0,warning:0,info:0},metrics:{},insights:[],error:'financial_intelligence_engine_unavailable'};
 return window.SFPFinancialIntelligence.analyze({snapshot,currentMonth,referenceDate:snapshot.referenceDate,categoryMonthly,transactions});
}
window.financialIntelligenceSnapshot=financialIntelligenceSnapshot;window.sfpFinancialIntelligenceSnapshot=financialIntelligenceSnapshot;
'''
replace_once(old_exports, adapter + old_exports, 'financial-intelligence-adapter')

replace_once(
    "enum: ['overview', 'cashflow', 'cards', 'debts', 'goals', 'patrimony', 'category_spending', 'upcoming'],",
    "enum: ['overview', 'cashflow', 'cards', 'debts', 'goals', 'patrimony', 'category_spending', 'upcoming', 'insights'],",
    'sophy-tool-enum'
)

replace_once(
    "      default:\n        return this.buildContext('overview', options);",
    "      case 'insights': {\n        const report = financialIntelligenceSnapshot({ reference: new Date(), months: 4 });\n        return { scope: 'insights', report };\n      }\n      default:\n        return this.buildContext('overview', options);",
    'sophy-insights-scope'
)

marker = "    // Consulta de Próximos 7 Dias / Vencimentos Imediatos"
block = r'''    // Financial Intelligence Foundation — leitura determinística e explicável
    if(/(o que merece atencao|alertas financeiros|insights financeiros|tem algo preocupante|o que devo observar|algum risco nas minhas financas|como estao meus alertas)/i.test(norm)){
      const report=financialIntelligenceSnapshot({reference:new Date(),months:4});
      const top=(report.insights||[]).slice(0,4);
      state.sophy.context={lastIntent:'financial_insights',lastAmount:null,lastEntity:'financial_insights'};
      if(!top.length){
        return{text:'O motor local não encontrou nenhum alerta financeiro relevante com os dados disponíveis agora. Isso não substitui sua conferência dos lançamentos, mas os sinais determinísticos estão tranquilos.',emotion:'cheerful',structured:{type:'financial_insights',report}};
      }
      const lines=top.map(i=>`• **${i.title}** — ${i.message}`).join('\n');
      const critical=report.summary?.critical||0,warning=report.summary?.warning||0;
      return{text:`Encontrei ${report.summary?.total||top.length} ponto${(report.summary?.total||top.length)===1?'':'s'} de atenção pelo motor local (${critical} crítico${critical===1?'':'s'}, ${warning} aviso${warning===1?'':'s'}):\n\n${lines}\n\nCada sinal vem de regras e valores do próprio SFP; eu não estimei números por conta própria.`,emotion:critical?'concerned':warning?'focused':'cheerful',structured:{type:'financial_insights',report}};
    }

'''
replace_once(marker, block + marker, 'sophy-offline-insights')

path.write_text(text, encoding='utf-8')
