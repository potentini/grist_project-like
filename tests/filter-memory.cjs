const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const setupGrist = require("./renamed-fixture.cjs");

const model = structuredClone(require("../demo.json"));
Object.assign(model.data.projects[0], { Responsable: "Camille", Statut: "En cours" });

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    for (const width of [1440, 768, 390]) {
      const phone = width === 390;
      const page = await browser.newPage({
        viewport: { width, height: 950 },
        screen: { width, height: 950 },
        hasTouch: width < 1000,
        isMobile: phone,
      });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://docs.getgrist.com/**", route => route.fulfill({ body: "" }));
      await page.addInitScript(setupGrist, model);
      await page.goto(process.env.TEST_ORIGIN || "http://127.0.0.1:8766/");
      await page.locator("#list > *").first().waitFor();

      async function view(name) {
        if (phone) {
          await page.locator("#phoneNav summary").tap();
          await page.locator(`#phoneNav [data-view=${name}]`).tap();
          if (!(await page.locator("#projectFilterLabel").isVisible())) {
            await page.locator("#phoneFilters").tap();
          }
        } else {
          await page.locator(`header > nav [data-view=${name}]`).click();
        }
      }
      function input(id) {
        return page.locator(`#${id}`).locator("..").locator(".quick-search");
      }
      async function choose(id, label) {
        const control = input(id);
        await control.fill(label);
        const option = control.locator("..").getByRole("option", { name: "☐ " + label, exact: true });
        if (phone) await option.tap(); else await option.click();
        await control.press("Escape");
      }

      const reset = page.getByRole("button", { name: "Effacer les filtres", exact: true });
      assert.equal(await reset.isDisabled(), true);
      if (phone) {
        assert.equal(await page.locator("#phoneFilters + #resetFilters").count(), 1);
      }
      await view("projects");
      await choose("ownerFilter", "Camille");
      await choose("statusFilter", "En cours");
      await choose("projectFilter", model.data.projects[0].Titre);
      await choose("projectFilter", model.data.projects[1].Titre);

      await view("actions");
      assert.equal(await input("ownerFilter").inputValue(), "Tous");
      await choose("ownerFilter", "Alice");
      await page.locator("#search").fill("invitations");
      await page.locator("#overdue").check();
      await page.locator("#advancedFilters > summary").click();
      await page.locator("#advancedKind").selectOption("actions");
      await page.locator("#advancedField").selectOption("Titre");
      await page.locator("#advancedValue").fill("invitations");
      await page.locator("#advancedAdd").click();
      await page.waitForFunction(async () => {
        const saved = await grist.getOption("workspaceAdvancedFiltersV1");
        return saved?.rules.length === 1 && saved.basic?.search === "invitations" &&
          saved.basic.projectFilter.length === 2 && saved.basic.flags.overdue;
      });

      await page.reload();
      await page.locator("#list > *").first().waitFor();
      await view("projects");
      assert.equal(await input("ownerFilter").inputValue(), "Camille");
      assert.equal(await input("statusFilter").inputValue(), "En cours");
      assert.equal(await page.locator("#projectFilter").inputValue(), "__multiple__");
      await view("actions");
      assert.equal(await input("ownerFilter").inputValue(), "Alice");
      assert.equal(await page.locator("#search").inputValue(), "invitations");
      assert.equal(await page.locator("#overdue").isChecked(), true);
      assert.equal(await page.locator("[data-remove-filter]").count(), 1);

      await reset.click();
      assert.equal(await reset.isDisabled(), true);
      assert.equal(await input("ownerFilter").inputValue(), "Tous");
      assert.equal(await input("projectFilter").inputValue(), "Tous");
      assert.equal(await page.locator("#search").inputValue(), "");
      assert.equal(await page.locator("#overdue").isChecked(), false);
      assert.equal(await page.locator("[data-remove-filter]").count(), 0);
      await page.waitForFunction(async () => {
        const saved = await grist.getOption("workspaceAdvancedFiltersV1");
        return saved?.rules.length === 0 && saved.basic.projectFilter.length === 0 &&
          saved.basic.byView.actions.ownerFilter.length === 0;
      });
      await page.reload();
      await page.locator("#list > *").first().waitFor();
      await view("actions");
      assert.equal(await reset.isDisabled(), true);
      await view("projects");
      assert.equal(await input("ownerFilter").inputValue(), "Camille");
      assert.equal(await input("projectFilter").inputValue(), "Tous");
      assert.equal(await page.evaluate(() => writes.length), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS active filters survive reload, owner/status stay per view, clear resets current filters in Grist on desktop/tablet/mobile");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
