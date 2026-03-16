// sunburst.js — Dual UG Applications Sunburst (apps + firms)
import { parseCSV } from './csvParser.js';

const INNER_R   = 80;
const RING_W    = 70;
const MAX_RINGS = 4;

const syncState = {
  locked: false,
  lastActivePane: 'apps',
  syncing: false,
  controllers: {
    apps: null,
    firms: null,
  },
};

const layoutState = {
  mode: 'value',
  latestData: null,
  latestMeta: null,
};

const LOCK_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3"></path><rect x="5" y="10" width="14" height="10" rx="2"></rect><circle cx="12" cy="15" r="1"></circle></svg>`;
const UNLOCK_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10V7a5 5 0 0 0-9.8-1.4"></path><rect x="5" y="10" width="14" height="10" rx="2"></rect><circle cx="12" cy="15" r="1"></circle></svg>`;
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

function updateDataScopeFlag(meta, appsData) {
  const el = document.getElementById('data-scope-flag');
  if (!el) return;

  el.classList.remove('scope-uni', 'scope-school');

  if (!appsData) {
    el.textContent = 'Scope: No dataset loaded';
    el.title = el.textContent;
    return;
  }

  const isUni = meta?.scope === 'university' || /^All Schools/i.test(appsData.name || '');
  const schoolName = meta?.scopeName && meta.scopeName !== 'All Schools'
    ? meta.scopeName
    : (isUni ? 'All Schools' : (appsData.name || 'School dataset'));

  if (isUni) {
    el.classList.add('scope-uni');
    el.textContent = 'Scope: Whole University';
  } else {
    el.classList.add('scope-school');
    el.textContent = `Scope: School — ${schoolName}`;
  }

  el.title = el.textContent;
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

  const targetPaneKey = sourcePaneKey === 'apps' ? 'firms' : 'apps';
  applyTransformToPane(targetPaneKey, transform);
}

function handlePaneFocusChange(sourcePaneKey, pathKey, isUserInteraction) {
  if (isUserInteraction) {
    syncState.lastActivePane = sourcePaneKey;
  }

  if (!syncState.locked || syncState.syncing) return;

  const targetPaneKey = sourcePaneKey === 'apps' ? 'firms' : 'apps';
  applyFocusPathToPane(targetPaneKey, pathKey);
}

function trySnapPanesOnLock() {
  const preferredSource = syncState.controllers[syncState.lastActivePane];
  const fallbackSource = syncState.controllers.apps || syncState.controllers.firms;
  const source = preferredSource || fallbackSource;
  if (!source) return;

  const sourceKey = preferredSource ? syncState.lastActivePane : (syncState.controllers.apps ? 'apps' : 'firms');
  const targetKey = sourceKey === 'apps' ? 'firms' : 'apps';
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
    if (!layoutState.latestData || !layoutState.latestData.firmsData) {
      showToast('Load a CSV first to compare layouts', true);
      return;
    }

    layoutState.mode = layoutState.mode === 'value' ? 'compare' : 'value';
    updateLayoutModeButtonUI();

    const preservedView = {
      apps: {
        focusPath: syncState.controllers.apps?.getFocusPath?.() || null,
        transform: syncState.controllers.apps?.getTransform?.() || null,
      },
      firms: {
        focusPath: syncState.controllers.firms?.getFocusPath?.() || null,
        transform: syncState.controllers.firms?.getTransform?.() || null,
      },
      lastActivePane: syncState.lastActivePane,
    };

    const { appsData, firmsData } = layoutState.latestData;
    document.getElementById('pane-apps').querySelectorAll('svg').forEach(s => s.remove());
    document.getElementById('pane-firms').querySelectorAll('svg').forEach(s => s.remove());
    renderDual(appsData, firmsData, layoutState.latestMeta);

    if (preservedView.lastActivePane) {
      syncState.lastActivePane = preservedView.lastActivePane;
    }

    ['apps', 'firms'].forEach((paneKey) => {
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

    showToast(layoutState.mode === 'compare' ? 'Compare layout enabled' : 'Value layout enabled');
  });

  updateLayoutModeButtonUI();
}

function nodeLabelKey(data) {
  return (data?.shortName || data?.name || '').toString().trim().toLowerCase();
}

function hierarchyPathKey(node) {
  return node.ancestors().reverse().map(a => nodeLabelKey(a.data)).join('›');
}

