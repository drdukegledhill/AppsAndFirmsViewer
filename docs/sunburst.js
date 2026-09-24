// sunburst.js: Dual Applications / Firms sunbursts for UG and PG dashboard exports
//
// The parser returns a model with two panes (left / right). Each pane names the
// tree to draw, the year that sizes the arcs and the base year used for colour.
//   UG: left = Applications, right = Firms (both current year vs previous)
//   PG: left = Firms current year, right = Firms previous year (same point last year)
import { parseCSV, decodeCSVBytes, changeBetween } from './csvParser.js';

const INNER_R   = 80;
const RING_W    = 70;
const MAX_RINGS = 4;

const syncState = {
  locked: true,
  lastActivePane: 'left',
  syncing: false,
  controllers: {
    left: null,
    right: null,
  },
};

const PANE_KEYS = ['left', 'right'];
const otherPane = (key) => (key === 'left' ? 'right' : 'left');

const layoutState = {
  mode: 'value',
  latestModel: null,
};

const THEME_STORAGE_KEY = 'app-theme';
const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
};

const DEMO_DATASETS = {
  school: {
    label: 'UG school demo',
    filename: 'DEMO_School.csv',
    path: 'assets/demos/DEMO_School.csv',
  },
  university: {
    label: 'UG university demo',
    filename: 'DEMO_University.csv',
    path: 'assets/demos/DEMO_University.csv',
  },
  'pg-school': {
    label: 'PG school demo',
    filename: 'DEMO_PG_School.csv',
    path: 'assets/demos/DEMO_PG_School.csv',
  },
  'pg-university': {
    label: 'PG university demo',
    filename: 'DEMO_PG_University.csv',
    path: 'assets/demos/DEMO_PG_University.csv',
  },
};

const LOCK_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3"></path><rect x="5" y="10" width="14" height="10" rx="2"></rect><circle cx="12" cy="15" r="1"></circle></svg>`;
const UNLOCK_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10V7a5 5 0 0 0-9.8-1.4"></path><rect x="5" y="10" width="14" height="10" rx="2"></rect><circle cx="12" cy="15" r="1"></circle></svg>`;
const RESET_VIEW_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4"></path><path d="M3 4v4h4"></path><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"></circle></svg>`;
const LAYOUT_VALUE_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"></path><rect x="5" y="11" width="5" height="8" rx="1"></rect><rect x="10" y="7" width="5" height="12" rx="1"></rect><rect x="15" y="4" width="4" height="15" rx="1"></rect></svg>`;
const LAYOUT_COMPARE_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18"></path><rect x="4" y="5" width="7" height="14" rx="1"></rect><rect x="13" y="9" width="7" height="10" rx="1"></rect></svg>`;

function updateSyncButtonUI() {
  const btn = document.getElementById('sync-lock-btn');
  if (!btn) return;
  btn.classList.toggle('locked', syncState.locked);
  btn.innerHTML = syncState.locked ? LOCK_ICON_SVG : UNLOCK_ICON_SVG;
  btn.title = syncState.locked ? 'Unsync panes' : 'Sync panes';
  btn.setAttribute('aria-label', btn.title);
}

function updateLayoutModeButtonUI() {
  const btn = document.getElementById('layout-mode-btn');
  if (!btn) return;
  const compare = layoutState.mode === 'compare';
  btn.classList.toggle('active', compare);
  btn.innerHTML = compare ? LAYOUT_COMPARE_ICON_SVG : LAYOUT_VALUE_ICON_SVG;
  btn.title = compare
    ? 'Layout: Compare (shared geometry)'
    : 'Layout: Value (independent geometry)';
  btn.setAttribute('aria-label', btn.title);
}

function resolvePreferredTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === THEMES.DARK || stored === THEMES.LIGHT) return stored;

  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? THEMES.DARK : THEMES.LIGHT;
}

function applyTheme(theme) {
  const resolved = theme === THEMES.LIGHT ? THEMES.LIGHT : THEMES.DARK;
  document.documentElement.setAttribute('data-theme', resolved);
  localStorage.setItem(THEME_STORAGE_KEY, resolved);
  updateThemeToggleUI(resolved);
}

