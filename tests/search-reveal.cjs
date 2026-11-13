const { chromium } = require("playwright");
const assert = require("node:assert/strict");
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
    console.log(
      "PASS search reveals folded descendants, preserves manual folding after clearing, and hides unmatched rows in edit mode on desktop/phone",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
