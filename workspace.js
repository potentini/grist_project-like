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
        "TacheOrigine",
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
        "ActionOrigine",
        "Transforme",
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
        "Transforme",
      ],
    },
  };
  for (const k of ["projects", "streams", "tasks", "actions"])
    schemas[k].fields.push("ResponsableDiPSi");
  for (const schema of Object.values(schemas)) schema.fields.push("Archive");
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
    streams: { Projet: "projects", TacheOrigine: "tasks" },
    tasks: { Chantier: "streams", ActionOrigine: "actions" },
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
  let mappingWasSaved = false,
    nativeTable = null,
    nativeIds = null;
  let nativeRevision = 0,
    nativePending = false,
    nativeWarning = "",
    resumeTimer = null;
  function selectedViewFetcher() {
    return grist.viewApi?.fetchSelectedTable
      ? (opts) => grist.viewApi.fetchSelectedTable(opts)
      : typeof grist.fetchSelectedTable === "function"
        ? (opts) => grist.fetchSelectedTable(opts)
        : null;
  }
  function acceptNativeScope(table, records) {
    nativeTable = table;
    nativeIds = new Set(rows(records).map((r) => Number(r.id)));
    nativePending = false;
    nativeWarning = "";
    scopeAllowed = new WeakMap();
    const selected =
      selection && (data[selection.k] || []).find((r) => r.id === selection.id);
    if (selected && !editing && !nativeMatch(selection.k, selected))
      selection = null;
  }
  async function refreshNativeScope() {
    if (demo || !window.grist) return;
    const fetcher = selectedViewFetcher();
    if (!fetcher) return;
    const stamp = ++nativeRevision;
    if (nativeIds === null) {
      nativePending = true;
      nativeWarning = "Chargement des filtres Grist…";
    }
    try {
      const [table, records] = await Promise.all([
        grist.selectedTable.getTableId(),
        fetcher({ format: "columns", keepEncoded: true, expandRefs: false }),
      ]);
      if (stamp === nativeRevision) acceptNativeScope(table, records);
    } catch (err) {
      if (stamp === nativeRevision) {
        nativePending = nativeIds === null;
        nativeWarning = nativePending
          ? "Filtres Grist en attente de connexion."
          : "Connexion Grist interrompue : dernier filtre conservé.";
      }
    }
  }
  function scheduleNativeResume() {
    if (demo || document.visibilityState === "hidden") return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(async () => {
      if (!loaded) return;
      if (moving) {
        scheduleNativeResume();
        return;
      }
      await refreshNativeScope();
      await load();
    }, 100);
  }
  document.addEventListener("visibilitychange", scheduleNativeResume);
  window.addEventListener("focus", scheduleNativeResume);
  window.addEventListener("online", scheduleNativeResume);
  window.addEventListener("pageshow", scheduleNativeResume);
  const refRows = new Map();
  const referenceIndexes = new Map();
  let scopeAllowed = new WeakMap(),
    advancedSets = null;
  const defaultNames = Object.fromEntries(
    Object.entries(schemas).map(([k, v]) => [k, v.label]),
  );
  function fieldLabel(k, f) {
    return (
      cfg(k).extraFields?.find((x) => x.id === f)?.label ||
      cfg(k).fieldLabels?.[f] ||
      {
        ResponsableDiPSi: "Responsable DiPSi",
        DateFin: "Date de fin (date précise)",
        Echeance: "Échéance (texte libre)",
      }[f] ||
      (links[k]?.[f] && cfg(links[k][f]).label) ||
      relationLabel(f)
    );
  }
  function applyLabels() {
    for (const k of Object.keys(schemas)) {
      schemas[k].label = cfg(k).label || defaultNames[k];
      kindLabels[k] = cfg(k).label || defaultKindNames[k];
    }
    document.querySelector('button[data-view="projects"]').textContent =
      cfg("projects").label || "Projets";
    $("projectFilterLabel").textContent = cfg("projects").label || "Projet";
  }
  function tableRows(table) {
    const k = Object.keys(schemas).find((k) => cfg(k).table === table);
    return k ? data[k] || [] : refRows.get(table) || [];
  }
  function referenceRow(table, id) {
    const source = tableRows(table),
      cached = referenceIndexes.get(table);
    if (!cached || cached.source !== source)
      referenceIndexes.set(table, {
        source,
        byId: new Map(source.map((r) => [r.id, r])),
      });
    return referenceIndexes.get(table).byId.get(Number(id));
  }
  function refText(m, value, row, depth = 0) {
    if (!m || !/^Ref(List)?:/.test(m.type || "") || depth > 5)
      return Array.isArray(value)
        ? values(value).join(", ")
        : String(value ?? "");
    const display = meta.find((c) => c.id === Number(m.displayCol));
    if (display && row && row[display.colId] != null)
      return values(row[display.colId]).join(", ");
    const visible = meta.find((c) => c.id === Number(m.visibleCol)),
      table = m.type.split(":")[1];
    return values(value)
      .filter((id) => Number(id) !== 0)
      .map((id) => {
        const r = referenceRow(table, id);
        if (!r) return "[Référence indisponible]";
        return visible
          ? refText(visible, r[visible.colId], r, depth + 1)
          : String(r.id);
      })
      .join(", ");
  }
  function displayValue(k, r, f) {
    return refText(col(k, f), val(k, r, f), r);
  }
  async function loadReferences() {
    let frontier = Object.keys(schemas)
      .flatMap((k) => Object.keys(cfg(k).fields || {}).map((f) => col(k, f)))
      .filter((c) => /^Ref(List)?:/.test(c?.type || ""));
    const doneTables = new Set(),
      doneColumns = new Set();
    for (let depth = 0; frontier.length && depth < 5; depth++) {
      const columns = frontier.filter((c) => !doneColumns.has(c.id));
      columns.forEach((c) => doneColumns.add(c.id));
      const needed = [
        ...new Set(columns.map((c) => c.type.split(":")[1])),
      ].filter((t) => !doneTables.has(t));
      await Promise.all(
        needed.map(async (table) => {
          doneTables.add(table);
          if (!Object.values(mapping).some((c) => c.table === table))
            refRows.set(table, rows(await grist.docApi.fetchTable(table)));
        }),
      );
      frontier = columns
        .map((c) => meta.find((m) => m.id === Number(c.visibleCol)))
        .filter((c) => /^Ref(List)?:/.test(c?.type || ""));
    }
  }
  function nativeKind() {
    return Object.keys(schemas).find((k) => cfg(k).table === nativeTable);
  }
  function nativeMatch(k, r) {
    if (nativePending && nativeIds === null) return false;
    return scopeMatch(nativeKind(), nativeIds, k, r);
  }
  function scopeMatch(source, nativeIds, k, r) {
    if (!source || !nativeIds) return true;
    const nativeMatch = (kind, row) => scopeMatch(source, nativeIds, kind, row);
    if (k === source) return nativeIds.has(r.id);
    if (k === "notes" && ["projects", "streams", "tasks"].includes(source)) {
      const direct = (data[source] || [])
        .filter((x) => nativeIds.has(x.id))
        .some((x) => linkedTo(source, x, "notes", r));
      return (
        direct ||
        (data.points || []).some(
          (p) =>
            has("points", p, "NoteOrigine", r) &&
            scopeMatch(source, nativeIds, "points", p),
        )
      );
    }
    let allowed = scopeAllowed.get(nativeIds);
    if (!allowed) {
      allowed = (data[source] || []).filter((r) => nativeIds.has(r.id));
      scopeAllowed.set(nativeIds, allowed);
    }
    if (source === "projects")
      return k === "points"
        ? pointProjects(r).some((p) => nativeIds.has(p.id))
        : !!projectOf(k, r) && nativeIds.has(projectOf(k, r).id);
    if (source === "streams") {
      if (k === "projects")
        return allowed.some((s) => has("streams", s, "Projet", r));
      if (k === "tasks")
        return targets(k, r, "Chantier").some((s) => nativeIds.has(s.id));
      if (k === "actions") {
        const p = actionParent(r);
        return p?.[0] === "streams"
          ? nativeIds.has(p[1].id)
          : p?.[0] === "tasks" && nativeMatch("tasks", p[1]);
      }
      return allowed.some((s) => linkedTo("streams", s, k, r));
    }
    if (source === "tasks") {
      if (k === "streams")
        return allowed.some((t) => has("tasks", t, "Chantier", r));
      if (k === "projects")
        return allowed.some((t) => projectOf("tasks", t)?.id === r.id);
      if (k === "actions")
        return targets(k, r, "Tache").some((t) => nativeIds.has(t.id));
      return allowed.some((t) => linkedTo("tasks", t, k, r));
    }
    if (source === "notes") {
      if (k === "points" || k === "actions")
        return targets(k, r, "NoteOrigine").some((n) => nativeIds.has(n.id));
      return (
        allowed.some((n) => linkedTo(k, r, "notes", n)) ||
        (data.points || []).some(
          (p) => nativeMatch("points", p) && linkedTo(k, r, "points", p),
        )
      );
    }
    if (source === "points") {
      if (k === "notes")
        return allowed.some((p) => has("points", p, "NoteOrigine", r));
      if (k === "actions")
        return targets(k, r, "PointOrigine").some((p) => nativeIds.has(p.id));
      return allowed.some((p) => linkedTo(k, r, "points", p));
    }
    if (source === "actions")
      return allowed.some((a) =>
        k === "notes"
          ? has("actions", a, "NoteOrigine", r)
          : k === "points"
            ? has("actions", a, "PointOrigine", r)
            : linkedTo(k, r, "actions", a),
      );
    return true;
  }
  let advancedRules = [],
    advancedSelected = [];
  const quickSelections = {
    projectFilter: [],
    ownerFilter: [],
    statusFilter: [],
  };
  function fieldValues(m, value, row) {
    if (m?.type?.startsWith("RefList:"))
      return values(value).length
        ? values(value).map((id) => refText(m, id, null))
        : [""];
    if (m?.type === "ChoiceList")
      return values(value).length ? values(value).map(String) : [""];
    return [
      m?.type?.startsWith("Date") ? dateText(value) : refText(m, value, row),
    ];
  }
  function filterValues(k, r, f) {
    return fieldValues(col(k, f), val(k, r, f), r);
  }
  function quickChoice(id) {
    return quickSelections[id] || [];
  }
  function draftAdvancedRule() {
    return {
      kind: $("advancedKind").value,
      column: $("advancedField").value,
      ...(advancedSelected.length
        ? { values: [...advancedSelected] }
        : { value: $("advancedValue").value }),
    };
  }
  function quickUI(id, opts) {
    const select = $(id);
    let wrapper = select.parentElement;
    if (wrapper.tagName === "LABEL") {
      const div = document.createElement("div");
      div.className = "quick-filter";
      wrapper.replaceWith(div);
      while (wrapper.firstChild) div.append(wrapper.firstChild);
      wrapper = div;
    }
    const caption = wrapper.querySelector("span")?.textContent || id;
    select.setAttribute("aria-label", caption);
    let popup = wrapper.querySelector(".quick-multiple");
    if (!popup) {
      popup = document.createElement("details");
      popup.className = "quick-multiple";
      popup.innerHTML = "<summary>Choix multiples</summary><div></div>";
      wrapper.append(popup);
    }
    popup
      .querySelector("summary")
      .setAttribute("aria-label", "Choix multiples : " + caption);
    popup.querySelector("div").innerHTML =
      opts
        .map(
          ([value, label]) =>
            `<label><input type="checkbox" data-quick="${id}" value="${esc(value)}" ${quickChoice(id).includes(String(value)) ? "checked" : ""}>${esc(label)}</label>`,
        )
        .join("") ||
      '<span class="muted">Aucune valeur dans le périmètre courant.</span>';
    popup.ontoggle = () => {
      if (popup.open)
        document.querySelectorAll(".quick-multiple").forEach((other) => {
          if (other !== popup) other.open = false;
        });
    };
    popup.onchange = (e) => {
      if (!e.target.matches("[data-quick]")) return;
      quickSelections[id] = [...popup.querySelectorAll("input:checked")].map(
        (x) => x.value,
      );
      filterOptions();
      render();
    };
  }

  function advancedMatch(k, r) {
    if (!advancedSets) {
      advancedSets = new Map();
      const rules = [...advancedRules];
      if ($("advancedValue").value.trim() || advancedSelected.length)
        rules.push(draftAdvancedRule());
      for (const source of new Set(rules.map((rule) => rule.kind))) {
        const group = rules.filter((rule) => rule.kind === source);
        const allowed = new Set(
          (data[source] || [])
            .filter((row) =>
              group.every((rule) => {
                const c = meta.find(
                  (c) =>
                    c.table === cfg(source).table && c.colId === rule.column,
                );
                const value = c?.type?.startsWith("Date")
                  ? dateText(row[rule.column])
                  : refText(c, row[rule.column], row);
                return rule.values
                  ? fieldValues(c, row[rule.column], row).some((v) =>
                      rule.values.includes(v),
                    )
                  : norm(value).includes(norm(rule.value));
              }),
            )
            .map((row) => row.id),
        );
        advancedSets.set(source, allowed);
      }
    }
    return [...advancedSets].every(([source, allowed]) =>
      scopeMatch(source, allowed, k, r),
    );
  }
  function advancedUI(resetField = false) {
    const old = $("advancedKind").value;
    $("advancedKind").innerHTML = Object.keys(schemas)
      .filter((k) => cfg(k).table)
      .map((k) => `<option value="${k}">${esc(schemas[k].label)}</option>`)
      .join("");
    if (old) $("advancedKind").value = old;
    if (!$("advancedKind").value) $("advancedKind").selectedIndex = 0;
    const k = $("advancedKind").value,
      oldField = resetField ? "" : $("advancedField").value;
    $("advancedField").innerHTML = meta
      .filter(
        (c) =>
          c.table === cfg(k).table &&
          c.colId !== "manualSort" &&
          !c.colId.startsWith("gristHelper_"),
      )
      .map((c) => {
        const f = Object.keys(cfg(k).fields || {}).find(
          (f) => cfg(k).fields[f] === c.colId,
        );
        return `<option value="${esc(c.colId)}">${esc(f ? fieldLabel(k, f) : c.label || c.colId)}</option>`;
      })
      .join("");
    if (oldField) $("advancedField").value = oldField;
    if (!$("advancedField").value) $("advancedField").selectedIndex = 0;
    const count =
      advancedRules.length +
      ($("advancedValue").value.trim() || advancedSelected.length ? 1 : 0);
    const column = meta.find(
      (c) => c.table === cfg(k).table && c.colId === $("advancedField").value,
    );
    const choices = [
      ...new Set(
        (data[k] || [])
          .filter((r) => nativeMatch(k, r))
          .flatMap((r) => fieldValues(column, r[column?.colId], r)),
      ),
    ].sort((a, b) => a.localeCompare(b));
    $("advancedChoices").innerHTML =
      choices
        .filter(
          (v) =>
            !$("advancedValue").value ||
            norm(v).includes(norm($("advancedValue").value)) ||
            advancedSelected.includes(v),
        )
        .map(
          (value) =>
            `<label><input type="checkbox" data-advanced-choice value="${esc(value)}" ${advancedSelected.includes(value) ? "checked" : ""}>${esc(value || "(Vide)")}</label>`,
        )
        .join("") || '<p class="muted">Aucune valeur disponible.</p>';
    $("advancedCount").textContent = count
      ? `(${count} actif${count > 1 ? "s" : ""})`
      : "";
    $("advancedChips").innerHTML = advancedRules
      .map(
        (rule, i) =>
          `<button type="button" data-remove-filter="${i}">${esc(schemas[rule.kind].label)} · ${esc(meta.find((c) => c.table === cfg(rule.kind).table && c.colId === rule.column)?.label || rule.column)} : ${esc(rule.values ? rule.values.map((v) => v || "(Vide)").join(" ou ") : rule.value)} ×</button>`,
      )
      .join("");
  }
  const layoutKey = "workspacePaneLayoutV1";
  let preferredSplit = 1.2 / 2.2,
    splitDrag = null;
  function paintSplit(fraction = preferredSplit) {
    const main = document.querySelector("main"),
      separator = $("paneSeparator");
    const style = getComputedStyle(main);
    const available =
      main.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      26;
    const min = available > 0 ? Math.min(0.45, 260 / available) : 0.3,
      max = available > 0 ? Math.max(0.55, 1 - 280 / available) : 0.7;
    const value = Math.max(min, Math.min(max, fraction));
    main.style.setProperty("--left-fr", value + "fr");
    main.style.setProperty("--right-fr", 1 - value + "fr");
    separator.setAttribute("aria-valuemin", String(Math.round(min * 100)));
    separator.setAttribute("aria-valuemax", String(Math.round(max * 100)));
    separator.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    return value;
  }
  async function rememberSplit() {
    if (!demo && window.grist)
      try {
        await grist.setOption(layoutKey, { leftFraction: preferredSplit });
      } catch (err) {
        message(
          "La largeur des volets n’a pas pu être mémorisée : " + err.message,
          true,
        );
      }
  }
  const separator = $("paneSeparator");
  separator.onpointerdown = (e) => {
    if (e.button !== 0 || !matchMedia("(min-width:801px)").matches) return;
    e.preventDefault();
    splitDrag = { id: e.pointerId, before: preferredSplit };
    separator.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-panes");
  };
  separator.onpointermove = (e) => {
    if (splitDrag?.id !== e.pointerId) return;
    const main = document.querySelector("main"),
      rect = main.getBoundingClientRect(),
      style = getComputedStyle(main);
    const available =
      main.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      26;
    preferredSplit = paintSplit(
      (e.clientX - rect.left - parseFloat(style.paddingLeft) - 13) / available,
    );
  };
  separator.onpointerup = (e) => {
    if (splitDrag?.id !== e.pointerId) return;
    splitDrag = null;
    separator.releasePointerCapture(e.pointerId);
    document.body.classList.remove("resizing-panes");
    rememberSplit();
  };
  separator.onpointercancel = () => {
    if (splitDrag) {
      preferredSplit = splitDrag.before;
      splitDrag = null;
      paintSplit();
    }
    document.body.classList.remove("resizing-panes");
  };
  separator.onlostpointercapture = () => {
    splitDrag = null;
    document.body.classList.remove("resizing-panes");
  };
  separator.onkeydown = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    preferredSplit = paintSplit(
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 1
          : paintSplit() +
            (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 0.05 : 0.02),
    );
    rememberSplit();
  };
  separator.ondblclick = () => {
    preferredSplit = 1.2 / 2.2;
    paintSplit();
    rememberSplit();
  };
  window.addEventListener("resize", () => paintSplit());
  new ResizeObserver(() => paintSplit()).observe(
    document.querySelector("main"),
  );
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
  function fieldsFor(k) {
    return [
      ...schemas[k].fields,
      ...(cfg(k).extraFields || []).map((x) => x.id),
    ];
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
    return (
      displayValue(k, r, "Titre") ||
      displayValue(k, r, "Code") ||
      `Ligne ${r.id}`
    );
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
  function noteProjects(note) {
    const all = [...targets("notes", note, "Projet")];
    for (const stream of targets("notes", note, "Chantiers"))
      all.push(...targets("streams", stream, "Projet"));
    for (const task of targets("notes", note, "Taches")) {
      const p = projectOf("tasks", task);
      if (p) all.push(p);
    }
    return [...new Map(all.map((p) => [p.id, p])).values()];
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
  function transformed(k, r) {
    return [true, 1, "true"].includes(val(k, r, "Transforme"));
  }
  function conversionTarget(k, r) {
    const dest = k === "actions" ? "tasks" : k === "tasks" ? "streams" : null;
    const field = k === "actions" ? "ActionOrigine" : "TacheOrigine";
    return dest
      ? (data[dest] || [])
          .filter((x) => has(dest, x, field, r))
          .map((x) => [dest, x])
      : [];
  }
  let conversion = null;
  function conversionPlan(sourceKind, id, parentId) {
    const destKind = sourceKind === "actions" ? "tasks" : "streams",
      parentKind = sourceKind === "actions" ? "streams" : "projects";
    const parentField = sourceKind === "actions" ? "Chantier" : "Projet",
      originField = sourceKind === "actions" ? "ActionOrigine" : "TacheOrigine";
    const source = (data[sourceKind] || []).find((r) => r.id === id),
      parent = (data[parentKind] || []).find((r) => r.id === parentId);
    if (
      !source ||
      inactive(sourceKind, source) ||
      conversionTarget(sourceKind, source).length
    )
      throw Error("Cet élément est absent ou a déjà été transformé.");
    if (!parent || inactive(parentKind, parent))
      throw Error("Choisissez un parent actif pour le nouvel élément.");
    const requireField = (k, f, type) => {
      const m = col(k, f);
      if (cfg(k).fields?.[f] && m && type && m.type !== type)
        throw Error(
          `${schemas[k].label}.${f} est mappé vers ${m.colId} de type ${m.type} ; type attendu : ${type}.`,
        );
      if (m?.isFormula)
        throw Error(
          `${schemas[k].label}.${f} est identifié comme une colonne de formule par Grist. Utilisez une colonne de données modifiable.`,
        );
      if (!cfg(k).fields?.[f] || !m)
        throw Error(
          `Ajoutez et mappez ${schemas[k].label}.${f}${type ? " de type " + type : ""} (modifiable).`,
        );
    };
    requireField(sourceKind, "Transforme", "Bool");
    requireField(destKind, "Code", "Text");
    requireField(destKind, "Titre", "Text");
    for (const f of ["Code", "Titre", parentField, originField])
      requireField(destKind, f);
    const nextId = Math.max(0, ...(data[destKind] || []).map((r) => r.id)) + 1;
    let n = 1,
      code;
    const prefix = destKind === "tasks" ? "T" : "C",
      used = new Set(
        (data[destKind] || []).map((r) => String(val(destKind, r, "Code"))),
      );
    do {
      code = prefix + String(n++).padStart(3, "0");
    } while (used.has(code));
    for (const f of [parentField, originField])
      if (!/^(Text|Ref:|RefList:)/.test(col(destKind, f)?.type || ""))
        throw Error("Utilisez une référence Grist ou Texte pour " + f);
    const fields = {
      [cfg(destKind).fields.Code]: code,
      [cfg(destKind).fields.Titre]: title(sourceKind, source),
    };
    fields[cfg(destKind).fields[parentField]] = encodeLink(
      destKind,
      parentField,
      parentKind,
      parent,
    );
    fields[cfg(destKind).fields[originField]] = encodeLink(
      destKind,
      originField,
      sourceKind,
      source,
    );
    const skipped = [],
      copied = ["Titre"];
    for (const [from, to] of [
      ["Responsable", "Responsable"],
      ["ResponsableDiPSi", "ResponsableDiPSi"],
      ["DateDebut", "DateDebut"],
      ["DateFin", "DateFin"],
      ["Echeance", "Echeance"],
      ["Statut", "Statut"],
      ["Vigilance", "Vigilance"],
      ["Avancement", "Avancement"],
      [sourceKind === "actions" ? "Commentaire" : "PointEtape", "PointEtape"],
    ]) {
      const value = val(sourceKind, source, from);
      if (value === "" || value == null) continue;
      const a = col(sourceKind, from),
        b = col(destKind, to);
      let supported = b && !b.isFormula && a?.type === b.type;
      if (supported && b.type === "Choice") {
        let choices = [];
        try {
          choices = JSON.parse(b.widgetOptions || "{}").choices || [];
        } catch {}
        supported = choices.includes(value);
      }
      if (supported) {
        fields[cfg(destKind).fields[to]] = value;
        copied.push(to);
      } else skipped.push(from);
    }
    const newRow = { id: nextId, ...fields },
      updates = [];
    let actionCount = 0,
      contextCount = 0;
    const setLink = (k, r, delta, f, targetKind, targetRow) => {
      requireField(k, f);
      delta[cfg(k).fields[f]] =
        targetRow === newRow && col(k, f)?.type === "Text"
          ? code
          : encodeLink(k, f, targetKind, targetRow);
    };
    if (sourceKind === "tasks") {
      for (const a of data.actions || [])
        if (!transformed("actions", a) && has("actions", a, "Tache", source)) {
          const delta = {};
          setLink("actions", a, delta, "Tache", "tasks", null);
          setLink("actions", a, delta, "Chantier", "streams", newRow);
          if (
            cfg("actions").fields?.Projet &&
            !col("actions", "Projet")?.isFormula
          )
            setLink("actions", a, delta, "Projet", "projects", parent);
          updates.push(["UpdateRecord", cfg("actions").table, a.id, delta]);
          actionCount++;
        }
      for (const k of ["notes", "points"])
        for (const r of data[k] || [])
          if (has(k, r, "Taches", source)) {
            requireField(k, "Taches");
            requireField(k, "Chantiers");
            const delta = {};
            const others = targets(k, r, "Taches").filter(
                (t) => t.id !== source.id,
              ),
              streams = targets(k, r, "Chantiers");
            const encodeList = (f, target, rows) => {
              const m = col(k, f);
              if (m.type.startsWith("RefList:")) {
                if (m.type.split(":")[1] !== cfg(target).table)
                  throw Error("Référence incompatible : " + f);
                return ["L", ...rows.map((r) => r.id)];
              }
              if (m.type !== "Text")
                throw Error(
                  "Utilisez une liste de références ou Texte pour " + f,
                );
              return rows.map((r) => linkValue(target, r, k, f)).join(", ");
            };
            delta[cfg(k).fields.Taches] = encodeList("Taches", "tasks", others);
            delta[cfg(k).fields.Chantiers] = encodeList(
              "Chantiers",
              "streams",
              [...streams, newRow],
            );
            updates.push(["UpdateRecord", cfg(k).table, r.id, delta]);
            contextCount++;
          }
    }
    return {
      destKind,
      parentKind,
      parent,
      source,
      newRow,
      copied,
      skipped,
      actionCount,
      contextCount,
      actions: [
        ["AddRecord", cfg(destKind).table, nextId, fields],
        ...updates,
        [
          "UpdateRecord",
          cfg(sourceKind).table,
          id,
          { [cfg(sourceKind).fields.Transforme]: true },
        ],
      ],
    };
  }
  function previewConversion() {
    $("conversionError").textContent = "";
    $("conversionSubmit").disabled = true;
    try {
      const plan = conversionPlan(
        conversion.k,
        conversion.id,
        Number($("conversionParent").value),
      );
      conversion.plan = plan;
      $("conversionPreview").innerHTML =
        `<p><strong>${esc(title(conversion.k, plan.source))}</strong> deviendra un élément de ${esc(schemas[plan.destKind].label)} sous <strong>${esc(title(plan.parentKind, plan.parent))}</strong>.</p><p>Informations reprises : ${esc(plan.copied.join(", "))}. ${plan.skipped.length ? "Non reprises (conservées dans l’origine) : " + esc(plan.skipped.join(", ")) + "." : ""}</p><p>${plan.actionCount} action(s) et ${plan.contextCount} note(s) / point(s) seront rattachés au nouveau chantier.</p><p>L’origine restera consultable avec la mention « Transformé », hors du suivi actif. Son statut ne sera pas marqué « Fait ». La filiation et l’accès à la réunion seront conservés.</p>`;
      $("conversionSubmit").disabled = false;
    } catch (e) {
      conversion.plan = null;
      $("conversionError").textContent = e.message;
      $("conversionPreview").textContent =
        "Aucune donnée ne sera modifiée tant que la préparation n’est pas complète.";
    }
  }
  async function openConversion(k, id) {
    if (
      !editionEnabled ||
      editing ||
      moving ||
      demo ||
      !["actions", "tasks"].includes(k)
    )
      return;
    conversion = { k, id };
    const parentKind = k === "actions" ? "streams" : "projects";
    $("conversionTitle").textContent =
      k === "actions" ? "Faire évoluer en tâche" : "Faire évoluer en chantier";
    $("conversionParentLabel").textContent =
      k === "actions" ? "Chantier parent" : "Projet parent";
    $("conversionParent").innerHTML = ordered(parentKind)
      .map(
        (r) => `<option value="${r.id}">${esc(title(parentKind, r))}</option>`,
      )
      .join("");
    $("conversionDialog").showModal();
    previewConversion();
  }
  $("conversionParent").onchange = previewConversion;
  $("conversionCancel").onclick = () => {
    if (!moving) $("conversionDialog").close();
  };
  $("conversionDialog").addEventListener("cancel", (e) => {
    if (moving) e.preventDefault();
  });
  $("conversionForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!editionEnabled || moving || editing || !conversion?.plan) return;
    moving = true;
    ++request;
    syncEdition();
    $("conversionSubmit").disabled = true;
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
      const fresh = conversionPlan(
        conversion.k,
        conversion.id,
        Number($("conversionParent").value),
      );
      if (
        JSON.stringify(fresh.actions) !==
        JSON.stringify(conversion.plan.actions)
      ) {
        previewConversion();
        throw Error(
          "Les données ont changé. Vérifiez l’aperçu actualisé puis confirmez à nouveau.",
        );
      }
      await grist.docApi.applyUserActions(fresh.actions);
      $("conversionDialog").close();
      moving = false;
      await load();
      selectRecord(fresh.destKind, fresh.newRow.id, null);
      message(
        "Transformation enregistrée. L’origine reste consultable depuis le nouvel élément.",
      );
    } catch (err) {
      $("conversionError").textContent =
        "Transformation impossible : " + err.message;
    } finally {
      moving = false;
      syncEdition();
      $("conversionSubmit").disabled = !conversion?.plan;
    }
  };

  function archived(k, r) {
    return [true, 1, "true"].includes(val(k, r, "Archive"));
  }
  function inactive(k, r) {
    return archived(k, r) || transformed(k, r);
  }
  function outlineRows(k) {
    return (data[k] || []).filter(
      (r) =>
        !transformed(k, r) &&
        (!archived(k, r) ||
          $("showArchived").checked ||
          children(k, r).some(
            ([kind, row]) => !inactive(kind, row) || children(kind, row).length,
          )),
    );
  }
  let removal = null;
  async function incomingLinks(k, row) {
    const result = new Map(),
      add = (table, r, col) => {
        const key = table + ":" + r.id;
        if (!result.has(key))
          result.set(key, {
            table,
            id: r.id,
            cols: [],
            title: (() => {
              const kind = Object.keys(schemas).find(
                (x) => cfg(x).table === table,
              );
              return kind ? title(kind, r) : table + " #" + r.id;
            })(),
          });
        if (!result.get(key).cols.includes(col)) result.get(key).cols.push(col);
      };
    const columns = meta.filter(
      (c) =>
        /^Ref(List)?:/.test(c.type || "") &&
        c.type.split(":")[1] === cfg(k).table &&
        !c.table.startsWith("_grist_"),
    );
    const tablesToRead = [...new Set(columns.map((c) => c.table))];
    const raw = Object.fromEntries(
      await Promise.all(
        tablesToRead.map(async (t) => [
          t,
          rows(await grist.docApi.fetchTable(t)),
        ]),
      ),
    );
    for (const c of columns)
      for (const r of raw[c.table])
        if (values(r[c.colId]).some((x) => Number(x) === row.id))
          add(c.table, r, c.colId);
    for (const [kind, fields] of Object.entries(links))
      for (const [f, target] of Object.entries(fields))
        if (target === k && cfg(kind).fields?.[f])
          for (const r of data[kind] || [])
            if (has(kind, r, f, row))
              add(cfg(kind).table, r, cfg(kind).fields[f]);
    return [...result.values()];
  }
  async function openRemoval(k, id, mode) {
    if (!editionEnabled || editing || moving || demo) return;
    const operation = { k, id, mode };
    removal = operation;
    $("removalTitle").textContent =
      mode === "delete"
        ? "Supprimer un élément"
        : mode === "restore"
          ? "Restaurer un élément"
          : "Archiver un élément";
    $("removalError").textContent = "";
    $("removalPreview").textContent = "Vérification des liens…";
    $("removalSubmit").disabled = true;
    $("removalConfirm").checked = false;
    $("removalDialog").showModal();
    try {
      await refreshMetadata();
      data = Object.fromEntries(
        await Promise.all(
          Object.keys(schemas).map(async (kind) => [
            kind,
            cfg(kind).table
              ? rows(await grist.docApi.fetchTable(cfg(kind).table))
              : [],
          ]),
        ),
      );
      const row = (data[k] || []).find((r) => r.id === id);
      if (!row) throw Error("Cet élément n’existe plus.");
      const deps = await incomingLinks(k, row);
      if (removal !== operation || !$("removalDialog").open) return;
      removal.row = row;
      removal.deps = deps;
      const verb =
        mode === "delete"
          ? "Supprimer"
          : mode === "restore"
            ? "Restaurer"
            : "Archiver";
      $("removalPreview").innerHTML =
        `<p><strong>${esc(title(k, row))}</strong></p><p>${deps.length} élément(s) référencent cette ligne.</p>${deps.length ? "<ul>" + deps.map((d) => `<li>${esc(d.title)} — ${esc(d.table)} (${esc(d.cols.join(", "))})</li>`).join("") + "</ul>" : ""}<p>${mode === "delete" ? (deps.length ? "Suppression bloquée : réaffectez ou retirez ces liens auparavant. Vous pouvez archiver cet élément pour conserver ses références." : "Seule cette ligne sera supprimée définitivement. Aucun autre élément ne sera supprimé.") : mode === "restore" ? "Cet élément réapparaîtra dans le suivi actif." : "Les données et les liens seront conservés. Les dépendants ne seront pas archivés ; ils resteront accessibles sous le parent affiché comme contexte archivé."}</p>`;
      $("removalSubmit").textContent = verb;
      if (mode === "delete" && deps.length) return;
      if (mode !== "delete") {
        const m = col(k, "Archive");
        if (!m || m.type !== "Bool" || m.isFormula)
          throw Error(
            `Ajoutez et mappez ${schemas[k].label}.Archive : colonne de données Booléen / Case à cocher.`,
          );
        if (transformed(k, row))
          throw Error(
            "Une origine transformée ne se restaure pas comme un élément actif.",
          );
      }
      $("removalSubmit").disabled = false;
    } catch (err) {
      $("removalError").textContent = err.message;
    }
  }
  $("removalCancel").onclick = () => {
    if (!moving) {
      removal = null;
      $("removalDialog").close();
    }
  };
  $("removalDialog").addEventListener("cancel", (e) => {
    if (moving) e.preventDefault();
    else removal = null;
  });
  $("removalForm").onsubmit = async (e) => {
    e.preventDefault();
    if (
      !editionEnabled ||
      editing ||
      moving ||
      !removal?.row ||
      !$("removalConfirm").checked
    )
      return;
    moving = true;
    syncEdition();
    $("removalSubmit").disabled = true;
    ++request;
    try {
      const { k, id, mode } = removal;
      if (mode === "delete") {
        const fresh = rows(await grist.docApi.fetchTable(cfg(k).table)).find(
          (r) => r.id === id,
        );
        if (!fresh) throw Error("Cette ligne n’existe plus.");
        if (JSON.stringify(fresh) !== JSON.stringify(removal.row))
          throw Error(
            "La ligne a changé. Fermez puis rouvrez cet aperçu avant de confirmer.",
          );
        // Refresh mapped text links as well as native Grist references before deleting.
        data = Object.fromEntries(
          await Promise.all(
            Object.keys(schemas).map(async (kind) => [
              kind,
              cfg(kind).table
                ? rows(await grist.docApi.fetchTable(cfg(kind).table))
                : [],
            ]),
          ),
        );
        if ((await incomingLinks(k, fresh)).length)
          throw Error(
            "Des liens référencent encore cet élément. Fermez puis rouvrez cet aperçu pour les consulter.",
          );
        await grist.docApi.applyUserActions([
          ["RemoveRecord", cfg(k).table, id],
        ]);
        if (selection?.k === k && selection.id === id) selection = null;
      } else
        await grist.docApi.applyUserActions([
          [
            "UpdateRecord",
            cfg(k).table,
            id,
            { [cfg(k).fields.Archive]: mode !== "restore" },
          ],
        ]);
      $("removalDialog").close();
      moving = false;
      await load();
      message(
        mode === "delete"
          ? "Élément supprimé."
          : mode === "restore"
            ? "Élément restauré."
            : "Élément archivé.",
      );
    } catch (err) {
      $("removalError").textContent = "Opération impossible : " + err.message;
    } finally {
      moving = false;
      syncEdition();
      $("removalSubmit").disabled =
        removal.mode === "delete" && removal.deps?.length > 0;
    }
  };

  function ordered(k) {
    return [...(data[k] || [])]
      .filter(
        (r) =>
          !transformed(k, r) && (!archived(k, r) || $("showArchived").checked),
      )
      .sort((a, b) =>
        k === "notes"
          ? dateText(val(k, b, "Date")).localeCompare(
              dateText(val(k, a, "Date")),
            )
          : Number(val(k, a, "Ordre") || a.id) -
            Number(val(k, b, "Ordre") || b.id),
      );
  }
  function matches(k, r) {
    const p = quickChoice("projectFilter"),
      o = quickChoice("ownerFilter"),
      s = quickChoice("statusFilter"),
      q = norm($("search").value);
    return (
      nativeMatch(k, r) &&
      advancedMatch(k, r) &&
      (!archived(k, r) || $("showArchived").checked) &&
      (!p.length ||
        (k === "points"
          ? pointProjects(r).some((x) => p.includes(String(x.id)))
          : p.includes(String(projectOf(k, r)?.id)))) &&
      (!o.length ||
        filterValues(k, r, "Responsable").some((v) => o.includes(v))) &&
      (!s.length ||
        filterValues(k, r, k === "notes" ? "Etat" : "Statut").some((v) =>
          s.includes(v),
        )) &&
      (!q ||
        norm(
          Object.keys(cfg(k).fields || {})
            .map((f) => displayValue(k, r, f))
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
  const defaultKindNames = { ...kindLabels };
  function pointMeetingContext(point) {
    const note = targets("points", point, "NoteOrigine")[0];
    if (!note) return "Réunion d’origine non renseignée";
    const raw = dateText(val("notes", note, "Date"));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw.split("-").reverse().join("/")
      : raw || val("notes", note, "DateSource") || "Date non renseignée";
    return title("notes", note) + " · " + date;
  }
  function cardFacts(k, r, rich = true) {
    const facts = [];
    const add = (f, value, label) => {
      if (value !== "" && value != null) {
        const text = String(value).replace(/\s+/g, " ");
        value = text.length > 160 ? text.slice(0, 157) + "…" : text;
        facts.push(
          `<span><span class="card-field-label">${esc(label || fieldLabel(k, f))} :</span> ${esc(value)}</span>`,
        );
      }
    };
    const dateValue = (f) => {
      const raw = val(k, r, f);
      if (raw === "" || raw == null) return "";
      const iso = dateText(raw);
      return /^\d{4}-\d{2}-\d{2}$/.test(iso)
        ? iso.split("-").reverse().join("/")
        : iso;
    };
    add("Volet", displayValue(k, r, "Volet"));
    add("Responsable", displayValue(k, r, "Responsable"));
    add("ResponsableDiPSi", displayValue(k, r, "ResponsableDiPSi"));
    add(
      "Date",
      dateValue("Date") || (k === "notes" ? val(k, r, "DateSource") : ""),
    );
    add(
      "DateDebut",
      rich ? dateValue("DateDebut") : "",
      cfg(k).fieldLabels?.DateDebut || "Date de début",
    );
    add(
      "DateFin",
      dateValue("DateFin"),
      cfg(k).fieldLabels?.DateFin || "Date de fin",
    );
    add(
      "Echeance",
      displayValue(k, r, "Echeance"),
      cfg(k).fieldLabels?.Echeance || "Échéance",
    );
    if (rich) add("Nature", displayValue(k, r, "Nature"));
    add("Statut", displayValue(k, r, "Statut"));
    add("Etat", displayValue(k, r, "Etat"));
    add("Vigilance", displayValue(k, r, "Vigilance"));
    if (rich)
      for (const extra of cfg(k).extraFields || [])
        if (extra.showInCard !== false)
          add(extra.id, displayValue(k, r, extra.id));
    const progress = val(k, r, "Avancement");
    if (
      rich &&
      progress !== "" &&
      progress != null &&
      Number.isFinite(Number(progress))
    ) {
      const percent = Math.round(Number(progress) * 100);
      facts.push(
        `<span class="card-progress"><span><span class="card-field-label">${esc(fieldLabel(k, "Avancement"))} :</span> ${percent} %</span><progress max="100" value="${Math.max(0, Math.min(100, percent))}" aria-label="${esc(fieldLabel(k, "Avancement"))} : ${percent} %"></progress></span>`,
      );
    }
    if (rich && k === "notes")
      add("Participants", displayValue(k, r, "Participants"));
    if (k === "actions" && overdue(r))
      facts.push('<span class="badge late">Échéance : en retard</span>');
    let html = facts.length
      ? '<span class="card-facts">' +
        facts.join(
          '<span class="fact-separator" aria-hidden="true">; </span>',
        ) +
        "</span>"
      : "";
    if (rich) {
      const f = [
        "PointEtape",
        "Decision",
        "Commentaire",
        ...(["notes", "points"].includes(k) ? ["Contenu"] : []),
      ].find((f) => displayValue(k, r, f));
      if (f) {
        const text = displayValue(k, r, f).replace(/\s+/g, " ");
        html += `<small class="card-excerpt"><span class="card-field-label">${esc(cfg(k).fieldLabels?.[f] || { PointEtape: "Point d’étape", Decision: "Décision", Contenu: "Notes" }[f] || fieldLabel(k, f))} :</span> ${esc(text.length > 160 ? text.slice(0, 157) + "…" : text)}</small>`;
      }
    }
    return html;
  }
  function item(k, r, level = 0, rich = false) {
    const note = k === "points" ? targets("points", r, "NoteOrigine")[0] : null;
    const context = note ? pointMeetingContext(r) : "";
    const labelledContext = note
      ? "Réunion : " + context.replace(" · ", " ; Date : ")
      : "Réunion : non renseignée";
    return `<button class="item ${rich ? "compact-card" : ""} level${level} ${selection?.k === k && selection.id === r.id ? "selected" : ""}" data-kind="${k}" data-id="${r.id}"><span class="item-kind">${kindLabels[k]}</span><strong>${esc(title(k, r))}</strong>${k === "points" ? `<small class="point-origin">${esc(labelledContext)}</small>` : ""}${archived(k, r) ? '<span class="badge">État : Archivé</span>' : ""}${transformed(k, r) ? '<span class="badge">État : Transformé</span>' : ""}${cardFacts(k, r, rich)}</button>`;
  }
  function filterOptions() {
    scopeAllowed = new WeakMap();
    const labelKind = view === "projects" ? "streams" : view;
    $("ownerFilterLabel").textContent = fieldLabel(labelKind, "Responsable");
    $("statusFilterLabel").textContent = fieldLabel(
      labelKind,
      view === "notes" ? "Etat" : "Statut",
    );
    const k = view === "projects" ? "streams" : view;
    const kinds =
      view === "notes"
        ? ["notes", "points", "actions"]
        : ["projects", "streams", "tasks", "actions"];
    const scope = kinds.flatMap((kind) =>
      (data[kind] || [])
        .filter((row) => nativeMatch(kind, row) && !inactive(kind, row))
        .map((row) => [kind, row]),
    );
    for (const [id, opts] of [
      [
        "projectFilter",
        outlineRows("projects")
          .filter((r) => nativeMatch("projects", r))
          .map((r) => [r.id, title("projects", r)]),
      ],
      [
        "ownerFilter",
        [
          ...new Set(
            scope
              .flatMap(([kind, row]) => filterValues(kind, row, "Responsable"))
              .filter(Boolean),
          ),
        ]
          .sort()
          .map((v) => [v, v]),
      ],
      [
        "statusFilter",
        [
          ...new Set(
            scope
              .flatMap(([kind, row]) =>
                filterValues(kind, row, kind === "notes" ? "Etat" : "Statut"),
              )
              .filter(Boolean),
          ),
        ]
          .sort()
          .map((v) => [v, v]),
      ],
    ]) {
      const valid = new Set(opts.map(([v]) => String(v)));
      quickSelections[id] = quickChoice(id).filter((v) => valid.has(v));
      const selected = quickChoice(id);
      $(id).innerHTML =
        '<option value="">Tous</option>' +
        opts
          .map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`)
          .join("") +
        (selected.length > 1
          ? `<option value="__multiple__">${selected.length} choix sélectionnés</option>`
          : "");
      $(id).value = selected.length > 1 ? "__multiple__" : selected[0] || "";
      quickUI(id, opts);
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
        ...outlineRows("streams")
          .filter((x) => has("streams", x, "Projet", r))
          .map((x) => ["streams", x]),
      );
    if (k === "streams")
      result.push(
        ...outlineRows("tasks")
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
        ...outlineRows("points")
          .filter((x) => has("points", x, "NoteOrigine", r))
          .map((x) => ["points", x]),
      );
    if (k === "points")
      result.push(
        ...(data.actions || [])
          .filter(
            (x) =>
              has("actions", x, "PointOrigine", r) &&
              (!archived("actions", x) || $("showArchived").checked),
          )
          .map((x) => ["actions", x]),
      );
    if (k === "notes")
      result.push(
        ...(data.actions || [])
          .filter(
            (x) =>
              has("actions", x, "NoteOrigine", r) &&
              (!archived("actions", x) || $("showArchived").checked) &&
              !targets("actions", x, "PointOrigine").length,
          )
          .map((x) => ["actions", x]),
      );
    return result;
  }
  function tree(k, r, filtered = false) {
    if (filtered && !nativeMatch(k, r)) return null;
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
        nativeMatch(k, r) &&
        advancedMatch(k, r) &&
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
    const movable =
      ["streams", "tasks", "actions"].includes(k) && !inactive(k, r);
    return `<div class="tree-node" data-tree-kind="${k}" data-tree-id="${r.id}"><div class="tree-row" data-drop-kind="${k}" data-drop-id="${r.id}" ${movable ? `draggable="${editionEnabled && !editing && !moving && !demo}" data-drag-kind="${k}" data-drag-id="${r.id}"` : ""}>${kids.length ? `<button class="fold" type="button" data-fold="${key}" aria-expanded="${open}" aria-label="${open ? "Plier" : "Déplier"} ${esc(title(k, r))}">${open ? "▾" : "▸"}</button>` : '<span class="fold-spacer"></span>'}${item(k, r, 0, context.startsWith("left-"))}${editionEnabled && movable ? `<button class="move-button" type="button" data-move-kind="${k}" data-move-id="${r.id}" aria-label="Déplacer ${esc(title(k, r))}" title="Déplacer"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 20 4M7 4h13v13"/></svg></button>` : ""}</div>${kids.length ? `<div class="tree-children" ${open ? "" : "hidden"}>${kids.map((n) => branch(n, context)).join("")}</div>` : ""}</div>`;
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
      .querySelectorAll(
        "[data-new], [data-edit], [data-convert], [data-removal]",
      )
      .forEach(
        (b) =>
          (b.disabled =
            !editionEnabled ||
            moving ||
            (b.closest("#detail") &&
              !b.matches("[data-removal]") &&
              inactive(
                selection?.k,
                (data[selection?.k] || []).find((r) => r.id === selection?.id),
              ))),
      );
  }
  function render() {
    scopeAllowed = new WeakMap();
    advancedSets = null;
    document.body.dataset.currentView = view;
    advancedUI();
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("unlinked").closest("label").hidden = view !== "actions";
    $("overdue").closest("label").hidden = view !== "actions";
    const context = "left-" + view;
    let html = "";
    if (view === "notes")
      html = outlineRows("notes")
        .map((r) => branch(tree("notes", r, true), context))
        .join("");
    else {
      html = outlineRows("projects")
        .map((r) => branch(tree("projects", r, true), context))
        .join("");
      const orphans = [
        ...outlineRows("streams")
          .filter((r) => !targets("streams", r, "Projet").length)
          .map((r) => ["streams", r]),
        ...outlineRows("tasks")
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
      `<div class="actions"><button data-new="${view === "projects" ? "projects" : view}">+ ${view === "projects" ? cfg("projects").label || "Projet" : view === "notes" ? cfg("notes").label || "Note / réunion" : cfg("actions").label || "Action"}</button><button data-fold-all="close">Tout plier</button><button data-fold-all="open">Tout déplier</button></div>` +
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
      if (
        !row ||
        inactive(source.k, row) ||
        (destination.k !== "unassigned" &&
          (!target || inactive(destination.k, target)))
      )
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
    if (k === "projects" && kind === "notes")
      return noteProjects(row).some((p) => p.id === r.id);
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
    "showArchived",
    "overdue",
  ];
  function captureLocation(source = null) {
    $("detail")
      .querySelectorAll("details[data-section-key]")
      .forEach((d) =>
        d.open
          ? folded.delete(d.dataset.sectionKey)
          : folded.add(d.dataset.sectionKey),
      );
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
      quickSelections: structuredClone(quickSelections),
      advancedSelected: [...advancedSelected],
      advancedRules: structuredClone(advancedRules),
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
    Object.assign(
      quickSelections,
      structuredClone(
        location.quickSelections || {
          projectFilter: [],
          ownerFilter: [],
          statusFilter: [],
        },
      ),
    );
    advancedSelected = [...(location.advancedSelected || [])];
    advancedRules = structuredClone(location.advancedRules || []);
    selection = location.selection;
    view = location.view;
    folded.clear();
    location.folded.forEach((key) => folded.add(key));
    knownBranches.clear();
    location.known.forEach((key) => knownBranches.add(key));
    filterOptions();
    if (location.filters.advancedKind) {
      $("advancedKind").value = location.filters.advancedKind;
      advancedUI();
    }
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

  function associatedMeetings(k, record, actions) {
    const meetings = new Map();
    const add = (note, reason) => {
      if (!note || (archived("notes", note) && !$("showArchived").checked))
        return;
      if (!meetings.has(note.id))
        meetings.set(note.id, {
          note,
          reasons: new Set(),
          pointIds: new Set(),
          actionIds: new Set(),
        });
      meetings.get(note.id).reasons.add(reason);
      return meetings.get(note.id);
    };
    for (const note of ordered("notes"))
      if (linkedTo(k, record, "notes", note)) {
        const direct =
          k === "projects"
            ? has("notes", note, "Projet", record)
            : k === "streams"
              ? has("notes", note, "Chantiers", record)
              : k === "tasks"
                ? has("notes", note, "Taches", record)
                : false;
        add(note, direct ? "Lien direct" : "Via un élément lié");
      }
    for (const point of k === "points"
      ? [record]
      : ordered("points").filter((p) => linkedTo(k, record, "points", p))) {
      for (const note of targets("points", point, "NoteOrigine")) {
        const entry = add(note, "Via le point : " + title("points", point));
        if (entry) entry.pointIds.add(point.id);
      }
    }
    for (const action of actions) {
      const notes = targets("actions", action, "NoteOrigine");
      for (const point of targets("actions", action, "PointOrigine"))
        notes.push(...targets("points", point, "NoteOrigine"));
      for (const note of notes) {
        const entry = add(note, "Via l’action : " + title("actions", action));
        if (entry) entry.actionIds.add(action.id);
      }
    }
    return [...meetings.values()].sort((a, b) =>
      dateText(val("notes", b.note, "Date")).localeCompare(
        dateText(val("notes", a.note, "Date")),
      ),
    );
  }
  function meetingAssociationCard(entry) {
    const node = tree("notes", entry.note);
    // Only show points/actions explaining this association, not unrelated agenda items.
    node.kids = node.kids.filter((child) =>
      child.k === "points"
        ? entry.pointIds.has(child.r.id) ||
          child.kids.some((a) => entry.actionIds.has(a.r.id))
        : entry.actionIds.has(child.r.id),
    );
    return `<div class="associated-meeting" data-meeting-id="${entry.note.id}">${branch(node, "right-notes").replace("</strong>", '</strong><small class="meeting-reasons">' + esc([...entry.reasons].join(" · ")) + "</small>")}</div>`;
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
  function detailSection(k, r, name, label, content) {
    const key = `section:${k}:${r.id}:${name}`;
    return `<details class="detail-section" data-section-key="${key}" ${folded.has(key) ? "" : "open"}><summary>${esc(label)}</summary>${content}</details>`;
  }
  document.querySelector("main").addEventListener(
    "toggle",
    (e) => {
      const d = e.target;
      if (d.matches?.("details[data-section-key]") && d.isConnected) {
        d.open
          ? folded.delete(d.dataset.sectionKey)
          : folded.add(d.dataset.sectionKey);
      }
    },
    true,
  );
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
    if (k === "points")
      html += `<p class="point-origin">${esc(pointMeetingContext(r))}</p>`;
    if (inactive(k, r)) {
      html = html.replace('<button data-edit="1">Modifier</button>', "");
      html +=
        `<p class="muted">${transformed(k, r) ? "Transformé" : "Archivé"} — conservé pour l’historique.</p>` +
        conversionTarget(k, r)
          .map(([kind, row]) => item(kind, row))
          .join("");
    } else if (["actions", "tasks"].includes(k))
      html += `<button type="button" data-convert="${k}" data-convert-id="${r.id}">Faire évoluer en ${k === "actions" ? "tâche" : "chantier"}…</button>`;
    html += `<div class="actions">${!transformed(k, r) ? `<button type="button" data-removal="${archived(k, r) ? "restore" : "archive"}">${archived(k, r) ? "Restaurer" : "Archiver"}…</button>` : ""}<button type="button" data-removal="delete">Supprimer…</button></div>`;
    html +=
      '<dl class="meta">' +
      [
        "Type",
        "Volet",
        "Nature",
        "Responsable",
        "ResponsableDiPSi",
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
            `<dt>${esc(fieldLabel(k, f))}</dt><dd data-slot="${f}">${esc(f.startsWith("Date") && f !== "DateSource" ? dateText(val(k, r, f)) : displayValue(k, r, f))}</dd>`,
        )
        .join("") +
      "</dl>";
    for (const f of Object.keys(links[k] || {})) {
      const target = links[k][f],
        rs = targets(k, r, f);
      if (cfg(k).fields?.[f]) {
        html += `<section class="relation-field"><h3>${esc(fieldLabel(k, f))}</h3><div data-slot="${f}">${rs.length ? rs.map((x) => item(target, x)).join("") : '<span class="muted">Aucun rattachement</span>'}</div></section>`;
      }
    }
    for (const extra of cfg(k).extraFields || [])
      if (cfg(k).fields?.[extra.id])
        html += `<section class="extra-field"><h3>${esc(fieldLabel(k, extra.id))}</h3><div data-slot="${extra.id}" class="text">${esc(displayValue(k, r, extra.id)) || '<span class="muted">Non renseigné</span>'}</div></section>`;
    const progress = val(k, r, "Avancement");
    if (progress !== "" && Number.isFinite(Number(progress))) {
      const percent = Math.round(Number(progress) * 100);
      html += `<p>${esc(fieldLabel(k, "Avancement"))} : ${percent} %</p><progress max="100" value="${percent}"></progress>`;
    }
    for (const f of [
      "Description",
      "Contenu",
      "Decision",
      "PointEtape",
      "Commentaire",
    ])
      if (val(k, r, f))
        html += `<h3>${esc(cfg(k).fieldLabels?.[f] || (f === "Contenu" ? "Notes et décisions" : f))}</h3><div class="text" data-slot="${f}">${esc(displayValue(k, r, f))}</div>`;
    if (["projects", "streams", "tasks"].includes(k))
      html += `<div class="actions">${k !== "tasks" ? `<button data-new="${k === "projects" ? "streams" : "tasks"}">+ ${k === "projects" ? cfg("streams").label || "Chantier" : cfg("tasks").label || "Tâche"}</button>` : ""}<button data-new="notes">+ Note</button><button data-new="actions">+ Action</button></div>`;
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
      html += detailSection(
        k,
        r,
        "dependents",
        "Éléments dépendants",
        deps
          .map(([kind, row]) => branch(tree(kind, row), "right-dependents"))
          .join(""),
      );
    if (k !== "actions") {
      let actions = (data.actions || []).filter(
        (x) =>
          linkedTo(k, r, "actions", x) &&
          (!archived("actions", x) || $("showArchived").checked) &&
          (["notes", "points"].includes(k) || !transformed("actions", x)),
      );
      if (k !== "notes") {
        const meetings = associatedMeetings(k, r, actions);
        html += detailSection(
          k,
          r,
          "meetings",
          "Notes et réunions associées",
          meetings.map(meetingAssociationCard).join("") ||
            '<p class="muted">Aucune note liée.</p>',
        );
      }
      html += detailSection(
        k,
        r,
        "actions",
        "Actions associées",
        actions.map((x) => item("actions", x)).join("") ||
          '<p class="muted">Aucune action liée.</p>',
      );
    }
    if (k === "actions") {
      const meetings = associatedMeetings(k, r, [r]);
      html += detailSection(
        k,
        r,
        "meetings",
        "Notes et réunions associées",
        meetings.map(meetingAssociationCard).join("") ||
          '<p class="muted">Aucune note liée.</p>',
      );
    }
    $("detail").innerHTML = html;
    const actionBar =
      $("detail").querySelector("[data-removal]")?.parentElement;
    if (actionBar)
      for (const control of [
        ...$("detail").querySelectorAll("[data-edit],[data-convert]"),
      ].reverse())
        actionBar.prepend(control);
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
      await loadReferences();
      applyLabels();
      filterOptions();
      render();
      message(
        nativeWarning ||
          (demo
            ? "Démonstration : données fictives, édition désactivée."
            : Object.keys(schemas).filter(
                  (k) =>
                    k !== "points" && (!cfg(k).table || !cfg(k).fields?.Titre),
                ).length
              ? "Mapping incomplet : choisissez les tables et leurs champs."
              : `Données actualisées — ${Object.values(data).reduce((n, r) => n + r.length, 0)} lignes chargées.${nativeTable ? (nativeKind() ? " Filtres Grist appliqués depuis « " + nativeTable + " »." : " La table source « " + nativeTable + " » n’est pas mappée : ses filtres ne s’appliquent pas à cette hiérarchie.") : ""}`),
      );
    } catch (e) {
      message("Chargement impossible : " + e.message, true);
    }
  }
  function detect(d, force = false) {
    const copy = structuredClone(d);
    for (const [k, s] of Object.entries(schemas)) {
      copy[k] ||= { table: "", fields: {} };
      const c = copy[k];
      if (!c.table && (!Object.hasOwn(d[k] || {}, "table") || force)) {
        const found = tables.filter((t) =>
          s.aliases.some(
            (a) => norm(a) === norm(t.label) || norm(a) === norm(t.tableId),
          ),
        );
        if (found.length === 1) c.table = found[0].tableId;
      }
      c.fields ||= {};
      for (const f of s.fields) {
        if (c.fields[f] || (!force && Object.hasOwn(c.fields, f))) continue;
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
      '<h2>Tables et champs</h2><p>La réouverture conserve tous vos choix, y compris les champs non mappés. La détection est relancée uniquement avec le bouton dédié. Un champ vide est facultatif, sauf Titre. Mappez les parents pour construire la hiérarchie. Les colonnes de formule sont lisibles et restent protégées en édition.</p><p>DateFin est une date précise pour le calendrier et les retards. Echeance est un texte libre (ex. « avant le Codir »). Vous pouvez ne mapper qu’un seul des deux.</p><div class="actions"><button id="detect">Détecter les champs manquants</button><button id="applyMapping">Enregistrer le mapping</button></div><div class="grid">' +
      Object.entries(schemas)
        .map(([k, s]) => {
          const c = draft[k] || { fields: {} };
          return (
            `<fieldset><legend>${esc(s.label)}</legend><label>Nom du niveau / type<input data-kind-label="${k}" value="${esc(c.label || "")}" placeholder="${esc(defaultNames[k])}"></label><label>Table<select data-map="${k}" data-field="table">${options(
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
                  )}</select></label><input class="field-label" data-label-kind="${k}" data-label-field="${f}" value="${esc(c.fieldLabels?.[f] || "")}" placeholder="Libellé affiché : ${esc(fieldLabel(k, f))}" aria-label="Libellé ${k}.${f}">`,
              )
              .join("") +
            `<div class="extra-mapping">${(c.extraFields || [])
              .map(
                (extra) =>
                  `<div class="extra-map-row"><input data-extra-label="${extra.id}" data-extra-kind="${k}" value="${esc(extra.label || "")}" placeholder="Libellé du champ"><select data-map="${k}" data-field="${extra.id}">${options(
                    meta
                      .filter((m) => m.table === c.table)
                      .map((m) => [m.colId, m.label || m.colId]),
                    c.fields?.[extra.id],
                  )}</select><button type="button" data-remove-extra="${extra.id}" data-extra-kind="${k}">Retirer</button></div>`,
              )
              .join(
                "",
              )}<button type="button" data-add-extra="${k}">+ Champ supplémentaire</button></div></fieldset>`
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
    if (r && archived(k, r)) {
      message("Restaurez cet élément avant de le modifier.");
      return;
    }
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
    if (r && transformed(k, r)) {
      message("Cet élément a été transformé ; modifiez son nouvel élément.");
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
    $("fields").innerHTML = fieldsFor(k)
      .filter(
        (f) =>
          cfg(k).fields?.[f] &&
          !col(k, f)?.isFormula &&
          !(r && f === "Code") &&
          !["Archive", "Transforme", "ActionOrigine", "TacheOrigine"].includes(
            f,
          ),
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
          const rows = (data[target] || []).filter(
            (x) =>
              !inactive(target, x) ||
              (r && targets(k, r, f).some((t) => t.id === x.id)),
          );
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
        } else if (
          (f.startsWith("Date") && f !== "DateSource") ||
          type.startsWith("Date")
        )
          input = `<input type="date" name="${f}" value="${esc(dateText(v))}">`;
        else if (textareas.has(f))
          input = `<textarea name="${f}">${esc(v)}</textarea>`;
        else if (type === "Choice" || type === "ChoiceList") {
          let choices = [];
          try {
            choices = JSON.parse(m.widgetOptions || "{}").choices || [];
          } catch {}
          const selected = type === "ChoiceList" ? values(v) : [v];
          for (const value of selected)
            if (value !== "" && !choices.includes(value)) choices.push(value);
          input =
            `<select name="${f}" ${type === "ChoiceList" ? "multiple" : ""}><option value=""></option>` +
            choices
              .map(
                (x) =>
                  `<option ${selected.includes(x) ? "selected" : ""}>${esc(x)}</option>`,
              )
              .join("") +
            "</select>";
        } else if (/^Ref/.test(type)) {
          const refTable = type.split(":")[1],
            rows = tableRows(refTable),
            selected = values(v).map(Number);
          input =
            `<select name="${f}" ${type.startsWith("RefList:") ? "multiple" : ""}><option value="">— Aucun —</option>` +
            rows
              .map(
                (row) =>
                  `<option value="${row.id}" ${selected.includes(row.id) ? "selected" : ""}>${esc(refText(m, row.id, null))}</option>`,
              )
              .join("") +
            "</select>";
        } else if (type === "Bool")
          input = `<input type="checkbox" name="${f}" ${v === true ? "checked" : ""}>`;
        else if (
          f === "Avancement" ||
          f === "Ordre" ||
          /^(Numeric|Int)$/.test(type)
        )
          input = `<input name="${f}" type="number" step="any" ${f === "Avancement" ? 'min="0" max="1"' : ""} value="${esc(v)}">`;
        else
          input = `<input name="${f}" ${f === "Titre" ? "required" : ""} value="${esc(v)}">`;
        return `<label>${esc(fieldLabel(k, f))}${f === "Avancement" ? " (0 à 1 ; 0,5 = 50 %)" : ""}${input}</label>`;
      })
      .join("");
    if (r) {
      const controls = [...$("fields").children];
      const form = $("editForm");
      const display = document.createElement("div");
      display.className = "inline-content";
      while ($("detail").firstChild) display.append($("detail").firstChild);
      display
        .querySelectorAll(
          "[data-edit], [data-new], [data-removal], [data-convert]",
        )
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
    for (const control of $("editForm").querySelectorAll("[name]"))
      control.dataset.initialValue = JSON.stringify(
        control.type === "checkbox"
          ? control.checked
          : control.multiple
            ? [...control.selectedOptions].map((o) => o.value)
            : control.value,
      );
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
    $("fields").replaceChildren();
    $("editError").textContent = "";
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
      for (const f of fieldsFor(k)) {
        const el = $("editForm").elements.namedItem(f);
        if (!el) continue;
        const current = JSON.stringify(
          el.type === "checkbox"
            ? el.checked
            : el.multiple
              ? [...el.selectedOptions].map((o) => o.value)
              : el.value,
        );
        if (r && el.dataset.initialValue === current) continue;
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
        } else if (/^Ref(List)?:/.test(m?.type || ""))
          v = m.type.startsWith("RefList:")
            ? [
                "L",
                ...[...el.selectedOptions]
                  .map((o) => Number(o.value))
                  .filter(Boolean),
              ]
            : Number(v) || 0;
        else if (
          (f.startsWith("Date") && f !== "DateSource") ||
          m?.type?.startsWith("Date")
        )
          v = v
            ? /^Date/.test(m?.type || "")
              ? Date.parse(v + "T00:00:00Z") / 1000
              : v
            : null;
        else if (m?.type === "Bool") v = el.checked;
        else if (m?.type === "ChoiceList")
          v = [
            "L",
            ...[...el.selectedOptions].map((o) => o.value).filter(Boolean),
          ];
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
          if (childEl?.value && Number.isFinite(Number(childEl.value))) {
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
  async function refreshMetadata() {
    const [ts, cs] = await Promise.all([
      grist.docApi.fetchTable("_grist_Tables"),
      grist.docApi.fetchTable("_grist_Tables_column"),
    ]);
    tables = rows(ts).filter((t) => !t.tableId.startsWith("_grist_"));
    const ids = new Map(tables.map((t) => [t.id, t.tableId]));
    meta = rows(cs)
      .map((c) => ({ ...c, table: ids.get(c.parentId) }))
      .filter((c) => c.table);
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
        const width = opts?.[layoutKey]?.leftFraction;
        if (typeof width === "number" && Number.isFinite(width)) {
          preferredSplit = Math.max(0.05, Math.min(0.95, width));
          paintSplit();
        }
        const next = opts?.[optionKey];
        if (next && JSON.stringify(next) !== JSON.stringify(mapping)) {
          mappingWasSaved = true;
          mapping = next;
          applyLabels();
          draft = structuredClone(mapping);
          if (loaded) {
            mappingUI();
            await load();
          }
        }
      });
      await refreshMetadata();
      mapping = mappingWasSaved ? mapping : detect(mapping);
      draft = structuredClone(mapping);
      loaded = true;
      mappingUI();
      grist.onRecords(async (records) => {
        if (selectedViewFetcher()) await refreshNativeScope();
        else {
          const stamp = ++nativeRevision;
          try {
            const table = await grist.selectedTable.getTableId();
            if (stamp === nativeRevision)
              acceptNativeScope(table, records || []);
          } catch {
            if (stamp === nativeRevision) {
              nativePending = nativeIds === null;
              nativeWarning = nativePending
                ? "Filtres Grist en attente de connexion."
                : "Connexion Grist interrompue : dernier filtre conservé.";
            }
          }
        }
        await load();
      });
      await refreshNativeScope();

      await load();
      if (
        Object.keys(schemas)
          .filter((k) => k !== "points")
          .some((k) => !cfg(k).table) &&
        !mappingWasSaved
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
        quickSelections.ownerFilter = [];
        quickSelections.statusFilter = [];
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
    "showArchived",
  ])
    $(id).onchange = () => {
      if (Object.hasOwn(quickSelections, id)) {
        if ($(id).value !== "__multiple__")
          quickSelections[id] = $(id).value ? [$(id).value] : [];
      }
      filterOptions();
      render();
    };
  $("search").oninput = render;
  $("advancedKind").onchange = () => {
    advancedSelected = [];
    advancedUI(true);
    render();
  };
  $("advancedField").onchange = () => {
    advancedSelected = [];
    render();
  };
  $("advancedChoices").onchange = () => {
    advancedSelected = [
      ...$("advancedChoices").querySelectorAll("input:checked"),
    ].map((x) => x.value);
    render();
  };
  $("advancedValue").oninput = render;
  $("advancedAdd").onclick = () => {
    if (!$("advancedValue").value.trim() && !advancedSelected.length) return;
    advancedRules.push(draftAdvancedRule());
    advancedSelected = [];
    $("advancedValue").value = "";
    render();
  };
  $("advancedChips").onclick = (e) => {
    const b = e.target.closest("[data-remove-filter]");
    if (b) {
      advancedRules.splice(Number(b.dataset.removeFilter), 1);
      render();
    }
  };
  $("advancedClear").onclick = () => {
    $("advancedValue").value = "";
    advancedRules = [];
    advancedSelected = [];
    render();
  };
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
        "[data-kind], [data-new], [data-edit], [data-fold], [data-fold-all], [data-move-kind], [data-convert], [data-removal], [data-history]",
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
    const removalButton = e.target.closest("[data-removal]");
    if (removalButton) {
      openRemoval(selection.k, selection.id, removalButton.dataset.removal);
      return;
    }
    const convert = e.target.closest("[data-convert]");
    if (convert) {
      openConversion(
        convert.dataset.convert,
        Number(convert.dataset.convertId),
      );
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
  $("mappingButton").onclick = async () => {
    if (editing || moving) {
      message("Terminez l’opération en cours avant de modifier le mapping.");
      return;
    }
    if (!$("mapping").hidden) {
      $("mapping").hidden = true;
      return;
    }
    try {
      if (!demo) await refreshMetadata();
      draft = structuredClone(mapping);
      mappingUI();
      $("mapping").hidden = false;
    } catch (err) {
      message("Impossible d’actualiser les colonnes : " + err.message, true);
    }
  };
  $("refresh").onclick = async () => {
    if (demo) return init();
    await refreshNativeScope();
    await load();
  };
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
    if (e.target.dataset.extraLabel) {
      const extra = draft[e.target.dataset.extraKind]?.extraFields?.find(
        (x) => x.id === e.target.dataset.extraLabel,
      );
      if (extra) extra.label = e.target.value.trim();
      return;
    }
    if (e.target.dataset.kindLabel) {
      const k = e.target.dataset.kindLabel;
      draft[k] ||= { fields: {} };
      draft[k].label = e.target.value.trim();
      return;
    }
    if (e.target.dataset.labelKind) {
      const k = e.target.dataset.labelKind;
      draft[k] ||= { fields: {} };
      draft[k].fieldLabels ||= {};
      draft[k].fieldLabels[e.target.dataset.labelField] = e.target.value.trim();
      return;
    }
    const { map: k, field: f } = e.target.dataset;
    if (!k) return;
    draft[k] ||= { fields: {} };
    if (f === "table") {
      draft[k] = { ...draft[k], table: e.target.value, fields: {} };
      draft = { ...draft, [k]: detect({ [k]: draft[k] })[k] };
      mappingUI();
    } else draft[k].fields[f] = e.target.value;
  };
  $("mapping").onclick = async (e) => {
    if (e.target.dataset.addExtra) {
      const k = e.target.dataset.addExtra;
      draft[k] ||= { fields: {} };
      draft[k].extraFields ||= [];
      let n = 1;
      while (draft[k].extraFields.some((x) => x.id === "extra_" + n)) n++;
      draft[k].extraFields.push({
        id: "extra_" + n,
        label: "Champ supplémentaire " + n,
      });
      mappingUI();
      return;
    }
    if (e.target.dataset.removeExtra) {
      const k = e.target.dataset.extraKind,
        id = e.target.dataset.removeExtra;
      draft[k].extraFields = draft[k].extraFields.filter((x) => x.id !== id);
      delete draft[k].fields[id];
      mappingUI();
      return;
    }
    if (e.target.id === "detect") {
      draft = detect(draft, true);
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
        for (const [kind, c] of Object.entries(draft))
          for (const extra of c.extraFields || []) {
            const column = c.fields?.[extra.id];
            if (
              column &&
              Object.entries(c.fields).some(
                ([f, col]) => f !== extra.id && col === column,
              )
            )
              throw Error(
                `La colonne ${column} est déjà mappée dans ${schemas[kind].label}. Renommez le champ existant ou choisissez une autre colonne.`,
              );
          }
        await grist.setOption(optionKey, draft);
        mappingWasSaved = true;
        mapping = structuredClone(draft);
        applyLabels();
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
            archivedCol: c.fields.Transforme || "",
            manualArchivedCol: c.fields.Archive || "",
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
