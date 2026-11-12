// The embedded timeline shares the host widget connection, never a second Grist subscription.
if (
  new URLSearchParams(location.search).get("projectPopup") === "1" &&
  window.parent !== window
) {
  window.grist = window.parent.projectTimelineBridge();
  document.documentElement.dataset.projectPopup = "true";
  if (!window.grist.editingAllowed) {
    for (const id of ["tableToggleEditBtn", "toggleDateEditBtn"]) {
      const button = document.getElementById(id);
      if (button) {
        button.disabled = true;
        button.title =
          "Activez le mode Édition dans le widget avant d’ouvrir la timeline.";
      }
    }
  }
  const style = document.createElement("style");
  style.textContent =
    "#tableAddLevel1Btn,.table-actions-cell,#toggleMappingPanelBtn,#mappingPanel,.widget-revision {display:none!important}";
  document.head.append(style);
}
