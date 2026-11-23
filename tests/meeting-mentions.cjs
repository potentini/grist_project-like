const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('./mentions-fixture.cjs');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8771';
async function boot(browser,width,refs=true){
 const context=await browser.newContext({viewport:{width,height:1000},screen:{width,height:1000},hasTouch:width<1000,isMobile:width<1000,colorScheme:width===768?'dark':'light'});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await page.addInitScript(fixture.setup,fixture.make(refs));await page.goto(origin+'/');
 return {context,page,errors};
}
async function notes(page){
 await page.locator('#list > *').first().waitFor();
 if(await page.locator('#phoneNav').isVisible()){await page.locator('#phoneNav summary').click();await page.locator('#phoneNav [data-view=notes]').click()}
 else await page.locator('nav [data-view=notes]').click();
}
async function edit(page){
 await notes(page);await page.locator('#list [data-kind=notes][data-id="1"]').first().click();
 if(await page.locator('#editionButton').getAttribute('aria-pressed')!=='true')await page.locator('#editionButton').click();
 await page.locator('#detail [data-edit]').click();await page.locator('.meeting-mentions').waitFor();
}
async function newBlock(page,query='hceres',noRef=false){
 const text=page.locator('#editForm [name=Contenu]');
 await text.fill('Accueil.\n\nLe calendrier doit être confirmé avant vendredi. \n\nProchaine séance lundi.');
 await text.evaluate(e=>{const at=e.value.indexOf('\n\nProchaine');e.focus();e.setSelectionRange(at,at)});
 await text.pressSequentially('@'+query);
 const menu=page.locator('.mention-menu');await menu.waitFor();
 if(noRef)await menu.getByRole('option',{name:'Créer un point sans rattachement',exact:false}).click();
 else await menu.getByRole('option',{name:/Tâches — Confirmer les participants/}).click();
 await page.locator('.mention-proposal').waitFor();
 await page.locator('.mention-proposal input').fill('Calendrier à confirmer');
 await page.getByRole('button',{name:'Créer le point (brouillon)',exact:true}).click();
 const block=page.locator('.mention-block').last();await block.waitFor();return block;
}
async function save(page){await page.locator('#save').click();await page.locator('#editForm').waitFor({state:'hidden'})}
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const width of (process.env.MENTIONS_CASES_ONLY?[]:[1440,768,390]))for(const refs of [true,false]){
  const {context,page:p,errors}=await boot(browser,width,refs);await edit(p);await p.waitForTimeout(250);
  const reads=await p.evaluate(()=>reads),general=p.locator('#editForm [name=Contenu]');
  let block=await newBlock(p,'hcERES');
  assert.equal(await p.evaluate(()=>reads),reads,'@ search must not fetch tables');assert.deepEqual(await p.evaluate(()=>writes),[]);
  assert.equal(await p.evaluate(()=>testDb.data.points.length),1);
  assert.match(await general.inputValue(),/Accueil/);assert.match(await general.inputValue(),/Prochaine séance/);assert.doesNotMatch(await general.inputValue(),/calendrier/);
  assert.match(await block.locator('[data-block-field=content]').inputValue(),/calendrier/);
  await block.getByRole('button',{name:'@ Ajouter un rattachement',exact:true}).click();
  await block.locator('[data-block-field=content]').pressSequentially('externe');
  await p.locator('.mention-menu').getByRole('option',{name:/Tâches — Tâche externe/}).click();
  assert.equal(await block.locator('.mention-chips button').count(),2);
  await save(p);
  let db=await p.evaluate(()=>testDb);
  assert.equal(db.data.points.length,2);const point=db.data.points[1];
  assert.equal(point.NoteOrigine,refs?1:'N001');assert.deepEqual(point.Taches,refs?['L',1,2]:'T001, T002');
  assert.equal(point.Titre,'Calendrier à confirmer');assert.doesNotMatch(point.Contenu,/@/);
  assert.doesNotMatch(db.data.notes[0].Contenu,/calendrier/);assert.equal(db.data.points[0].Contenu,'Échanges initiaux');
  assert.equal((await p.evaluate(()=>batches.at(-1))).length,2);
  assert.equal(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('grist_note_draft_v1:')).length),0);
  // A saved point remains the same record, including when @ adds an association.
  await p.locator('#detail [data-edit]').click();block=p.locator('.mention-block').last();
  await block.getByRole('button',{name:'@ Ajouter un rattachement',exact:true}).click();
  await block.locator('[data-block-field=content]').pressSequentially('P002');
  await p.locator('.mention-menu').getByRole('option',{name:/Projets — Projet externe/}).click();await save(p);
  db=await p.evaluate(()=>testDb);assert.equal(db.data.points.length,2);assert.deepEqual(db.data.points[1].Projets,refs?['L',2]:'P002');
  assert.ok(!(await p.evaluate(()=>batches.at(-1))).some(a=>a[0]==='AddRecord'));
  // A local, unlinked point survives reload with its stable block identifier.
  await p.locator('#detail [data-edit]').click();block=await newBlock(p,'aucun',true);
  const uid=await block.getAttribute('data-block-uid');
  await block.locator('[data-block-field=decision]').fill('Décision locale <b>texte seulement</b>');
  await p.reload();await edit(p);assert.equal(await p.locator(`[data-block-uid="${uid}"]`).count(),0);
  await p.getByRole('button',{name:'Reprendre le brouillon',exact:true}).click();
  block=p.locator(`[data-block-uid="${uid}"]`);await block.waitFor();assert.match(await block.locator('[data-block-field=decision]').inputValue(),/Décision locale/);
  await save(p);db=await p.evaluate(()=>testDb);assert.equal(db.data.points.length,3);
  for(const f of ['Projets','Chantiers','Taches'])assert.deepEqual(db.data.points[2][f],refs?['L']:'');
  assert.equal(db.data.points[2].NoteOrigine,refs?1:'N001');
  // New meeting and new point are created in one transaction, with a correct origin.
  if(width===390)await p.locator('#phoneBack').click();await p.locator('#list [data-new=notes]').click();
  await p.locator('#editForm [name=Titre]').fill('Réunion créée avec un point');block=await newBlock(p);
  await save(p);db=await p.evaluate(()=>testDb);assert.equal(db.data.notes.length,3);assert.equal(db.data.points.length,4);
  assert.equal(db.data.points[3].NoteOrigine,refs?db.data.notes[2].id:db.data.notes[2].Code);
  assert.equal((await p.evaluate(()=>batches.at(-1))).filter(a=>a[0]==='AddRecord').length,2);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
 }
 if(!process.env.MENTIONS_CASES_ONLY)console.log('PASS @ path/code/accent search without network, paragraph confirmation/no duplication, multi-project associations, existing point updates, structured draft reload, unlinked points, atomic new meeting/point on PC/tablet/phone and native/Text links');
 for(const scenario of ['denied','lost','lost-new','lost-reload','conflict','deleted-target','deleted-on-retry','collision','storage']){
  const {context,page:p,errors}=await boot(browser,1280);await edit(p);
  if(scenario==='lost-new'){await p.locator('#cancel').click();await p.locator('#list [data-new=notes]').click();await p.locator('#editForm [name=Titre]').fill('Réunion avec réponse perdue')}
  await newBlock(p);
  if(['denied','deleted-on-retry'].includes(scenario))await p.evaluate(()=>rejectWrite=true);
  if(['lost','lost-new','lost-reload'].includes(scenario))await p.evaluate(()=>loseAck=true);
  if(scenario==='conflict')await p.evaluate(()=>testDb.data.notes[0].Contenu='Texte modifié ailleurs');
  if(scenario==='deleted-target')await p.evaluate(()=>testDb.data.tasks=[]);
  if(scenario==='collision')await p.evaluate(()=>window.beforeApply=()=>testDb.data.points.push({id:2,Titre:'Ajout concurrent'}));
  if(scenario==='storage')await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('grist_note_draft_v1:'))throw Error('Quota');return original.call(this,k,v)}});
  await p.locator('#save').click();await p.locator('#editError').filter({hasText:/Enregistrement impossible/}).waitFor();
  const db=await p.evaluate(()=>testDb);
  assert.equal(db.data.points.length,['lost','lost-new','lost-reload','collision'].includes(scenario)?2:1);
  assert.equal(await p.locator('.mention-block').count(),scenario==='lost-new'?1:2);
  if(scenario==='denied'){await p.evaluate(()=>rejectWrite=false);await save(p);assert.equal(await p.evaluate(()=>testDb.data.points.length),2)}
  if(['lost','lost-new'].includes(scenario)){const count=await p.evaluate(()=>writes.length);await save(p);assert.equal(await p.evaluate(()=>testDb.data.points.length),2);assert.equal(await p.evaluate(()=>writes.length),count)}
  if(scenario==='deleted-on-retry'){await p.evaluate(()=>{rejectWrite=false;testDb.data.tasks=[]});await p.locator('#save').click();await p.locator('#editError').filter({hasText:'disparu'}).waitFor();assert.equal(await p.evaluate(()=>testDb.data.points.length),1);assert.deepEqual(await p.evaluate(()=>writes),[])}
  if(scenario==='lost-reload'){await p.reload();await edit(p);await p.getByRole('button',{name:'Reprendre le brouillon',exact:true}).click();await p.locator('#save').click();await p.locator('#editError').filter({hasText:'déjà présent dans Grist'}).waitFor();assert.equal(await p.evaluate(()=>testDb.data.points.length),2);assert.deepEqual(await p.evaluate(()=>writes),[])}
  if(scenario==='collision'){await p.locator('#save').click();await p.locator('#editError').filter({hasText:'ne peut pas être confirmé'}).waitFor();assert.equal(await p.evaluate(()=>testDb.data.points[1].Titre),'Ajout concurrent')}
  if(!['lost','lost-new','lost-reload','denied'].includes(scenario))assert.deepEqual(await p.evaluate(()=>writes),[]);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS permission refusal, lost response retry without duplicate, remote conflict, missing target, atomic id collision, unavailable storage and retained form drafts');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
