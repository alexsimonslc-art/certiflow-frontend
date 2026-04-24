/* ================================================================
   Honourix — Combined Pipeline  |  combined-tool.js
   FIXED: dropdown styling, email editor, manual entry
================================================================ */

/* ── State ──────────────────────────────────────────────────────── */
const CP = {
  step: 1,
  srcType: 'sheets',
  headers: [],
  rows: [],
  sheetId: null,
  customMappings: [],
  results: [],
  /* Manual entry state */
  manualColumns: ['Name', 'Email'],
  manualRows: [{ Name: '', Email: '' }],
};

const STEPS = ['Data & Campaign','Certificate Design','Field Mapping','Email Template','Review & Launch','Results'];

/* ── Canvas state ────────────────────────────────────────────────── */
let _canvas, _ctx, _overlay;
const ED = {
  w: 1122, h: 794,
  bgImg: null, bgBase64: null, bgColor: '#ffffff',
  fields: [], selId: null, scale: 1,
  ready: false,
};

/* ── Email Editor state ──────────────────────────────────────────── */
const ME = {
  blocks: [],
  selectedId: null,
  nextId: 1,
  activeTab: 'visual',
  cm: null,
  cmDebounce: null,
  previewDevice: 'desktop',
  initialized: false,
};

/* ════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarMount').outerHTML = renderSidebar('combined-tool.html');
  initSidebar();
  buildStepper();

  _canvas  = document.getElementById('certCanvas');
  _ctx     = _canvas.getContext('2d');
  _overlay = document.getElementById('fieldOverlay');

  loadSavedTemplate();
  meBuildTemplatePicker();
  manualRenderTable();
  lucide.createIcons();

  const dz = document.getElementById('cpUploadZone');
  if (dz) {
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dz-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dz-over'));
    dz.addEventListener('drop',      e => { e.preventDefault(); dz.classList.remove('dz-over'); handleFileUpload({ target: { files: e.dataTransfer.files } }); });
  }
});

/* ── Stepper ─────────────────────────────────────────────────────── */
function buildStepper() {
  const el = document.getElementById('stepper');
  el.innerHTML = STEPS.map((label, i) => {
    const n = i + 1;
    return `${n > 1 ? `<div class="step-connector" id="sc${n}"></div>` : ''}
    <div class="step-node ${n === 1 ? 'active' : ''}" id="sn${n}">
      <div class="step-circle" id="sci${n}">${n}</div>
      <div class="step-label"><div class="step-num-label">Step ${n}</div><div class="step-title">${label}</div></div>
    </div>`;
  }).join('');
}

