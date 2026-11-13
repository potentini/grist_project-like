const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.route("https://docs.getgrist.com/**", (r) =>
      r.fulfill({ body: "" }),
    );
    await page.goto("http://127.0.0.1:8766/?demo=1");
    const folds = page.locator("#list [data-fold]");
    await folds.first().waitFor();
    assert.ok((await folds.count()) > 1);
    assert.ok(
      (
        await folds.evaluateAll((items) =>
          items.map((item) => item.getAttribute("aria-expanded")),
        )
      ).every((value) => value === "false"),
    );
    await folds.first().click();
    assert.equal(await folds.first().getAttribute("aria-expanded"), "true");
    await page.locator("#search").fill("");
    assert.equal(await folds.first().getAttribute("aria-expanded"), "true");
    await page.locator("#list [data-fold-all=open]").click();
    assert.ok(
      (
        await folds.evaluateAll((items) =>
          items.map((item) => item.getAttribute("aria-expanded")),
        )
      ).every((value) => value === "true"),
    );
    await page.locator("nav [data-view=notes]").click();
    assert.ok(
      (
        await folds.evaluateAll((items) =>
          items.map((item) => item.getAttribute("aria-expanded")),
        )
      ).every((value) => value === "false"),
    );
    await page.reload();
    await folds.first().waitFor();
    assert.ok(
      (
        await folds.evaluateAll((items) =>
          items.map((item) => item.getAttribute("aria-expanded")),
        )
      ).every((value) => value === "false"),
    );
    console.log(
      "PASS initially folded left levels, manual expansion, expand all and reset on reload",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
