const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=structuredClone(require('../demo.json'));
for(const [colId,type,isFormula] of [['Nom','Text',false],['Instance','Text',false],['ChampLibre','Text',false],['Calcul','Text',true]]) fixture.meta.push({id:900+fixture.meta.length,parentId:4,table:'Notes',colId,label:colId,type,isFormula});
fixture.meta.find(c=>c.table==='Notes'&&c.colId==='Titre').isFormula=true;
fixture.data.notes[0].Nom='Réunion ponctuelle';fixture.data.notes[0].Instance='Codir';fixture.data.notes[0].ChampLibre='Valeur initiale';fixture.data.notes[0].Calcul='Lecture seule';fixture.data.notes[0].ChampLibre='   ';
fixture.data.notes[0].Contenu=Array.from({length:70},(_,i)=>'Ligne '+(i+1)).join('\n');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const width of [1440,768,390]){
 const ctx=await browser.newContext({viewport:{width,height:1000},screen:{width,height:1000},hasTouch:width<1000,isMobile:width<1000});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await p.addInitScript(require('./renamed-fixture.cjs'),fixture);
 await p.goto('http://127.0.0.1:8766/');await p.locator('#list > *').first().waitFor();
 await p.evaluate(async()=>{
  const {projectWorkspaceMappingV1:mapping}=optionsSnapshot();
  mapping.notes.extraFields=[{id:'ChampLibre',label:'Texte supplémentaire'}];
  await grist.setOption('projectWorkspaceMappingV1',mapping);
 });
 assert.equal(await p.locator('a[href="timeline.html"]').count(),1);
 assert.equal(await p.locator('header > nav a.view-button').innerText(),'Table/Timeline');
 assert.equal(await p.locator('header > nav a.view-button').isVisible(),width!==390);
 if(width===390){await p.locator('#phoneNav summary').click();await p.locator('#phoneNav [data-view=notes]').click()}
 else await p.locator('nav [data-view=notes]').click();
 await p.locator('#list [data-kind=notes][data-id="1"]').click();
 const toolbar=p.locator('#detail > .detail-navigation');
 const area=p.locator('#detail .meeting-notes-reading');
 assert.equal(await area.isVisible(),true);
 assert.equal(await area.evaluate(el=>getComputedStyle(el).borderTopStyle),'solid');
 assert.equal(await p.locator('#detail [data-slot=ChampLibre]').count(),0);
 const controlRows=await toolbar.locator('button').evaluateAll(es=>[...new Set(es.map(e=>e.getBoundingClientRect().top))]);
 assert.equal(controlRows.length,1,`Viewport ${width}px`);
 await p.locator('#detail').evaluate(el=>{el.scrollTop=300});
 const stickyTop=(await toolbar.boundingBox()).y;
 await p.locator('#detail').evaluate(el=>{el.scrollTop=600});
 assert.equal((await toolbar.boundingBox()).y,stickyTop);
 assert.ok(stickyTop>=0);
 assert.equal(await toolbar.locator('[data-edit], [data-removal]').count(),3);
 await p.locator('#editionButton').click();await toolbar.locator('[data-edit]').click();
 assert.equal(await area.count(),0);
 const note=p.locator('#editForm textarea[name=Contenu]');
 const initialHeight=(await note.boundingBox()).height;
 await note.fill('');
 const emptyHeight=(await note.boundingBox()).height;
 assert.ok(initialHeight>emptyHeight*2);
 await note.fill('Une courte note');
 assert.equal((await note.boundingBox()).height,emptyHeight);
 await note.fill('Une courte note\nDeuxième ligne\nTroisième ligne');
 assert.ok((await note.boundingBox()).height>emptyHeight);

 async function order(){const names=await p.locator('#editForm [name]').evaluateAll(es=>es.map(e=>e.name));assert.ok(names.indexOf('Instance')<names.indexOf('Date'));assert.ok(names.indexOf('Date')<names.indexOf('Nom'));}
 await order();assert.equal(await p.locator('#editForm [name=Titre]').count(),0);assert.equal(await p.getByRole('textbox',{name:'Titre de la réunion (si pas une instance)',exact:true}).count(),1);
 assert.equal(await p.locator('#editForm [name=Calcul]').count(),0);
 await p.locator('#editForm [name=Nom]').fill('Nom libre modifié');
 await p.locator('#editForm [name=ChampLibre]').fill('Champ supplémentaire modifié');await p.locator('#save').click();await p.locator('#editForm').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>testDb.data.notes[0].Nom),'Nom libre modifié');
 assert.equal(await p.evaluate(()=>writes.some(a=>Object.hasOwn(a[3]||{},'Titre'))),false);
 assert.equal(await p.evaluate(()=>testDb.data.notes[0].ChampLibre),'Champ supplémentaire modifié');
 assert.equal(await p.locator('#detail [data-slot=ChampLibre]').innerText(),'Champ supplémentaire modifié');
 if(width===390)await p.locator('#phoneBack').click();await p.locator('#list [data-new=notes]').click();await order();
 assert.equal(await p.getByRole('textbox',{name:'Titre de la réunion (si pas une instance)',exact:true}).count(),1);
 await p.locator('#cancel').click();
 if(width!==390){
  await p.locator('#mappingButton').click();
  for(const [kind,fields] of Object.entries({
   projects:['PointEtape'], streams:['Volet','Nature','Vigilance','PointEtape','Ordre'],
   tasks:['Vigilance','PointEtape','Ordre'], notes:['DateSource','Type'],
  })) for(const field of fields)
   assert.equal(await p.locator(`#mapping [data-map=${kind}][data-field=${field}]`).count(),0);
  const empty=p.locator('#mapping [data-map=notes][data-field=PointsReportes]');
  assert.equal(await empty.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 240, 240)');
  const border=p.locator('#mappingResize'), panel=p.locator('#mapping');
  const before=(await panel.boundingBox()).height;
  const handle=await border.boundingBox();
  const x=Math.round(handle.x+handle.width/2),y=Math.round(handle.y+handle.height/2);
  if(width===768){
   const touch=await ctx.newCDPSession(p);
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+72}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await touch.detach();
  }else{
   await p.mouse.move(x,y);await p.mouse.down();
   await p.mouse.move(x,y+72,{steps:4});await p.mouse.up();
  }
  assert.equal((await panel.boundingBox()).height,before+72);
  await border.press('ArrowUp');
  assert.equal((await panel.boundingBox()).height,before+48);
  await border.press('ArrowDown');
  assert.equal((await panel.boundingBox()).height,before+72);
  await p.locator('#mappingButton').click();
 }
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await ctx.close();
}
console.log('PASS meeting creation/edit field order and title label, mapped extra text editing with formula protection, sticky controls, nonempty consultation fields, adaptive textareas and mapping resize at applicable widths');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
