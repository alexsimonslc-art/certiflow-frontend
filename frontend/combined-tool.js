/* ================================================================
   CertiFlow — Combined Pipeline  |  combined-tool.js
   All canvas, email editor, and mapping bugs fixed.
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
};

const STEPS = ['Data & Campaign','Certificate Design','Field Mapping','Email Template','Review & Launch','Results'];

/* ── Canvas state ────────────────────────────────────────────────── */
let _canvas, _ctx, _overlay;
const ED = {
  w: 1122, h: 794,
  bgImg: null, bgBase64: null, bgColor: '#ffffff',
  fields: [], selId: null, scale: 1,
  /* BUG-FIX: track whether canvas has been properly sized */
  ready: false,
};

/* ════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarMount').outerHTML = renderSidebar('combined-tool.html');
  initSidebar();
  buildStepper();

  /* BUG-FIX: do NOT initialise canvas here — it's inside display:none.
     We store references only; resizeCanvas() is deferred to goStep(2). */
  _canvas  = document.getElementById('certCanvas');
  _ctx     = _canvas.getContext('2d');
  _overlay = document.getElementById('fieldOverlay');

  loadSavedTemplate();
  buildEmailTemplates();
  lucide.createIcons();

  // Upload zone drag-drop
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
      <div class="step-label">
        <div class="step-num-label">Step ${n}</div>
        <div class="step-title">${label}</div>
      </div>
    </div>`;
  }).join('');
}

function updateStepper() {
  STEPS.forEach((_, i) => {
    const n    = i + 1;
    const node = document.getElementById(`sn${n}`);
    const ci   = document.getElementById(`sci${n}`);
    const conn = document.getElementById(`sc${n}`);
    if (!node) return;
    node.className = `step-node ${n < CP.step ? 'done' : n === CP.step ? 'active' : ''}`;
    ci.innerHTML   = n < CP.step
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
      : String(n);
    if (conn) conn.className = `step-connector ${n <= CP.step ? 'done' : ''}`;
  });
}

/* ── Navigation ──────────────────────────────────────────────────── */
function goStep(n, force = false) {
  if (!force && !validateStep(CP.step)) return;
  CP.step = n;
  updateStepper();
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`sp${n}`).classList.add('active');

  /* BUG-FIX: resize canvas AFTER step 2 panel is visible */
  if (n === 2) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resizeCanvas());
    });
  }
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
    if (!document.getElementById('emailTemplate').value.trim()) { toast('Write an email template', 'error'); return false; }
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   STEP 1 — DATA
════════════════════════════════════════════════════════════════ */
function switchDataSrc(type) {
  CP.srcType = type;
  document.getElementById('panelSheets').style.display = type === 'sheets' ? 'block' : 'none';
  document.getElementById('panelFile').style.display   = type === 'file'   ? 'block' : 'none';
  document.getElementById('srcSheetsBtn').className    = 'src-opt' + (type === 'sheets' ? ' active' : '');
  document.getElementById('srcFileBtn').className      = 'src-opt' + (type === 'file'   ? ' active' : '');
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
  el.innerHTML = `<div class="data-ok">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    <span><strong style="color:#34d399">Data loaded</strong> — ${msg}</span>
  </div>`;
  el.style.display = 'block';
}

/* ════════════════════════════════════════════════════════════════
   STEP 2 — CANVAS EDITOR
   KEY FIX: resizeCanvas() only runs after sp2 is visible
════════════════════════════════════════════════════════════════ */
function resizeCanvas() {
  const zone = document.getElementById('canvasZone');
  if (!zone) return;
  const zw = zone.clientWidth;
  const zh = zone.clientHeight;
  /* BUG-FIX: if panel still hidden clientWidth=0 → wait */
  if (zw < 10) { setTimeout(resizeCanvas, 50); return; }
  const maxW = zw - 48;
  const maxH = Math.max(zh - 48, 200);
  ED.scale   = Math.min(maxW / ED.w, maxH / ED.h, 1);
  const cw   = Math.round(ED.w * ED.scale);
  const ch   = Math.round(ED.h * ED.scale);
  const cont = document.getElementById('cContainer');
  if (cont) { cont.style.width = cw + 'px'; cont.style.height = ch + 'px'; }
  _canvas.width  = cw;
  _canvas.height = ch;
  /* Overlay is position:absolute inside cContainer — no extra sizing needed */
  ED.ready = true;
  redrawCanvas();
}

function redrawCanvas() {
  if (!_ctx || !ED.ready) return;
  const w = _canvas.width, h = _canvas.height;
  _ctx.clearRect(0, 0, w, h);
  if (ED.bgImg) { _ctx.drawImage(ED.bgImg, 0, 0, w, h); }
  else { _ctx.fillStyle = ED.bgColor; _ctx.fillRect(0, 0, w, h); }
  renderHandles();
}

/* Renders overlay handles for all fields */
function renderHandles() {
  if (!_overlay || !ED.ready) return;
  _overlay.innerHTML = '';

  ED.fields.forEach(f => {
    /* BUG-FIX: recalculate canvas size each render in case of resize */
    const cw = _canvas.width, ch = _canvas.height;
    const x  = (f.x  / 100) * cw;
    const y  = (f.y  / 100) * ch;
    const w  = (f.width / 100) * cw;
    const fs = Math.max(6, f.fontSize * ED.scale);
    const ls = ((f.letterSpacing || 0) * ED.scale).toFixed(2);
    const ff = getFontCSS(f.fontFamily || 'Helvetica');
    const fw = f.bold   ? 700 : getFontWeight(f.fontFamily || 'Helvetica');
    const fi = f.italic ? 'italic' : 'normal';

    const el = document.createElement('div');
    el.className = 'tf-handle' + (f.id === ED.selId ? ' sel' : '');
    el.style.cssText = [
      `left:${x}px`, `top:${y}px`,
      `width:${w}px`,
      `font-size:${fs}px`,
      `font-family:${ff}`,
      `font-weight:${fw}`,
      `font-style:${fi}`,
      `color:${f.color || '#111'}`,
      `text-align:${f.align || 'left'}`,
      `letter-spacing:${ls}px`,
      `line-height:1.2`,
    ].join(';');
    el.textContent = f.previewText || f.placeholder;

    /* Delete button */
    const del = document.createElement('div');
    del.className = 'tf-del';
    del.textContent = '×';
    del.addEventListener('click', e => { e.stopPropagation(); deleteField(f.id); });
    el.appendChild(del);

    /* Drag */
    el.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      selectField(f.id);
      startDrag(e, f, el);
    });

    _overlay.appendChild(el);
  });

  renderChipList();
}

/* Drag a field handle */
function startDrag(e, field, el) {
  const sx = e.clientX, sy = e.clientY;
  const sx0 = field.x, sy0 = field.y;
  const onMove = ev => {
    const cw = _canvas.width, ch = _canvas.height;
    field.x = Math.max(0, Math.min(96, sx0 + ((ev.clientX - sx) / cw) * 100));
    field.y = Math.max(0, Math.min(96, sy0 + ((ev.clientY - sy) / ch) * 100));
    el.style.left = (field.x / 100 * cw) + 'px';
    el.style.top  = (field.y / 100 * ch) + 'px';
    const px = document.getElementById('pX'), py = document.getElementById('pY');
    if (px && field.id === ED.selId) { px.value = field.x.toFixed(1); py.value = field.y.toFixed(1); }
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

/* ── Font helpers ────────────────────────────────────────────────── */
/* BUG-FIX: these were missing in the previous version */
const FONT_MAP = {
  'Helvetica':          { css: 'Helvetica, Arial, sans-serif',                    weight: 400 },
  'Montserrat':         { css: '\'Montserrat\', sans-serif',                      weight: 400 },
  'Raleway':            { css: '\'Raleway\', sans-serif',                         weight: 400 },
  'Plus Jakarta Sans':  { css: '\'Plus Jakarta Sans\', sans-serif',               weight: 400 },
  'Times New Roman':    { css: '\'Times New Roman\', serif',                      weight: 400 },
  'EB Garamond':        { css: '\'EB Garamond\', serif',                          weight: 400 },
  'Playfair Display':   { css: '\'Playfair Display\', serif',                     weight: 400 },
  'Cormorant Garamond': { css: '\'Cormorant Garamond\', serif',                   weight: 400 },
  'Dancing Script':     { css: '\'Dancing Script\', cursive',                     weight: 400 },
  'Cinzel':             { css: '\'Cinzel\', serif',                               weight: 400 },
  'Courier New':        { css: '\'Courier New\', monospace',                      weight: 400 },
  'JetBrains Mono':     { css: '\'JetBrains Mono\', monospace',                   weight: 400 },
};

function getFontCSS(name)    { return (FONT_MAP[name] || FONT_MAP['Helvetica']).css; }
function getFontWeight(name) { return (FONT_MAP[name] || FONT_MAP['Helvetica']).weight; }

/* ── Add Field ───────────────────────────────────────────────────── */
function openAFModal()  { document.getElementById('afOverlay').classList.add('open'); }
function closeAFModal() { document.getElementById('afOverlay').classList.remove('open'); }

function addCanvasField() {
  let ph = document.getElementById('afPh').value;
  if (ph === 'custom') {
    const c = document.getElementById('afCustom').value.trim();
    if (!c) { toast('Enter a custom placeholder name', 'error'); return; }
    ph = '{{' + c.replace(/[{}]/g, '') + '}}';
  }
  const previews = {
    '{{name}}':'John Smith', '{{course}}':'Web Development',
    '{{date}}':'March 2026', '{{score}}':'95%',
    '{{email}}':'john@example.com', '{{org}}':'NIT Trichy',
  };
  const field = {
    id:          'f_' + Date.now(),
    placeholder: ph,
    previewText: document.getElementById('afPreview').value.trim() || previews[ph] || ph.replace(/[{}]/g, ''),
    x: 10,
    y: 10 + ED.fields.length * 15,
    width: 80,
    fontSize:      parseInt(document.getElementById('afSize').value, 10) || 48,
    fontFamily:    'Helvetica',
    color:         '#111111',
    align:         'center',
    bold:          false,
    italic:        false,
    letterSpacing: 0,
  };
  ED.fields.push(field);
  closeAFModal();
  /* BUG-FIX: ensure canvas is ready before rendering handles */
  if (!ED.ready) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resizeCanvas();
      selectField(field.id);
    }));
  } else {
    selectField(field.id);
  }
  toast(`Added field: ${ph}`, 'success', 1800);
}

/* ── Select field ────────────────────────────────────────────────── */
function selectField(id) {
  ED.selId = id;
  const f = ED.fields.find(f => f.id === id);
  if (!f) return;

  switchEPTab('props');
  document.getElementById('propsEmpty').style.display = 'none';
  document.getElementById('propsForm').style.display  = 'flex';

  document.getElementById('pPh').value    = f.placeholder;
  document.getElementById('pPrev').value  = f.previewText || '';
  document.getElementById('pFont').value  = f.fontFamily  || 'Helvetica';
  document.getElementById('pSize').value  = f.fontSize;
  document.getElementById('pSizeVal').textContent  = f.fontSize + 'px';
  document.getElementById('pColor').value          = f.color || '#111111';
  document.getElementById('pColorHex').textContent = f.color || '#111111';
  document.getElementById('pX').value     = f.x.toFixed(1);
  document.getElementById('pY').value     = f.y.toFixed(1);
  document.getElementById('pW').value     = f.width;
  const ls = f.letterSpacing || 0;
  document.getElementById('pSpacing').value = ls;
  document.getElementById('pSpacingVal').textContent = ls + 'px';

  /* Bold / Italic buttons */
  document.getElementById('boldBtn').classList.toggle('on',   !!f.bold);
  document.getElementById('italicBtn').classList.toggle('on', !!f.italic);

  /* Alignment */
  ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('on'));
  document.getElementById(f.align === 'center' ? 'alC' : f.align === 'right' ? 'alR' : 'alL').classList.add('on');

  updateFontPreview(f.fontFamily || 'Helvetica', f.bold, f.italic);
  renderHandles();
}

function updateFontPreview(name, bold, italic) {
  const el = document.getElementById('fontPreviewSample');
  if (!el) return;
  el.style.fontFamily  = getFontCSS(name);
  el.style.fontWeight  = bold ? 700 : getFontWeight(name);
  el.style.fontStyle   = italic ? 'italic' : 'normal';
  el.textContent       = name + ' — Aa 123';
}

/* ── Delete field ────────────────────────────────────────────────── */
function deleteField(id) {
  ED.fields = ED.fields.filter(f => f.id !== id);
  if (ED.selId === id) {
    ED.selId = null;
    const pe = document.getElementById('propsEmpty'), pf = document.getElementById('propsForm');
    if (pe) pe.style.display = '';
    if (pf) pf.style.display = 'none';
  }
  renderHandles();
}

function deleteSelField() { if (ED.selId) deleteField(ED.selId); }

/* ── Property setters ────────────────────────────────────────────── */
function setFP(key, val) {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f[key] = val;
  if (key === 'color') document.getElementById('pColorHex').textContent = val;
  renderHandles();
}

function setFPFont(name) {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f.fontFamily = name;
  updateFontPreview(name, f.bold, f.italic);
  renderHandles();
}

function toggleBold() {
  const f = ED.fields.find(f => f.id === ED.selId); if (!f) return;
  f.bold = !f.bold;
  document.getElementById('boldBtn').classList.toggle('on', f.bold);
  renderHandles();
}

function toggleItalic() {
  const f = ED.fields.find(f => f.id === ED.selId); if (!f) return;
  f.italic = !f.italic;
  document.getElementById('italicBtn').classList.toggle('on', f.italic);
  renderHandles();
}

function setFPXY() {
  const f = ED.fields.find(f => f.id === ED.selId); if (!f) return;
  f.x = parseFloat(document.getElementById('pX').value) || f.x;
  f.y = parseFloat(document.getElementById('pY').value) || f.y;
  renderHandles();
}

function setAlign(a) {
  setFP('align', a);
  ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('on'));
  document.getElementById(a === 'center' ? 'alC' : a === 'right' ? 'alR' : 'alL').classList.add('on');
}

/* ── EP tabs ─────────────────────────────────────────────────────── */
function switchEPTab(tab) {
  ['fields','props'].forEach(t => {
    document.getElementById(`epTab_${t}`).className   = 'ep-tab'   + (t === tab ? ' active' : '');
    document.getElementById(`epPanel_${t}`).className = 'ep-panel' + (t === tab ? ' active' : '');
  });
}

/* ── Field chip list ─────────────────────────────────────────────── */
function renderChipList() {
  const el = document.getElementById('fieldChipList');
  if (!el) return;
  if (!ED.fields.length) {
    el.innerHTML = `<div style="text-align:center;padding:28px 8px;color:var(--text-3);font-size:13px">No fields yet.<br/><span style="color:var(--cyan)">Click "+ Add Field"</span></div>`;
    return;
  }
  el.innerHTML = ED.fields.map(f => `
    <div class="fc-chip ${f.id === ED.selId ? 'sel' : ''}" onclick="selectField('${f.id}')">
      <div class="fc-dot" style="background:${f.color}"></div>
      <span class="fc-name">${f.previewText || f.placeholder}</span>
      <span class="fc-ph">${f.placeholder}</span>
    </div>`).join('');
}

/* ── Background ──────────────────────────────────────────────────── */
function uploadBG(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => { ED.bgImg = img; ED.bgBase64 = ev.target.result; redrawCanvas(); toast('Background uploaded', 'success', 1800); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function changeBGColor() {
  ED.bgColor = document.getElementById('bgColor').value;
  if (!ED.bgImg) redrawCanvas();
}

function clearBG() {
  ED.bgImg = null; ED.bgBase64 = null;
  document.getElementById('bgUpload').value = '';
  redrawCanvas(); toast('Background cleared', 'info', 1800);
}

function changeSize() {
  const [w, h] = document.getElementById('canvasSize').value.split(',').map(Number);
  ED.w = w; ED.h = h;
  resizeCanvas();
}

function clearCanvas() {
  ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null;
  const pe = document.getElementById('propsEmpty'), pf = document.getElementById('propsForm');
  if (pe) pe.style.display = '';
  if (pf) pf.style.display = 'none';
  redrawCanvas(); toast('Canvas cleared', 'info', 1800);
}

/* ── Save / load ─────────────────────────────────────────────────── */
function saveTemplate() {
  localStorage.setItem('cf_cp_tmpl', JSON.stringify({
    w: ED.w, h: ED.h, bgColor: ED.bgColor, bgBase64: ED.bgBase64, fields: ED.fields,
  }));
}

function loadSavedTemplate() {
  const raw = localStorage.getItem('cf_cp_tmpl');
  if (!raw) return;
  try {
    const t    = JSON.parse(raw);
    ED.w       = t.w       || 1122;
    ED.h       = t.h       || 794;
    ED.bgColor = t.bgColor || '#ffffff';
    ED.fields  = (t.fields  || []).map(f => ({
      bold: false, italic: false, letterSpacing: 0, ...f,
    }));
    if (t.bgBase64) {
      const img = new Image();
      img.onload = () => { ED.bgImg = img; /* canvas redraws when step 2 opens */ };
      img.src    = t.bgBase64;
      ED.bgBase64 = t.bgBase64;
    }
    /* do NOT call resizeCanvas() here — canvas panel is hidden */
    if (t.fields?.length) {
      /* Show chip list will be populated when step 2 opens */
      toast('Previous template restored', 'info', 2200);
    }
  } catch { /* ignore corrupt storage */ }
}

/* ════════════════════════════════════════════════════════════════
   STEP 3 — FIELD MAPPING
════════════════════════════════════════════════════════════════ */
function buildStep3() {
  saveTemplate();
  const opts = CP.headers.map(h => `<option value="${h}">${h}</option>`).join('');

  ['mapName','mapEmail'].forEach(id => {
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = `<option value="">Select column…</option>${opts}`;
    if (cur) sel.value = cur;
  });

  const ng = CP.headers.find(h => /name/i.test(h));
  const eg = CP.headers.find(h => /email|mail/i.test(h));
  if (ng && !document.getElementById('mapName').value)  document.getElementById('mapName').value  = ng;
  if (eg && !document.getElementById('mapEmail').value) document.getElementById('mapEmail').value = eg;

  /* Update custom mapping selects */
  document.querySelectorAll('.cp-col-sel').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">Sheet column…</option>${opts}`;
    if (cur) sel.value = cur;
  });

  /* Column list */
  document.getElementById('colList').innerHTML = CP.headers.map(h =>
    `<div class="col-pill"><span class="col-dot"></span>${h}</div>`).join('');

  /* Template field tags */
  const tags = [...new Set(ED.fields.map(f => f.placeholder))].join(', ');
  const df = document.getElementById('detectedFields');
  if (df) df.textContent = tags || 'none';
}

