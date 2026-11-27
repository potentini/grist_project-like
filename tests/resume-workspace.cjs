const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fixture = require("./mentions-fixture.cjs");

const model = fixture.make(true);
for (let id = 3; id <= 65; id++) {
  model.data.notes.push({ id, Titre: "Réunion de suivi " + id, Date: "2027-01-01", Projet: 1 });
}
model.data.notes[0].Contenu = Array.from({ length: 140 }, (_, index) => "Ligne " + (index + 1)).join("\n");

(async () => {
  const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:8766";
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    for (const width of [1440, 768, 390]) {
      const phone = width === 390;
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        screen: { width, height: 900 },
        hasTouch: width < 1000,
        isMobile: phone,
      });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://docs.getgrist.com/**", route => route.fulfill({ body: "" }));
      await page.route(`${origin}/grist-harness`, route => route.fulfill({
        contentType: "text/html",
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}iframe{display:block;border:0;width:100%;height:100dvh}</style><section id="table" hidden>Table Grist</section>',
      }));
      await page.addInitScript(fixture.setup, model);
      await page.goto(`${origin}/grist-harness`);
      const widget = page.frameLocator("#tracking");
      const mount = async (doc = "navigation") => {
        await page.evaluate(doc => {
          document.querySelector("#tracking")?.remove();
          document.querySelector("#table").hidden = true;
          const frame = document.createElement("iframe");
          frame.id = "tracking";
          frame.src = "/?doc=" + doc;
          document.body.append(frame);
        }, doc);
        await widget.locator("#list > *").first().waitFor({ state: "attached" });
        await widget.locator("body[data-current-view]").waitFor();
      };

      await mount();
      if (phone) {
        await widget.locator("#phoneNav summary").tap();
        await widget.locator("#phoneNav [data-view=notes]").tap();
      } else await widget.locator("header > nav [data-view=notes]").click();

      const list = widget.locator("#list");
      const detail = widget.locator("#detail");
      const meeting = list.locator('[data-tree-kind=notes][data-tree-id="1"]');
      const fold = meeting.locator(":scope > .tree-row > [data-fold]");
      await fold.click();
      assert.equal(await fold.getAttribute("aria-expanded"), "true");
      await meeting.locator('[data-kind=notes][data-id="1"]').click();
      const actions = detail.locator('details[data-section-key="section:notes:1:actions"]');
      // Close the section without scrolling the long notes out of view.
      await actions.locator("summary").evaluate(summary => summary.click());
      const leftBefore = phone ? null : await list.evaluate(el => { el.scrollTop = 260; return el.scrollTop; });
      assert.ok(phone || leftBefore > 0);
      const rightBefore = await detail.evaluate(el => { el.scrollTop = 410; return el.scrollTop; });
      assert.ok(rightBefore > 0);
      await widget.locator("body").evaluate(() => new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ));

      await page.evaluate(() => {
        document.querySelector("#tracking").remove();
        document.querySelector("#table").hidden = false;
      });
      await page.getByText("Table Grist").waitFor();
      await mount();
      assert.equal(await widget.locator("body").getAttribute("data-current-view"), "notes");
      assert.equal(await detail.locator("h2").innerText(), model.data.notes[0].Titre);
      assert.equal(await fold.getAttribute("aria-expanded"), "true");
      assert.equal(await actions.getAttribute("open"), null);
      assert.equal(await detail.evaluate(el => el.scrollTop), rightBefore);
      await detail.evaluate(() => {
        testDb.data.notes[0].Titre += " actualisée";
        window.dispatchEvent(new Event("focus"));
      });
      await detail.getByRole("heading", { name: model.data.notes[0].Titre + " actualisée", exact: true }).waitFor();
      assert.equal(await detail.evaluate(el => el.scrollTop), rightBefore);
      if (phone) {
        assert.equal(await widget.locator("#phoneBack").isVisible(), true);
        await widget.locator("#phoneBack").tap();
        assert.ok(await list.evaluate(el => el.scrollTop > 0), "returning to the list restores its scroll");
      } else {
        assert.equal(await list.evaluate(el => el.scrollTop), leftBefore);
      }

      await list.evaluate(() => {
        testDb.data.notes = testDb.data.notes.filter(note => note.id !== 1);
        persistDb();
      });
      await mount();
      assert.equal(await widget.locator("body").getAttribute("data-current-view"), "notes");
      assert.equal(await detail.locator("h2").innerText(), "Votre espace de suivi");

      await mount("other-document");
      assert.equal(await widget.locator("body").getAttribute("data-current-view"), phone ? "actions" : "projects");
      assert.equal(await detail.locator("h2").innerText(), "Votre espace de suivi");
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS remount after visiting a Grist table restores view, record, folds, scroll and mobile pane, with document isolation");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
