const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fixture = require('./timeline-fixture.cjs');
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    for (const width of [1280,800,390]) for (const url of ['http://127.0.0.1:8766/timeline.html','http://127.0.0.1:8767/']) {
      const context = await browser.newContext({viewport:{width,height:1000},colorScheme:'dark'});
      const page = await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
      await page.addInitScript(fixture);
      await page.addInitScript(() => {
        Object.assign(window.db.Projets[0],{DateDebut:'2000-01-01',DateFin:'2000-12-31'});
        for (const table of ['Chantiers','Taches']) for (const row of window.db[table]) {
          for (const key of ['DateDebut','DateFin']) if(row[key]) row[key]=row[key].replace('2026','2000');
        }
        // An old saved zoom must migrate to the new default without losing other settings.
        localStorage.setItem('grist_gantt_dual_state_v1',JSON.stringify({zoomMode:'year',labelsVisible:false,visibleStart:'1990-01-01',visibleEnd:'1992-12-31'}));
      });
      await page.goto(url);
      await page.locator('.hierarchy-table').waitFor();
      assert.equal(await page.locator('.zoom-controls .active').getAttribute('data-zoom'),'all');
      await page.locator('tr[data-node-id="L1:src:Projets:1"] td').first().click();
      assert.match(await page.locator('#currentPeriod').innerText(),/13 déc. 1999.*19 janv. 2001/);
      for (const [mode,span] of [['day',7],['week',28],['month',91],['year',365],['all',404]]) {
        await page.locator(`[data-zoom=${mode}]`).click();
        await page.locator('#todayBtn').click();
        const s = await page.evaluate(()=>grist.getOption('uiState'));
        const days = Math.round((Date.parse(s.visibleEnd)-Date.parse(s.visibleStart))/86400000)+1;
        assert.equal(days,span,`${mode}: complete announced interval`);
        if(mode!=='all') {
          const today=await page.evaluate(()=>new Date().toLocaleDateString('en-CA'));
          const before=(Date.parse(today)-Date.parse(s.visibleStart))/86400000;
          assert.equal(before,Math.floor(span*.25),`${mode}: today at quarter, even with historical data`);
          await page.locator('#nextBtn').click();
          const shifted=await page.evaluate(()=>grist.getOption('uiState'));
          assert.notEqual(shifted.visibleStart,s.visibleStart);
          await page.locator('#todayBtn').click();
          assert.equal((await page.evaluate(()=>grist.getOption('uiState'))).visibleStart,s.visibleStart);
        }
        const geometry = await page.evaluate(()=>{
          const box=s=>document.querySelector(s).getBoundingClientRect();
          const grid=box('#timelineGrid'),body=box('#timelineBody'),header=box('#timelineHeader');
          const rows=[...document.querySelectorAll('#timelineHeader > div')].filter(e=>getComputedStyle(e).display!=='none');
          const last=rows.at(-1)?.lastElementChild?.getBoundingClientRect();
          const nav=['#prevBtn','#todayBtn','#nextBtn'].map(s=>box(s));
          return {grid:grid.width,body:body.width,right:grid.right,viewport:innerWidth,header:header.right,last:last?.right,nav:nav.map(r=>({top:r.top,right:r.right,left:r.left}))};
        });
        assert.ok(Math.abs(geometry.grid-geometry.body)<1,JSON.stringify(geometry));
        assert.ok(geometry.right<=width+1,JSON.stringify(geometry));
        assert.ok(geometry.last<=geometry.header+1,JSON.stringify(geometry));
        assert.ok(geometry.nav.every(r=>r.top===geometry.nav[0].top),'navigation stays on one line');
        assert.ok(geometry.nav[0].right<=geometry.nav[1].left && geometry.nav[1].right<=geometry.nav[2].left);
      }
      await page.locator('[data-zoom=year]').click();
      await page.reload();
      await page.locator('.hierarchy-table').waitFor();
      assert.equal(await page.locator('.zoom-controls .active').getAttribute('data-zoom'),'year');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    // Native dialog buttons must remain dark on white in both system themes.
    const page=await browser.newPage();
    await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
    await page.goto('http://127.0.0.1:8766/?demo=1');
    for(const colorScheme of ['light','dark']) {
      await page.emulateMedia({colorScheme});
      const style=await page.locator('#timelineClose').evaluate(e=>{const s=getComputedStyle(e);return [s.color,s.backgroundColor,s.webkitTextFillColor]});
      assert.deepEqual(style,['rgb(35, 51, 74)','rgb(255, 255, 255)','rgb(35, 51, 74)']);
    }
    console.log('PASS full-width zooms at 3 viewport sizes in both repositories, legacy migration/default All with 5% margins, quarter-position Today, grouped navigation, dark/light close button');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