function updateStepper() {
  STEPS.forEach((_, i) => {
    const n = i + 1;
    const node = document.getElementById(`sn${n}`);
    const ci   = document.getElementById(`sci${n}`);
    const conn = document.getElementById(`sc${n}`);
    if (!node) return;
    node.className = `step-node ${n < CP.step ? 'done' : n === CP.step ? 'active' : ''}`;
    ci.innerHTML   = n < CP.step ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>` : String(n);
    if (conn) conn.className = `step-connector ${n <= CP.step ? 'done' : ''}`;
  });
}

/* ── Navigation ──────────────────────────────────────────────────── */
function goStep(n, force = false) {
  if (!force && !validateStep(CP.step)) return;
  if (CP.step === 4) meSyncTextarea();
  CP.step = n;
  updateStepper();
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`sp${n}`).classList.add('active');
  if (n === 2) requestAnimationFrame(() => requestAnimationFrame(() => resizeCanvas()));
  if (n === 3) buildStep3();
  if (n === 4) buildEmailStep();
  if (n === 5) buildReview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(n) {
  if (n === 1) {
    if (!document.getElementById('cpName').value.trim()) { toast('Enter a campaign name', 'error'); return false; }
    if (!CP.rows.length) { toast('Load participant data first', 'error'); return false; }
  }
  if (n === 2) {
    if (!ED.fields.length) { toast('Add at least one field to your certificate template', 'warning'); return false; }
  }
  if (n === 3) {
    if (!document.getElementById('mapName').value)  { toast('Select the Name column', 'error'); return false; }
    if (!document.getElementById('mapEmail').value) { toast('Select the Email column', 'error'); return false; }
  }
  if (n === 4) {
    if (!document.getElementById('emailSubject').value.trim()) { toast('Enter an email subject', 'error'); return false; }
    meSyncTextarea();
    if (!document.getElementById('emailTemplate').value.trim()) { toast('Design your email template first', 'error'); return false; }
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   STEP 1 — DATA SOURCE
════════════════════════════════════════════════════════════════ */
function switchDataSrc(type) {
  CP.srcType = type;
  document.getElementById('panelSheets').style.display = type === 'sheets' ? 'block' : 'none';
  document.getElementById('panelFile').style.display   = type === 'file'   ? 'block' : 'none';
  document.getElementById('panelManual').style.display = type === 'manual' ? 'block' : 'none';
  document.getElementById('srcSheetsBtn').className    = 'src-opt' + (type === 'sheets' ? ' active' : '');
  document.getElementById('srcFileBtn').className      = 'src-opt' + (type === 'file'   ? ' active' : '');
  document.getElementById('srcManualBtn').className    = 'src-opt' + (type === 'manual' ? ' active' : '');
}

async function loadSheetData() {
  const id  = document.getElementById('sheetId').value.trim();
  if (!id) { toast('Paste your Sheet ID first', 'error'); return; }
  const btn = document.getElementById('loadSheetBtn');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = await apiFetch(`/api/sheets/read?sheetId=${encodeURIComponent(id)}&range=Sheet1`);
    if (!data?.data?.length || data.data.length < 2) { toast('Sheet is empty or unreadable', 'warning'); return; }
    CP.headers = data.data[0].map(h => h.toString().trim());
    CP.rows    = data.data.slice(1).map(row => Object.fromEntries(CP.headers.map((h, i) => [h, row[i] || ''])));
    CP.sheetId = id;
    showDataOK('sheetLoadedMsg', `${CP.rows.length} participants · ${CP.headers.length} columns`);
    toast(`Loaded ${CP.rows.length} participants`, 'success');
  } catch (e) { toast('Could not load sheet: ' + e.message, 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

function handleFileUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const ext  = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: r => {
      CP.headers = r.meta.fields; CP.rows = r.data; CP.sheetId = null;
      showDataOK('fileLoadedMsg', `${CP.rows.length} rows from ${file.name}`);
      toast(`Loaded ${CP.rows.length} participants`, 'success');
    }});
  } else if (['xlsx','xls'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = ev => {
      const wb  = XLSX.read(ev.target.result, { type: 'array' });
      const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      CP.headers = Object.keys(arr[0] || {}); CP.rows = arr; CP.sheetId = null;
      showDataOK('fileLoadedMsg', `${CP.rows.length} rows from ${file.name}`);
      toast(`Loaded ${CP.rows.length} participants`, 'success');
    };
    reader.readAsArrayBuffer(file);
  } else { toast('Use .csv, .xlsx or .xls', 'error'); }
}

function showDataOK(id, msg) {
  const el = document.getElementById(id);
  el.innerHTML = `<div class="data-ok"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span><strong style="color:#34d399">Data loaded</strong> — ${msg}</span></div>`;
  el.style.display = 'block';
}

/* ── Manual Entry ────────────────────────────────────────────────── */
function manualRenderTable() {
  const headerRow = document.getElementById('manualHeaderRow');
  const body      = document.getElementById('manualBody');
  if (!headerRow || !body) return;

  headerRow.innerHTML = '<th style="width:36px">#</th>' +
    CP.manualColumns.map((col, ci) => {
      const isDefault = (col === 'Name' || col === 'Email');
      return `<th><div class="manual-col-header"><span>${col}</span>${!isDefault ? `<button class="manual-col-del" onclick="manualRemoveColumn(${ci})" title="Remove column"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}</div></th>`;
    }).join('') + '<th style="width:36px"></th>';

  body.innerHTML = CP.manualRows.map((row, ri) =>
    '<tr>' +
      `<td style="color:var(--text-3);font-size:12px;text-align:center">${ri + 1}</td>` +
      CP.manualColumns.map(col =>
        `<td><input type="text" placeholder="${col}" value="${(row[col] || '').replace(/"/g, '&quot;')}" oninput="CP.manualRows[${ri}]['${col}']=this.value"/></td>`
      ).join('') +
      `<td><button class="manual-row-del" onclick="manualRemoveRow(${ri})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>` +
    '</tr>'
  ).join('');
}

function manualAddRow() {
  const row = {};
  CP.manualColumns.forEach(c => row[c] = '');
  CP.manualRows.push(row);
  manualRenderTable();
}

function manualRemoveRow(idx) {
  if (CP.manualRows.length <= 1) { toast('Need at least one row', 'warning'); return; }
  CP.manualRows.splice(idx, 1);
  manualRenderTable();
}

function manualAddColumn() {
  const name = prompt('Enter column name (e.g. Course, Date, Score):');
  if (!name || !name.trim()) return;
  const col = name.trim();
  if (CP.manualColumns.includes(col)) { toast('Column already exists', 'warning'); return; }
  CP.manualColumns.push(col);
  CP.manualRows.forEach(r => r[col] = '');
  manualRenderTable();
  toast(`Added column: ${col}`, 'success', 1500);
}

function manualRemoveColumn(ci) {
  const col = CP.manualColumns[ci];
  if (col === 'Name' || col === 'Email') { toast('Cannot remove default columns', 'warning'); return; }
  CP.manualColumns.splice(ci, 1);
  CP.manualRows.forEach(r => delete r[col]);
  manualRenderTable();
}

function manualApplyData() {
  const valid = CP.manualRows.filter(r => r.Name?.trim() || r.Email?.trim());
  if (!valid.length) { toast('Add at least one participant with a name or email', 'error'); return; }
  CP.headers = [...CP.manualColumns];
  CP.rows    = valid.map(r => ({ ...r }));
  CP.sheetId = null;
  showDataOK('manualLoadedMsg', `${CP.rows.length} participants entered manually`);
  toast(`${CP.rows.length} participants ready`, 'success');
}

/* ════════════════════════════════════════════════════════════════
   STEP 2 — CANVAS EDITOR
════════════════════════════════════════════════════════════════ */
function resizeCanvas() {
  const zone = document.getElementById('canvasZone');
  if (!zone) return;
  const zw = zone.clientWidth, zh = zone.clientHeight;
  if (zw < 10) { setTimeout(resizeCanvas, 50); return; }
  ED.scale = Math.min((zw - 48) / ED.w, (Math.max(zh - 48, 200)) / ED.h, 1);
  const cw = Math.round(ED.w * ED.scale), ch = Math.round(ED.h * ED.scale);
  const cont = document.getElementById('cContainer');
  if (cont) { cont.style.width = cw + 'px'; cont.style.height = ch + 'px'; }
  _canvas.width = cw; _canvas.height = ch;
  ED.ready = true;
  redrawCanvas();
}

function redrawCanvas() {
  if (!_ctx || !ED.ready) return;
  const w = _canvas.width, h = _canvas.height;
  _ctx.clearRect(0, 0, w, h);
  if (ED.bgImg) _ctx.drawImage(ED.bgImg, 0, 0, w, h);
  else { _ctx.fillStyle = ED.bgColor; _ctx.fillRect(0, 0, w, h); }
  renderHandles();
}

function renderHandles() {
  if (!_overlay || !ED.ready) return;
  _overlay.innerHTML = '';
  ED.fields.forEach(f => {
    const cw = _canvas.width, ch = _canvas.height;
    const x = (f.x / 100) * cw, y = (f.y / 100) * ch, w = (f.width / 100) * cw;
    const fs = Math.max(6, f.fontSize * ED.scale);
    const ls = ((f.letterSpacing || 0) * ED.scale).toFixed(2);
    const ff = getFontCSS(f.fontFamily || 'Helvetica');
    const fw = f.bold ? 700 : getFontWeight(f.fontFamily || 'Helvetica');
    const fi = f.italic ? 'italic' : 'normal';
    const el = document.createElement('div');
    el.className = 'tf-handle' + (f.id === ED.selId ? ' sel' : '');
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;font-size:${fs}px;font-family:${ff};font-weight:${fw};font-style:${fi};color:${f.color||'#111'};text-align:${f.align||'left'};letter-spacing:${ls}px;line-height:1.2;`;
    el.textContent = f.previewText || f.placeholder;
    const del = document.createElement('div');
    del.className = 'tf-del'; del.textContent = '×';
    del.addEventListener('click', e => { e.stopPropagation(); deleteField(f.id); });
    el.appendChild(del);
    el.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); selectField(f.id); startDrag(e, f, el); });
    _overlay.appendChild(el);
  });
  renderChipList();
}

function startDrag(e, field, el) {
  const sx = e.clientX, sy = e.clientY, sx0 = field.x, sy0 = field.y;
  const onMove = ev => {
    field.x = Math.max(0, Math.min(96, sx0 + ((ev.clientX - sx) / _canvas.width) * 100));
    field.y = Math.max(0, Math.min(96, sy0 + ((ev.clientY - sy) / _canvas.height) * 100));
    el.style.left = (field.x / 100 * _canvas.width) + 'px';
    el.style.top  = (field.y / 100 * _canvas.height) + 'px';
    if (field.id === ED.selId) {
      const px = document.getElementById('pX'), py = document.getElementById('pY');
      if (px) { px.value = field.x.toFixed(1); py.value = field.y.toFixed(1); }
    }
  };
  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

const FONT_MAP = {
  'Helvetica':          { css: 'Helvetica, Arial, sans-serif', weight: 400 },
  'Montserrat':         { css: "'Montserrat', sans-serif", weight: 400 },
  'Raleway':            { css: "'Raleway', sans-serif", weight: 400 },
  'Plus Jakarta Sans':  { css: "'Plus Jakarta Sans', sans-serif", weight: 400 },
  'Times New Roman':    { css: "'Times New Roman', serif", weight: 400 },
  'EB Garamond':        { css: "'EB Garamond', serif", weight: 400 },
  'Playfair Display':   { css: "'Playfair Display', serif", weight: 400 },
  'Cormorant Garamond': { css: "'Cormorant Garamond', serif", weight: 400 },
  'Dancing Script':     { css: "'Dancing Script', cursive", weight: 400 },
  'Cinzel':             { css: "'Cinzel', serif", weight: 400 },
  'Courier New':        { css: "'Courier New', monospace", weight: 400 },
  'JetBrains Mono':     { css: "'JetBrains Mono', monospace", weight: 400 },
};
function getFontCSS(name)    { return (FONT_MAP[name] || FONT_MAP['Helvetica']).css; }
function getFontWeight(name) { return (FONT_MAP[name] || FONT_MAP['Helvetica']).weight; }
// Add this helper to combined-tool.js
const FONT_URLS = {
  'Montserrat':         'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap',
  'Raleway':            'https://fonts.googleapis.com/css2?family=Raleway:wght@400;700&display=swap',
  'Plus Jakarta Sans':  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap',
  'EB Garamond':        'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&display=swap',
  'Playfair Display':   'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap',
  'Cormorant Garamond': 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&display=swap',
  'Dancing Script':     'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap',
  'Cinzel':             'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap',
  'JetBrains Mono':     'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
};

function getUsedFontUrls() {
  const used = [...new Set(ED.fields.map(f => f.fontFamily).filter(Boolean))];
  return used.filter(f => FONT_URLS[f]).map(f => FONT_URLS[f]);
}

function openAFModal()  { document.getElementById('afOverlay').classList.add('open'); }
function closeAFModal() { document.getElementById('afOverlay').classList.remove('open'); }

function addCanvasField() {
  let ph = document.getElementById('afPh').value;
  if (ph === 'custom') {
    const c = document.getElementById('afCustom').value.trim();
    if (!c) { toast('Enter a custom placeholder name', 'error'); return; }
    ph = '{{' + c.replace(/[{}]/g, '') + '}}';
  }
  const previews = { '{{name}}':'John Smith','{{course}}':'Web Development','{{date}}':'March 2026','{{score}}':'95%','{{email}}':'john@example.com','{{org}}':'NIT Trichy' };
  const field = {
    id: 'f_' + Date.now(), placeholder: ph,
    previewText: document.getElementById('afPreview').value.trim() || previews[ph] || ph.replace(/[{}]/g, ''),
    x: 10, y: 10 + ED.fields.length * 15, width: 80,
    fontSize: parseInt(document.getElementById('afSize').value, 10) || 48,
    fontFamily: 'Helvetica', color: '#111111', align: 'center',
    bold: false, italic: false, letterSpacing: 0,
  };
  ED.fields.push(field);
  closeAFModal();
  if (!ED.ready) requestAnimationFrame(() => requestAnimationFrame(() => { resizeCanvas(); selectField(field.id); }));
  else selectField(field.id);
  toast(`Added field: ${ph}`, 'success', 1800);
}

function selectField(id) {
  ED.selId = id;
  const f = ED.fields.find(f => f.id === id); if (!f) return;
  switchEPTab('props');
  document.getElementById('propsEmpty').style.display = 'none';
  document.getElementById('propsForm').style.display  = 'flex';
  document.getElementById('pPh').value = f.placeholder;
  document.getElementById('pPrev').value = f.previewText || '';
  document.getElementById('pFont').value = f.fontFamily || 'Helvetica';
  document.getElementById('pSize').value = f.fontSize;
  document.getElementById('pSizeVal').textContent = f.fontSize + 'px';
  document.getElementById('pColor').value = f.color || '#111111';
  document.getElementById('pColorHex').textContent = f.color || '#111111';
  document.getElementById('pX').value = f.x.toFixed(1);
  document.getElementById('pY').value = f.y.toFixed(1);
  document.getElementById('pW').value = f.width;
  document.getElementById('pSpacing').value = f.letterSpacing || 0;
  document.getElementById('pSpacingVal').textContent = (f.letterSpacing || 0) + 'px';
  document.getElementById('boldBtn').classList.toggle('on', !!f.bold);
  document.getElementById('italicBtn').classList.toggle('on', !!f.italic);
  ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('on'));
  document.getElementById(f.align === 'center' ? 'alC' : f.align === 'right' ? 'alR' : 'alL').classList.add('on');
  loadFontIfNeeded(f.fontFamily || 'Helvetica');
  updateFontPreview(f.fontFamily || 'Helvetica', f.bold, f.italic);
  renderHandles();
}

function updateFontPreview(name, bold, italic) {
  const el = document.getElementById('fontPreviewSample'); if (!el) return;
  el.style.fontFamily = getFontCSS(name);
  el.style.fontWeight = bold ? 700 : getFontWeight(name);
  el.style.fontStyle  = italic ? 'italic' : 'normal';
  el.textContent      = name + ' — Aa 123';
}

function deleteField(id) {
  ED.fields = ED.fields.filter(f => f.id !== id);
  if (ED.selId === id) { ED.selId = null; const pe = document.getElementById('propsEmpty'), pf = document.getElementById('propsForm'); if (pe) pe.style.display = ''; if (pf) pf.style.display = 'none'; }
  renderHandles();
}
function deleteSelField() { if (ED.selId) deleteField(ED.selId); }
function setFP(key, val) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f[key] = val; if (key === 'color') document.getElementById('pColorHex').textContent = val; renderHandles(); }
function setFPFont(name) {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f.fontFamily = name;
  loadFontIfNeeded(name);
  updateFontPreview(name, f.bold, f.italic);
  renderHandles();
}

function loadFontIfNeeded(name) {
  if (!FONT_URLS[name]) return; // system font, no load needed
  const id = 'gfont_' + name.replace(/\s+/g, '_');
  if (document.getElementById(id)) return; // already loaded
  const link = document.createElement('link');
  link.id   = id;
  link.rel  = 'stylesheet';
  link.href = FONT_URLS[name];
  document.head.appendChild(link);
}
function toggleBold() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.bold = !f.bold; document.getElementById('boldBtn').classList.toggle('on', f.bold); renderHandles(); }
function toggleItalic() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.italic = !f.italic; document.getElementById('italicBtn').classList.toggle('on', f.italic); renderHandles(); }
function setFPXY() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.x = parseFloat(document.getElementById('pX').value) || f.x; f.y = parseFloat(document.getElementById('pY').value) || f.y; renderHandles(); }
function setAlign(a) { setFP('align', a); ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('on')); document.getElementById(a === 'center' ? 'alC' : a === 'right' ? 'alR' : 'alL').classList.add('on'); }
function switchEPTab(tab) { ['fields','props'].forEach(t => { document.getElementById(`epTab_${t}`).className = 'ep-tab' + (t === tab ? ' active' : ''); document.getElementById(`epPanel_${t}`).className = 'ep-panel' + (t === tab ? ' active' : ''); }); }
function renderChipList() {
  const el = document.getElementById('fieldChipList'); if (!el) return;
  if (!ED.fields.length) { el.innerHTML = `<div style="text-align:center;padding:28px 8px;color:var(--text-3);font-size:13px">No fields yet.<br/><span style="color:var(--cyan)">Click "+ Add Field"</span></div>`; return; }
  el.innerHTML = ED.fields.map(f => `<div class="fc-chip ${f.id === ED.selId ? 'sel' : ''}" onclick="selectField('${f.id}')"><div class="fc-dot" style="background:${f.color}"></div><span class="fc-name">${f.previewText || f.placeholder}</span><span class="fc-ph">${f.placeholder}</span></div>`).join('');
}

function uploadBG(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { const img = new Image(); img.onload = () => { ED.bgImg = img; ED.bgBase64 = ev.target.result; redrawCanvas(); toast('Background uploaded', 'success', 1800); }; img.src = ev.target.result; }; reader.readAsDataURL(file); }
function changeBGColor() { ED.bgColor = document.getElementById('bgColor').value; if (!ED.bgImg) redrawCanvas(); }
function clearBG() { ED.bgImg = null; ED.bgBase64 = null; document.getElementById('bgUpload').value = ''; redrawCanvas(); toast('Background cleared', 'info', 1800); }
function changeSize() { const [w, h] = document.getElementById('canvasSize').value.split(',').map(Number); ED.w = w; ED.h = h; resizeCanvas(); }
function clearCanvas() { ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null; const pe = document.getElementById('propsEmpty'), pf = document.getElementById('propsForm'); if (pe) pe.style.display = ''; if (pf) pf.style.display = 'none'; redrawCanvas(); toast('Canvas cleared', 'info', 1800); }
function saveTemplate() { localStorage.setItem('cf_cp_tmpl', JSON.stringify({ w: ED.w, h: ED.h, bgColor: ED.bgColor, bgBase64: ED.bgBase64, fields: ED.fields })); }
function loadSavedTemplate() {
  const raw = localStorage.getItem('cf_cp_tmpl'); if (!raw) return;
  try { const t = JSON.parse(raw); ED.w = t.w || 1122; ED.h = t.h || 794; ED.bgColor = t.bgColor || '#ffffff'; ED.fields = (t.fields || []).map(f => ({ bold: false, italic: false, letterSpacing: 0, ...f })); if (t.bgBase64) { const img = new Image(); img.onload = () => { ED.bgImg = img; }; img.src = t.bgBase64; ED.bgBase64 = t.bgBase64; } if (t.fields?.length) toast('Previous template restored', 'info', 2200); } catch {}
}

/* ════════════════════════════════════════════════════════════════
   STEP 3 — FIELD MAPPING
════════════════════════════════════════════════════════════════ */
function buildStep3() {
  saveTemplate();
  const opts = CP.headers.map(h => `<option value="${h}">${h}</option>`).join('');
  ['mapName','mapEmail'].forEach(id => { const sel = document.getElementById(id); const cur = sel.value; sel.innerHTML = `<option value="">Select column…</option>${opts}`; if (cur) sel.value = cur; });
  const ng = CP.headers.find(h => /name/i.test(h));
  const eg = CP.headers.find(h => /email|mail/i.test(h));
  if (ng && !document.getElementById('mapName').value) document.getElementById('mapName').value = ng;
  if (eg && !document.getElementById('mapEmail').value) document.getElementById('mapEmail').value = eg;
  document.querySelectorAll('.cp-col-sel').forEach(sel => { const cur = sel.value; sel.innerHTML = `<option value="">Sheet column…</option>${opts}`; if (cur) sel.value = cur; });
  document.getElementById('colList').innerHTML = CP.headers.map(h => `<div class="col-pill"><span class="col-dot"></span>${h}</div>`).join('');
  const tags = [...new Set(ED.fields.map(f => f.placeholder))].join(', ');
  const df = document.getElementById('detectedFields'); if (df) df.textContent = tags || 'none';
}

function addFMapping() {
  const idx = CP.customMappings.length;
  CP.customMappings.push({ col: '', ph: '' });
  const opts = CP.headers.map(h => `<option value="${h}">${h}</option>`).join('');
  const tagOpts = ED.fields.map(f => { const t = f.placeholder.replace(/[{}]/g, ''); return `<option value="${t}">${f.placeholder}</option>`; }).join('');
  const row = document.createElement('div'); row.className = 'fm-row'; row.dataset.idx = idx;
  row.innerHTML = `<select class="form-select cp-col-sel" style="flex:1" onchange="CP.customMappings[${idx}].col=this.value"><option value="">Sheet column…</option>${opts}</select><svg class="fm-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg><select class="form-select cp-col-sel" style="flex:1" onchange="CP.customMappings[${idx}].ph=this.value"><option value="">Template tag…</option>${tagOpts}</select><button class="fm-del" onclick="removeFMapping(${idx},this.closest('.fm-row'))"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
  document.getElementById('customMappings').appendChild(row);
  document.getElementById('noMappingsNote').style.display = 'none';
}

function removeFMapping(idx, rowEl) { CP.customMappings.splice(idx, 1); if (rowEl) rowEl.remove(); if (!CP.customMappings.length) document.getElementById('noMappingsNote').style.display = 'flex'; }

function getAllMappings() {
  const m = { name: document.getElementById('mapName').value, email: document.getElementById('mapEmail').value };
  CP.customMappings.filter(x => x.col && x.ph).forEach(x => { m[x.ph] = x.col; });
  return m;
}

/* ════════════════════════════════════════════════════════════════
   STEP 4 — EMAIL TEMPLATE (full editor ported from mail-tool.js)
════════════════════════════════════════════════════════════════ */

/* ── Block definitions ────────────────────────────────────────── */
const ME_DEFS = {
  logo:    { label:'Logo / Banner', defaults:()=>({ text:'HONOURIX', tagline:'', bgColor:'#0d1728', color:'#00d4ff', fontSize:22, fontWeight:800, align:'center', paddingV:28, paddingH:40 }) },
  header:  { label:'Heading',      defaults:()=>({ text:'Your Email Heading', fontSize:28, fontWeight:700, color:'#1e293b', bgColor:'#ffffff', align:'center', paddingV:32, paddingH:40 }) },
  text:    { label:'Text',         defaults:()=>({ text:'Write your message here. Use {{name}} to personalize.', fontSize:16, color:'#475569', bgColor:'#ffffff', align:'left', paddingV:14, paddingH:40, lineHeight:1.75 }) },
  button:  { label:'Button',       defaults:()=>({ text:'Click Here', link:'{{cert_link}}', btnBg:'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor:'#ffffff', bgColor:'#ffffff', align:'center', paddingV:24, paddingH:40, borderRadius:10, fontSize:15, fontWeight:700 }) },
  image:   { label:'Image',        defaults:()=>({ src:'', alt:'Image', width:100, bgColor:'#f8fafc', paddingV:20, paddingH:40, borderRadius:8 }) },
  divider: { label:'Divider',      defaults:()=>({ color:'#e2e8f0', bgColor:'#ffffff', paddingV:12, thickness:1 }) },
  spacer:  { label:'Spacer',       defaults:()=>({ height:40, bgColor:'#ffffff' }) },
  footer:  { label:'Footer',       defaults:()=>({ text:'Sent via Honourix. Contact the organiser for questions.', bgColor:'#f8fafc', color:'#94a3b8', fontSize:12, align:'center', paddingV:24, paddingH:40 }) },
};

function meBlockToHtml(block) {
  const p = block.props, fs = "'Montserrat','Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  switch (block.type) {
    case 'logo': return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}"><div style="font-size:${p.fontSize}px;font-weight:${p.fontWeight};color:${p.color};letter-spacing:3px;font-family:${fs}">${p.text}</div>${p.tagline?`<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:1px;font-family:${fs}">${p.tagline}</div>`:''}</div>`;
    case 'header': return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor}"><h1 style="margin:0;font-size:${p.fontSize}px;font-weight:${p.fontWeight};color:${p.color};line-height:1.2;text-align:${p.align};font-family:${fs}">${p.text}</h1></div>`;
    case 'text': return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor}"><p style="margin:0;font-size:${p.fontSize}px;color:${p.color};line-height:${p.lineHeight};text-align:${p.align};font-family:${fs}">${(p.text||'').replace(/\n/g,'<br/>')}</p></div>`;
    case 'button': return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}"><a href="${p.link}" style="display:inline-block;padding:14px 38px;background:${p.btnBg};color:${p.btnColor};text-decoration:none;border-radius:${p.borderRadius}px;font-weight:${p.fontWeight};font-size:${p.fontSize}px;font-family:${fs}">${p.text}</a></div>`;
    case 'image': return p.src ? `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:center"><img src="${p.src}" alt="${p.alt}" style="width:${p.width}%;max-width:100%;height:auto;border-radius:${p.borderRadius}px;display:block;margin:0 auto"/></div>` : `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:center"><div style="width:100%;height:160px;background:#e2e8f0;border-radius:${p.borderRadius}px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px">[Image — add URL in properties]</div></div>`;
    case 'divider': return `<div style="padding:${p.paddingV}px 40px;background:${p.bgColor}"><div style="height:${p.thickness}px;background:${p.color}"></div></div>`;
    case 'spacer': return `<div style="height:${p.height}px;background:${p.bgColor}">&nbsp;</div>`;
    case 'footer': return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}"><p style="margin:0;font-size:${p.fontSize}px;color:${p.color};line-height:1.6;font-family:${fs}">${(p.text||'').replace(/\n/g,'<br/>')}</p></div>`;
    default: return '';
  }
}

