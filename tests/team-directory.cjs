const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fixture = require('./mentions-fixture.cjs');

(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const model = fixture.make(true);
    model.persistOptions = true;
    model.teamTable = 'Equipe';
    model.tables.push({id:7,tableId:'Equipe',label:'Équipe'});
    model.data.team = [
      {id:101,Nom:'Martin',Prenom:'Camille',Courriel:'cm@example.test',Service:'Qualité'},
      {id:102,Nom:'Dupont',Prenom:'Camille',Courriel:'cd@example.test',Service:'Évaluation'},
      {id:103,Nom:'Bernard',Prenom:'Alice',Courriel:'ab@example.test',Service:'Pilotage'},
    ];
    for (const [index, colId] of ['Nom','Prenom','Courriel','Service'].entries())
      model.meta.push({id:2200+index,parentId:7,table:'Equipe',colId,label:colId,type:'Text',isFormula:false});
    for (const [index, kind] of ['projects','streams','tasks','actions','notes'].entries()) {
      const table = model.tables.find(row => row.tableId === ({projects:'Projets',streams:'Chantiers',tasks:'Taches',actions:'Actions',notes:'Notes'})[kind]);
      let field = model.meta.find(column => column.table === table.tableId && column.colId === 'Responsable');
      if (!field) {
        field = {id:2300+index,parentId:table.id,table:table.tableId,colId:'Responsable',label:'Responsable',isFormula:false};
        model.meta.push(field);
      }
      field.type = 'Ref:Equipe';
      model.data[kind].forEach((row, i) => { row.Responsable = i === 0 ? 101 : 102; });
    }
    const legacyParticipants = model.meta.find(c => c.table === 'Notes' && c.colId === 'Participants');
    legacyParticipants.type = 'RefList:Equipe';
    model.data.notes[0].Participants = ['L',101];
    model.meta.push({id:2401,parentId:4,table:'Notes',colId:'ParticipantsExternes',label:'Participants externes',type:'Text',isFormula:false});
    model.meta.push({id:2400,parentId:5,table:'Actions',colId:'ResponsableDiPSi',label:'Responsable externe',type:'Text',isFormula:false});
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    await ctx.addInitScript(fixture.setup, model);
    await ctx.route('https://docs.getgrist.com/**', route=>route.fulfill({body:''}));
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    await page.goto(process.env.TEST_ORIGIN || 'http://127.0.0.1:8806/');
    await page.locator('#list > *').first().waitFor();
    await page.locator('#mappingButton').click();
    for(const [field, col] of Object.entries({table:'Equipe',Nom:'Nom',Prenom:'Prenom',Email:'Courriel',Service:'Service'}))
      assert.equal(await page.locator('[data-map=team][data-field="'+field+'"]').inputValue(), col);
    assert.equal(await page.locator('[data-map=notes][data-field=ParticipantsInternes]').inputValue(),'Participants');
    assert.equal(await page.locator('[data-map=notes][data-field=ParticipantsExternes]').inputValue(),'ParticipantsExternes');
    assert.equal(await page.locator('[data-map=notes][data-field=Participants]').count(),0);
    await page.locator('#applyMapping').click();
    await page.locator('#mapping').waitFor({state:'hidden'});
    await page.reload();
    await page.locator('#list > *').first().waitFor();
    await page.locator('#mappingButton').click();
    assert.equal(await page.locator('[data-map=team][data-field=Email]').inputValue(),'Courriel');
    await page.locator('#mappingButton').click();
    await page.locator('nav [data-view=actions]').click();
    const owners = await page.locator('#ownerFilter option').evaluateAll(opts=>opts.map(o=>[o.value,o.textContent]));
    assert.ok(owners.some(([key,label])=>key==='team:101' && /Camille Martin/.test(label)));
    assert.ok(owners.some(([key,label])=>key==='team:102' && /Camille Dupont/.test(label)));
    await page.locator('#search').fill('Envoyer les invitations');
    await page.locator('#list [data-kind=actions][data-id="1"]').first().click();
    assert.equal(await page.locator('#detail [data-slot=Responsable]').innerText(), 'Camille');
    await page.locator('#editionButton').click();
    await page.locator('#detail [data-edit]').click();
    const owner = page.locator('#editForm [data-search-for=Responsable]');
    await owner.fill('Bernard');
    await page.getByRole('option',{name:'Alice',exact:true}).click();
    await page.locator('#editForm [name=ResponsableDiPSi]').fill('Cabinet Martin');
    await page.locator('#save').click();
    await page.locator('#editForm').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>testDb.data.actions[0].Responsable),103);
    assert.equal(await page.evaluate(()=>testDb.data.actions[0].ResponsableDiPSi),'Cabinet Martin');
    assert.equal(await page.locator('#detail [data-slot=Responsable]').innerText(),'Alice');
    await page.locator('#search').fill('');
    await page.locator('nav [data-view=notes]').click();
    await page.locator('#list [data-kind=notes][data-id="1"]').first().click();
    await page.locator('#detail [data-edit]').click();
    await owner.fill('Évaluation');
    await page.getByRole('option',{name:/Camille Dupont/}).click();
    const internal = page.locator('#editForm [data-search-for=ParticipantsInternes]');
    await internal.fill('Bernard');
    await page.getByRole('option',{name:/Alice/}).click();
    await page.locator('#editForm [name=ParticipantsExternes]').fill('Cabinet Martin');
    await page.locator('#save').click();
    await page.locator('#editForm').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>testDb.data.notes[0].Responsable),102);
    assert.deepEqual(await page.evaluate(()=>testDb.data.notes[0].Participants),['L',101,103]);
    assert.equal(await page.evaluate(()=>testDb.data.notes[0].ParticipantsExternes),'Cabinet Martin');
    await page.locator('#list [data-new=notes]').click();
    await page.locator('#editor [name=Titre]').fill('Réunion avec invités');
    await page.locator('#editor [name=ParticipantsInternes]').selectOption(['102'],{force:true});
    await page.locator('#editor [name=ParticipantsExternes]').fill('Partenaire extérieur');
    await page.locator('#save').click();
    await page.locator('#editor').waitFor({state:'hidden'});
    const created = await page.evaluate(()=>testDb.data.notes.at(-1));
    assert.deepEqual(created.Participants,['L',102]);
    assert.equal(created.ParticipantsExternes,'Partenaire extérieur');
    assert.doesNotMatch(await page.locator('body').innerText(), /@example\.test/);
    assert.deepEqual(errors,[]);
    await ctx.close();
    console.log('PASS directory detection and persisted mapping, first-name display, resolvable namesakes, stable filter identities and separate free text');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