function updateThemeToggleUI(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  const icon = document.getElementById('theme-toggle-icon');
  const label = document.getElementById('theme-toggle-label');
  if (!btn || !icon || !label) return;

  const isDark = theme !== THEMES.LIGHT;
  icon.textContent = isDark ? '🌙' : '☀️';
  label.textContent = isDark ? 'Dark' : 'Light';
  btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;

  applyTheme(resolvePreferredTheme());

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || THEMES.DARK;
    applyTheme(current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
  });
}

function setCopyrightYear() {
  const yearEl = document.getElementById('copyright-year');
  if (!yearEl) return;
  yearEl.textContent = String(new Date().getFullYear());
}

function updateDataScopeFlag(model) {
  const el = document.getElementById('data-scope-flag');
  const levelEl = document.getElementById('data-level-flag');
  if (!el) return;

  el.classList.remove('scope-uni', 'scope-school');

  if (levelEl) {
    levelEl.classList.remove('level-ug', 'level-pg');
    levelEl.hidden = !model;
    if (model) {
      levelEl.classList.add(`level-${model.level}`);
      levelEl.textContent = model.level.toUpperCase();
      levelEl.title = model.level === 'pg' ? 'Postgraduate dataset' : 'Undergraduate dataset';
    }
  }

  if (!model) {
    el.textContent = 'Scope: No dataset loaded';
    el.title = el.textContent;
    return;
  }

  const meta = model.meta || {};
  const tree = model.panes[0].tree;
  const isUni = meta.scope === 'university' || /^All Schools/i.test(tree?.name || '');
  const schoolName = meta.scopeName && meta.scopeName !== 'All Schools'
    ? meta.scopeName
    : (isUni ? 'All Schools' : (tree?.name || 'School dataset'));

  if (isUni) {
    el.classList.add('scope-uni');
    el.textContent = 'Scope: Whole University';
  } else {
    el.classList.add('scope-school');
    el.textContent = `Scope: School: ${schoolName}`;
  }

  el.title = el.textContent;
}

function updateHeadings(model) {
  const titles = {
    left: document.getElementById('title-left'),
    right: document.getElementById('title-right'),
  };
  const note = document.getElementById('legend-note');

  if (!model) {
    if (titles.left) titles.left.textContent = 'UG: Applications · PG: Firms this year';
    if (titles.right) titles.right.textContent = 'UG: Firms · PG: Firms last year';
    if (note) note.textContent = 'Size = current year · Colour = change vs previous year';
    return;
  }

  model.panes.forEach(p => {
    if (titles[p.id]) titles[p.id].textContent = p.title;
  });

  if (note) {
    note.textContent = model.level === 'pg'
      ? 'Size = pane year · Colour = change vs year before'
      : `Size = ${model.current} · Colour = change vs ${model.previous}`;
  }
}

function applyTransformToPane(paneKey, transform) {
  const ctrl = syncState.controllers[paneKey];
  if (!ctrl || !transform) return;
  syncState.syncing = true;
  ctrl.setTransform(transform);
  syncState.syncing = false;
}

function applyFocusPathToPane(paneKey, pathKey) {
  const ctrl = syncState.controllers[paneKey];
  if (!ctrl || !pathKey || !ctrl.hasPath(pathKey)) return;
  syncState.syncing = true;
  ctrl.zoomToPath(pathKey, false);
  syncState.syncing = false;
}

function handlePaneTransformChange(sourcePaneKey, transform, isUserInteraction) {
  if (isUserInteraction) {
    syncState.lastActivePane = sourcePaneKey;
  }

  if (!syncState.locked || syncState.syncing) return;

  applyTransformToPane(otherPane(sourcePaneKey), transform);
}

function handlePaneFocusChange(sourcePaneKey, pathKey, isUserInteraction) {
  if (isUserInteraction) {
    syncState.lastActivePane = sourcePaneKey;
  }

  if (!syncState.locked || syncState.syncing) return;

  applyFocusPathToPane(otherPane(sourcePaneKey), pathKey);
}

