const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { make, setup } = require('./mentions-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const width of [1440, 768, 390]) {
      const fixture = make(true);
      fixture.meta.push({ id: 2100, parentId: 4, table: 'Notes', colId: 'PointsReportes', type: 'RefList:Points', isFormula: false });
      fixture.data.notes[1].Instance = 'Comité Échéances';
      fixture.data.notes[1].PointsReportes = ['L', 99];
      const context = await browser.newContext({ viewport: { width, height: 900 }, screen: { width, height: 900 }, hasTouch: width < 1000, isMobile: width === 390 });
      await context.addInitScript(setup, fixture);
      await context.route('https://docs.getgrist.com/**', route => route.fulfill({ body: '' }));
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      async function openEditor() {
        await page.locator('#list > *').first().waitFor();
        if (width === 390) {
          await page.locator('#phoneNav summary').tap();
          await page.locator('#phoneNav [data-view=notes]').tap();
        } else await page.locator('nav [data-view=notes]').click();
        await page.locator('#list [data-kind=notes][data-id="1"]').first().click();
        if (await page.locator('#editionButton').getAttribute('aria-pressed') !== 'true') await page.locator('#editionButton').click();
        await page.locator('#detail [data-edit]').click();
      }
      const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8771/';
      await page.goto(origin);
      await openEditor();
      const notes = page.locator('#editForm [name=Contenu]');
      const menu = page.getByRole('listbox', { name: 'Réunions destinataires' });
      const destination = menu.getByRole('option', { name: /Autre réunion/ });
      await notes.fill('Nouveau sujet à revoir #echeances');
      await destination.waitFor();
      if (width === 390) await destination.tap();
      else await notes.press('Enter');
      await page.getByRole('button', { name: 'Créer et reporter le point (brouillon)' }).click();
      assert.doesNotMatch(await notes.inputValue(), /Nouveau sujet/);
      const existing = page.locator('.mention-block').first();
      const body = existing.locator('[data-block-field=content]');
      await body.fill('Point existant à suivre #N002');
      await destination.click();
      assert.equal(await page.getByRole('button', { name: /Retirer le renvoi vers Autre réunion/ }).count(), 2);
      assert.equal(await page.evaluate(() => writes.length), 0);

      await page.reload();
      await openEditor();
      await page.getByRole('button', { name: 'Reprendre le brouillon', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: /Retirer le renvoi vers Autre réunion/ }).count(), 2);
      if (width === 1440) {
        await page.evaluate(() => { window.deletedDestination = testDb.data.notes.pop(); });
        await page.locator('#save').click();
        await page.locator('#editError').getByText(/disparu ou a été archivé/).waitFor();
        assert.equal(await page.evaluate(() => writes.length), 0);
        await page.evaluate(() => { testDb.data.notes.push(window.deletedDestination); window.loseAck = true; });
      }
      await page.locator('#save').click();
      if (width === 1440) {
        await page.locator('#editError').getByText(/Réponse réseau perdue/).waitFor();
        await page.locator('#save').click();
      }
      await page.locator('#editForm').waitFor({ state: 'hidden' });
      const result = await page.evaluate(() => ({ db: testDb.data, batches }));
      assert.equal(result.batches.length, 1);
      assert.deepEqual(result.db.notes[1].PointsReportes, ['L', 99, 1, 2]);
      assert.equal(result.db.points.length, 2);
      assert.equal(result.db.points[1].NoteOrigine, 1);
      assert.equal(result.db.points[0].Contenu.trim(), 'Point existant à suivre');
      assert.equal(result.db.points[1].Contenu.trim(), 'Nouveau sujet à revoir');
      assert.equal(result.db.actions[0].PointOrigine, 1);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS # searches meetings, stages paragraph and existing point, restores draft, saves both links atomically and retries without duplicates on PC/tablet/phone');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
