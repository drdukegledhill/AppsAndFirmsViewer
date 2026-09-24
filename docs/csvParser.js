// csvParser.js: Parse Applications / Firms dashboard CSV exports into sunburst models
//
// Two export layouts are supported and detected automatically:
//
// UG ("UG Weekly Applications Dashboard"):
//   Two side-by-side tables, two academic years each.
//   Cols A-E:  Application Stats   (name, prev apps, %chg, current apps, %chg)
//   Col  F:    empty separator
//   Cols G-K:  Firm Stats          (name, prev firms, %chg, current firms, %chg)
//
// PG ("PG Weekly Applications Dashboard", School & Course Level Firms):
//   One table, firms only, one column per academic year (e.g. 23/24 .. 26/27).
//   Blank cells mean the course did not run that year; 0 means it ran with no firms.
//   Applications are only given as headline totals in the summary block.
//
// Every tree node carries `values: { '<year>': number | null }`, so the renderer
// can size and colour a pane by any pair of years without knowing the layout.

const YEAR_RE = /^\d{2}\/\d{2}$/;

/**
 * Decode raw file bytes. Dashboard exports are sometimes Windows-1252 rather
 * than UTF-8 (non-breaking spaces in course names), so fall back when needed.
 */
export function decodeCSVBytes(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * Parse a raw CSV string into a render model:
 * {
 *   level: 'ug' | 'pg',
 *   years: ['23/24', ...],           // ascending
 *   current, previous,               // latest two years
 *   meta: { title, dates, scope, scopeName },
 *   panes: [{ id, title, metric, tree, year, baseYear }, { ... }],
 *   summary: [{ label, cur, prev, curYear, prevYear, title? }],
 *   notes: [string],
 * }
 */
export function parseCSV(csvText) {
  const text = String(csvText || '')
    .replace(/^﻿/, '')
    .replace(/ /g, ' ');
  const rows = parseCSVRows(text);

  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) {
    throw new Error('Unrecognised CSV: could not find the "School and Course" header row');
  }

  const pgYears = yearColumns(rows[headerIdx], 1);
  const model = pgYears.length >= 2
    ? parsePG(rows, headerIdx, pgYears)
    : parseUG(rows, headerIdx);

  const scope = detectScope(model.panes[0].tree);
  model.meta.scope = scope.scope;
  model.meta.scopeName = scope.name;
  return model;
}

/** Percentage change between two values (null = not present that year). */
export function changeBetween(prev, cur) {
  const p = prev == null ? null : prev;
  const c = cur == null ? null : cur;
  if (p == null && c == null) return { pct: null, isNew: false };
  if (!p) {
    if (c > 0) return { pct: 100, isNew: true };
    return { pct: p == null ? null : 0, isNew: false };
  }
  const pct = Math.round((((c || 0) - p) / p) * 100 * 100) / 100;
  return { pct, isNew: false };
}

// ── UG ─────────────────────────────────────────────────────

function parseUG(rows, headerIdx) {
  // Year labels sit in the row above the header: ",25/26,,26/27,,,,25/26,,26/27"
  const yearRow = rows[headerIdx - 1] || [];
  const appsPrev = cell(yearRow, 1), appsCur = cell(yearRow, 3);
  const previous = YEAR_RE.test(appsPrev) ? appsPrev : '25/26';
  const current = YEAR_RE.test(appsCur) ? appsCur : '26/27';
  const years = [previous, current];

  const colYears = { 1: previous, 3: current };
  const flatApps = parseSideRows(rows, headerIdx + 1, 0, colYears);
  const flatFirms = parseSideRows(rows, headerIdx + 1, 6, { 7: previous, 9: current });

  if (flatApps.length === 0) throw new Error('No application rows found in CSV');
  if (flatFirms.length === 0) throw new Error('No firm rows found in CSV');

  const apps = buildTree(flatApps, years, 'Applications');
  const firms = buildTree(flatFirms, years, 'Firms');

  const meta = { level: 'ug', title: extractTitle(rows, headerIdx), dates: extractDates(rows, headerIdx) };

  return {
    level: 'ug',
    years,
    current,
    previous,
    meta,
    panes: [
      { id: 'left', title: 'Total Applications', metric: 'Apps', tree: apps, year: current, baseYear: previous },
      { id: 'right', title: 'Total Firms', metric: 'Firms', tree: firms, year: current, baseYear: previous },
    ],
    summary: [
      summaryFromTree('Apps', apps, current, previous),
      summaryFromTree('Firms', firms, current, previous),
    ],
    notes: [],
  };
}

// ── PG ─────────────────────────────────────────────────────