function addFMapping() {
  const idx  = CP.customMappings.length;
  CP.customMappings.push({ col: '', ph: '' });
  const opts    = CP.headers.map(h => `<option value="${h}">${h}</option>`).join('');
  const tagOpts = ED.fields.map(f => {
    const t = f.placeholder.replace(/[{}]/g, '');
    return `<option value="${t}">${f.placeholder}</option>`;
  }).join('');

  const row = document.createElement('div');
  row.className    = 'fm-row';
  row.dataset.idx  = idx;
  row.innerHTML = `
    <select class="form-select cp-col-sel" style="flex:1" onchange="CP.customMappings[${idx}].col=this.value">
      <option value="">Sheet column…</option>${opts}
    </select>
    <svg class="fm-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    <select class="form-select cp-col-sel" style="flex:1" onchange="CP.customMappings[${idx}].ph=this.value">
      <option value="">Template tag…</option>${tagOpts}
    </select>
    <button class="fm-del" onclick="removeFMapping(${idx},this.closest('.fm-row'))">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;

  document.getElementById('customMappings').appendChild(row);
  document.getElementById('noMappingsNote').style.display = 'none';
}

function removeFMapping(idx, rowEl) {
  CP.customMappings.splice(idx, 1);
  if (rowEl) rowEl.remove();
  if (!CP.customMappings.length) document.getElementById('noMappingsNote').style.display = 'flex';
}

function getAllMappings() {
  const m = {
    name:  document.getElementById('mapName').value,
    email: document.getElementById('mapEmail').value,
  };
  CP.customMappings.filter(x => x.col && x.ph).forEach(x => { m[x.ph] = x.col; });
  return m;
}

/* ════════════════════════════════════════════════════════════════
   STEP 4 — EMAIL TEMPLATE
════════════════════════════════════════════════════════════════ */
function buildEmailStep() {
  const mappings = getAllMappings();
  const fixedTags = ['{{name}}','{{email}}','{{cert_link}}'];
  const extraTags = Object.keys(mappings)
    .filter(k => !['name','email'].includes(k))
    .map(k => `{{${k}}}`);
  const allTags = [...new Set([...fixedTags, ...extraTags])];

  const tagRow = document.getElementById('emailMergeTags');
  tagRow.innerHTML = allTags.map(t =>
    `<span class="email-tag" onclick="insertEmailTag('${t}')">${t}</span>`).join('');

  refreshPreview();
}

function insertEmailTag(tag) {
  const ta = document.getElementById('emailTemplate');
  const s  = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + tag + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + tag.length;
  ta.focus();
  refreshPreview();
}

function setETab(tab) {
  document.querySelectorAll('.e-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.email-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('et' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  document.getElementById('ep_' + tab).classList.add('active');
  if (tab === 'preview') refreshPreview();
}

function refreshPreview() {
  if (!CP.rows.length) return;
  const row      = CP.rows[0];
  const mappings = getAllMappings();
  const name     = row[mappings.name]  || '—';
  const email    = row[mappings.email] || '—';
  const subj     = personalise(document.getElementById('emailSubject').value, row, mappings, '');
  const body     = personalise(document.getElementById('emailTemplate').value, row, mappings, 'https://example.com/cert.pdf');

  const eTo = document.getElementById('eprvTo'), eS = document.getElementById('eprvSubject'), eB = document.getElementById('eprvBody');
  if (eTo) eTo.textContent  = `${name} <${email}>`;
  if (eS)  eS.textContent   = subj || '—';
  if (eB)  eB.innerHTML     = body;

  const user = getUser();
  const ef = document.getElementById('eprvFrom');
  if (ef && user) ef.textContent = user.email || 'your@gmail.com';
}

document.addEventListener('input', e => {
  if (e.target?.id === 'emailTemplate' || e.target?.id === 'emailSubject') refreshPreview();
});

function personalise(tmpl, row, mappings, certLink) {
  let out = tmpl;
  out = out.replace(/\{\{name\}\}/gi,      row[mappings.name]  || '');
  out = out.replace(/\{\{email\}\}/gi,     row[mappings.email] || '');
  out = out.replace(/\{\{cert_link\}\}/gi, certLink);
  Object.entries(mappings).forEach(([ph, col]) => {
    out = out.replace(new RegExp(`\\{\\{${ph}\\}\\}`, 'gi'), row[col] || '');
  });
  return out;
}

/* ── Email sample templates ──────────────────────────────────────── */
const EMAIL_TEMPLATES = [
  {
    name: 'Professional Gradient',
    emoji: '🎓',
    bg: 'linear-gradient(135deg,#00d4ff22,#7c3aed22)',
    html: (nameTag) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif">
  <div style="max-width:580px;margin:40px auto">
    <div style="background:linear-gradient(135deg,#050a15,#0d1728);padding:36px;border-radius:16px 16px 0 0;text-align:center">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(0,212,255,0.7);text-transform:uppercase;margin-bottom:8px">Certificate of Achievement</div>
      <h1 style="color:#f0f6ff;font-size:24px;font-weight:800;margin:0">Your Certificate is Ready</h1>
    </div>
    <div style="background:#fff;padding:36px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <p style="font-size:17px;color:#1a2a3a;margin-bottom:20px">Dear <strong>${nameTag}</strong>,</p>
      <p style="color:#3d5a72;font-size:15px;line-height:1.75;margin-bottom:24px">Congratulations on completing the course! Your certificate has been generated and is ready to view.</p>
      <div style="text-align:center;margin:28px 0">
        <a href="{{cert_link}}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700">View Certificate →</a>
      </div>
      <p style="color:#94a3b8;font-size:12.5px;margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center">Sent via CertiFlow — Automated Certificate Platform</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Minimal Clean',
    emoji: '✨',
    bg: 'linear-gradient(135deg,#f8fafc,#e2e8f0)',
    html: (nameTag) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:540px;margin:48px auto;padding:0 24px">
    <div style="border-bottom:2px solid #e2e8f0;padding-bottom:16px;margin-bottom:32px">
      <span style="font-size:13px;letter-spacing:2px;color:#94a3b8;text-transform:uppercase;font-weight:600">CertiFlow</span>
    </div>
    <p style="font-size:15px;color:#64748b;margin-bottom:8px">Hello ${nameTag},</p>
    <h2 style="font-size:26px;font-weight:700;color:#1e293b;margin-bottom:20px;line-height:1.2">Your certificate is ready.</h2>
    <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:28px">We've generated your certificate. Click the button below to view and download your PDF.</p>
    <a href="{{cert_link}}" style="display:inline-block;padding:13px 28px;background:#1e293b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">Download Certificate</a>
    <p style="font-size:12px;color:#cbd5e1;margin-top:40px">© CertiFlow. Automated certificate delivery.</p>
  </div>
</body>
</html>`,
  },
  {
    name: 'Warm Academic',
    emoji: '🏆',
    bg: 'linear-gradient(135deg,#fef3c7,#fde68a)',
    html: (nameTag) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#fffbf0;font-family:Georgia,serif">
  <div style="max-width:560px;margin:40px auto">
    <div style="background:linear-gradient(135deg,#92400e,#78350f);padding:32px;text-align:center;border-radius:12px 12px 0 0">
      <div style="font-size:28px;margin-bottom:8px">🏆</div>
      <h1 style="color:#fef3c7;font-size:22px;font-weight:700;margin:0">Certificate of Completion</h1>
    </div>
    <div style="background:#fff;padding:36px;border:1px solid #fde68a;border-top:none;border-radius:0 0 12px 12px">
      <p style="font-size:16px;color:#451a03">Dear <strong>${nameTag}</strong>,</p>
      <p style="color:#78350f;font-size:15px;line-height:1.8;margin-bottom:24px">We are proud to present you with this certificate in recognition of your achievement and dedication.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="{{cert_link}}" style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#d97706,#92400e);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700">View Your Certificate</a>
      </div>
      <p style="color:#a16207;font-size:12.5px;margin-top:28px;text-align:center">Warm regards &nbsp;|&nbsp; CertiFlow</p>
    </div>
  </div>
</body>
</html>`,
  },
];

function buildEmailTemplates() {
  const grid = document.getElementById('emailTplGrid');
  if (!grid) return;
  grid.innerHTML = EMAIL_TEMPLATES.map((t, i) => `
    <div class="tpl-card">
      <div class="tpl-thumb" style="background:${t.bg}">${t.emoji}</div>
      <div class="tpl-info">
        <div class="tpl-name">${t.name}</div>
        <button class="tpl-use" onclick="applyTemplate(${i})">Use Template</button>
      </div>
    </div>`).join('');
}

function applyTemplate(idx) {
  const t    = EMAIL_TEMPLATES[idx];
  const mappings = getAllMappings();
  const nameTag  = '{{' + (Object.keys(mappings).find(k => k === 'name') || 'name') + '}}';
  document.getElementById('emailTemplate').value = t.html(nameTag);
  if (!document.getElementById('emailSubject').value) {
    document.getElementById('emailSubject').value = `Your certificate is ready, {{name}}!`;
  }
  setETab('html');
  toast(`Template "${t.name}" applied`, 'success');
}

function loadEmailSample() { applyTemplate(0); }

/* ════════════════════════════════════════════════════════════════
   STEP 5 — REVIEW
════════════════════════════════════════════════════════════════ */
function buildReview() {
  const n        = CP.rows.length;
  const mappings = getAllMappings();
  const camp     = document.getElementById('cpName').value;

  document.getElementById('rvCount').textContent  = n;
  document.getElementById('rvCerts').textContent  = n;
  document.getElementById('rvEmails').textContent = n;

  const rows = [
    { k:'Campaign',          v: camp },
    { k:'Participants',      v: `${n}` },
    { k:'Data source',       v: CP.sheetId ? `Sheet (${CP.sheetId.slice(0,18)}…)` : 'Uploaded file' },
    { k:'Name column',       v: mappings.name },
    { k:'Email column',      v: mappings.email },
    { k:'Custom mappings',   v: `${CP.customMappings.filter(m => m.col && m.ph).length} field(s)` },
    { k:'Certificate fields',v: `${ED.fields.length} text field(s)` },
    { k:'Canvas size',       v: `${ED.w} × ${ED.h} px` },
    { k:'Email subject',     v: document.getElementById('emailSubject').value },
    { k:'Write links back',  v: document.getElementById('writeBackToggle').classList.contains('on') ? 'Yes' : 'No' },
  ];

  document.getElementById('reviewDetails').innerHTML = rows.map(r =>
    `<div class="rv-row"><span class="rv-key">${r.k}</span><span class="rv-val">${r.v}</span></div>`).join('');

  document.getElementById('jobInfo').innerHTML = rows.slice(0, 3).map(r =>
    `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:5px 0;border-bottom:1px solid var(--glass-border)"><span style="color:var(--text-2)">${r.k}</span><strong style="color:var(--text)">${r.v}</strong></div>`).join('');
}

