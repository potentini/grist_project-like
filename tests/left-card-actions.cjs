const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=structuredClone(require('../demo.json'));
fixture.meta.find(c=>c.table==='Chantiers'&&c.colId==='Statut').type='Choice';
fixture.meta.find(c=>c.table==='Chantiers'&&c.colId==='Statut').widgetOptions=JSON.stringify({choices:['À faire','En cours','Fait']});
fixture.data.tasks.push({...fixture.data.tasks[0],id:2,Code:'T002',Titre:'Feuille test'});
fixture.meta.push({id:900,parentId:2,table:'Chantiers',colId:'Enfants',label:'Enfants',type:'RefList:Taches',isFormula:false});
fixture.data.streams[0].Enfants=['L',1,2];
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const width of [1440,768,390]){
 const ctx=await browser.newContext({viewport:{width,height:1000},screen:{width,height:1000},hasTouch:width<1000,isMobile:width<1000});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await p.addInitScript(require('./renamed-fixture.cjs'),fixture);
 await p.addInitScript(()=>{
  const api=grist.docApi,original=api.applyUserActions;
  api.applyUserActions=async actions=>{for(const a of actions){if(a[0]==='RemoveRecord'){testDb.data.tasks=testDb.data.tasks.filter(r=>r.id!==a[2]);writes.push(a)}else await original([a])}return {retValues:[]}};
 });
 await p.goto('http://127.0.0.1:8766/');await p.locator('#list > *').first().waitFor();
 if(width===390){await p.locator('#phoneNav summary').click();await p.locator('#phoneNav [data-view=projects]').click()}
 assert.equal(await p.locator('#list .card-quick-actions').count(),0);await p.locator('#editionButton').click();await p.locator('#list [data-fold-all=open]').click();
 const grid=(kind,id)=>p.locator(`#list [data-tree-kind=${kind}][data-tree-id="${id}"] > .tree-row > .card-quick-actions`);
 assert.equal(await grid('projects',1).locator('button').count(),4);assert.equal(await grid('projects',1).locator('.move-button').isDisabled(),true);
 const stream=grid('streams',1);assert.equal(await stream.locator('button').count(),4);
 await stream.locator('[data-quick-field=Avancement]').click();await p.locator('#quickUpdateChoices').getByRole('button',{name:'75 %',exact:true}).click();await p.locator('#quickUpdateDialog').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>testDb.data.streams[0].Avancement),0.75);
 assert.equal(await p.locator('#detail [data-edit]').count(),0);
 await stream.locator('[data-quick-field=Statut]').click();await p.locator('#quickUpdateChoices').getByRole('button',{name:'En cours',exact:true}).click();await p.locator('#quickUpdateDialog').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>testDb.data.streams[0].Statut),'En cours');
 await stream.locator('[data-move-kind]').click();await p.locator('#moveTarget').selectOption('projects:2');await p.locator('#moveSubmit').click();await p.locator('#moveDialog').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>testDb.data.streams[0].Projet),'P002');
 await p.locator('#list [data-fold-all=open]').click();
 // Root deletion stays blocked by descendants, regardless of the currently selected item.
 await grid('projects',2).locator('[data-removal]').click();await p.getByText(/Suppression bloquée/).waitFor();assert.equal(await p.locator('#removalSubmit').isDisabled(),true);await p.locator('#removalCancel').click();
 const leaf=grid('tasks',2);
 await leaf.locator('[data-removal]').click();await p.locator('#removalSubmit:enabled').waitFor();await p.locator('#removalCancel').click();assert.ok(await p.evaluate(()=>testDb.data.tasks.some(r=>r.id===2)));
 await leaf.locator('[data-removal]').click();await p.locator('#removalSubmit:enabled').waitFor();await p.locator('#removalConfirm').check();await p.locator('#removalSubmit').click();await p.locator('#removalDialog').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>testDb.data.tasks.some(r=>r.id===2)),false);assert.deepEqual(await p.evaluate(()=>testDb.data.streams[0].Enfants),['L',1]);
 if(width===390)assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('phone-detail')),false);
 await p.locator('#editionButton').click();assert.equal(await p.locator('#list .card-quick-actions').count(),0);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await ctx.close();
}
console.log('PASS left-pane grid, progress/status/move without selecting the item, root deletion blockers, parent-only leaf deletion and cleanup, read/edit gating, PC/tablet/phone');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
