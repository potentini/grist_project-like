const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=structuredClone(require('../demo.json'));
fixture.meta.find(c=>c.table==='Chantiers'&&c.colId==='Statut').type='Choice';
fixture.meta.find(c=>c.table==='Chantiers'&&c.colId==='Statut').widgetOptions=JSON.stringify({choices:['À faire','En cours','Fait']});
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 for(const width of [1440,768,390])for(const baseOne of [true,false]){
  const ctx=await browser.newContext({viewport:{width,height:1000},screen:{width,height:1000},hasTouch:width<1000,isMobile:width<1000,colorScheme:baseOne?'light':'dark'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
  await page.addInitScript(require('./renamed-fixture.cjs'),fixture);
  await page.addInitScript(baseOne=>{
   const get=grist.getOption;grist.getOption=async key=>{const v=await get(key);if(key==='projectWorkspaceMappingV1')v.streams.progressBaseOne=baseOne;return v};
   const original=grist.docApi.applyUserActions;
   grist.docApi.applyUserActions=async actions=>{if(window.rejectQuick)throw Error('Accès refusé');return original(actions)};
  },baseOne);
  await page.goto('http://127.0.0.1:8766/');await page.locator('#list > *').first().waitFor();
  if(width===390){await page.locator('#phoneNav summary').click();await page.locator('#phoneNav [data-view=projects]').click()}
  await page.locator('#list [data-kind=projects][data-id="1"]').click();
  assert.equal(await page.locator('.card-quick-actions').count(),0);
  await page.locator('#editionButton').click();
  const grid=page.locator('#detail .card-quick-actions').first();
  await grid.waitFor();assert.equal(await grid.locator('button').count(),4);
  const rects=await grid.locator('button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));
  assert.ok(rects.every(r=>r.w===30&&r.h>=30&&Math.abs(r.h-rects[0].h)<1));assert.equal(rects[0].y,rects[1].y);assert.equal(rects[2].y,rects[3].y);assert.equal(rects[0].x,rects[2].x);
  const heights=await grid.evaluate(e=>[e.getBoundingClientRect().height,e.previousElementSibling.getBoundingClientRect().height]);
  assert.ok(Math.abs(heights[0]-heights[1])<1);
  const progress=grid.locator('[data-quick-field=Avancement]'),status=grid.locator('[data-quick-field=Statut]');
  await progress.click();assert.deepEqual(await page.locator('#quickUpdateChoices button').allTextContents(),['0 %','25 %','50 %','75 %','100 %']);
  await page.locator('#quickUpdateClose').click();assert.deepEqual(await page.evaluate(()=>writes),[]);
  for(const value of [25,50,75,100,0]){
   await progress.click();await page.locator('#quickUpdateChoices').getByRole('button',{name:value+' %',exact:true}).click();
   await page.locator('#quickUpdateDialog').waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>testDb.data.streams[0].Avancement),value/(baseOne?100:1));
   assert.equal(await page.locator('#detail h2').innerText(),'Projet exemple');
  }
  await status.click();assert.deepEqual(await page.locator('#quickUpdateChoices button').allTextContents(),['Non renseigné','À faire','En cours','Fait']);
  await page.evaluate(()=>window.rejectQuick=true);
  await page.locator('#quickUpdateChoices').getByRole('button',{name:'En cours',exact:true}).click();
  await page.locator('#quickUpdateError').filter({hasText:'Accès refusé'}).waitFor();
  assert.equal(await page.evaluate(()=>testDb.data.streams[0].Statut),'');
  await page.evaluate(()=>window.rejectQuick=false);
  await page.locator('#quickUpdateChoices').getByRole('button',{name:'En cours',exact:true}).click();
  await page.locator('#quickUpdateDialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>testDb.data.streams[0].Statut),'En cours');
  await status.click();await page.evaluate(()=>testDb.data.streams[0].Statut='Fait');
  await page.locator('#quickUpdateChoices').getByRole('button',{name:'À faire',exact:true}).click();
  await page.locator('#quickUpdateError').filter({hasText:'entre-temps'}).waitFor();
  assert.equal(await page.evaluate(()=>testDb.data.streams[0].Statut),'Fait');
  await page.locator('#quickUpdateClose').click();
  await progress.click();await page.evaluate(()=>testDb.meta.find(c=>c.table==='Chantiers'&&c.colId==='Avancement').isFormula=true);
  await page.locator('#quickUpdateChoices').getByRole('button',{name:'25 %',exact:true}).click();
  await page.locator('#quickUpdateError').filter({hasText:'nature du champ'}).waitFor();
  assert.equal(await page.evaluate(()=>testDb.data.streams[0].Avancement),0);
  await page.locator('#quickUpdateClose').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await ctx.close();
 }
 console.log('PASS four-button grid, five progress steps with both scales, configured statuses, cancel, permission denial, concurrent change and formula protection on PC/tablet/phone in light/dark');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