/* ════════════════════════════════════════════════════════════════
   STEP 6 — LAUNCH PIPELINE
════════════════════════════════════════════════════════════════ */
async function launchPipeline() {
  const btn = document.getElementById('launchBtn');
  btn.disabled = true; btn.style.opacity = '0.6';
  goStep(6, true);

  const mappings  = getAllMappings();
  const subject   = document.getElementById('emailSubject').value;
  const htmlTmpl  = document.getElementById('emailTemplate').value;
  const campName  = document.getElementById('cpName').value;
  const writeBack = document.getElementById('writeBackToggle').classList.contains('on');
  const total     = CP.rows.length;

  let certsDone = 0, mailsDone = 0, failed = 0;
  CP.results = [];

  setRunProgress(0, total, 'Starting up…');
  llLog('info', `Launching: ${campName} — ${total} participants`);

  for (let i = 0; i < CP.rows.length; i++) {
    const row   = CP.rows[i];
    const name  = row[mappings.name]  || `Person ${i + 1}`;
    const email = row[mappings.email] || '';

    setRunProgress(i, total, `Processing: ${name} (${i + 1}/${total})`);

    let certLink = '';

    /* ── Generate certificate ────────────────────────── */
    try {
      const participant = buildParticipant(row, mappings);
      const certPayload = {
        campaignName: campName,
        template: {
          width: ED.w, height: ED.h,
          bgColor: ED.bgColor,
          backgroundBase64: ED.bgBase64 || null,
          fields: ED.fields,
        },
        participants: [participant],
        nameCol:  mappings.name,
        emailCol: mappings.email,
        sheetId:  writeBack ? CP.sheetId : null,
        writeBack,
        rowOffset: i,
      };

      const certRes = await apiFetch('/api/certificates/generate', {
        method: 'POST',
        body: JSON.stringify(certPayload),
      });

      const r0 = certRes?.results?.[0];
      if (r0?.status === 'success') {
        certLink = r0.link || '';
        certsDone++;
        llLog('cert', `Certificate saved: ${name}`);
      } else {
        throw new Error(r0?.error || 'Certificate generation failed');
      }
    } catch (e) {
      failed++;
      llLog('err', `Cert failed for ${name}: ${e.message}`);
      CP.results.push({ name, email, certLink: '', certStatus: 'failed', mailStatus: 'skipped', error: e.message });
      setRunProgress(i + 1, total);
      updateRunCounts(certsDone, mailsDone, failed);
      continue;
    }

    /* ── Send email ──────────────────────────────────── */
    try {
      const personHtml = personalise(htmlTmpl, row, mappings, certLink);
      const personSubj = personalise(subject,  row, mappings, certLink);

      await apiFetch('/api/mail/send-one', {
        method: 'POST',
        body: JSON.stringify({ to: email, subject: personSubj, html: personHtml }),
      });
      mailsDone++;
      llLog('mail', `Email sent → ${email}`);
    } catch (e) {
      failed++;
      llLog('err', `Email failed for ${name}: ${e.message}`);
    }

    CP.results.push({
      name, email, certLink,
      certStatus: 'success',
      mailStatus: mailsDone > certsDone - 1 ? 'sent' : 'failed',
    });

    setRunProgress(i + 1, total);
    updateRunCounts(certsDone, mailsDone, failed);
  }

  /* Save to history */
  saveCampaignHistory({ name: campName, type: 'combined', date: new Date().toISOString(), total, success: certsDone, failed });

  setTimeout(() => showDone(certsDone, mailsDone, failed, total), 700);
}

