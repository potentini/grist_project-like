const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('./timeline-fixture.cjs');
async function audit(page){
 return page.evaluate(()=>{
  const rgba=s=>(s.match(/[\d.]+/g)||[]).map(Number);
  const blend=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  const failures=[];let checked=0;
  for(const e of document.querySelectorAll('body *')){
   const s=getComputedStyle(e),r=e.getBoundingClientRect();
   if(!r.width||!r.height||s.visibility==='hidden'||+s.opacity===0||e.closest(':disabled')||!e.textContent.trim())continue;
   if(e.tagName!=='BUTTON'&&(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||rgba(s.backgroundColor)[3]===0))continue;
   let bg=[255,255,255];const chain=[];for(let p=e;p;p=p.parentElement)chain.unshift(p);
   for(const p of chain)bg=blend(rgba(getComputedStyle(p).backgroundColor),bg);
   const fg=blend(rgba(s.webkitTextFillColor||s.color),bg),a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   checked++;if(ratio<(e.tagName==='BUTTON'?4.5:3)-.01)failures.push({tag:e.tagName,id:e.id,cls:e.className,text:e.textContent.trim().slice(0,55),ratio:+ratio.toFixed(2),fg,bg});
  }
  return {checked,failures};
 });
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const colorScheme of ['light','dark']){
   const page=await browser.newPage({viewport:{width:1400,height:1000},colorScheme});
   await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
   await page.goto('http://127.0.0.1:8766/?demo=1');
   await page.locator('#list > *').first().waitFor();
   let result=await audit(page);assert.deepEqual(result.failures,[],JSON.stringify(result));
   const ids=await page.locator('dialog').evaluateAll(es=>es.map(e=>e.id));
   for(const id of ids){
    await page.locator('#'+id).evaluate(e=>e.showModal());
    result=await audit(page);assert.deepEqual(result.failures,[],`${colorScheme} ${id}: ${JSON.stringify(result)}`);
    await page.locator('#'+id).evaluate(e=>e.close());
   }
   await page.close();
   for(const url of ['http://127.0.0.1:8766/timeline.html','http://127.0.0.1:8767/']){
    const p=await browser.newPage({viewport:{width:1400,height:1000},colorScheme});
    await p.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));await p.addInitScript(fixture);
    await p.addInitScript(()=>{window.db.Projets[0].DateDebut='2026-01-01';window.db.Projets[0].DateFin='2026-12-31'});
    await p.goto(url);await p.locator('.hierarchy-table').waitFor();
    await p.locator('tr[data-node-id="L1:src:Projets:1"] td').first().click();
    for(const color of ['level','status','responsible']){
     await p.locator('#colorFieldSelect').selectOption(color);
     result=await audit(p);assert.deepEqual(result.failures,[],`${url} ${colorScheme}: ${JSON.stringify(result)}`);
    }
    await p.locator('#toggleDateEditBtn').click();
    const bar=p.locator('.gantt-bar').first();await bar.hover();
    await p.locator('#tooltip.visible').waitFor();
    result=await audit(p);assert.deepEqual(result.failures,[],JSON.stringify(result));
    await p.locator('#tooltip [data-field=name]').click();
    result=await audit(p);assert.deepEqual(result.failures,[],JSON.stringify(result));
    await p.close();
   }
  }
  console.log('PASS contrast audit of visible buttons and text on own backgrounds, all workspace dialogs, both timelines, colored bars and hover editor, in light and dark system themes');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
