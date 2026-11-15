const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('../demo.json');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
const page=await browser.newPage({viewport:{width:1400,height:1000}});
await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
await page.addInitScript(fixture=>{
 const name=localStorage.getItem('notes-name')||'Notes';
 const db=structuredClone(fixture), kinds=['projects','streams','tasks','notes','actions'];
 window.writes=[];window.failures=[];
 const mapping=Object.fromEntries(kinds.map((k,i)=>[k,{table:fixture.tables[i].tableId,fields:Object.fromEntries(fixture.meta.filter(c=>c.parentId===i+1).map(c=>[c.colId,c.colId]))}]));
 if(localStorage.getItem('stale-column')==='1'){mapping.notes.table=name;mapping.notes.fields.Contenu='Notes';}
 window.addNativeNote=()=>db.data.notes.push({id:99,Code:'N099',Titre:'Réunion créée dans Grist'});
 window.renameNoteColumn=()=>{const c=db.meta.find(c=>c.parentId===4&&c.colId==='Contenu');c.colId='CompteRendu';for(const row of db.data.notes){row.CompteRendu=row.Contenu;delete row.Contenu}};
 window.breakRef=()=>{const c=db.meta.find(c=>c.table==='Actions'&&c.colId==='NoteOrigine');c.type='Ref:Notes'};
 let opts=JSON.parse(localStorage.getItem('opts')||'null')||{projectWorkspaceMappingV1:mapping};let cb;
 const rename=newName=>{
  const t=db.tables.find(t=>t.id===4),old=t.tableId;t.tableId=newName;t.label=newName;
  for(const c of db.meta){if(c.table===old)c.table=newName;if(c.type?.endsWith(':'+old))c.type=c.type.replace(':'+old,':'+newName)}
  localStorage.setItem('notes-name',newName);
 };
 rename(name);window.renameNotes=rename;
 const find=table=>{const t=db.tables.find(t=>t.tableId===table);if(!t)throw Error("[Sandbox] KeyError '"+table+"'");return db.data[kinds[t.id-1]]};
 window.grist={ready(){},onOptions(f){cb=f;f(opts)},onRecords(){},selectedTable:{getTableId:async()=>null},getOption:async key=>opts[key],setOption:async(key,value)=>{opts={...opts,[key]:value};localStorage.setItem('opts',JSON.stringify(opts));cb(opts)},docApi:{fetchTable:async table=>table==='_grist_Tables'?db.tables:table==='_grist_Tables_column'?db.meta:find(table),applyUserActions:async actions=>{for(const [op,table,id,fields] of actions){const rows=find(table);for(const key of Object.keys(fields)){if(!db.meta.some(c=>c.table===table&&c.colId===key))throw Error("[Sandbox] KeyError '"+key+"'")}if(op==='AddRecord')rows.push({id:Math.max(0,...rows.map(r=>r.id))+1,...fields});else if(op==='UpdateRecord')Object.assign(rows.find(r=>r.id===id),fields);window.writes.push([op,table,id,fields])}return []}}};
},fixture);
await page.goto('http://127.0.0.1:8769/');await page.locator('#list > *').first().waitFor();
await page.waitForFunction(()=>JSON.parse(localStorage.opts).projectWorkspaceMappingV1.notes.tableRef===4);
await page.locator('[data-view=notes]').first().click();await page.locator('#editionButton').click();
await page.locator('[data-new=notes]').click();await page.locator('[name=Titre]').fill('Renommage pendant la saisie');
await page.evaluate(()=>renameNotes('Sujets'));await page.locator('#save').click();
await page.waitForFunction(()=>window.writes.length===1);assert.equal((await page.evaluate(()=>window.writes[0]))[1],'Sujets');
await page.reload();await page.locator('#list > *').first().waitFor();
await page.locator('[data-view=notes]').first().click();await page.locator('#editionButton').click();
await page.locator('[data-new=notes]').click();await page.locator('[name=Titre]').fill('Création après rechargement');await page.locator('#save').click();
await page.waitForFunction(()=>window.writes.length===1);assert.equal((await page.evaluate(()=>window.writes[0]))[1],'Sujets');
await page.evaluate(()=>renameNotes('Notes'));await page.locator('#refresh').click();await page.locator('#mappingButton').click();
assert.equal(await page.locator('[data-map=notes][data-field=table]').inputValue(),'Notes');
assert.equal(await page.locator('[data-map=notes][data-field=Titre]').inputValue(),'Titre');
// Legacy stale mappings cannot be guessed: retain their choices and allow explicit repair.
await page.evaluate(()=>{localStorage.removeItem('opts');localStorage.setItem('notes-name','Sujets')});
await page.reload();
await page.locator('#message').getByText(/introuvable/).waitFor();
await page.locator('#mappingButton').click();
assert.equal(await page.locator('[data-map=notes][data-field=table]').inputValue(),'Notes');
await page.locator('[data-map=notes][data-field=table]').selectOption('Sujets');
await page.locator('#applyMapping').click();await page.waitForFunction(()=>document.querySelector('#mapping').hidden);
assert.equal((await page.evaluate(()=>JSON.parse(localStorage.opts))).projectWorkspaceMappingV1.notes.table,'Sujets');
await page.locator('[data-view=notes]').first().click();await page.locator('#editionButton').click();
await page.locator('[data-new=notes]').click();await page.locator('[name=Titre]').fill('Mapping réparé');await page.locator('#save').click();
await page.waitForFunction(()=>window.writes.length===1);assert.equal((await page.evaluate(()=>window.writes[0]))[1],'Sujets');
// Correct table, obsolete column named Notes: native insertion still works.
await page.evaluate(()=>{localStorage.removeItem('opts');localStorage.setItem('notes-name','Sujets');localStorage.setItem('stale-column','1')});
await page.reload();await page.locator('#list > *').first().waitFor();
await page.locator('[data-view=notes]').first().click();await page.locator('#editionButton').click();
await page.evaluate(()=>addNativeNote());await page.locator('#refresh').click();
await page.locator('#list').getByText('Réunion créée dans Grist',{exact:true}).waitFor();
await page.locator('[data-new=notes]').click();await page.locator('[name=Titre]').fill('Brouillon conservé');await page.locator('#save').click();
await page.locator('#editError').getByText(/colonne « Notes ».*absente de « Sujets »/).waitFor();
assert.equal(await page.locator('[name=Titre]').inputValue(),'Brouillon conservé');assert.equal(await page.evaluate(()=>writes.length),0);
await page.locator('#cancel').click();await page.locator('#mappingButton').click();
assert.equal(await page.locator('[data-map=notes][data-field=Contenu]').inputValue(),'Notes');
await page.locator('[data-map=notes][data-field=Contenu]').selectOption('Contenu');await page.locator('#applyMapping').click();await page.waitForFunction(()=>document.querySelector('#mapping').hidden);
await page.locator('[data-new=notes]').click();await page.locator('[name=Titre]').fill('Colonne réparée');await page.locator('[name=Contenu]').fill('Contenu préservé');
await page.evaluate(()=>renameNoteColumn());await page.locator('#save').click();await page.waitForFunction(()=>writes.length===1);
assert.equal((await page.evaluate(()=>writes[0]))[3].CompteRendu,'Contenu préservé');
// A stale reference must warn without preventing native meetings from loading.
await page.evaluate(()=>{breakRef();addNativeNote()});await page.locator('#refresh').click();
await page.locator('#message').getByText(/Actions.NoteOrigine → Notes/).waitFor();
assert.ok(await page.locator('#list').getByText('Réunion créée dans Grist',{exact:true}).count()>0);
console.log('PASS strict table/column lookup, live renames, persisted identity, stale Notes column rejected before write, native meeting reload and nonblocking stale reference warning');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
