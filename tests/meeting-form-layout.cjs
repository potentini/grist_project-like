const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=structuredClone(require('../demo.json'));
for(const [colId,type,isFormula] of [['Instance','Text',false],['ChampLibre','Text',false],['Calcul','Text',true]]) fixture.meta.push({id:900+fixture.meta.length,parentId:4,table:'Notes',colId,label:colId,type,isFormula});
fixture.data.notes[0].Instance='Codir';fixture.data.notes[0].ChampLibre='Valeur initiale';fixture.data.notes[0].Calcul='Lecture seule';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const width of [1440,768,390]){
 const ctx=await browser.newContext({viewport:{width,height:1000},screen:{width,height:1000},hasTouch:width<1000,isMobile:width<1000});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await p.addInitScript(require('./renamed-fixture.cjs'),fixture);
 await p.goto('http://127.0.0.1:8766/');await p.locator('#list > *').first().waitFor();
 assert.equal(await p.locator('a[href="timeline.html"]').count(),1);
 assert.equal(await p.locator('header > nav a.view-button').innerText(),'Table/Timeline');
 assert.equal(await p.locator('header > nav a.view-button').isVisible(),width!==390);
 if(width===390){await p.locator('#phoneNav summary').click();await p.locator('#phoneNav [data-view=notes]').click()}
 else await p.locator('nav [data-view=notes]').click();
 await p.locator('#list [data-kind=notes][data-id="1"]').click();await p.locator('#editionButton').click();await p.locator('#detail [data-edit]').click();
 async function order(){const names=await p.locator('#editForm [name]').evaluateAll(es=>es.map(e=>e.name));assert.ok(names.indexOf('Instance')<names.indexOf('Date'));assert.ok(names.indexOf('Date')<names.indexOf('Titre'));}
 await order();assert.equal(await p.getByRole('textbox',{name:'Titre de la réunion (si pas une instance)',exact:true}).count(),1);
 assert.equal(await p.locator('#editForm [name=Calcul]').count(),0);
 await p.locator('#editForm [name=ChampLibre]').fill('Champ supplémentaire modifié');await p.locator('#save').click();await p.locator('#editForm').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>testDb.data.notes[0].ChampLibre),'Champ supplémentaire modifié');
 if(width===390)await p.locator('#phoneBack').click();await p.locator('#list [data-new=notes]').click();await order();
 assert.equal(await p.getByRole('textbox',{name:'Titre de la réunion (si pas une instance)',exact:true}).count(),1);
 await p.locator('#cancel').click();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await ctx.close();
}
console.log('PASS meeting creation/edit field order and title label, mapped extra text editing with formula protection, grouped timeline navigation and unchanged phone restriction at 3 widths');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
