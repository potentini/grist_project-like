const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1200 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://docs.getgrist.com/**", (r) =>
      r.fulfill({ body: "" }),
    );
    await page.addInitScript(require("./timeline-fixture.cjs"));
    const tracking = "http://127.0.0.1:8766/";
    await page.goto(tracking);
    await page.locator("#list [data-kind=projects]").first().waitFor();
    const roots = () =>
      page
        .locator("#list > .tree-node")
        .evaluateAll((rows) => rows.map((r) => Number(r.dataset.treeId)));
    assert.deepEqual(await roots(), [2, 1]);
    await page.locator("#list [data-fold-all=open]").click();
    const trackingTasks = () =>
      page
        .locator("#list [data-tree-kind=tasks]")
        .evaluateAll((rows) => rows.map((r) => Number(r.dataset.treeId)));
    assert.deepEqual(await trackingTasks(), [2, 1, 3]);
    assert.deepEqual(
      await page
        .locator("#list [data-tree-kind=streams]")
        .evaluateAll((rows) => rows.map((r) => Number(r.dataset.treeId))),
      [2, 1],
    );
    await page.locator("#hierarchySortSettings summary").click();
    await page.locator("#trackingChildSort").selectOption("priority");
    assert.deepEqual(await trackingTasks(), [2, 3, 1]);
    await page.locator("#trackingChildSort").selectOption("manual");
    assert.deepEqual(await trackingTasks(), [1, 2, 3]);
    await page.locator("#trackingChildSort").selectOption("end");
    await page.goto(tracking + "timeline.html");
    await page.locator(".hierarchy-table").waitFor();
    if (
      (await page.locator("#tableExpandAllBtn").innerText()).includes("déplier")
    )
      await page.locator("#tableExpandAllBtn").click();
    const timelineTasks = () =>
      page
        .locator('tr[data-node-id^="L3:src:Taches:"]')
        .evaluateAll((rows) =>
          rows.map((r) => Number(r.dataset.nodeId.split(":").pop())),
        );
    assert.deepEqual(await timelineTasks(), [2, 1, 3]);
    await page.locator("#timelineDateSortSelect").selectOption("manual");
    assert.deepEqual(await timelineTasks(), [1, 2, 3]);
    await page.goto(tracking);
    await page.locator("#list [data-kind=projects]").first().waitFor();
    await page.locator("#list [data-fold-all=open]").click();
    assert.deepEqual(await trackingTasks(), [1, 2, 3]);
    await page.locator('#list [data-kind=tasks][data-id="1"]').click();
    await page.locator("#editionButton").click();
    await page.locator("[data-project-timeline]").click();
    const popup = page.frameLocator("#timelineFrame");
    await popup.locator("#timelineDateSortSelect").waitFor();
    await popup.locator("#timelineDateSortSelect").selectOption("end");
    await page.locator("#timelineClose").click();
    assert.equal(await page.locator("#trackingChildSort").inputValue(), "end");
    assert.deepEqual(await trackingTasks(), [2, 1, 3]);
    // The same source and controls in the original dual-widget repository.
    await page.goto("http://127.0.0.1:8767/");
    await page.locator(".hierarchy-table").waitFor();
    if (
      (await page.locator("#tableExpandAllBtn").innerText()).includes("déplier")
    )
      await page.locator("#tableExpandAllBtn").click();
    assert.deepEqual(await timelineTasks(), [2, 1, 3]);
    await page.locator("#timelineDateSortSelect").selectOption("priority");
    assert.deepEqual(await timelineTasks(), [2, 3, 1]);
    await page.locator("#tableToggleEditBtn").click();
    const progress = page.locator(
      'tr[data-node-id="L3:src:Taches:1"] [data-field=progress]',
    );
    assert.equal(await progress.inputValue(), "10");
    await progress.fill("35");
    await progress.dispatchEvent("change");
    await page.waitForFunction(() => window.db.Taches[0].Avancement === 0.35);
    await page.emulateMedia({ colorScheme: "dark" });
    assert.deepEqual(
      await progress.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.color, s.backgroundColor];
      }),
      ["rgb(35, 51, 74)", "rgb(255, 255, 255)"],
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS shared hierarchical ordering, parent date fallback, undated last, priority/manual, persisted tracking/timeline/popup settings and original-repo editing",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
