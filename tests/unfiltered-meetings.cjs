const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('../demo.json');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
for(const source of ['projects','streams','tasks']){
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
 await page.addInitScript(require('./renamed-fixture.cjs'),fixture);
 await page.addInitScript(source=>{
  const table={projects:'Projets',streams:'Chantiers',tasks:'Taches'}[source];
  // Add a second source row so that a restricted scope can be tested.
  if(!testDb.data[source].some(r=>r.id===2))testDb.data[source].push({...testDb.data[source][0],id:2,Code:'SECOND'});
  testDb.data.notes=[
   {id:1,Code:'N001',Titre:'Réunion liée',Projet:'P001',Chantiers:'C001',Taches:'T001'},
   {id:2,Code:'N002',Titre:'Réunion indépendante'},
  ];
  window.visibleSourceIds=null;
  grist.selectedTable.getTableId=async()=>table;
  grist.viewApi={fetchSelectedTable:async()=>testDb.data[source].filter(r=>visibleSourceIds===null||visibleSourceIds.includes(r.id))};
 },source);
 await page.goto('http://127.0.0.1:8769/');await page.locator('#list > *').first().waitFor();
 await page.locator('[data-view=notes]').first().click();
 await page.locator('#list').getByText('Réunion indépendante',{exact:true}).waitFor();
 assert.equal(await page.locator('#list [data-kind=notes]').count(),2);
 await page.evaluate(()=>window.visibleSourceIds=[1]);await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelectorAll('#list [data-kind=notes]').length===1);
 assert.equal(await page.locator('#list').getByText('Réunion indépendante',{exact:true}).count(),0);
 await page.evaluate(()=>window.visibleSourceIds=[]);await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelectorAll('#list [data-kind=notes]').length===0);
 await page.evaluate(()=>window.visibleSourceIds=null);await page.locator('#refresh').click();
 await page.locator('#list').getByText('Réunion indépendante',{exact:true}).waitFor();
 assert.equal(await page.locator('#list [data-kind=notes]').count(),2);
 // Empty source table also cannot impose a parent on otherwise independent meetings.
 await page.evaluate(source=>testDb.data[source]=[],source);await page.locator('#refresh').click();
 await page.locator('#list').getByText('Réunion indépendante',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);await page.close();
}
console.log('PASS independent meetings shown with complete or empty source tables; reduced and zero-row filtered scopes remain authoritative for projects, streams and tasks');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
