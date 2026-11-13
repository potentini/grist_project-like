"""Export the shared table/timeline to the original dual-widget checkout or a folder.
Usage: python scripts/export-dual-widget.py /path/to/dev_grist_3_level_dual_widget
Review and commit the resulting files in that repository separately.
"""
import re
import sys
from pathlib import Path

source = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit("Usage: python scripts/export-dual-widget.py TARGET_DIRECTORY")
target = Path(sys.argv[1]).resolve()
if target == source:
    raise SystemExit("Choose a different target directory to preserve the tracking index.html.")
target.mkdir(parents=True, exist_ok=True)
for name in ("widget.js", "hierarchy-sort.js", "form-theme.css"):
    (target / name).write_text((source / name).read_text())
html = (source / "timeline.html").read_text()
html = re.sub(r'^[ \t]*<script src="timeline-popup\.js[^" ]*"></script>\n', "", html, flags=re.MULTILINE)
(target / "index.html").write_text(html)
print("Exported widget.js, hierarchy-sort.js, form-theme.css and standalone index.html to", target)