function meGetHtml() {
  if (!ME.blocks.length) return '';
  const inner = ME.blocks.map(b => meBlockToHtml(b)).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,700;1,400;1,700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Dancing+Script:wght@400;700&family=Cinzel:wght@400;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,700;1,400&family=Raleway:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet"/></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:32px 16px"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)"><tr><td>${inner}</td></tr></table></td></tr></table></body></html>`;
}

function buildEmailStep() {
  const mappings = getAllMappings();
  const fixedTags = ['{{name}}','{{email}}','{{cert_link}}'];
  const extraTags = Object.keys(mappings).filter(k => !['name','email'].includes(k)).map(k => `{{${k}}}`);
  const allTags = [...new Set([...fixedTags, ...extraTags])];
  const tagRow = document.getElementById('meMergeTags');
  if (tagRow) tagRow.innerHTML = allTags.map(t => `<span class="me-tag" onclick="meInsertTag('${t}')">${t}</span>`).join('');

  if (ME.initialized) { if (ME.cm) ME.cm.refresh(); return; }
  ME.initialized = true;

  const wrapper = document.getElementById('meCmWrap');
  ME.cm = CodeMirror(wrapper, { mode:'htmlmixed', theme:'dracula', lineNumbers:true, lineWrapping:true, tabSize:2, value: document.getElementById('emailTemplate').value || '' });
  wrapper.querySelector('.CodeMirror').style.background = '#080f1e';
  ME.cm.on('change', () => {
    clearTimeout(ME.cmDebounce);
    ME.cmDebounce = setTimeout(() => {
      document.getElementById('emailTemplate').value = ME.cm.getValue();
      if (ME.activeTab === 'preview') meRefreshPreview();
    }, 400);
  });

  if (!ME.blocks.length && !ME.cm.getValue().trim()) meLoadTemplate('cert');
  else if (ME.blocks.length) meSyncToCode();
}

