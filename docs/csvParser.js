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
 * PG filter definitions. Every PG course is tagged with one value per group
 * (see classifyPGCourse) and the UI offers one chip per option.
 */
export const PG_FILTER_GROUPS = [
  {
    key: 'level',
    label: 'Level',
    options: [
      { value: 'doctorate', label: 'Doctorate', title: 'PhD and professional doctorates (EdD, DBA ...)' },
      { value: 'masters', label: 'Masters', title: 'Taught and research masters (MSc, MA, MBA, LLM, MA/MSc by Research ...)' },
      { value: 'other', label: 'Other PG', title: 'PGCE, PgDip, PgCert, CPD modules and exchange students' },
    ],
  },
  {
    key: 'type',
    label: 'Type',
    options: [
      { value: 'PGR', label: 'PGR', title: 'Postgraduate research: doctorates, MA/MSc by Research, research exchange' },
      { value: 'PGT', label: 'PGT', title: 'Postgraduate taught' },
    ],
  },
  {
    key: 'mode',
    label: 'Mode',
    options: [
      { value: 'FT', label: 'FT', title: 'Full time' },
      { value: 'PT', label: 'PT', title: 'Part time' },
    ],
  },
];

/** Selection with every option switched on. */
export function defaultPGSelection() {
  const sel = {};
  PG_FILTER_GROUPS.forEach(g => { sel[g.key] = new Set(g.options.map(o => o.value)); });
  return sel;
}

/**
 * Tag a PG course from its code and name.
 *  - Mode comes from the course code: ...DPF.. / TPF.. / UUF.. = full time,
 *    ...DPP.. = part time (the letter after the DP/TP/UU/DU marker). Falls back
 *    to FT/PT in the course or group name.
 *  - Level and PGR/PGT come from the award named in the course title.
 */
export function classifyPGCourse(code, name, groupName = '') {
  const text = `${name || ''}`;
  const both = `${name || ''} ${groupName || ''}`;

  let mode = 'unknown';
  const m = /^.*(?:DP|TP|UU|DU)([FP])/i.exec(code || '');
  if (m) mode = m[1].toUpperCase() === 'F' ? 'FT' : 'PT';
  else if (/\bPT\b|part[- ]time/i.test(both)) mode = 'PT';
  else if (/\bFT\b|full[- ]time/i.test(both)) mode = 'FT';

  const isDoctorate = /\bPhD\b|\bDoctor\b|\bDoctorate\b|\bEdD\b|\bDBA\b|\bDProf\b|\bDClinPsy\b/i.test(text);
  const isResearchMasters = /\bby Research\b|\bMRes\b|\bMPhil\b/i.test(text);
  const isExchange = /Research Exchange/i.test(text);
  const isMasters = isResearchMasters
    || /\b(MSc|MA|MBA|LLM|MMus|MFA|MEd|MArch|MPA|MPH|MDes|MSW)\b|\bMaster\b/i.test(text);

  const level = isDoctorate ? 'doctorate' : (isMasters ? 'masters' : 'other');
  const type = (isDoctorate || isResearchMasters || isExchange) ? 'PGR' : 'PGT';

  return { level, type, mode };
}

/**
 * Apply a PG filter selection to a parsed model. Returns a model whose panes
 * use a filtered copy of the tree (totals recomputed from the remaining courses).
 * UG models, or a selection with everything switched on, come back unchanged.
 */
export function filterModel(model, selection) {
  if (!model || !model.baseTree || !selection) return model;
  if (!isFilterActive(selection)) return { ...model, filtered: false };

  const passes = (tags) => PG_FILTER_GROUPS.every(g => {
    const chosen = selection[g.key];
    const v = tags?.[g.key];
    if (!v || v === 'unknown') return chosen.size === g.options.length;
    return chosen.has(v);
  });

  const filtered = filterTree(model.baseTree, passes, true);
  let tree;
  if (!filtered.children || filtered.children.length === 0) {
    tree = { ...filtered, children: [], values: emptyValues(model.years) };
  } else {
    recomputeTotals(filtered, model.years);
    tree = displayCopy(filtered, model.displayYears || model.years);
    if (!tree.children) tree.children = [];
  }
  const empty = tree.children.length === 0;

  const summary = [summaryFromTree('Firms', tree, model.current, model.previous)];
  model.summary.slice(1).forEach(item => {
    summary.push({
      ...item,
      label: item.label.replace(/\)$/, ', unfiltered)'),
      title: `${item.title || ''} Filters do not apply to this figure.`.trim(),
    });
  });

  return {
    ...model,
    filtered: true,
    empty,
    panes: model.panes.map(p => ({ ...p, tree })),
    summary,
  };
}

export function isFilterActive(selection) {
  return PG_FILTER_GROUPS.some(g => selection[g.key] && selection[g.key].size < g.options.length);
}

function filterTree(node, passes, isRoot = false) {
  if (!node.children) return passes(node.tags) ? { ...node, values: { ...node.values } } : null;
  const kids = node.children.map(c => filterTree(c, passes)).filter(Boolean);
  if (!isRoot && kids.length === 0) return null;
  return { ...node, values: { ...node.values }, children: kids };
}

/** Copy of a tree with blank-in-all-`years` courses removed (totals left as they were). */
function displayCopy(tree, years) {
  const copy = filterTree(tree, () => true, true);
  pruneAbsent(copy, years);
  return copy;
}

function tagPGTree(node, groupName = '') {
  if (!node.children) {
    node.tags = classifyPGCourse(node.code, node.name, groupName);
    return;
  }
  const isGroup = node.code && isProgrammeGroup(node.code);
  node.children.forEach(c => tagPGTree(c, isGroup ? node.name : groupName));
}

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

  // Full tree (totals match the export's Grand Total for every year), tagged for filtering.
  const fullTree = buildTree(flat, years, 'Firms');
  tagPGTree(fullTree);
  // Display tree: drop courses that are blank in every year the two panes show.
  const displayYears = [current, previous, beforePrevious].filter(Boolean);
  const firms = displayCopy(fullTree, displayYears);

  const meta = { level: 'pg', title: extractTitle(rows, headerIdx), dates: extractDates(rows, headerIdx) };

  const summary = [summaryFromTree('Firms', firms, current, previous)];
  const headlineApps = extractHeadline(rows, headerIdx, 'Apps');
  if (headlineApps && headlineApps[current] != null && headlineApps[previous] != null) {
    summary.push({
      label: 'FT apps (headline)',
      cur: headlineApps[current],
      prev: headlineApps[previous],
      curYear: current,
      prevYear: previous,
      title: 'Applications from the dashboard summary block; the PG export has no course-level application data. The headline figures appear to cover full-time courses only (the headline firms match the FT firms in the course table).',
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
    baseTree: fullTree,
    displayYears,
    filterGroups: PG_FILTER_GROUPS,
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
      code: row.parsed.code,
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
