// ——— Zahlen-Parsing (DE/EN robust) ———
const LOCALE_SEPARATORS = ['de-DE', 'en-US'].map(locale => {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {
    group: parts.find(p => p.type === 'group').value,
    decimal: parts.find(p => p.type === 'decimal').value,
  };
});
function parseNumberSmart(input) {
  if (typeof input !== 'string') return Number(input);
  const s = input.trim();
  if (!s) return NaN;
  for (const { group, decimal } of LOCALE_SEPARATORS) {
    const normalized = s.split(group).join('').replace(decimal, '.').replace(/\s/g, '');
    const n = Number(normalized);
    if (!Number.isNaN(n)) return n;
  }
  return Number(s.replace(/\s/g, '').replace(',', '.'));
}
const fmtDE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const fmtISKnum = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
function fmtISK(v) { return fmtISKnum.format(v) + ' ISK'; }
function fmtPct(v) { return (v*100).toFixed(1).replace('.', ',') + '%'; }

// Preis-Cache
const priceByLabel = new Map(); // label -> { buyMax, sellMin, source: 'fuzzwork'|'evemarketer' }
const typeIdCache = new Map();  // label -> typeId|null

// DOM-Referenzen cachen
const dom = {
  raw: document.getElementById('raw'),
  rate: document.getElementById('rate'),
  modules: document.getElementById('modules'),
  chars: document.getElementById('chars'),
  sumVol: document.getElementById('sumVol'),
  effRate: document.getElementById('effRate'),
  duration: document.getElementById('duration'),
  valuesList: document.getElementById('valuesList'),
  etaCell: document.getElementById('etaCell'),
  groupTotalCount: document.getElementById('groupTotalCount'),
  groupTotalSum: document.getElementById('groupTotalSum'),
  groupByValueBody: document.querySelector('#groupByValueTable tbody'),
};


// ——— Theme (Light/Dark) ———
const THEME_KEY = 'm3calc/v1/theme';
function updateThemeToggleUI(theme) {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.textContent = theme === 'dark' ? '☀️ Hell' : '🌙 Dunkel';
  btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false'); // warum: Screenreader-Status
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeToggleUI(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* noop */ }
}
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (_) { /* noop */ }
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

// ——— Persistenz (localStorage) ———
const STORAGE_KEY = 'm3calc/v1/state';
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null; // Wichtig: App funktioniert auch ohne Storage
  }
}
function saveState() {
  try {
    const state = {
      raw: dom.raw.value,
      rate: dom.rate.value,
      modules: dom.modules.value,
      chars: dom.chars.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) { /* absichtlich leer */ }
}
function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* noop */ }
}

// ——— URL-Share (Query ?state= oder Hash #state=) ———
function getAppState() {
  return {
    raw: dom.raw.value,
    rate: dom.rate.value,
    modules: dom.modules.value,
    chars: dom.chars.value,
  };
}
function applyAppState(state) {
  if (!state || typeof state !== 'object') return;
  if (typeof state.raw === 'string') dom.raw.value = state.raw;
  if (typeof state.rate === 'string') dom.rate.value = state.rate;
  if (typeof state.modules === 'string') dom.modules.value = state.modules;
  if (typeof state.chars === 'string') dom.chars.value = state.chars;
}
function b64urlEncode(str) {
  // UTF‑8 → Base64URL
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}
function b64urlDecode(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeStateForURL(obj) {
  return b64urlEncode(JSON.stringify(obj));
}
function decodeStateFromURLToken(token) {
  try {
    return JSON.parse(b64urlDecode(token));
  } catch (_) { return null; }
}
function readStateFromURL() {
  try {
    const url = new URL(location.href);
    const q = url.searchParams.get('state');
    if (q) return decodeStateFromURLToken(q);
    if (location.hash && location.hash.startsWith('#state=')) {
      return decodeStateFromURLToken(location.hash.slice(7));
    }
  } catch (_) { /* noop */ }
  return null;
}
function buildShareURL(mode = 'hash') {
  const state = getAppState();
  const token = encodeStateForURL(state);
  const base = location.origin + location.pathname;
  if (mode === 'query') return `${base}?state=${token}`;
  return `${base}#state=${token}`;
}
async function copyShareURL(mode = 'hash') {
  const url = buildShareURL(mode);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (_) {
    // Fallback: Auswahl erzwingen
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); return true; } catch (_) { return false; }
    finally { document.body.removeChild(ta); }
  }
}

