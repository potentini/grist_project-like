const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {make, setup} = require('./mentions-fixture.cjs');

(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium', args:['--no-sandbox']});
  try {
    for (const width of [1440, 768, 390]) {
      const fixture = make(true);
      // Use a nonstandard column ID so auto-detection cannot masquerade as persistence.
      const column = 'SujetsEnAttente';
      fixture.persistOptions = true;
      fixture.unmappedNoteColumn = column;
      fixture.meta.push({id:2100,parentId:4,table:'Notes',colId:column,label:'Sujets en attente',type:'RefList:Points',isFormula:false});
      fixture.data.notes[0].Instance = 'Comité';
      fixture.data.notes[1].Instance = 'Comité';
      const context = await browser.newContext({viewport:{width,height:900},screen:{width,height:900},hasTouch:width<1000,isMobile:width===390});
      const errors = [];
      const url = process.env.TEST_ORIGIN || 'http://127.0.0.1:8771/';
      await context.route('https://docs.getgrist.com/**', route => route.fulfill({body:''}));
      await context.addInitScript(setup, fixture);
      async function openWidget(configure = false) {
        const page = await context.newPage();
        if (configure && width === 390) await page.setViewportSize({width:1200,height:900});
        page.setDefaultTimeout(8000);
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.locator('#list > *').first().waitFor();
        return page;
      }
      let page = await openWidget(true);
      const mappingField = () => page.locator('#mapping select[data-map="notes"][data-field="PointsReportes"]');
      await page.locator('#mappingButton').click();
      await mappingField().selectOption(column);
      await page.locator('#applyMapping').click();
      await page.waitForFunction(column => JSON.parse(localStorage.getItem('mentions-options:mentions-doc'))?.projectWorkspaceMappingV1.notes.fields.PointsReportes === column, column);
      await page.reload();
      await page.locator('#list > *').first().waitFor();
      await page.locator('#mappingButton').click();
      assert.equal(await mappingField().inputValue(), column);
      await page.close();
      page = await openWidget(true);
      await page.locator('#mappingButton').click();
      assert.equal(await mappingField().inputValue(), column);
      await page.keyboard.press('Escape');
      if (width === 390) {
        await page.setViewportSize({width,height:900});
        await page.locator('#phoneNav').waitFor();
      }
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
      await page.waitForFunction(column => testDb.data.notes[1][column]?.includes(1), column);
      const destination = page.locator('#list .tree-node[data-tree-kind="notes"][data-tree-id="2"]');
      await destination.locator('[data-kind="points"][data-id="1"]').waitFor({state:'attached'});
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
      assert.deepEqual(await page.evaluate(column => testDb.data.notes[2][column], column), ['L',1]);
      assert.equal(await page.evaluate(() => testDb.data.points.length),1);
      assert.equal(await page.evaluate(() => testDb.data.points[0].NoteOrigine),1);
      assert.equal(await page.evaluate(() => testDb.data.actions[0].PointOrigine),1);
      if (width===390 && await page.locator('#phoneBack').isVisible()) await page.locator('#phoneBack').click();
      const created = page.locator('#list [data-kind=notes][data-id="3"]');
      await created.waitFor();
      assert.match(await created.innerText(), /Séance future/);
      await page.locator('#list [data-kind=notes][data-id="2"]').first().click();
      await page.locator('#detail').getByText(/Point reporté depuis/).waitFor();
      if (width === 1440) {
        await page.locator('[data-meeting-followup]').click();
        await page.locator('#meetingFollowup [data-followup-meeting="2"]').getByText('Point reporté', {exact:true}).waitFor();
        await page.locator('#meetingFollowupClose').click();
      }
      await page.locator('#detail [data-kind=points][data-id="1"]').first().press('Enter');
      await page.locator('#detail').getByRole('button',{name:'Séance future',exact:true}).waitFor();
      if (width === 1440) {
        await page.locator('#list [data-kind=notes][data-id="2"]').first().click();
        await page.locator('#detail [data-edit]').click();
        await page.locator('#editForm [name=PointsReportes]').selectOption([], {force:true});
        await page.locator('#editForm [name=Titre]').fill('Réunion mise à jour');
        await page.locator('#save').click();
        await page.locator('#editForm').waitFor({state:'hidden'});
        await page.locator('#list [data-kind=notes][data-id="2"]').getByText('Réunion mise à jour', {exact:true}).waitFor();
        assert.deepEqual(await page.evaluate(column => testDb.data.notes[1][column], column), ['L']);
        assert.equal(await page.evaluate(() => testDb.data.points[0].NoteOrigine), 1);
      }
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS saved mapping after reload and reopening, automatic list refresh, meeting forwarding to existing/new meeting, original point and action retained, repeated destination excluded, responsive meeting dialog');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
