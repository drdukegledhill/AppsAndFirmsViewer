# Applications and Firms Viewer

Desktop viewer for undergraduate applications and firm-count CSV exports, built with Tauri, vanilla JavaScript, and D3.

The app imports a CSV extract and renders two linked sunburst views:

- Applications
- Firms

It supports both single-school datasets and whole-university datasets, keeps both panes in sync when required, and shows summary stats plus drill-down context for the selected hierarchy.

## Repo Contents

- `src/` contains the frontend UI, CSV parsing logic, and D3 sunburst rendering.
- `src-tauri/` contains the Tauri desktop shell and Rust configuration.
- `DEMO_School.csv` and `DEMO_University.csv` are sample datasets for local testing.

## Prerequisites

- Node.js 20+ with npm
- Rust toolchain
- Tauri system prerequisites for your platform: https://tauri.app/start/prerequisites/

## Install

```bash
npm install
```

## Run In Development

```bash
npm run tauri dev
```

The application opens as a desktop window. Use the import control in the top bar to load one of the demo CSVs or your own export.

## Build

```bash
npm run tauri build
```

Build artefacts are written under `src-tauri/target/`.

## GitHub Builds

GitHub Actions is configured to build macOS and Windows desktop packages and attach them to a draft GitHub Release.

To publish a new build:

```bash
git tag v0.1.1
git push origin v0.1.1
```

You can also run the workflow manually from the Actions tab and provide a release tag.

The generated binaries are currently unsigned, so macOS Gatekeeper and Windows SmartScreen may show warnings.

## CSV Notes

The parser expects the exported CSV to contain two side-by-side tables:

- application stats in columns A-E
- firm stats in columns G-K

It ignores dashboard header noise, detects whether the data is school-level or university-wide, and converts the rows into hierarchical structures used by the sunburst views.

## Recommended VS Code Extensions

- Tauri
- rust-analyzer