// Auto-Update der URL mit aktuellem Zustand (#state=)
function replaceURLWithCurrentState(mode = 'hash') {
  const url = buildShareURL(mode);
  try { history.replaceState(null, '', url); }
  catch (_) {
    // Fallback: nur Hash setzen
    if (mode === 'hash') {
      const token = url.split('#state=')[1] || '';
      location.hash = token ? ('#state=' + token) : '';
    }
  }
}
const scheduleReplaceURL = (() => {
  let t = null;
  return function () {
    if (t) clearTimeout(t);
    t = setTimeout(() => replaceURLWithCurrentState('hash'), 150);
  };
})();

// ——— Extraktion nur der Werte direkt vor "m3" ———
const VALUE_BEFORE_M3 = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)(?=\s*m3\b)/gim;

function extractM3Values(text) {
  return Array.from(text.matchAll(VALUE_BEFORE_M3), m => parseNumberSmart(m[1])).filter(Number.isFinite);
}

// ——— Gruppierung 1: nach Label (erste Spalte der Zeile) ———
function groupByLabel(text) {
  const lines = text.split(/\r?\n/);
  const map = new Map(); // label -> { sum, count }
  for (const line of lines) {
    if (!line.trim()) continue;
    const label = (line.split('\t')[0] || '').trim() || '—';
    let lineSum = 0, lineCount = 0;
    for (const m of line.matchAll(VALUE_BEFORE_M3)) {
      const num = parseNumberSmart(m[1]);
      if (Number.isFinite(num)) { lineSum += num; lineCount += 1; }
    }
    if (lineCount > 0) {
      const prev = map.get(label) || { sum: 0, count: 0 };
      prev.sum += lineSum;
      prev.count += lineCount;
      map.set(label, prev);
    }
  }
  return Array.from(map, ([label, v]) => ({ label, sum: v.sum, count: v.count }))
              .sort((a, b) => b.sum - a.sum);
}

// ——— Gruppierung 2: nach identischem m³-Wert ———
function groupByValue(values) {
  const map = new Map(); // value -> { count, total }
  for (const v of values) {
    const prev = map.get(v) || { count: 0, total: 0 };
    prev.count += 1;
    prev.total += v;
    map.set(v, prev);
  }
  return Array.from(map, ([value, v]) => ({ value, count: v.count, total: v.total }))
              .sort((a, b) => b.total - a.total || b.count - a.count || b.value - a.value);
}

// ——— Sortierung für Gruppierung nach Label ———
let groupSort = { key: 'sum', dir: 'desc' };
let lastRowsLabel = [];

function sortRowsLabel(rows) {
  const { key, dir } = groupSort;
  const mul = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (key === 'label') {
      return mul * a.label.localeCompare(b.label, 'de', { numeric: true, sensitivity: 'base' });
    }
    if (a[key] === b[key]) {
      return mul * a.label.localeCompare(b.label, 'de', { numeric: true, sensitivity: 'base' });
    }
    return (a[key] < b[key] ? -1 : 1) * mul;
  });
}

function updateSortIndicators() {
  const ths = document.querySelectorAll('#groupByLabelTable thead th.sortable');
  ths.forEach(th => {
    th.classList.remove('sorted');
    const ind = th.querySelector('.sort-ind');
    if (ind) ind.textContent = '';
    if (th.dataset.key === groupSort.key) {
      th.classList.add('sorted');
      if (ind) ind.textContent = groupSort.dir === 'asc' ? '▲' : '▼';
    }
  });
}