function trySnapPanesOnLock() {
  const preferredSource = syncState.controllers[syncState.lastActivePane];
  const fallbackSource = syncState.controllers.left || syncState.controllers.right;
  const source = preferredSource || fallbackSource;
  if (!source) return;

  const sourceKey = preferredSource ? syncState.lastActivePane : (syncState.controllers.left ? 'left' : 'right');
  const targetKey = otherPane(sourceKey);
  const t = source.getTransform();
  if (!t) return;

  applyTransformToPane(targetKey, t);

  const sourceFocusPath = source.getFocusPath && source.getFocusPath();
  if (sourceFocusPath) {
    applyFocusPathToPane(targetKey, sourceFocusPath);
  }
}

function setupSyncLockButton() {
  const btn = document.getElementById('sync-lock-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    syncState.locked = !syncState.locked;
    if (syncState.locked) {
      trySnapPanesOnLock();
    }
    updateSyncButtonUI();
  });

  updateSyncButtonUI();
}

function setupLayoutModeButton() {
  const btn = document.getElementById('layout-mode-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!layoutState.latestModel) {
      showToast('Load a CSV first to compare layouts', true);
      return;
    }

    layoutState.mode = layoutState.mode === 'value' ? 'compare' : 'value';
    updateLayoutModeButtonUI();

    const preservedView = { lastActivePane: syncState.lastActivePane };
    PANE_KEYS.forEach((key) => {
      preservedView[key] = {
        focusPath: syncState.controllers[key]?.getFocusPath?.() || null,
        transform: syncState.controllers[key]?.getTransform?.() || null,
      };
    });

    renderModel(layoutState.latestModel);

    if (preservedView.lastActivePane) {
      syncState.lastActivePane = preservedView.lastActivePane;
    }

    PANE_KEYS.forEach((paneKey) => {
      const ctrl = syncState.controllers[paneKey];
      const state = preservedView[paneKey];
      if (!ctrl || !state) return;
      if (state.focusPath && ctrl.hasPath(state.focusPath)) {
        ctrl.zoomToPath(state.focusPath, false);
      }
      if (state.transform) {
        ctrl.setTransform(state.transform);
      }
    });

    if (syncState.locked) {
      trySnapPanesOnLock();
    }
    syncState.controllers[syncState.lastActivePane]?.showInfo();

    showToast(layoutState.mode === 'compare' ? 'Compare layout enabled' : 'Value layout enabled');
  });

  updateLayoutModeButtonUI();
}

function setupResetViewButton() {
  const btn = document.getElementById('reset-view-btn');
  if (!btn) return;

  btn.innerHTML = RESET_VIEW_ICON_SVG;
  btn.setAttribute('aria-label', 'Reset zoom');
  btn.setAttribute('title', 'Reset zoom');

  btn.addEventListener('click', () => {
    const ctrls = PANE_KEYS.map(k => syncState.controllers[k]).filter(Boolean);
    if (ctrls.length === 0) {
      showToast('Load a CSV first', true);
      return;
    }

    syncState.syncing = true;
    ctrls.forEach(ctrl => ctrl.resetView && ctrl.resetView());
    syncState.syncing = false;
    (syncState.controllers[syncState.lastActivePane] || ctrls[0]).showInfo?.();

    showToast('Zoom reset');
  });
}

function nodeLabelKey(data) {
  return (data?.shortName || data?.name || '').toString().trim().toLowerCase();
}

function hierarchyPathKey(node) {
  return node.ancestors().reverse().map(a => nodeLabelKey(a.data)).join('›');
}

function buildGeometryMap(treeData, year) {
  if (!treeData) return null;
  const root = d3.hierarchy(treeData)
    .sum(d => d.children ? 0 : Math.max(d.values?.[year] || 1, 1))
    .sort((a, b) => b.value - a.value);

  d3.partition().size([2 * Math.PI, root.height + 1])(root);

  const map = new Map();
  root.each(d => {
    map.set(hierarchyPathKey(d), {
      x0: d.x0,
      x1: d.x1,
      y0: d.y0,
      y1: d.y1,
    });
  });

  return map;
}

