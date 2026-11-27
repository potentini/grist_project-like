const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const setup = require('./renamed-fixture.cjs');
const base = require('../demo.json');

function fixture(refs, formula) {
  const db = structuredClone(base);
  db.data.tasks.push({...db.data.tasks[0],id:2,Code:'T002',Titre:'Feuille à supprimer'});
  // A reverse link from the immediate parent must not block contextual deletion.
  db.meta.push({id:700,parentId:2,table:'Chantiers',colId:'Enfants',label:'Enfants',type:'RefList:Taches',isFormula:formula});
  db.data.streams[0].Enfants = ['L',1,2];
  db.meta.push({id:701,parentId:5,table:'Actions',colId:'PointOrigine',label:'PointOrigine',type:'Text',isFormula:false});
  db.data.actions[0].PointOrigine = 'D001';
  if (refs) {
    for(const [kind,field,target] of [['streams','Projet','Projets'],['tasks','Chantier','Chantiers'],['actions','Projet','Projets'],['actions','Chantier','Chantiers'],['actions','Tache','Taches'],['actions','NoteOrigine','Notes']]) {
      const table = db.tables[['projects','streams','tasks','notes','actions'].indexOf(kind)].tableId;
      db.meta.find(c=>c.table===table && c.colId===field).type=`Ref:${target}`;
      for(const row of db.data[kind]) row[field]=row[field]?1:0;
    }
  }
  return db;
}

