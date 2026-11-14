const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fixture = require("./timeline-fixture.cjs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [1100, 390])
      for (const url of [
        "http://127.0.0.1:8766/timeline.html",
        "http://127.0.0.1:8767/",
      ]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          hasTouch: true,
        });
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.route("https://docs.getgrist.com/**", (r) =>
          r.fulfill({ body: "" }),
        );
        await page.addInitScript(fixture);
        await page.addInitScript(() => {
          window.db.Taches[0].DateDebut = "2026-12-10";
          if (location.search.includes("formula=1"))
            window.timelineMeta.find(
              (column) =>
                column.table === "Taches" && column.colId === "DateFin",
            ).isFormula = true;
        });
        await page.goto(url);
        await page.locator(".hierarchy-table").waitFor();
        await page.evaluate(() => {
          window.dateSaves = 0;
          new MutationObserver((records) => {
            for (const r of records)
              for (const node of r.addedNodes)
                if (
                  node.textContent === "Dates mises à jour dans la table source"
                )
                  window.dateSaves++;
          }).observe(document.querySelector("#toastContainer"), {
            childList: true,
          });
        });
        const root = page
          .locator('tr[data-node-id="L1:src:Projets:1"] td')
          .first();
        const bar = page.locator('.gantt-bar[data-node-id="L3:src:Taches:1"]');
        const prepare = async () => {
          await root.click();
          await page.locator("[data-zoom=all]").click();
          if (
            (await page.locator("#expandAllBtn").innerText()).includes(
              "déplier",
            )
          )
            await page.locator("#expandAllBtn").click();
          await bar.waitFor();
          await bar.scrollIntoViewIfNeeded();
        };
        await prepare();
        const cdp = await context.newCDPSession(page);
        const gesture = async (locator, dx, { cancel = false } = {}) => {
          await locator.scrollIntoViewIfNeeded();
          const r = await locator.boundingBox(),
            x = r.x + r.width / 2,
            y = r.y + r.height / 2;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y, id: 1 }],
          });
          for (let i = 1; i <= 6; i++)
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ x: x + (dx * i) / 6, y, id: 1 }],
            });
          await cdp.send("Input.dispatchTouchEvent", {
            type: cancel ? "touchCancel" : "touchEnd",
            touchPoints: [],
          });
        };
        await gesture(bar, 40);
        assert.equal(await page.evaluate(() => window.writes.length), 0);
        await prepare();
        await page.locator("#toggleDateEditBtn").click();
        const before = await page.evaluate(() => ({ ...window.db.Taches[0] }));
        await bar.tap();
        assert.match(await bar.getAttribute("class"), /selected/);
        assert.equal(await page.evaluate(() => window.writes.length), 0);
        await prepare();
        await gesture(bar, 40);
        await page.waitForFunction(
          () => window.writes.length === 1 && window.dateSaves === 1,
        );
        const moved = await page.evaluate(() => ({ ...window.db.Taches[0] }));
        assert.notEqual(moved.DateDebut, before.DateDebut);
        assert.equal(
          Date.parse(moved.DateFin) - Date.parse(moved.DateDebut),
          Date.parse(before.DateFin) - Date.parse(before.DateDebut),
        );
        await prepare();
        const oldStart = moved.DateDebut,
          oldEnd = moved.DateFin;
        await gesture(bar.locator("[data-date-edge=end]"), 35);
        await page.waitForFunction(
          () => window.writes.length === 2 && window.dateSaves === 2,
        );
        assert.equal(
          await page.evaluate(() => window.db.Taches[0].DateDebut),
          oldStart,
        );
        assert.notEqual(
          await page.evaluate(() => window.db.Taches[0].DateFin),
          oldEnd,
        );
        const write = await page.evaluate(() => window.writes[1][3]);
        assert.equal(Object.hasOwn(write, "DateDebut"), false);
        await prepare();
        await gesture(bar.locator("[data-date-edge=start]"), 20);
        await page.waitForFunction(
          () => window.writes.length === 3 && window.dateSaves === 3,
        );
        assert.equal(
          Object.hasOwn(
            await page.evaluate(() => window.writes[2][3]),
            "DateFin",
          ),
          false,
        );
        await prepare();
        const beforeCancel = await page.evaluate(() =>
          JSON.stringify(window.db.Taches[0]),
        );
        await gesture(bar, 40, { cancel: true });
        assert.equal(await page.evaluate(() => window.writes.length), 3);
        assert.equal(
          await page.evaluate(() => JSON.stringify(window.db.Taches[0])),
          beforeCancel,
        );
        await prepare();
        const rect = await bar.boundingBox();
        await page.mouse.move(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          rect.x + rect.width / 2 - 35,
          rect.y + rect.height / 2,
          { steps: 5 },
        );
        await page.mouse.up();
        await page.waitForFunction(
          () => window.writes.length === 4 && window.dateSaves === 4,
        );
        await prepare();
        const milestone = page.locator(
          '.gantt-milestone[data-node-id="L3:src:Taches:2"]',
        );
        await milestone.waitFor();
        const oldMilestone = await page.evaluate(
          () => window.db.Taches[1].DateFin,
        );
        await gesture(milestone, 40);
        await page.waitForFunction(
          () => window.writes.length === 5 && window.dateSaves === 5,
        );
        assert.notEqual(
          await page.evaluate(() => window.db.Taches[1].DateFin),
          oldMilestone,
        );
        await page.locator("#toggleDateEditBtn").click();
        await gesture(bar, 40);
        assert.equal(await page.evaluate(() => window.writes.length), 5);
        await page.goto(url + "?formula=1");
        await page.locator(".hierarchy-table").waitFor();
        await prepare();
        await page.locator("#toggleDateEditBtn").click();
        assert.equal(
          await bar.locator("[data-date-edge=end]").isVisible(),
          false,
        );
        await gesture(bar, 40);
        assert.equal(await page.evaluate(() => window.writes.length), 0);
        await prepare();
        await gesture(bar.locator("[data-date-edge=start]"), 20);
        await page.waitForFunction(() => window.writes.length === 1);
        assert.equal(
          Object.hasOwn(
            await page.evaluate(() => window.writes[0][3]),
            "DateFin",
          ),
          false,
        );
        assert.deepEqual(errors, []);
        await context.close();
      }
    console.log(
      "PASS real touch drag/resize/milestone, mouse compatibility, tap/cancel without writes and edit-mode gating in both repositories",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
