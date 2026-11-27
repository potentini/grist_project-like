const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fixture = require("./mentions-fixture.cjs");

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    for (const width of [1440, 768, 390]) {
      const phone = width === 390;
      const model = fixture.make(true);
      model.data.notes = [
        { id: 1, Titre: "Réunion commune", Projet: 1, Chantiers: ["L", 1, 2] },
        { id: 2, Titre: "Réunion du premier projet", Projet: 1 },
        { id: 3, Titre: "Réunion autonome" },
      ];
      model.data.points = [];
      model.meta.find(column => column.table === "Actions" && column.colId === "Projet").type = "RefList:Projets";
      model.data.actions = [
        { id: 1, Titre: "Action commune", Projet: ["L", 1, 2] },
        { id: 2, Titre: "Action du premier projet", Projet: ["L", 1] },
        { id: 3, Titre: "Action autonome", Projet: ["L"] },
      ];

      const page = await browser.newPage({
        viewport: { width, height: 900 },
        screen: { width, height: 900 },
        hasTouch: width < 1000,
        isMobile: phone,
      });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://docs.getgrist.com/**", route => route.fulfill({ body: "" }));
      await page.addInitScript(fixture.setup, model);
      await page.goto(process.env.TEST_ORIGIN || "http://127.0.0.1:8766/");
      await page.locator("#list > *").first().waitFor();

      const picker = page.locator("#projectFilter").locator("..").locator(".quick-picker");
      const search = picker.locator(".quick-search");
      const choose = async (name) => {
        const option = picker.getByRole("option", { name, exact: true });
        if (phone) await option.tap(); else await option.click();
        await search.press("Escape");
      };
      const rows = kind => page.locator(`#list [data-kind=${kind}]`).evaluateAll(
        elements => [...new Set(elements.map(element => Number(element.dataset.id)))].sort(),
      );

      for (const [view, kind] of [["actions", "actions"], ["notes", "notes"]]) {
        if (phone) {
          await page.locator("#phoneNav summary").tap();
          await page.locator(`#phoneNav [data-view=${view}]`).tap();
          if (!(await search.isVisible())) await page.locator("#phoneFilters").tap();
        } else {
          await page.locator(`header > nav [data-view=${view}]`).click();
        }
        assert.deepEqual(await rows(kind), [1, 2, 3]);
        for (const editing of [false, true]) {
          assert.equal(await page.locator("#editionButton").getAttribute("aria-pressed"), String(editing));
          await search.fill("Projet externe");
          await choose("☐ Projet externe");
          assert.deepEqual(await rows(kind), [1], `${view}: project 2, editing=${editing}, width=${width}`);
          if (view === "actions" && !phone)
            assert.equal(await page.locator('#list [data-kind=projects][data-id="1"]').count(), 0);
          await search.click();
          await choose("☐ Tous");
          assert.deepEqual(await rows(kind), [1, 2, 3]);
          await page.locator("#editionButton").click();
        }
      }
      assert.equal(await page.evaluate(() => writes.length), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS project filter for shared meetings and actions in read/edit mode on desktop/tablet/phone");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