// ── Colour scale ──────────────────────────────────────────
function pctColor(pct) {
  if (pct == null || isNaN(pct)) return '#555';
  const clamped = Math.max(-100, Math.min(100, pct));
  if (clamped < 0) {
    const t = Math.abs(clamped) / 100;
    return d3.interpolateRgb('#5a6172', '#ef4444')(t);
  } else {
    const t = clamped / 100;
    return d3.interpolateRgb('#5a6172', '#22c55e')(t);
  }
}

// ── Change / formatting helpers ───────────────────────
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function describeChange(prev, cur, hasBase = true) {
  if (!hasBase) return { pct: null, label: 'n/a' };
  const { pct, isNew } = changeBetween(prev, cur);
  if (isNew) return { pct: 100, label: 'New' };
  if (pct == null) return { pct: null, label: 'n/a' };
  return { pct, label: pct > 0 ? `+${pct}%` : `${pct}%` };
}

function fmtValue(v) {
  return v == null ? 'Not listed' : Number(v).toLocaleString();
}

// ── Stats bar ─────────────────────────────────────────────
function updateStatsBar(model) {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const parts = model.summary.map(item => {
    const ch = describeChange(item.prev, item.cur);
    const col = ch.pct == null ? 'var(--text-dim)' : (ch.pct >= 0 ? '#22c55e' : '#ef4444');
    const title = item.title ? ` title="${escapeHtml(item.title)}"` : '';
    return `
      <span${title}>${escapeHtml(item.label)} ${item.curYear}: <span class="stat-value">${fmtValue(item.cur)}</span></span>
      <span${title}>${escapeHtml(item.label)} ${item.prevYear}: <span class="stat-value">${fmtValue(item.prev)}</span></span>
      <span${title} style="color:${col};font-weight:600">${ch.label}</span>`;
  });

  const dates = model.meta?.dates || {};
  if (dates[model.current] && dates[model.previous]) {
    parts.push(`<span style="color:var(--text-dim)" title="Comparison dates from the export">As at ${dates[model.current]} vs ${dates[model.previous]}</span>`);
  }

  bar.innerHTML = parts.join('<span class="stat-divider"></span>');
}

// ── Init ──────────────────────────────────────────────────

async function init() {
  setupThemeToggle();
  setCopyrightYear();
  renderEmptyState();
  setupCSVImport();
  setupDemoDataControls();
  setupSyncLockButton();
  setupLayoutModeButton();
  setupResetViewButton();
}

function renderEmptyState() {
  PANE_KEYS.forEach((key) => {
    const pane = document.getElementById(`pane-${key}`);
    if (!pane) return;
    pane.querySelectorAll('svg').forEach(s => s.remove());
    pane.querySelectorAll('.no-data-msg').forEach(m => m.remove());

    const msg = document.createElement('div');
    msg.className = 'no-data-msg';
    msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:13px;';
    msg.textContent = 'Import a UG or PG CSV to view data';
    pane.appendChild(msg);
  });

  const infoPanel = document.getElementById('info-panel');
  if (infoPanel) {
    infoPanel.innerHTML = '<div class="info-empty">Import a CSV to get started</div>';
  }

  const bar = document.getElementById('stats-bar');
  if (bar) {
    bar.innerHTML = '<span style="color:var(--text-dim)">No data loaded. Import a CSV to begin</span>';
  }

  layoutState.latestModel = null;
  updateDataScopeFlag(null);
  updateHeadings(null);
}

function setupCSVImport() {
  const importBtn = document.getElementById('import-csv-btn');
  const fileInput = document.getElementById('csv-file-input');
  if (!importBtn || !fileInput) return;

  importBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = decodeCSVBytes(await file.arrayBuffer());
      loadCSVText(text, file.name);
    } catch (err) {
      console.error('CSV parse error', err);
      showToast(`Error: ${err.message}`, true);
    }

    fileInput.value = '';
  });
}

function setupDemoDataControls() {
  const select = document.getElementById('demo-data-select');
  if (!select) return;

  const loadSelectedDemo = async () => {
    const selected = DEMO_DATASETS[select.value];
    if (!selected) {
      return;
    }
    await loadCSVFromPath(selected.path, selected.filename);
  };

  select.addEventListener('change', loadSelectedDemo);
}

