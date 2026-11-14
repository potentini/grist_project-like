const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('./timeline-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 for(const phone of [false,true])for(const colorScheme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:phone?390:1400,height:950},hasTouch:phone,isMobile:phone,colorScheme});
  await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await page.addInitScript(fixture);
  await page.goto('http://127.0.0.1:8766/');await page.locator('#list > *').first().waitFor();
  await page.locator('#editionButton').click();
  if(phone){await page.locator('#phoneNav').evaluate(e=>e.open=true);await page.locator('#phoneNav [data-view=projects]').click();}
  for(const [kind,id] of [['projects',1],['streams',1],['tasks',1]]){
   if(phone && await page.locator('#phoneBack').isVisible())await page.locator('#phoneBack').click();
   if(kind!=='projects'){
    await page.locator('#list [data-kind="'+(kind==='streams'?'projects':'streams')+'"][data-id="'+id+'"]').first().click();
   }
   const create=page.locator('[data-new="'+kind+'"]').first();
   // Project creation is on the list; lower levels can be created from their parent.
   if(await create.count()===0)throw Error('Missing create control '+kind);
   await create.click();await page.locator('#editor[open]').waitFor();
   // Reproduce a light surface inheriting a white WebKit text fill from its container.
   await page.locator('.editor-actions').evaluate(e=>{e.style.color='white';e.style.webkitTextFillColor='white'});
   for(const [id,fg]of [['cancel','rgb(35, 51, 74)'],['save','rgb(255, 255, 255)']]){
    const button=page.locator('#'+id);
    for(const state of ['normal','hover','focus']){
     if(state==='hover')await button.hover();if(state==='focus')await button.focus();
     const s=await button.evaluate(e=>{const s=getComputedStyle(e);return {color:s.color,fill:s.webkitTextFillColor,bg:s.backgroundColor}});
     assert.equal(s.color,fg);assert.equal(s.fill,fg);assert.notEqual(s.bg,fg);
    }
   }
   await page.locator('#cancel').click();await page.locator('#editor').waitFor({state:'hidden'});
   if(kind==='projects')await page.locator('#list [data-fold-all=open]').click();
  }
  await page.close();
 }
 console.log('PASS project/stream/task creation: explicit Save/Cancel contrast, white inherited text fill, normal/hover/focus, desktop/phone, light/dark');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