function buildGeometryMap(treeData, valueKey) {
  if (!treeData) return null;
  const root = d3.hierarchy(treeData)
    .sum(d => d.children ? 0 : Math.max(d[valueKey] || 1, 1))
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

// ── Stats bar ─────────────────────────────────────────────
function updateStatsBar(appsData, firmsData) {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const a27 = appsData.apps2627 || 0, a26 = appsData.apps2526 || 0;
  const aPct = appsData.pctChange || 0;
  const f27 = firmsData.firms2627 || 0, f26 = firmsData.firms2526 || 0;
  const fPct = firmsData.pctChange || 0;

  const fmt = (p) => p >= 0 ? `+${p}%` : `${p}%`;
  const col = (p) => p >= 0 ? '#22c55e' : '#ef4444';

  bar.innerHTML = `
    <span>Apps 26/27: <span class="stat-value">${a27.toLocaleString()}</span></span>
    <span>Apps 25/26: <span class="stat-value">${a26.toLocaleString()}</span></span>
    <span style="color:${col(aPct)};font-weight:600">${fmt(aPct)}</span>
    <span class="stat-divider"></span>
    <span>Firms 26/27: <span class="stat-value">${f27.toLocaleString()}</span></span>
    <span>Firms 25/26: <span class="stat-value">${f26.toLocaleString()}</span></span>
    <span style="color:${col(fPct)};font-weight:600">${fmt(fPct)}</span>
  `;
}

// ── Init ──────────────────────────────────────────────────

async function init() {
  renderEmptyState();
  setupCSVImport();
  setupSyncLockButton();
  setupLayoutModeButton();
}

function renderEmptyState() {
  const appsPane = document.getElementById('pane-apps');
  const firmsPane = document.getElementById('pane-firms');

  [appsPane, firmsPane].forEach((pane, idx) => {
    if (!pane) return;
    pane.querySelectorAll('svg').forEach(s => s.remove());
    pane.querySelectorAll('.no-data-msg').forEach(m => m.remove());

    const msg = document.createElement('div');
    msg.className = 'no-data-msg';
    msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:13px;';
    msg.textContent = idx === 0
      ? 'Import a CSV to view application data'
      : 'Import a CSV to view firm data';
    pane.appendChild(msg);
  });

  const infoPanel = document.getElementById('info-panel');
  if (infoPanel) {
    infoPanel.innerHTML = '<div class="info-empty">Import a CSV to get started</div>';
  }

  const bar = document.getElementById('stats-bar');
  if (bar) {
    bar.innerHTML = '<span style="color:var(--text-dim)">No data loaded — import a CSV to begin</span>';
  }

  updateDataScopeFlag(null, null);
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
      const text = await file.text();
      const { apps, firms, meta } = parseCSV(text);

      // Clear and re-render both
      document.getElementById('pane-apps').querySelectorAll('svg').forEach(s => s.remove());
      document.getElementById('pane-firms').querySelectorAll('svg').forEach(s => s.remove());
      renderDual(apps, firms, meta);
      showToast(`Loaded: ${file.name}`);
    } catch (err) {
      console.error('CSV parse error', err);
      showToast(`Error: ${err.message}`, true);
    }

    fileInput.value = '';
  });
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

// ── Render dual sunbursts ─────────────────────────────────

function renderDual(appsData, firmsData, meta = null) {
  layoutState.latestData = { appsData, firmsData };
  layoutState.latestMeta = meta;

  updateDataScopeFlag(meta, appsData);

  syncState.controllers.apps = null;
  syncState.controllers.firms = null;

  const appsValKey  = appsData.apps2627 != null ? 'apps2627' : 'val2627';
  const appsPrevKey = appsData.apps2526 != null ? 'apps2526' : 'val2526';

  if (!firmsData && layoutState.mode === 'compare') {
    layoutState.mode = 'value';
    updateLayoutModeButtonUI();
  }

  const sharedGeometryMap = (layoutState.mode === 'compare' && firmsData)
    ? buildGeometryMap(appsData, appsValKey)
    : null;

  // Render apps sunburst (always)
  renderSunburst({
    paneKey: 'apps',
    containerId: 'pane-apps',
    breadcrumbId: 'breadcrumb-apps',
    backBtnId: 'back-btn-apps',
    treeData: appsData,
    valueKey: appsValKey,
    prevKey: appsPrevKey,
    label2627: '26/27 Apps',
    label2526: '25/26 Apps',
    geometryMap: sharedGeometryMap,
  });

  if (firmsData) {
    const firmsValKey  = firmsData.firms2627 != null ? 'firms2627' : 'val2627';
    const firmsPrevKey = firmsData.firms2526 != null ? 'firms2526' : 'val2526';

    renderSunburst({
      paneKey: 'firms',
      containerId: 'pane-firms',
      breadcrumbId: 'breadcrumb-firms',
      backBtnId: 'back-btn-firms',
      treeData: firmsData,
      valueKey: firmsValKey,
      prevKey: firmsPrevKey,
      label2627: '26/27 Firms',
      label2526: '25/26 Firms',
      geometryMap: sharedGeometryMap,
    });

    if (syncState.locked) {
      trySnapPanesOnLock();
    }

    updateStatsBar(appsData, firmsData);
  } else {
    // No firms data — show placeholder
    const firmsPane = document.getElementById('pane-firms');
    if (!firmsPane.querySelector('.no-data-msg')) {
      const msg = document.createElement('div');
      msg.className = 'no-data-msg';
      msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:13px;';
      msg.textContent = 'Import a CSV to view firm data';
      firmsPane.appendChild(msg);
    }

    // Stats bar apps-only
    const bar = document.getElementById('stats-bar');
    if (bar) {
      const a27 = appsData[appsValKey] || 0, a26 = appsData[appsPrevKey] || 0;
      const aPct = appsData.pctChange || 0;
      const fmt = (p) => p >= 0 ? `+${p}%` : `${p}%`;
      const col = (p) => p >= 0 ? '#22c55e' : '#ef4444';
      bar.innerHTML = `
        <span>Apps 26/27: <span class="stat-value">${a27.toLocaleString()}</span></span>
        <span>Apps 25/26: <span class="stat-value">${a26.toLocaleString()}</span></span>
        <span style="color:${col(aPct)};font-weight:600">${fmt(aPct)}</span>
        <span class="stat-divider"></span>
        <span style="color:var(--text-dim)">Import CSV for firm data</span>
      `;
    }
  }
}