function buildParticipant(row, mappings) {
  const obj = { ...row };
  Object.entries(mappings).forEach(([ph, col]) => { obj[ph] = row[col] || ''; });
  return obj;
}

/* ── Progress helpers ────────────────────────────────────────────── */
function setRunProgress(done, total, status) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('runPct').textContent  = pct + '%';
  document.getElementById('runFrac').textContent = `${done} / ${total}`;
  if (status) document.getElementById('runStatus').textContent = status;
  document.getElementById('runBar').style.width  = pct + '%';
  const r = 55; const circ = 2 * Math.PI * r;
  const rc = document.getElementById('ringCircle');
  if (rc) rc.style.strokeDashoffset = circ - (circ * pct / 100);
}

function updateRunCounts(c, m, f) {
  document.getElementById('runCerts').textContent  = c;
  document.getElementById('runMails').textContent  = m;
  document.getElementById('runFailed').textContent = f;
}

function llLog(type, msg) {
  const win = document.getElementById('liveLog'); if (!win) return;
  const ts  = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el  = document.createElement('div');
  el.className = 'll-row';
  el.innerHTML = `<span class="ll-ts">${ts}</span><span class="ll-${type}">${msg}</span>`;
  win.appendChild(el);
  win.scrollTop = win.scrollHeight;
}

