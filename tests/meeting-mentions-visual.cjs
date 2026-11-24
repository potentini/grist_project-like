const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const fixture=require('./mentions-fixture.cjs');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8771';
async function audit(p){return p.evaluate(()=>{
 const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number),blend=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));
 const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 const failures=[];
 for(const el of document.querySelectorAll('.meeting-mentions button,.meeting-mentions label,.mention-menu button,.mention-menu small,.preview-banner')){
  const s=getComputedStyle(el),r=el.getBoundingClientRect();if(!r.width||!r.height||s.visibility==='hidden'||el.closest(':disabled')||!el.textContent.trim())continue;
  const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);let bg=[255,255,255];for(const p of chain)bg=blend(rgb(getComputedStyle(p).backgroundColor),bg);
  const fg=blend(rgb(s.webkitTextFillColor||s.color),bg),a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  if(ratio<4.49)failures.push({text:el.textContent.slice(0,45),ratio});
 }
 return {failures,width:document.documentElement.scrollWidth,viewport:innerWidth};
})}
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 if(process.env.MENTIONS_SCREENSHOT_DIR)fs.mkdirSync(process.env.MENTIONS_SCREENSHOT_DIR,{recursive:true});
 for(const width of [1440,768,390])for(const colorScheme of ['light','dark']){
  const c=await b.newContext({viewport:{width,height:1000},screen:{width,height:1000},hasTouch:width<1000,isMobile:width<1000,colorScheme});const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await p.addInitScript(fixture.setup,fixture.make(true));await p.goto(origin+'/');await p.locator('#list > *').first().waitFor();
  if(width===390){await p.locator('#phoneNav summary').tap();await p.locator('#phoneNav [data-view=notes]').tap()}else await p.locator('nav [data-view=notes]').click();
  await p.locator('#list [data-kind=notes][data-id="1"]').click();await p.locator('#editionButton').click();await p.locator('#detail [data-edit]').click();
  await p.locator('#editForm [name=Contenu]').fill('Le calendrier doit être confirmé. @hceres');await p.locator('.mention-menu').waitFor();
  const box=await p.locator('.mention-menu').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.ok(box.y>=0&&box.y+box.height<=1001);
  let result=await audit(p);assert.deepEqual(result.failures,[],JSON.stringify(result));assert.ok(result.width<=result.viewport);
  if(process.env.MENTIONS_SCREENSHOT_DIR)await p.screenshot({path:process.env.MENTIONS_SCREENSHOT_DIR+`/menu-${width}-${colorScheme}.png`});
  await p.locator('.mention-menu').getByRole('option',{name:/Tâches — Confirmer/}).click();
  assert.equal(await p.locator('#editForm [name=Contenu]').evaluate(e=>e===document.activeElement&&e.selectionStart===e.value.length),true);
  await p.getByRole('button',{name:'Transformer le paragraphe en point'}).click();
  await p.getByRole('button',{name:'Créer le point (brouillon)',exact:true}).click();
  const block=p.locator('.mention-block').last();assert.equal(await block.locator('[data-block-field=content]').evaluate(e=>e===document.activeElement&&e.selectionStart===e.value.length),true);
  await block.getByRole('button',{name:'@ Ajouter un rattachement',exact:true}).click();await block.locator('[data-block-field=content]').pressSequentially('externe');await p.locator('.mention-menu').getByRole('option',{name:/Tâches — Tâche externe/}).click();
  assert.equal(await block.locator('[data-block-field=content]').evaluate(e=>e===document.activeElement),true);
  await block.scrollIntoViewIfNeeded();result=await audit(p);assert.deepEqual(result.failures,[],JSON.stringify(result));assert.ok(result.width<=result.viewport);
  if(process.env.MENTIONS_SCREENSHOT_DIR)await p.screenshot({path:process.env.MENTIONS_SCREENSHOT_DIR+`/block-${width}-${colorScheme}.png`});
  assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS bounded suggestion menus, focus/caret continuity, block layout and explicit light/dark contrast at desktop/tablet/phone widths');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
