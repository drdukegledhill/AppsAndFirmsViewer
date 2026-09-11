// csvParser.js — Parse UG Applications Dashboard CSV into sunburst hierarchies
//
// CSV layout (two side-by-side tables):
//   Cols A-E:  Application Stats   (name, 25/26 apps, %chg, 26/27 apps, %chg)
//   Col  F:    empty separator
//   Cols G-K:  Firm Stats          (name, 25/26 firms, %chg, 26/27 firms, %chg)

/**
 * Parse a raw CSV string into two hierarchical JSON trees.
 * Returns { apps, firms, meta }
 */
export function parseCSV(csvText) {
  const rows = parseCSVRows(csvText);

  const meta = extractMeta(rows);
  const dataStartIdx = findDataStart(rows);
  if (dataStartIdx < 0) throw new Error('Could not locate data rows in CSV');

  // Parse each side independently so we support:
  // 1) School-only CSV extracts (apps + firms aligned)
  // 2) Full university extracts where apps and firms can have different row ranges
  const flatApps = parseSideRows(rows, {
    nameCol: 0,
    val2526Col: 1,
    val2627Col: 3,
    pctCol: 4,
    startIdx: dataStartIdx,
  });

  const flatFirms = parseSideRows(rows, {
    nameCol: 6,
    val2526Col: 7,
    val2627Col: 9,
    pctCol: 10,
    startIdx: dataStartIdx,
  });

  if (flatApps.length === 0) throw new Error('No data rows found in CSV');
  if (flatFirms.length === 0) throw new Error('No firm data rows found in CSV');

  const apps  = buildTree(flatApps, 'apps2526', 'apps2627', 'Applications');
  const firms = buildTree(flatFirms, 'firms2526', 'firms2627', 'Firms');

  const scope = detectScope(apps);
  meta.scope = scope.scope;
  meta.scopeName = scope.name;

  return { apps, firms, meta };
}

// ── Build hierarchy from flat rows ─────────────────────────

function buildTree(flatRows, key2526, key2627, rootLabel) {
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
      [key2526]: school.val2526,
      [key2627]: school.val2627,
      pctChange: school.pctChange,
      children: [],
    };

    const firstSchoolIdx = classified.findIndex(r => r.raw === school.raw);
    startIdx = firstSchoolIdx >= 0 ? firstSchoolIdx + 1 : 0;
  } else {
    const fallbackName = flatRows[0]?.raw || rootLabel;
    root = {
      name: multiSchoolDataset ? `All Schools (${rootLabel})` : fallbackName,
      shortName: multiSchoolDataset ? 'ALL' : abbreviate(fallbackName),
      [key2526]: 0,
      [key2627]: 0,
      pctChange: 0,
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
      [key2526]: row.val2526,
      [key2627]: row.val2627,
      pctChange: row.pctChange,
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

    if (currentGroup) {
      currentGroup.children.push(node);
    } else if (currentSchool) {
      currentSchool.children.push(node);
    } else {
      root.children.push(node);
    }
  }

  recomputeTotals(root, key2526, key2627);
  return root;
}

// ── Helpers ────────────────────────────────────────────────

function parseSideRows(rows, { nameCol, val2526Col, val2627Col, pctCol, startIdx }) {
  const out = [];

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    const rawName = (r[nameCol] || '').trim();
    if (!rawName) continue;
    if (isNoiseRow(rawName)) continue;
    if (/^Grand Total$/i.test(rawName)) break;

    out.push({
      raw: rawName,
      val2526: parseNum(r[val2526Col]),
      val2627: parseNum(r[val2627Col]),
      pctChange: parsePct(r[pctCol]),
    });
  }

  return out;
}

function isNoiseRow(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  return /^(Application Stats|Firm Stats|Deferral Status|Finance Fee Group|Academic Year|Column Labels|25\/26|26\/27)$/i.test(n);
}

function isSchoolRow(raw, parsedCode) {
  const name = (raw || '').trim();
  if (!name) return false;
  if (/^Grand Total$/i.test(name)) return false;
  if (parsedCode) return false;
  if (/^School,?\s*Course/i.test(name)) return false;
  return true;
}

function recomputeTotals(node, key2526, key2627) {
  if (!node.children || node.children.length === 0) {
    return {
      v2526: Number(node[key2526] || 0),
      v2627: Number(node[key2627] || 0),
    };
  }

  let sum2526 = 0;
  let sum2627 = 0;
  for (const child of node.children) {
    const childTotals = recomputeTotals(child, key2526, key2627);
    sum2526 += childTotals.v2526;
    sum2627 += childTotals.v2627;
  }

  node[key2526] = sum2526;
  node[key2627] = sum2627;
  node.pctChange = sum2526 > 0
    ? Math.round((((sum2627 - sum2526) / sum2526) * 100) * 100) / 100
    : (sum2627 > 0 ? 100 : 0);

  return { v2526: sum2526, v2627: sum2627 };
}

function detectScope(appsTree) {
  const rootName = (appsTree?.name || '').trim();
  if (/^All Schools/i.test(rootName)) {
    return { scope: 'university', name: 'All Schools' };
  }

  return {
    scope: 'school',
    name: rootName || 'Unknown School',
  };
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

function extractMeta(rows) {
  const meta = { title: '', date2526: '', date2627: '' };
  if (rows[0]) meta.title = (rows[0][0] || '').trim();
  for (let i = 1; i < Math.min(rows.length, 6); i++) {
    const joined = rows[i].join(',');
    if (/Date\s*2[56]\/2[67]/i.test(joined)) {
      const dateMatch = joined.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (joined.includes('25/26') && dateMatch) meta.date2526 = dateMatch[1];
      if (joined.includes('26/27') && dateMatch) meta.date2627 = dateMatch[1];
    }
  }
  return meta;
}

function findDataStart(rows) {
  for (let i = 0; i < rows.length; i++) {
    const left = (rows[i][0] || '').trim();
    const right = (rows[i][6] || '').trim();
    if (/School,?\s*Course/i.test(left) || /School,?\s*Course/i.test(right)) {
      return i + 1;
    }
  }
  // Fallback
  for (let i = 10; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim();
    const colB = (rows[i][1] || '').trim();
    const colD = (rows[i][3] || '').trim();
    if (name && !name.startsWith(',') && /^\d+$/.test(colB) && /^\d+$/.test(colD)) {
      return i;
    }
  }
  return -1;
}

function parseCodeName(raw) {
  const match = raw.match(/^([A-Z0-9]+(?:UUFHQ\d?)?)\s*-\s*(.+)$/i);
  if (match) return { code: match[1].trim(), name: match[2].trim() };
  return { code: '', name: raw };
}

function isProgrammeGroup(code) {
  if (!code) return false;
  if (/UUFHQ/i.test(code)) return false;
  return /^[A-Z]{1,3}\d{2,5}$/i.test(code);
}

function parseNum(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, '').trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function parsePct(val) {
  if (!val) return 0;
  const s = String(val).trim();
  if (s === '#DIV/0!' || s === '#NULL!' || s === '#N/A' || s === '') return 0;
  const cleaned = s.replace(/[+%]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function abbreviate(name) {
  const words = name.split(/\s+/).filter(w => w.length > 1);
  if (words.length <= 2) return name.slice(0, 6).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
}
