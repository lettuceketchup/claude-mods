# india-trip-planner

Skill for planning trips within India. The skill itself is in `skills/india-trip-planner`.

`tools/build_basemap.py` builds the India map data embedded in `assets/plan-page.html` (state borders from DataMeet, CC BY 4.0, following the Survey of India boundary; city names from Natural Earth, public domain). Trips never need it. Rerun it only to change the map's detail, then paste its output over the `window.BASEMAP = ...` line in the template.
