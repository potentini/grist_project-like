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
