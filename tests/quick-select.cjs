const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('../demo.json');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 for(const phone of [false,true])for(const colorScheme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:phone?390:1400,height:phone?844:1000},screen:{width:phone?390:1400,height:phone?844:1000},hasTouch:phone,isMobile:phone,colorScheme}),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
  await page.addInitScript(require('./renamed-fixture.cjs'),fixture);
  await page.addInitScript(()=>{
   testDb.data.projects=[{id:1,Code:'P001',Titre:'Projet Énergie',Responsable:'Alice',Statut:'En cours'},{id:2,Code:'P002',Titre:'Projet Mobilité',Responsable:'Bob',Statut:'À faire'}];
   testDb.data.streams=[];testDb.data.tasks=[];testDb.data.actions=[];
  });
  await page.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:8769')+'/');await page.locator('#list > *').first().waitFor();
  if(phone){await page.locator('#phoneNav summary').tap();await page.locator('#phoneNav [data-view=projects]').tap();await page.locator('#phoneFilters').tap();}
  const select=(id)=>page.locator('#'+id).locator('..').locator('.quick-picker');
  for(const [id,query,label] of [['projectFilter','energie','Projet Énergie'],['ownerFilter','ali','Alice'],['statusFilter','cours','En cours']]){
   const picker=select(id), input=picker.locator('.quick-search');
   assert.equal(await input.getAttribute('role'),'combobox');
   assert.equal(await picker.locator('.reference-options').getAttribute('role'),'listbox');
   const before=await page.locator('#list [data-kind=projects]').count();
   await input.fill(query);
   assert.equal(await picker.getByRole('option').count(),1);
   assert.equal(await page.locator('#list [data-kind=projects]').count(),before,'typing does not apply a filter');
   if(phone)await picker.getByRole('option',{name:'☐ '+label,exact:true}).tap();
   else {await input.press('ArrowDown');await input.press('Enter');}
   assert.equal(await page.locator('#list [data-kind=projects]').count(),1);
   await input.press('Escape');assert.equal(await input.inputValue(),label);
   assert.equal(await input.getAttribute('aria-expanded'),'false');
   await input.click();await input.fill('aucune-correspondance');
   await picker.getByRole('status').filter({hasText:'Aucun résultat'}).waitFor();
   await input.press('Tab');assert.equal(await input.inputValue(),label);
   await input.click();if(phone)await picker.getByRole('option',{name:/Tous$/}).tap();else await picker.getByRole('option',{name:/Tous$/}).click();
   await input.press('Escape');assert.equal(await input.inputValue(),'Tous');
  }
  const project=select('projectFilter'),input=project.locator('.quick-search');
  if(phone){await input.fill('energie');await project.getByRole('option',{name:'☐ Projet Énergie',exact:true}).tap();await project.getByRole('option',{name:'☐ Projet Mobilité',exact:true}).tap();}
  else {await input.fill('energie');await input.press('Enter');await input.fill('mobilite');await input.press('Enter');}
  assert.equal(await page.locator('#projectFilter').inputValue(),'__multiple__');
  await input.press('Escape');assert.equal(await input.inputValue(),'Projet Énergie ; Projet Mobilité');
  await input.click();assert.equal(await project.locator('[aria-selected=true]').count(),2);
  await page.locator('#search').click();assert.equal(await input.getAttribute('aria-expanded'),'false');
  if(phone){
   const rows=await page.locator('.quick-filter').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().top));assert.ok(Math.max(...rows)-Math.min(...rows)<2);
   const height=await page.locator('.filters').evaluate(e=>e.offsetHeight);
   await input.click();assert.equal(await page.locator('.filters').evaluate(e=>e.offsetHeight),height,'dropdown floats without shifting filters');
   const r=await project.locator('.reference-options').boundingBox();assert.ok(r.x>=0&&r.x+r.width<=390);
  }
  await input.press('Escape');
  await page.locator('#editionButton').click();
  assert.equal(await page.locator('#editionButton').getAttribute('aria-pressed'),'true');
  await input.click();
  const mobility=project.getByRole('option',{name:'☑ Projet Mobilité',exact:true});
  if(phone)await mobility.tap();else await mobility.click();
  await input.press('Escape');
  assert.deepEqual(await page.locator('#list [data-kind=projects]').evaluateAll(rows=>rows.map(r=>r.dataset.id)),['1']);
  if(process.env.QUICK_SCREENSHOT&&colorScheme==='light')await page.screenshot({path:process.env.QUICK_SCREENSHOT+(phone?'-phone.png':'-desktop.png')});
  assert.equal(await page.evaluate(()=>writes.length),0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS shared main-filter select: search, keyboard/touch, multiple values, reset, blur/Escape, light/dark contrast and compact floating phone menus without writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
