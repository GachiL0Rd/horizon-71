import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/api/config',route=>route.fulfill({json:{mapAvailable:false,isochrone:true}}));
  await page.goto('/');
  await expect(page.locator('.object-card')).toHaveCount(53);
});

test('Search, filters, reset and deep link work from the source archive',async({page})=>{
  await page.locator('#year').selectOption('2025');
  await expect(page.locator('.object-card')).toHaveCount(18);
  await page.getByRole('button',{name:'Образование',exact:true}).click();
  const count=await page.locator('.object-card').count();
  expect(count).toBeGreaterThan(0);expect(count).toBeLessThan(18);
  await page.locator('.object-card').first().click();
  await expect(page.locator('#detail')).toBeVisible();expect(page.url()).toContain('object=');
  await page.reload();await expect(page.locator('#detail')).toBeVisible();
  await page.locator('#reset').click();await expect(page.locator('.object-card')).toHaveCount(53);
});

test('Object history never uses placeholder imagery',async({page})=>{
  await page.locator('.object-card').nth(1).click();
  await page.getByRole('tab',{name:'История',exact:true}).click();
  await expect(page.locator('#detail')).toContainText('не подменяет их условными изображениями');
  await expect(page.locator('.scene svg')).toHaveCount(0);
});

test('Data panel explains unavailable indicators without fabricated calculations',async({page})=>{
  await page.locator('[data-layer="availability"]').click();
  await expect(page.locator('#availability-panel')).toBeVisible();
  await expect(page.locator('#availability-panel')).toContainText('Показатель не рассчитывается');
  await expect(page.locator('#capacity')).toHaveCount(0);
  await expect(page.locator('#population')).toHaveCount(0);
});

test('Appeal helper prepares an official submission without local storage',async({page})=>{
  await page.locator('.object-card').first().click();
  await page.getByRole('button',{name:'Сообщить о проблеме',exact:true}).click();
  await expect(page.locator('#appeal-dialog')).toBeVisible();
  await expect(page.locator('#appeal-dialog')).toContainText('не хранит ваше обращение');
  await expect(page.locator('#appeal-dialog a[href="https://pos.gosuslugi.ru/landing/"]')).toBeVisible();
});

test('Analytics and exported dataset follow current selection',async({page})=>{
  await page.locator('#year').selectOption('2022');
  await page.locator('[data-view="analytics"]').click();
  await expect(page.locator('#analytics')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  expect((await downloadPromise).suggestedFilename()).toBe('horizon71-objects.json');
});

test('Local configuration, source and removed demo routes are unavailable',async({request})=>{
  for(const url of ['/.env','/server.mjs','/feedback.mjs','/feedback.css','/js/feedback.js','/data/feedback-demo.json']) {
    expect((await request.get(url)).status()).toBe(404);
  }
  const config=await (await request.get('/api/config')).json();
  expect(config).not.toHaveProperty('mapKey');
  expect((await request.get('/api/isochrone?id=unknown&minutes=10')).status()).toBe(400);
});