function parsePG(rows, headerIdx, yearCols) {
  const colYears = {};
  yearCols.forEach(({ col, year }) => { colYears[col] = year; });
  const years = yearCols.map(y => y.year);
  const current = years[years.length - 1];
  const previous = years[years.length - 2];
  const beforePrevious = years.length >= 3 ? years[years.length - 3] : null;

  const flat = parseSideRows(rows, headerIdx + 1, 0, colYears);
  if (flat.length === 0) throw new Error('No firm rows found in CSV');

  const firms = buildTree(flat, years, 'Firms');
  // Drop courses that are blank in every year the two panes show.
  pruneAbsent(firms, [current, previous, beforePrevious].filter(Boolean));

  const meta = { level: 'pg', title: extractTitle(rows, headerIdx), dates: extractDates(rows, headerIdx) };

  const summary = [summaryFromTree('Firms', firms, current, previous)];
  const headlineApps = extractHeadline(rows, headerIdx, 'Apps');
  if (headlineApps && headlineApps[current] != null && headlineApps[previous] != null) {
    summary.push({
      label: 'Headline apps',
      cur: headlineApps[current],
      prev: headlineApps[previous],
      curYear: current,
      prevYear: previous,
      title: 'Applications from the dashboard summary block. The PG export has no course-level application data.',
    });
  }

  return {
    level: 'pg',
    years,
    current,
    previous,
    meta,
    panes: [
      { id: 'left', title: `Total Firms ${current}`, metric: 'Firms', tree: firms, year: current, baseYear: previous },
      { id: 'right', title: `Total Firms ${previous} (same point last year)`, metric: 'Firms', tree: firms, year: previous, baseYear: beforePrevious },
    ],
    summary,
    notes: ['PG exports contain firms only; the right-hand pane shows the same point last year.'],
  };
}

// ── Build hierarchy from flat rows ─────────────────────────

function buildTree(flatRows, years, rootLabel) {
  const classified = flatRows.map(fr => {
    const parsed = parseCodeName(fr.raw);
    return {
      ...fr,
      parsed,
      isSchool: isSchoolRow(fr.raw, parsed.code),
      isGroup: isProgrammeGroup(parsed.code),
    };
  });

  const schoolRows = classified.filter(r => r.isSchool);
  const singleSchoolDataset = schoolRows.length === 1 && classified.length > 1;
  const multiSchoolDataset = schoolRows.length > 1;

  let root;
  let startIdx = 0;

  if (singleSchoolDataset) {
    const school = schoolRows[0];
    root = {
      name: school.raw,
      shortName: abbreviate(school.raw),
      values: { ...school.values },
      children: [],
    };
    const firstSchoolIdx = classified.findIndex(r => r.raw === school.raw);
    startIdx = firstSchoolIdx >= 0 ? firstSchoolIdx + 1 : 0;
  } else {
    const fallbackName = flatRows[0]?.raw || rootLabel;
    root = {
      name: multiSchoolDataset ? `All Schools (${rootLabel})` : fallbackName,
      shortName: multiSchoolDataset ? 'ALL' : abbreviate(fallbackName),
      values: emptyValues(years),
      children: [],
    };
  }

  let currentSchool = singleSchoolDataset ? root : null;
  let currentGroup = null;

  for (let i = startIdx; i < classified.length; i++) {
    const row = classified[i];
    const node = {
      name: row.parsed.name,
      shortName: row.parsed.code || abbreviate(row.parsed.name),
      fullName: row.raw,
      values: { ...row.values },
    };

    if (row.isSchool) {
      currentSchool = { ...node, children: [] };
      root.children.push(currentSchool);
      currentGroup = null;
      continue;
    }

    if (row.isGroup) {
      const groupNode = { ...node, children: [] };
      if (currentSchool) currentSchool.children.push(groupNode);
      else root.children.push(groupNode);
      currentGroup = groupNode;
      continue;
    }

    if (currentGroup) currentGroup.children.push(node);
    else if (currentSchool) currentSchool.children.push(node);
    else root.children.push(node);
  }

  recomputeTotals(root, years);
  return root;
}

/** Parent values = sum of children (null when every child is blank). */
function recomputeTotals(node, years) {
  if (!node.children || node.children.length === 0) {
    const v = {};
    years.forEach(y => { v[y] = node.values?.[y] ?? null; });
    node.values = v;
    delete node.children;
    return v;
  }

  const sums = emptyValues(years);
  for (const child of node.children) {
    const cv = recomputeTotals(child, years);
    years.forEach(y => {
      if (cv[y] != null) sums[y] = (sums[y] || 0) + cv[y];
    });
  }
  node.values = sums;
  return sums;
}

/** Remove nodes whose values are blank in all of `years`. Returns true if node should be kept. */
function pruneAbsent(node, years) {
  if (node.children) {
    const hadChildren = node.children.length > 0;
    node.children = node.children.filter(c => pruneAbsent(c, years));
    if (hadChildren && node.children.length === 0) {
      delete node.children;
      return false;
    }
    return true;
  }
  return years.some(y => node.values[y] != null);
}

// ── Helpers ────────────────────────────────────────────────

function cell(row, idx) {
  return String((row && row[idx]) || '').trim();
}

function emptyValues(years) {
  const v = {};
  years.forEach(y => { v[y] = null; });
  return v;
}

