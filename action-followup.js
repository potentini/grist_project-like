/* Action follow-up shares the meeting dialog layout and searchable controls. */
(() => {
  window.createActionFollowup = (ctx) => {
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
    const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
    const none = "none";
    const dialog = document.createElement("dialog");
    dialog.id = "actionFollowup";
    dialog.className = "followup-dialog";
    dialog.setAttribute("aria-labelledby", "actionFollowupTitle");
    dialog.innerHTML = `
      <div class="followup-header">
        <h2 id="actionFollowupTitle">Suivi des actions</h2>
        <button id="actionFollowupClose" type="button">Fermer</button>
      </div>
      <div class="followup-controls">
        <label class="followup-target">Projet<select id="actionFollowupProject"></select></label>
        <label class="followup-target">Responsable<select id="actionFollowupOwner"></select></label>
        <label class="followup-search">Rechercher<input id="actionFollowupSearch" type="search" placeholder="Titre, commentaire…" /></label>
        <label class="followup-archived"><input id="actionFollowupArchived" type="checkbox" /> Inclure les archivées</label>
      </div>
      <p id="actionFollowupStatus" class="followup-status" role="status"></p>
      <div id="actionFollowupBody" class="followup-body" tabindex="0" aria-label="Actions classées par projet"></div>`;
    document.body.append(dialog);

    const $ = name => dialog.querySelector("#actionFollowup" + name);
    const project = $("Project"), owner = $("Owner"), search = $("Search");
    const includeArchived = $("Archived"), body = $("Body"), status = $("Status");
    let entries = [], trigger = null;
    for (const [select, field, all, id] of [
      [project, "Projet", "Tous les projets", "actionFollowupProjectOptions"],
      [owner, "Responsable", "Tous les responsables", "actionFollowupOwnerOptions"],
    ]) {
      ctx.searchableSelect(select, { label: field, listId: id, emptyLabel: all, floating: true });
    }

    function prepare() {
      entries = ctx.actions().map(row => {
        const projects = ctx.projects(row).map(item => [String(item.id), ctx.title("projects", item)]);
        const owners = ctx.owners(row);
        const title = ctx.title("actions", row);
        const comment = ctx.display(row, "Commentaire");
        const state = ctx.display(row, "Statut");
        const due = ctx.date(row) || ctx.display(row, "Echeance");
        return {
          row, title, comment, state, due, archived: ctx.archived(row),
          projects: projects.length ? projects : [[none, "Sans projet"]],
          owners: owners.length ? owners : [[none, "Sans responsable"]],
          text: ctx.normalize([title, ...projects.map(pair => pair[1]), ...owners.map(pair => pair[1]), state, due, comment].join(" ")),
        };
      }).sort((a, b) => collator.compare(a.title, b.title) || a.row.id - b.row.id);
    }

    function compareGroups([idA, labelA], [idB, labelB]) {
      if (idA === none || idB === none) return Number(idA === none) - Number(idB === none);
      return collator.compare(labelA, labelB);
    }

    function populate(select, choices, all) {
      const previous = select.value;
      select.innerHTML = `<option value="">${all}</option>` + [...new Map(choices)].sort(compareGroups)
        .map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("");
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
    }

    function refreshChoices() {
      const active = entries.filter(entry => includeArchived.checked || !entry.archived);
      populate(project, active.flatMap(entry => entry.projects), "Tous les projets");
      populate(owner, active.flatMap(entry => entry.owners), "Tous les responsables");
      render();
    }

    function card(entry) {
      const owners = entry.owners.map(([, label]) => label).join(", ");
      const metadata = [owners, entry.state, entry.due ? "Échéance " + entry.due : "", entry.archived ? "Archivée" : ""].filter(Boolean);
      return `<article class="followup-entry">
        <div class="followup-entry-heading">
          <h4>${esc(entry.title)}</h4>
          <button type="button" class="followup-source" data-followup-action="${entry.row.id}">Ouvrir l’action</button>
        </div>
        <p class="followup-meta">${esc(metadata.join(" · "))}</p>
        ${entry.comment ? `<div class="followup-text">${esc(entry.comment)}</div>` : ""}
      </article>`;
    }

    function render() {
      const query = ctx.normalize(search.value);
      const matching = entries.filter(entry =>
        (includeArchived.checked || !entry.archived) &&
        (!owner.value || entry.owners.some(([id]) => id === owner.value)) &&
        (!project.value || entry.projects.some(([id]) => id === project.value)) &&
        (!query || entry.text.includes(query)),
      );
      const groups = new Map();
      for (const entry of matching) {
        for (const [id, label] of entry.projects) {
          if (project.value && project.value !== id) continue;
          if (!groups.has(id)) groups.set(id, { label, entries: [] });
          groups.get(id).entries.push(entry);
        }
      }
      const count = matching.length;
      status.textContent = `${count} action${count === 1 ? "" : "s"}`;
      body.innerHTML = [...groups].sort(([a, x], [b, y]) => compareGroups([a, x.label], [b, y.label]))
        .map(([id, group]) => `<section class="followup-meeting" data-followup-project="${esc(id)}">
          <h3>${esc(group.label)}</h3>${group.entries.map(card).join("")}
        </section>`).join("") || '<p class="empty">Aucune action pour ces critères.</p>';
      body.scrollTop = 0;
    }

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-action-followup]");
      if (!button || ctx.view() !== "actions") return;
      if (ctx.busy()) {
        ctx.message("Terminez la modification en cours avant d’ouvrir le suivi.");
        return;
      }
      trigger = button;
      search.value = project.value = owner.value = "";
      includeArchived.checked = ctx.showArchived();
      prepare();
      refreshChoices();
      dialog.showModal();
    });
    $("Close").onclick = () => dialog.close();
    dialog.addEventListener("close", () => {
      for (const select of [project, owner])
        select.closest(".reference-picker").dispatchEvent(new Event("pickerclose"));
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      trigger = null;
    });
    project.onchange = owner.onchange = search.oninput = render;
    includeArchived.onchange = refreshChoices;
    body.onclick = event => {
      const button = event.target.closest("[data-followup-action]");
      if (!button) return;
      const id = Number(button.dataset.followupAction);
      if (!ctx.actions().some(action => action.id === id)) return;
      trigger = null;
      dialog.close();
      ctx.openRecord(id);
    };
  };
})();
