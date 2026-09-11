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

- Visualizes two related datasets side by side:
  - Total Applications
  - Total Firms
- Supports school-level and whole-university CSV extracts.
- Lets you drill down by clicking arcs in either sunburst.

### How To Use It

1. Open the live app link above.
2. Load data:
	- Pick School demo or University demo from the Demo data dropdown, or
	- Click Import CSV to load your own export.
3. Explore:
	- Hover an arc to preview details.
	- Click an arc to zoom into that branch.
	- Use back controls to move up the hierarchy.
4. Optional controls:
	- Toggle Light/Dark mode.
	- Use pane sync controls to keep both charts aligned while navigating.

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
