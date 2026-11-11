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
    points: {
      label: "Points de discussion",
      aliases: ["Points", "PointsDiscussion", "PointsDeDiscussion"],
      fields: [
        "Code",
        "Titre",
        "NoteOrigine",
        "Contenu",
        "Decision",
        "Projets",
        "Chantiers",
        "Taches",
        "Ordre",
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
        "PointOrigine",
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
    points: {
      NoteOrigine: "notes",
      Projets: "projects",
      Chantiers: "streams",
      Taches: "tasks",
    },
    actions: {
      PointOrigine: "points",
      Projet: "projects",
      Chantier: "streams",
      Tache: "tasks",
      NoteOrigine: "notes",
    },
  };
  const multi = new Set(["Projets", "Chantiers", "Taches"]);
  const textareas = new Set([
    "Contenu",
    "Decision",
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
  let editionEnabled = false,
    moving = false,
    dragged = null;
  const folded = new Set();
  const knownBranches = new Set();
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
  function pointProjects(r) {
    const projects = targets("points", r, "Projets");
    for (const stream of targets("points", r, "Chantiers"))
      projects.push(...targets("streams", stream, "Projet"));
    for (const task of targets("points", r, "Taches")) {
      const p = projectOf("tasks", task);
      if (p) projects.push(p);
    }
    return [...new Map(projects.map((p) => [p.id, p])).values()];
  }
  function projectOf(k, r) {
    if (k === "points") return pointProjects(r)[0];
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
      (!p ||
        (k === "points"
          ? pointProjects(r).some((x) => x.id === Number(p))
          : projectOf(k, r)?.id === Number(p))) &&
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
  const kindLabels = {
    projects: "Projet",
    streams: "Chantier",
    tasks: "Tâche",
    actions: "Action",
    notes: "Note / réunion",
    points: "Point de discussion",
  };
  function item(k, r, level = 0) {
    return `<button class="item level${level} ${selection?.k === k && selection.id === r.id ? "selected" : ""}" data-kind="${k}" data-id="${r.id}"><span class="item-kind">${kindLabels[k]}</span><strong>${esc(title(k, r))}</strong><small>${esc([val(k, r, "Volet"), val(k, r, "Responsable"), dateText(val(k, r, "Date")) || val(k, r, "Echeance") || dateText(val(k, r, "DateFin"))].filter(Boolean).join(" · "))}</small>${[
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
  function actionParent(r) {
    const task = targets("actions", r, "Tache")[0];
    if (task) return ["tasks", task];
    const stream = targets("actions", r, "Chantier")[0];
    if (stream) return ["streams", stream];
    const project = targets("actions", r, "Projet")[0];
    return project ? ["projects", project] : null;
  }
  function children(k, r) {
    const result = [];
    if (k === "projects")
      result.push(
        ...ordered("streams")
          .filter((x) => has("streams", x, "Projet", r))
          .map((x) => ["streams", x]),
      );
    if (k === "streams")
      result.push(
        ...ordered("tasks")
          .filter((x) => has("tasks", x, "Chantier", r))
          .map((x) => ["tasks", x]),
      );
    if (["projects", "streams", "tasks"].includes(k))
      result.push(
        ...ordered("actions")
          .filter((x) => {
            const p = actionParent(x);
            return p && p[0] === k && p[1].id === r.id;
          })
          .map((x) => ["actions", x]),
      );
    if (k === "notes")
      result.push(
        ...ordered("points")
          .filter((x) => has("points", x, "NoteOrigine", r))
          .map((x) => ["points", x]),
      );
    if (k === "points")
      result.push(
        ...ordered("actions")
          .filter((x) => has("actions", x, "PointOrigine", r))
          .map((x) => ["actions", x]),
      );
    if (k === "notes")
      result.push(
        ...ordered("actions")
          .filter(
            (x) =>
              has("actions", x, "NoteOrigine", r) &&
              !targets("actions", x, "PointOrigine").length,
          )
          .map((x) => ["actions", x]),
      );
    return result;
  }
  function tree(k, r, filtered = false) {
    const kids = children(k, r)
      .map(([kind, row]) => tree(kind, row, filtered))
      .filter(Boolean);
    const visible =
      !filtered ||
      (view === "actions" ? k === "actions" && matches(k, r) : matches(k, r));
    return visible ||
      kids.length ||
      (filtered &&
        editionEnabled &&
        !["notes", "points", "actions"].includes(k))
      ? { k, r, kids }
      : null;
  }
  function branch(node, context) {
    if (!node) return "";
    const { k, r, kids } = node,
      key = `${context}:${k}:${r.id}`;
    if (!knownBranches.has(key)) {
      knownBranches.add(key);
      if (context.startsWith("right-")) folded.add(key);
    }
    const open = !folded.has(key);
    const movable = ["streams", "tasks", "actions"].includes(k);
    return `<div class="tree-node" data-tree-kind="${k}" data-tree-id="${r.id}"><div class="tree-row" data-drop-kind="${k}" data-drop-id="${r.id}" ${movable ? `draggable="${editionEnabled && !editing && !moving && !demo}" data-drag-kind="${k}" data-drag-id="${r.id}"` : ""}>${kids.length ? `<button class="fold" type="button" data-fold="${key}" aria-expanded="${open}" aria-label="${open ? "Plier" : "Déplier"} ${esc(title(k, r))}">${open ? "▾" : "▸"}</button>` : '<span class="fold-spacer"></span>'}${item(k, r)}${editionEnabled && movable ? `<button class="move-button" type="button" data-move-kind="${k}" data-move-id="${r.id}" aria-label="Déplacer ${esc(title(k, r))}" title="Déplacer"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 20 4M7 4h13v13"/></svg></button>` : ""}</div>${kids.length ? `<div class="tree-children" ${open ? "" : "hidden"}>${kids.map((n) => branch(n, context)).join("")}</div>` : ""}</div>`;
  }
  function syncEdition() {
    updateHistoryControls();
    $("editionButton").setAttribute("aria-pressed", String(editionEnabled));
    $("editionButton").textContent = editionEnabled
      ? "Édition activée"
      : "Édition désactivée";
    document
      .querySelectorAll("[data-view], #mappingButton, #refresh, #editionButton")
      .forEach((b) => (b.disabled = moving));
    document
      .querySelectorAll("[data-new], [data-edit]")
      .forEach((b) => (b.disabled = !editionEnabled || moving));
  }
  function render() {
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("unlinked").closest("label").hidden = view !== "actions";
    $("overdue").closest("label").hidden = view !== "actions";
    const context = "left-" + view;
    let html = "";
    if (view === "notes")
      html = ordered("notes")
        .map((r) => branch(tree("notes", r, true), context))
        .join("");
    else {
      html = ordered("projects")
        .map((r) => branch(tree("projects", r, true), context))
        .join("");
      const orphans = [
        ...ordered("streams")
          .filter((r) => !targets("streams", r, "Projet").length)
          .map((r) => ["streams", r]),
        ...ordered("tasks")
          .filter((r) => !targets("tasks", r, "Chantier").length)
          .map((r) => ["tasks", r]),
      ]
        .map(([k, r]) => branch(tree(k, r, true), context))
        .join("");
      if (orphans) html += "<h3>Éléments sans parent reconnu</h3>" + orphans;
      const standalone = ordered("actions")
        .filter((r) => !actionParent(r))
        .map((r) => branch(tree("actions", r, true), context))
        .join("");
      html += `<section class="unassigned" data-drop-kind="unassigned" data-drop-id="0"><h3>Actions sans rattachement au projet</h3>${standalone || '<p class="muted">Aucune action autonome.</p>'}</section>`;
    }
    $("list").innerHTML =
      `<div class="actions"><button data-new="${view === "projects" ? "projects" : view}">+ ${view === "projects" ? "Projet" : view === "notes" ? "Note / réunion" : "Action"}</button><button data-fold-all="close">Tout plier</button><button data-fold-all="open">Tout déplier</button></div>` +
      (html ||
        '<p class="empty">Aucun élément. Vérifiez le mapping ou ajustez les filtres.</p>');
    renderDetail();
    syncEdition();
  }
  function canDrop(sourceKind, targetKind) {
    return (
      (sourceKind === "streams" && targetKind === "projects") ||
      (sourceKind === "tasks" && targetKind === "streams") ||
      (sourceKind === "actions" &&
        ["projects", "streams", "tasks", "notes", "unassigned"].includes(
          targetKind,
        ))
    );
  }
  function encodeLink(k, field, targetKind, targetRow) {
    const meta = col(k, field),
      type = meta?.type || "";
    if (
      /^Ref(List)?:/.test(type) &&
      type.split(":")[1] !== cfg(targetKind).table
    )
      throw Error(
        "La référence " + field + " ne pointe pas vers la table attendue.",
      );
    let value = null;
    if (targetRow) {
      value = linkValue(targetKind, targetRow, k, field);
      if (
        !/^Ref/.test(type) &&
        (data[targetKind] || []).filter(
          (r) => String(val(targetKind, r, "Code")) === String(value),
        ).length !== 1
      )
        throw Error(
          "Le code cible n’est pas unique. Corrigez les codes dans Grist.",
        );
    }
    return /^RefList:/.test(type)
      ? ["L", ...(targetRow ? [value] : [])]
      : /^Ref:/.test(type)
        ? value || 0
        : (value ?? "");
  }
  async function performMove(source, destination) {
    if (!editionEnabled || editing || moving || demo) {
      message(
        "Activez le mode Édition et terminez le formulaire en cours pour déplacer un élément.",
        true,
      );
      return false;
    }
    if (!canDrop(source.k, destination.k)) {
      message("Ce niveau ne peut pas être déplacé sous cet élément.", true);
      return false;
    }
    moving = true;
    ++request;
    syncEdition();
    const previous = data;
    try {
      // Work from fresh rows so subtree updates do not reuse an old parent.
      const fresh = await Promise.all(
        Object.keys(schemas).map(async (k) => [
          k,
          cfg(k).table ? rows(await grist.docApi.fetchTable(cfg(k).table)) : [],
        ]),
      );
      data = Object.fromEntries(fresh);
      const row = (data[source.k] || []).find((r) => r.id === source.id);
      const target = (data[destination.k] || []).find(
        (r) => r.id === destination.id,
      );
      if (!row || (destination.k !== "unassigned" && !target))
        throw Error(
          "L’élément ou sa destination n’existe plus. Actualisez la liste.",
        );
      const updates = new Map();
      const set = (k, r, f, targetKind, targetRow, required = false) => {
        const column = cfg(k).fields?.[f];
        if (!column) {
          if (required)
            throw Error(
              "Mappez le champ " +
                schemas[k].label +
                "." +
                f +
                " avant ce déplacement.",
            );
          return;
        }
        if (col(k, f)?.isFormula) {
          if (required)
            throw Error(
              "Le parent est calculé : ce déplacement doit être effectué dans Grist.",
            );
          return;
        }
        const value = encodeLink(k, f, targetKind, targetRow);
        if (JSON.stringify(r[column]) === JSON.stringify(value)) return;
        const key = `${k}:${r.id}`;
        if (!updates.has(key)) updates.set(key, { k, r, fields: {} });
        updates.get(key).fields[column] = value;
        r[column] = value;
      };
      const normalizeAction = (r) => {
        const task = targets("actions", r, "Tache")[0];
        if (task)
          set(
            "actions",
            r,
            "Chantier",
            "streams",
            targets("tasks", task, "Chantier")[0],
          );
        const stream = targets("actions", r, "Chantier")[0];
        if (task || stream)
          set(
            "actions",
            r,
            "Projet",
            "projects",
            stream && targets("streams", stream, "Projet")[0],
          );
      };
      if (source.k === "streams") {
        set("streams", row, "Projet", "projects", target, true);
        for (const a of data.actions || [])
          if (linkedTo("streams", row, "actions", a)) normalizeAction(a);
      } else if (source.k === "tasks") {
        set("tasks", row, "Chantier", "streams", target, true);
        for (const a of data.actions || [])
          if (has("actions", a, "Tache", row)) normalizeAction(a);
      } else if (destination.k === "notes") {
        set("actions", row, "NoteOrigine", "notes", target, true);
        const point = targets("actions", row, "PointOrigine")[0];
        if (point && !has("points", point, "NoteOrigine", target))
          set("actions", row, "PointOrigine", "points", null, true);
      } else {
        if (destination.k === "tasks")
          set("actions", row, "Tache", "tasks", target, true);
        else {
          set(
            "actions",
            row,
            "Tache",
            "tasks",
            null,
            targets("actions", row, "Tache").length > 0,
          );
          if (destination.k === "streams")
            set("actions", row, "Chantier", "streams", target, true);
          else {
            set(
              "actions",
              row,
              "Chantier",
              "streams",
              null,
              targets("actions", row, "Chantier").length > 0,
            );
            set(
              "actions",
              row,
              "Projet",
              "projects",
              target,
              destination.k === "projects" ||
                (destination.k === "unassigned" &&
                  targets("actions", row, "Projet").length > 0),
            );
          }
        }
        if (
          destination.k === "unassigned" &&
          !["Projet", "Chantier", "Tache"].some(
            (f) => cfg("actions").fields?.[f],
          )
        )
          throw Error(
            "Mappez les rattachements des actions avant ce déplacement.",
          );
        if (destination.k !== "unassigned") normalizeAction(row);
      }
      if (updates.size)
        await grist.docApi.applyUserActions(
          [...updates.values()].map((u) => [
            "UpdateRecord",
            cfg(u.k).table,
            u.r.id,
            u.fields,
          ]),
        );
      let refreshWarning = "";
      if (updates.size) {
        try {
          data = Object.fromEntries(
            await Promise.all(
              Object.keys(schemas).map(async (k) => [
                k,
                cfg(k).table
                  ? rows(await grist.docApi.fetchTable(cfg(k).table))
                  : [],
              ]),
            ),
          );
        } catch {
          refreshWarning =
            " Déplacement enregistré, mais les valeurs calculées n’ont pas pu être rechargées. Utilisez Actualiser.";
        }
      }
      // Reveal the new parent's branch; the selection and other folds stay intact.
      for (const context of [
        "left-projects",
        "left-actions",
        "left-notes",
        "right-dependents",
        "right-notes",
      ])
        folded.delete(`${context}:${destination.k}:${destination.id}`);
      filterOptions();
      message(
        updates.size
          ? refreshWarning || "Déplacement enregistré."
          : "Cet élément est déjà rattaché à cette destination.",
      );
      return true;
    } catch (err) {
      data = previous;
      $("moveError").textContent = "Déplacement impossible : " + err.message;
      message("Déplacement impossible : " + err.message, true);
      return false;
    } finally {
      moving = false;
      dragged = null;
      render();
    }
  }
  function openMove(k, id) {
    if (!editionEnabled || editing || moving || demo) return;
    const source = (data[k] || []).find((r) => r.id === id);
    if (!source) return;
    const dialog = $("moveDialog");
    $("moveError").textContent = "";
    dialog.dataset.kind = k;
    dialog.dataset.id = String(id);
    $("moveTitle").textContent = "Déplacer « " + title(k, source) + " »";
    $("moveTarget").innerHTML =
      Object.keys(schemas)
        .filter((target) => canDrop(k, target))
        .map(
          (target) =>
            `<optgroup label="${esc(schemas[target].label)}">${ordered(target)
              .map(
                (r) =>
                  `<option value="${target}:${r.id}">${esc(title(target, r))}</option>`,
              )
              .join("")}</optgroup>`,
        )
        .join("") +
      (k === "actions"
        ? '<option value="unassigned:0">Sans rattachement au projet (réunion conservée)</option>'
        : "");
    dialog.showModal();
  }
  $("moveCancel").onclick = () => $("moveDialog").close();
  $("moveForm").onsubmit = async (e) => {
    e.preventDefault();
    const [k, id] = $("moveTarget").value.split(":");
    if (!k) return;
    $("moveSubmit").disabled = true;
    try {
      if (
        await performMove(
          {
            k: $("moveDialog").dataset.kind,
            id: Number($("moveDialog").dataset.id),
          },
          { k, id: Number(id) },
        )
      )
        $("moveDialog").close();
    } finally {
      $("moveSubmit").disabled = false;
    }
  };
  const main = document.querySelector("main");
  main.ondragstart = (e) => {
    const row = e.target.closest("[data-drag-kind]");
    if (
      !row ||
      !editionEnabled ||
      editing ||
      moving ||
      demo ||
      e.target.closest("input,textarea,select")
    ) {
      e.preventDefault();
      return;
    }
    dragged = { k: row.dataset.dragKind, id: Number(row.dataset.dragId) };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "text/plain",
      title(
        dragged.k,
        (data[dragged.k] || []).find((r) => r.id === dragged.id),
      ),
    );
    row.classList.add("dragging");
  };
  main.ondragover = (e) => {
    const row = e.target.closest("[data-drop-kind]");
    document
      .querySelectorAll(".drop-target")
      .forEach((x) => x.classList.remove("drop-target"));
    if (
      editionEnabled &&
      !editing &&
      !moving &&
      dragged &&
      row &&
      canDrop(dragged.k, row.dataset.dropKind)
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("drop-target");
    }
  };
  main.ondrop = (e) => {
    const row = e.target.closest("[data-drop-kind]");
    e.preventDefault();
    document
      .querySelectorAll(".drop-target,.dragging")
      .forEach((x) => x.classList.remove("drop-target", "dragging"));
    if (!dragged || !row) return;
    const source = dragged;
    dragged = null;
    performMove(source, {
      k: row.dataset.dropKind,
      id: Number(row.dataset.dropId),
    });
  };
  main.ondragend = () => {
    dragged = null;
    document
      .querySelectorAll(".drop-target,.dragging")
      .forEach((x) => x.classList.remove("drop-target", "dragging"));
  };

  function linkedTo(k, r, kind, row) {
    if (kind === "points") {
      if (k === "notes") return has("points", row, "NoteOrigine", r);
      if (k === "projects")
        return pointProjects(row).some((p) => p.id === r.id);
      if (k === "streams")
        return (
          has("points", row, "Chantiers", r) ||
          targets("points", row, "Taches").some((t) =>
            has("tasks", t, "Chantier", r),
          )
        );
      if (k === "tasks") return has("points", row, "Taches", r);
      return false;
    }
    if (k === "points")
      return kind === "actions" && has("actions", row, "PointOrigine", r);
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
  const previousLocations = [],
    nextLocations = [];
  const filterIds = [
    "projectFilter",
    "ownerFilter",
    "statusFilter",
    "search",
    "unlinked",
    "overdue",
  ];
  function captureLocation(source = null) {
    let focus = null;
    if (source) {
      const pane = source.closest("#list, #detail");
      if (pane)
        focus = {
          pane: pane.id,
          index: [...pane.querySelectorAll("[data-kind]")].indexOf(source),
        };
    }
    return {
      selection: selection ? { ...selection } : null,
      view,
      filters: Object.fromEntries(
        filterIds.map((id) => [
          id,
          $(id).type === "checkbox" ? $(id).checked : $(id).value,
        ]),
      ),
      folded: [...folded],
      known: [...knownBranches],
      scroll: Object.fromEntries(
        ["list", "detail"].map((id) => [
          id,
          { top: $(id).scrollTop, left: $(id).scrollLeft },
        ]),
      ),
      focus,
    };
  }
  function rememberLocation(source) {
    previousLocations.push(captureLocation(source));
    if (previousLocations.length > 100) previousLocations.shift();
    nextLocations.length = 0;
  }
  function updateHistoryControls() {
    document
      .querySelectorAll('[data-history="back"]')
      .forEach(
        (b) => (b.disabled = !previousLocations.length || !!editing || moving),
      );
    document
      .querySelectorAll('[data-history="forward"]')
      .forEach(
        (b) => (b.disabled = !nextLocations.length || !!editing || moving),
      );
  }
  function historyToolbar() {
    return '<nav class="detail-navigation" aria-label="Historique du panneau"><button type="button" data-history="back">← Retour</button><button type="button" data-history="forward">Suivant →</button></nav>';
  }
  function restoreLocation(location) {
    selection = location.selection;
    view = location.view;
    folded.clear();
    location.folded.forEach((key) => folded.add(key));
    knownBranches.clear();
    location.known.forEach((key) => knownBranches.add(key));
    filterOptions();
    for (const [id, value] of Object.entries(location.filters)) {
      if ($(id).type === "checkbox") $(id).checked = value;
      else $(id).value = value;
    }
    render();
    if (location.focus?.index >= 0)
      $(location.focus.pane)
        .querySelectorAll("[data-kind]")
        [location.focus.index]?.focus({ preventScroll: true });
    for (const [id, position] of Object.entries(location.scroll)) {
      $(id).scrollTop = position.top;
      $(id).scrollLeft = position.left;
    }
  }
  function travel(direction) {
    if (editing || moving) return;
    const from = direction === "back" ? previousLocations : nextLocations;
    const to = direction === "back" ? nextLocations : previousLocations;
    if (!from.length) return;
    to.push(captureLocation());
    restoreLocation(from.pop());
  }
  function selectRecord(k, id, source) {
    if (selection?.k === k && selection.id === id) return;
    rememberLocation(source);
    const left = { top: $("list").scrollTop, left: $("list").scrollLeft };
    selection = { k, id };
    render();
    $("list").scrollTop = left.top;
    $("list").scrollLeft = left.left;
    $("detail").scrollTop = 0;
    $("detail").scrollLeft = 0;
  }

  function relationLabel(field) {
    return (
      {
        Tache: "Tâche",
        Taches: "Tâches",
        NoteOrigine: "Note / réunion d’origine",
        PointOrigine: "Point de discussion d’origine",
        Projets: "Projets",
      }[field] || field
    );
  }
  function renderDetail() {
    if (editing?.inline) return;
    const k = selection?.k,
      r = (data[k] || []).find((r) => r.id === selection.id);
    if (!r) {
      $("detail").innerHTML =
        historyToolbar() +
        '<h2>Votre espace de suivi</h2><p class="text muted">Sélectionnez un projet, une réunion ou une action pour lire son contenu et retrouver ses liens.</p>';
      updateHistoryControls();
      return;
    }
    let html =
      historyToolbar() +
      `<small>${esc(schemas[k].label)}</small><h2 data-slot="Titre">${esc(title(k, r))}</h2><button data-edit="1">Modifier</button>`;
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
            `<dt>${esc(f)}</dt><dd data-slot="${f}">${esc(f.startsWith("Date") && f !== "DateSource" ? dateText(val(k, r, f)) : val(k, r, f))}</dd>`,
        )
        .join("") +
      "</dl>";
    for (const f of Object.keys(links[k] || {})) {
      const target = links[k][f],
        rs = targets(k, r, f);
      if (cfg(k).fields?.[f]) {
        html += `<section class="relation-field"><h3>${esc(relationLabel(f))}</h3><div data-slot="${f}">${rs.length ? rs.map((x) => item(target, x)).join("") : '<span class="muted">Aucun rattachement</span>'}</div></section>`;
      }
    }
    const progress = val(k, r, "Avancement");
    if (progress !== "" && Number.isFinite(Number(progress))) {
      const percent = Math.round(Number(progress) * 100);
      html += `<p>Avancement : ${percent} %</p><progress max="100" value="${percent}"></progress>`;
    }
    for (const f of [
      "Description",
      "Contenu",
      "Decision",
      "PointEtape",
      "Commentaire",
    ])
      if (val(k, r, f))
        html += `<h3>${esc(f === "Contenu" ? "Notes et décisions" : f)}</h3><div class="text" data-slot="${f}">${esc(val(k, r, f))}</div>`;
    if (["projects", "streams", "tasks"].includes(k))
      html += `<div class="actions">${k !== "tasks" ? `<button data-new="${k === "projects" ? "streams" : "tasks"}">+ ${k === "projects" ? "Chantier" : "Tâche"}</button>` : ""}<button data-new="notes">+ Note</button><button data-new="actions">+ Action</button></div>`;
    if (k === "notes")
      html += cfg("points").table
        ? '<div class="actions"><button data-new="points">+ Point de discussion</button></div>'
        : '<p class="muted">Pour structurer cette réunion en points, importez la table Points puis configurez son mapping.</p>';
    if (k === "points")
      html +=
        '<div class="actions"><button data-new="actions">+ Action issue de ce point</button></div>';
    if (["projects", "streams", "tasks", "notes"].includes(k)) {
      const related = ordered("points").filter((x) =>
        linkedTo(k, r, "points", x),
      );
      if (related.length)
        html +=
          "<h3>Points de discussion</h3>" +
          related
            .map((x) => branch(tree("points", x), "right-points"))
            .join("");
    }
    if (k === "notes")
      html +=
        '<div class="actions"><button data-new="actions">+ Action issue de cette note</button></div>';
    const deps = children(k, r).filter(
      ([kind]) => !["actions", "points"].includes(kind),
    );
    if (deps.length)
      html +=
        "<h3>Éléments dépendants</h3>" +
        deps
          .map(([kind, row]) => branch(tree(kind, row), "right-dependents"))
          .join("");
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
          (notes.map((x) => branch(tree("notes", x), "right-notes")).join("") ||
            '<p class="muted">Aucune note liée.</p>');
      html +=
        "<h3>Actions associées</h3>" +
        (actions.map((x) => item("actions", x)).join("") ||
          '<p class="muted">Aucune action liée.</p>');
    }
    $("detail").innerHTML = html;
    syncEdition();
  }
  async function load() {
    if (moving) return;
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
                (k) =>
                  k !== "points" && (!cfg(k).table || !cfg(k).fields?.Titre),
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
    if (
      k === "actions" &&
      !r &&
      selection?.k === "points" &&
      !cfg("actions").fields?.PointOrigine
    ) {
      message(
        "Ajoutez la colonne PointOrigine dans Actions puis mappez-la pour créer une action issue d’un point.",
        true,
      );
      return;
    }
    if (!editionEnabled || moving) {
      message("Activez le mode Édition pour modifier les données.");
      return;
    }
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
    if (r && !Number.isFinite(Number(r.id))) {
      message(
        "La ligne sélectionnée n’est plus disponible. Actualisez les données.",
        true,
      );
      return;
    }
    editing = { k, r: r ? structuredClone(r) : null };
    updateHistoryControls();
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
            points: "D",
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
                  `<option value="${x.id}" ${selected.includes(x.id) ? "selected" : ""}>${esc(title(target, x))}${target === "tasks" ? esc(" — " + (targets("tasks", x, "Chantier")[0] ? title("streams", targets("tasks", x, "Chantier")[0]) : "Sans chantier")) : ""}</option>`,
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
        return `<label>${esc(target ? relationLabel(f) : f)}${f === "Avancement" ? " (0 à 1 ; 0,5 = 50 %)" : ""}${input}</label>`;
      })
      .join("");
    if (r) {
      const controls = [...$("fields").children];
      const form = $("editForm");
      const display = document.createElement("div");
      display.className = "inline-content";
      while ($("detail").firstChild) display.append($("detail").firstChild);
      display
        .querySelectorAll("[data-edit], [data-new]")
        .forEach((x) => x.remove());
      const extras = document.createElement("details");
      extras.innerHTML = "<summary>Autres champs</summary>";
      for (const label of controls) {
        const control = label.querySelector("[name]");
        const slot =
          control && display.querySelector(`[data-slot="${control.name}"]`);
        if (slot) {
          slot.replaceChildren(control);
          control.setAttribute(
            "aria-label",
            links[k]?.[control.name]
              ? relationLabel(control.name)
              : control.name,
          );
        } else extras.append(label);
      }
      $("fields").replaceChildren(display);
      if (extras.children.length > 1) $("fields").append(extras);
      $("editorTitle").textContent = "Modification";
      $("cancel").textContent = "Annuler";
      $("detail").append(form);
      editing.inline = true;
      form.querySelector('[name="Titre"]')?.focus();
    } else {
      $("cancel").textContent = "Annuler";
      $("editor").showModal();
    }
    const origin = $("editForm").elements.namedItem("PointOrigine");
    if (k === "actions" && origin?.value)
      origin.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function endEdit() {
    if (busy) return;
    const inline = editing?.inline;
    editing = null;
    $("editor").append($("editForm"));
    $("editor").close();
    if (inline) renderDetail();
  }
  function dependentLinkUpdates(k, record, fields) {
    if (
      k === "points" &&
      record &&
      cfg(k).fields?.NoteOrigine &&
      Object.hasOwn(fields, cfg(k).fields.NoteOrigine)
    ) {
      const changed = { ...record, ...fields },
        note = targets("points", changed, "NoteOrigine")[0];
      return (data.actions || [])
        .filter((a) => has("actions", a, "PointOrigine", record))
        .map((a) => {
          if (
            !cfg("actions").fields?.NoteOrigine ||
            col("actions", "NoteOrigine")?.isFormula
          )
            throw Error(
              "Le lien NoteOrigine des actions doit être mappé et modifiable.",
            );
          return [
            "UpdateRecord",
            cfg("actions").table,
            a.id,
            {
              [cfg("actions").fields.NoteOrigine]: encodeLink(
                "actions",
                "NoteOrigine",
                "notes",
                note,
              ),
            },
          ];
        });
    }
    const parentField =
      k === "tasks" ? "Chantier" : k === "streams" ? "Projet" : null;
    const column = parentField && cfg(k).fields?.[parentField];
    if (!record || !column || !Object.hasOwn(fields, column)) return [];
    const changed = { ...record, ...fields },
      updates = [];
    for (const action of data.actions || []) {
      if (!linkedTo(k, record, "actions", action)) continue;
      const task = targets("actions", action, "Tache")[0];
      let stream = task
        ? targets(
            "tasks",
            k === "tasks" && task.id === record.id ? changed : task,
            "Chantier",
          )[0]
        : targets("actions", action, "Chantier")[0];
      if (stream && k === "streams" && stream.id === record.id)
        stream = changed;
      const project = stream && targets("streams", stream, "Projet")[0];
      const delta = {};
      for (const [field, target, row] of [
        ["Chantier", "streams", stream],
        ["Projet", "projects", project],
      ]) {
        const colId = cfg("actions").fields?.[field];
        if (
          !colId ||
          col("actions", field)?.isFormula ||
          (field === "Chantier" && !task)
        )
          continue;
        const value = encodeLink("actions", field, target, row);
        if (JSON.stringify(action[colId]) !== JSON.stringify(value))
          delta[colId] = value;
      }
      if (Object.keys(delta).length)
        updates.push(["UpdateRecord", cfg("actions").table, action.id, delta]);
    }
    return updates;
  }
  async function save(e) {
    e.preventDefault();
    if (busy || !editionEnabled || moving) return;
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
      if (
        k === "points" &&
        !$("editForm").elements.namedItem("NoteOrigine")?.value
      )
        throw Error(
          "Choisissez la réunion ou note à laquelle appartient ce point (champ NoteOrigine à mapper).",
        );
      if (k === "actions") {
        const pointId = $("editForm").elements.namedItem("PointOrigine")?.value;
        const point = (data.points || []).find((x) => x.id === Number(pointId));
        if (point) {
          const note = targets("points", point, "NoteOrigine")[0];
          if (
            !note ||
            !cfg(k).fields?.NoteOrigine ||
            col(k, "NoteOrigine")?.isFormula
          )
            throw Error(
              "Mappez un champ NoteOrigine modifiable pour conserver la réunion d’origine de l’action.",
            );
          fields[cfg(k).fields.NoteOrigine] = encodeLink(
            k,
            "NoteOrigine",
            "notes",
            note,
          );
        }
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
      if (r) {
        for (const key of Object.keys(fields)) {
          if (JSON.stringify(fields[key]) === JSON.stringify(r[key]))
            delete fields[key];
        }
      }
      await grist.docApi.applyUserActions([
        [r ? "UpdateRecord" : "AddRecord", cfg(k).table, r?.id ?? null, fields],
        ...dependentLinkUpdates(k, r, fields),
      ]);
      busy = false;
      endEdit();
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
      if (
        Object.keys(schemas)
          .filter((k) => k !== "points")
          .some((k) => !cfg(k).table)
      )
        $("mapping").hidden = false;
    } catch (e) {
      message(e.message, true);
    }
  }
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        if (editing) {
          message(
            "Enregistrez ou annulez les modifications avant de changer de vue.",
          );
          return;
        }
        if (view === b.dataset.view) return;
        rememberLocation();
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
    if (
      (editing || moving) &&
      e.target.closest(
        "[data-kind], [data-new], [data-edit], [data-fold], [data-fold-all], [data-move-kind], [data-history]",
      )
    ) {
      message(
        "Enregistrez ou annulez les modifications avant de changer d’élément.",
      );
      return;
    }
    const history = e.target.closest("[data-history]");
    if (history) {
      travel(history.dataset.history);
      return;
    }
    const fold = e.target.closest("[data-fold]");
    if (fold) {
      folded.has(fold.dataset.fold)
        ? folded.delete(fold.dataset.fold)
        : folded.add(fold.dataset.fold);
      const wrapper = fold.closest(".tree-node");
      const kids = wrapper.querySelector(":scope > .tree-children");
      const open = !folded.has(fold.dataset.fold);
      kids.hidden = !open;
      fold.setAttribute("aria-expanded", String(open));
      fold.setAttribute(
        "aria-label",
        (open ? "Plier " : "Déplier ") +
          title(
            wrapper.dataset.treeKind,
            (data[wrapper.dataset.treeKind] || []).find(
              (r) => r.id === Number(wrapper.dataset.treeId),
            ),
          ),
      );
      fold.textContent = open ? "▾" : "▸";
      return;
    }
    const all = e.target.closest("[data-fold-all]");
    if (all) {
      $("list")
        .querySelectorAll("[data-fold]")
        .forEach((b) =>
          all.dataset.foldAll === "close"
            ? folded.add(b.dataset.fold)
            : folded.delete(b.dataset.fold),
        );
      render();
      return;
    }
    const move = e.target.closest("[data-move-kind]");
    if (move) {
      openMove(move.dataset.moveKind, Number(move.dataset.moveId));
      return;
    }
    const row = e.target.closest("[data-kind]"),
      add = e.target.closest("[data-new]");
    if (row) {
      selectRecord(row.dataset.kind, Number(row.dataset.id), row);
    } else if (add) openEditor(add.dataset.new);
    else if (e.target.closest("[data-edit]")) {
      const record = (data[selection?.k] || []).find(
        (r) => Number(r.id) === Number(selection?.id),
      );
      if (!record) {
        message(
          "La ligne n’est plus disponible. Actualisez les données avant de modifier.",
          true,
        );
        return;
      }
      openEditor(selection.k, record);
    }
  };
  $("editionButton").onclick = () => {
    if (editing || moving) {
      message(
        "Enregistrez ou annulez l’opération en cours avant de quitter le mode Édition.",
      );
      return;
    }
    editionEnabled = !editionEnabled;
    render();
    message(
      editionEnabled
        ? "Édition activée : glissez un sous-élément sur son nouveau parent ou utilisez le bouton Déplacer."
        : "Lecture seule : vous pouvez plier et déplier les éléments.",
    );
  };
  $("mappingButton").onclick = () => {
    if (editing || moving) {
      message("Terminez l’opération en cours avant de modifier le mapping.");
      return;
    }
    draft = structuredClone(mapping);
    mappingUI();
    $("mapping").hidden = !$("mapping").hidden;
  };
  $("refresh").onclick = () => (demo ? init() : load());
  $("cancel").onclick = endEdit;
  $("editor").addEventListener("cancel", () => {
    editing = null;
  });
  $("editForm").onchange = (e) => {
    if (editing?.k === "actions" && e.target.name === "PointOrigine") {
      const point = (data.points || []).find(
          (x) => x.id === Number(e.target.value),
        ),
        note = point && targets("points", point, "NoteOrigine")[0];
      const field = $("editForm").elements.namedItem("NoteOrigine");
      if (note && field) field.value = String(note.id);
    }
    if (editing?.k === "actions" && e.target.name === "NoteOrigine") {
      const field = $("editForm").elements.namedItem("PointOrigine"),
        point = (data.points || []).find((x) => x.id === Number(field?.value));
      if (
        point &&
        !has("points", point, "NoteOrigine", { id: Number(e.target.value) })
      )
        field.value = "";
    }

    if (
      editing?.k !== "actions" ||
      !["Projet", "Chantier", "Tache"].includes(e.target.name)
    )
      return;
    const form = $("editForm");
    const field = (f) => form.elements.namedItem(f);
    const selected = (f, k) =>
      (data[k] || []).find((r) => r.id === Number(field(f)?.value));
    const assign = (f, r) => {
      if (field(f)) field(f).value = r ? String(r.id) : "";
    };
    if (e.target.name === "Tache") {
      const task = selected("Tache", "tasks");
      if (task) {
        const stream = targets("tasks", task, "Chantier")[0];
        assign("Chantier", stream);
        assign("Projet", stream && targets("streams", stream, "Projet")[0]);
      }
    } else if (e.target.name === "Chantier") {
      const stream = selected("Chantier", "streams"),
        task = selected("Tache", "tasks");
      if (task && !has("tasks", task, "Chantier", stream))
        assign("Tache", null);
      if (stream) assign("Projet", targets("streams", stream, "Projet")[0]);
    } else {
      const project = selected("Projet", "projects"),
        stream = selected("Chantier", "streams"),
        task = selected("Tache", "tasks");
      if (stream && !has("streams", stream, "Projet", project))
        assign("Chantier", null);
      if (task && projectOf("tasks", task)?.id !== project?.id)
        assign("Tache", null);
    }
  };
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
