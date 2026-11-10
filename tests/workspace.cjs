const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fixture = require("../demo.json");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://docs.getgrist.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await page.addInitScript((fixture) => {
    const db = structuredClone(fixture);
    if (location.search.includes("refs=1")) {
      const targets = {
        streams: { Projet: "projects" },
        tasks: { Chantier: "streams" },
        notes: { Projet: "projects", Chantiers: "streams", Taches: "tasks" },
        actions: {
          Projet: "projects",
          Chantier: "streams",
          Tache: "tasks",
          NoteOrigine: "notes",
        },
      };
      for (const [k, fields] of Object.entries(targets))
        for (const [f, target] of Object.entries(fields)) {
          const tableName = {
            projects: "Projets",
            streams: "Chantiers",
            tasks: "Taches",
            notes: "Notes",
            actions: "Actions",
          };
          const m = db.meta.find(
            (m) => m.table === tableName[k] && m.colId === f,
          );
          const multi = ["Chantiers", "Taches"].includes(f);
          m.type = (multi ? "RefList:" : "Ref:") + tableName[target];
          for (const row of db.data[k]) {
            const ref = db.data[target].find((t) => t.Code === row[f]);
            row[f] = multi ? ["L", ...(ref ? [ref.id] : [])] : ref?.id || 0;
          }
        }
      const m = db.meta.find(
        (m) => m.table === "Notes" && m.colId === "Contenu",
      );
      m.colId = "Meeting_notes";
      m.label = "Compte rendu";
      for (const row of db.data.notes) {
        row.Meeting_notes = row.Contenu;
        delete row.Contenu;
      }
      db.meta.find(
        (m) => m.table === "Chantiers" && m.colId === "Avancement",
      ).isFormula = true;
    }
    window.testOptions = {};
    window.writes = [];
    const table = (k) => db.tables.find((t) => t.tableId === k);
    const encode = (rs) =>
      Object.fromEntries(
        [...new Set(rs.flatMap(Object.keys))].map((k) => [
          k,
          rs.map((r) => r[k]),
        ]),
      );
    let optionsCallback = () => {};
    window.grist = {
      ready() {},
      onOptions(cb) {
        optionsCallback = cb;
        cb(window.testOptions);
      },
      onRecords() {},
      getOption: async (k) => window.testOptions[k],
      setOption: async (k, v) => {
        window.testOptions[k] = structuredClone(v);
        optionsCallback(window.testOptions);
      },
      docApi: {
        fetchTable: async (id) =>
          id === "_grist_Tables"
            ? encode(db.tables)
            : id === "_grist_Tables_column"
              ? encode(db.meta)
              : encode(
                  db.data[
                    {
                      Projets: "projects",
                      Chantiers: "streams",
                      Taches: "tasks",
                      Notes: "notes",
                      Actions: "actions",
                    }[id]
                  ],
                ),
        applyUserActions: async (actions) => {
          if (window.rejectWrite) throw Error("Accès refusé");
          window.writes.push(...actions);
          for (const [op, t, id, fields] of actions) {
            const k = {
              Projets: "projects",
              Chantiers: "streams",
              Taches: "tasks",
              Notes: "notes",
              Actions: "actions",
            }[t];
            if (op === "UpdateRecord")
              Object.assign(
                db.data[k].find((r) => r.id === id),
                fields,
              );
            else
              db.data[k].push({
                id: Math.max(0, ...db.data[k].map((r) => r.id)) + 1,
                ...fields,
              });
          }
        },
      },
    };
  }, fixture);
  await page.goto("http://127.0.0.1:8766");
  await page
    .getByRole("button", { name: "Confirmer les participants", exact: false })
    .first()
    .waitFor();
  assert.equal(await page.locator("#list [data-kind=tasks]").count(), 1);
  console.log("PASS hierarchy resolves CSV business codes");
  await page.getByRole("button", { name: "Mapping", exact: true }).click();
  assert.equal(
    await page.locator("[data-map=notes][data-field=Contenu]").inputValue(),
    "Contenu",
  );
  await page.getByRole("button", { name: "Enregistrer le mapping" }).click();
  await page.waitForFunction(
    () => window.testOptions.directMapping?.levels?.[3]?.tableId === "Taches",
  );
  console.log("PASS autodetection and persisted shared timeline mapping");
  await page
    .getByRole("button", { name: "Notes et réunions", exact: true })
    .click();
  await page.locator("#list [data-kind=notes]").click();
  assert.match(
    await page.locator("#detail .text").innerText(),
    /Points abordés\n• Préparer/,
  );
  assert.equal(await page.locator("#detail [data-kind=actions]").count(), 2);
  console.log("PASS multiline notes and linked actions");
  const beforeCancel = await page.evaluate(() => window.writes.length);
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  assert.match(await page.locator("#detail textarea[name=Contenu]").inputValue(), /Points abordés/);
  await page.locator("#detail textarea[name=Contenu]").fill("Brouillon annulé");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(await page.evaluate(() => window.writes.length), beforeCancel);
  assert.match(await page.locator("#detail .text").innerText(), /Points abordés/);
  console.log("PASS prefilled inline editing and cancellation without writes");

  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page
    .locator("textarea[name=Contenu]")
    .fill("Décision\n<script>alert(1)</script>");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#editForm").parentElement.id === "editor" &&
      !document.querySelector("#editor").open,
  );
  assert.equal(await page.locator("#detail script").count(), 0);
  assert.match(await page.locator("#detail .text").innerText(), /<script>/);
  console.log("PASS notes edit writes plain text safely");
  await page.getByRole("button", { name: "À faire", exact: true }).click();
  await page.locator("#unlinked").check();
  assert.equal(await page.locator("#list [data-kind=actions]").count(), 1);
  await page.locator("#unlinked").uncheck();
  await page.locator("#overdue").check();
  assert.equal(await page.locator("#list [data-kind=actions]").count(), 1);
  await page.locator("#overdue").uncheck();
  console.log("PASS autonomous and overdue filters");
  await page.locator("#list [data-kind=actions]").first().click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.locator("#detail summary").click();
  await page.locator("[name=Projet]").selectOption("2");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#editForm").parentElement.id === "editor" &&
      !document.querySelector("#editor").open,
  );
  const last = await page.evaluate(() => window.writes.at(-1));
  assert.equal(last[3].Projet, undefined);
  assert.equal(last[3].Chantier, "C001");
  console.log("PASS precise task derives consistent ancestors");
  await page.locator("#list [data-kind=actions]").first().click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.evaluate(() => (window.rejectWrite = true));
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByText("Enregistrement impossible : Accès refusé").waitFor();
  assert.equal(await page.locator("#detail #editForm").isVisible(), true);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  console.log("PASS permission failure preserves editor draft");
  await page.goto("http://127.0.0.1:8766/?refs=1");
  await page.locator("#list [data-kind=tasks]").waitFor();
  await page.locator("#list [data-kind=streams]").click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  assert.equal(await page.locator("[name=Avancement]").count(), 0);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page
    .getByRole("button", { name: "Notes et réunions", exact: true })
    .click();
  await page.locator("#list [data-kind=notes]").click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  assert.equal(await page.locator("textarea[name=Contenu]").count(), 1);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "À faire", exact: true }).click();
  await page.getByRole("button", { name: "+ Action", exact: true }).click();
  await page.locator("[name=Titre]").fill("Nouvelle action");
  assert.equal(await page.locator("[name=Code]").inputValue(), "A004");
  await page.locator("[name=Tache]").selectOption("1");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#editForm").parentElement.id === "editor" &&
      !document.querySelector("#editor").open,
  );
  const refWrite = await page.evaluate(() => window.writes.at(-1));
  assert.equal(refWrite[3].Tache, 1);
  assert.equal(refWrite[3].Chantier, 1);
  assert.equal(refWrite[3].Projet, 1);
  console.log(
    "PASS native references, alias detection, formula protection and action creation",
  );
  await page.goto("http://127.0.0.1:8766/?demo=1");
  await page
    .getByRole("button", { name: "Confirmer les participants", exact: false })
    .first()
    .waitFor();
  await page.screenshot({
    path: "/workspace/exports/widget-v1.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log("PASS demo renders without JavaScript errors");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