// ── Generic sunburst renderer ─────────────────────────────

function renderSunburst({ paneKey, containerId, breadcrumbId, backBtnId, treeData, valueKey, prevKey, label2627, label2526, geometryMap }) {
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
    .sum(d => d.children ? 0 : Math.max(d[valueKey] || 1, 1))
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
    n = n.replace(/\s*(BSc|BA|BEng|MEng|MSc|MRes|PhD|BSC)\b\s*(\(Hons\))?/gi, '');
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
    .attr('fill', d => pctColor(d.data.pctChange))
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
    .attr('fill', '#1C1E26')
    .attr('stroke', '#2E3040')
    .attr('stroke-width', 1.5)
    .attr('cursor', 'pointer')
    .on('click', () => zoomTo(focusNode.parent || focusNode, true));

  const centreMonogram = centreGroup.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('font-size', '26px').attr('font-weight', '700')
    .attr('fill', '#fff').attr('opacity', 0.6).attr('y', 0);

  const namePillY = INNER_R - 22;
  const namePill = centreGroup.append('rect')
    .attr('rx', 8).attr('ry', 8)
    .attr('fill', 'rgba(0,0,0,0.55)')
    .attr('height', 18);

  const centreName = centreGroup.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('y', namePillY).attr('font-size', '11px').attr('font-weight', '600').attr('fill', '#E8EAED');

  const backBtn = document.getElementById(backBtnId);
  backBtn.addEventListener('click', () => zoomTo(focusNode.parent || focusNode, true));

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
    updateInfoPanel(p.data);

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
    const pct  = nodeData.pctChange;
    const color = pctColor(pct);
    const pctLabel = pct > 0 ? `+${pct}%` : `${pct}%`;

    const monogram = nodeData.shortName || name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);

    const val27 = nodeData[valueKey] || 0;
    const val26 = nodeData[prevKey] || 0;

    const hasChildren = nodeData.children && nodeData.children.length;
    let childRows = '';
    if (hasChildren) {
      childRows = `<div class="info-section-label">Breakdown</div>
        <ul class="info-centres">${
          nodeData.children.map(c => {
            const cpct = c.pctChange;
            const cLabel = cpct > 0 ? `+${cpct}%` : `${cpct}%`;
            return `<li>
              <span class="info-centre-dot" style="background:${pctColor(cpct)}"></span>
              <span style="flex:1">${c.name}</span>
              <span style="font-weight:600;color:${pctColor(cpct)}">${cLabel}</span>
            </li>`;
          }).join('')
        }</ul>`;
    }

    panel.innerHTML = `
      <div class="info-photo-wrap">
        <div class="info-photo" style="background:${color}22;color:${color}">${monogram}</div>
      </div>
      <div class="info-name">${name}</div>
      <div class="info-dept" style="color:${color}">${pctLabel} year-on-year</div>
      <div class="info-divider"></div>
      <div class="info-row"><span class="info-row-label">${label2627}</span><span style="font-weight:700;font-size:16px">${val27.toLocaleString()}</span></div>
      <div class="info-row"><span class="info-row-label">${label2526}</span><span>${val26.toLocaleString()}</span></div>
      <div class="info-row"><span class="info-row-label">Change</span><span style="color:${color};font-weight:600">${pctLabel}</span></div>
      <div class="info-divider"></div>
      ${childRows}
      ${!hasChildren ? '<div class="info-empty" style="margin-top:8px;font-size:11px;color:var(--text-dim)">Individual course — no further breakdown</div>' : ''}
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

  bc.addEventListener('click', e => {
    const el = e.target.closest('.bc-link');
    if (!el || !bcFocusNode) return;
    const depth = +el.dataset.depth;
    const target = bcFocusNode.ancestors().find(a => a.depth === depth);
    if (target) zoomTo(target, true);
  });

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
    getTransform: () => currentTransform,
    setTransform: (t) => svg.call(zoomBehavior.transform, t),
    getFocusPath: () => hierarchyPathKey(focusNode),
    hasPath: (pathKey) => pathToNode.has(pathKey),
    zoomToPath: (pathKey, isUserInteraction = false) => {
      const target = pathToNode.get(pathKey);
      if (target) zoomTo(target, isUserInteraction, true);
    },
  };
}

init();
