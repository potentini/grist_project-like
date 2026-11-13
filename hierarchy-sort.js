/* One sibling comparator shared by tracking, table and timeline. */
window.HierarchySort = (() => {
  const options = [
    ["end", "Date de fin"],
    ["start", "Date de début"],
    ["priority", "Priorité"],
    ["title", "Titre"],
    ["manual", "Ordre manuel"],
  ];
  const normalize = (value) => ({
    projects: options.some(([k]) => k === value?.projects)
      ? value.projects
      : "title",
    children: options.some(([k]) => k === value?.children)
      ? value.children
      : "end",
  });
  const date = (value) => {
    if (value == null || value === "") return null;
    const n =
      typeof value === "number"
        ? value * (Math.abs(value) < 1e11 ? 1000 : 1)
        : Date.parse(value);
    return Number.isFinite(n) ? n : null;
  };
  const priority = (value, choices = []) => {
    if (value == null || value === "") return null;
    if (Number.isFinite(Number(value))) return Number(value);
    const index = choices.indexOf(value);
    return index >= 0 ? index : String(value);
  };
  const compareValue = (a, b) =>
    a == null
      ? b == null
        ? 0
        : 1
      : b == null
        ? -1
        : typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b), "fr", { numeric: true });
  const compare = (a, b, key) =>
    compareValue(a[key], b[key]) ||
    (key === "end" ? compareValue(a.start, b.start) : 0) ||
    compareValue(a.title, b.title) ||
    compareValue(a.id, b.id);
  return {
    options,
    normalize,
    date,
    priority,
    compare,
    key: "hierarchySortV1",
  };
})();
