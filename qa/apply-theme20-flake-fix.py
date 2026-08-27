from pathlib import Path

path=Path('qa/month-and-theme-polish.spec.js')
text=path.read_text(encoding='utf-8')
old="""    const chipColors = await page.evaluate(() => {
      const quicktype = document.querySelector('.quicktype');
      const favChip = document.querySelector('.favorite-chip');
      return {
        quicktypeBg: quicktype ? window.getComputedStyle(quicktype).backgroundColor : null,
        favChipBg: favChip ? window.getComputedStyle(favChip).backgroundColor : null
      };
    });

    // Must not be dark hardcoded #081626 (rgb(8, 22, 38))
    if (chipColors.quicktypeBg) {
      expect(chipColors.quicktypeBg).not.toBe('rgb(8, 22, 38)');
    }
    if (chipColors.favChipBg) {
      expect(chipColors.favChipBg).not.toBe('rgb(8, 22, 38)');
    }
"""
new="""    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

    // Os chips têm transição visual de 150ms; espere o estilo claro efetivamente
    // chegar ao DOM em vez de capturar o primeiro frame escuro da animação.
    await expect.poll(() => page.evaluate(() => {
      const quicktype = document.querySelector('.quicktype');
      return quicktype ? window.getComputedStyle(quicktype).backgroundColor : null;
    })).not.toBe('rgb(8, 22, 38)');

    await expect.poll(() => page.evaluate(() => {
      const favChip = document.querySelector('.favorite-chip');
      return favChip ? window.getComputedStyle(favChip).backgroundColor : null;
    })).not.toBe('rgb(8, 22, 38)');
"""
count=text.count(old)
if count!=1: raise SystemExit(f'THEME-20 block: esperado 1, encontrado {count}')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('THEME-20 estabilizado sem enfraquecer a assercao.')
