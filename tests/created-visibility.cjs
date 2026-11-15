const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('../demo.json');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
 await page.addInitScript(require('./renamed-fixture.cjs'),fixture);
 await page.addInitScript(()=>{
   window.nativeFetches=0;
   grist.selectedTable.getTableId=async()=>window.testDb.tables.find(t=>t.id===4).tableId;
   grist.viewApi={fetchSelectedTable:async()=>{
     window.nativeFetches++;
     return window.testDb.data.notes.filter(r=>!window.hideNew || r.id===1);
   }};
 });
 await page.goto('http://127.0.0.1:8769/');await page.locator('#list > *').first().waitFor();
 await page.locator('[data-view=notes]').first().click();await page.locator('#editionButton').click();
 await page.locator('[data-new=notes]').click();await page.locator('[name=Titre]').fill('Visible après création');await page.locator('#save').click();
 await page.locator('#detail h2').filter({hasText:'Visible après création'}).waitFor();
 assert.equal(await page.locator('#list').getByText('Visible après création',{exact:true}).isVisible(),true);
 assert.ok(await page.evaluate(()=>nativeFetches)>=2);
 // Direct-table insert without a Grist onRecords event: clicking the active tab reloads it.
 await page.evaluate(()=>addNativeNote());await page.locator('[data-view=notes]').first().click();
 await page.locator('#list').getByText('Réunion créée dans Grist',{exact:true}).waitFor();
 // Keep the authoritative native filter intact and explain a filtered-out creation.
 await page.evaluate(()=>window.hideNew=true);await page.locator('[data-new=notes]').click();
 await page.locator('[name=Titre]').fill('Masquée volontairement');await page.locator('#save').click();
 await page.locator('#message').getByText(/Masquée volontairement.*enregistré.*masqué/).waitFor();
 assert.equal(await page.locator('#list').getByText('Masquée volontairement',{exact:true}).count(),0);
 await page.locator('[data-filtered-notes]').getByText(/réunion.*chargée.*affichée/).waitFor();
 await page.evaluate(()=>window.hideNew=false);await page.locator('[data-view=notes]').first().click();
 await page.locator('#list').getByText('Masquée volontairement',{exact:true}).waitFor();
 // Reveal a task created beneath folded ancestors. Remove the meeting scope first.
 await page.evaluate(()=>{grist.selectedTable.getTableId=async()=>null});
 await page.locator('[data-view=projects]').first().click();await page.locator('[data-fold-all=open]').click();
 await page.locator('#list [data-kind=streams]').first().click();await page.locator('[data-fold-all=close]').click();await page.locator('[data-new=tasks]').click();
 await page.locator('[name=Titre]').fill('Tâche sous parents repliés');await page.locator('[name=Chantier]').selectOption('1');
 await page.locator('#save').click();
 await page.locator('#list').getByText('Tâche sous parents repliés',{exact:true}).waitFor();
 assert.equal(await page.locator('#list').getByText('Tâche sous parents repliés',{exact:true}).isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS creation refreshes authoritative Grist scope, reveals eligible meetings/tasks, reloads direct inserts on tab click and explains filtered-out rows without bypassing filters');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
