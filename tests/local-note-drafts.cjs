const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=structuredClone(require('../demo.json'));
fixture.meta.push({id:799,parentId:4,table:'Notes',colId:'Nom',label:'Nom',type:'Text',isFormula:false});
fixture.tables.push({id:6,tableId:'Points',label:'Points'});
for(const [field,type] of [['Titre','Text'],['Contenu','Text'],['Decision','Text'],['NoteOrigine','Ref:Notes']])
 fixture.meta.push({id:800+fixture.meta.length,parentId:6,table:'Points',colId:field,label:field,type,isFormula:false});
fixture.data.points=[{id:1,Titre:'Point test',Contenu:'Texte initial du point',Decision:'Décision initiale',NoteOrigine:1}];
function setup(fixture){
 const kinds=['projects','streams','tasks','notes','actions','points'],doc=new URLSearchParams(location.search).get('doc')||'doc-a';
 const db=JSON.parse(sessionStorage.getItem('draft-test-db:'+doc)||'null')||structuredClone(fixture);
 const mapping=Object.fromEntries(kinds.map((k,i)=>[k,{table:db.tables[i].tableId,fields:Object.fromEntries(db.meta.filter(c=>c.parentId===i+1).map(c=>[c.colId,c.colId]))}]));
 let opts={projectWorkspaceMappingV1:mapping},callback;
 window.testDb=db;window.writes=[];
 window.grist={ready(){},onOptions(f){callback=f;f(opts)},onRecords(){},selectedTable:{getTableId:async()=>null},getOption:async k=>opts[k],setOption:async(k,v)=>{opts[k]=v;callback(opts)},docApi:{
 getDocName:async()=>doc,
 fetchTable:async table=>structuredClone(table==='_grist_Tables'?db.tables:table==='_grist_Tables_column'?db.meta:db.data[kinds[db.tables.findIndex(t=>t.tableId===table)]]||[]),
 applyUserActions:async actions=>{
  if(window.rejectDraftSave)throw Error('Accès refusé');
  const retValues=[];
  for(const [op,table,id,fields] of actions){
   const rows=db.data[kinds[db.tables.findIndex(t=>t.tableId===table)]];
   if(op==='AddRecord'){const next=Math.max(0,...rows.map(r=>r.id))+1;rows.push({id:next,...fields});retValues.push(next)}
   else {Object.assign(rows.find(r=>r.id===id),fields);retValues.push(null)}
   writes.push([op,table,id,fields]);
  }
  sessionStorage.setItem('draft-test-db:'+doc,JSON.stringify(db));return {retValues};
 }}};
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 for(const width of [1440,768,390]){
  const context=await browser.newContext({viewport:{width,height:1000},screen:{width,height:1000},hasTouch:width<1000,isMobile:width<1000,colorScheme:width===768?'dark':'light'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await page.addInitScript(setup,fixture);
  async function open(kind='notes',id=1){
   await page.locator('#list > *').first().waitFor();
   if(width===390){await page.locator('#phoneNav summary').click();await page.locator('#phoneNav [data-view=notes]').click()}
   else await page.locator('nav [data-view=notes]').click();
   await page.locator('#list [data-kind=notes][data-id="1"]').first().click();
   if(kind==='points') await page.locator('#detail [data-kind=points][data-id="1"]').first().click();
   await page.locator('#editionButton').click();await page.locator('#detail [data-edit]').click();
  }
  const content=page.locator('#editForm [name=Contenu]');
  const recover=page.getByRole('button',{name:'Reprendre le brouillon',exact:true});
  const keys=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('grist_note_draft_v1:')));
  await page.goto('http://127.0.0.1:8766/');await open();
  const initial=await content.inputValue();
  await page.locator('#editForm [name=Nom]').fill('Nom libre en brouillon');
  await content.fill('Long compte rendu\nÉchanges <script>aucun code exécuté</script>');
  assert.equal((await keys()).length,1);assert.deepEqual(await page.evaluate(()=>writes),[]);
  await page.reload();await open();
  assert.equal(await content.inputValue(),initial);assert.equal(await recover.count(),1);
  await recover.click();assert.match(await content.inputValue(),/Long compte rendu/);
  assert.equal(await page.locator('#editForm [name=Nom]').inputValue(),'Nom libre en brouillon');
  await page.locator('#cancel').click();assert.equal((await keys()).length,2);
  await page.locator('#detail [data-edit]').click();assert.equal(await recover.count(),2);
  await recover.first().click();
  await page.evaluate(()=>window.rejectDraftSave=true);
  await page.locator('#save').click();await page.locator('#editError').filter({hasText:'Accès refusé'}).waitFor();
  assert.ok((await keys()).length>=2);assert.match(await content.inputValue(),/Long compte rendu/);
  await page.evaluate(()=>window.rejectDraftSave=false);
  await page.locator('#save').click();await page.locator('#editForm').waitFor({state:'hidden'});
  assert.match(await page.evaluate(()=>testDb.data.notes[0].Contenu),/Long compte rendu/);
  // An unselected, older recovery remains available; never remove other sessions' drafts.
  assert.equal((await keys()).length,1);
  await page.locator('#detail [data-edit]').click();await page.getByRole('button',{name:'Supprimer ce brouillon'}).click();
  assert.equal((await keys()).length,0);
  await content.fill('Version locale à protéger');
  await page.evaluate(()=>testDb.data.notes[0].Contenu='Modification d’un autre utilisateur');
  const before=await page.evaluate(()=>writes.length);
  await page.locator('#save').click();await page.locator('#editError').filter({hasText:'changé dans Grist'}).waitFor();
  assert.equal(await page.evaluate(()=>writes.length),before);assert.equal((await keys()).length,1);
  await page.reload();await open('points');assert.equal(await recover.count(),0);
  await content.fill('Échanges du point');await page.locator('#editForm [name=Decision]').fill('Nouvelle décision');
  await page.reload();await open('points');await recover.click();
  assert.equal(await content.inputValue(),'Échanges du point');assert.equal(await page.locator('#editForm [name=Decision]').inputValue(),'Nouvelle décision');
  await page.locator('#save').click();await page.locator('#editForm').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>testDb.data.points[0].Decision),'Nouvelle décision');
  await page.goto('http://127.0.0.1:8766/?doc=doc-b');await open();assert.equal(await recover.count(),0);
  // New note text survives closing its creation dialog with Escape.
  await page.locator('#cancel').click();
  if(width===390)await page.locator('#phoneBack').click();
  await page.locator('#list [data-new=notes]').click();
  await page.locator('#editForm [name=Titre]').fill('Réunion en préparation');await content.fill('Texte avant création');
  await page.locator('#editor').press('Escape');
  await page.locator('#list [data-new=notes]').click();await recover.click();
  assert.equal(await content.inputValue(),'Texte avant création');
  await page.locator('#save').click();await page.locator('#editor').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>testDb.data.notes.at(-1).Contenu),'Texte avant création');
  await page.addInitScript(()=>testDb.meta.find(c=>c.table==='Notes'&&c.colId==='Contenu').isFormula=true);
  await page.goto('http://127.0.0.1:8766/');await open();
  assert.equal(await recover.count(),1);assert.equal(await recover.isDisabled(),true);
  await page.getByText('Voir les textes du brouillon',{exact:true}).click();
  assert.match(await page.locator('.note-draft-recovery pre').innerText(),/Version locale à protéger/);
  assert.equal(await content.count(),0);assert.deepEqual(await page.evaluate(()=>writes),[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await context.close();
 }
 // Storage failure must remain explicit and must not prevent typing or cancellation.
 const ctx=await browser.newContext(),p=await ctx.newPage();
 await p.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await p.addInitScript(setup,fixture);
 await p.addInitScript(()=>Storage.prototype.setItem=function(){throw Error('QuotaExceededError')});
 await p.goto('http://127.0.0.1:8766/');await p.locator('nav [data-view=notes]').click();await p.locator('#list [data-kind=notes][data-id="1"]').click();await p.locator('#editionButton').click();await p.locator('#detail [data-edit]').click();
 await p.locator('#editForm [name=Contenu]').fill('Texte conservé dans le formulaire');
 await p.locator('#noteDraftPanel').filter({hasText:'stockage refusé ou plein'}).waitFor();
 assert.deepEqual(await p.evaluate(()=>writes),[]);await p.locator('#cancel').click();await ctx.close();
 console.log('PASS local-only meeting/point drafts, reload and Escape recovery, explicit restore/discard, creation, document/record isolation, successful-save cleanup, preserved failures and concurrent texts, blocked storage, PC/tablet/phone');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
