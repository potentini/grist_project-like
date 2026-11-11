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
    if (location.search.includes("tree=1")) {
      db.data.streams.push({
        ...db.data.streams[0],
        id: 2,
        Code: "C002",
        Titre: "Autre chantier",
        Projet: "P002",
      });
      db.data.notes.push({
        ...db.data.notes[0],
        id: 2,
        Code: "N002",
        Titre: "Autre réunion",
        Projet: "P002",
        Chantiers: "C002",
      });
    }
    window.testDb = db;
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
  await page.locator("#editionButton").click();
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
  assert.match(
    await page.locator("#detail textarea[name=Contenu]").inputValue(),
    /Points abordés/,
  );
  await page.locator("#detail textarea[name=Contenu]").fill("Brouillon annulé");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(await page.evaluate(() => window.writes.length), beforeCancel);
  assert.match(
    await page.locator("#detail .text").innerText(),
    /Points abordés/,
  );
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
  await page.locator("#editionButton").click();
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

  for (const refs of [false, true]) {
    await page.goto("http://127.0.0.1:8766/?tree=1" + (refs ? "&refs=1" : ""));
    await page.locator("#list [data-kind=tasks]").waitFor();
    const project = page.locator(
      '#list > .tree-node[data-tree-kind=projects][data-tree-id="1"]',
    );
    await project.locator(":scope > .tree-row > .fold").click();
    assert.equal(
      await page.locator("#list [data-kind=tasks]").isVisible(),
      false,
    );
    await project.locator(":scope > .tree-row > .fold").click();
    assert.equal(
      await page.locator("#list [data-kind=tasks]").isVisible(),
      true,
    );
    await page.locator('#list [data-kind=projects][data-id="1"]').click();
    assert.equal(
      await page
        .getByRole("button", { name: "Modifier", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page
        .locator("#list [data-drag-kind=tasks]")
        .getAttribute("draggable"),
      "false",
    );
    const rightChild = page.locator("#detail [data-tree-kind=streams]").first();
    assert.equal(
      await rightChild.locator("[data-kind=tasks]").isVisible(),
      false,
    );
    await rightChild.locator(":scope > .tree-row > .fold").click();
    assert.equal(
      await rightChild.locator("[data-kind=tasks]").isVisible(),
      true,
    );
    await rightChild.locator(":scope > .tree-row > .fold").click();
    assert.equal(
      await rightChild.locator("[data-kind=tasks]").isVisible(),
      false,
    );
    await rightChild.locator(":scope > .tree-row > .fold").click();
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    await page.evaluate(() => {
      const source = document.querySelector("#list [data-drag-kind=tasks]");
      const destination = document.querySelector(
        '#list [data-drop-kind=streams][data-drop-id="2"]',
      );
      const transfer = new DataTransfer();
      source.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
      destination.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    });
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    await page.locator("#editionButton").click();
    // Real HTML drag/drop on the task, across projects, including linked action ancestry.
    await page
      .locator('#list [data-drag-kind=tasks][data-drag-id="1"]')
      .dragTo(page.locator('#list [data-drop-kind=streams][data-drop-id="2"]'));
    await page.getByText("Déplacement enregistré.", { exact: true }).waitFor();
    let db = await page.evaluate(() => window.testDb);
    assert.equal(db.data.tasks[0].Chantier, refs ? 2 : "C002");
    assert.equal(db.data.actions[0].Chantier, refs ? 2 : "C002");
    assert.equal(db.data.actions[0].Projet, refs ? 2 : "P002");
    const writes = await page.evaluate(() => window.writes.length);
    // Invalid drop must leave the document unchanged.
    await page
      .locator('#list [data-drag-kind=tasks][data-drag-id="1"]')
      .dragTo(
        page.locator('#list [data-drop-kind=projects][data-drop-id="1"]'),
      );
    assert.equal(await page.evaluate(() => window.writes.length), writes);
    // Keyboard/touch alternative: move a whole stream and preserve its task subtree.
    await page
      .locator('#list [data-move-kind=streams][data-move-id="2"]')
      .click();
    await page.locator("#moveTarget").selectOption("projects:1");
    await page.locator("#moveSubmit").click();
    await page.locator("#moveDialog").waitFor({ state: "hidden" });
    db = await page.evaluate(() => window.testDb);
    assert.equal(db.data.streams[1].Projet, refs ? 1 : "P001");
    assert.equal(db.data.actions[0].Projet, refs ? 1 : "P001");
    assert.equal(db.data.tasks[0].Chantier, refs ? 2 : "C002");
    // A rejected API write must preserve the original parent and leave the picker open.
    await page
      .locator('#list [data-move-kind=tasks][data-move-id="1"]')
      .click();
    await page.locator("#moveTarget").selectOption("streams:1");
    await page.evaluate(() => (window.rejectWrite = true));
    await page.locator("#moveSubmit").click();
    await page
      .locator("#moveError")
      .getByText("Déplacement impossible : Accès refusé", { exact: true })
      .waitFor();
    assert.equal(await page.locator("#moveDialog").isVisible(), true);
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.tasks[0].Chantier,
      refs ? 2 : "C002",
    );
    await page.evaluate(() => (window.rejectWrite = false));
    await page.locator("#moveCancel").click();
    // Notes have foldable actions; moving provenance does not change project attachments.
    await page
      .getByRole("button", { name: "Notes et réunions", exact: true })
      .click();
    await page
      .locator('#list [data-drag-kind=actions][data-drag-id="1"]')
      .dragTo(page.locator('#list [data-drop-kind=notes][data-drop-id="2"]'));
    await page.waitForFunction(
      (refs) =>
        window.testDb.data.actions[0].NoteOrigine === (refs ? 2 : "N002"),
      refs,
    );
    db = await page.evaluate(() => window.testDb);
    assert.equal(db.data.actions[0].Tache, refs ? 1 : "T001");
    await page.getByRole("button", { name: "À faire", exact: true }).click();
    for (const [destination, task, stream, project] of [
      ["streams:1", refs ? 0 : "", refs ? 1 : "C001", refs ? 1 : "P001"],
      ["projects:2", refs ? 0 : "", refs ? 0 : "", refs ? 2 : "P002"],
      ["unassigned:0", refs ? 0 : "", refs ? 0 : "", refs ? 0 : ""],
    ]) {
      await page
        .locator('#list [data-move-kind=actions][data-move-id="1"]')
        .click();
      await page.locator("#moveTarget").selectOption(destination);
      await page.locator("#moveSubmit").click();
      await page.locator("#moveDialog").waitFor({ state: "hidden" });
      const action = (await page.evaluate(() => window.testDb)).data.actions[0];
      assert.equal(action.Tache, task);
      assert.equal(action.Chantier, stream);
      assert.equal(action.Projet, project);
      assert.equal(action.NoteOrigine, refs ? 2 : "N002");
    }
    await page.locator("#editionButton").click();
    assert.equal(
      await page
        .locator('#list [data-drag-kind=actions][data-drag-id="1"]')
        .getAttribute("draggable"),
      "false",
    );
    console.log(
      "PASS fold in read mode, gated drag/drop, invalid targets, subtree and meeting moves (" +
        (refs ? "references" : "CSV codes") +
        ")",
    );
  }
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
