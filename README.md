# Applications and Firms Viewer

Browser-based viewer for undergraduate applications and firm-count CSV exports, built with vanilla JavaScript and D3.

The app imports a CSV extract and renders two linked sunburst views:

- Applications
- Firms

It supports both single-school datasets and whole-university datasets, keeps both panes in sync when required, and shows summary stats plus drill-down context for the selected hierarchy.

## Start Here (Users)

Live app: https://drduke.uk/AppsAndFirmsViewer

<details open>
<summary><strong>User Guide</strong></summary>

### What It Does

- Visualizes two related datasets side by side: Total Applications and Total Firms.
- Supports school-level and whole-university CSV extracts.
- Lets you drill down by clicking arcs in either sunburst.

### How To Use It

1. Open the live app link above.
2. Load data by either selecting School demo or University demo from the Demo data dropdown, or by clicking Import CSV.
3. Explore the chart: hover an arc to preview details, click an arc to zoom, and use back controls to move up the hierarchy.
4. Optional controls: toggle Light/Dark mode and use pane sync controls to keep both charts aligned.

### Where To Get The CSV

Use data from the dashboard named "UG Weekly Applications Dashboard 2026-27".

If you cannot access that dashboard, ask me directly. I cannot grant permissions, but I can send you the CSV export.

### Export Steps (Browser Excel)

For school-level data:

1. Open "UG Weekly Applications Dashboard 2026-27" in browser Excel.
2. Use the pivot table filters to select the school you want.
3. Export using File > Export > Download as CSV.
4. Import that CSV into the viewer.

For whole-university data:

1. Open "UG Weekly Applications Dashboard 2026-27" in browser Excel.
2. Clear the school filters in the pivot table.
3. Export using File > Export > Download as CSV.
4. Import that CSV into the viewer.

### CSV Format Expected

The parser expects exported CSVs with two side-by-side tables:

- Application stats in columns A-E
- Firm stats in columns G-K

It ignores dashboard header noise, detects whether data is school-level or university-wide, and converts rows into hierarchical sunburst structures.

</details>

## For Developers

<details>
<summary><strong>Dev Guide</strong></summary>

### Project Structure

- `docs/` contains the browser app and is the single source of truth for deployment.
- `docs/assets/demos/` contains sample CSV datasets used by the demo-data selector.

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
- `docs/index.html`, `docs/styles.css`, and `docs/sunburst.js` are the main UI and behavior entry points.

</details>
