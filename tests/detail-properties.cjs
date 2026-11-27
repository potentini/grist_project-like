const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const prepareGrist = require("./renamed-fixture.cjs");
const fixture = structuredClone(require("../demo.json"));

for (const [parentId, table, colId, type] of [
  [1, "Projets", "Typologie", "Text"],
  [4, "Notes", "Responsable", "Text"],
  [4, "Notes", "ParticipantsInternes", "Text"],
  [4, "Notes", "ParticipantsExternes", "Text"],
  [5, "Actions", "Date_de_debut", "Date"],
]) {
  fixture.meta.push({ id: 900 + fixture.meta.length, parentId, table, colId, label: colId === "Date_de_debut" ? "Date de début" : colId, type });
}
for (const column of fixture.meta.filter(column => column.colId === "Statut")) {
  column.type = "Choice";
  column.widgetOptions = JSON.stringify({ choices: ["À faire", "En cours"] });
}
Object.assign(fixture.data.projects[0], {
  Responsable: "Alice",
  DateDebut: "2026-11-01",
  DateFin: "2026-12-31",
  Typologie: "Transformation",
  Description: "Premier objectif\nDeuxième objectif",
});
Object.assign(fixture.data.notes[0], {
  Responsable: "Camille",
  ParticipantsInternes: "Alice et Camille",
  ParticipantsExternes: "Partenaire",
  Instance: "Coordination",
});
Object.assign(fixture.data.actions[0], {
  Date_de_debut: "2019-12-01",
  Projet: "",
  Tache: "",
});

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width < 1000 });
      await page.route("https://docs.getgrist.com/**", route => route.fulfill({ body: "" }));
      await page.addInitScript(prepareGrist, fixture);
      await page.goto(process.env.TEST_ORIGIN || "http://127.0.0.1:8766/");
      await page.locator("#list > *").first().waitFor();
      await page.evaluate(async () => {
        const { projectWorkspaceMappingV1: mapping } = optionsSnapshot();
        mapping.projects.extraFields = [{ id: "ExtraTypologie", label: "Typologie" }];
        delete mapping.projects.fields.Typologie;
        delete mapping.projects.columnRefs?.Typologie;
        mapping.projects.fields.ExtraTypologie = "Typologie";
        delete mapping.actions.fields.DateDebut;
        delete mapping.actions.fields.Date_de_debut;
        delete mapping.actions.columnRefs?.DateDebut;
        delete mapping.actions.columnRefs?.Date_de_debut;
        await grist.setOption("projectWorkspaceMappingV1", mapping);
      });
      await page.reload();
      await page.locator("#list > *").first().waitFor();

      async function open(view, kind) {
        if (await page.locator("#phoneBack").isVisible()) await page.locator("#phoneBack").click();
        if (await page.locator("#phoneNav").isVisible()) {
          await page.locator("#phoneNav summary").click();
          await page.locator(`#phoneNav [data-view=${view}]`).click();
        } else await page.locator(`header > nav [data-view=${view}]`).click();
        await page.locator(`#list [data-kind=${kind}][data-id="1"]`).first().click();
      }

      const properties = page.locator("#detail .detail-properties");
      await open("projects", "projects");
      assert.deepEqual(await properties.locator("dt").allTextContents(), [
        "Responsable", "Date de début", "Date de fin", "Statut", "Typologie", "Description",
      ]);
      assert.equal(await properties.locator("[data-slot=Description]").innerText(), "Premier objectif\nDeuxième objectif");
      assert.equal(await properties.locator("dt").first().evaluate(el => getComputedStyle(el).fontWeight), "700");
      assert.equal(new Set(await properties.locator("dd").evaluateAll(
        elements => elements.map(el => el.getBoundingClientRect().left),
      )).size, 1);

      await open("notes", "notes");
      assert.deepEqual((await properties.locator("dt").allTextContents()).slice(0, 5), [
        "Responsable", "Participants internes", "Participants externes", "Instance", "Date",
      ]);
      const border = el => getComputedStyle(el).border;
      assert.equal(await properties.evaluate(border), await page.locator(".meeting-notes-reading").evaluate(border));

      await open("actions", "actions");
      assert.deepEqual(await properties.locator("dt").allTextContents(), [
        "Responsable", "Date de début", "Date de fin", "Statut",
      ]);
      await page.locator("#editionButton").click();
      await page.locator("#detail [data-edit]").click();
      const date = properties.locator("[name=DateDebut]");
      const picker = properties.getByRole("combobox", { name: "Statut" });
      assert.ok((await date.boundingBox()).width <= 169);
      assert.ok((await picker.boundingBox()).width <= 337);
      if (width === 1440) {
        const valueWidth = (await properties.locator("[data-slot=Statut]").boundingBox()).width;
        assert.ok((await picker.boundingBox()).width < valueWidth);
      }
      await date.fill("2019-12-03");
      await picker.click();
      await page.getByRole("option", { name: "En cours", exact: true }).click();
      await page.locator("#save").click();
      await page.waitForFunction(() => testDb.data.actions[0].Statut === "En cours");
      assert.equal(await page.evaluate(() => testDb.data.actions[0].Date_de_debut), Date.parse("2019-12-03") / 1000);
      await page.close();
    }
    console.log("PASS grouped and aligned project, meeting and action properties, compact usable date and selection controls, desktop/tablet/mobile");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
