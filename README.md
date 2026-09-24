# Applications and Firms Viewer

Browser-based viewer for undergraduate (UG) and postgraduate (PG) applications and firm-count CSV exports, built with vanilla JavaScript and D3.

The app imports a CSV extract, works out whether it is a UG or PG export, and renders two linked sunburst views:

| Dataset | Left pane | Right pane |
| --- | --- | --- |
| UG | Applications (this year) | Firms (this year) |
| PG | Firms (this year) | Firms (same point last year) |

It supports both single-school datasets and whole-university datasets, keeps both panes in sync when required, and shows summary stats plus drill-down context for the selected hierarchy.

## Start Here (Users)

Live app: https://drduke.uk/AppsAndFirmsViewer

<details open>
<summary><strong>User Guide</strong></summary>

### What It Does

- UG: visualises Total Applications and Total Firms side by side.
- PG: visualises Total Firms this year next to Total Firms at the same point last year. The PG export only has firms at course level, so applications appear as headline totals in the stats bar.
- PG filters: narrow both panes by Level (Doctorate, Masters, Other PG), Type (PGR, PGT) and Mode (FT, PT). See PG Filters below.
- Detects UG or PG automatically; a UG/PG badge next to the scope flag shows which was loaded.
- Supports school-level and whole-university CSV extracts for both.
- Lets you drill down by clicking arcs in either sunburst.

### How To Use It

1. Open the live app link above.
2. Load data by either choosing one of the UG or PG demos from the Demo data dropdown, or by clicking Import CSV.
3. Explore the chart: hover an arc to preview details, click an arc to zoom, and use back controls to move up the hierarchy.
4. Optional controls:
	- Toggle Light/Dark mode.
	- Pane sync is on by default. Use the lock control in the centre panel to turn sync off or back on.
	- Use Reset zoom in the centre panel to return both charts to the root view.
	- Use the Layout mode control in the centre panel to switch between:
	  - Value layout: each chart uses its own geometry based on its own values.
	  - Compare layout: both charts share the same geometry to make like-for-like visual comparison easier.

### Reading The Colours

- Arc size is the value for the year that pane shows.
- Arc colour is the % change against the year before that (red = down, green = up, grey = no change or no earlier data).
- Courses that had nothing in the earlier year show as "New" (full green).
- In PG, a course left blank in the export (not running that year) shows as "Not listed" in the info panel. Courses blank in every year on screen are left out.
- When an export has more than two years (PG), the info panel lists every year for the selected arc.

### PG Filters

The filter chips appear in the top bar when a PG file is loaded. All options start switched on; click a chip to include or exclude it, and use Reset to show everything again. At least one option stays on in each group. Totals, colours, the info panel and the stats bar all follow the filters, and pane titles say "filtered" while any filter is off.

The export has no level, type or mode columns, so each course is tagged from its code and title:

| Filter | How it is worked out |
| --- | --- |
| Mode | The course code: `DPF`, `TPF`, `UUF`, `DUF` = full time; `DPP` = part time (e.g. `S011DPFHQ` FT, `SP600DPPHQ` PT). Distance learning courses follow the same rule. |
| Level | Doctorate: PhD and professional doctorates (EdD, DBA, Doctor of ...). Masters: MSc, MA, MBA, LLM, MMus, Master of ..., and MA/MSc by Research. Other PG: PGCE, PgDip, PgCert, CPD modules and research exchange students. |
| Type | PGR: doctorates, MA/MSc by Research, MRes/MPhil and research exchange. PGT: everything else. |

Hover a course to see its tags in the info panel. The headline applications figure comes from the dashboard summary, cannot be filtered, and appears to cover full-time courses only (the headline firms match the FT firms in the course table).

### Where To Get The CSV

For UG, use the dashboard named "UG Weekly Applications Dashboard 2026-27".

For PG, use the "School & Course Level Firms" sheet of the dashboard named "PG Weekly Applications Dashboard 2026-27".

If you cannot access those dashboards, ask me directly. I cannot grant permissions, but I can send you the CSV export.

### Export Steps (Browser Excel)

The steps are the same for UG and PG; open the matching dashboard.

For school-level data:

1. Open the UG or PG weekly applications dashboard in browser Excel.
2. Use the pivot table filters to select the school you want.
3. Export using File > Export > Download as CSV.
4. Import that CSV into the viewer.

For whole-university data:

1. Open the UG or PG weekly applications dashboard in browser Excel.
2. Clear the school filters in the pivot table.
3. Export using File > Export > Download as CSV.
4. Import that CSV into the viewer.

### CSV Format Expected

UG exports have two side-by-side tables:

- Application stats in columns A-E (previous year, % change, current year, % change)
- Firm stats in columns G-K

PG exports have a single firms table, one column per academic year (for example 23/24 to 26/27 in columns B-E). Blank cells mean the course did not run that year; 0 means it ran with no firms.

The parser finds the "School and Course" header row, reads the academic years from the export rather than assuming them, ignores dashboard header noise, detects whether data is school-level or university-wide, and converts rows into hierarchical sunburst structures. Files saved as UTF-8 or Windows-1252 both work.

</details>

## For Developers

<details>
<summary><strong>Dev Guide</strong></summary>

### Project Structure

- `docs/` contains the browser app and is the single source of truth for deployment.
- `docs/assets/demos/` contains fictional sample CSV datasets used by the demo-data selector (UG and PG, school and university).
- Real dashboard exports dropped in the project root are ignored by git (`/*.csv` in `.gitignore`).

### Prerequisites

- Any static file server (or Python 3)

### Run Locally

```bash
npm start
```

This serves the project at `http://localhost:8080`.

Because the server root is `docs/`, the app opens directly at the root URL.

### Deployment

`docs/` is the deployable static site for GitHub Pages.

Set GitHub Pages to publish from the repository `docs/` directory.

### Notes

- Keep demo CSVs in `docs/assets/demos/`.
- Keep logos in `docs/assets/logos/`.
- `docs/index.html`, `docs/styles.css`, and `docs/sunburst.js` are the main UI and behaviour entry points.
- PG course tagging lives in `classifyPGCourse()` and the filter options in `PG_FILTER_GROUPS` (both in `docs/csvParser.js`); `filterModel()` rebuilds the trees and totals for a selection.
- `docs/csvParser.js` detects the UG or PG layout and returns one model for both: `{ level, years, current, previous, meta, panes: [{ id, title, metric, tree, year, baseYear }], summary }`. Tree nodes hold `values` keyed by academic year, so the renderer never hard-codes years.
- To change what a pane shows, change its `year` / `baseYear` / `tree` in the parser; the renderer follows.

</details>