(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    for(const [width,height,touch] of [[1440,1000,false],[768,1024,true],[390,844,true]])
      for(const refs of [false,true]) for(const formula of [false,true]) {
        const context=await browser.newContext({viewport:{width,height},screen:{width,height},hasTouch:touch,isMobile:touch});
        const page=await context.newPage(),errors=[];
        page.setDefaultTimeout(12000);
        page.on('pageerror',e=>errors.push(e.message));
        await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
        await page.addInitScript(setup,fixture(refs,formula));
        await page.addInitScript(()=>{
          const api=grist.docApi,original=api.applyUserActions,fetch=api.fetchTable;
          api.fetchTable=async table=>structuredClone(await fetch(table));
          window.rejectWrite=false;
          api.applyUserActions=async actions=>{
            if(window.rejectWrite) throw Error('Accès refusé');
            for(const [op,table,id,fields] of actions) {
              if(op==='UpdateRecord') for(const col of Object.keys(fields))
                if(testDb.meta.find(c=>c.table===table&&c.colId===col)?.isFormula) throw Error('Écriture de formule interdite');
            }
            for(const action of actions) {
              const [op,table,id]=action;
              if(op==='RemoveRecord') {
                const i=testDb.tables.findIndex(t=>t.tableId===table),kind=['projects','streams','tasks','notes','actions'][i];
                testDb.data[kind]=testDb.data[kind].filter(r=>r.id!==id);
                // Simulate native reverse formula recalculation after deletion.
                for(const c of testDb.meta.filter(c=>c.isFormula&&c.type===`RefList:${table}`)) {
                  const index=testDb.tables.findIndex(t=>t.tableId===c.table);
                  for(const row of testDb.data[['projects','streams','tasks','notes','actions'][index]])
                    row[c.colId]=['L',...row[c.colId].filter(v=>v!=='L'&&v!==id)];
                }
                writes.push(action);
              } else await original([action]);
            }
            return {retValues:[]};
          };
        });
        await page.goto('http://127.0.0.1:8766/');
        await page.locator('#list > *').first().waitFor();
        if(width===390) {
          await page.locator('#phoneNav summary').click();
          await page.locator('#phoneNav [data-view=projects]').click();
        }
        await page.locator('#list [data-fold-all=open]').click();
        await page.locator('#list [data-kind=streams][data-id="1"]').first().click();
        assert.equal(await page.locator('.dependent-delete').count(),0);
        await page.locator('#editionButton').click();
        const remove=page.locator('#detail [data-removal-kind=tasks][data-removal-id="2"]');
        await remove.waitFor();
        const style=await remove.evaluate(e=>{const s=getComputedStyle(e);return [s.color,s.backgroundColor]});
        assert.deepEqual(style,['rgb(180, 35, 24)','rgb(255, 255, 255)']);
        assert.equal(await remove.locator('xpath=preceding-sibling::button[1]').getAttribute('class'),'move-button');

        // The generic delete keeps its original strict rule.
        await page.locator('#detail [data-kind=tasks][data-id="2"]').first().click();
        await page.locator('#detail .detail-item-actions [data-removal=delete]').click();
        await page.getByText(/Suppression bloquée/).waitFor();
        assert.equal(await page.locator('#removalSubmit').isDisabled(),true);
        await page.locator('#removalCancel').click();
        await page.locator('#detail [data-history=back]').click();

        await remove.click();
        await page.locator('#removalSubmit:enabled').waitFor();
        assert.match(await page.locator('#removalPreview').innerText(),/supprimée définitivement/);
        await page.locator('#removalCancel').click();
        assert.deepEqual(await page.evaluate(()=>writes),[]);
        // Native references in an unmapped column of another parent still block.
        await page.evaluate(()=>{
          testDb.meta.push({id:702,parentId:1,table:'Projets',colId:'AutreLien',label:'AutreLien',type:'Ref:Taches',isFormula:false});
          testDb.data.projects[1].AutreLien=2;
        });
        await remove.click();
        await page.getByText(/Suppression bloquée/).waitFor();
        assert.equal(await page.locator('#removalSubmit').isDisabled(),true);
        assert.match(await page.locator('#removalPreview').innerText(),/Autre projet/);
        await page.locator('#removalCancel').click();
        await page.evaluate(()=>testDb.data.projects[1].AutreLien=0);
        // A new reference arriving after the preview must still block deletion.
        await remove.click();
        await page.locator('#removalSubmit:enabled').waitFor();
        await page.evaluate(()=>testDb.data.actions[2].Tache=testDb.meta.find(c=>c.table==='Actions'&&c.colId==='Tache').type.startsWith('Ref:')?2:'T002');
        await page.locator('#removalConfirm').check();
        await page.locator('#removalSubmit').click();
        await page.locator('#removalError').filter({hasText:/Des liens référencent/}).waitFor();
        assert.deepEqual(await page.evaluate(()=>writes),[]);
        await page.locator('#removalCancel').click();
        await remove.click();
        await page.getByText(/Suppression bloquée/).waitFor();
        assert.equal(await page.locator('#removalSubmit').isDisabled(),true);
        await page.locator('#removalCancel').click();
        await page.evaluate(()=>testDb.data.actions[2].Tache='');
        await remove.click();
        await page.locator('#removalSubmit:enabled').waitFor();
        await page.locator('#removalConfirm').check();
        await page.evaluate(()=>window.rejectWrite=true);
        await page.locator('#removalSubmit').click();
        await page.getByText('Opération impossible : Accès refusé',{exact:true}).waitFor();
        assert.deepEqual(await page.evaluate(()=>writes),[]);
        assert.deepEqual(await page.evaluate(()=>testDb.data.streams[0].Enfants),['L',1,2]);
        await page.evaluate(()=>window.rejectWrite=false);
        await page.locator('#removalSubmit').click();
        await page.locator('#removalDialog').waitFor({state:'hidden'});
        assert.equal(await page.evaluate(()=>testDb.data.tasks.some(r=>r.id===2)),false);
        assert.deepEqual(await page.evaluate(()=>testDb.data.streams[0].Enfants),['L',1]);
        assert.equal(await page.locator('#detail h2').innerText(),'Préparer le lancement');
        assert.equal(await page.evaluate(()=>writes.filter(a=>a[0]==='RemoveRecord').length),1);
        if(formula) assert.equal(await page.evaluate(()=>writes.some(a=>a[0]==='UpdateRecord')),false);

        // Existing descendants block deletion from their own parent.
        await page.locator('#detail [data-removal-kind=tasks][data-removal-id="1"]').click();
        await page.getByText(/Suppression bloquée/).waitFor();
        assert.equal(await page.locator('#removalSubmit').isDisabled(),true);
        await page.locator('#removalCancel').click();

        // Detach a task, keeping its own descendants and clearing redundant action ancestors.
        await page.locator('#detail [data-move-kind=tasks][data-move-id="1"]').click();
        assert.equal(await page.locator('#moveTarget option').last().innerText(),'Aucun rattachement');
        await page.locator('#moveTarget').selectOption('detached:0');
        const before=await page.evaluate(()=>structuredClone(testDb.data));
        await page.locator('#moveSubmit').click();
        assert.deepEqual(await page.evaluate(()=>testDb.data),before);
        await page.locator('#moveDetachConfirm').check();
        await page.locator('#moveSubmit').click();
        await page.locator('#moveDialog').waitFor({state:'hidden'});
        const empty=refs?0:'';
        assert.equal(await page.evaluate(()=>testDb.data.tasks[0].Chantier),empty);
        assert.equal(await page.evaluate(()=>testDb.data.actions[0].Tache),refs?1:'T001');
        assert.equal(await page.evaluate(()=>testDb.data.actions[0].Chantier),empty);
        assert.equal(await page.evaluate(()=>testDb.data.actions[0].Projet),empty);

        if(width===390) await page.locator('#phoneBack').click();
        await page.locator('#list [data-kind=tasks][data-id="1"]').first().click();
        const actionSection=page.locator('details[data-section-key="section:tasks:1:actions"]');
        if(!await actionSection.evaluate(e=>e.open)) await actionSection.locator(':scope > summary').click();
        const actionMove=actionSection.locator('[data-move-kind=actions][data-move-id="1"]');
        await actionMove.waitFor();
        await actionMove.click();
        assert.equal(await page.locator('#moveTarget option').last().innerText(),'Aucun rattachement');
        await page.locator('#moveTarget').selectOption('detached:0');
        await page.locator('#moveDetachConfirm').check();
        await page.locator('#moveSubmit').click();
        await page.locator('#moveDialog').waitFor({state:'hidden'});
        for(const f of ['Projet','Chantier','Tache','NoteOrigine'])
          assert.equal(await page.evaluate(f=>testDb.data.actions[0][f],f),empty);
        assert.equal(await page.evaluate(()=>testDb.data.actions[0].PointOrigine),'');
        if(width===390) await page.locator('#phoneBack').click();
        await page.locator('#list [data-move-kind=streams][data-move-id="1"]').click();
        await page.locator('#moveTarget').selectOption('detached:0');
        await page.locator('#moveDetachConfirm').check();
        await page.locator('#moveSubmit').click();
        await page.locator('#moveDialog').waitFor({state:'hidden'});
        assert.equal(await page.evaluate(()=>testDb.data.streams[0].Projet),empty);
        assert.equal(await page.evaluate(()=>testDb.data.actions[1].Chantier),refs?1:'C001');
        assert.equal(await page.evaluate(()=>testDb.data.actions[1].Projet),empty);
        assert.equal(await page.evaluate(()=>testDb.data.actions[1].NoteOrigine),refs?1:'N001');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.deepEqual(errors,[]);
        await context.close();
      }
    console.log('PASS contextual leaf deletion with parent-only reverse links, formula preservation, external/descendant/race blockers, cancellation/denial, task/action detach confirmation and ancestor propagation in CSV/native references on desktop/tablet/phone');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
