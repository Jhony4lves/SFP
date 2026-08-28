from pathlib import Path

path = Path('app/src/main/assets/www/index.html')
text = path.read_text(encoding='utf-8')

old = "let current={source:'current',accountId:r.accountId,date:r.date,desc:r.desc,statementKey:r.key,signedAmount:Number(r.amount)||0,balanceImpact:r.date>state.baseDate,file:r.file||null};"
new = "let current={source:'current',accountId:r.accountId,date:r.date,desc:r.desc,statementKey:r.key,amount:Number(r.amount)||0,signedAmount:Number(r.amount)||0,balanceImpact:r.date>state.baseDate,file:r.file||null};"

if old in text:
    if text.count(old) != 1:
        raise RuntimeError(f'expected one finalize current row, found {text.count(old)}')
    text = text.replace(old, new, 1)
elif new not in text:
    raise RuntimeError('finalize current row shape changed unexpectedly')

path.write_text(text, encoding='utf-8')
print('Transfer finalization amount contract fixed.')
