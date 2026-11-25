const{chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fixture=require('./mentions-fixture.cjs');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8766';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const phone of [false,true]){
 const ctx=await b.newContext({viewport:{width:phone?390:1440,height:phone?844:1000},screen:{width:phone?390:1440,height:phone?844:1000},hasTouch:phone,isMobile:phone});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await p.addInitScript(fixture.setup,fixture.make(true));await p.goto(origin+'/');
 async function notes(){if(phone){await p.locator('#phoneNav summary').tap();await p.locator('#phoneNav [data-view=notes]').tap()}else await p.locator('nav [data-view=notes]').click()}
 await p.locator('#list > *').first().waitFor();await notes();await p.locator('#list [data-kind=notes][data-id="1"]').click();await p.locator('#editionButton').click();await p.locator('#detail [data-edit]').click();
 const text=p.locator('#editForm [name=Contenu]'),menu=p.locator('.mention-menu');
 await text.fill('Contact : prenom@hceres.fr');await p.waitForTimeout(170);assert.equal(await menu.isVisible(),false);
 await text.fill('Sujet @hceres');await menu.waitFor();await text.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await p.locator('#editForm').isVisible(),true);assert.equal(await p.locator('.mention-proposal').isVisible(),false);
 await text.fill('Texte conservé @hceres');await menu.waitFor();
 if(phone)await menu.getByRole('option',{name:/Tâches — Confirmer/}).tap();else await text.press('Enter');
 assert.match(await text.inputValue(),/@\[/);assert.equal(await p.locator('.mention-proposal').isVisible(),false);
 await p.getByRole('button',{name:'Transformer le paragraphe en point'}).click();
 await p.locator('.mention-proposal').waitFor();assert.equal(await p.locator('.mention-block').count(),1);
 await p.getByRole('button',{name:'Garder en notes générales',exact:true}).click();assert.match(await text.inputValue(),/^Texte conservé @\[/);assert.deepEqual(await p.evaluate(()=>writes),[]);
 await text.fill('Autre paragraphe @aucun');await menu.waitFor();await menu.getByRole('option',{name:'Créer un point sans rattachement'}).click();
 await p.getByRole('button',{name:'Créer le point (brouillon)',exact:true}).click();assert.equal(await p.locator('.mention-block').count(),2);
 const pending=p.locator('.mention-block').last();await pending.locator('[data-block-field=decision]').fill('Décision temporaire');
 await pending.getByRole('button',{name:'Remettre dans les notes générales'}).click();assert.equal(await p.locator('.mention-block').count(),1);assert.match(await text.inputValue(),/Décision temporaire/);assert.deepEqual(await p.evaluate(()=>writes),[]);
 await p.locator('#cancel').click();
 // Existing point @ uses the same row, supports multiple projects, and moving it keeps action provenance coherent.
 const point=p.locator('#detail [data-kind=points][data-id="1"]').first();await point.click();await p.locator('#detail [data-edit]').click();
 await p.getByRole('button',{name:'@ Ajouter un rattachement',exact:true}).click();await p.locator('#editForm [name=Contenu]').pressSequentially('externe');
 if(phone)await menu.getByRole('option',{name:/Projets — Projet externe/}).tap();else await menu.getByRole('option',{name:/Projets — Projet externe/}).click();
 assert.equal(await p.locator('.meeting-mentions > .mention-chips button').count(),2);
 await p.locator('#editForm [name=NoteOrigine]').selectOption('2');await p.locator('#save').click();await p.locator('#editForm').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>testDb.data.points.length),1);assert.deepEqual(await p.evaluate(()=>testDb.data.points[0].Projets),['L',1,2]);assert.equal(await p.evaluate(()=>testDb.data.points[0].NoteOrigine),2);assert.equal(await p.evaluate(()=>testDb.data.actions[0].NoteOrigine),2);
 // Removing a chip only clears its reference; it never deletes the point or its text.
 await p.locator('#detail [data-edit]').click();await p.locator('.meeting-mentions > .mention-chips button').last().click();await p.locator('#save').click();await p.locator('#editForm').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>testDb.data.points.length),1);assert.deepEqual(await p.evaluate(()=>testDb.data.points[0].Projets),['L',1]);assert.equal(await p.evaluate(()=>testDb.data.points[0].Decision),'Décision conservée');
 assert.deepEqual(errors,[]);await ctx.close();
}
// A large preloaded index still caps the visible results and leaves typing native.
const ctx=await b.newContext(),p=await ctx.newPage();await p.goto(origin+'/demo.json');await p.setContent('<form><textarea aria-label="Notes"></textarea></form>');await p.addScriptTag({path:path.resolve('meeting-mentions.js')});await p.addStyleTag({path:path.resolve('meeting-mentions.css')});
await p.evaluate(()=>MeetingMentions.create({kind:'notes',form:document.querySelector('form'),content:document.querySelector('textarea'),enabled:true,schema:'test',blocks:[],initialRefs:[],readRefs:()=>[],writeRefs(){},canLink:()=>true,writable:()=>true,hasField:()=>true,label:r=>'Objet '+r.id,candidates:Array.from({length:10000},(_,i)=>({kind:'tasks',id:i+1,label:'Tâche '+(i+1),path:'Projet Hcéres › Tâche '+(i+1),search:'Projet Hcéres Tâche '+(i+1)}))}));
await p.getByRole('textbox',{name:'Notes'}).fill('Texte fluide @hceres');assert.equal(await p.getByRole('textbox',{name:'Notes'}).inputValue(),'Texte fluide @hceres');await p.locator('.mention-menu').waitFor();assert.equal(await p.locator('.mention-menu [role=option]').count(),13);assert.match(await p.locator('.mention-menu p').innerText(),/10000 résultats/);await ctx.close();
console.log('PASS email handling, Escape and keyboard selection, real touch selection, cancel/revert without writes, standalone point identity/multiple links/removal/action origin propagation, capped 10000-object index');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
