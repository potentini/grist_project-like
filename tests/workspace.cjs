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
    if (location.search.includes("points=1")) {
      db.tables.push({ id: 6, tableId: "Points", label: "Points" });
      const fields = [
        "Code",
        "Titre",
        "NoteOrigine",
        "Contenu",
        "Decision",
        "Projets",
        "Chantiers",
        "Taches",
        "Ordre",
      ];
      for (const field of fields)
        db.meta.push({
          id: db.meta.length + 1,
          parentId: 6,
          table: "Points",
          colId: field,
          label: field,
          type: field === "Ordre" ? "Int" : "Text",
          isFormula: false,
        });
      db.data.points = [
        {
          id: 1,
          Code: "D001",
          Titre: "Sujet transversal",
          NoteOrigine: "N001",
          Contenu: "Notes du sujet",
          Decision: "Décision du sujet",
          Projets: "P001, P002",
          Chantiers: "",
          Taches: "",
          Ordre: 1,
        },
      ];
      db.meta.push({
        id: db.meta.length + 1,
        parentId: 5,
        table: "Actions",
        colId: "PointOrigine",
        label: "PointOrigine",
        type: "Text",
        isFormula: false,
      });
      for (const a of db.data.actions)
        a.PointOrigine = a.id === 1 ? "D001" : "";
    }
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
    if (location.search.includes("layout=1")) {
      for (let i = 2; i <= 30; i++)
        db.data.streams.push({
          ...db.data.streams[0],
          id: i,
          Code: `C${i}`,
          Titre: `Chantier ${i}`,
        });
      db.data.projects[0].PointEtape = Array.from(
        { length: 80 },
        (_, i) => `Point de suivi ${i + 1} : compte rendu détaillé.`,
      ).join("\n\n");
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
      if (db.data.points) {
        targets.points = {
          NoteOrigine: "notes",
          Projets: "projects",
          Chantiers: "streams",
          Taches: "tasks",
        };
        targets.actions.PointOrigine = "points";
      }
      for (const [k, fields] of Object.entries(targets))
        for (const [f, target] of Object.entries(fields)) {
          const tableName = {
            projects: "Projets",
            streams: "Chantiers",
            tasks: "Taches",
            notes: "Notes",
            actions: "Actions",
            points: "Points",
          };
          const m = db.meta.find(
            (m) => m.table === tableName[k] && m.colId === f,
          );
          const multi = ["Projets", "Chantiers", "Taches"].includes(f);
          m.type = (multi ? "RefList:" : "Ref:") + tableName[target];
          for (const row of db.data[k]) {
            const refs = db.data[target].filter((t) =>
              String(row[f] || "")
                .split(",")
                .map((s) => s.trim())
                .includes(t.Code),
            );
            row[f] = multi ? ["L", ...refs.map((r) => r.id)] : refs[0]?.id || 0;
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
                      Points: "points",
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
              Points: "points",
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

  await page.locator("[name=Projet]").selectOption("2");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#editForm").parentElement.id === "editor" &&
      !document.querySelector("#editor").open,
  );
  const last = await page.evaluate(() => window.writes.at(-1));
  assert.equal(last[3].Projet, "P002");
  assert.equal(last[3].Chantier, undefined);
  assert.equal(last[3].Tache, "");
  console.log("PASS choosing a project detaches incompatible task and stream");
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

  for (const refs of [false, true]) {
    await page.goto("http://127.0.0.1:8766/?tree=1" + (refs ? "&refs=1" : ""));
    await page.locator("#list [data-kind=projects]").first().waitFor();
    await page.locator("#editionButton").click();
    await page.getByRole("button", { name: "À faire", exact: true }).click();
    await page.locator('#list [data-kind=actions][data-id="3"]').click();
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    for (const f of ["Projet", "Chantier", "Tache", "NoteOrigine"])
      assert.equal(
        await page
          .locator('#detail [data-slot="' + f + '"] select')
          .isVisible(),
        true,
      );
    await page.locator("#detail [name=Chantier]").selectOption("2");
    assert.equal(await page.locator("#detail [name=Projet]").inputValue(), "2");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.waitForFunction(
      (refs) => window.testDb.data.actions[2].Chantier === (refs ? 2 : "C002"),
      refs,
    );
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    await page.locator("#detail [name=Tache]").selectOption("1");
    assert.equal(
      await page.locator("#detail [name=Chantier]").inputValue(),
      "1",
    );
    assert.equal(await page.locator("#detail [name=Projet]").inputValue(), "1");
    await page.locator("#detail [name=NoteOrigine]").selectOption("1");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.waitForFunction(
      (refs) => window.testDb.data.actions[2].Tache === (refs ? 1 : "T001"),
      refs,
    );
    // All other entity types expose their mapped parent or association controls inline too.
    await page.getByRole("button", { name: "Projets", exact: true }).click();
    await page.locator('#list [data-kind=tasks][data-id="1"]').click();
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    assert.equal(
      await page.locator("#detail [data-slot=Chantier] select").isVisible(),
      true,
    );
    await page.locator("#detail [name=Chantier]").selectOption("2");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.waitForFunction(
      (refs) => window.testDb.data.actions[2].Chantier === (refs ? 2 : "C002"),
      refs,
    );
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.actions[2].Projet,
      refs ? 2 : "P002",
    );
    await page.locator('#list [data-kind=streams][data-id="2"]').click();
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    assert.equal(
      await page.locator("#detail [data-slot=Projet] select").isVisible(),
      true,
    );
    await page.locator("#detail [name=Projet]").selectOption("1");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.waitForFunction(
      (refs) => window.testDb.data.actions[2].Projet === (refs ? 1 : "P001"),
      refs,
    );
    await page
      .getByRole("button", { name: "Notes et réunions", exact: true })
      .click();
    await page.locator('#list [data-kind=notes][data-id="1"]').click();
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    for (const f of ["Projet", "Chantiers", "Taches"])
      assert.equal(
        await page
          .locator('#detail [data-slot="' + f + '"] select')
          .isVisible(),
        true,
      );
    await page.locator("#detail [name=Chantiers]").selectOption(["1", "2"]);
    await page.locator("#detail [name=Taches]").selectOption(["1"]);
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.waitForFunction(
      (refs) =>
        JSON.stringify(window.testDb.data.notes[0].Chantiers) ===
        JSON.stringify(refs ? ["L", 1, 2] : "C001, C002"),
      refs,
    );
    console.log(
      "PASS visible inline links, consistent action parents, task-parent propagation and note multiselect (" +
        (refs ? "references" : "CSV codes") +
        ")",
    );
  }

  for (const refs of [false, true]) {
    await page.goto(
      "http://127.0.0.1:8766/?points=1&tree=1" + (refs ? "&refs=1" : ""),
    );
    await page.locator("#list [data-kind=projects]").first().waitFor();
    await page.locator('#list [data-kind=projects][data-id="2"]').click();
    assert.equal(await page.locator("#detail [data-kind=points]").count(), 1);
    await page.locator("#detail [data-kind=points]").click();
    assert.match(
      await page.locator("#detail").innerText(),
      /Décision du sujet/,
    );
    await page.locator("#editionButton").click();
    await page
      .getByRole("button", { name: "+ Action issue de ce point", exact: true })
      .click();
    assert.equal(await page.locator("[name=PointOrigine]").inputValue(), "1");
    await page.locator("[name=Titre]").fill("Action du sujet");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.waitForFunction(() => window.testDb.data.actions.length === 4);
    let a = (await page.evaluate(() => window.testDb)).data.actions[3];
    assert.equal(a.PointOrigine, refs ? 1 : "D001");
    assert.equal(a.NoteOrigine, refs ? 1 : "N001");
    await page
      .getByRole("button", { name: "Notes et réunions", exact: true })
      .click();
    await page.locator('#list [data-kind=notes][data-id="1"]').click();
    await page
      .getByRole("button", { name: "+ Point de discussion", exact: true })
      .click();
    await page.locator("[name=Titre]").fill("Nouveau sujet");
    await page
      .locator("[name=Contenu]")
      .fill("Texte du sujet\nDeuxième paragraphe");
    await page.locator("[name=Projets]").selectOption(["1", "2"]);
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.waitForFunction(() => window.testDb.data.points.length === 2);
    const point = (await page.evaluate(() => window.testDb)).data.points[1];
    assert.equal(point.NoteOrigine, refs ? 1 : "N001");
    assert.deepEqual(point.Projets, refs ? ["L", 1, 2] : "P001, P002");
    await page.locator('#list [data-kind=points][data-id="1"]').click();
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    await page.locator("#detail [name=NoteOrigine]").selectOption("2");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.waitForFunction(
      (refs) =>
        window.testDb.data.actions[3].NoteOrigine === (refs ? 2 : "N002"),
      refs,
    );
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.actions[0].NoteOrigine,
      refs ? 2 : "N002",
    );
    console.log(
      "PASS optional discussion points, cross-project visibility, creation and action provenance (" +
        (refs ? "references" : "codes") +
        ")",
    );
  }
  await page.goto("http://127.0.0.1:8766/?layout=1");
  await page.locator("#list [data-kind=projects]").first().click();
  async function checkPaneScroll() {
    await page.evaluate(() => {
      document.querySelector("#list").scrollTop = 0;
      document.querySelector("#detail").scrollTop = 0;
    });
    for (const id of ["list", "detail"]) {
      const geometry = await page.locator("#" + id).evaluate((el) => ({
        height: el.clientHeight,
        content: el.scrollHeight,
        bottom: el.getBoundingClientRect().bottom,
      }));
      assert.ok(geometry.height > 60 && geometry.content > geometry.height);
      assert.ok(geometry.bottom <= (await page.evaluate(() => innerHeight)));
    }
    await page.locator("#list").hover();
    await page.mouse.wheel(0, 350);
    await page.waitForFunction(
      () => document.querySelector("#list").scrollTop > 0,
    );
    assert.equal(
      await page.locator("#detail").evaluate((el) => el.scrollTop),
      0,
    );
    const left = await page.locator("#list").evaluate((el) => el.scrollTop);
    await page.locator("#detail").hover();
    await page.mouse.wheel(0, 350);
    await page.waitForFunction(
      () => document.querySelector("#detail").scrollTop > 0,
    );
    assert.equal(
      await page.locator("#list").evaluate((el) => el.scrollTop),
      left,
    );
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  await checkPaneScroll();
  const levels = await page.locator("#list [data-kind]").evaluateAll((items) =>
    Object.fromEntries(
      items.map((el) => [
        el.dataset.kind,
        {
          color: getComputedStyle(el).borderLeftColor,
          label: el.querySelector(".item-kind")?.textContent,
        },
      ]),
    ),
  );
  assert.equal(
    new Set(Object.values(levels).map((x) => x.color)).size,
    Object.keys(levels).length,
  );
  assert.ok(Object.values(levels).every((x) => x.label));
  await page.setViewportSize({ width: 390, height: 844 });
  await checkPaneScroll();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#mappingButton").click();
  assert.ok(
    await page
      .locator("#mapping")
      .evaluate((el) => el.scrollHeight > el.clientHeight),
  );
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.locator("#mappingButton").click();
  console.log(
    "PASS independent wheel scrolling on desktop/mobile, bounded mapping and distinct labelled levels",
  );

  await page.goto("http://127.0.0.1:8766/?layout=1");
  await page.locator('#list [data-kind=projects][data-id="1"]').click();
  const dependency = page.locator(
    '#detail [data-tree-kind=streams][data-tree-id="1"]',
  );
  await dependency.locator(":scope > .tree-row > .fold").click();
  const child = dependency.locator('[data-kind=tasks][data-id="1"]');
  await child.scrollIntoViewIfNeeded();
  await page.locator("#list").evaluate((el) => (el.scrollTop = 210));
  const snapshot = () =>
    page.evaluate(() => ({
      title: document.querySelector("#detail h2").textContent,
      left: document.querySelector("#list").scrollTop,
      right: document.querySelector("#detail").scrollTop,
      folds: [...document.querySelectorAll("main [data-fold]")].map((b) => [
        b.dataset.fold,
        b.getAttribute("aria-expanded"),
      ]),
    }));
  const projectLocation = await snapshot();
  assert.ok(projectLocation.right > 0);
  await child.click();
  assert.equal(await page.locator("#detail").evaluate((el) => el.scrollTop), 0);
  assert.equal(
    await page.locator("#list").evaluate((el) => el.scrollTop),
    projectLocation.left,
  );
  await page
    .locator('#detail [data-kind=actions][data-id="1"]')
    .last()
    .scrollIntoViewIfNeeded();
  const taskLocation = await snapshot();
  await page.locator('#detail [data-kind=actions][data-id="1"]').last().click();
  assert.match(await page.locator("#detail h2").innerText(), /Envoyer/);
  await page.locator("[data-history=back]").click();
  assert.deepEqual(await snapshot(), taskLocation);
  await page.locator("[data-history=back]").click();
  assert.deepEqual(await snapshot(), projectLocation);
  await page.locator("[data-history=forward]").click();
  assert.deepEqual(await snapshot(), taskLocation);
  await page.locator("[data-history=back]").click();
  assert.deepEqual(await snapshot(), projectLocation);
  await dependency.locator('[data-kind=streams][data-id="1"]').first().click();
  assert.equal(await page.locator("[data-history=forward]").isDisabled(), true);
  // Returning across tabs restores the old view's filters as well as its location.
  await page.locator("#projectFilter").selectOption("1");
  await page.locator("#search").fill("Préparer");
  await page.locator("#list").evaluate((el) => (el.scrollTop = 0));
  const beforeTab = await snapshot();
  await page
    .getByRole("button", { name: "Notes et réunions", exact: true })
    .click();
  await page.locator("[data-history=back]").click();
  assert.deepEqual(await snapshot(), beforeTab);
  assert.equal(await page.locator("#projectFilter").inputValue(), "1");
  assert.equal(await page.locator("#search").inputValue(), "Préparer");
  assert.equal(await page.evaluate(() => window.writes.length), 0);
  console.log(
    "PASS multi-step back/forward restores exact pane scrolls, fold states, filters and view without writes",
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
