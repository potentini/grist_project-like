const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fixture = require('./mentions-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const width of [1440, 768, 390]) {
      const model = fixture.make(true);
      for (const field of ['Projet', 'Tache', ...(width === 1440 ? ['Chantier'] : [])]) {
        const column = model.meta.find(c => c.table === 'Actions' && c.colId === field);
        column.type = column.type.replace('Ref:', 'RefList:');
        for (const action of model.data.actions) action[field] = ['L', ...(action[field] ? [action[field]] : [])];
      }
      if (width === 1440) {
        model.meta.push(
          {id:2300, parentId:3,table:'Taches',colId:'Transforme',label:'Transforme',type:'Bool',isFormula:false},
          {id:2301,parentId:2,table:'Chantiers',colId:'TacheOrigine',label:'TacheOrigine',type:'Ref:Taches',isFormula:false},
        );
      }
      const ctx = await browser.newContext({ viewport: {width, height:900}, screen:{width,height:900}, hasTouch:width < 1000, isMobile:width === 390 });
      await ctx.addInitScript(fixture.setup, model);
      await ctx.route('https://docs.getgrist.com/**', route => route.fulfill({body:''}));
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(10000);
      await page.goto(process.env.TEST_ORIGIN || 'http://127.0.0.1:8766/');
      await page.locator('#list > *').first().waitFor();
      async function view(name) {
        if (width === 390) {
          if (await page.locator('#phoneBack').isVisible()) await page.locator('#phoneBack').click();
          await page.locator('#phoneNav summary').tap();
          await page.locator('#phoneNav [data-view="'+name+'"]').tap();
        } else await page.locator('nav [data-view="'+name+'"]').click();
      }
      if (width !== 390) await view('actions');
      await page.locator('#search').fill('Envoyer les invitations');
      await page.locator('#list [data-kind=actions][data-id="1"]').first().click();
      await page.locator('#editionButton').click();
      await page.locator('#detail [data-edit]').click();
      const form = page.locator('#editForm');
      const comment = form.locator('[name=Commentaire]');
      assert.equal(await form.locator('[name=Projet]').getAttribute('multiple'), '');
      assert.equal(await form.locator('[name=Chantier]').getAttribute('multiple'), width === 1440 ? '' : null);
      await comment.fill('Contacter @P002');
      const menu = page.getByRole('listbox', {name:'Rattachements proposés'});
      const option = menu.getByRole('option', {name:/Projets — Projet externe/});
      if (width === 390) await option.tap(); else await option.click();
      await comment.pressSequentially('pour suivre @externe');
      await menu.getByRole('option', {name:/Tâches — Tâche externe/}).click();
      assert.equal(await page.evaluate(() => writes.length), 0);
      await form.locator('#save').click();
      await form.waitFor({state:'hidden'});
      const action = () => page.evaluate(() => testDb.data.actions.find(row => row.id === 1));
      assert.deepEqual((await action()).Projet, ['L',1,2]);
      assert.deepEqual((await action()).Tache, ['L',1,2]);
      assert.equal((await action()).PointOrigine, 1);
      assert.deepEqual((await action()).Chantier, width === 1440 ? ['L'] : 0, 'no inferred parent on a transverse action');
      await view('projects');
      const left = page.locator('#list');
      await left.locator('[data-fold-all=open]').click();
      const first = left.locator('[data-tree-kind=projects][data-tree-id="1"] [data-kind=actions][data-id="1"]');
      const second = left.locator('[data-tree-kind=projects][data-tree-id="2"] [data-kind=actions][data-id="1"]');
      await first.waitFor();
      await second.waitFor();
      assert.equal(await first.count(), 1);
      assert.equal(await second.count(), 1);
      await second.locator('..').locator('[data-move-kind="actions"]').click();
      await form.waitFor();
      assert.equal(await page.locator('#moveDialog').isVisible(), false);
      await form.locator('[name=Statut]').fill('Fait');
      await form.locator('#save').click();
      await form.waitFor({state:'hidden'});
      assert.equal((await action()).Statut, 'Fait');
      assert.equal(await page.evaluate(() => testDb.data.actions.length), 3);
      await page.locator('#detail [data-edit]').click();
      // Removing the links to the external branch keeps the shared action and the first branch.
      await form.locator('[name=Projet]').selectOption(['1'], {force:true});
      await form.locator('[name=Tache]').selectOption(['1'], {force:true});
      await form.locator('#save').click();
      await form.waitFor({state:'hidden'});
      assert.deepEqual((await action()).Projet, ['L',1]);
      assert.deepEqual((await action()).Tache, ['L',1]);
      assert.equal((await action()).Statut, 'Fait');
      if (width === 1440) {
        await page.locator('#search').fill('');
        await left.locator('[data-fold-all=open]').click();
        await left.locator('[data-move-kind=streams][data-move-id="1"]').click();
        await page.locator('#moveTarget').selectOption('projects:2');
        await page.locator('#moveSubmit').click();
        await page.locator('#moveDialog').waitFor({state:'hidden'});
        assert.deepEqual((await action()).Projet, ['L',1], 'moving an ancestor must preserve the action’s explicit project');
        assert.deepEqual((await action()).Tache, ['L',1]);
        await page.evaluate(() => {
          testDb.data.actions[0].Tache = ['L', 1, 2];
          testDb.data.actions[0].Chantier = ['L', 2];
        });
        await left.locator('[data-kind=tasks][data-id="1"]').click();
        await page.locator('#detail [data-convert]').click();
        await page.locator('#conversionSubmit').click();
        await page.locator('#conversionError').getByText(/Les données ont changé/).waitFor();
        await page.locator('#conversionSubmit').click();
        await page.locator('#conversionDialog').waitFor({state:'hidden'});
        assert.deepEqual((await action()).Tache, ['L',2]);
        assert.deepEqual((await action()).Chantier, ['L',2,3]);
        assert.deepEqual((await action()).Projet, ['L',1]);
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log('PASS shared action in two branches without duplicates, inline @ uses original reference lists, same status everywhere, scoped link removal on PC/tablet/phone');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
