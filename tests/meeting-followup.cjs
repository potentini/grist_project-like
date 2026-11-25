const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('../demo.json');
async function setup({fixture,refs}) {
  const db=structuredClone(fixture), roles={1:'projects',2:'streams',3:'tasks',4:'notes',5:'actions',6:'points'};
  db.tables.find(t=>t.id===4).tableId='Sujets';
  db.tables.find(t=>t.id===4).label='Réunions';
  db.meta.forEach(c=>{if(c.parentId===4)c.table='Sujets'});
  db.tables.push({id:6,tableId:'Points',label:'Points de discussion'});
  let next=Math.max(...db.meta.map(c=>c.id))+1;
  for(const colId of ['Code','Titre','NoteOrigine','Contenu','Decision','Projets','Chantiers','Taches','Ordre','Archive'])
    db.meta.push({id:next++,parentId:6,table:'Points',colId,label:colId,type:colId==='Ordre'?'Int':colId==='Archive'?'Bool':'Text',isFormula:false});
  db.meta.push({id:next++,parentId:4,table:'Sujets',colId:'Archive',label:'Archivé',type:'Bool',isFormula:false});
  db.data.projects=[{id:1,Code:'P001',Titre:'Projet Alpha'},{id:2,Code:'P002',Titre:'Projet Bêta'},{id:3,Code:'P003',Titre:'Projet sans réunion'}];
  db.data.streams=[{id:1,Code:'C001',Titre:'Chantier Alpha',Projet:'P001'},{id:2,Code:'C002',Titre:'Chantier Bêta',Projet:'P002'}];
  db.data.tasks=[{id:1,Code:'T001',Titre:'Tâche Alpha',Chantier:'C001'},{id:2,Code:'T002',Titre:'Tâche Bêta',Chantier:'C002'}];
  db.data.actions=[];
  db.data.notes=[
    {id:1,Code:'N001',Titre:'Bilat première',Instance:'Bilat – Amandine',Date:'2026-11-01',Projet:'P001',Contenu:'Note Alpha\nDeuxième ligne',Participants:'Amandine, moi',Etat:'Tenue',Type:'Bilat'},
    {id:2,Code:'N002',Titre:'Bilat suivante',Instance:'Bilat – Amandine',Date:'2026-11-15',Contenu:'Note générale',Participants:'Amandine'},
    {id:3,Code:'N003',Titre:'Codir source',Instance:'Codir',Date:'2026-11-20',Contenu:'Notes générales Codir hors projet'},
    {id:4,Code:'N004',Titre:'Bilat sans date',Instance:'Bilat – Amandine',Projet:'P001',Contenu:'Note non datée'},
    {id:5,Code:'N005',Titre:'Bilat archivée',Instance:'Bilat – Amandine',Date:'2026-12-01',Projet:'P001',Contenu:'Archives',Archive:true},
    {id:6,Code:'N006',Titre:'Réunion ponctuelle',Date:'2026-10-01',Contenu:'Sans instance'},
  ];
  db.data.points=[
    {id:1,Code:'D001',Titre:'Point hérité',NoteOrigine:'N001',Contenu:'Texte hérité',Decision:'Décision Alpha'},
    {id:2,Code:'D002',Titre:'Point Bêta',NoteOrigine:'N002',Taches:'T002',Contenu:'<img src=x onerror="window.injected=true">\nTexte littéral',Decision:'Décision Bêta'},
    {id:3,Code:'D003',Titre:'Point transverse',NoteOrigine:'N002',Projets:'P001, P002',Contenu:'Dans deux projets'},
    {id:4,Code:'D004',Titre:'Sujet Codir',NoteOrigine:'N003',Projets:'P001',Decision:'Décision Codir'},
    {id:5,Code:'D005',Titre:'Autre projet dans réunion Alpha',NoteOrigine:'N001',Projets:'P002',Contenu:'Réservé au projet Bêta'},
    {id:6,Code:'D006',Titre:'Point archivé',NoteOrigine:'N001',Projets:'P001',Archive:true},
    {id:7,Code:'D007',Titre:'Point sans réunion',Projets:'P001',Contenu:'Origine absente'},
  ];
  if(refs) {
    db.tables.push({id:7,tableId:'Instances',label:'Instances'});
    const visibleCol=next++;
    db.meta.push({id:visibleCol,parentId:7,table:'Instances',colId:'Nom',label:'Nom',type:'Text',isFormula:false});
    db.data.instances=[{id:101,Nom:'Bilat – Amandine'},{id:102,Nom:'Codir'}];
    const instance=db.meta.find(c=>c.table==='Sujets'&&c.colId==='Instance');instance.type='Ref:Instances';instance.visibleCol=visibleCol;
    for(const row of db.data.notes){row.Instance=row.Instance==='Codir'?102:row.Instance?101:0;if(row.Date)row.Date=Date.parse(row.Date)/1000;}
    db.meta.find(c=>c.table==='Sujets'&&c.colId==='Date').type='Date';
    const links={Chantiers:{Projet:['projects',false]},Taches:{Chantier:['streams',false]},Sujets:{Projet:['projects',false],Chantiers:['streams',true],Taches:['tasks',true]},Points:{NoteOrigine:['notes',false],Projets:['projects',true],Chantiers:['streams',true],Taches:['tasks',true]}};
    for(const [table,fields] of Object.entries(links))for(const [field,[kind,list]] of Object.entries(fields)){
      const column=db.meta.find(c=>c.table===table&&c.colId===field), target=db.tables.find(t=>roles[t.id]===kind);
      column.type=(list?'RefList:':'Ref:')+target.tableId;
      const role=roles[db.tables.find(t=>t.tableId===table).id];
      for(const row of db.data[role]){
        const codes=String(row[field]||'').split(',').map(c=>c.trim());
        const ids=db.data[kind].filter(r=>codes.includes(r.Code)).map(r=>r.id);
        row[field]=list?['L',...ids]:ids[0]||0;
      }
    }
  }
  if(!refs)db.data.notes[0].Date='1/11/2026';
  const mapping=Object.fromEntries(Object.entries(roles).map(([id,kind])=>[kind,{table:db.tables.find(t=>t.id===Number(id)).tableId,fields:Object.fromEntries(db.meta.filter(c=>c.parentId===Number(id)).map(c=>[c.colId,c.colId]))}]));
  let opts={projectWorkspaceMappingV1:mapping},callback;
  window.writes=[];window.testDb=db;
  window.grist={ready(){},onOptions(cb){callback=cb;cb(structuredClone(opts))},onRecords(){},selectedTable:{getTableId:async()=> 'Projets'},viewApi:{fetchSelectedTable:async()=>db.data.projects.filter(r=>r.id===1)},getOption:async key=>opts[key],setOption:async(key,value)=>{opts={...opts,[key]:value};callback(structuredClone(opts))},docApi:{fetchTable:async table=>table==='_grist_Tables'?db.tables:table==='_grist_Tables_column'?db.meta:table==='Instances'?db.data.instances:db.data[roles[db.tables.find(t=>t.tableId===table)?.id]]||[],applyUserActions:async actions=>{writes.push(...actions);throw Error('Unexpected document mutation')}}};
}
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    for(const width of [1400,768,390])for(const refs of [false,true])for(const colorScheme of ['light','dark']) {
      const phone=width===390;
      const page=await browser.newPage({viewport:{width,height:phone?844:1000},screen:{width,height:phone?844:1000},hasTouch:phone,isMobile:phone,colorScheme}),errors=[];
      page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
      await page.addInitScript(setup,{fixture,refs});
      await page.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:8769')+'/');
      await page.locator('#list > *').first().waitFor();
      assert.equal(await page.locator('[data-meeting-followup]').count(),0);
      if(phone){
        assert.equal(await page.locator('body').evaluate(e=>e.dataset.currentView),'actions');
        await page.locator('#phoneNav summary').tap();
        await page.locator('#phoneNav [data-view=notes]').tap();
      }else await page.locator('nav [data-view=notes]').click();
      await page.locator('[data-meeting-followup]').waitFor();
      // Deliberately hide every item in the main list: the popup has independent criteria.
      await page.locator('#search').fill('aucune correspondance');
      const filtersBefore=await page.locator('#search').inputValue();
      await page.locator('[data-meeting-followup]').click();
      const popup=page.locator('#meetingFollowup');await popup.waitFor();
      const bounds=await popup.evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,iw:innerWidth,ih:innerHeight,scroll:e.scrollWidth}});
      assert.ok(bounds.width<=bounds.iw && bounds.height<=bounds.ih);
      assert.ok(bounds.scroll<=bounds.width,JSON.stringify({width,refs,colorScheme,bounds}));
      if(phone){assert.equal(bounds.width,bounds.iw);assert.equal(bounds.height,bounds.ih);}
      if(process.env.FOLLOWUP_SCREENSHOT && !phone && !refs && colorScheme==='light')await page.screenshot({path:process.env.FOLLOWUP_SCREENSHOT});
      assert.equal(await page.locator('#meetingFollowupMode').inputValue(),'instance');
      await popup.getByRole('heading',{name:'Projet Alpha',exact:true}).first().waitFor();
      await popup.getByRole('heading',{name:'Projet Bêta',exact:true}).first().waitFor();
      await popup.getByRole('heading',{name:'Sans projet / Notes générales',exact:true}).waitFor();
      assert.match(await page.locator('#meetingFollowupStatus').innerText(),/3 réunion\(s\) · 4 point\(s\)/);
      assert.equal(await popup.locator('img').count(),0);
      assert.equal(await page.evaluate(()=>window.injected),undefined);
      assert.ok((await popup.innerText()).includes('<img src=x'));
      const meetingIds=()=>popup.locator('.followup-meeting').evaluateAll(rows=>rows.map(r=>Number(r.dataset.followupMeeting)));
      assert.deepEqual(await meetingIds(),[2,1,4]);
      await page.locator('#meetingFollowupOrder').selectOption('asc');assert.deepEqual(await meetingIds(),[1,2,4]);
      await page.locator('#meetingFollowupOrder').selectOption('desc');
      const picker=popup.getByRole('combobox',{name:'Instance ou projet'});
      await picker.fill('cod');await popup.getByRole('option',{name:'Codir',exact:true}).click();
      assert.deepEqual(await meetingIds(),[3]);
      await picker.fill('amand');await picker.press('ArrowDown');await picker.press('Enter');
      assert.deepEqual(await meetingIds(),[2,1,4]);
      const alpha=popup.locator('.followup-group').filter({has:page.getByRole('heading',{name:'Projet Alpha',exact:true})});
      assert.equal(await alpha.getByText('Point Bêta',{exact:true}).count(),0);
      assert.equal(await alpha.getByText('Autre projet dans réunion Alpha',{exact:true}).count(),0);
      await alpha.getByText('Projet associé via la réunion',{exact:true}).waitFor();
      await page.locator('#meetingFollowupMode').selectOption('project');await picker.fill('alpha');await popup.getByRole('option',{name:'Projet Alpha',exact:true}).click();
      await popup.getByText('Sujet Codir',{exact:true}).waitFor();
      assert.equal(await popup.getByText('Point Bêta',{exact:true}).count(),0);
      assert.equal(await popup.getByText('Autre projet dans réunion Alpha',{exact:true}).count(),0);
      assert.equal(await popup.getByText('Notes générales Codir hors projet',{exact:true}).count(),0);
      await popup.getByText('Point sans réunion',{exact:true}).waitFor();
      await popup.getByRole('heading',{name:/Réunion non retrouvée/}).waitFor();
      const dates=await popup.locator('.followup-meeting h4').allTextContents();
      assert.ok(dates[0].includes('20/11/2026'),JSON.stringify(dates));
      await popup.getByText('Instance : Codir',{exact:false}).waitFor();
      assert.ok((await popup.innerText()).includes('Participants externes : Amandine, moi'));
      assert.equal(await popup.getByRole('heading',{name:/Bilat archivée/}).count(),0);
      await page.locator('#meetingFollowupArchived').check();await popup.getByRole('heading',{name:/Bilat archivée/}).waitFor();
      await popup.getByText('Point archivé',{exact:true}).waitFor();
      await page.locator('#meetingFollowupArchived').uncheck();
      await page.locator('#meetingFollowupSearch').fill('Décision Codir');
      assert.equal(await popup.locator('[data-followup-entry]').count(),1);
      await page.locator('#meetingFollowupSearch').fill('');await page.locator('#meetingFollowupTarget').selectOption('3');
      await popup.getByText('Aucune note ni aucun point pour ces critères.',{exact:true}).waitFor();
      await page.locator('#meetingFollowupClose').click();await popup.waitFor({state:'hidden'});
      assert.equal(await page.locator('#search').inputValue(),filtersBefore);
      assert.equal(await page.locator('#list [data-kind=notes]').count(),0);
      // Opening a source uses the existing detail navigation, without editing data.
      await page.locator('[data-meeting-followup]').click();await page.locator('#meetingFollowupMode').selectOption('project');await picker.fill('alpha');await popup.getByRole('option',{name:'Projet Alpha',exact:true}).click();
      await popup.locator('[data-followup-entry="points:4"]').getByRole('button',{name:'Ouvrir le point'}).click();
      await popup.waitFor({state:'hidden'});await page.locator('#detail h2').filter({hasText:'Sujet Codir'}).waitFor();
      if(phone){
        await page.locator('#phoneBack').tap();
        await page.locator('#search').fill('');
        for(const size of [{width:390,height:844},{width:844,height:390}]){
          await page.setViewportSize(size);
          await page.locator('#phoneNav summary').tap();
          await page.locator('#phoneNav [data-view=projects]').tap();
          await page.locator('#list [data-kind=projects]').first().tap();
          assert.equal(await page.locator('[data-project-timeline]').isVisible(),false);
          await page.locator('[data-project-timeline]').evaluate(e=>e.click());
          assert.equal(await page.locator('#projectTimeline').evaluate(e=>e.open),false);
          assert.ok([null,'about:blank'].includes(await page.locator('#timelineFrame').getAttribute('src')));
          await page.locator('#phoneBack').tap();
        }
      }
      if(phone){await page.locator('#phoneNav').evaluate(e=>e.open=true);await page.locator('#phoneNav [data-view=actions]').click()}else await page.locator('nav [data-view=actions]').click();assert.equal(await page.locator('[data-meeting-followup]').count(),0);
      assert.equal(await page.evaluate(()=>writes.length),0);
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log('PASS follow-up global chronological order in both directions, searchable instance/project selection by text and keyboard, date/source metadata, own filters, explicit/inherited/multiple links, archive/missing provenance, safe text, source navigation and no writes in Text/Ref mappings and light/dark modes on PC/tablet/phone');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
