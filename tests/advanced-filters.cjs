const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('../demo.json');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
for(const phone of [false,true])for(const refs of [false,true]){
 const page=await browser.newPage({viewport:{width:phone?390:1400,height:950},screen:{width:phone?390:1400,height:950},hasTouch:phone,isMobile:phone}),errors=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
 await page.addInitScript(require('./renamed-fixture.cjs'),fixture);
 await page.addInitScript(refs=>{
  testDb.data.projects=[{id:1,Code:'P001',Titre:'Projet Alpha'},{id:2,Code:'P002',Titre:'Projet Bêta'}];
  testDb.data.streams=[{id:1,Code:'C001',Titre:'Chantier Alpha',Projet:'P001'},{id:2,Code:'C002',Titre:'Chantier Bêta',Projet:'P002'}];
  testDb.data.tasks=[{id:1,Code:'T001',Titre:'Tâche 1',Chantier:'C001',Responsable:'Alice',Statut:'À faire'},
   {id:2,Code:'T002',Titre:'Tâche 2',Chantier:'C001',Responsable:'Bob',Statut:'Fait'},
   {id:3,Code:'T003',Titre:'Tâche 3',Chantier:'C002',Responsable:'Alice',Statut:'Fait'}];
  testDb.data.actions=[];
  const status=testDb.meta.find(c=>c.table==='Taches'&&c.colId==='Statut');
  if(localStorage.getItem('rename-status')){
   status.colId='Phase';status.label='Phase';for(const row of testDb.data.tasks){row.Phase=row.Statut;delete row.Statut;}
  }
  if(refs){
   const column=testDb.meta.find(c=>c.table==='Taches'&&c.colId==='Responsable');
   testDb.tables.push({id:7,tableId:'Equipe',label:'Equipe'});
   testDb.meta.push({id:9000,parentId:7,table:'Equipe',colId:'Nom',label:'Nom',type:'Text',isFormula:false});
   column.type='RefList:Equipe';column.visibleCol=9000;
   testDb.data.tasks.forEach(row=>row.Responsable=['L',row.id===2?102:101]);
   const fetch=grist.docApi.fetchTable;grist.docApi.fetchTable=async table=>table==='Equipe'?[{id:101,Nom:'Alice'},{id:102,Nom:'Bob'}]:fetch(table);
  }
 },refs);
 await page.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:8769')+'/');await page.locator('#list > *').first().waitFor();
 if(phone){await page.locator('#phoneFilters').click();await page.locator('#phoneNav').evaluate(e=>e.open=true);await page.locator('#phoneNav [data-view=projects]').click()}
 const open=async()=>{if(!await page.locator('#advancedFilters').evaluate(e=>e.open))await page.locator('#advancedFilters > summary').click()};
 await open();await page.locator('#advancedKind').selectOption('tasks');await page.locator('#advancedField').selectOption('Responsable');
 assert.equal(await page.locator('#advancedChoices').isVisible(),false);
 const height=await page.locator('#advancedFilters').evaluate(e=>e.getBoundingClientRect().height);
 await page.locator('#advancedValue').fill('ali');
 assert.equal(await page.locator('#advancedChoices label').filter({hasText:'Alice'}).isVisible(),true);
 assert.equal(await page.locator('#advancedChoices label').filter({hasText:'Bob'}).isVisible(),false);
 assert.equal(await page.locator('#advancedFilters').evaluate(e=>e.getBoundingClientRect().height),height);
 const geometry=await page.evaluate(()=>{const a=document.querySelector('#advancedValue').getBoundingClientRect(),b=document.querySelector('#advancedChoices').getBoundingClientRect();return {input:{top:a.top,bottom:a.bottom},popup:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},width:innerWidth,height:innerHeight}});
 assert.ok(geometry.popup.left>=0&&geometry.popup.right<=geometry.width);
 assert.ok(geometry.popup.top>=0&&geometry.popup.bottom<=geometry.height);
 assert.ok(geometry.popup.top>=geometry.input.bottom||geometry.popup.bottom<=geometry.input.top);
 if(process.env.ADVANCED_SCREENSHOT && !refs)await page.screenshot({path:process.env.ADVANCED_SCREENSHOT+(phone?'-phone.png':'-desktop.png')});
 const choose=async value=>{const c=page.locator('#advancedChoices input[value="'+value+'"]');if(phone)await c.tap();else await c.check()};
 await choose('Alice');await page.locator('#advancedValue').fill('bo');await choose('Bob');
 assert.equal(await page.locator('#advancedSelectionCount').innerText(),'(2 choix)');
 await page.locator('#advancedJoin').focus();assert.equal(await page.locator('#advancedChoices').isVisible(),false);
 await page.locator('#advancedValue').click();
 assert.equal(await page.locator('#list [data-kind=tasks]').count(),3);
 await page.locator('#advancedAdd').click();assert.equal(await page.locator('#advancedChoices').isVisible(),false);
 await page.locator('#advancedClear').click();
 const rule=async(kind,field,value,chooseValue)=>{
  await page.locator('#advancedKind').selectOption(kind);await page.locator('#advancedField').selectOption(field);
  await page.locator('#advancedValue').fill(value);if(chooseValue)await choose(chooseValue);await page.locator('#advancedAdd').click();
 };
 await rule('tasks','Responsable','ali','Alice');await rule('tasks','Statut','fait','Fait');
 assert.equal(await page.locator('#list [data-kind=tasks]').count(),1);
 assert.equal(await page.locator('#list [data-kind=tasks]').getAttribute('data-id'),'3');
 await page.locator('#advancedJoin').selectOption('or');
 assert.equal(await page.locator('#list [data-kind=tasks]').count(),3);
 await page.waitForFunction(async()=>{const s=await grist.getOption('workspaceAdvancedFiltersV1');return s?.join==='or'&&s.rules.length===2});
 await page.reload();await page.locator('#list > *').first().waitFor();
 if(phone){await page.locator('#phoneNav').evaluate(e=>e.open=true);await page.locator('#phoneNav [data-view=projects]').click();await page.locator('#phoneFilters').click()}
 await open();assert.equal(await page.locator('#advancedJoin').inputValue(),'or');assert.equal(await page.locator('[data-remove-filter]').count(),2);
 assert.equal(await page.locator('#list [data-kind=tasks]').count(),3);
 await page.locator('#advancedClear').click();
 await page.locator('#advancedJoin').selectOption('and');
 await rule('projects','Titre','Alpha',null);await rule('tasks','Statut','fait','Fait');
 assert.equal(await page.locator('#list [data-kind=tasks]').count(),1);assert.equal(await page.locator('#list [data-kind=tasks]').getAttribute('data-id'),'2');
 await page.locator('#advancedJoin').selectOption('or');assert.equal(await page.locator('#list [data-kind=tasks]').count(),3);
 // Persist the current dropdown selection, not just already-added rules.
 await page.locator('#advancedKind').selectOption('tasks');await page.locator('#advancedField').selectOption('Responsable');
 await page.locator('#advancedValue').fill('ali');await choose('Alice');
 await page.waitForFunction(async()=>{const s=await grist.getOption('workspaceAdvancedFiltersV1');return s?.draft?.values.includes('Alice')&&s.draft.value==='ali'});
 await page.locator('#advancedValue').press('Escape');assert.equal(await page.locator('#advancedChoices').isVisible(),false);
 await page.reload();await page.locator('#list > *').first().waitFor();
 if(phone){await page.locator('#phoneNav').evaluate(e=>e.open=true);await page.locator('#phoneNav [data-view=projects]').click();await page.locator('#phoneFilters').click()}
 await open();assert.equal(await page.locator('#advancedValue').inputValue(),'ali');
 await page.locator('#advancedValue').click();assert.equal(await page.locator('#advancedChoices input[value=Alice]').isChecked(),true);
 await page.locator('#advancedClear').click();
 await page.waitForFunction(async()=>{const s=await grist.getOption('workspaceAdvancedFiltersV1');return s?.rules.length===0&&s.draft.value===''});
 await page.reload();await page.locator('#list > *').first().waitFor();
 if(phone){await page.locator('#phoneNav').evaluate(e=>e.open=true);await page.locator('#phoneNav [data-view=projects]').click();await page.locator('#phoneFilters').click()}
 await open();assert.equal(await page.locator('[data-remove-filter]').count(),0);assert.equal(await page.locator('#list [data-kind=tasks]').count(),3);
 // Stored metadata IDs track a renamed column on the next load.
 await rule('tasks','Statut','fait','Fait');
 await page.waitForFunction(async()=>{const s=await grist.getOption('workspaceAdvancedFiltersV1');return s?.rules.length===1});
 await page.evaluate(()=>localStorage.setItem('rename-status','1'));await page.reload();await page.locator('#list > *').first().waitFor();
 if(phone){await page.locator('#phoneNav').evaluate(e=>e.open=true);await page.locator('#phoneNav [data-view=projects]').click()}
 assert.equal(await page.locator('#list [data-kind=tasks]').count(),2);
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>writes.length),0);await page.close();
}
console.log('PASS anchored searchable multi-choice dropdown, touch selection, AND/OR within/across levels, persisted rules/draft/operator, clearing and column rename in Text/RefList mappings on desktop/phone');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
