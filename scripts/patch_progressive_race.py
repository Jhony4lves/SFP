from pathlib import Path

p = Path('app/src/main/assets/www/index.html')
s = p.read_text(encoding='utf-8')

repls = [
    (
        "$('accountForm').onsubmit=async e=>{e.preventDefault();let id=+$('accountId').value",
        "$('accountForm').onsubmit=async e=>{e.preventDefault();let panel=e.currentTarget.closest('.management-form-panel'),id=+$('accountId').value",
        'account panel capture'
    ),
    (
        "resetManagementForm('accountForm',{id:'accountId',titleId:'accountFormTitle',title:'Adicionar conta',modeId:'accountFormMode',submitId:'accountSubmit',submitText:'Salvar conta'});closeProgressive(false)};",
        "resetManagementForm('accountForm',{id:'accountId',titleId:'accountFormTitle',title:'Adicionar conta',modeId:'accountFormMode',submitId:'accountSubmit',submitText:'Salvar conta'});if(progressiveRestore?.node===panel)closeProgressive(false)};",
        'account conditional close'
    ),
    (
        "$('recForm').onsubmit=async e=>{e.preventDefault();let id=+$('recId').value",
        "$('recForm').onsubmit=async e=>{e.preventDefault();let panel=e.currentTarget.closest('.management-form-panel'),id=+$('recId').value",
        'recurrence panel capture'
    ),
    (
        "resetManagementForm('recForm',{id:'recId'});closeProgressive(false)};",
        "resetManagementForm('recForm',{id:'recId'});if(progressiveRestore?.node===panel)closeProgressive(false)};",
        'recurrence conditional close'
    ),
    (
        "$('debtForm').onsubmit=async e=>{e.preventDefault();let id=+$('debtId').value",
        "$('debtForm').onsubmit=async e=>{e.preventDefault();let panel=e.currentTarget.closest('.management-form-panel'),id=+$('debtId').value",
        'debt panel capture'
    ),
    (
        "resetManagementForm('debtForm',{id:'debtId',titleId:'debtFormTitle',title:'Adicionar dívida',modeId:'debtFormMode',submitId:'debtSubmit',submitText:'Adicionar dívida',detailsId:'debtMoreDetails'});closeProgressive(false)};",
        "resetManagementForm('debtForm',{id:'debtId',titleId:'debtFormTitle',title:'Adicionar dívida',modeId:'debtFormMode',submitId:'debtSubmit',submitText:'Adicionar dívida',detailsId:'debtMoreDetails'});if(progressiveRestore?.node===panel)closeProgressive(false)};",
        'debt conditional close'
    ),
]

for old, new, label in repls:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
