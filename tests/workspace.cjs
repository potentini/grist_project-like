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
  // Legacy workflow scenarios start expanded; initial folding has a separate browser test.
  const originalGoto = page.goto.bind(page),
    originalReload = page.reload.bind(page);
  async function expandScenarioList() {
    if (new URL(page.url()).pathname.endsWith("timeline.html")) return;
    await page.locator("#list > *").first().waitFor();
    await page.locator("#list [data-fold-all=open]").click();
    await page.evaluate(() => {
      const initialized = new Set([document.body.dataset.currentView]);
      document.querySelectorAll("[data-view]").forEach((button) =>
        button.addEventListener("click", () =>
          queueMicrotask(() => {
            const view = document.body.dataset.currentView;
            if (!initialized.has(view)) {
              initialized.add(view);
              document.querySelector("#list [data-fold-all=open]")?.click();
            }
          }),
        ),
      );
    });
  }
  page.goto = async (...args) => {
    const result = await originalGoto(...args);
    await expandScenarioList();
    return result;
  };
  page.reload = async (...args) => {
    const result = await originalReload(...args);
    await expandScenarioList();
    return result;
  };

  async function setQuick(id, values) {
    const menu = page
      .locator("#" + id)
      .locator("..")
      .locator(".quick-multiple");
    if (!(await menu.evaluate((el) => el.open)))
      await menu.locator("summary").click({ position: { x: 5, y: 10 } });
    await menu.locator("[data-quick-all]").check();
    for (const value of values)
      await menu.locator(`input[data-quick][value="${value}"]`).check();
    await menu.locator("summary").click({ position: { x: 5, y: 10 } });
  }

  await page.route("https://docs.getgrist.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  const setupGrist = (fixture) => {
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
    if (location.search.includes("convert=1")) {
      db.data.actions.push({
        ...db.data.actions[0],
        id: 4,
        Code: "A004",
        Titre: "Action dépendante active",
      });
      for (const [k, f, type] of [
        ["actions", "Transforme", "Bool"],
        ["tasks", "Transforme", "Bool"],
        ["tasks", "ActionOrigine", "Ref:Actions"],
        ["streams", "TacheOrigine", "Ref:Taches"],
      ]) {
        const table = {
          actions: "Actions",
          tasks: "Taches",
          streams: "Chantiers",
        }[k];
        db.meta.push({
          id: db.meta.length + 1,
          parentId: db.tables.find((t) => t.tableId === table).id,
          table,
          colId: f,
          label: f,
          type,
          isFormula: false,
        });
        for (const r of db.data[k]) r[f] = type === "Bool" ? false : 0;
      }
      // Context links to the original task exercise both multireference rewrites.
      db.data.notes[0].Taches = "T001";
      if (db.data.points) db.data.points[0].Taches = "T001";
    }
    if (location.search.includes("manage=1")) {
      for (const t of db.tables) {
        const k = {
          Projets: "projects",
          Chantiers: "streams",
          Taches: "tasks",
          Notes: "notes",
          Points: "points",
          Actions: "actions",
        }[t.tableId];
        db.meta.push({
          id: db.meta.length + 1,
          parentId: t.id,
          table: t.tableId,
          colId: "Archive",
          label: "Archive",
          type: "Bool",
          isFormula: false,
        });
        for (const r of db.data[k] || []) r.Archive = false;
      }
    }
    if (location.search.includes("broader=1")) {
      const mId = 9001;
      db.tables.push({ id: 88, tableId: "Equipe", label: "Equipe" });
      db.meta.push({
        id: mId,
        parentId: 88,
        table: "Equipe",
        colId: "Nom",
        label: "Nom",
        type: "Text",
        isFormula: false,
      });
      db.people = [
        { id: 1, Nom: "Alice Référente" },
        { id: 2, Nom: "Camille Pilote" },
      ];
      db.data.tasks.push({
        ...db.data.tasks[0],
        id: 2,
        Code: "T002",
        Titre: "Livrable secondaire",
        Chantier: "C002",
      });
      for (const k of ["projects", "streams", "tasks", "actions"]) {
        const table = {
          projects: "Projets",
          streams: "Chantiers",
          tasks: "Taches",
          actions: "Actions",
        }[k];
        const m = db.meta.find(
          (c) => c.table === table && c.colId === "Responsable",
        );
        m.type = "Ref:Equipe";
        m.visibleCol = mId;
        for (const r of db.data[k]) r.Responsable = r.id === 2 ? 2 : 1;
      }
      db.meta.push({
        id: 9002,
        parentId: 3,
        table: "Taches",
        colId: "Priorite",
        label: "Priorité",
        type: "Text",
        isFormula: false,
      });
      db.data.tasks[0].Priorite = "Haute";
      db.data.tasks[1].Priorite = "Basse";
    }
    if (location.search.includes("cards=1"))
      Object.assign(db.data.tasks[0], {
        DateDebut: "2026-11-01",
        DateFin: "2026-12-20",
        Avancement: 0,
        Echeance: "avant Noël",
        PointEtape: "Suivi <img src=x onerror=alert(1)> de la tâche",
      });
    if (location.search.includes("choices=1")) {
      let next = 11000;
      for (const k of ["projects", "streams", "tasks", "actions"]) {
        const table = {
          projects: "Projets",
          streams: "Chantiers",
          tasks: "Taches",
          actions: "Actions",
        }[k];
        db.meta.push({
          id: next++,
          parentId: db.tables.find((t) => t.tableId === table).id,
          table,
          colId: "ResponsableDiPSi",
          label: "Responsable DiPSi",
          type: "Ref:Equipe",
          visibleCol: 9001,
          isFormula: false,
        });
        for (const row of db.data[k])
          row.ResponsableDiPSi = row.id === 1 ? 2 : 1;
      }
      db.meta.find(
        (c) => c.table === "Taches" && c.colId === "Responsable",
      ).type = "RefList:Equipe";
      db.data.tasks[0].Responsable = ["L", 1];
      db.data.tasks[1].Responsable = ["L", 1, 2];
      for (const [field, type, options, formula] of [
        ["Valide", "Bool", "", false],
        ["Tags", "ChoiceList", JSON.stringify({ choices: ["A", "B"] }), false],
        ["Score", "Numeric", "", true],
        ["DateRevue", "Date", "", false],
      ]) {
        db.meta.push({
          id: next++,
          parentId: 3,
          table: "Taches",
          colId: field,
          label: field,
          type,
          widgetOptions: options,
          isFormula: formula,
        });
      }
      Object.assign(db.data.tasks[0], {
        Valide: false,
        Tags: ["L", "A"],
        Score: 2,
        DateRevue: null,
      });
      Object.assign(db.data.tasks[1], {
        Valide: true,
        Tags: ["L", "B"],
        Score: 4,
        DateRevue: null,
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
    if (location.search.includes("progress=1")) {
      for (const [kind, tableId] of [
        ["projects", "Projets"],
        ["streams", "Chantiers"],
        ["tasks", "Taches"],
        ["actions", "Actions"],
      ]) {
        if (kind === "projects" && location.search.includes("create=1"))
          continue;
        if (
          !db.meta.some((m) => m.table === tableId && m.colId === "Avancement")
        )
          db.meta.push({
            id: db.meta.length + 1000,
            parentId: db.tables.find((t) => t.tableId === tableId).id,
            table: tableId,
            colId: "Avancement",
            label: "Avancement",
            type: "Numeric",
            isFormula: false,
          });
        db.meta.find(
          (m) => m.table === tableId && m.colId === "Avancement",
        ).isFormula = false;
        for (const row of db.data[kind]) row.Avancement = 0.1;
      }
    }
    window.testOptions = location.search.includes("broader=1")
      ? JSON.parse(sessionStorage.getItem("broaderOptions") || "{}")
      : {};
    if (location.pathname.endsWith("timeline.html")) {
      db.data.tasks[0].Transforme = true;
      db.data.tasks.push({
        ...db.data.tasks[0],
        id: 2,
        Code: "T002",
        Titre: "Tâche conservée",
        Transforme: false,
      });
      window.testOptions.directMapping = {
        levels: {
          1: { tableId: "Projets", nameCol: "Titre" },
          2: { tableId: "Chantiers", nameCol: "Titre", parentCol: "Projet" },
          3: {
            tableId: "Taches",
            nameCol: "Titre",
            parentCol: "Chantier",
            archivedCol: "Transforme",
          },
        },
      };
    }
    if (location.search.includes("cards=1"))
      window.testOptions = JSON.parse(
        sessionStorage.getItem("cardsOptions") || "{}",
      );
    if (location.search.includes("progress=1"))
      window.testOptions = JSON.parse(
        sessionStorage.getItem("progressOptions") || "{}",
      );
    // Legacy workflows specify their historical manual ordering explicitly.
    window.testOptions.hierarchySortV1 ||= {
      projects: "manual",
      children: "manual",
    };
    window.writes = [];
    window.batches = [];
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
      onRecords(cb) {
        window.nativeRecordCallback = cb;
        if (location.pathname.endsWith("timeline.html")) cb([]);
      },
      selectedTable: {
        getTableId: async () => {
          if (window.nativeUnavailable) throw Error("RPC indisponible");
          if (!window.nativeTableId)
            throw Error("No linked view in this fixture");
          return window.nativeTableId;
        },
      },
      getOption: async (k) => window.testOptions[k],
      setOption: async (k, v) => {
        window.testOptions[k] = structuredClone(v);
        if (location.search.includes("broader=1"))
          sessionStorage.setItem(
            "broaderOptions",
            JSON.stringify(window.testOptions),
          );
        if (location.search.includes("cards=1"))
          sessionStorage.setItem(
            "cardsOptions",
            JSON.stringify(window.testOptions),
          );
        if (location.search.includes("progress=1"))
          sessionStorage.setItem(
            "progressOptions",
            JSON.stringify(window.testOptions),
          );
        optionsCallback(window.testOptions);
      },
      docApi: {
        fetchTable: async (id) =>
          id === "Equipe"
            ? encode(db.people)
            : id === "Externes"
              ? encode(db.external || [])
              : id === "_grist_Tables"
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
          window.batches.push(structuredClone(actions));
          for (const [op, t, id, fields] of actions) {
            const k = {
              Projets: "projects",
              Chantiers: "streams",
              Taches: "tasks",
              Notes: "notes",
              Actions: "actions",
              Points: "points",
            }[t];
            if (op === "AddColumn") {
              db.meta.push({
                id: db.meta.length + 1000,
                parentId: table(t).id,
                table: t,
                colId: id,
                label: id,
                ...fields,
              });
              for (const row of db.data[k]) row[id] = null;
            } else if (op === "UpdateRecord")
              Object.assign(
                db.data[k].find((r) => r.id === id),
                fields,
              );
            else if (op === "RemoveRecord")
              db.data[k].splice(
                db.data[k].findIndex((r) => r.id === id),
                1,
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
    if (location.search.includes("resume=1")) {
      window.nativeTableId = "Projets";
      window.nativeFilterIds = [1];
      window.nativeUnavailable = location.search.includes("offline=1");
      window.viewFetchCalls = 0;
      window.grist.viewApi = {
        fetchSelectedTable: async () => {
          window.viewFetchCalls++;
          if (window.nativeUnavailable) throw Error("RPC indisponible");
          return encode(
            db.data.projects.filter((r) =>
              window.nativeFilterIds.includes(r.id),
            ),
          );
        },
      };
    }
  };
  await page.addInitScript(setupGrist, fixture);
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

  await page.goto("http://127.0.0.1:8766");
  await page.locator("#list [data-kind=projects]").first().waitFor();
  await page.evaluate(() =>
    window.testDb.meta.push({
      id: 9999,
      parentId: 5,
      table: "Actions",
      colId: "Transforme",
      label: "Transforme",
      type: "Bool",
      isFormula: false,
    }),
  );
  await page.locator("#mappingButton").click();
  assert.equal(
    await page
      .locator("[data-map=actions][data-field=Transforme]")
      .inputValue(),
    "",
  );
  await page.locator("#detect").click();
  assert.equal(
    await page
      .locator("[data-map=actions][data-field=Transforme]")
      .inputValue(),
    "Transforme",
  );
  await page.locator("#mappingButton").click();
  console.log(
    "PASS mapping refresh detects a Boolean column created after widget startup",
  );
  for (const refs of [false, true]) {
    await page.goto("http://127.0.0.1:8766/?tree=1" + (refs ? "&refs=1" : ""));
    await page.locator('#list [data-kind=projects][data-id="1"]').waitFor();
    await page.locator("#editionButton").click();
    await page.locator('#list [data-kind=projects][data-id="1"]').click();
    await page.locator("#detail [data-new=actions]").click();
    const options = async (field) =>
      page
        .locator('#editForm [name="' + field + '"] option')
        .evaluateAll((opts) => opts.map((o) => o.value));
    assert.deepEqual(await options("Chantier"), ["", "1"]);
    assert.deepEqual(await options("Tache"), ["", "1"]);
    await page.locator("#editForm [name=Projet]").selectOption("2");
    assert.deepEqual(await options("Chantier"), ["", "2"]);
    assert.deepEqual(await options("Tache"), [""]);
    await page.locator("#editForm [name=Projet]").selectOption("");
    assert.deepEqual(await options("Chantier"), ["", "1", "2"]);
    await page.locator("#editForm [name=Chantier]").selectOption("1");
    assert.equal(
      await page.locator("#editForm [name=Projet]").inputValue(),
      "1",
    );
    await page.locator("#editForm [name=Tache]").selectOption("1");
    await page.locator("#editForm [name=Projet]").selectOption("2");
    assert.equal(
      await page.locator("#editForm [name=Chantier]").inputValue(),
      "",
    );
    assert.equal(await page.locator("#editForm [name=Tache]").inputValue(), "");
    const before = await page.evaluate(() => window.writes.length);
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    assert.equal(await page.evaluate(() => window.writes.length), before);
    console.log(
      "PASS cascading creation choices, bottom-up parents, incompatible reset and cancel (" +
        (refs ? "references" : "codes") +
        ")",
    );
  }

  for (const refs of [false, true]) {
    // Keep both real drag endpoints in view; rich cards now need more height.
    await page.setViewportSize({ width: 1440, height: 1500 });
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
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  for (const refs of [false, true]) {
    // Keep both real drag endpoints in view; rich cards now need more height.
    await page.setViewportSize({ width: 1440, height: 1500 });
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
    await page.locator("#detail [name=Projet]").selectOption("1");
    assert.deepEqual(
      await page
        .locator("#detail [name=Chantier] option")
        .evaluateAll((opts) => opts.map((o) => o.value)),
      ["", "1"],
    );
    assert.deepEqual(
      await page
        .locator("#detail [name=Tache] option")
        .evaluateAll((opts) => opts.map((o) => o.value)),
      ["", "1"],
    );
    await page.locator("#detail [name=Projet]").selectOption("2");
    assert.deepEqual(
      await page
        .locator("#detail [name=Chantier] option")
        .evaluateAll((opts) => opts.map((o) => o.value)),
      ["", "2"],
    );
    assert.deepEqual(
      await page
        .locator("#detail [name=Tache] option")
        .evaluateAll((opts) => opts.map((o) => o.value)),
      [""],
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
    assert.deepEqual(
      await page
        .locator("#detail [name=Chantier] option")
        .evaluateAll((opts) => opts.map((o) => o.value)),
      ["", "2"],
    );
    assert.deepEqual(
      await page
        .locator("#detail [name=Tache] option")
        .evaluateAll((opts) => opts.map((o) => o.value)),
      [""],
    );
    await page.locator("#detail [name=Projet]").selectOption("");
    await page.locator("#detail [name=Chantier]").selectOption("");
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
    await page.locator("#detail [name=Projet]").selectOption("");
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
    assert.equal(
      await page.locator("#detail [data-kind=points]:visible").count(),
      1,
    );
    assert.match(
      await page
        .locator("#detail [data-kind=points]:visible .point-origin")
        .innerText(),
      /Réunion : Réunion de coordination ; Date : 10\/11\/2026/,
    );
    await page.locator("#detail [data-kind=points]:visible").click();
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
    await page.locator("[name=Projets]").selectOption(["1"]);
    assert.deepEqual(
      await page
        .locator("[name=Chantiers] option")
        .evaluateAll((opts) => opts.map((o) => o.value)),
      ["", "1"],
    );
    await page.locator("[name=Projets]").selectOption(["1", "2"]);
    assert.deepEqual(
      await page
        .locator("[name=Chantiers] option")
        .evaluateAll((opts) => opts.map((o) => o.value)),
      ["", "1", "2"],
    );
    await page.locator("[name=Chantiers]").selectOption(["1", "2"]);
    assert.deepEqual(
      await page
        .locator("[name=Projets]")
        .evaluate((el) => [...el.selectedOptions].map((o) => o.value)),
      ["1", "2"],
    );
    await page.locator("[name=Chantiers]").selectOption([]);
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
    assert.match(
      await page.locator("#detail > .point-origin").innerText(),
      /Autre réunion · 10\/11\/2026/,
    );
    await page.evaluate(() => {
      window.testDb.data.notes[1].Date = "";
      window.testDb.data.notes[1].DateSource = "Date à confirmer";
    });
    await page.locator("#refresh").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#detail > .point-origin")
        ?.textContent.includes("Autre réunion · Date à confirmer"),
    );

    console.log(
      "PASS optional discussion points, cross-project visibility, creation and action provenance (" +
        (refs ? "references" : "codes") +
        ")",
    );
  }

  for (const refs of [false, true]) {
    await page.goto(
      "http://127.0.0.1:8766/?convert=1&points=1" + (refs ? "&refs=1" : ""),
    );
    await page.locator('#list [data-kind=actions][data-id="1"]').waitFor();
    await page.locator('#list [data-kind=actions][data-id="1"]').click();
    assert.equal(await page.locator("[data-convert]").isDisabled(), true);
    await page.locator("#editionButton").click();
    await page.locator("[data-convert]").click();
    assert.equal(await page.locator("#conversionSubmit").isEnabled(), true);
    const before = await page.evaluate(() => window.writes.length);
    await page.locator("#conversionCancel").click();
    assert.equal(await page.evaluate(() => window.writes.length), before);
    await page.locator("[data-convert]").click();
    await page.evaluate(
      () => (window.testDb.data.actions[0].Titre = "Action actualisée"),
    );
    await page.locator("#conversionSubmit").click();
    await page
      .locator("#conversionError")
      .getByText(/Les données ont changé/)
      .waitFor();
    assert.equal(await page.evaluate(() => window.writes.length), before);
    await page.evaluate(() => (window.rejectWrite = true));
    await page.locator("#conversionSubmit").click();
    await page
      .locator("#conversionError")
      .getByText("Transformation impossible : Accès refusé", { exact: true })
      .waitFor();
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.actions[0].Transforme,
      false,
    );
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.tasks.length,
      1,
    );
    await page.evaluate(() => (window.rejectWrite = false));
    await page.locator("#conversionSubmit").click();
    await page.locator("#conversionDialog").waitFor({ state: "hidden" });
    let db = await page.evaluate(() => window.testDb);
    assert.equal(db.data.actions[0].Transforme, true);
    assert.equal(db.data.tasks.length, 2);
    assert.equal(db.data.tasks[1].ActionOrigine, 1);
    assert.equal(db.data.tasks[1].Titre, db.data.actions[0].Titre);
    assert.equal(
      await page.locator('#list [data-kind=actions][data-id="1"]').count(),
      0,
    );
    assert.equal((await page.evaluate(() => window.batches.at(-1))).length, 2);
    // The source remains reachable from the new task, with a link to its replacement.
    await page.locator('#detail [data-kind=actions][data-id="1"]').click();
    assert.match(await page.locator("#detail").innerText(), /Transformé/);
    assert.equal(await page.locator("#detail [data-edit]").count(), 0);
    await page.getByRole("button", { name: "Projets", exact: true }).click();
    await page.locator('#list [data-kind=tasks][data-id="1"]').click();
    await page.locator("[data-convert]").click();
    assert.match(
      await page.locator("#conversionPreview").innerText(),
      /1 action/,
    );
    await page.locator("#conversionSubmit").click();
    await page.locator("#conversionDialog").waitFor({ state: "hidden" });
    db = await page.evaluate(() => window.testDb);
    assert.equal(db.data.tasks[0].Transforme, true);
    assert.equal(db.data.streams[1].TacheOrigine, 1);
    assert.equal(db.data.actions[0].Transforme, true);
    assert.equal(db.data.actions[3].Tache, refs ? 0 : "");
    assert.equal(db.data.actions[3].Chantier, refs ? 2 : "C002");
    assert.equal(db.data.actions[3].Projet, refs ? 1 : "P001");
    assert.deepEqual(db.data.notes[0].Taches, refs ? ["L"] : "");
    assert.ok(
      refs
        ? db.data.notes[0].Chantiers.includes(2)
        : db.data.notes[0].Chantiers.includes("C002"),
    );
    assert.deepEqual(db.data.points[0].Taches, refs ? ["L"] : "");
    // Only active actions are reparented; archived origins retain their original history.
    assert.equal(
      await page.locator('#list [data-kind=tasks][data-id="1"]').count(),
      0,
    );
    console.log(
      "PASS conversion preview, cancellation, atomic rejection, promotion and context rewrites (" +
        (refs ? "references" : "codes") +
        ")",
    );
  }

  await page.goto("http://127.0.0.1:8766/timeline.html?refs=1&convert=1");
  await page.locator(".hierarchy-table").waitFor();
  if (
    (await page.locator("#tableExpandAllBtn").innerText())
      .toLowerCase()
      .includes("déplier")
  )
    await page.locator("#tableExpandAllBtn").click();
  await page
    .locator(".hierarchy-table tbody")
    .getByText("Tâche conservée", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator(".hierarchy-table")
      .getByText("Confirmer les participants", { exact: true })
      .count(),
    0,
  );
  console.log(
    "PASS timeline excludes transformed task while retaining active tasks",
  );

  for (const refs of [false, true]) {
    await page.goto(
      "http://127.0.0.1:8766/?manage=1" + (refs ? "&refs=1" : ""),
    );
    await page.locator('#list [data-kind=actions][data-id="3"]').click();
    assert.equal(
      await page.locator("[data-removal=archive]").isDisabled(),
      true,
    );
    await page.locator("#editionButton").click();
    await page.locator("[data-removal=archive]").click();
    await page.locator("#removalSubmit:enabled").waitFor();
    await page.locator("#removalCancel").click();
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    await page.locator("[data-removal=archive]").click();
    await page.locator("#removalConfirm").check();
    await page.locator("#removalSubmit").click();
    await page.locator("#removalDialog").waitFor({ state: "hidden" });
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.actions[2].Archive,
      true,
    );
    assert.equal(
      await page.locator('#list [data-kind=actions][data-id="3"]').count(),
      0,
    );
    await page.locator("#showArchived").check();
    await page.locator('#list [data-kind=actions][data-id="3"]').click();
    await page.locator("[data-removal=restore]").click();
    await page.locator("#removalConfirm").check();
    await page.locator("#removalSubmit").click();
    await page.locator("#removalDialog").waitFor({ state: "hidden" });
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.actions[2].Archive,
      false,
    );
    await page.locator("#showArchived").uncheck();
    await page.evaluate(() => {
      const db = window.testDb;
      db.tables.push({ id: 77, tableId: "Externes", label: "Externes" });
      db.meta.push({
        id: 777,
        parentId: 77,
        table: "Externes",
        colId: "Action",
        label: "Action",
        type: "Ref:Actions",
        isFormula: false,
      });
      db.external = [{ id: 1, Action: 3 }];
    });
    await page.locator("[data-removal=delete]").click();
    await page.getByText(/Suppression bloquée/).waitFor();
    assert.equal(await page.locator("#removalSubmit").isDisabled(), true);
    assert.match(await page.locator("#removalPreview").innerText(), /Externes/);
    await page.locator("#removalCancel").click();
    await page.evaluate(() => (window.testDb.external = []));
    await page.locator('#list [data-kind=projects][data-id="1"]').click();
    await page.locator("[data-removal=delete]").click();
    await page.getByText(/Suppression bloquée/).waitFor();
    assert.equal(await page.locator("#removalSubmit").isDisabled(), true);
    await page.locator("#removalCancel").click();
    await page.locator("[data-removal=archive]").click();
    await page.locator("#removalConfirm").check();
    await page.locator("#removalSubmit").click();
    await page.locator("#removalDialog").waitFor({ state: "hidden" });
    // Archiving a parent must not make its active descendants disappear.
    assert.equal(
      await page.locator('#list [data-kind=tasks][data-id="1"]').isVisible(),
      true,
    );
    await page.locator('#list [data-kind=actions][data-id="3"]').click();
    await page.locator("[data-removal=delete]").click();
    await page.locator("#removalSubmit:enabled").waitFor();
    await page.locator("#removalConfirm").check();
    await page.evaluate(() => (window.rejectWrite = true));
    await page.locator("#removalSubmit").click();
    await page
      .getByText("Opération impossible : Accès refusé", { exact: true })
      .waitFor();
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.actions.length,
      3,
    );
    await page.evaluate(() => (window.rejectWrite = false));
    await page.locator("#removalSubmit").click();
    await page.locator("#removalDialog").waitFor({ state: "hidden" });
    assert.equal(
      (await page.evaluate(() => window.testDb)).data.actions.length,
      2,
    );
    console.log(
      "PASS archive/restore, retained descendants, blocked parent deletion and confirmed leaf deletion (" +
        (refs ? "references" : "codes") +
        ")",
    );
  }

  for (const refs of [false, true]) {
    await page.goto(
      "http://127.0.0.1:8766/?points=1&tree=1" + (refs ? "&refs=1" : ""),
    );
    await page.locator('#list [data-kind=projects][data-id="2"]').click();
    const meeting = page.locator('.associated-meeting[data-meeting-id="1"]');
    assert.equal(await meeting.count(), 1);
    assert.match(await meeting.innerText(), /Via le point : Sujet transversal/);
    // This project has no action and no direct meeting link: the point alone supplies the association.
    await page.evaluate((refs) => {
      const db = window.testDb;
      db.data.points.push({
        ...db.data.points[0],
        id: 2,
        Code: "D002",
        Titre: "Autre point du projet",
      });
      db.data.points.push({
        ...db.data.points[0],
        id: 3,
        Code: "D003",
        Titre: "Sujet sans rapport",
        Projets: refs ? ["L", 1] : "P001",
      });
    }, refs);
    await page.locator("#refresh").click();
    await page.waitForFunction(() =>
      document
        .querySelector('.associated-meeting[data-meeting-id="1"]')
        ?.textContent.includes("Autre point du projet"),
    );
    assert.equal(await meeting.count(), 1);
    await meeting.locator(":scope > .tree-node > .tree-row > .fold").click();
    assert.equal(
      await meeting.getByText("Sujet sans rapport", { exact: true }).count(),
      0,
    );
    await page.locator('#list [data-kind=projects][data-id="1"]').click();
    const combined = page.locator('.associated-meeting[data-meeting-id="1"]');
    assert.equal(await combined.count(), 1);
    assert.match(await combined.innerText(), /Lien direct/);
    assert.match(await combined.innerText(), /Via le point/);
    assert.match(await combined.innerText(), /Via l’action/);
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    // Moving the only relevant points to another project removes the inferred association.
    await page.evaluate((refs) => {
      for (const p of window.testDb.data.points)
        p.Projets = refs ? ["L", 1] : "P001";
    }, refs);
    await page.locator("#refresh").click();
    await page.locator('#list [data-kind=projects][data-id="2"]').click();
    assert.equal(
      await page.locator('.associated-meeting[data-meeting-id="1"]').count(),
      0,
    );
    await page.evaluate((refs) => {
      window.testDb.data.points[0].Taches = refs ? ["L", 1] : "T001";
    }, refs);
    await page.locator("#refresh").click();
    for (const kind of ["streams", "tasks"]) {
      await page
        .locator('#list [data-kind="' + kind + '"][data-id="1"]')
        .click();
      assert.match(
        await page
          .locator('.associated-meeting[data-meeting-id="1"]')
          .innerText(),
        /Via le point : Sujet transversal/,
      );
    }
    console.log(
      "PASS point-only meeting association, deduplication, reasons, scoped subjects and live reassignment (" +
        (refs ? "references" : "codes") +
        ")",
    );
  }

  await page.goto("http://127.0.0.1:8766/?broader=1&tree=1");
  await page.locator('#list [data-kind=tasks][data-id="1"]').waitFor();
  assert.match(
    await page.locator('#list [data-kind=tasks][data-id="1"]').innerText(),
    /Alice Référente/,
  );
  await page.locator('#list [data-kind=tasks][data-id="1"]').click();
  assert.match(await page.locator("#detail").innerText(), /Alice Référente/);
  await page.locator("#editionButton").click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.locator("#detail [name=Responsable]").selectOption("2");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForFunction(
    () => window.testDb.data.tasks[0].Responsable === 2,
  );
  assert.match(
    await page.locator('#list [data-kind=tasks][data-id="1"]').innerText(),
    /Camille Pilote/,
  );
  await page.evaluate(async () => {
    window.nativeTableId = "Taches";
    await window.nativeRecordCallback([{ id: 2 }]);
  });
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="1"]').count(),
    0,
  );
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="2"]').count(),
    1,
  );
  assert.equal(
    await page.locator('#list [data-kind=projects][data-id="1"]').count(),
    0,
  );
  assert.deepEqual(
    await page
      .locator("#projectFilter option")
      .evaluateAll((opts) => opts.map((o) => o.value)),
    ["", "2"],
  );
  await setQuick("projectFilter", ["2"]);
  await page.evaluate(async () => {
    window.nativeUnavailable = true;
    await window.nativeRecordCallback(window.testDb.data.tasks);
  });
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="1"]').count(),
    0,
  );
  await page.evaluate(() => (window.nativeUnavailable = false));

  await page.evaluate(async () => {
    await window.nativeRecordCallback([]);
  });
  assert.equal(await page.locator("#list [data-kind=tasks]").count(), 0);
  assert.deepEqual(
    await page
      .locator("#projectFilter option")
      .evaluateAll((opts) => opts.map((o) => o.value)),
    [""],
  );
  assert.equal(await page.locator("#projectFilter").inputValue(), "");
  await page.evaluate(async () => {
    window.nativeTableId = "Projets";
    await window.nativeRecordCallback([{ id: 1 }]);
  });
  assert.equal(
    await page.locator('#list [data-kind=projects][data-id="2"]').count(),
    0,
  );
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="1"]').count(),
    1,
  );
  await page.evaluate(async () => {
    window.nativeTableId = "NonMappedTable";
    await window.nativeRecordCallback([]);
  });
  await page.locator("#advancedFilters summary").click();
  await page.locator("#advancedKind").selectOption("tasks");
  assert.equal(
    await page.locator('#advancedField option[value="Priorite"]').count(),
    0,
  );
  await page.locator("#mappingButton").click();
  await page.locator("[data-add-extra=tasks]").click();
  await page
    .locator("[data-map=tasks][data-field=extra_1]")
    .selectOption("Priorite");
  await page
    .locator("[data-extra-kind=tasks][data-extra-label=extra_1]")
    .fill("Priorité du suivi");
  await page.locator("#applyMapping").click();
  await page.waitForFunction(() => document.querySelector("#mapping").hidden);
  await page.locator("#advancedKind").selectOption("tasks");
  assert.equal(
    await page.locator('#advancedField option[value="Priorite"]').textContent(),
    "Priorité du suivi",
  );
  await page.locator("#advancedField").selectOption("Priorite");
  await page.locator("#advancedValue").fill("Haute");
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="1"]').count(),
    1,
  );
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="2"]').count(),
    0,
  );
  await page.locator("#advancedAdd").click();
  await page.locator("#advancedKind").selectOption("streams");
  await page.locator("#advancedField").selectOption("Responsable");
  await page.locator("#advancedValue").fill("Camille");
  assert.equal(await page.locator("#list [data-kind=tasks]").count(), 0);
  await page.locator("#advancedValue").fill("Alice");
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="1"]').count(),
    1,
  );
  assert.equal(
    await page.locator("#advancedChips [data-remove-filter]").count(),
    1,
  );
  await page.locator("#advancedClear").click();
  await page.locator("#advancedFilters summary").click();
  await page.locator("#mappingButton").click();
  await page.locator("[data-map=tasks][data-field=DateFin]").selectOption("");
  await page.locator("[data-kind-label=projects]").fill("Sous-projet");
  await page.locator("[data-kind-label=streams]").fill("Jalons / Livrables");
  await page
    .locator("[data-label-kind=tasks][data-label-field=Responsable]")
    .fill("Pilote du livrable");
  await page.locator("#applyMapping").click();
  await page.waitForFunction(
    () =>
      window.testOptions.projectWorkspaceMappingV1?.projects?.label ===
      "Sous-projet",
  );
  await page.locator("#mappingButton").click();
  assert.equal(
    await page.locator("[data-map=tasks][data-field=DateFin]").inputValue(),
    "",
  );
  await page.locator("#mappingButton").click();
  await page.reload();
  await page.locator("#list [data-kind=tasks]").first().waitFor();
  await page.locator("#mappingButton").click();
  assert.equal(
    await page.locator("[data-map=tasks][data-field=DateFin]").inputValue(),
    "",
  );
  assert.equal(
    await page.locator("[data-kind-label=projects]").inputValue(),
    "Sous-projet",
  );
  await page.locator("#mappingButton").click();
  await page.locator('#list [data-kind=tasks][data-id="1"]').click();
  assert.match(await page.locator("#detail").innerText(), /Pilote du livrable/);
  await page.locator("#editionButton").click();
  const bar = page.locator("#detail [data-removal=archive]").locator("..");
  assert.equal(await bar.locator("[data-edit]").count(), 1);
  assert.equal(await bar.locator("[data-removal=delete]").count(), 1);
  assert.equal(
    await page
      .getByRole("link", { name: "Vue Table/Timeline", exact: true })
      .count(),
    1,
  );
  await page.locator("#mappingButton").click();
  await page.locator("[data-map=tasks][data-field=Titre]").selectOption("");
  await page.locator("#applyMapping").click();
  await page.waitForFunction(
    () =>
      window.testOptions.projectWorkspaceMappingV1.tasks.fields.Titre === "",
  );
  await page.reload();
  await page.locator("#list").waitFor();
  await page.locator("#mappingButton").click();
  assert.equal(
    await page.locator("[data-map=tasks][data-field=Titre]").inputValue(),
    "",
  );
  await page.locator("#mappingButton").click();
  console.log(
    "PASS reference labels and editing, native filtered/empty records, arbitrary-field filtering, persistent blank mappings, custom names and shared action toolbar",
  );

  await page.goto("http://127.0.0.1:8766/?progress=1&create=1");
  await page.locator("#list [data-kind=projects]").first().waitFor();
  await page.locator("#editionButton").click();
  await page.locator("#mappingButton").click();
  await page.locator("[data-create-progress=projects]").click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-map=projects][data-field=Avancement]")
        ?.value === "Avancement",
  );
  const createdProgress = await page.evaluate(() =>
    window.testDb.meta.find(
      (m) => m.table === "Projets" && m.colId === "Avancement",
    ),
  );
  assert.equal(createdProgress.type, "Numeric");
  assert.equal(createdProgress.isFormula, false);
  assert.equal(
    await page.locator("[data-create-progress=projects]").count(),
    0,
  );
  await page.locator("#mappingButton").click();
  await page.evaluate(() => sessionStorage.removeItem("progressOptions"));
  await page.goto("http://127.0.0.1:8766/?progress=1");
  await page.locator("#list [data-kind=projects]").first().waitFor();
  await page.locator("#mappingButton").click();
  for (const kind of ["projects", "streams", "tasks", "actions"]) {
    assert.equal(
      await page
        .locator(`[data-map=${kind}][data-field=Avancement]`)
        .inputValue(),
      "Avancement",
    );
    assert.equal(
      await page.locator(`[data-progress-base=${kind}]`).isChecked(),
      true,
    );
  }
  await page.locator("[data-progress-base=projects]").uncheck();
  await page.locator("[data-progress-base=tasks]").uncheck();
  await page.locator("#applyMapping").click();
  await page.waitForFunction(
    () =>
      window.testOptions.projectWorkspaceMappingV1?.tasks.progressBaseOne ===
      false,
  );
  assert.equal(
    await page.evaluate(
      () => window.testOptions.directMapping.levels[3].progressBaseOne,
    ),
    false,
  );
  await page.reload();
  await page.locator("#list [data-kind=projects]").first().waitFor();
  await page.locator("#editionButton").click();
  for (const [kind, view, expected] of [
    ["projects", "projects", "0,1"],
    ["streams", "projects", "10"],
    ["tasks", "projects", "0,1"],
    ["actions", "actions", "10"],
  ]) {
    await page.locator(`nav [data-view=${view}]`).click();
    await page.locator(`#list [data-kind=${kind}][data-id="1"]`).click();
    assert.match(
      await page.locator("#detail").innerText(),
      new RegExp("Avancement : " + expected + " %"),
    );
    for (const input of ["0,1", "0.1"]) {
      await page.getByRole("button", { name: "Modifier", exact: true }).click();
      assert.equal(
        await page.locator("#detail [data-slot=Avancement] input").count(),
        1,
      );
      await page.locator("#editForm [name=Avancement]").fill(input);
      await page
        .getByRole("button", { name: "Enregistrer", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelector("#editForm").parentElement.id === "editor",
      );
      assert.equal(
        await page.evaluate((k) => window.testDb.data[k][0].Avancement, kind),
        0.1,
      );
      assert.match(
        await page.locator("#detail").innerText(),
        new RegExp("Avancement : " + expected + " %"),
      );
    }
  }
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  const writesBeforeInvalidProgress = await page.evaluate(
    () => window.writes.length,
  );
  await page.locator("#editForm [name=Avancement]").fill("1,1");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  assert.match(await page.locator("#editError").innerText(), /entre 0 et 1/);
  assert.equal(
    await page.evaluate(() => window.writes.length),
    writesBeforeInvalidProgress,
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  console.log(
    "PASS progress on all four levels, real data column creation, independent persisted scales, comma/dot edits, fractional percentages and range validation",
  );

  await page.goto("http://127.0.0.1:8766/timeline.html?progress=1&refs=1");
  const timelineProject = page.locator(
    '#hierarchyTableWrap tr[data-node-id="L1:src:Projets:1"]',
  );
  await timelineProject.waitFor();
  assert.match(await timelineProject.innerText(), /0\.1%/);
  await page.locator("#tableToggleEditBtn").click();
  const timelineProjectProgress = timelineProject.locator(
    "[data-field=progress]",
  );
  assert.equal(await timelineProjectProgress.inputValue(), "0.1");
  await timelineProjectProgress.fill("0.2");
  await timelineProjectProgress.dispatchEvent("change");
  await page.waitForFunction(
    () => window.testDb.data.projects[0].Avancement === 0.2,
  );
  if (
    (await page.locator("#tableExpandAllBtn").innerText())
      .toLowerCase()
      .includes("déplier")
  )
    await page.locator("#tableExpandAllBtn").click();
  const timelineStreamProgress = page.locator(
    '#hierarchyTableWrap tr[data-node-id="L2:src:Chantiers:1"] [data-field=progress]',
  );
  assert.equal(await timelineStreamProgress.inputValue(), "10");
  await timelineStreamProgress.fill("25");
  await timelineStreamProgress.dispatchEvent("change");
  await page.waitForFunction(
    () => window.testDb.data.streams[0].Avancement === 0.25,
  );
  console.log(
    "PASS Table/Timeline displays fractional percentages and writes in the configured unit",
  );

  await page.goto("http://127.0.0.1:8766/?tree=1");
  await page.locator('#list [data-kind=tasks][data-id="1"]').click();
  await page.locator("[data-project-timeline]").click();
  const popup = page.frameLocator("#timelineFrame");
  await popup.locator(".hierarchy-table").waitFor({ state: "attached" });
  assert.equal(await popup.locator("#tableView").isVisible(), false);
  assert.equal(await popup.locator("#tableToolbarActions").isVisible(), false);
  assert.equal(await popup.locator("#ganttContainer").isVisible(), true);
  await popup.locator("#popupTableToggle").click();
  assert.equal(await popup.locator("#tableView").isVisible(), true);
  assert.equal(
    await popup.getByText("Autre projet", { exact: true }).count(),
    0,
  );
  assert.equal(
    await popup.getByText("Autre chantier", { exact: true }).count(),
    0,
  );
  if (
    (await popup.locator("#tableExpandAllBtn").innerText())
      .toLowerCase()
      .includes("déplier")
  )
    await popup.locator("#tableExpandAllBtn").click();
  assert.ok(
    (await popup.locator('tr[data-node-id^="L4:src:Actions:"]').count()) > 0,
  );
  const popupTitle = popup.locator(
    'tr[data-node-id="L3:src:Taches:1"] [data-field=name]',
  );
  assert.equal(await popupTitle.count(), 0);
  await popup.locator("#toggleDateEditBtn").click();
  await popupTitle.fill("Modification indépendante");
  await popupTitle.dispatchEvent("change");
  await page.waitForFunction(
    () => window.testDb.data.tasks[0].Titre === "Modification indépendante",
  );
  assert.equal(
    await page.locator("#editionButton").getAttribute("aria-pressed"),
    "false",
  );
  await popup.locator("#tableToggleEditBtn").click();
  assert.equal(await popupTitle.count(), 0);
  await popup.locator("#popupTableToggle").click();
  assert.equal(await popup.locator("#tableView").isVisible(), false);
  await page.locator("#timelineClose").click();
  const titleBox = await page.locator("[data-project-timeline]").boundingBox();
  const headingBox = await page
    .locator("[data-project-timeline]")
    .locator("..")
    .locator(":scope > details > summary")
    .boundingBox();
  assert.ok(
    Math.abs(
      titleBox.y + titleBox.height / 2 - headingBox.y - headingBox.height / 2,
    ) < 2,
  );
  await page.locator("#editionButton").click();
  await page.locator("[data-project-timeline]").click();
  await popup.locator(".hierarchy-table").waitFor({ state: "attached" });
  assert.equal(await popup.locator("#tableView").isVisible(), false);
  await popup.locator("#popupTableToggle").click();
  assert.equal(await popupTitle.count(), 0);
  await popup.locator("#tableToggleEditBtn").click();
  if (
    (await popup.locator("#tableExpandAllBtn").innerText())
      .toLowerCase()
      .includes("déplier")
  )
    await popup.locator("#tableExpandAllBtn").click();
  await popupTitle.fill("Tâche modifiée en popup");
  await popupTitle.dispatchEvent("change");
  await page.waitForFunction(
    () => window.testDb.data.tasks[0].Titre === "Tâche modifiée en popup",
  );
  await page.locator("#timelineClose").click();
  assert.match(
    await page.locator("#detail").innerText(),
    /Tâche modifiée en popup/,
  );
  console.log(
    "PASS aligned popup heading, collapsed table and controls, independent edition from either control, project scope and source updates",
  );

  await page.goto("http://127.0.0.1:8766/?tree=1");
  await page.locator('#list [data-kind=projects][data-id="1"]').click();
  await page.locator("#editionButton").click();
  await page.locator("#detail [data-new=actions]").click();
  const searchField = (field) =>
    page.locator(`#editForm [data-search-for="${field}"]`);
  const sourceField = (field) =>
    page.locator(`#editForm select[name="${field}"]`);
  const choices = (field) =>
    searchField(field).locator("..").locator("[role=option]");
  assert.equal(await searchField("Projet").getAttribute("role"), "combobox");
  await searchField("Projet").fill("AUTRE");
  assert.equal(await sourceField("Projet").inputValue(), "1");
  assert.deepEqual(await choices("Projet").allTextContents(), ["Autre projet"]);
  await choices("Projet").first().click();
  assert.equal(await searchField("Projet").inputValue(), "Autre projet");
  assert.equal(
    await searchField("Projet").getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(await sourceField("Projet").inputValue(), "2");
  await searchField("Chantier").fill("lancement");
  assert.equal(await choices("Chantier").count(), 0);
  assert.match(
    await searchField("Chantier").locator("..").innerText(),
    /Aucun résultat/,
  );
  await searchField("Chantier").press("Escape");
  assert.equal(
    await searchField("Chantier").getAttribute("aria-expanded"),
    "false",
  );
  await searchField("Chantier").fill("autre");
  await searchField("Chantier").press("ArrowDown");
  await searchField("Chantier").press("Enter");
  assert.equal(await sourceField("Chantier").inputValue(), "2");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(await page.evaluate(() => window.writes.length), 0);
  await page.locator("nav [data-view=notes]").click();
  await page.locator('#list [data-kind=notes][data-id="1"]').click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await sourceField("Projet").selectOption("");
  await searchField("Chantiers").fill("autre");
  await choices("Chantiers").first().click();
  assert.deepEqual(
    await sourceField("Chantiers").evaluate((el) =>
      [...el.selectedOptions].map((o) => o.value),
    ),
    ["1", "2"],
  );
  await searchField("Chantiers").fill("introuvable");
  assert.equal(await choices("Chantiers").count(), 0);
  assert.deepEqual(
    await sourceField("Chantiers").evaluate((el) =>
      [...el.selectedOptions].map((o) => o.value),
    ),
    ["1", "2"],
  );
  await searchField("Chantiers").fill("preparer");
  assert.equal(await choices("Chantiers").count(), 1);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForFunction(
    () => window.testDb.data.notes[0].Chantiers === "C001, C002",
  );
  console.log(
    "PASS single combobox field, filtered results, click/keyboard selection, hierarchy constraints, cancel and preserved multiple links",
  );

  await page.goto("http://127.0.0.1:8766/?tree=1");
  await page.locator("#list [data-kind=projects]").first().waitFor();
  await page.evaluate(() => {
    window.testDb.meta.find(
      (m) => m.table === "Actions" && m.colId === "Responsable",
    ).formula = "user.Name";
  });
  await page.locator("#mappingButton").click();
  await page.locator("#mappingButton").click();
  await page.locator("nav [data-view=actions]").click();
  await page.locator("#editionButton").click();
  await page.locator("#list [data-new=actions]").click();
  await page.locator("#editForm [name=Titre]").fill("Valeur initiale Grist");
  await page.locator("#save").click();
  await page.waitForFunction(() => window.writes.length > 0);
  assert.equal(
    Object.hasOwn(
      await page.evaluate(() => window.writes[0][3]),
      "Responsable",
    ),
    false,
  );
  await page.locator("#list [data-new=actions]").click();
  await page.locator("#editForm [name=Titre]").fill("Choix manuel");
  await page.locator("#editForm [name=Responsable]").fill("Responsable choisi");
  await page.locator("#save").click();
  await page.waitForFunction(() => window.writes.length === 2);
  assert.equal(
    await page.evaluate(() => window.writes[1][3].Responsable),
    "Responsable choisi",
  );
  console.log(
    "PASS new-row owner leaves native initial formula intact and preserves explicit owner",
  );

  await page.evaluate(() => sessionStorage.removeItem("broaderOptions"));
  await page.goto("http://127.0.0.1:8766/?broader=1&choices=1&tree=1");
  await page.locator("#list [data-kind=projects]").first().waitFor();
  await page.locator("#mappingButton").click();
  const primaryOwner = page.locator("[data-map=tasks][data-field=Responsable]");
  const externalOwner = page.locator(
    "[data-map=tasks][data-field=ResponsableDiPSi]",
  );
  await externalOwner.selectOption("Responsable");
  await page.locator("#applyMapping").click();
  assert.match(
    await page.locator("#message").innerText(),
    /deux colonnes différentes/,
  );
  await externalOwner.selectOption("");
  await primaryOwner.selectOption("");
  await primaryOwner.evaluate((el) => {
    el.value = "Responsable";
  });
  await page.locator("#applyMapping").click();
  await page.waitForFunction(
    () =>
      window.testOptions.projectWorkspaceMappingV1?.tasks.fields.Responsable ===
      "Responsable",
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.testOptions.projectWorkspaceMappingV1.tasks.fields
          .ResponsableDiPSi,
    ),
    "",
  );
  await page.reload();
  await page.locator("#list [data-kind=projects]").first().waitFor();
  await page.locator("#mappingButton").click();
  assert.equal(await primaryOwner.inputValue(), "Responsable");
  assert.equal(await externalOwner.inputValue(), "");
  await page.locator("#mappingButton").click();
  console.log(
    "PASS owner column conflict rejected and visible primary/blank external mappings persist after reload even without change event",
  );

  await page.goto("http://127.0.0.1:8766/?tree=1");
  await page.locator("#editionButton").click();
  await page.locator("#list [data-new=projects]").click();
  for (const scheme of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: scheme });
    const title = page.locator("#editForm [name=Titre]");
    const colors = await title.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        color: s.color,
        background: s.backgroundColor,
        fill: s.webkitTextFillColor,
      };
    });
    assert.equal(colors.color, "rgb(35, 51, 74)");
    assert.equal(colors.background, "rgb(255, 255, 255)");
    assert.notEqual(colors.fill, colors.background);
    const area = page.locator("#editForm textarea").first();
    if (await area.count())
      assert.equal(
        await area.evaluate((el) => getComputedStyle(el).color),
        colors.color,
      );
  }
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page
    .locator("#projectFilter")
    .locator("..")
    .locator(".quick-search")
    .fill("exemple");
  const filterColors = await page
    .locator(".quick-search")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.color, s.backgroundColor];
    });
  assert.deepEqual(filterColors, ["rgb(35, 51, 74)", "rgb(255, 255, 255)"]);
  await page.locator(".quick-search").first().press("Escape");
  await page.emulateMedia({ colorScheme: "light" });
  console.log(
    "PASS dark/light form foregrounds, backgrounds, text fill, textarea and searchable filter contrast",
  );

  await page.goto("http://127.0.0.1:8766/?tree=1");
  await page.evaluate(() =>
    Object.assign(window.testDb.data.projects[0], {
      Responsable: "",
      DateDebut: "",
      DateFin: "",
      Description: "",
      PointEtape: "",
    }),
  );
  await page.locator("#refresh").click();
  await page.locator('#list [data-kind=projects][data-id="1"]').click();
  assert.equal(await page.locator("#detail [data-slot=DateDebut]").count(), 0);
  await page.locator("#editionButton").click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  for (const field of [
    "Responsable",
    "DateDebut",
    "DateFin",
    "Description",
    "PointEtape",
  ]) {
    const fieldControl = page.locator(
      `#detail [data-slot="${field}"] [name="${field}"]`,
    );
    assert.equal(await fieldControl.isVisible(), true);
    assert.equal(
      await page.locator(`#detail [data-readonly-field="${field}"]`).count(),
      0,
    );
  }
  assert.equal(
    await page.locator("#detail [data-readonly-field=Code]").isVisible(),
    true,
  );
  await page.locator("#detail [name=Description]").fill("Description ajoutée");
  await page.locator("#detail [name=DateDebut]").fill("2026-11-14");
  await page.locator("#save").click();
  await page.waitForFunction(
    () => window.testDb.data.projects[0].Description === "Description ajoutée",
  );
  assert.equal(
    await page.evaluate(() => window.testDb.data.projects[0].DateDebut),
    Date.parse("2026-11-14T00:00:00Z") / 1000,
  );
  console.log(
    "PASS empty mapped fields visible in place during inline edit, read-only fields exposed and new values saved",
  );

  await page.goto("http://127.0.0.1:8766/?cards=1");
  const card = page.locator('#list [data-kind=tasks][data-id="1"]');
  await page.locator("#list [data-fold-all=open]").click();
  await card.waitFor();
  assert.match(await card.innerText(), /Date de début : 01\/11\/2026/);
  assert.match(await card.innerText(), /Date de fin : 20\/12\/2026/);
  assert.match(await card.innerText(), /Avancement : 0 %/);
  assert.ok((await card.boundingBox()).height < 130);
  assert.equal(await card.locator(".card-facts > .card-progress").count(), 1);
  assert.ok(
    (await card.locator(".card-field-label").allTextContents()).every((text) =>
      text.trim().endsWith(":"),
    ),
  );

  assert.match(await card.innerText(), /avant Noël/);
  assert.equal(await card.locator("img").count(), 0);
  assert.match(await card.locator(".card-excerpt").innerText(), /<img/);
  await page.evaluate(() => (window.testDb.data.tasks[0].Avancement = 0.65));
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#list [data-kind=tasks] progress")?.value === 65,
  );
  const leftBefore = (await page.locator("#list").boundingBox()).width;
  const separator = page.locator("#paneSeparator"),
    box = await separator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForFunction(() => !!window.testOptions.workspacePaneLayoutV1);
  const leftAfter = (await page.locator("#list").boundingBox()).width;
  assert.ok(leftAfter > leftBefore + 50);
  await separator.focus();
  await page.keyboard.press("ArrowLeft");
  assert.ok((await page.locator("#list").boundingBox()).width < leftAfter);
  await separator.focus();
  await page.keyboard.press("Home");
  assert.ok((await page.locator("#list").boundingBox()).width >= 259);
  await separator.focus();
  await page.keyboard.press("End");
  assert.ok((await page.locator("#detail").boundingBox()).width >= 279);
  await separator.dblclick();
  const resetWidth = (await page.locator("#list").boundingBox()).width;
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  const savedWidth = (await page.locator("#list").boundingBox()).width;
  assert.ok(savedWidth > resetWidth);
  await page.reload();
  await card.waitFor();
  assert.ok(
    Math.abs((await page.locator("#list").boundingBox()).width - savedWidth) <
      2,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await separator.isVisible(), false);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "PASS populated/zero-progress cards, escaped previews, pointer and keyboard resizing, bounds, saved ratio and mobile stacking",
  );

  await page.goto("http://127.0.0.1:8766/?resume=1");
  await page.locator('#list [data-kind=projects][data-id="1"]').waitFor();
  assert.equal(
    await page.locator('#list [data-kind=projects][data-id="2"]').count(),
    0,
  );
  await page.evaluate(async () => {
    window.scopeLeak = false;
    new MutationObserver(() => {
      if (document.querySelector('#list [data-kind=projects][data-id="2"]'))
        window.scopeLeak = true;
    }).observe(document.querySelector("#list"), {
      childList: true,
      subtree: true,
    });
    window.nativeUnavailable = true;
    await window.nativeRecordCallback(window.testDb.data.projects);
  });
  assert.equal(
    await page.locator('#list [data-kind=projects][data-id="2"]').count(),
    0,
  );
  assert.match(
    await page.locator("#message").innerText(),
    /dernier filtre conservé/,
  );
  const fetchCount = await page.evaluate(() => window.viewFetchCalls);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction((n) => window.viewFetchCalls > n, fetchCount);
  assert.equal(await page.evaluate(() => window.scopeLeak), false);
  await page.evaluate(() => {
    window.nativeUnavailable = false;
    window.nativeFilterIds = [2];
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator('#list [data-kind=projects][data-id="2"]').waitFor();
  assert.equal(
    await page.locator('#list [data-kind=projects][data-id="1"]').count(),
    0,
  );
  assert.deepEqual(
    await page
      .locator("#projectFilter option")
      .evaluateAll((opts) => opts.map((o) => o.value)),
    ["", "2"],
  );
  await page.evaluate(() => {
    window.originalViewFetcher = window.grist.viewApi.fetchSelectedTable;
    window.pendingNativeRequests = [];
    window.grist.viewApi.fetchSelectedTable = () =>
      new Promise((resolve) => window.pendingNativeRequests.push(resolve));
    window.nativeCallbacks = [
      window.nativeRecordCallback([]),
      window.nativeRecordCallback([]),
    ];
  });
  await page.waitForFunction(() => window.pendingNativeRequests.length === 2);
  await page.evaluate(() => window.pendingNativeRequests[1]({ id: [2] }));
  await page.locator('#list [data-kind=projects][data-id="2"]').waitFor();
  await page.evaluate(async () => {
    window.pendingNativeRequests[0]({ id: [1] });
    await Promise.all(window.nativeCallbacks);
    window.grist.viewApi.fetchSelectedTable = window.originalViewFetcher;
  });
  assert.equal(
    await page.locator('#list [data-kind=projects][data-id="1"]').count(),
    0,
  );
  await page.evaluate(() => {
    window.nativeFilterIds = [];
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#list [data-kind=projects]").length === 0,
  );
  await page.evaluate(async () => {
    window.nativeUnavailable = true;
    await window.nativeRecordCallback(window.testDb.data.projects);
  });
  assert.equal(await page.locator("#list [data-kind=projects]").count(), 0);
  await page.evaluate(() => {
    window.nativeUnavailable = false;
    window.nativeFilterIds = [1, 2];
    window.dispatchEvent(new Event("pageshow"));
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#list [data-kind=projects]").length === 2,
  );
  await page.goto("http://127.0.0.1:8766/?resume=1&offline=1");
  await page
    .getByText("Filtres Grist en attente de connexion.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#list [data-kind=projects]").count(), 0);
  await page.evaluate(() => {
    window.nativeUnavailable = false;
    window.dispatchEvent(new Event("online"));
  });
  await page.locator('#list [data-kind=projects][data-id="1"]').waitFor();
  assert.equal(
    await page.locator('#list [data-kind=projects][data-id="2"]').count(),
    0,
  );
  assert.equal(await page.evaluate(() => window.writes.length), 0);
  console.log(
    "PASS authoritative filtered view on startup/resume, retained scope through transient failures including zero rows, visibility/focus/online/pageshow refresh and no unfiltered startup",
  );

  await page.evaluate(() => sessionStorage.removeItem("broaderOptions"));
  await page.goto("http://127.0.0.1:8766/?broader=1&tree=1&choices=1");
  await page.locator('#list [data-kind=tasks][data-id="1"]').waitFor();
  assert.deepEqual(
    await page
      .locator("#ownerFilter option")
      .evaluateAll((opts) => opts.map((o) => o.textContent)),
    ["Tous", "Alice Référente", "Camille Pilote"],
  );
  const menu = (id) =>
    page
      .locator("#" + id)
      .locator("..")
      .locator(".quick-multiple");
  for (const id of ["projectFilter", "ownerFilter", "statusFilter"]) {
    assert.equal(await page.locator("#" + id).isVisible(), false);
    assert.equal(await menu(id).count(), 1);
    assert.equal(await menu(id).locator("summary input").inputValue(), "Tous");
  }
  for (const id of ["projectFilter", "ownerFilter", "statusFilter"]) {
    await menu(id).locator(".quick-search").fill("introuvable-xyz");
    assert.equal(
      await menu(id).locator("label:not([hidden]) [data-quick]").count(),
      0,
    );
    assert.match(
      await menu(id).locator("div > .muted").innerText(),
      /Aucun résultat/,
    );
    await menu(id).locator(".quick-search").press("Escape");
    assert.equal(await menu(id).locator(".quick-search").inputValue(), "Tous");
  }
  await menu("projectFilter").locator(".quick-search").fill("autre");
  await menu("projectFilter").locator(".quick-search").press("Enter");
  assert.equal(await page.locator("#projectFilter").inputValue(), "2");
  await menu("projectFilter").locator(".quick-search").fill("exemple");
  await menu("projectFilter").locator(".quick-search").press("Enter");
  assert.equal(
    await page.locator("#projectFilter").inputValue(),
    "__multiple__",
  );
  await menu("projectFilter").locator("[data-quick-all]").check();
  await menu("projectFilter").locator(".quick-search").press("Escape");
  await menu("projectFilter")
    .locator("summary")
    .click({ position: { x: 5, y: 10 } });
  await menu("projectFilter").locator('input[value="1"]').check();
  assert.notEqual(
    await menu("projectFilter").locator("summary input").inputValue(),
    "Tous",
  );
  await menu("projectFilter").locator('input[value="2"]').check();
  assert.equal(
    await page.locator("#projectFilter").inputValue(),
    "__multiple__",
  );
  assert.equal(await page.locator("#list [data-kind=projects]").count(), 2);
  assert.equal(
    await menu("projectFilter").locator("summary input").inputValue(),
    "2 choix",
  );
  await page.keyboard.press("Escape");
  assert.equal(await menu("projectFilter").evaluate((el) => el.open), false);
  assert.equal(
    await menu("projectFilter")
      .locator("summary input")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await menu("projectFilter")
    .locator("summary")
    .click({ position: { x: 5, y: 10 } });
  await page.locator("#search").click();
  assert.equal(await menu("projectFilter").evaluate((el) => el.open), false);
  await menu("projectFilter")
    .locator("summary")
    .click({ position: { x: 5, y: 10 } });
  await menu("ownerFilter")
    .locator("summary")
    .click({ position: { x: 5, y: 10 } });
  await menu("ownerFilter").locator('input[value="Alice Référente"]').check();
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="2"]').isVisible(),
    true,
  );
  await menu("ownerFilter").locator('input[value="Camille Pilote"]').check();
  await menu("ownerFilter")
    .locator("summary")
    .click({ position: { x: 5, y: 10 } });
  await menu("statusFilter")
    .locator("summary")
    .click({ position: { x: 5, y: 10 } });
  await menu("statusFilter").locator('input[value="En cours"]').check();
  await menu("statusFilter").locator('input[value="À faire"]').check();
  await menu("statusFilter")
    .locator("summary")
    .click({ position: { x: 5, y: 10 } });
  await setQuick("projectFilter", []);
  await setQuick("ownerFilter", []);
  await setQuick("statusFilter", []);
  await page.locator("#advancedFilters summary").click();
  await page.locator("#advancedKind").selectOption("tasks");
  await page.locator("#advancedField").selectOption("Responsable");
  assert.equal(await page.locator("#advancedChoices input").count(), 2);
  await page.locator('#advancedChoices input[value="Alice Référente"]').check();
  await page.locator('#advancedChoices input[value="Camille Pilote"]').check();
  assert.equal(await page.locator("#list [data-kind=tasks]").count(), 2);
  await page.locator("#advancedField").selectOption("ResponsableDiPSi");
  await page.locator('#advancedChoices input[value="Alice Référente"]').check();
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="1"]').count(),
    0,
  );
  assert.equal(
    await page.locator('#list [data-kind=tasks][data-id="2"]').count(),
    1,
  );
  await page.locator("#advancedAdd").click();
  assert.equal(
    await page.locator("#advancedChips [data-remove-filter]").count(),
    1,
  );
  await page.locator("#advancedClear").click();
  await page.locator("#advancedFilters summary").click();
  await page.locator("#mappingButton").click();
  assert.equal(
    await page
      .locator("[data-map=tasks][data-field=ResponsableDiPSi]")
      .inputValue(),
    "ResponsableDiPSi",
  );
  for (const [i, column] of [
    "Priorite",
    "Valide",
    "Tags",
    "Score",
    "DateRevue",
  ].entries()) {
    await page.locator("[data-add-extra=tasks]").click();
    await page
      .locator(`[data-map=tasks][data-field=extra_${i + 1}]`)
      .selectOption(column);
    await page
      .locator(`[data-extra-kind=tasks][data-extra-label=extra_${i + 1}]`)
      .fill(column === "Priorite" ? "Priorité du livrable" : column);
    await page
      .locator(`[data-extra-kind=tasks][data-extra-label=extra_${i + 1}]`)
      .press("Tab");
  }
  await page.locator("#applyMapping").click();
  await page.waitForFunction(
    () =>
      window.testOptions.projectWorkspaceMappingV1.tasks.extraFields?.length ===
      5,
  );
  await page.reload();
  await page.locator('#list [data-kind=tasks][data-id="1"]').click();
  assert.match(
    await page.locator("#detail").innerText(),
    /Responsable externe/,
  );
  assert.match(await page.locator("#detail").innerText(), /Camille Pilote/);
  assert.match(
    await page.locator("#detail").innerText(),
    /Priorité du livrable/,
  );
  await page.locator("#editionButton").click();
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.locator("#detail [name=ResponsableDiPSi]").selectOption("1");
  await page.locator("#detail [name=extra_1]").fill("Urgent");
  await page.locator("#detail [name=extra_2]").check();
  await page.locator("#detail [name=extra_3]").selectOption(["B"]);
  await page.locator("#detail [name=extra_5]").fill("2026-11-15");
  assert.equal(await page.locator("#detail [name=extra_4]").count(), 0);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForFunction(() => window.testDb.data.tasks[0].Valide === true);
  const task = await page.evaluate(() => window.testDb.data.tasks[0]);
  assert.equal(task.Priorite, "Urgent");
  assert.equal(task.ResponsableDiPSi, 1);
  assert.deepEqual(task.Tags, ["L", "B"]);
  assert.equal(task.DateRevue, Date.parse("2026-11-15T00:00:00Z") / 1000);
  assert.equal(task.Score, 2);
  await page.locator('#list [data-kind=projects][data-id="1"]').click();
  for (const name of ["dependents", "meetings", "actions"]) {
    const section = page.locator(
      `#detail details[data-section-key="section:projects:1:${name}"]`,
    );
    assert.equal((await section.getAttribute("open")) !== null, true);
    await section.locator(":scope > summary").click();
    assert.equal(await section.getAttribute("open"), null);
  }
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () =>
      !document.querySelector(
        'details[data-section-key="section:projects:1:dependents"]',
      ).open,
  );
  await page.locator('#list [data-kind=projects][data-id="2"]').click();
  await page.locator("[data-history=back]").click();
  for (const name of ["dependents", "meetings", "actions"])
    assert.equal(
      await page
        .locator(
          `#detail details[data-section-key="section:projects:1:${name}"]`,
        )
        .getAttribute("open"),
      null,
    );
  console.log(
    "PASS OR multi-choice quick/advanced filters with available values and RefLists, DiPSi ownership, persistent typed extra fields, formula protection and collapsible detail sections with history",
  );
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
  await setQuick("projectFilter", ["1"]);
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
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  phone.on("pageerror", (error) => errors.push(error.message));
  await phone.route("https://docs.getgrist.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await phone.addInitScript(setupGrist, fixture);
  await phone.goto("http://127.0.0.1:8766/?tree=1");
  await phone.locator("#list [data-kind=actions]").first().waitFor();
  assert.equal(
    await phone.locator("body").getAttribute("data-current-view"),
    "actions",
  );
  assert.equal(await phone.locator("#detail").isVisible(), false);
  for (const selector of [
    "header > div:first-child",
    "header > nav",
    "#mappingButton",
    "#refresh",
    'header > a[href="timeline.html"]',
    "#filterPanel",
  ])
    assert.equal(await phone.locator(selector).isVisible(), false);
  assert.equal(await phone.locator("#phoneNav").isVisible(), true);
  assert.equal(await phone.locator("#message").isVisible(), false);
  assert.equal(await phone.locator("#phoneSearch #search").isVisible(), true);
  await phone.locator("#search").fill("inexistant");
  assert.equal(await phone.locator("#list [data-kind=actions]").count(), 0);
  await phone.locator("#search").fill("");
  await phone.locator("#phoneFilters").click();
  assert.equal(await phone.locator("#filterPanel").isVisible(), true);
  assert.equal(await phone.locator("#showArchived").isVisible(), false);
  const filterRows = await phone
    .locator(".quick-filter")
    .evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().y),
    );
  assert.ok(Math.max(...filterRows) - Math.min(...filterRows) < 2);
  await phone.locator(".quick-multiple summary").first().tap();
  const projectChoices = phone
    .locator(".quick-multiple")
    .first()
    .locator("div");
  assert.equal(await projectChoices.isVisible(), true);
  const phoneProjectMenu = phone.locator(".quick-multiple").first();
  await phoneProjectMenu.locator(".quick-search").fill("exemple");
  await phoneProjectMenu.locator('[data-quick][value="1"]').tap();
  assert.equal(await phone.locator("#projectFilter").inputValue(), "1");
  await phoneProjectMenu.locator(".quick-search").fill("autre");
  assert.equal(
    await phoneProjectMenu.locator('[data-quick][value="1"]').isChecked(),
    true,
  );
  await phoneProjectMenu.locator(".quick-search").press("Escape");
  await phoneProjectMenu.locator("summary").tap({ position: { x: 5, y: 10 } });
  await phoneProjectMenu.locator("[data-quick-all]").tap();

  const choiceBounds = await projectChoices.boundingBox();
  assert.ok(choiceBounds.x >= 0 && choiceBounds.x + choiceBounds.width <= 390);
  await phone.locator(".quick-multiple summary").first().tap();
  await phone.screenshot({
    path: "/workspace/exports/widget-phone-filters.png",
    fullPage: true,
  });

  await phone.locator("#phoneFilters").click();
  assert.equal(await phone.locator("#filterPanel").isVisible(), false);
  await phone.locator("#editionButton").click();
  await phone.locator("#list [data-new=actions]").click();
  await phone.locator("#editor").waitFor();
  const formBounds = await phone.locator("#editor").boundingBox();
  assert.ok(formBounds.x >= 0 && formBounds.x + formBounds.width <= 391);
  await phone
    .locator("#editForm [name=Titre]")
    .fill("Action depuis le téléphone");
  const phoneSearch = (field) =>
    phone.locator(`#editForm [data-search-for="${field}"]`);
  const phoneOption = (field) =>
    phoneSearch(field).locator("..").locator("[role=option]");
  await phoneSearch("Projet").fill("autre");
  await phoneOption("Projet").first().tap();
  assert.equal(
    await phone.locator("#editForm select[name=Projet]").inputValue(),
    "2",
  );
  assert.equal(
    await phoneSearch("Projet").getAttribute("aria-expanded"),
    "false",
  );
  await phoneSearch("Projet").fill("exemple");
  // A touch browser may deliver pointerup without a compatibility click.
  await phoneOption("Projet").first().dispatchEvent("pointerdown", {
    pointerType: "touch",
    pointerId: 42,
    clientX: 10,
    clientY: 10,
  });
  await phoneOption("Projet").first().dispatchEvent("pointerup", {
    pointerType: "touch",
    pointerId: 42,
    clientX: 10,
    clientY: 10,
  });
  assert.equal(
    await phone.locator("#editForm select[name=Projet]").inputValue(),
    "1",
  );
  await phoneSearch("Chantier").fill("lancement");
  await phoneOption("Chantier").first().tap();
  assert.equal(
    await phone.locator("#editForm select[name=Chantier]").inputValue(),
    "1",
  );
  await phoneSearch("Tache").fill("confirmer");
  await phoneOption("Tache").first().tap();
  assert.equal(
    await phone.locator("#editForm select[name=Tache]").inputValue(),
    "1",
  );
  await phone.locator("#save").click();
  await phone.waitForFunction(() =>
    window.testDb.data.actions.some(
      (a) => a.Titre === "Action depuis le téléphone",
    ),
  );
  await phone.locator("#list [data-kind=actions]").first().click();
  assert.equal(await phone.locator("#list").isVisible(), false);
  assert.equal(await phone.locator("#detail").isVisible(), true);
  assert.equal(await phone.locator("#phoneBack").isVisible(), true);
  await phone.locator("#phoneBack").click();
  assert.equal(await phone.locator("#list").isVisible(), true);
  await phone.locator("#phoneNav summary").click();
  await phone.locator("#phoneNav [data-view=streams]").click();
  assert.equal(
    await phone.locator("body").getAttribute("data-current-view"),
    "streams",
  );
  await phone.locator("#list [data-kind=streams]").first().click();
  assert.equal(
    await phone.locator("[data-project-timeline]").isVisible(),
    false,
  );
  await phone.locator("#phoneBack").click();
  await phone.screenshot({
    path: "/workspace/exports/widget-phone.png",
    fullPage: true,
  });
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await phone.setViewportSize({ width: 844, height: 390 });
  assert.equal(
    await phone
      .locator("body")
      .evaluate((el) => el.classList.contains("phone-mode")),
    true,
  );
  await phoneContext.close();
  for (const [width, height, touch] of [
    [768, 1024, true],
    [600, 960, true],
    [390, 844, false],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      screen: { width, height },
      hasTouch: touch,
      isMobile: touch,
    });
    const check = await context.newPage();
    await check.route("https://docs.getgrist.com/**", (r) =>
      r.fulfill({ body: "" }),
    );
    await check.addInitScript(setupGrist, fixture);
    await check.goto("http://127.0.0.1:8766/?tree=1");
    await check.locator("#list [data-kind=projects]").first().waitFor();
    assert.equal(
      await check
        .locator("body")
        .evaluate((el) => el.classList.contains("phone-mode")),
      false,
    );
    assert.equal(await check.locator("#mappingButton").isVisible(), true);
    assert.equal(await check.locator("#refresh").isVisible(), true);
    assert.equal(await check.locator("#phoneNav").isVisible(), false);
    assert.equal(await check.locator("#detail").isVisible(), true);
    assert.equal(await check.locator(".filters #search").isVisible(), true);
    assert.equal(await check.locator("#showArchived").isVisible(), true);
    assert.equal(await check.locator("#message").isVisible(), true);
    await context.close();
  }
  console.log(
    "PASS phone touch-only layout, default Actions, grouped navigation/filters, quick creation, single panes/back, hidden timelines, landscape and unchanged tablet/narrow desktop",
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
