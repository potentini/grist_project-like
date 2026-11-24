const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fixture = require('./mentions-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox'] });
  try {
    for (const width of [1440, 768, 390]) {
      const model = fixture.make(true);
      for (const [index, [colId, target]] of [['ProjetsAssocies','Projets'], ['ChantiersAssocies','Chantiers'], ['TachesAssociees','Taches']].entries())
        model.meta.push({id:2200+index, parentId:5, table:'Actions', colId, label:colId, type:'RefList:'+target, isFormula:false});
      model.data.actions[0].ProjetsAssocies = ['L', 1];
      const context = await browser.newContext({ viewport:{width,height:900}, screen:{width,height:900}, hasTouch:width<1000, isMobile:width===390 });
      await context.addInitScript(fixture.setup, model);
      await context.route('https://docs.getgrist.com/**', route => route.fulfill({body:''}));
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      async function view(name) {
        if (width === 390) {
          if (await page.locator('#phoneBack').isVisible()) await page.locator('#phoneBack').click();
          await page.locator('#phoneNav summary').tap();
          await page.locator('#phoneNav [data-view="'+name+'"]').tap();
        } else await page.locator('nav [data-view="'+name+'"]').click();
      }
      async function editAction() {
        await page.locator('#list > *').first().waitFor();
        if (width !== 390) await view('actions');
        await page.locator('#search').fill('Envoyer les invitations');
        await page.locator('#list [data-kind=actions][data-id="1"]').first().click();
        if (await page.locator('#editionButton').getAttribute('aria-pressed') !== 'true') await page.locator('#editionButton').click();
        await page.locator('#detail [data-edit]').click();
      }
      await page.goto(process.env.TEST_ORIGIN || 'http://127.0.0.1:8781/');
      await editAction();
      const comment = page.locator('#editForm [name=Commentaire]');
      const menu = page.getByRole('listbox', {name:'Rattachements proposés'});
      async function choose(name) {
        const option = menu.getByRole('option', {name});
        if (width === 390) await option.tap();
        else await option.click();
        assert.equal(await comment.evaluate(el => el === document.activeElement), true);
      }
      await comment.fill('Relire avec @P002');
      await choose(/Projets — Projet externe/);
      await comment.pressSequentially('puis vérifier @externe');
      await choose(/Tâches — Tâche externe/);
      await comment.pressSequentially('avant vendredi.');
      assert.match(await comment.inputValue(), /@\[Projet externe\].*@\[.*Tâche externe\]/);
      assert.equal(await page.evaluate(() => writes.length), 0);
      if (width === 1440) {
        await page.reload();
        await editAction();
        await page.getByRole('button', {name:'Reprendre le brouillon',exact:true}).click();
        assert.match(await comment.inputValue(), /@\[Projet externe\]/);
        await page.evaluate(() => { window.loseAck = true; });
      }
      await page.locator('#save').click();
      if (width === 1440) {
        await page.locator('#editError').getByText(/Réponse réseau perdue/).waitFor();
        await page.locator('#save').click();
      }
      await page.locator('#editForm').waitFor({state:'hidden'});
      const result = await page.evaluate(() => ({row:testDb.data.actions[0], count:testDb.data.actions.length, writes}));
      assert.equal(result.count, 3);
      assert.equal(result.writes.length, 1);
      assert.deepEqual(result.row.ProjetsAssocies, ['L',1,2]);
      assert.deepEqual(result.row.TachesAssociees, ['L',2]);
      assert.equal(result.row.Tache, 1);
      assert.equal(result.row.Projet, 1);
      assert.equal(result.row.PointOrigine, 1);
      assert.equal(result.row.Commentaire, 'Relire avec puis vérifier avant vendredi.');
      if (width === 390 && await page.locator('#phoneBack').isVisible()) await page.locator('#phoneBack').click();
      await page.locator('#search').fill('');
      await view('projects');
      await page.locator('#list [data-kind=projects][data-id="2"]').first().click();
      await page.locator('#detail [data-section-key$=":actions"] [data-kind=actions][data-id="1"]').waitFor();
      if (width === 1440) {
        await view('actions');
        await page.locator('#list [data-new="actions"]').first().click();
        await page.locator('#editor [name=Titre]').fill('Action transverse');
        await comment.fill('Coordonner avec @externe');
        await choose(/Chantiers — Chantier externe/);
        await page.locator('#save').click();
        await page.locator('#editForm').waitFor({state:'hidden'});
        assert.deepEqual(await page.evaluate(() => testDb.data.actions.at(-1).ChantiersAssocies), ['L',2]);
        assert.equal(await page.evaluate(() => testDb.data.actions.at(-1).Projet), 0);
        await page.locator('#list [data-kind=actions][data-id="4"]').waitFor();
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS inline action mentions, local recovery, idempotent retry, secondary discovery, unchanged primary links, new action on PC/tablet/phone');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