function findHeaderRow(rows) {
  const re = /^School,?\s*(and\s+)?Course/i;
  for (let i = 0; i < rows.length; i++) {
    if (re.test(cell(rows[i], 0)) || re.test(cell(rows[i], 6))) return i;
  }
  return -1;
}

/** Contiguous academic-year columns in a row, starting at `fromCol`. */
function yearColumns(row, fromCol) {
  const out = [];
  for (let c = fromCol; c < (row || []).length; c++) {
    const v = cell(row, c);
    if (YEAR_RE.test(v)) out.push({ col: c, year: v });
    else if (out.length) break;
  }
  return out;
}

function parseSideRows(rows, startIdx, nameCol, colYears) {
  const out = [];
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    const rawName = cell(r, nameCol).replace(/\s{2,}/g, ' ');
    if (!rawName) continue;
    if (isNoiseRow(rawName)) continue;
    if (/^Grand Total$/i.test(rawName)) break;

    const values = {};
    Object.entries(colYears).forEach(([col, year]) => {
      values[year] = parseNum(r[Number(col)]);
    });
    out.push({ raw: rawName, values });
  }
  return out;
}

function isNoiseRow(name) {
  return /^(Application Stats|Firm Stats|Deferral Status|Finance Fee Group|Academic Year|Column Labels|Total Firms|\d{2}\/\d{2})$/i.test(name);
}

function isSchoolRow(raw, parsedCode) {
  const name = (raw || '').trim();
  if (!name) return false;
  if (/^Grand Total$/i.test(name)) return false;
  if (parsedCode) return false;
  if (/^School,?\s*(and\s+)?Course/i.test(name)) return false;
  return true;
}

function detectScope(tree) {
  const rootName = (tree?.name || '').trim();
  if (/^All Schools/i.test(rootName)) return { scope: 'university', name: 'All Schools' };
  return { scope: 'school', name: rootName || 'Unknown School' };
}

function summaryFromTree(label, tree, current, previous) {
  return {
    label,
    cur: tree.values[current] || 0,
    prev: tree.values[previous] || 0,
    curYear: current,
    prevYear: previous,
  };
}

function extractTitle(rows, headerIdx) {
  for (let i = 0; i < Math.min(headerIdx, rows.length); i++) {
    for (const c of rows[i] || []) {
      const v = String(c || '').trim();
      if (/^Weekly\b/i.test(v)) return v;
    }
  }
  return '';
}

/** Comparison dates, e.g. { '25/26': '23/09/2025', '26/27': '22/09/2026' } */
function extractDates(rows, headerIdx) {
  const dates = {};
  for (let i = 0; i < Math.min(headerIdx, rows.length); i++) {
    const joined = (rows[i] || []).join(',');
    const year = joined.match(/Date\s*(\d{2}\/\d{2})/i) || joined.match(/(\d{2}\/\d{2})\s*Date/i);
    const date = joined.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (year && date) dates[year[1]] = date[1];
  }
  return dates;
}

/** Headline figure from the summary block above the table (PG), keyed by year. */
function extractHeadline(rows, headerIdx, label) {
  let yearMap = null;
  for (let i = 0; i < Math.min(headerIdx, rows.length); i++) {
    const r = rows[i] || [];
    const cols = [];
    r.forEach((c, idx) => { if (YEAR_RE.test(String(c || '').trim())) cols.push({ col: idx, year: String(c).trim() }); });
    if (cols.length >= 2) { yearMap = cols; continue; }

    const labelIdx = r.findIndex(c => String(c || '').trim().toLowerCase() === label.toLowerCase());
    if (labelIdx >= 0 && yearMap) {
      const out = {};
      yearMap.forEach(({ col, year }) => { out[year] = parseNum(r[col]); });
      return out;
    }
  }
  return null;
}

/** Simple CSV row parser that handles quoted fields */
function parseCSVRows(text) {
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(field); field = '';
        rows.push(current); current = [];
        if (ch === '\r') i++;
      } else if (ch === '\r') {
        current.push(field); field = '';
        rows.push(current); current = [];
      } else {
        field += ch;
      }
    }
  }
  if (field || current.length) { current.push(field); rows.push(current); }
  return rows;
}

function parseCodeName(raw) {
  const match = raw.match(/^([A-Z0-9]+)\s*-\s*(.+)$/i);
  if (match) return { code: match[1].trim(), name: match[2].trim() };
  return { code: '', name: raw };
}

/** Programme group codes: SB100, SC300, SP3001, AM3100, XX5008 ... (courses carry UUFHQ/DPFHQ etc.) */
function isProgrammeGroup(code) {
  if (!code) return false;
  return /^[A-Z]{1,3}\d{2,5}$/i.test(code);
}

/** Number, or null for a blank cell. */
function parseNum(val) {
  const s = String(val ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function abbreviate(name) {
  const words = name.split(/\s+/).filter(w => w.length > 1);
  if (words.length <= 2) return name.slice(0, 6).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
}
