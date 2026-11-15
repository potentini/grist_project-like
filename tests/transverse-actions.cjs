const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('../demo.json');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
for(const phone of [false,true])for(const source of ['projects','streams','tasks']){
 const page=await browser.newPage({viewport:{width:phone?390:1400,height:950},screen:{width:phone?390:1400,height:950},isMobile:phone,hasTouch:phone});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
 await page.addInitScript(require('./renamed-fixture.cjs'),fixture);
 await page.addInitScript(source=>{
  testDb.data.actions=[{id:1,Code:'A001',Titre:'Action du projet sélectionné',Projet:'P001',Chantier:'C001',Tache:'T001'},
   {id:2,Code:'A002',Titre:'Action autre projet',Projet:'P002'},
   {id:3,Code:'A003',Titre:'Action autonome'}];
  if(!testDb.data[source].some(r=>r.id===2))testDb.data[source].push({...testDb.data[source][0],id:2,Code:'SECOND'});
  window.currentSource=source;window.visibleIds=[1];
  grist.selectedTable.getTableId=async()=>({projects:'Projets',streams:'Chantiers',tasks:'Taches',actions:'Actions'}[currentSource]);
  grist.viewApi={fetchSelectedTable:async()=>testDb.data[currentSource].filter(r=>visibleIds===null||visibleIds.includes(r.id))};
 },source);
 await page.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:8769')+'/');await page.locator('#list > *').first().waitFor();
 const view=async kind=>{if(phone){await page.locator('#phoneNav').evaluate(e=>e.open=true);await page.locator('#phoneNav [data-view='+kind+']').click()}else await page.locator('nav [data-view='+kind+']').click()};
 await view('actions');await page.locator('[data-fold-all=open]').click();
 for(const title of ['Action du projet sélectionné','Action autre projet','Action autonome'])assert.equal(await page.locator('#list').getByText(title,{exact:true}).isVisible(),true);
 await page.evaluate(()=>window.visibleIds=[]);await page.locator('#refresh').evaluate(e=>e.click());
 await page.locator('#list').getByText('Action autre projet',{exact:true}).waitFor();
 assert.equal(await page.locator('#list [data-kind=actions]').count(),3);
 await view('projects');await page.waitForFunction(()=>document.querySelectorAll('#list [data-kind=projects]').length===0);
 await page.evaluate(()=>window.visibleIds=[1]);await page.locator('#refresh').evaluate(e=>e.click());
 await page.waitForFunction(()=>document.querySelectorAll('#list [data-kind=projects]').length===1);
 assert.equal(await page.locator('#list').getByText('Action autre projet',{exact:true}).count(),0);
 await view('actions');await page.locator('[data-fold-all=open]').click();
 await page.evaluate(()=>{const f=document.querySelector('#projectFilter');f.value='1';f.dispatchEvent(new Event('change',{bubbles:true}))});
 await page.waitForFunction(()=>document.querySelectorAll('#list [data-kind=actions]').length===1);
 await page.evaluate(()=>{const f=document.querySelector('#projectFilter');f.value='';f.dispatchEvent(new Event('change',{bubbles:true}))});
 await page.waitForFunction(()=>document.querySelectorAll('#list [data-kind=actions]').length===3);
 // A native filter directly on Actions must continue to restrict the general list.
 await page.evaluate(()=>{window.currentSource='actions';window.visibleIds=[1]});await page.locator('#refresh').evaluate(e=>e.click());
 await page.waitForFunction(()=>document.querySelectorAll('#list [data-kind=actions]').length===1);
 assert.equal(await page.locator('#list').getByText('Action autonome',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);await page.close();
}
console.log('PASS desktop/phone general actions independent of reduced/empty hierarchy scopes, contextual Projects preserved, explicit project filters and native Action filters retained');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
