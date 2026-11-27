const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fixture = require("./mentions-fixture.cjs");

function model() {
  const db = fixture.make(true);
  db.data.projects[0].Titre = "Zèbre";
  db.data.projects[1].Titre = "Alpha";
  const project = db.meta.find(column => column.table === "Actions" && column.colId === "Projet");
  project.type = "RefList:Projets";
  for (const field of ["Archive", "Transforme", "ResponsableDiPSi"]) {
    if (!db.meta.some(column => column.table === "Actions" && column.colId === field)) {
      db.meta.push({
        id: 3000 + db.meta.length, parentId: 5, table: "Actions", colId: field,
        label: field, type: field === "ResponsableDiPSi" ? "Text" : "Bool",
      });
    }
  }
  db.data.actions = [
    { id: 1, Titre: "Action partagée", Projet: ["L", 1, 2], Responsable: "Camille", DateFin: "2026-12-30", Statut: "En cours", Commentaire: "<img src=x> Préparer le bilan" },
    { id: 2, Titre: "Vérifier le support", Tache: 2, Responsable: "Sam", DateFin: "2026-01-01" },
    { id: 3, Titre: "Action du point", PointOrigine: 1, Responsable: "Camille" },
    { id: 4, Titre: "Action de la réunion", NoteOrigine: 2, ResponsableDiPSi: "Mina" },
    { id: 5, Titre: "Action autonome" },
    { id: 6, Titre: "Action archivée", Projet: ["L", 1], Archive: true },
    { id: 7, Titre: "Action transformée", Projet: ["L", 2], Transforme: true },
  ];
  return db;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    for (const width of [1440, 768, 390]) {
      const phone = width === 390;
      const ctx = await browser.newContext({
        viewport: { width, height: 900 }, screen: { width, height: 900 },
        hasTouch: width < 1000, isMobile: phone,
      });
      await ctx.route("https://docs.getgrist.com/**", route => route.fulfill({ body: "" }));
      await ctx.addInitScript(fixture.setup, model());
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(process.env.TEST_ORIGIN || "http://127.0.0.1:8766/");
      await page.locator("#list > *").first().waitFor();
      if (!phone) await page.locator('header nav [data-view="actions"]').click();
      await page.locator("#search").fill("hors du suivi");
      const trigger = page.locator("#list [data-action-followup]");
      await trigger.click();
      const dialog = page.locator("#actionFollowup");
      assert.equal(await dialog.isVisible(), true);
      const groups = dialog.locator("[data-followup-project]");
      assert.deepEqual(await groups.locator("h3").allTextContents(), ["Alpha", "Zèbre", "Sans projet"]);
      assert.deepEqual(await groups.first().locator("h4").allTextContents(), [
        "Action de la réunion", "Action partagée", "Vérifier le support",
      ]);
      assert.deepEqual(await groups.nth(1).locator("h4").allTextContents(), ["Action du point", "Action partagée"]);
      assert.equal(await dialog.locator('[data-followup-action="1"]').count(), 2);
      assert.equal(await dialog.getByRole("status").textContent(), "5 actions");
      assert.equal(await dialog.locator("img").count(), 0);
      assert.match(await dialog.locator(".followup-meta").filter({ hasText: "Camille" }).first().innerText(), /30\/12\/2026/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      async function choose(field, label) {
        const input = dialog.getByRole("combobox", { name: field, exact: true });
        await input.fill(label);
        const option = dialog.getByRole("option", { name: label, exact: true });
        if (phone) await option.tap(); else await option.click();
      }
      await choose("Projet", "Alpha");
      await choose("Responsable", "Camille");
      assert.deepEqual(await groups.locator("h3").allTextContents(), ["Alpha"]);
      assert.deepEqual(await groups.locator("h4").allTextContents(), ["Action partagée"]);
      await dialog.getByRole("searchbox").fill("preparer");
      assert.equal(await dialog.getByRole("status").textContent(), "1 action");
      await dialog.getByRole("button", { name: "Fermer" }).click();
      assert.equal(await page.locator("#search").inputValue(), "hors du suivi");
      await trigger.click();
      await dialog.getByRole("checkbox", { name: "Inclure les archivées" }).check();
      assert.equal(await dialog.locator('[data-followup-action="6"]').count(), 1);
      assert.equal(await dialog.locator('[data-followup-action="7"]').count(), 0);
      await choose("Responsable", "Mina (externe)");
      await dialog.getByRole("button", { name: "Ouvrir l’action" }).click();
      assert.equal(await dialog.isVisible(), false);
      assert.equal(await page.locator("#detail h2").innerText(), "Action de la réunion");
      assert.deepEqual(await page.evaluate(() => writes), []);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log("PASS action follow-up grouping, title order, combined searchable filters, shared/inherited links, archive visibility, navigation and no writes on PC/tablet/mobile");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