function meInsertTag(tag) {
  if (ME.activeTab === 'code' && ME.cm) { ME.cm.replaceSelection(tag); ME.cm.focus(); toast('Inserted ' + tag, 'success', 1200); }
  else if (ME.activeTab === 'visual') {
    const block = ME.blocks.find(b => b.id === ME.selectedId);
    if (block && block.props.text !== undefined) { block.props.text += tag; meRenderCanvas(); meRenderProps(block); meSyncToCode(); toast('Inserted ' + tag, 'success', 1500); }
    else toast('Select a text block first, or switch to Code tab', 'info', 2500);
  }
}

/* ── Tab switching ───────────────────────────────────────────── */
function meSwitchTab(tab) {
  ME.activeTab = tab;
  ['visual','code','preview'].forEach(t => { const btn = document.getElementById('meTab' + t.charAt(0).toUpperCase() + t.slice(1)); if (btn) btn.classList.toggle('active', t === tab); });
  document.getElementById('meVisual').style.display  = tab === 'visual'  ? 'grid' : 'none';
  document.getElementById('meCode').style.display    = tab === 'code'    ? 'block' : 'none';
  document.getElementById('mePreview').style.display = tab === 'preview' ? 'block' : 'none';
  if (tab === 'code' && ME.cm) { if (ME.blocks.length) meSyncToCode(); setTimeout(() => ME.cm.refresh(), 50); }
  if (tab === 'preview') { meSyncTextarea(); meRefreshPreview(); }
}