async function loadCSVFromPath(path, label) {
  const candidates = [];
  const addCandidate = (candidatePath) => {
    if (!candidatePath) return;
    const href = new URL(candidatePath, window.location.href).toString();
    if (!candidates.includes(href)) candidates.push(href);
  };

  addCandidate(path);
  addCandidate(`./${path}`);
  addCandidate(label);
  addCandidate(`./${label}`);
  addCandidate(`../${label}`);

  const failed = [];

  try {
    for (const url of candidates) {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const text = decodeCSVBytes(await response.arrayBuffer());
        loadCSVText(text, label);
        return;
      }
      failed.push(`${response.status} ${url}`);
    }
    throw new Error(`Could not load ${label}`);
  } catch (err) {
    console.error('Demo CSV load error', err);
    const details = failed.length ? ` (${failed.join(' | ')})` : '';
    showToast(`Error: ${err.message}${details}`, true);
  }
}

function loadCSVText(text, sourceLabel) {
  const model = parseCSV(text);
  renderModel(model);
  showToast(`Loaded ${model.level.toUpperCase()} data: ${sourceLabel}`);
}

function showToast(msg, isError = false) {
  let toast = document.getElementById('import-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'import-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? '#ef4444' : '#22c55e';
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ── Render both panes from a parsed model ─────────────────

function renderModel(model) {
  layoutState.latestModel = model;

  updateDataScopeFlag(model);
  updateHeadings(model);

  PANE_KEYS.forEach((key) => {
    syncState.controllers[key] = null;
    const pane = document.getElementById(`pane-${key}`);
    pane.querySelectorAll('svg').forEach(s => s.remove());
    pane.querySelectorAll('.no-data-msg').forEach(m => m.remove());
  });

  // Compare layout: both panes use the left pane's geometry.
  const leftPane = model.panes[0];
  const sharedGeometryMap = layoutState.mode === 'compare'
    ? buildGeometryMap(leftPane.tree, leftPane.year)
    : null;

  model.panes.forEach(pane => renderSunburst({ pane, model, geometryMap: sharedGeometryMap }));

  if (syncState.locked) {
    trySnapPanesOnLock();
  }

  // Info panel starts on the left (primary) pane.
  syncState.controllers.left?.showInfo();
  updateStatsBar(model);
}

// ── Generic sunburst renderer ─────────────────────────────

function renderSunburst({ pane, model, geometryMap }) {
  const paneKey = pane.id;
  const containerId = `pane-${paneKey}`;
  const breadcrumbId = `breadcrumb-${paneKey}`;
  const backBtnId = `back-btn-${paneKey}`;
  const treeData = pane.tree;
  const year = pane.year;
  const baseYear = pane.baseYear;
  const valueOf = (data) => data?.values?.[year];
  const changeOf = (data) => describeChange(data?.values?.[baseYear], data?.values?.[year], !!baseYear);

  const container = document.getElementById(containerId);

  // Remove old placeholder message
  const oldMsg = container.querySelector('.no-data-msg');
  if (oldMsg) oldMsg.remove();

  const svg = d3.select(`#${containerId}`)
    .append('svg');

  const defs = svg.append('defs');
  defs.append('clipPath').attr('id', `centre-clip-${containerId}`)
    .append('circle').attr('r', INNER_R - 3);

  const mainGroup = svg.append('g').attr('class', 'main-group');

  let currentTransform = null;

  const zoomBehavior = d3.zoom().scaleExtent([0.3, 10])
    .on('zoom', e => {
      currentTransform = e.transform;
      mainGroup.attr('transform', e.transform);
      handlePaneTransformChange(paneKey, e.transform, !!e.sourceEvent);
    });
  svg.call(zoomBehavior);

  requestAnimationFrame(() => {
    const W = svg.node().clientWidth;
    const H = svg.node().clientHeight;
    svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(W / 2, H / 2));
  });

  // ── Hierarchy & layout ───────────────────────────────
  const root = d3.hierarchy(treeData)
    .sum(d => d.children ? 0 : Math.max(valueOf(d) || 1, 1))
    .sort((a, b) => b.value - a.value);

  d3.partition().size([2 * Math.PI, root.height + 1])(root);

  if (geometryMap) {
    root.each(d => {
      const mapped = geometryMap.get(hierarchyPathKey(d));
      if (mapped) {
        d.x0 = mapped.x0;
        d.x1 = mapped.x1;
        d.y0 = mapped.y0;
        d.y1 = mapped.y1;
      }
      d.current = { ...d };
    });
  } else {
    root.each(d => { d.current = { ...d }; });
  }

  const pathToNode = new Map();
  root.each(d => pathToNode.set(hierarchyPathKey(d), d));

  function shortLabel(d) {
    let n = d.name || d.shortName || '';
    n = n.replace(/\s*(MEng|BEng|BSc|BA|MSc|MRes|PhD)\s*\/\s*(MEng|BEng|BSc|BA|MSc|BSC)\s*(\(Hons\))?\s*/gi, ' ');
    n = n.replace(/\s*(BSc|BA|BEng|MEng|MSc|MRes|PhD|BSC|MA|MBA|LLM|MPhil|MMus|PGCE|PGDip|PGCert|EdD|DProf)\b\s*(\(Hons\))?/gi, '');
    n = n.replace(/\(Hons?\)/gi, '');
    n = n.replace(/\s*(SW\/FT|FT)\b/g, '');
    n = n.replace(/\s*Programmes?\b/gi, '');
    n = n.replace(/\s*Pathways?\s*\d*/gi, '');
    n = n.replace(/^\s*\/\s*/, '');
    n = n.replace(/\s*\/\s*$/, '');
    n = n.replace(/\s{2,}/g, ' ').trim();
    return n;
  }

  function depthR(y) {
    return y <= 1 ? INNER_R * y : INNER_R + (y - 1) * RING_W;
  }

  const arc = d3.arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.003))
    .padRadius(INNER_R + RING_W)
    .innerRadius(d => depthR(d.y0))
    .outerRadius(d => Math.max(depthR(d.y0), depthR(d.y1) - 2));

  function arcVisible(d) {
    return d.y1 <= MAX_RINGS + 1 && d.y0 >= 1 && d.x1 > d.x0;
  }

  const CHAR_W = 4.2;
  const LABEL_PAD = 8;

  function labelFits(d) {
    const angle = d.x1 - d.x0;
    const r = depthR((d.y0 + d.y1) / 2);
    return angle * r > 14;
  }

  function maxLabelChars(d) {
    const radialPx = depthR(d.y1) - depthR(d.y0) - LABEL_PAD * 2;
    return Math.max(0, Math.floor(radialPx / CHAR_W));
  }

  function fittedLabel(d, coords) {
    const full = shortLabel(d.data);
    const max = maxLabelChars(coords);
    if (max < 3) return '';
    if (full.length <= max) return full;
    return full.slice(0, max - 1) + '…';
  }

  function ringOpacity(d) {
    return d.children ? 0.82 : 0.65;
  }

  // ── Arcs ─────────────────────────────────────────────
  const arcGroup = mainGroup.append('g');

  const paths = arcGroup.selectAll('path')
    .data(root.descendants().filter(d => d.depth > 0))
    .join('path')
    .attr('class', 'arc-path')
    .attr('fill', d => pctColor(changeOf(d.data).pct))
    .attr('fill-opacity', d => arcVisible(d.current) ? ringOpacity(d) : 0)
    .attr('d', d => arc(d.current))
    .on('mouseover', (e, d) => { showCentreInfo(d.data); updateInfoPanel(d.data); })
    .on('mouseout',  ()     => { showCentreInfo(focusNode.data); updateInfoPanel(focusNode.data); })
    .on('click',     (e, d) => { e.stopPropagation(); zoomTo(d, true); });

  // ── Labels ───────────────────────────────────────────
  const labels = arcGroup.selectAll('text')
    .data(root.descendants().filter(d => d.depth > 0))
    .join('text')
    .attr('class', 'arc-label')
    .attr('fill-opacity', d => arcVisible(d.current) && labelFits(d.current) ? 1 : 0)
    .attr('transform', d => labelTransform(d.current))
    .text(d => fittedLabel(d, d.current));

  // ── Centre circle ────────────────────────────────────
  const centreGroup = mainGroup.append('g').attr('class', 'centre-group');

  centreGroup.append('circle')
    .attr('r', INNER_R)
    .style('fill', 'var(--centre-fill)')
    .style('stroke', 'var(--centre-stroke)')
    .attr('stroke-width', 1.5)
    .attr('cursor', 'pointer')
    .on('click', () => zoomTo(focusNode.parent || focusNode, true));

  const centreMonogram = centreGroup.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('font-size', '26px').attr('font-weight', '700')
    .style('fill', 'var(--centre-text)').attr('opacity', 0.6).attr('y', 0);

  const namePillY = INNER_R - 22;
  const namePill = centreGroup.append('rect')
    .attr('rx', 8).attr('ry', 8)
    .style('fill', 'var(--centre-pill-bg)')
    .attr('height', 18);

  const centreName = centreGroup.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('y', namePillY).attr('font-size', '11px').attr('font-weight', '600').style('fill', 'var(--centre-text)');

  const backBtn = document.getElementById(backBtnId);
  // Assign (not add) handlers so re-renders don't stack listeners from old charts.
  backBtn.onclick = () => zoomTo(focusNode.parent || focusNode, true);

  // ── Zoom ─────────────────────────────────────────────
  let focusNode = root;

  function zoomTo(p, isUserInteraction = false, skipSync = false) {
    if (!p) return;
    focusNode = p;

    root.each(d => {
      d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth),
      };
    });

    const t = svg.transition().duration(600).ease(d3.easeCubicInOut);

    paths.transition(t)
      .tween('data', d => {
        const i = d3.interpolate(d.current, d.target);
        return t => { d.current = i(t); };
      })
      .filter(function(d) {
        return +this.getAttribute('fill-opacity') || arcVisible(d.target);
      })
      .attr('fill-opacity', d => arcVisible(d.target) ? ringOpacity(d) : 0)
      .attrTween('d', d => () => arc(d.current));

    labels
      .filter(function(d) {
        return +this.getAttribute('fill-opacity') || arcVisible(d.target);
      })
      .text(d => fittedLabel(d, d.target))
      .transition(t)
      .attr('fill-opacity', d => arcVisible(d.target) && labelFits(d.target) ? 1 : 0)
      .attrTween('transform', d => () => labelTransform(d.current));

    backBtn.classList.toggle('visible', p.depth > 0);
    updateBreadcrumb(p);
    showCentreInfo(p.data);
    // A pane following its partner via sync must not overwrite the partner's info panel.
    if (!syncState.syncing) updateInfoPanel(p.data);

    if (!skipSync) {
      handlePaneFocusChange(paneKey, hierarchyPathKey(p), isUserInteraction);
    }
  }

  function labelTransform(d) {
    const angle = (d.x0 + d.x1) / 2;
    const r     = depthR((d.y0 + d.y1) / 2);
    const deg   = angle * 180 / Math.PI - 90;
    const flip  = angle >= Math.PI ? 180 : 0;
    return `rotate(${deg}) translate(${r},0) rotate(${flip})`;
  }

  // ── Info panel ────────────────────────────────────────

  function updateInfoPanel(nodeData) {
    const panel = document.getElementById('info-panel');
    if (!panel) return;

    const name = nodeData.name || nodeData.shortName || '';
    const ch = changeOf(nodeData);
    const color = pctColor(ch.pct);
    const vsLabel = baseYear ? `${ch.label} vs ${baseYear}` : 'No earlier year in this export';

    const monogram = nodeData.shortName || name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);

    const hasChildren = nodeData.children && nodeData.children.length;
    let childRows = '';
    if (hasChildren) {
      childRows = `<div class="info-section-label">Breakdown</div>
        <ul class="info-centres">${
          nodeData.children.map(c => {
            const cch = changeOf(c);
            return `<li>
              <span class="info-centre-dot" style="background:${pctColor(cch.pct)}"></span>
              <span style="flex:1">${escapeHtml(c.name)}</span>
              <span style="font-weight:600;color:${pctColor(cch.pct)}">${cch.label}</span>
            </li>`;
          }).join('')
        }</ul>`;
    }

    let historyRows = '';
    if (model.years.length > 2) {
      historyRows = `<div class="info-section-label">${escapeHtml(pane.metric)} by year</div>
        ${model.years.map(y => `<div class="info-row"><span class="info-row-label">${y}${y === year ? ' (this pane)' : ''}</span><span${y === year ? ' style="font-weight:700"' : ''}>${fmtValue(nodeData.values?.[y])}</span></div>`).join('')}
        <div class="info-divider"></div>`;
    }

    panel.innerHTML = `
      <div class="info-photo-wrap">
        <div class="info-photo" style="background:${color}22;color:${color}">${escapeHtml(monogram)}</div>
      </div>
      <div class="info-name">${escapeHtml(name)}</div>
      <div class="info-dept" style="color:${color}">${vsLabel}</div>
      <div class="info-divider"></div>
      <div class="info-row"><span class="info-row-label">${year} ${escapeHtml(pane.metric)}</span><span style="font-weight:700;font-size:16px">${fmtValue(valueOf(nodeData))}</span></div>
      ${baseYear ? `<div class="info-row"><span class="info-row-label">${baseYear} ${escapeHtml(pane.metric)}</span><span>${fmtValue(nodeData.values?.[baseYear])}</span></div>` : ''}
      <div class="info-row"><span class="info-row-label">Change</span><span style="color:${color};font-weight:600">${ch.label}</span></div>
      <div class="info-divider"></div>
      ${historyRows}
      ${childRows}
      ${!hasChildren ? '<div class="info-empty" style="margin-top:8px;font-size:11px;color:var(--text-dim)">Individual course: no further breakdown</div>' : ''}
    `;
  }

  // ── Centre info ───────────────────────────────────────

  function showCentreInfo(nodeData) {
    const label = nodeData.shortName || nodeData.name;
    centreName.text(label);
    const pillW = Math.min(label.length * 6.5 + 20, (INNER_R - 4) * 2);
    namePill.attr('width', pillW).attr('x', -pillW / 2).attr('y', namePillY - 10);

    const monogram = nodeData.shortName || (nodeData.name || '')
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
    centreMonogram.text(monogram).attr('opacity', 0.5);
  }

  // ── Breadcrumb ────────────────────────────────────────

  const bc = document.getElementById(breadcrumbId);
  let bcFocusNode = null;

  bc.onclick = e => {
    const el = e.target.closest('.bc-link');
    if (!el || !bcFocusNode) return;
    const depth = +el.dataset.depth;
    const target = bcFocusNode.ancestors().find(a => a.depth === depth);
    if (target) zoomTo(target, true);
  };

  function updateBreadcrumb(p) {
    bcFocusNode = p;
    const ancestors = p.ancestors().reverse();
    bc.innerHTML = ancestors
      .map((d, i) => {
        const label  = d.data.shortName || d.data.name;
        const isLast = i === ancestors.length - 1;
        return isLast
          ? `<span>${label}</span>`
          : `<span class="bc-link" data-depth="${d.depth}">${label}</span><span class="sep">›</span>`;
      })
      .join('');
  }

  // ── Kick off ──────────────────────────────────────────
  showCentreInfo(root.data);
  updateInfoPanel(root.data);
  updateBreadcrumb(root);
  zoomTo(root, false, true);

  syncState.controllers[paneKey] = {
    showInfo: () => updateInfoPanel(focusNode.data),
    getTransform: () => currentTransform,
    setTransform: (t) => svg.call(zoomBehavior.transform, t),
    getFocusPath: () => hierarchyPathKey(focusNode),
    hasPath: (pathKey) => pathToNode.has(pathKey),
    resetView: () => {
      zoomTo(root, false, true);
      const W = svg.node().clientWidth;
      const H = svg.node().clientHeight;
      svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(W / 2, H / 2));
    },
    zoomToPath: (pathKey, isUserInteraction = false) => {
      const target = pathToNode.get(pathKey);
      if (target) zoomTo(target, isUserInteraction, true);
    },
  };
}

init();
