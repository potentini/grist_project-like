const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const setup = require('./renamed-fixture.cjs');
const fixture = structuredClone(require('../demo.json'));
fixture.data.streams[0].Statut = 'Clôturé';
fixture.data.tasks[0].Statut = 'Fait';
fixture.data.tasks.push({...fixture.data.tasks[0],id:2,Code:'T002',Titre:'Tâche finie',Statut:'TERMINÉ'});
fixture.data.actions[0].Statut = 'En cours';
fixture.data.actions[1].Statut = 'Done';
// Native references also exercise the project timeline bridge.
for (const [kind, field, table] of [['streams','Projet','Projets'],['tasks','Chantier','Chantiers'],['actions','Projet','Projets'],['actions','Chantier','Chantiers'],['actions','Tache','Taches']]) {
  fixture.meta.find(c=>c.table===fixture.tables[['projects','streams','tasks','notes','actions'].indexOf(kind)].tableId && c.colId===field).type = `Ref:${table}`;
  for(const row of fixture.data[kind]) if(row[field]) row[field]=1;
}
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    for(const [width,height,touch] of [[1440,1000,false],[768,1024,true],[390,844,true]]) {
      const context=await browser.newContext({viewport:{width,height},screen:{width,height},hasTouch:touch,isMobile:touch});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
      await page.addInitScript(setup,fixture);
      await page.goto('http://127.0.0.1:8766/');
      if(width===390) {
        await page.locator('#phoneNav summary').click();
        await page.locator('#phoneNav [data-view=projects]').click();
      }
      await page.locator('#list [data-kind=projects][data-id="1"]').first().click();
      const section=page.locator('details[data-section-key="section:projects:1:dependents"]');
      const check=page.getByLabel('Masquer les éléments dépendants terminés');
      await check.waitFor();
      assert.equal(await check.isChecked(),false);
      const task=section.locator('[data-tree-kind=tasks][data-tree-id="2"]');
      assert.equal(await task.count(),1);
      const leftBefore=await page.locator('#list').innerHTML();
      await check.check();
      assert.equal(await task.count(),0);
      // Completed ancestors remain for the active action beneath them.
      assert.equal(await section.locator('[data-tree-kind=streams]').count(),1);
      assert.equal(await section.locator('[data-tree-kind=tasks][data-tree-id="1"]').count(),1);
      assert.equal(await section.locator('[data-tree-kind=actions][data-tree-id="1"]').count(),1);
      assert.equal(await section.locator('[data-tree-kind=actions][data-tree-id="2"]').count(),0);
      const associated=page.locator('details[data-section-key="section:projects:1:actions"]');
      assert.equal(await associated.locator('[data-kind=actions][data-id="2"]').count(),0);
      assert.equal(await page.locator('#list').innerHTML(),leftBefore);
      assert.deepEqual(await page.evaluate(()=>window.writes),[]);
      if(width!==390) {
        await page.locator('[data-project-timeline]').click();
        const frame=page.frameLocator('#timelineFrame');
        const colors=frame.locator('#colorFieldSelect');
        await colors.locator('option[value=status]').waitFor({state:'attached'});
        assert.equal(await colors.inputValue(),'status');
        await colors.selectOption('responsible');
        assert.equal(await colors.inputValue(),'responsible');
        await page.locator('#timelineClose').click();
      } else assert.equal(await page.locator('[data-project-timeline]').isVisible(),false);
      await check.uncheck();
      assert.equal(await task.count(),1);
      await check.check();
      // Navigation preserves the choice; a reload restores the initial display.
      if(width===390) await page.locator('#phoneBack').click();
      await page.locator('#list [data-kind=projects][data-id="2"]').first().click();
      assert.equal(await check.isChecked(),true);
      await page.reload();
      if(width===390) {
        await page.locator('#phoneNav summary').click();
        await page.locator('#phoneNav [data-view=projects]').click();
      }
      await page.locator('#list [data-kind=projects][data-id="1"]').first().click();
      assert.equal(await check.isChecked(),false);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS completed descendants/actions, active child context, reversible session filter, unchanged list/data, project timeline status default and color choice, desktop/tablet/phone');
    for(const width of [1440,768,390]) {
      const context=await browser.newContext({viewport:{width,height:1000}});
      const page=await context.newPage();
      await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
      await page.addInitScript(require('./timeline-fixture.cjs'));
      await page.goto('http://127.0.0.1:8766/timeline.html');
      const colors=page.locator('#colorFieldSelect');
      await colors.locator('option[value=status]').waitFor({state:'attached'});
      assert.equal(await colors.inputValue(),'status');
      await colors.selectOption('level');
      await page.reload();
      await colors.locator('option[value=status]').waitFor({state:'attached'});
      assert.equal(await colors.inputValue(),'level');
      // A saved state without a color preference also gets the status default.
      await page.evaluate(()=>{
        const opts=JSON.parse(sessionStorage.getItem('sorting-options'));
        delete opts.uiState.colorField;
        sessionStorage.setItem('sorting-options',JSON.stringify(opts));
        localStorage.removeItem('grist_gantt_dual_state_v1');
      });
      await page.reload();
      await colors.locator('option[value=status]').waitFor({state:'attached'});
      assert.equal(await colors.inputValue(),'status');
      await context.close();
    }
    console.log('PASS general timeline status default, saved alternate color and legacy state without preference at 3 widths');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