function rerenderGroupTable() {
  const tbody = document.querySelector('#groupByLabelTable tbody');
  if (!tbody) return;
  const sorted = sortRowsLabel(lastRowsLabel || []);
  renderTableRows(tbody, sorted, 'label');
  updateSortIndicators();
}

function attachSortHandlers() {
  const ths = document.querySelectorAll('#groupByLabelTable thead th.sortable');
  ths.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!key) return;
      if (groupSort.key === key) {
        groupSort.dir = groupSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        groupSort.key = key;
        groupSort.dir = key === 'label' ? 'asc' : 'desc';
      }
      rerenderGroupTable();
    });
  });
}

// ——— Marktpreise: TypeID-Resolution & Preis-Fetch ———
const JITA_STATION = 60003760; // Jita IV - Moon 4 - Caldari Navy Assembly Plant
const JITA_SYSTEM = 30000142;  // Jita System (Fallback für EVEMarketer)

async function resolveTypeId(label) {
  if (typeIdCache.has(label)) return typeIdCache.get(label);
  // 1) ESI search first (inventory_type)
  const esiUrl = `https://esi.evetech.net/latest/search/?categories=inventory_type&language=en&search=${encodeURIComponent(label)}&strict=true`;
  try {
    const res = await fetch(esiUrl, { mode: 'cors' });
    if (res.ok) {
      const j = await res.json();
      const id = Array.isArray(j?.inventory_type) ? Number(j.inventory_type[0]) : NaN;
      if (Number.isFinite(id)) { typeIdCache.set(label, id); return id; }
    }
  } catch (_) { /* noop */ }
  // 2) Fallback: Fuzzwork typeid
  const fwUrl = `https://www.fuzzwork.co.uk/api/typeid.php?typename=${encodeURIComponent(label)}`;
  try {
    const res = await fetch(fwUrl, { mode: 'cors' });
    if (res.ok) {
      const j = await res.json();
      if (j && typeof j.typeID === 'number') { typeIdCache.set(label, j.typeID); return j.typeID; }
    }
  } catch (_) { /* noop */ }
  typeIdCache.set(label, null);
  return null;
}

async function fetchPricesFuzzwork(typeIds) {
  if (!typeIds.length) return {};
  const url = `https://market.fuzzwork.co.uk/aggregates/?station=${JITA_STATION}&types=${typeIds.join(',')}`;
  const out = {};
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('Fuzzwork HTTP ' + res.status);
    const j = await res.json();
    for (const id of typeIds) {
      const r = j[id];
      if (!r) continue;
      const buyMax = r?.buy?.max;
      const sellMin = r?.sell?.min;
      if (Number.isFinite(buyMax) || Number.isFinite(sellMin)) {
        out[id] = { buyMax: Number(buyMax), sellMin: Number(sellMin), source: 'fuzzwork' };
      }
    }
  } catch (e) {
    // likely CORS or network — return empty; caller will fallback
  }
  return out;
}

async function fetchPricesEveMarketer(typeIds) {
  if (!typeIds.length) return {};
  const params = typeIds.map(id => 'typeid=' + encodeURIComponent(id)).join('&');
  const url = `https://api.evemarketer.com/ec/marketstat/json?usesystem=${JITA_SYSTEM}&${params}`;
  const out = {};
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('EVEMarketer HTTP ' + res.status);
    const j = await res.json();
    // Structure: [{buy:{max}, sell:{min}, type:{id}}] or marketstat.type[]
    const arr = Array.isArray(j) ? j : (j?.marketstat?.type ? ([]).concat(j.marketstat.type) : []);
    for (const entry of arr) {
      const id = Number(entry?.id || entry?.type?.id || entry?.typeID);
      const buyMax = Number(entry?.buy?.max);
      const sellMin = Number(entry?.sell?.min);
      if (Number.isFinite(id) && (Number.isFinite(buyMax) || Number.isFinite(sellMin))) {
        out[id] = { buyMax, sellMin, source: 'evemarketer' };
      }
    }
  } catch (e) {
    // noop
  }
  return out;
}

