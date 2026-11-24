const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('./mentions-fixture.cjs');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const width of [1440,768,390]){
 const db=fixture.make(true);db.meta.find(m=>m.table==='Points'&&m.colId==='Projets').type='Ref:Projets';db.data.points[0].Projets=0;
 const ctx=await b.newContext({viewport:{width,height:1000},hasTouch:width<1000,isMobile:width<1000});const p=await ctx.newPage();
 await p.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await p.addInitScript(fixture.setup,db);await p.goto('http://127.0.0.1:8771/');await p.locator('#list > *').first().waitFor();
 if(await p.locator('#phoneNav').isVisible()){await p.locator('#phoneNav summary').click();await p.locator('#phoneNav [data-view=notes]').click()}else await p.locator('nav [data-view=notes]').click();
 await p.locator('#list [data-kind=notes][data-id="1"]').first().click();await p.locator('#editionButton').click();await p.locator('#detail [data-edit]').click();
 const block=p.locator('.mention-block').first(),menu=p.locator('.mention-menu');
 async function mention(text){await block.getByRole('button',{name:'@ Ajouter un rattachement',exact:true}).click();await block.locator('[data-block-field=content]').pressSequentially(text);await menu.waitFor()}
 await mention('hceres');await menu.getByRole('option',{name:/Projets — Auto/}).click();assert.match(await block.locator('[data-block-field=content]').inputValue(),/@\[Auto-évaluation/);
 await mention('externe');const other=menu.getByRole('option',{name:/Projets — Projet externe/});await other.waitFor();assert.equal(await other.isDisabled(),true);assert.match(await other.innerText(),/Référence simple/);
 await block.locator('[data-block-field=content]').press('Escape');
 await block.locator('[data-block-field=content]').fill('Échanges modifiés');await mention('externe');await menu.getByRole('option',{name:/Projets — Projet externe/}).click();
 await p.locator('#save').click();await p.locator('#editForm').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>testDb.data.points[0].Projets),2);
 // Standalone point keeps its single-select field and chip consistent.
 await p.locator('#detail [data-kind=points][data-id="1"]').first().click();await p.locator('#detail [data-edit]').click();
 await p.locator('.meeting-mentions > .mention-chips button').click();await p.getByRole('button',{name:'@ Ajouter un rattachement',exact:true}).click();await p.locator('#editForm [name=Contenu]').pressSequentially('hceres');await menu.getByRole('option',{name:/Projets — Auto/}).click();
 assert.equal(await p.locator('#editForm [name=Projets]').inputValue(),'1');await p.locator('#save').click();await p.locator('#editForm').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>testDb.data.points[0].Projets),1);
 await ctx.close();
}console.log('PASS single project Ref selection, occupied-field protection, removal/replacement and standalone point on PC/tablet/phone');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
