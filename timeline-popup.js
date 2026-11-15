// The embedded timeline shares the host widget connection, never a second Grist subscription.
if (
  new URLSearchParams(location.search).get("projectPopup") === "1" &&
  window.parent !== window
) {
  window.grist = window.parent.projectTimelineBridge();
  document.documentElement.dataset.projectPopup = "true";
  document.body.classList.add("popup-table-collapsed");
  const tableToggle = document.createElement("button");
  tableToggle.id = "popupTableToggle";
  tableToggle.className = "btn btn-small";
  tableToggle.type = "button";
  tableToggle.textContent = "Afficher la table";
  tableToggle.setAttribute("aria-expanded", "false");
  tableToggle.setAttribute("aria-controls", "tableView tableToolbarActions");
  document.getElementById("timelineViewBtn").before(tableToggle);
  document.getElementById("timelineViewBtn").hidden = true;
  tableToggle.onclick = () => {
    const collapsed = document.body.classList.toggle("popup-table-collapsed");
    tableToggle.textContent = collapsed
      ? "Afficher la table"
      : "Masquer la table";
    tableToggle.setAttribute("aria-expanded", String(!collapsed));
    window.dispatchEvent(new Event("resize"));
  };
  const style = document.createElement("style");
  style.textContent =
    "#tableAddLevel1Btn,.table-actions-cell,#toggleMappingPanelBtn,#mappingPanel,.widget-revision,#timelineViewBtn {display:none!important} .popup-table-collapsed #tableView,.popup-table-collapsed #tableToolbarActions,.popup-table-collapsed #paneDivider {display:none!important}";
  document.head.append(style);
}

if(document.documentElement.dataset.projectPopup==='true' && window.parent.document.body.classList.contains('phone-mode')) {
  document.documentElement.dataset.phoneProject='true';
  const compact=document.createElement('style');
  compact.textContent=`
    html[data-phone-project] .header,
    html[data-phone-project] #tableView,
    html[data-phone-project] #paneDivider,
    html[data-phone-project] .legend {display:none!important}
    html[data-phone-project] .timeline-toolbar > :not(#expandAllBtn):not(.timeline-navigation):not(.zoom-controls) {display:none!important}
    html[data-phone-project] .timeline-toolbar {
      padding:3px 5px;gap:5px;flex-wrap:nowrap;flex-shrink:0;
      overflow-x:auto;min-height:34px;scrollbar-width:thin;
    }
    html[data-phone-project] .timeline-toolbar > * {flex-shrink:0;white-space:nowrap}
    html[data-phone-project] .zoom-controls {flex-wrap:nowrap}
    html[data-phone-project] .timeline-toolbar .btn {height:28px;align-items:center;justify-content:center}
    html[data-phone-project] .btn {font-size:11px;padding:3px 5px}
    html[data-phone-project] .task-list, html[data-phone-project] .task-list-header {width:140px;min-width:140px}
    html[data-phone-project] .task-name {font-size:11px}
    html[data-phone-project] .task-meta {font-size:10px}
  `;
  document.head.append(compact);
}
