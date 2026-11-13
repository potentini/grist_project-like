const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1200 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://docs.getgrist.com/**", (r) =>
      r.fulfill({ body: "" }),
    );
    await page.addInitScript(() => {
      const tables = [
        { id: 1, tableId: "Projets" },
        { id: 2, tableId: "Chantiers" },
        { id: 3, tableId: "Taches" },
      ];
      const db = {
        Projets: [
          { id: 1, Titre: "Zeta" },
          { id: 2, Titre: "Alpha" },
        ],
        Chantiers: [
          { id: 1, Titre: "Z chantier", Projet: 1 },
          { id: 2, Titre: "A chantier", Projet: 1, DateFin: "2026-09-20" },
        ],
        Taches: [
          {
            id: 1,
            Titre: "Tard",
            Chantier: 1,
            DateFin: "2026-12-20",
            Ordre: 1,
            Priorite: "Basse",
            Avancement: 0.1,
          },
          {
            id: 2,
            Titre: "Tôt",
            Chantier: 1,
            DateFin: "2026-11-20",
            Ordre: 2,
            Priorite: "Haute",
            Avancement: 0.2,
          },
          {
            id: 3,
            Titre: "Sans date",
            Chantier: 1,
            Ordre: 3,
            Priorite: "Basse",
          },
        ],
      };
      let next = 0;
      const meta = tables.flatMap((t) =>
        [
          "Titre",
          "Projet",
          "Chantier",
          "DateDebut",
          "DateFin",
          "Ordre",
          "Priorite",
          "Avancement",
        ].map((colId) => ({
          id: ++next,
          parentId: t.id,
          table: t.tableId,
          colId,
          label: colId,
          type:
            colId === "Projet"
              ? "Ref:Projets"
              : colId === "Chantier"
                ? "Ref:Chantiers"
                : colId === "Ordre" || colId === "Avancement"
                  ? "Numeric"
                  : colId === "Priorite"
                    ? "Choice"
                    : "Text",
          isFormula: false,
          widgetOptions:
            colId === "Priorite"
              ? JSON.stringify({ choices: ["Haute", "Basse"] })
              : "",
        })),
      );
      const kinds = ["projects", "streams", "tasks"];
      const mapping = Object.fromEntries(
        kinds.map((k, i) => [
          k,
          {
            table: tables[i].tableId,
            fields: {
              Titre: "Titre",
              DateDebut: "DateDebut",
              DateFin: "DateFin",
              Ordre: "Ordre",
              Projet: i === 1 ? "Projet" : "",
              Chantier: i === 2 ? "Chantier" : "",
              Avancement: "Avancement",
              extra_priority: "Priorite",
            },
            extraFields: [{ id: "extra_priority", label: "Priorité" }],
            progressBaseOne: true,
          },
        ]),
      );
      const levels = Object.fromEntries(
        kinds.map((k, i) => [
          i + 1,
          {
            tableId: tables[i].tableId,
            nameCol: "Titre",
            parentCol: i === 1 ? "Projet" : "Chantier",
            startCol: "DateDebut",
            endCol: "DateFin",
            progressCol: "Avancement",
            progressBaseOne: true,
            orderCol: "Ordre",
            priorityCol: "Priorite",
          },
        ]),
      );
      window.db = db;
      window.writes = [];
      let opts = JSON.parse(
        sessionStorage.getItem("sorting-options") || "null",
      ) || { projectWorkspaceMappingV1: mapping, directMapping: { levels } };
      let callback;
      window.grist = {
        ready() {},
        onOptions(cb) {
          callback = cb;
          cb(opts);
        },
        onRecords(cb) {
          if (
            location.pathname.endsWith("timeline.html") ||
            location.port === "8767"
          )
            cb([]);
        },
        selectedTable: { getTableId: async () => null },
        getOption: async (key) => opts[key],
        setOption: async (key, value) => {
          opts = { ...opts, [key]: value };
          sessionStorage.setItem("sorting-options", JSON.stringify(opts));
          callback(opts);
        },
        docApi: {
          fetchTable: async (id) =>
            id === "_grist_Tables"
              ? tables
              : id === "_grist_Tables_column"
                ? meta
                : db[id] || [],
          applyUserActions: async (actions) => {
            window.writes.push(...actions);
            for (const [op, table, id, fields] of actions)
              if (op === "UpdateRecord")
                Object.assign(
                  db[table].find((r) => r.id === id),
                  fields,
                );
            return [];
          },
        },
      };
    });
    const tracking = "http://127.0.0.1:8766/";
    await page.goto(tracking);
    await page.locator("#list [data-kind=projects]").first().waitFor();
    const roots = () =>
      page
        .locator("#list > .tree-node")
        .evaluateAll((rows) => rows.map((r) => Number(r.dataset.treeId)));
    assert.deepEqual(await roots(), [2, 1]);
    await page.locator("#list [data-fold-all=open]").click();
    const trackingTasks = () =>
      page
        .locator("#list [data-tree-kind=tasks]")
        .evaluateAll((rows) => rows.map((r) => Number(r.dataset.treeId)));
    assert.deepEqual(await trackingTasks(), [2, 1, 3]);
    assert.deepEqual(
      await page
        .locator("#list [data-tree-kind=streams]")
        .evaluateAll((rows) => rows.map((r) => Number(r.dataset.treeId))),
      [2, 1],
    );
    await page.locator("#hierarchySortSettings summary").click();
    await page.locator("#trackingChildSort").selectOption("priority");
    assert.deepEqual(await trackingTasks(), [2, 3, 1]);
    await page.locator("#trackingChildSort").selectOption("manual");
    assert.deepEqual(await trackingTasks(), [1, 2, 3]);
    await page.locator("#trackingChildSort").selectOption("end");
    await page.goto(tracking + "timeline.html");
    await page.locator(".hierarchy-table").waitFor();
    if (
      (await page.locator("#tableExpandAllBtn").innerText()).includes("déplier")
    )
      await page.locator("#tableExpandAllBtn").click();
    const timelineTasks = () =>
      page
        .locator('tr[data-node-id^="L3:src:Taches:"]')
        .evaluateAll((rows) =>
          rows.map((r) => Number(r.dataset.nodeId.split(":").pop())),
        );
    assert.deepEqual(await timelineTasks(), [2, 1, 3]);
    await page.locator("#timelineDateSortSelect").selectOption("manual");
    assert.deepEqual(await timelineTasks(), [1, 2, 3]);
    await page.goto(tracking);
    await page.locator("#list [data-kind=projects]").first().waitFor();
    await page.locator("#list [data-fold-all=open]").click();
    assert.deepEqual(await trackingTasks(), [1, 2, 3]);
    await page.locator('#list [data-kind=tasks][data-id="1"]').click();
    await page.locator("#editionButton").click();
    await page.locator("[data-project-timeline]").click();
    const popup = page.frameLocator("#timelineFrame");
    await popup.locator("#timelineDateSortSelect").waitFor();
    await popup.locator("#timelineDateSortSelect").selectOption("end");
    await page.locator("#timelineClose").click();
    assert.equal(await page.locator("#trackingChildSort").inputValue(), "end");
    assert.deepEqual(await trackingTasks(), [2, 1, 3]);
    // The same source and controls in the original dual-widget repository.
    await page.goto("http://127.0.0.1:8767/");
    await page.locator(".hierarchy-table").waitFor();
    if (
      (await page.locator("#tableExpandAllBtn").innerText()).includes("déplier")
    )
      await page.locator("#tableExpandAllBtn").click();
    assert.deepEqual(await timelineTasks(), [2, 1, 3]);
    await page.locator("#timelineDateSortSelect").selectOption("priority");
    assert.deepEqual(await timelineTasks(), [2, 3, 1]);
    await page.locator("#tableToggleEditBtn").click();
    const progress = page.locator(
      'tr[data-node-id="L3:src:Taches:1"] [data-field=progress]',
    );
    assert.equal(await progress.inputValue(), "10");
    await progress.fill("35");
    await progress.dispatchEvent("change");
    await page.waitForFunction(() => window.db.Taches[0].Avancement === 0.35);
    await page.emulateMedia({ colorScheme: "dark" });
    assert.deepEqual(
      await progress.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.color, s.backgroundColor];
      }),
      ["rgb(241, 245, 249)", "rgb(31, 41, 55)"],
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS shared hierarchical ordering, parent date fallback, undated last, priority/manual, persisted tracking/timeline/popup settings and original-repo editing",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