/* ── Done state ──────────────────────────────────────────────────── */
function showDone(certs, mails, failed, total) {
  document.getElementById('runningState').style.display = 'none';
  document.getElementById('doneState').style.display    = 'block';
  document.getElementById('dCerts').textContent  = certs;
  document.getElementById('dEmails').textContent = mails;
  document.getElementById('dFailed').textContent = failed;

  const allOK = failed === 0;
  document.getElementById('doneTitle').textContent = allOK ? 'Pipeline Complete!' : `${certs} certs · ${mails} emails · ${failed} failed`;
  document.getElementById('doneSub').textContent   = `PDFs saved to your Drive · Emails dispatched from your Gmail`;

  if (!allOK) {
    const ring = document.getElementById('doneRing');
    if (ring) { ring.style.background = 'linear-gradient(135deg,#f59e0b,#ef4444)'; ring.style.boxShadow = '0 0 48px rgba(245,158,11,0.35)'; }
  }

  renderResultTable(CP.results);
  toast(`Done — ${certs} certs, ${mails} emails`, 'success', 6000);
}

function renderResultTable(results) {
  const tbody = document.getElementById('resultTbody'); if (!tbody) return;
  tbody.innerHTML = results.map(r => {
    const cb = r.certStatus === 'success'
      ? `<span style="background:rgba(0,212,255,0.1);color:var(--cyan);border:1px solid rgba(0,212,255,0.2);padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600">Generated</span>`
      : `<span style="background:var(--red-dim);color:var(--red);border:1px solid rgba(244,63,94,0.2);padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600">Failed</span>`;
    const mb = r.mailStatus === 'sent'
      ? `<span style="background:rgba(124,58,237,0.1);color:#a78bfa;border:1px solid rgba(124,58,237,0.2);padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600">Sent</span>`
      : r.mailStatus === 'skipped'
      ? `<span style="background:rgba(255,255,255,0.05);color:var(--text-3);border:1px solid var(--glass-border);padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600">Skipped</span>`
      : `<span style="background:var(--red-dim);color:var(--red);border:1px solid rgba(244,63,94,0.2);padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:600">Failed</span>`;
    const certCell = r.certLink
      ? `<a href="${r.certLink}" target="_blank" style="color:var(--cyan);font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${r.certLink}</a>`
      : `<span style="color:var(--text-3);font-size:12.5px">—</span>`;
    const actions = r.certLink
      ? `<div style="display:flex;gap:5px">
          <button class="ic-btn" onclick="copyToClipboard('${r.certLink}','Link')" title="Copy link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <a href="${r.certLink}" target="_blank" class="ic-btn" title="Open PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
        </div>`
      : '';
    return `<tr data-name="${r.name}" data-email="${r.email||''}">
      <td style="font-weight:600">${r.name}</td>
      <td style="color:var(--text-2)">${r.email||'—'}</td>
      <td>${certCell}</td>
      <td style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">${cb}${mb}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

function filterRT() {
  const q = document.getElementById('resultSearch').value.toLowerCase();
  document.querySelectorAll('#resultTbody tr').forEach(tr => {
    tr.style.display = (!q || tr.dataset.name.toLowerCase().includes(q) || (tr.dataset.email||'').toLowerCase().includes(q)) ? '' : 'none';
  });
}

function downloadReport() {
  downloadCSV(CP.results.map(r => ({
    Name: r.name, Email: r.email||'',
    'Cert Status': r.certStatus, 'Email Status': r.mailStatus,
    'Certificate Link': r.certLink||'', Error: r.error||'',
  })), `certiflow-pipeline-${Date.now()}.csv`);
}

function saveCampaignHistory(rec) {
  const h = JSON.parse(localStorage.getItem('cf_campaigns') || '[]');
  h.unshift(rec);
  if (h.length > 100) h.pop();
  localStorage.setItem('cf_campaigns', JSON.stringify(h));
}

function resetAll() {
  if (!confirm('Start a new campaign? Current results will be cleared.')) return;
  CP.rows = []; CP.results = []; CP.headers = []; CP.customMappings = []; CP.sheetId = null;
  ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null; ED.ready = false;
  ['cpName','sheetId','emailSubject','emailTemplate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['sheetLoadedMsg','fileLoadedMsg'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('customMappings').innerHTML = '';
  CP.customMappings = [];
  goStep(1, true);
}