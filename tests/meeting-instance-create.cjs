const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fixture = require('./mentions-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox'] });
  try {
    for (const width of [1440,768,390]) {
      const model = fixture.make(true);
      model.instanceTable = 'Instances';
      model.tables.push({id:7,tableId:'Instances',label:'Instances'});
      model.data.instances = [{id:5, Nom:'Comité existant'}];
      model.meta.push({id:2500,parentId:7,table:'Instances',colId:'Nom',label:'Nom',type:'Text',isFormula:false});
      const instanceColumn = model.meta.find(column => column.table === 'Notes' && column.colId === 'Instance');
      instanceColumn.type = 'Ref:Instances';
      instanceColumn.visibleCol = 2500;
      for (const note of model.data.notes) note.Instance = 0;
      const context = await browser.newContext({viewport:{width,height:900},screen:{width,height:900},hasTouch:width<1000,isMobile:width===390});
      await context.addInitScript(fixture.setup, model);
      await context.route('https://docs.getgrist.com/**', route=>route.fulfill({body:''}));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error=>errors.push(error.message));
      page.setDefaultTimeout(10000);
      await page.goto(process.env.TEST_ORIGIN || 'http://127.0.0.1:8766/');
      await page.locator('#list > *').first().waitFor();
      if (width === 390) {
        await page.locator('#phoneNav summary').tap();
        await page.locator('#phoneNav [data-view=notes]').tap();
      } else await page.locator('nav [data-view=notes]').click();
      await page.locator('#editionButton').click();
      await page.locator('#list [data-new=notes]').click();
      const editor = page.locator('#editor');
      await editor.locator('[name=Titre]').fill('Séance à préparer');
      await editor.locator('[name=Contenu]').fill('Brouillon de réunion en cours.');
      const create = editor.getByRole('button',{name:'Créer une instance…',exact:true});
      const form = editor.locator('#instanceCreatorFields');
      const name = form.getByRole('textbox',{name:'Nom de l’instance'});
      const save = form.getByRole('button',{name:'Enregistrer l’instance'});
      const status = editor.locator('.instance-creator [role=status]');
      await create.click();
      await name.fill('Comité de pilotage');
      if (width === 1440) {
        await page.evaluate(()=>window.rejectWrite=true);
        await save.click();
        await status.getByText(/Accès refusé/).waitFor();
        assert.equal(await name.inputValue(),'Comité de pilotage');
        assert.equal(await page.evaluate(()=>writes.length),0);
        await page.evaluate(()=>{window.rejectWrite=false;window.loseAck=true});
        await save.click();
        await status.getByText(/Réponse réseau perdue/).waitFor();
      }
      await save.click();
      await form.waitFor({state:'hidden'});
      assert.equal(await editor.locator('[name=Instance]').inputValue(),'6');
      assert.equal(await editor.locator('[data-search-for=Instance]').inputValue(),'Comité de pilotage');
      assert.equal(await editor.locator('[name=Contenu]').inputValue(),'Brouillon de réunion en cours.');
      assert.equal(await page.evaluate(()=>testDb.data.notes.length),2);
      assert.equal(await page.evaluate(()=>testDb.data.instances.length),2);
      await editor.locator('#save').click();
      await editor.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>testDb.data.notes.at(-1).Instance),6);
      assert.equal(await page.evaluate(()=>testDb.data.notes.at(-1).Contenu),'Brouillon de réunion en cours.');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS create/select meeting instance without losing draft, denial and no duplicates after lost response, native references on PC/tablet/mobile');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
