/* Grist remains the source of truth. Only mapping is stored in widget options. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  const schemas = {
    projects: {
      label: "Projets",
      aliases: ["Projets", "Projet", "Projects"],
      fields: [
        "Code",
        "Titre",
        "Description",
        "Responsable",
        "DateDebut",
        "DateFin",
        "Statut",
        "PointEtape",
      ],
    },
    streams: {
      label: "Chantiers",
      aliases: ["Chantiers", "Chantier"],
      fields: [
        "Code",
        "Titre",
        "Projet",
        "Volet",
        "Nature",
        "Responsable",
        "DateDebut",
        "DateFin",
        "Echeance",
        "Statut",
        "Vigilance",
        "Avancement",
        "PointEtape",
        "Ordre",
      ],
    },
    tasks: {
      label: "Tâches",
      aliases: ["Taches", "Tache", "Tasks"],
      fields: [
        "Code",
        "Titre",
        "Chantier",
        "Responsable",
        "DateDebut",
        "DateFin",
        "Echeance",
        "Statut",
        "Vigilance",
        "Avancement",
        "PointEtape",
        "Ordre",
      ],
    },
    notes: {
      label: "Notes et réunions",
      aliases: ["Notes", "Reunions"],
      fields: [
        "Code",
        "Titre",
        "Type",
        "Date",
        "DateSource",
        "Instance",
        "Participants",
        "Contenu",
        "Etat",
        "Projet",
        "Chantiers",
        "Taches",
      ],
    },
    actions: {
      label: "Actions",
      aliases: ["Actions", "Action", "Todos"],
      fields: [
        "Code",
        "Titre",
        "Responsable",
        "Statut",
        "DateFin",
        "Echeance",
        "Commentaire",
        "NoteOrigine",
        "Projet",
        "Chantier",
        "Tache",
      ],
    },
  };
  const aliases = {
    Titre: ["Titre", "Nom", "Name", "Title", "Tache"],
    Responsable: ["Responsable", "Owner", "AssignedTo"],
    DateDebut: ["DateDebut", "Debut", "StartDate"],
    DateFin: ["DateFin", "Deadline", "Fin", "DueDate"],
    Contenu: ["Contenu", "CompteRendu", "Notes", "Texte"],
    PointEtape: ["PointEtape", "PointDEtape"],
    NoteOrigine: ["NoteOrigine", "Reunion", "Note"],
    Echeance: ["Echeance", "DeadlineTexte"],
  };
  const links = {
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
  const multi = new Set(["Chantiers", "Taches"]);
  const textareas = new Set([
    "Contenu",
    "Description",
    "PointEtape",
    "Commentaire",
  ]);
  let mapping = {},
    draft = {},
    meta = [],
    tables = [],
    data = {},
    view = "projects",
    selection = null,
    editing = null,
    busy = false,
    loaded = false,
    request = 0;
  const optionKey = "projectWorkspaceMappingV1";
  const demo = new URLSearchParams(location.search).has("demo");
  function message(s, error = false) {
    $("message").textContent = s;
    $("message").classList.toggle("error", error);
  }
  function rows(t) {
    if (Array.isArray(t)) return t;
    return (t?.id || []).map((_, i) =>
      Object.fromEntries(Object.keys(t).map((k) => [k, t[k][i]])),
    );
  }
  function cfg(k) {
    return mapping[k] || { fields: {} };
  }
  function col(k, f) {
    return meta.find(
      (c) => c.table === cfg(k).table && c.colId === cfg(k).fields?.[f],
    );
  }
  function val(k, r, f) {
    return r?.[cfg(k).fields?.[f]] ?? "";
  }
  function title(k, r) {
    return val(k, r, "Titre") || val(k, r, "Code") || `Ligne ${r.id}`;
  }
  function values(v) {
    return Array.isArray(v)
      ? v.filter((x, i) => !(i === 0 && x === "L"))
      : v === "" || v == null
        ? []
        : [v];
  }
  function targets(k, r, f) {
    const target = links[k]?.[f];
    if (!target) return [];
    const raw = values(val(k, r, f)).flatMap((x) =>
      multi.has(f) && typeof x === "string"
        ? x.split(",").map((s) => s.trim())
        : [x],
    );
    const ref = /^Ref(List)?:/.test(col(k, f)?.type || "");
    return (data[target] || []).filter((row) =>
      raw.some((x) =>
        ref
          ? Number(x) === row.id
          : String(x) === String(val(target, row, "Code")),
      ),
    );
  }
  function has(k, r, f, target) {
    return !!target && targets(k, r, f).some((x) => x.id === target.id);
  }
  function projectOf(k, r) {
    if (k === "projects") return r;
    if (k === "tasks") {
      const s = targets(k, r, "Chantier")[0];
      return s && projectOf("streams", s);
    }
    if (k === "notes") {
      const p = targets(k, r, "Projet")[0];
      if (p) return p;
      const t = targets(k, r, "Taches")[0];
      if (t) return projectOf("tasks", t);
      const s = targets(k, r, "Chantiers")[0];
      if (s) return projectOf("streams", s);
    }
    if (k === "actions") {
      const t = targets(k, r, "Tache")[0];
      if (t) return projectOf("tasks", t);
      const s = targets(k, r, "Chantier")[0];
      if (s) return projectOf("streams", s);
    }
    return targets(k, r, "Projet")[0];
  }
  function dateText(v) {
    if (v === "" || v == null) return "";
    if (typeof v === "number")
      return new Date(v * 1000).toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  }
  function overdue(r) {
    const d = dateText(val("actions", r, "DateFin"));
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      d < today &&
      !["fait", "abandonne"].includes(norm(val("actions", r, "Statut")))
    );
  }
  function ordered(k) {
    return [...(data[k] || [])].sort((a, b) =>
      k === "notes"
        ? dateText(val(k, b, "Date")).localeCompare(dateText(val(k, a, "Date")))
        : Number(val(k, a, "Ordre") || a.id) -
          Number(val(k, b, "Ordre") || b.id),
    );
  }
  function matches(k, r) {
    const p = $("projectFilter").value,
      o = $("ownerFilter").value,
      s = $("statusFilter").value,
      q = norm($("search").value);
    return (
      (!p || projectOf(k, r)?.id === Number(p)) &&
      (!o || String(val(k, r, "Responsable")) === o) &&
      (!s || String(val(k, r, k === "notes" ? "Etat" : "Statut")) === s) &&
      (!q ||
        norm(
          Object.keys(cfg(k).fields || {})
            .map((f) => val(k, r, f))
            .join(" "),
        ).includes(q)) &&
      (view !== "actions" ||
        ((!$("unlinked").checked ||
          (!targets(k, r, "Projet").length &&
            !targets(k, r, "Chantier").length &&
            !targets(k, r, "Tache").length)) &&
          (!$("overdue").checked || overdue(r))))
    );
  }
  function item(k, r, level = 0) {
    return `<button class="item level${level} ${selection?.k === k && selection.id === r.id ? "selected" : ""}" data-kind="${k}" data-id="${r.id}"><strong>${esc(title(k, r))}</strong><small>${esc([val(k, r, "Volet"), val(k, r, "Responsable"), dateText(val(k, r, "Date")) || val(k, r, "Echeance") || dateText(val(k, r, "DateFin"))].filter(Boolean).join(" · "))}</small>${[
      val(k, r, "Statut") || val(k, r, "Etat"),
      val(k, r, "Vigilance"),
    ]
      .filter(Boolean)
      .map((x) => `<span class="badge">${esc(x)}</span>`)
      .join(
        "",
      )}${k === "actions" && overdue(r) ? '<span class="badge late">En retard</span>' : ""}</button>`;
  }
  function filterOptions() {
    const k = view === "projects" ? "streams" : view;
    for (const [id, opts] of [
      [
        "projectFilter",
        (data.projects || []).map((r) => [r.id, title("projects", r)]),
      ],
      [
        "ownerFilter",
        [
          ...new Set(
            (data[k] || [])
              .map((r) => val(k, r, "Responsable"))
              .filter(Boolean),
          ),
        ]
          .sort()
          .map((x) => [x, x]),
      ],
      [
        "statusFilter",
        [
          ...new Set(
            (data[k] || [])
              .map((r) => val(k, r, k === "notes" ? "Etat" : "Statut"))
              .filter(Boolean),
          ),
        ]
          .sort()
          .map((x) => [x, x]),
      ],
    ]) {
      const old = $(id).value;
      $(id).innerHTML =
        '<option value="">Tous</option>' +
        opts
          .map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`)
          .join("");
      $(id).value = old;
    }
  }
  function render() {
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("unlinked").closest("label").hidden = view !== "actions";
    $("overdue").closest("label").hidden = view !== "actions";
    let html = "";
    if (view === "projects") {
      const seenS = new Set(),
        seenT = new Set();
      for (const p of ordered("projects")) {
        const streams = ordered("streams").filter((s) =>
          has("streams", s, "Projet", p),
        );
        const branches = streams
          .map((s) => {
            seenS.add(s.id);
            const tasks = ordered("tasks").filter((t) =>
              has("tasks", t, "Chantier", s),
            );
            tasks.forEach((t) => seenT.add(t.id));
            const matching = tasks.filter((t) => matches("tasks", t));
            return matches("streams", s) || matching.length
              ? item("streams", s, 2) +
                  matching.map((t) => item("tasks", t, 3)).join("")
              : "";
          })
          .join("");
        if (branches || matches("projects", p))
          html += item("projects", p, 1) + branches;
      }
      const orphans = [
        ...ordered("streams")
          .filter((r) => !seenS.has(r.id))
          .map((r) => ["streams", r]),
        ...ordered("tasks")
          .filter((r) => !seenT.has(r.id))
          .map((r) => ["tasks", r]),
      ].filter(([k, r]) => matches(k, r));
      if (orphans.length)
        html +=
          "<h3>Éléments sans parent reconnu</h3>" +
          orphans.map(([k, r]) => item(k, r)).join("");
    } else
      html = ordered(view)
        .filter((r) => matches(view, r))
        .map((r) => item(view, r))
        .join("");
    $("list").innerHTML =
      `<div class="actions"><button data-new="${view === "projects" ? "projects" : view}">+ ${view === "projects" ? "Projet" : view === "notes" ? "Note / réunion" : "Action"}</button></div>` +
      (html ||
        '<p class="empty">Aucun élément. Vérifiez le mapping ou ajustez les filtres.</p>');
    renderDetail();
  }
  function linkedTo(k, r, kind, row) {
    if (k === "projects") return projectOf(kind, row)?.id === r.id;
    if (k === "streams")
      return (
        has(kind, row, kind === "notes" ? "Chantiers" : "Chantier", r) ||
        (kind === "actions" &&
          targets(kind, row, "Tache").some((t) =>
            has("tasks", t, "Chantier", r),
          )) ||
        (kind === "notes" &&
          targets(kind, row, "Taches").some((t) =>
            has("tasks", t, "Chantier", r),
          ))
      );
    if (k === "tasks")
      return has(kind, row, kind === "notes" ? "Taches" : "Tache", r);
    return (
      k === "notes" && kind === "actions" && has(kind, row, "NoteOrigine", r)
    );
  }
  function renderDetail() {
    const k = selection?.k,
      r = (data[k] || []).find((r) => r.id === selection.id);
    if (!r) {
      $("detail").innerHTML =
        '<h2>Votre espace de suivi</h2><p class="text muted">Sélectionnez un projet, une réunion ou une action pour lire son contenu et retrouver ses liens.</p>';
      return;
    }
    let html = `<small>${esc(schemas[k].label)}</small><h2>${esc(title(k, r))}</h2><button data-edit="1">Modifier</button>`;
    html +=
      '<dl class="meta">' +
      [
        "Type",
        "Volet",
        "Nature",
        "Responsable",
        "Participants",
        "Date",
        "DateSource",
        "DateDebut",
        "DateFin",
        "Echeance",
        "Statut",
        "Etat",
        "Vigilance",
      ]
        .filter((f) => val(k, r, f) !== "")
        .map(
          (f) =>
            `<dt>${esc(f)}</dt><dd>${esc(f.startsWith("Date") && f !== "DateSource" ? dateText(val(k, r, f)) : val(k, r, f))}</dd>`,
        )
        .join("") +
      "</dl>";
    for (const f of Object.keys(links[k] || {})) {
      const target = links[k][f],
        rs = targets(k, r, f);
      if (rs.length)
        html += `<h3>${esc(f)}</h3>` + rs.map((x) => item(target, x)).join("");
    }
    const progress = val(k, r, "Avancement");
    if (progress !== "" && Number.isFinite(Number(progress))) {
      const percent = Math.round(Number(progress) * 100);
      html += `<p>Avancement : ${percent} %</p><progress max="100" value="${percent}"></progress>`;
    }
    for (const f of ["Description", "Contenu", "PointEtape", "Commentaire"])
      if (val(k, r, f))
        html += `<h3>${esc(f === "Contenu" ? "Notes et décisions" : f)}</h3><div class="text">${esc(val(k, r, f))}</div>`;
    if (["projects", "streams", "tasks"].includes(k))
      html += `<div class="actions">${k !== "tasks" ? `<button data-new="${k === "projects" ? "streams" : "tasks"}">+ ${k === "projects" ? "Chantier" : "Tâche"}</button>` : ""}<button data-new="notes">+ Note</button><button data-new="actions">+ Action</button></div>`;
    if (k === "notes")
      html +=
        '<div class="actions"><button data-new="actions">+ Action issue de cette note</button></div>';
    if (k !== "actions") {
      let actions = (data.actions || []).filter((x) =>
        linkedTo(k, r, "actions", x),
      );
      let notes = (data.notes || []).filter(
        (x) =>
          linkedTo(k, r, "notes", x) ||
          actions.some((a) => has("actions", a, "NoteOrigine", x)),
      );
      if (k !== "notes")
        html +=
          "<h3>Notes et réunions associées</h3>" +
          (notes.map((x) => item("notes", x)).join("") ||
            '<p class="muted">Aucune note liée.</p>');
      html +=
        "<h3>Actions associées</h3>" +
        (actions.map((x) => item("actions", x)).join("") ||
          '<p class="muted">Aucune action liée.</p>');
    }
    $("detail").innerHTML = html;
  }
  async function load() {
    const token = ++request;
    try {
      const pairs = await Promise.all(
        Object.keys(schemas).map(async (k) => [
          k,
          cfg(k).table ? rows(await grist.docApi.fetchTable(cfg(k).table)) : [],
        ]),
      );
      if (token !== request) return;
      data = Object.fromEntries(pairs);
      filterOptions();
      render();
      message(
        demo
          ? "Démonstration : données fictives, édition désactivée."
          : Object.keys(schemas).filter(
                (k) => !cfg(k).table || !cfg(k).fields?.Titre,
              ).length
            ? "Mapping incomplet : choisissez les tables et leurs champs."
            : `Données actualisées — ${Object.values(data).reduce((n, r) => n + r.length, 0)} lignes chargées.`,
      );
    } catch (e) {
      message("Chargement impossible : " + e.message, true);
    }
  }
  function detect(d) {
    const copy = structuredClone(d);
    for (const [k, s] of Object.entries(schemas)) {
      copy[k] ||= { table: "", fields: {} };
      const c = copy[k];
      if (!c.table) {
        const found = tables.filter((t) =>
          s.aliases.some(
            (a) => norm(a) === norm(t.label) || norm(a) === norm(t.tableId),
          ),
        );
        if (found.length === 1) c.table = found[0].tableId;
      }
      c.fields ||= {};
      for (const f of s.fields) {
        if (c.fields[f]) continue;
        const names = aliases[f] || [f];
        const columns = meta.filter((x) => x.table === c.table);
        const exact = columns.filter((x) => norm(x.colId) === norm(f));
        const labels = columns.filter((x) => norm(x.label) === norm(f));
        const found = exact.length
          ? exact
          : labels.length
            ? labels
            : columns.filter((x) =>
                names.some(
                  (a) => norm(a) === norm(x.colId) || norm(a) === norm(x.label),
                ),
              );
        if (found.length === 1) c.fields[f] = found[0].colId;
      }
    }
    return copy;
  }
  function mappingUI() {
    const options = (opts, v) =>
      '<option value="">— Non mappé —</option>' +
      opts
        .map(
          ([id, label]) =>
            `<option value="${esc(id)}" ${v === id ? "selected" : ""}>${esc(label)}</option>`,
        )
        .join("");
    $("mapping").innerHTML =
      '<h2>Tables et champs</h2><p>La détection conserve vos choix. Un champ vide est facultatif, sauf Titre. Mappez les parents pour construire la hiérarchie. Les colonnes de formule sont lisibles et restent protégées en édition.</p><div class="actions"><button id="detect">Détecter les champs manquants</button><button id="applyMapping">Enregistrer le mapping</button></div><div class="grid">' +
      Object.entries(schemas)
        .map(([k, s]) => {
          const c = draft[k] || { fields: {} };
          return (
            `<fieldset><legend>${esc(s.label)}</legend><label>Table<select data-map="${k}" data-field="table">${options(
              tables.map((t) => [t.tableId, t.label || t.tableId]),
              c.table,
            )}</select></label>` +
            s.fields
              .map(
                (f) =>
                  `<label>${esc(f)}${f === "Titre" ? " *" : ""}<select data-map="${k}" data-field="${f}">${options(
                    meta
                      .filter((x) => x.table === c.table)
                      .map((x) => [x.colId, x.label || x.colId]),
                    c.fields?.[f],
                  )}</select></label>`,
              )
              .join("") +
            "</fieldset>"
          );
        })
        .join("") +
      "</div>";
  }
  function linkValue(target, r, sourceKind, field) {
    const type = col(sourceKind, field)?.type || "";
    if (/^Ref(List)?:/.test(type)) return r.id;
    const code = val(target, r, "Code");
    if (!code)
      throw Error(
        "Mappez Code dans " +
          schemas[target].label +
          " ou utilisez une référence Grist.",
      );
    return code;
  }
  function openEditor(k, r = null) {
    if (demo) {
      message(
        "La démonstration est en lecture seule. Connectez le widget à Grist pour modifier les données.",
      );
      return;
    }
    if (!cfg(k).table || !cfg(k).fields?.Titre) {
      message(
        "Mappez la table et le titre de " +
          schemas[k].label +
          " avant de créer ou modifier.",
        true,
      );
      return;
    }
    editing = { k, r };
    $("editorTitle").textContent =
      (r ? "Modifier — " : "Créer — ") + schemas[k].label;
    $("editError").textContent = "";
    const context =
      selection && (data[selection.k] || []).find((x) => x.id === selection.id);
    $("fields").innerHTML = schemas[k].fields
      .filter(
        (f) =>
          cfg(k).fields?.[f] && !col(k, f)?.isFormula && !(r && f === "Code"),
      )
      .map((f) => {
        let v = r ? val(k, r, f) : "";
        if (!r && f === "Code") {
          const prefix = {
            projects: "P",
            streams: "C",
            tasks: "T",
            notes: "N",
            actions: "A",
          }[k];
          const used = new Set(
            (data[k] || []).map((x) => String(val(k, x, "Code"))),
          );
          let n = 1;
          while (used.has(prefix + String(n).padStart(3, "0"))) n++;
          v = prefix + String(n).padStart(3, "0");
        }
        const m = col(k, f),
          type = m?.type || "",
          target = links[k]?.[f];
        let input;
        if (target) {
          const rows = data[target] || [];
          let selected = r ? targets(k, r, f).map((x) => x.id) : [];
          const sourceLinks = values(v)
            .flatMap((x) =>
              multi.has(f) && typeof x === "string"
                ? x.split(",").map((s) => s.trim())
                : [x],
            )
            .filter((x) => x !== 0);
          const unresolved = !!r && sourceLinks.length !== selected.length;
          if (!r && context && target === selection.k) selected = [context.id];
          input =
            `<select name="${f}" ${multi.has(f) ? "multiple" : ""}><option value="">— Aucun —</option>${unresolved ? '<option value="unresolved" selected>Lien non reconnu — choisir le rattachement</option>' : ""}` +
            rows
              .map(
                (x) =>
                  `<option value="${x.id}" ${selected.includes(x.id) ? "selected" : ""}>${esc(title(target, x))}</option>`,
              )
              .join("") +
            "</select>";
        } else if (f.startsWith("Date") && f !== "DateSource")
          input = `<input type="date" name="${f}" value="${esc(dateText(v))}">`;
        else if (textareas.has(f))
          input = `<textarea name="${f}">${esc(v)}</textarea>`;
        else if (type === "Choice") {
          let choices = [];
          try {
            choices = JSON.parse(m.widgetOptions || "{}").choices || [];
          } catch {}
          if (v && !choices.includes(v)) choices.push(v);
          input =
            `<select name="${f}"><option value=""></option>` +
            choices
              .map(
                (x) =>
                  `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`,
              )
              .join("") +
            "</select>";
        } else if (/^Ref/.test(type)) {
          input = `<input value="Référence : modifier dans la table Grist" disabled>`;
        } else if (
          f === "Avancement" ||
          f === "Ordre" ||
          /^(Numeric|Int)$/.test(type)
        )
          input = `<input name="${f}" type="number" step="any" ${f === "Avancement" ? 'min="0" max="1"' : ""} value="${esc(v)}">`;
        else
          input = `<input name="${f}" ${f === "Titre" ? "required" : ""} value="${esc(v)}">`;
        return `<label>${esc(f)}${f === "Avancement" ? " (0 à 1 ; 0,5 = 50 %)" : ""}${input}</label>`;
      })
      .join("");
    $("editor").showModal();
  }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("save").disabled = true;
    try {
      const { k, r } = editing,
        fields = {};
      for (const f of schemas[k].fields) {
        const el = $("editForm").elements.namedItem(f);
        if (!el) continue;
        const m = col(k, f);
        if (m?.isFormula) continue;
        let v = el.value;
        const target = links[k]?.[f];
        if (target) {
          const ids = multi.has(f)
            ? [...el.selectedOptions].map((o) => o.value).filter(Boolean)
            : v
              ? [v]
              : [];
          if (ids.includes("unresolved"))
            throw Error(
              "Vérifiez le rattachement " +
                f +
                " : le lien existant ne peut pas être résolu.",
            );
          const records = ids.map((id) =>
            (data[target] || []).find((x) => x.id === Number(id)),
          );
          const converted = records.map((row) => linkValue(target, row, k, f));
          v = /^RefList:/.test(m?.type || "")
            ? ["L", ...converted]
            : /^Ref:/.test(m?.type || "")
              ? converted[0] || 0
              : multi.has(f)
                ? converted.join(", ")
                : converted[0] || "";
        } else if (f.startsWith("Date") && f !== "DateSource")
          v = v
            ? /^Date/.test(m?.type || "")
              ? Date.parse(v + "T00:00:00Z") / 1000
              : v
            : null;
        else if (
          f === "Avancement" ||
          f === "Ordre" ||
          /^(Numeric|Int)$/.test(m?.type || "")
        )
          v = v === "" ? null : Number(v);
        fields[cfg(k).fields[f]] = v;
      }
      // A precise target determines its ancestors, avoiding contradictory links.
      if (k === "actions")
        for (const [child, target, parent] of [
          ["Tache", "tasks", "Chantier"],
          ["Chantier", "streams", "Projet"],
        ]) {
          const childEl = $("editForm").elements.namedItem(child);
          if (childEl?.value) {
            const row = (data[target] || []).find(
                (x) => x.id === Number(childEl.value),
              ),
              ancestor = targets(target, row, parent)[0];
            if (cfg(k).fields?.[parent] && !col(k, parent)?.isFormula)
              fields[cfg(k).fields[parent]] = ancestor
                ? linkValue(links[k][parent], ancestor, k, parent)
                : /^Ref:/.test(col(k, parent)?.type || "")
                  ? 0
                  : "";
            const parentEl = $("editForm").elements.namedItem(parent);
            if (parentEl) parentEl.value = ancestor ? String(ancestor.id) : "";
          }
        }
      await grist.docApi.applyUserActions([
        [r ? "UpdateRecord" : "AddRecord", cfg(k).table, r?.id ?? null, fields],
      ]);
      $("editor").close();
      await load();
    } catch (err) {
      $("editError").textContent = "Enregistrement impossible : " + err.message;
    } finally {
      busy = false;
      $("save").disabled = false;
    }
  }
  async function init() {
    try {
      if (demo) {
        const response = await fetch("demo.json");
        if (!response.ok) throw Error("Données de démonstration indisponibles");
        const fixture = await response.json();
        tables = fixture.tables;
        meta = fixture.meta;
        mapping = detect({});
        data = fixture.data;
        filterOptions();
        render();
        message("Démonstration : données fictives, édition désactivée.");
        return;
      }
      if (!window.grist)
        throw Error(
          "Ouvrez cette page dans un widget Grist avec accès complet, ou ajoutez ?demo=1 pour la démonstration.",
        );
      grist.ready({ requiredAccess: "full" });
      grist.onOptions(async (opts) => {
        const next = opts?.[optionKey];
        if (next && JSON.stringify(next) !== JSON.stringify(mapping)) {
          mapping = next;
          draft = structuredClone(mapping);
          if (loaded) {
            mappingUI();
            await load();
          }
        }
      });
      const [ts, cs] = await Promise.all([
        grist.docApi.fetchTable("_grist_Tables"),
        grist.docApi.fetchTable("_grist_Tables_column"),
      ]);
      tables = rows(ts).filter((t) => !t.tableId.startsWith("_grist_"));
      const ids = new Map(tables.map((t) => [t.id, t.tableId]));
      meta = rows(cs)
        .map((c) => ({ ...c, table: ids.get(c.parentId) }))
        .filter((c) => c.table);
      mapping = detect(mapping);
      draft = structuredClone(mapping);
      loaded = true;
      mappingUI();
      grist.onRecords(() => load());
      await load();
      if (Object.keys(schemas).some((k) => !cfg(k).table))
        $("mapping").hidden = false;
    } catch (e) {
      message(e.message, true);
    }
  }
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        selection = null;
        $("ownerFilter").value = "";
        $("statusFilter").value = "";
        filterOptions();
        render();
      }),
  );
  for (const id of [
    "projectFilter",
    "ownerFilter",
    "statusFilter",
    "unlinked",
    "overdue",
  ])
    $(id).onchange = render;
  $("search").oninput = render;
  document.querySelector('a[href="timeline.html"]').onclick = (e) => {
    if (demo) {
      e.preventDefault();
      message(
        "La timeline est disponible dans Grist après enregistrement du mapping.",
      );
    } else if (
      ["streams", "tasks"].some(
        (k) =>
          cfg(k).table &&
          !/^Ref:/.test(
            col(k, k === "streams" ? "Projet" : "Chantier")?.type || "",
          ),
      )
    ) {
      e.preventDefault();
      message(
        "Pour utiliser la timeline, convertissez les liens Projet et Chantier en références Grist, puis enregistrez le mapping.",
        true,
      );
    }
  };
  document.querySelector("main").onclick = (e) => {
    const row = e.target.closest("[data-kind]"),
      add = e.target.closest("[data-new]");
    if (row) {
      selection = { k: row.dataset.kind, id: Number(row.dataset.id) };
      render();
    } else if (add) openEditor(add.dataset.new);
    else if (e.target.closest("[data-edit]"))
      openEditor(
        selection.k,
        data[selection.k].find((r) => r.id === selection.id),
      );
  };
  $("mappingButton").onclick = () => {
    draft = structuredClone(mapping);
    mappingUI();
    $("mapping").hidden = !$("mapping").hidden;
  };
  $("refresh").onclick = () => (demo ? init() : load());
  $("cancel").onclick = () => $("editor").close();
  $("editForm").onsubmit = save;
  $("mapping").onchange = (e) => {
    const { map: k, field: f } = e.target.dataset;
    if (!k) return;
    draft[k] ||= { fields: {} };
    if (f === "table") {
      draft[k] = { table: e.target.value, fields: {} };
      draft = detect(draft);
      mappingUI();
    } else draft[k].fields[f] = e.target.value;
  };
  $("mapping").onclick = async (e) => {
    if (e.target.id === "detect") {
      draft = detect(draft);
      mappingUI();
    }
    if (e.target.id === "applyMapping") {
      if (demo) {
        message("Mapping de démonstration : aucune configuration enregistrée.");
        return;
      }
      try {
        const used = Object.values(draft)
          .map((c) => c.table)
          .filter(Boolean);
        if (new Set(used).size !== used.length)
          throw Error("Choisissez une table distincte pour chaque objet.");
        for (const [k, c] of Object.entries(draft))
          if (c.table && !c.fields.Titre)
            throw Error("Mappez le titre de " + schemas[k].label);
        for (const [kind, fields] of Object.entries(links))
          for (const [field, target] of Object.entries(fields)) {
            const source = draft[kind];
            const m = meta.find(
              (x) =>
                x.table === source?.table &&
                x.colId === source?.fields?.[field],
            );
            if (
              /^Ref(List)?:/.test(m?.type || "") &&
              draft[target]?.table &&
              m.type.split(":")[1] !== draft[target].table
            )
              throw Error(
                "La référence " +
                  schemas[kind].label +
                  "." +
                  field +
                  " pointe vers une autre table.",
              );
          }
        await grist.setOption(optionKey, draft);
        mapping = structuredClone(draft);
        const old = (await grist.getOption("directMapping")) || { levels: {} };
        for (const [i, k] of ["projects", "streams", "tasks"].entries()) {
          const c = cfg(k);
          old.levels[i + 1] = {
            ...(old.levels[i + 1] || {}),
            tableId: c.table || "",
            nameCol: c.fields.Titre || "",
            parentCol: c.fields[k === "streams" ? "Projet" : "Chantier"] || "",
            startCol: c.fields.DateDebut || "",
            endCol: c.fields.DateFin || "",
            statusCol: c.fields.Statut || "",
            responsibleCol: c.fields.Responsable || "",
            progressCol: c.fields.Avancement || "",
          };
        }
        await grist.setOption("directMapping", old);
        $("mapping").hidden = true;
        await load();
      } catch (err) {
        message("Mapping : " + err.message, true);
      }
    }
  };
  init();
})();
