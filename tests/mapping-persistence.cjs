const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fixture=require('../demo.json');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://docs.getgrist.com/**',r=>r.fulfill({body:''}));
 await page.addInitScript(require('./renamed-fixture.cjs'),fixture);
 await page.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:8769')+'/');
 await page.locator('#list > *').first().waitFor();
 const staleOptions=await page.evaluate(()=>optionsSnapshot());
 await page.evaluate(()=>renameNotes('Sujets'));
 await page.locator('#refresh').click();await page.locator('#mappingButton').click();
 assert.equal(await page.locator('[data-map=notes][data-field=table]').inputValue(),'Sujets');
 await page.locator('[data-map=notes][data-field=Type]').selectOption('');
 await page.locator('[data-map=notes][data-field=Instance]').selectOption('Type');
 await page.locator('[data-map=notes][data-field=Date]').selectOption('');
 await page.locator('[data-kind-label=notes]').evaluate(e=>{e.value='Réunions personnalisées'});
 // The SDK echoes the persisted pre-rename mapping when another option changes.
 await page.evaluate(()=>grist.setOption('unrelatedOption',{value:1}));
 assert.equal(await page.locator('[data-map=notes][data-field=Date]').inputValue(),'','options echo must preserve unsaved blank');
 assert.equal(await page.locator('[data-map=notes][data-field=Instance]').inputValue(),'Type');
 assert.equal(await page.locator('[data-kind-label=notes]').inputValue(),'Réunions personnalisées');
 await page.evaluate(()=>window.optionWriteDelays={projectWorkspaceMappingV1:50,workspacePaneLayoutV1:80});
 await page.locator('#applyMapping').click();
 await page.locator('#paneSeparator').focus();await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('#mapping').hidden);
 let saved=await page.evaluate(()=>grist.getOption('projectWorkspaceMappingV1'));
 assert.equal(saved.notes.table,'Sujets');assert.equal(saved.notes.fields.Date,'');assert.equal(saved.notes.fields.Type,'');assert.equal(saved.notes.fields.Instance,'Type');
 assert.equal(saved.notes.label,'Réunions personnalisées');
 assert.ok(await page.evaluate(()=>grist.getOption('workspacePaneLayoutV1')));
 // A late notification from before this save cannot restore the old mapping.
 await page.evaluate(snapshot=>emitOptions(snapshot),staleOptions);
 await page.locator('#mappingButton').click();
 assert.equal(await page.locator('[data-map=notes][data-field=Instance]').inputValue(),'Type');
 await page.locator('#mappingButton').click();
 await page.addInitScript(()=>{const subscribe=grist.onOptions;grist.onOptions=callback=>subscribe(opts=>setTimeout(()=>callback(structuredClone(opts)),200));});
 await page.reload();await page.locator('#list > *').first().waitFor();
 await page.locator('#mappingButton').click();
 assert.equal(await page.locator('[data-map=notes][data-field=table]').inputValue(),'Sujets');
 assert.equal(await page.locator('[data-map=notes][data-field=Date]').inputValue(),'');
 assert.equal(await page.locator('[data-map=notes][data-field=Instance]').inputValue(),'Type');
 assert.equal(await page.locator('[data-kind-label=notes]').inputValue(),'Réunions personnalisées');
 assert.deepEqual(errors,[]);
 console.log('PASS meeting mapping persists through rename, config echoes, stale notifications, concurrent layout save, delayed startup, pending labels, intentional blanks, reopen and reload');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
