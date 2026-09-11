import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
  // Core behavior must also work without the external map service.
  await page.route('**/api/config',r=>r.fulfill({json:{mapKey:'',isochrone:true}}));
  await page.goto('/');await expect(page.locator('.object-card')).toHaveCount(53);
});
test('Search, combined filters, reset and deep link',async({page})=>{
  await page.locator('#year').selectOption('2025');await expect(page.locator('.object-card')).toHaveCount(18);
  await page.getByRole('button',{name:'Образование',exact:true}).click();
  const count=await page.locator('.object-card').count();expect(count).toBeGreaterThan(0);expect(count).toBeLessThan(18);
  await page.locator('.object-card').first().click();await expect(page.locator('#detail')).toBeVisible();expect(page.url()).toContain('object=');
  await page.reload();await expect(page.locator('#detail')).toBeVisible();
  await page.locator('#reset').click();await expect(page.locator('.object-card')).toHaveCount(53);
  await page.locator('#search').fill('<script>test</script>');await expect(page.locator('.object-card')).toHaveCount(0);await expect(page.locator('#detail')).toBeHidden();
});
test('Active object without coordinates keeps truthful contract information',async({page})=>{
  await page.getByRole('button',{name:'Все объекты',exact:true}).click();await expect(page.locator('.object-card')).toHaveCount(95);
  await page.locator('#search').fill('Суворовский 2');await expect(page.locator('.object-card')).toHaveCount(1);
  await page.locator('.object-card').click();await expect(page.locator('#detail')).toContainText('В архиве нет координат');
  await page.getByRole('tab',{name:'Контракт',exact:true}).click();await expect(page.locator('#detail')).toContainText('2,44 млрд');await expect(page.locator('#detail')).toContainText('0366200035625000703');
  await page.getByRole('tab',{name:'Доступность',exact:true}).click();await expect(page.locator('[data-minutes="10"]')).toBeDisabled();
});
test('History and playback stop when card is closed',async({page})=>{
  await page.locator('.object-card').nth(1).click();await page.getByRole('tab',{name:'История',exact:true}).click();
  await expect(page.locator('.scene svg')).toBeVisible();await page.getByRole('button',{name:'После',exact:true}).click();await expect(page.locator('[data-stage="2"]')).toHaveClass('active');
  await page.locator('[data-action="play"]').click();await expect(page.locator('[data-action="play"]')).toContainText('Остановить');
  await page.locator('[data-action="close-detail"]').click();await page.waitForTimeout(2400);await expect(page.locator('#detail')).toBeHidden();
});
test('Social scenario thresholds and invalid inputs',async({page})=>{
  await page.locator('[data-layer="social"]').click();await expect(page.locator('#social-result')).toContainText('70%');
  await page.locator('#capacity').fill('1000');await expect(page.locator('#social-result')).toContainText('100%');
  await page.locator('#capacity').fill('1200');await expect(page.locator('#social-result')).toContainText('Повышенная');
  await page.locator('#population').fill('0');await expect(page.locator('#social-result')).toContainText('корректные');
});
test('Analytics and exported dataset follow current selection',async({page})=>{
  await page.locator('#year').selectOption('2022');await page.locator('[data-view="analytics"]').click();
  await expect(page.locator('#analytics')).toContainText('Сводка по всему');
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('tula-objects.json');
});
test('Mobile layout has no horizontal overflow and opens a readable card',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.object-card').first().click();await expect(page.locator('#detail')).toBeVisible();
  const box=await page.locator('#detail').boundingBox();expect(box.width).toBeLessThanOrEqual(390);expect(box.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Escape');await expect(page.locator('#detail')).toBeHidden();
});
test('Local configuration and source files are not exposed by static server',async({request})=>{
  for(const url of ['/.env','/server.mjs','/routing.mjs','/scripts/import.py','/.local/isochrones.json'])expect((await request.get(url)).status()).toBe(404);
  expect((await request.get('/api/isochrone?id=unknown&minutes=10')).status()).toBe(400);
});
