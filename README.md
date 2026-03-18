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

## Get The App

You have two ways to use the app:

- Build it locally from this repository.
- Download a packaged build from the GitHub Releases page once a release has been published.

### Release Assets

| File | Platform |
|------|----------|
| `*_aarch64.dmg` | macOS — Apple Silicon (M1/M2/M3) |
| `*_x86_64.dmg` | macOS — Intel |
| `*_aarch64.app.tar.gz` | macOS app bundle (alternative to DMG) |
| `*_x64-setup.exe` | Windows installer |
| `*_x64_en-US.msi` | Windows MSI package |
| `*_amd64.deb` | Linux — Debian/Ubuntu |
| `*_x86_64.rpm` | Linux — Fedora/RHEL |
| `*_amd64.AppImage` | Linux — universal (any distro) |

### macOS Installation Note

The app is unsigned, so macOS Gatekeeper will show a **"damaged and can't be opened"** error after installing from the DMG. This is expected and safe to bypass. After dragging the app to your Applications folder, run the following in Terminal:

```bash
xattr -cr "/Applications/Applications and Firms Viewer.app"
```

Then open the app normally. You only need to do this once.

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

This is the right option if you want to test local changes before publishing a release.

## GitHub Builds

GitHub Actions is configured to build macOS, Linux, and Windows desktop packages and attach them to a draft GitHub Release.

To publish a new build:

```bash
git tag v0.1.1
git push origin v0.1.1
```

You can also run the workflow manually from the Actions tab and provide a release tag.

The generated binaries are currently unsigned. See the macOS Installation Note above for how to bypass the Gatekeeper warning. On Windows, SmartScreen may also show a warning — click "More info" then "Run anyway".

## CSV Notes

The parser expects the exported CSV to contain two side-by-side tables:

- application stats in columns A-E
- firm stats in columns G-K

It ignores dashboard header noise, detects whether the data is school-level or university-wide, and converts the rows into hierarchical structures used by the sunburst views.

## Recommended VS Code Extensions

- Tauri
- rust-analyzer