// ESI region orders (The Forge) filtered to Jita 4-4 (station 60003760)
const FORGE_REGION = 10000002;

async function getBestJitaPriceESI(typeId, side /* 'sell'|'buy' */) {
  let page = 1;
  let best = side === 'sell' ? Infinity : -Infinity;
  let pages = 1;
  while (page <= pages) {
    const url = `https://esi.evetech.net/latest/markets/${FORGE_REGION}/orders/?order_type=${side}&type_id=${typeId}&page=${page}`;
    let res;
    try { res = await fetch(url, { mode: 'cors' }); } catch (_) { break; }
    if (!res.ok) break;
    const xPages = Number(res.headers.get('x-pages'));
    if (Number.isFinite(xPages) && xPages > pages) pages = xPages;
    let data = [];
    try { data = await res.json(); } catch (_) { data = []; }
    for (const o of data) {
      if (o?.location_id === JITA_STATION && Number.isFinite(o?.price)) {
        if (side === 'sell') best = Math.min(best, o.price); else best = Math.max(best, o.price);
      }
    }
    page += 1;
    if (page > 20) break; // hard cap
  }
  if (!Number.isFinite(best)) return null;
  return best;
}

async function fetchPricesESI(typeIds) {
  const out = {};
  const limit = 3; let i = 0;
  const workers = new Array(limit).fill(0).map(async () => {
    while (i < typeIds.length) {
      const id = typeIds[i++];
      const [sell, buy] = await Promise.all([
        getBestJitaPriceESI(id, 'sell'),
        getBestJitaPriceESI(id, 'buy')
      ]);
      if (sell != null || buy != null) {
        out[id] = { sellMin: sell != null ? Number(sell) : undefined, buyMax: buy != null ? Number(buy) : undefined, source: 'esi' };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function refreshPricesForLabels(labels) {
  // Resolve typeIDs (parallel)
  const unique = [...new Set(labels.filter(Boolean))];
  const pairs = await Promise.all(unique.map(async (label) => [label, await resolveTypeId(label)]));
  const idByLabel = new Map(pairs);
  const ids = pairs.map(([, id]) => id).filter((v) => Number.isFinite(v));

  // 1) ESI zuerst
  let byId = await fetchPricesESI(ids);
  // 2) Fallbacks füllen fehlende IDs
  let remaining = ids.filter(id => !byId[id]);
  if (remaining.length) {
    const fz = await fetchPricesFuzzwork(remaining);
    Object.assign(byId, fz);
    remaining = remaining.filter(id => !byId[id]);
  }
  if (remaining.length) {
    const em = await fetchPricesEveMarketer(remaining);
    Object.assign(byId, em);
  }

  // Map back to labels
  for (const [label, id] of idByLabel.entries()) {
    const p = id ? byId[id] : null;
    if (p) priceByLabel.set(label, p); else priceByLabel.set(label, null);
  }
  rerenderGroupTable();
}

function formatHMS(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatVerbose(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const chunks = [];
  if (d) chunks.push(`${d} Tage`);
  if (h) chunks.push(`${h} Std`);
  if (m) chunks.push(`${m} Min`);
  chunks.push(`${s} Sek`);
  return chunks.join(' ');
}

// ETA aus aktueller Zeit + Dauer
function formatETA(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return null;
  const now = new Date();
  const eta = new Date(now.getTime() + Math.max(0, totalSeconds) * 1000);
  const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }); // ohne Sekunden
  const nowStr = timeFmt.format(now);
  const etaTime = timeFmt.format(eta);
  const sameDay = eta.getFullYear() === now.getFullYear() && eta.getMonth() === now.getMonth() && eta.getDate() === now.getDate();
  if (sameDay) return `Jetzt: ${nowStr} → Fertig um ${etaTime}`;
  const dateStr = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(eta);
  return `Jetzt: ${nowStr} → Fertig am ${dateStr} um ${etaTime}`;
}

function renderTableRows(tbodyEl, rows, type) {
  // type: 'label' or 'value'
  tbodyEl.innerHTML = '';
  if (!rows.length) {
    tbodyEl.innerHTML = `<tr><td colspan="6" style="opacity:.7;padding:10px;">Keine Daten</td></tr>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (type === 'label') {
      const price = priceByLabel.get(r.label);
      const buyTxt = price && Number.isFinite(price.buyMax) ? fmtISK(price.buyMax) : '–';
      const sellTxt = price && Number.isFinite(price.sellMin) ? fmtISK(price.sellMin) : '–';
      const splitTxt = (price && Number.isFinite(price.buyMax) && Number.isFinite(price.sellMin))
        ? `${fmtISK(price.sellMin - price.buyMax)} (${fmtPct((price.sellMin - price.buyMax) / price.sellMin)})`
        : '–';
      tr.innerHTML = `<td>${r.label}</td><td class="num">${fmtDE.format(r.count)}</td><td class="num">${fmtDE.format(r.sum)}</td><td class="num">${buyTxt}</td><td class="num">${sellTxt}</td><td class="num">${splitTxt}</td>`;
    } else {
      tr.innerHTML = `<td class="num">${fmtDE.format(r.value)}</td><td class="num">${fmtDE.format(r.count)}</td><td class="num">${fmtDE.format(r.total)}</td>`;
    }
    frag.appendChild(tr);
  }
  tbodyEl.appendChild(frag);
}

function calculate() {
  const raw = dom.raw.value;
  const rateInput = dom.rate.value;
  const modulesInput = dom.modules.value;
  const charsInput = dom.chars.value;

  // Einzelwerte und Gesamtsumme
  const volumes = extractM3Values(raw);
  const sumVolume = volumes.reduce((a, b) => a + b, 0);

  // Effektive Rate
  const m3ps = parseNumberSmart(rateInput);
  const modules = parseNumberSmart(modulesInput);
  const chars = parseNumberSmart(charsInput);
  const effRate = (Number.isFinite(m3ps) ? m3ps : 0) * (Number.isFinite(modules) ? modules : 0) * (Number.isFinite(chars) ? chars : 0);

  let seconds = NaN;
  if (effRate > 0 && sumVolume > 0) seconds = sumVolume / effRate;

  // KPIs
  dom.sumVol.textContent = sumVolume > 0 ? fmtDE.format(sumVolume) : '–';
  dom.effRate.textContent = effRate > 0 ? fmtDE.format(effRate) : '–';
  dom.duration.textContent = Number.isFinite(seconds) ? formatVerbose(seconds) : '–';
  dom.valuesList.textContent = volumes.length ? volumes.map(v => fmtDE.format(v)).join(' | ') : 'Keine Werte mit „m3“ gefunden.';

  // ETA (Tabellenzeile) aktualisieren
  const etaText = formatETA(seconds);
  const etaCell = dom.etaCell;
  if (etaCell) { etaCell.textContent = etaText || '–'; }

  // Gruppierungen
  const rowsLabel = groupByLabel(raw);
  const rowsValue = groupByValue(volumes);

  // Summenzeile aktualisieren
  const totalCount = rowsLabel.reduce((a, r) => a + r.count, 0);
  const totalSum = rowsLabel.reduce((a, r) => a + r.sum, 0);
  const totalCountEl = dom.groupTotalCount;
  const totalSumEl = dom.groupTotalSum;
  if (totalCountEl) totalCountEl.textContent = totalCount ? fmtDE.format(totalCount) : '–';
  if (totalSumEl) totalSumEl.textContent = totalSum ? fmtDE.format(totalSum) : '–';

  lastRowsLabel = rowsLabel;
  rerenderGroupTable();
  // Preise nachladen (asynchron)
  refreshPricesForLabels(rowsLabel.map(r => r.label)).catch(() => {});
  renderTableRows(dom.groupByValueBody, rowsValue, 'value');
}

function resetAll() {
  dom.rate.value = '';
  dom.modules.value = '';
  dom.chars.value = '';
  calculate();
  saveState();
  scheduleReplaceURL();
}

// Beispiel-Daten vorfüllen (aus deiner Nachricht)
const sample = `Clear Griemeer\t116.085\t92.868 m3\t19 km
Clear Griemeer\t122.270\t97.816 m3\t78 km
Clear Griemeer\t125.198\t100.158 m3\t81 km
Clear Griemeer\t143.493\t114.794 m3\t36 km
Clear Griemeer\t153.104\t122.483 m3\t24 km
Fiery Kernite\t70.000\t84.000 m3\t17 km
Griemeer\t78.204\t62.563 m3\t68 km
Griemeer\t89.722\t71.777 m3\t66 km
Griemeer\t97.035\t77.628 m3\t3.528 m
Griemeer\t97.839\t78.271 m3\t50 km
Griemeer\t118.601\t94.880 m3\t40 km
Griemeer\t122.579\t98.063 m3\t31 km
Griemeer\t139.418\t111.534 m3\t31 km
Griemeer\t150.732\t120.585 m3\t54 km
Griemeer\t296.826\t237.460 m3\t34 km
Inky Griemeer\t61.147\t48.917 m3\t62 km
Inky Griemeer\t125.905\t100.724 m3\t7.714 m
Inky Griemeer\t135.446\t108.356 m3\t86 km
Kernite\t66.667\t80.000 m3\t17 km
Kernite\t68.889\t82.666 m3\t21 km
Kernite\t71.111\t85.333 m3\t56 km
Kernite\t73.333\t87.999 m3\t70 km
Luminous Kernite\t44.800\t53.760 m3\t64 km
Luminous Kernite\t46.200\t55.440 m3\t28 km
Luminous Kernite\t49.000\t58.800 m3\t17 km
Opaque Griemeer\t49.702\t39.761 m3\t25 km
Opaque Griemeer\t69.300\t55.440 m3\t58 km
Prismatic Gneiss\t1.515\t7.575 m3\t16 km
Resplendant Kernite\t24.162\t28.994 m3\t45 km
Resplendant Kernite\t34.300\t41.160 m3\t13 km`;

const fromURL = readStateFromURL();
if (fromURL) {
  applyAppState(fromURL);
} else {
  const existing = loadState();
  if (existing && typeof existing.raw === 'string') {
    applyAppState(existing);
  } else {
    dom.raw.value = sample;
  }
}

// Theme init
(function initTheme() {
  const initial = getInitialTheme();
  applyTheme(initial);
  const t = document.getElementById('themeToggle');
  if (t) t.addEventListener('click', () => {
    const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
    applyTheme(next);
  });
})();

// Sortier-Header initialisieren
attachSortHandlers();
updateSortIndicators();

// Events
document.getElementById('calc').addEventListener('click', () => {
  calculate();
  saveState();
  scheduleReplaceURL();
});
document.getElementById('reset').addEventListener('click', () => { resetAll(); });
document.getElementById('shareLink').addEventListener('click', async () => {
  const ok = await copyShareURL('hash');
  const btn = document.getElementById('shareLink');
  if (btn) {
    const old = btn.textContent;
    btn.textContent = ok ? 'Link kopiert ✓' : 'Kopieren fehlgeschlagen';
    setTimeout(() => { btn.textContent = old; }, 1400);
  }
});
const onInput = () => { calculate(); saveState(); scheduleReplaceURL(); };
['raw', 'rate', 'modules', 'chars'].forEach(id => {
  const el = dom[id];
  if (el) el.addEventListener('input', onInput);
});

// Initial berechnen
calculate();
saveState();
replaceURLWithCurrentState('hash');

