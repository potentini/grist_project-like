module.exports = () => {
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
  window.timelineMeta = meta;
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
};
