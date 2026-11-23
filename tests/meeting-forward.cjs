const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {make, setup} = require('./mentions-fixture.cjs');

(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium', args:['--no-sandbox']});
  try {
    for (const width of [1440, 768, 390]) {
      const fixture = make(true);
      fixture.meta.push({id:2100,parentId:4,table:'Notes',colId:'PointsReportes',label:'Points reportés',type:'RefList:Points',isFormula:false});
      fixture.data.notes[0].Instance = 'Comité';
      fixture.data.notes[1].Instance = 'Comité';
      const context = await browser.newContext({viewport:{width,height:900},screen:{width,height:900},hasTouch:width<1000,isMobile:width===390});
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://docs.getgrist.com/**', route => route.fulfill({body:''}));
      await page.addInitScript(setup, fixture);
      await page.goto(process.env.TEST_ORIGIN || 'http://127.0.0.1:8771/');
      await page.locator('#list > *').first().waitFor();
      if (width===390) {
        await page.locator('#phoneNav summary').tap();
        await page.locator('#phoneNav [data-view=notes]').tap();
      } else await page.locator('nav [data-view=notes]').click();
      await page.locator('#list [data-kind=notes][data-id="1"]').first().click();
      await page.locator('#editionButton').click();
      await page.locator('#detail [data-forward-point="1"]').click();
      const dialog = page.locator('#pointForwardDialog');
      const picker = dialog.getByRole('combobox',{name:'Réunion destinataire'});
      await picker.fill('autre');
      await dialog.getByRole('option',{name:/Autre réunion/}).click();
      await dialog.getByRole('button',{name:'Renvoyer',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      await page.waitForFunction(() => testDb.data.notes[1].PointsReportes?.includes(1));
      await page.locator('#detail [data-forward-point="1"]').click();
      assert.equal(await dialog.locator('#pointForwardTarget option[value="2"]').count(),0);
      await dialog.getByRole('button',{name:/Créer une réunion destinataire/}).click();
      const editor = page.locator('#editor');
      await editor.waitFor();
      if (width===1440) assert.ok((await editor.boundingBox()).width >= width * .88 && (await editor.boundingBox()).width < width);
      if (width===768) assert.ok((await editor.boundingBox()).width <= 750);
      assert.equal(await editor.locator('[name=Instance]').inputValue(),'Comité');
      assert.equal(await editor.locator('[name=PointsReportes]').inputValue(),'1');
      await editor.locator('[name=Titre]').fill('Séance future');
      if (width === 1440) await page.evaluate(() => { window.loseAck = true; });
      await editor.locator('#save').click();
      if (width === 1440) {
        await editor.getByText(/Réponse réseau perdue/).waitFor();
        await editor.locator('#save').click();
      }
      await editor.waitFor({state:'hidden'});
      await page.waitForFunction(() => testDb.data.notes.length === 3);
      assert.equal(await page.evaluate(() => writes.filter(action => action[0] === 'AddRecord').length), 1);
      assert.deepEqual(await page.evaluate(() => testDb.data.notes[2].PointsReportes), ['L',1]);
      assert.equal(await page.evaluate(() => testDb.data.points.length),1);
      assert.equal(await page.evaluate(() => testDb.data.points[0].NoteOrigine),1);
      assert.equal(await page.evaluate(() => testDb.data.actions[0].PointOrigine),1);
      if (width===390 && await page.locator('#phoneBack').isVisible()) await page.locator('#phoneBack').click();
      await page.locator('#list [data-kind=notes][data-id="2"]').first().click();
      await page.locator('#detail').getByText(/Point reporté depuis/).waitFor();
      if (width === 1440) {
        await page.locator('[data-meeting-followup]').click();
        await page.locator('#meetingFollowup [data-followup-meeting="2"]').getByText('Point reporté', {exact:true}).waitFor();
        await page.locator('#meetingFollowupClose').click();
      }
      await page.locator('#detail [data-kind=points][data-id="1"]').first().click();
      await page.locator('#detail').getByRole('button',{name:'Séance future',exact:true}).waitFor();
      if (width === 1440) {
        await page.locator('#list [data-kind=notes][data-id="2"]').first().click();
        await page.locator('#detail [data-edit]').click();
        await page.locator('#editForm [name=PointsReportes]').selectOption([], {force:true});
        await page.locator('#save').click();
        await page.locator('#editForm').waitFor({state:'hidden'});
        assert.deepEqual(await page.evaluate(() => testDb.data.notes[1].PointsReportes), ['L']);
        assert.equal(await page.evaluate(() => testDb.data.points[0].NoteOrigine), 1);
      }
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS meeting forwarding to existing/new meeting, original point and action retained, repeated destination excluded, responsive meeting dialog');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
