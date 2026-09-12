import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:8080/',{waitUntil:'domcontentloaded'});
  await page.locator('.object-card').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('#map-empty').hidden||document.querySelector('#map-message').textContent.includes('Не удалось'),null,{timeout:30000}).catch(()=>{});
  await mkdir('.local',{recursive:true});
  await page.screenshot({path:'.local/desktop.png',fullPage:true});
  console.log(JSON.stringify({title:await page.title(),cards:await page.locator('.object-card').count(),mapHidden:await page.locator('#map-empty').isHidden(),markers:await page.locator('.marker').count(),errors}));
  await page.locator('.object-card').first().click();
  await page.getByRole('button',{name:'Сообщить о проблеме',exact:true}).click();
  console.log('appeal helper:',await page.locator('#appeal-dialog').isVisible());
  await page.keyboard.press('Escape');
  await page.locator('[data-layer="availability"]').click();
  await page.screenshot({path:'.local/data-availability.png',fullPage:true});
  console.log('data panel:',await page.locator('#availability-panel').textContent());
} finally { await browser.close(); }
