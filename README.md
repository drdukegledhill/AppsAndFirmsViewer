# Applications and Firms Viewer

Browser-based viewer for undergraduate applications and firm-count CSV exports, built with vanilla JavaScript and D3.

The app imports a CSV extract and renders two linked sunburst views:

- Applications
- Firms

It supports both single-school datasets and whole-university datasets, keeps both panes in sync when required, and shows summary stats plus drill-down context for the selected hierarchy.

## Repo Contents

- `docs/` contains the browser app and is the single source of truth for deployment.
- `docs/assets/demos/` contains sample CSV datasets used by the demo-data selector.

## Prerequisites

- Any static file server (or Python 3)

## Run Locally

```bash
npm start
```

This serves the project at `http://localhost:8080`.

Because the server root is `docs/`, the app opens directly at the root URL.

## Use The App

In the top bar you can:

- Import your own CSV export.
- Pick `School demo` or `University demo` from the `Demo data...` dropdown to auto-load sample datasets.
- Switch between light and dark themes.

## GitHub Pages Deployment

The `docs/` folder is the static site for GitHub Pages.

Point GitHub Pages at the repository `docs/` directory and publish.

## CSV Notes

The parser expects exported CSVs containing two side-by-side tables:

- application stats in columns A-E
- firm stats in columns G-K

It ignores dashboard header noise, detects whether the data is school-level or university-wide, and converts rows into hierarchical structures for the sunburst views.
