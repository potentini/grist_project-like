const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const gristFixture = require("./mentions-fixture.cjs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext(
        mobile
          ? {
              viewport: { width: 390, height: 844 },
              screen: { width: 390, height: 844 },
              hasTouch: true,
              isMobile: true,
            }
          : {},
      );
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("https://docs.getgrist.com/**", (r) =>
        r.fulfill({ body: "" }),
      );
      await page.goto("http://127.0.0.1:8766/?demo=1");
      await page.locator("#list > *").first().waitFor();
      if (mobile) {
        await page.locator("#phoneNav summary").click();
        await page.locator("#phoneNav [data-view=projects]").click();
      }
      const task = page.locator('#list [data-kind=tasks][data-id="1"]');
      assert.equal(await task.isVisible(), false);
      await page.locator("#search").fill("CONFIRMER");
      assert.equal(await task.isVisible(), true);
      const fold = page.locator("#list [data-fold]").first();
      await fold.click();
      assert.equal(await task.isVisible(), false);
      await fold.click();
      assert.equal(await task.isVisible(), true);
      await page.locator("#search").fill("");
      assert.equal(await task.isVisible(), false);
      await page.locator("#list [data-fold-all=open]").click();
      assert.equal(await task.isVisible(), true);
      await page.locator("#search").fill("introuvable-xyz");
      assert.equal(await page.locator("#list [data-kind]").count(), 0);
      await page.locator("#search").fill("");
      assert.equal(await task.isVisible(), true);
      await page.locator("#editionButton").click();
      await page.locator("#search").fill("introuvable-xyz");
      assert.equal(await page.locator("#list [data-kind]").count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("https://docs.getgrist.com/**", route => route.fulfill({ body: "" }));
    const model = gristFixture.make(true);
    model.data.tasks[0].Titre = "Vérification initiale";
    await page.addInitScript(gristFixture.setup, model);
    await page.goto("http://127.0.0.1:8766/");
    await page.locator('#list [data-kind=projects][data-id="1"]').click();
    await page.locator("#detail h2").evaluate(heading => { heading.dataset.searchTest = "original"; });
    const search = page.locator("#search");
    await search.fill("verification");
    const task = page.locator('#list [data-kind=tasks][data-id="1"]');
    assert.equal(await task.isVisible(), true);
    assert.equal(await page.locator("#detail h2").getAttribute("data-search-test"), "original");
    await page.evaluate(() => Object.assign(testDb.data.tasks[0], {
      Titre: "Étude actualisée",
      Chantier: 2,
    }));
    await page.locator("#refresh").click();
    await task.waitFor({ state: "detached" });
    await search.fill("etude actualisee");
    await page.locator('#list [data-tree-kind=projects][data-tree-id="2"] [data-kind=tasks][data-id="1"]').waitFor();
    assert.equal(await page.locator('#list [data-kind=projects][data-id="1"]').count(), 0);
    await page.close();

    console.log(
      "PASS search reveal and folding, stable detail during typing, refreshed labels and relationships on desktop/phone",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