/* ── Canvas rendering ────────────────────────────────────────── */
function meRenderCanvas() {
  const canvas = document.getElementById('meCanvas'), empty = document.getElementById('meEmptyCanvas'); if (!canvas) return;
  if (!ME.blocks.length) { if (empty) empty.style.display = ''; canvas.querySelectorAll('.me-block-wrap').forEach(el => el.remove()); return; }
  if (empty) empty.style.display = 'none';
  canvas.querySelectorAll('.me-block-wrap').forEach(el => el.remove());
  ME.blocks.forEach((block, idx) => {
    const wrap = document.createElement('div'); wrap.className = 'me-block-wrap' + (block.id === ME.selectedId ? ' selected' : ''); wrap.dataset.id = block.id;
    const ctrl = document.createElement('div'); ctrl.className = 'me-block-controls';
    ctrl.innerHTML = (idx > 0 ? `<button class="me-ctrl-btn" onclick="event.stopPropagation();meMoveBlock('${block.id}',-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg></button>` : '') +
      (idx < ME.blocks.length - 1 ? `<button class="me-ctrl-btn" onclick="event.stopPropagation();meMoveBlock('${block.id}',1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>` : '') +
      `<button class="me-ctrl-btn" onclick="event.stopPropagation();meDuplicateBlock('${block.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` +
      `<button class="me-ctrl-btn del" onclick="event.stopPropagation();meDeleteBlock('${block.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
    const inner = document.createElement('div'); inner.className = 'me-block-inner'; inner.innerHTML = meBlockToHtml(block);
    wrap.appendChild(ctrl); wrap.appendChild(inner);
    wrap.addEventListener('click', () => meSelectBlock(block.id));
    canvas.appendChild(wrap);
  });
}

function meAddBlock(type) { const def = ME_DEFS[type]; if (!def) return; const block = { id:'b'+(ME.nextId++), type, props:def.defaults() }; ME.blocks.push(block); meRenderCanvas(); meSelectBlock(block.id); meSyncToCode(); const wrap = document.getElementById('meCanvasWrap'); if (wrap) wrap.scrollTop = wrap.scrollHeight; toast('Added ' + def.label, 'success', 1500); }
function meDeleteBlock(id) { ME.blocks = ME.blocks.filter(b => b.id !== id); if (ME.selectedId === id) { ME.selectedId = null; meRenderProps(null); } meRenderCanvas(); meSyncToCode(); }
function meDuplicateBlock(id) { const idx = ME.blocks.findIndex(b => b.id === id); if (idx < 0) return; const copy = { id:'b'+(ME.nextId++), type:ME.blocks[idx].type, props:JSON.parse(JSON.stringify(ME.blocks[idx].props)) }; ME.blocks.splice(idx+1, 0, copy); meRenderCanvas(); meSelectBlock(copy.id); meSyncToCode(); }
function meMoveBlock(id, dir) { const idx = ME.blocks.findIndex(b => b.id === id); const ni = idx + dir; if (ni < 0 || ni >= ME.blocks.length) return; [ME.blocks[idx], ME.blocks[ni]] = [ME.blocks[ni], ME.blocks[idx]]; meRenderCanvas(); meSyncToCode(); }
function meSelectBlock(id) { ME.selectedId = id; document.querySelectorAll('.me-block-wrap').forEach(el => el.classList.toggle('selected', el.dataset.id === id)); meRenderProps(ME.blocks.find(b => b.id === id)); }

function meRenderProps(block) {
  const body = document.getElementById('mePropsBody'); if (!body) return;
  if (!block) { body.innerHTML = `<div class="me-props-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div>Click any block to<br/>edit its properties</div></div>`; return; }
  const p = block.props, rows = [];
  if (['logo','header','text','footer'].includes(block.type)) rows.push(mePropTextarea('Text', block.id, 'text', p.text));
  if (block.type === 'logo') rows.push(mePropText('Tagline', block.id, 'tagline', p.tagline || ''));
  if (block.type === 'button') { rows.push(mePropText('Button Text', block.id, 'text', p.text)); rows.push(mePropText('Link / URL', block.id, 'link', p.link)); rows.push(mePropColor('Button Color', block.id, 'btnBg', p.btnBg?.startsWith('linear') ? '#00d4ff' : p.btnBg)); }
  if (block.type === 'image') { rows.push(mePropText('Image URL', block.id, 'src', p.src)); rows.push(mePropText('Alt Text', block.id, 'alt', p.alt)); rows.push(mePropRange('Width %', block.id, 'width', p.width, 20, 100)); }
  if (block.type === 'divider') { rows.push(mePropColor('Line Color', block.id, 'color', p.color)); rows.push(mePropRange('Thickness', block.id, 'thickness', p.thickness, 1, 8)); }
  if (block.type === 'spacer') rows.push(mePropRange('Height', block.id, 'height', p.height, 8, 120));
  if (['logo','header','text','button','footer'].includes(block.type)) { if (['header','text','footer','logo'].includes(block.type)) { rows.push(mePropColor('Text Color', block.id, 'color', p.color)); rows.push(mePropRange('Font Size', block.id, 'fontSize', p.fontSize, 10, 48)); } }
  rows.push(mePropColor('Background', block.id, 'bgColor', p.bgColor));
  rows.push(mePropRange('Padding V', block.id, 'paddingV', p.paddingV, 0, 80));
  body.innerHTML = `<div class="me-props-body"><div style="font-size:12px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">${(ME_DEFS[block.type]||{}).label||block.type}</div>${rows.join('')}</div>`;
}

function mePropText(label, id, key, val) { return `<div class="me-field"><div class="me-field-label">${label}</div><input class="me-input" type="text" value="${(val||'').replace(/"/g,'&quot;')}" oninput="meUpdateProp('${id}','${key}',this.value)"/></div>`; }
function mePropTextarea(label, id, key, val) { return `<div class="me-field"><div class="me-field-label">${label}</div><textarea class="me-textarea" oninput="meUpdateProp('${id}','${key}',this.value)">${(val||'').replace(/</g,'&lt;')}</textarea></div>`; }
function mePropColor(label, id, key, val) { return `<div class="me-field"><div class="me-field-label">${label}</div><div class="me-color-row"><div class="me-color-swatch" style="background:${val||'#fff'}"><input type="color" value="${val||'#ffffff'}" oninput="meUpdateProp('${id}','${key}',this.value)"/></div><input class="me-input" type="text" value="${val||'#ffffff'}" oninput="meUpdateProp('${id}','${key}',this.value)" style="flex:1"/></div></div>`; }
function mePropRange(label, id, key, val, min, max) { return `<div class="me-field"><div class="me-field-label" style="display:flex;justify-content:space-between">${label} <span id="rv_${id}_${key}" style="color:var(--cyan)">${val}</span></div><input class="me-range" type="range" min="${min}" max="${max}" value="${val}" oninput="document.getElementById('rv_${id}_${key}').textContent=this.value;meUpdateProp('${id}','${key}',Number(this.value))"/></div>`; }

function meUpdateProp(id, key, value) {
  const block = ME.blocks.find(b => b.id === id); if (!block) return;
  block.props[key] = value;
  const inner = document.querySelector(`.me-block-wrap[data-id="${id}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  clearTimeout(ME._propSync);
  ME._propSync = setTimeout(() => meSyncToCode(), 300);
}

function meSyncToCode() { const html = meGetHtml(); document.getElementById('emailTemplate').value = html; if (ME.cm) { const c = ME.cm.getCursor(); ME.cm.setValue(html); try { ME.cm.setCursor(c); } catch {} } }
function meSyncTextarea() { if (ME.cm && ME.activeTab === 'code') document.getElementById('emailTemplate').value = ME.cm.getValue(); else if (ME.blocks.length) document.getElementById('emailTemplate').value = meGetHtml(); }
function meSyncVisualFromCode() { if (ME.cm) document.getElementById('emailTemplate').value = ME.cm.getValue(); toast('Code synced — visual shows current blocks', 'info', 2500); }
function meRefreshPreview() { const iframe = document.getElementById('mePreviewFrame'); if (!iframe) return; let html = document.getElementById('emailTemplate').value || meGetHtml(); if (CP.rows.length) html = personalise(html, CP.rows[0], getAllMappings()); iframe.srcdoc = html; }
function meSetDevice(d) { ME.previewDevice = d; const f = document.getElementById('mePreviewFrame'); document.getElementById('meBtnDesktop').classList.toggle('active', d==='desktop'); document.getElementById('meBtnMobile').classList.toggle('active', d==='mobile'); if (f) { f.style.width = d==='mobile'?'375px':'100%'; f.style.height = d==='mobile'?'600px':'480px'; } }

function meShowTemplatePicker() { const w = document.getElementById('meTplPickerWrap'); if (w) w.style.display = w.style.display === 'none' ? 'block' : 'none'; }
function meHideTemplatePicker() { const w = document.getElementById('meTplPickerWrap'); if (w) w.style.display = 'none'; }

const ME_TEMPLATES = {
  cert: { name:'🎓 Certificate Dispatch', thumb:'linear-gradient(135deg,#0d1728,#1a2744)', blocks:[
    { type:'logo', props:{ text:'HONOURIX', tagline:'Certificate Platform', bgColor:'#0d1728', color:'#00d4ff', fontSize:20, fontWeight:800, align:'center', paddingV:28, paddingH:40 } },
    { type:'header', props:{ text:'Your Certificate is Ready 🎉', fontSize:26, fontWeight:700, color:'#1e293b', bgColor:'#ffffff', align:'center', paddingV:36, paddingH:40 } },
    { type:'text', props:{ text:'Dear {{name}},\n\nCongratulations on completing your course. Your personalized certificate is ready.', fontSize:16, color:'#475569', bgColor:'#ffffff', align:'left', paddingV:8, paddingH:40, lineHeight:1.75 } },
    { type:'button', props:{ text:'Download Certificate', link:'{{cert_link}}', btnBg:'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor:'#ffffff', bgColor:'#ffffff', align:'center', paddingV:28, paddingH:40, borderRadius:10, fontSize:15, fontWeight:700 } },
    { type:'divider', props:{ color:'#e2e8f0', bgColor:'#ffffff', paddingV:16, thickness:1 } },
    { type:'footer', props:{ text:'Sent via Honourix. Contact the organiser for questions.', bgColor:'#f8fafc', color:'#94a3b8', fontSize:12, align:'center', paddingV:24, paddingH:40 } },
  ]},
  event: { name:'📅 Event Invitation', thumb:'linear-gradient(135deg,#7c3aed,#4f46e5)', blocks:[
    { type:'logo', props:{ text:'EVENT', tagline:'', bgColor:'#7c3aed', color:'#ffffff', fontSize:18, fontWeight:800, align:'center', paddingV:24, paddingH:40 } },
    { type:'header', props:{ text:"You're Invited, {{name}}!", fontSize:28, fontWeight:700, color:'#1e293b', bgColor:'#ffffff', align:'center', paddingV:36, paddingH:40 } },
    { type:'text', props:{ text:'Join us for an unforgettable experience.', fontSize:16, color:'#475569', bgColor:'#ffffff', align:'center', paddingV:8, paddingH:40, lineHeight:1.75 } },
    { type:'button', props:{ text:'RSVP Now', link:'#', btnBg:'#7c3aed', btnColor:'#ffffff', bgColor:'#ffffff', align:'center', paddingV:28, paddingH:40, borderRadius:8, fontSize:15, fontWeight:700 } },
    { type:'footer', props:{ text:'Let us know if you cannot attend.', bgColor:'#f8fafc', color:'#94a3b8', fontSize:12, align:'center', paddingV:24, paddingH:40 } },
  ]},
  thankyou: { name:'🙏 Thank You', thumb:'linear-gradient(135deg,#10b981,#059669)', blocks:[
    { type:'logo', props:{ text:'THANK YOU', tagline:'', bgColor:'#10b981', color:'#ffffff', fontSize:20, fontWeight:800, align:'center', paddingV:28, paddingH:40 } },
    { type:'header', props:{ text:'Thank You, {{name}}!', fontSize:28, fontWeight:700, color:'#1e293b', bgColor:'#ffffff', align:'center', paddingV:36, paddingH:40 } },
    { type:'text', props:{ text:'We truly appreciate your participation and dedication.', fontSize:16, color:'#475569', bgColor:'#ffffff', align:'left', paddingV:12, paddingH:40, lineHeight:1.8 } },
    { type:'footer', props:{ text:'With gratitude,\nThe Honourix Team', bgColor:'#f0fdf4', color:'#6b7280', fontSize:13, align:'center', paddingV:24, paddingH:40 } },
  ]},
};

function meBuildTemplatePicker() {
  const row = document.getElementById('meTplRow'); if (!row) return;
  row.innerHTML = Object.entries(ME_TEMPLATES).map(([key, tpl]) => `<div class="me-tpl-card" onclick="meLoadTemplate('${key}')"><div class="me-tpl-thumb" style="background:${tpl.thumb}">${tpl.name.split(' ')[0]}</div><div class="me-tpl-info"><div class="me-tpl-name">${tpl.name.slice(tpl.name.indexOf(' ')+1)}</div><button class="me-tpl-btn">Use This</button></div></div>`).join('');
}

function meLoadTemplate(key) {
  const tpl = ME_TEMPLATES[key]; if (!tpl) return;
  ME.blocks = tpl.blocks.map(b => ({ id:'b'+(ME.nextId++), type:b.type, props:JSON.parse(JSON.stringify(b.props)) }));
  ME.selectedId = null;
  meRenderCanvas(); meSyncToCode(); meHideTemplatePicker();
  if (ME.activeTab !== 'visual') meSwitchTab('visual');
  toast('Template loaded: ' + tpl.name, 'success', 2000);
}

function personalise(tmpl, row, mappings) {
  let out = tmpl;
  out = out.replace(/\{\{name\}\}/gi, row[mappings.name] || '');
  out = out.replace(/\{\{email\}\}/gi, row[mappings.email] || '');
  
  Object.entries(mappings).forEach(([ph, col]) => { out = out.replace(new RegExp(`\\{\\{${ph}\\}\\}`, 'gi'), row[col] || ''); });
  return out;
}

/* ════════════════════════════════════════════════════════════════
   STEP 5 — REVIEW
════════════════════════════════════════════════════════════════ */
function buildReview() {
  const n = CP.rows.length, mappings = getAllMappings(), camp = document.getElementById('cpName').value;
  document.getElementById('rvParticipants').textContent = n;
  document.getElementById('rvCerts').textContent = n;
  document.getElementById('rvEmails').textContent = n;
  const rows = [
    { k:'Campaign', v:camp }, { k:'Participants', v:String(n) },
    { k:'Data source', v:CP.sheetId ? `Sheet (${CP.sheetId.slice(0,18)}…)` : CP.srcType === 'manual' ? 'Manual entry' : 'Uploaded file' },
    { k:'Name column', v:mappings.name }, { k:'Email column', v:mappings.email },
    { k:'Custom mappings', v:`${CP.customMappings.filter(m=>m.col&&m.ph).length} field(s)` },
    { k:'Certificate fields', v:`${ED.fields.length} text field(s)` },
    { k:'Canvas size', v:`${ED.w} × ${ED.h} px` },
    { k:'Email subject', v:document.getElementById('emailSubject').value },
    { k:'Write links back', v:document.getElementById('writeBackToggle').classList.contains('on') ? 'Yes' : 'No' },
  ];
  document.getElementById('reviewDetailsEl').innerHTML = rows.map(r => `<div class="rv-row"><span class="rv-key">${r.k}</span><span class="rv-val">${r.v}</span></div>`).join('');
  document.getElementById('runJobInfo').innerHTML = rows.slice(0, 3).map(r => `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:5px 0;border-bottom:1px solid var(--glass-border)"><span style="color:var(--text-2)">${r.k}</span><strong style="color:var(--text)">${r.v}</strong></div>`).join('');
}

/* ════════════════════════════════════════════════════════════════
   STEP 6 — LAUNCH PIPELINE
════════════════════════════════════════════════════════════════ */
async function launchPipeline() {
  const btn = document.getElementById('launchBtn');
  btn.disabled = true; btn.style.opacity = '0.6';
  goStep(6, true);
  const mappings = getAllMappings(), subject = document.getElementById('emailSubject').value;
  meSyncTextarea();
  const htmlTmpl = document.getElementById('emailTemplate').value;
  const campName = document.getElementById('cpName').value;
  const writeBack = document.getElementById('writeBackToggle').classList.contains('on');
  const total = CP.rows.length;
  let certsDone = 0, mailsDone = 0, failed = 0;
  CP.results = [];
  setRunProgress(0, total, 'Starting up…');
  llLog('info', `Launching: ${campName} — ${total} participants`);

  for (let i = 0; i < CP.rows.length; i++) {
    const row = CP.rows[i], name = row[mappings.name] || `Person ${i+1}`, email = row[mappings.email] || '';
    setRunProgress(i, total, `Processing: ${name} (${i+1}/${total})`);
    let certLink = '';
    try {
      const participant = { ...row }; Object.entries(mappings).forEach(([ph, col]) => { participant[ph] = row[col] || ''; });
      const certRes = await apiFetch('/api/certificates/generate', { method:'POST', body:JSON.stringify({
        campaignName:campName, template:{ width:ED.w, height:ED.h, bgColor:ED.bgColor, backgroundBase64:ED.bgBase64||null, fields:ED.fields, fontUrls:getUsedFontUrls() },
        participants:[participant], nameCol:mappings.name, emailCol:mappings.email, sheetId:writeBack?CP.sheetId:null, writeBack, rowOffset:i,
      })});
      const r0 = certRes?.results?.[0];
      if (r0?.status === 'success') { certLink = r0.link || ''; certsDone++; llLog('cert', `Certificate saved: ${name}`); }
      else throw new Error(r0?.error || 'Certificate generation failed');
    } catch (e) {
      failed++; llLog('err', `Cert failed for ${name}: ${e.message}`);
      CP.results.push({ name, email, certLink:'', certStatus:'failed', mailStatus:'skipped', error:e.message });
      setRunProgress(i+1, total); updateRunCounts(certsDone, mailsDone, failed); continue;
    }
    try {
      const personHtml = personalise(htmlTmpl, row, mappings).replace(/\{\{cert_link\}\}/gi, certLink);
      const personSubj = personalise(subject, row, mappings);
      await apiFetch('/api/mail/send-one', { method:'POST', body:JSON.stringify({ to:email, subject:personSubj, html:personHtml }) });
      mailsDone++; llLog('mail', `Email sent → ${email}`);
    } catch (e) { failed++; llLog('err', `Email failed for ${name}: ${e.message}`); }
    CP.results.push({ name, email, certLink, certStatus:'success', mailStatus:mailsDone > certsDone-1 ? 'sent' : 'failed' });
    setRunProgress(i+1, total); updateRunCounts(certsDone, mailsDone, failed);
  }
  saveCampaignHistory({ name:campName, type:'combined', date:new Date().toISOString(), total, success:certsDone, failed });
  setTimeout(() => showDone(certsDone, mailsDone, failed, total), 700);
}

function setRunProgress(done, total, status) {
  const pct = total > 0 ? Math.round((done/total)*100) : 0;
  document.getElementById('runPct').textContent = pct+'%';
  document.getElementById('runFraction').textContent = `${done} / ${total}`;
  if (status) document.getElementById('runStatus').textContent = status;
  document.getElementById('runBar').style.width = pct+'%';
  const rc = document.getElementById('ringCircle');
  if (rc) rc.style.strokeDashoffset = 345 - (345 * pct / 100);
}
function updateRunCounts(c, m, f) { document.getElementById('runCertsDone').textContent = c; document.getElementById('runMailsDone').textContent = m; document.getElementById('runFailed').textContent = f; }
function llLog(type, msg) { const win = document.getElementById('liveLog'); if (!win) return; const ts = new Date().toLocaleTimeString('en-IN',{hour12:false}); const el = document.createElement('div'); el.className = 'll-row'; el.innerHTML = `<span class="ll-ts">${ts}</span><span class="ll-${type}">${msg}</span>`; win.appendChild(el); win.scrollTop = win.scrollHeight; }

function showDone(certs, mails, failed, total) {
  document.getElementById('runningState').style.display = 'none';
  document.getElementById('doneState').style.display = 'block';
  document.getElementById('dCerts').textContent = certs;
  document.getElementById('dEmails').textContent = mails;
  document.getElementById('dFailed').textContent = failed;
  document.getElementById('doneTitle').textContent = failed === 0 ? 'Pipeline Complete!' : `${certs} certs · ${mails} emails · ${failed} failed`;
  if (failed > 0) { const ring = document.getElementById('doneRing'); if (ring) { ring.style.background = 'linear-gradient(135deg,#f59e0b,#ef4444)'; ring.style.boxShadow = '0 0 48px rgba(245,158,11,0.35)'; } }
  renderResultTable(CP.results);
  toast(`Done — ${certs} certs, ${mails} emails`, 'success', 6000);
}

function renderResultTable(results) {
  const tbody = document.getElementById('resultTbody'); if (!tbody) return;
  tbody.innerHTML = results.map(r => {
    const cb = r.certStatus==='success' ? `<span style="background:rgba(0,212,255,0.1);color:var(--cyan);border:1px solid rgba(0,212,255,0.2);padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600">Generated</span>` : `<span style="background:var(--red-dim);color:var(--red);border:1px solid rgba(244,63,94,0.2);padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600">Failed</span>`;
    const mb = r.mailStatus==='sent' ? `<span style="background:rgba(124,58,237,0.1);color:#a78bfa;border:1px solid rgba(124,58,237,0.2);padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600">Sent</span>` : r.mailStatus==='skipped' ? `<span style="color:var(--text-3);font-size:11.5px">Skipped</span>` : `<span style="color:var(--red);font-size:11.5px">Failed</span>`;
    const cert = r.certLink ? `<a href="${r.certLink}" target="_blank" style="color:var(--cyan);font-size:12.5px;max-width:200px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.certLink}</a>` : '—';
    return `<tr data-name="${r.name}" data-email="${r.email||''}"><td style="font-weight:600">${r.name}</td><td style="color:var(--text-2)">${r.email||'—'}</td><td>${cert}</td><td style="display:flex;gap:5px;flex-wrap:wrap">${cb}${mb}</td><td>${r.certLink?`<button class="ic-btn" onclick="copyToClipboard('${r.certLink}','Link')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`:''}</td></tr>`;
  }).join('');
}

function filterResultTable() { const q = document.getElementById('resultSearch').value.toLowerCase(); document.querySelectorAll('#resultTbody tr').forEach(tr => { tr.style.display = (!q || tr.dataset.name.toLowerCase().includes(q) || (tr.dataset.email||'').toLowerCase().includes(q)) ? '' : 'none'; }); }
function downloadFullReport() { downloadCSV(CP.results.map(r => ({ Name:r.name, Email:r.email||'', 'Cert Status':r.certStatus, 'Email Status':r.mailStatus, 'Certificate Link':r.certLink||'', Error:r.error||'' })), `honourix-pipeline-${Date.now()}.csv`); }

// ── Connect Pipeline to Supabase ──
async function saveCampaignHistory(rec) { 
  const mappings = getAllMappings();
  
  // Build Backup Sheet Payload (Serial No, Mapped Fields, Cert Link)
  const backupData = CP.results.map((r, i) => {
     const original = CP.rows[i] || {};
     const rowData = { "S.No": i + 1 };
     
     if (mappings.name) rowData[mappings.name] = r.name || original[mappings.name] || '';
     if (mappings.email) rowData[mappings.email] = r.email || original[mappings.email] || '';
     
     CP.customMappings.forEach(m => {
         if (m.col) rowData[m.col] = original[m.col] || '';
     });
     
     rowData["Certificate Link"] = r.certLink || '';
     return rowData;
  });

  try {
    await apiFetch('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: rec.name || 'Combined Campaign',
        type: 'combined',
        total_count: rec.total,
        sent_count: rec.success,
        status: rec.failed === 0 ? 'completed' : (rec.success > 0 ? 'partial' : 'failed'),
        backup_data: backupData // Backend uses this to create the Backup Google Sheet!
      })
    });
  } catch(e) {
    console.error('Pipeline database save failed', e);
  }
}

function resetAll() {
  if (!confirm('Start a new campaign? Current results will be cleared.')) return;
  CP.rows = []; CP.results = []; CP.headers = []; CP.customMappings = []; CP.sheetId = null;
  ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null; ED.ready = false;
  ME.blocks = []; ME.selectedId = null; ME.initialized = false;
  ['cpName','sheetId','emailSubject','emailTemplate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['sheetLoadedMsg','fileLoadedMsg','manualLoadedMsg'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('customMappings').innerHTML = '';
  if (ME.cm) ME.cm.setValue('');
  goStep(1, true);
}
