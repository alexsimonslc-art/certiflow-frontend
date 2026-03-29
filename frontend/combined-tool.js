/* ================================================================
   Honourix — Combined Pipeline
   combined-tool.js
================================================================ */

/* ── App State ─────────────────────────────────────────────────── */
const CP = {
  step: 1,
  srcType: 'sheets',
  headers: [],
  rows: [],        // [{Name:'', Email:'', ...}]
  sheetId: null,
  customMappings: [],  // [{col:'', ph:''}]
  results: [],
};

const STEPS = [
  'Data & Campaign',
  'Certificate Design',
  'Field Mapping',
  'Email Template',
  'Review & Launch',
  'Results',
];

/* ── Canvas State ─────────────────────────────────────────────── */
let _canvas, _ctx, _overlay;
const ED = {
  w: 1122, h: 794,
  bgImg: null, bgBase64: null, bgColor: '#ffffff',
  fields: [], selId: null, scale: 1,
};

/* ════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  requireAuth(); 
  document.getElementById('sidebarMount').outerHTML = renderSidebar('combined-tool.html');
  initSidebar();
  buildStepper();
  initCanvas();
  loadSavedTemplate();
  lucide.createIcons();

  // Drag-drop on upload zone
  const dz = document.getElementById('cpUploadZone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dz-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dz-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dz-over'); handleFileUpload({ target: { files: e.dataTransfer.files } }); });
  }
});

/* ── Stepper ─────────────────────────────────────────────────── */
function buildStepper() {
  const el = document.getElementById('stepper');
  el.innerHTML = STEPS.map((label, i) => {
    const n = i + 1;
    const isFirst = n === 1;
    return `${!isFirst ? '<div class="step-connector" id="sc' + n + '"></div>' : ''}
    <div class="step-node ${isFirst ? 'active' : ''}" id="sn${n}">
      <div class="step-circle" id="scircle${n}">${n}</div>
      <div class="step-label">
        <div class="step-num-label">Step ${n}</div>
        <div class="step-title">${label}</div>
      </div>
    </div>`;
  }).join('');
}

function updateStepper() {
  STEPS.forEach((_, i) => {
    const n = i + 1;
    const node   = document.getElementById(`sn${n}`);
    const circle = document.getElementById(`scircle${n}`);
    const conn   = document.getElementById(`sc${n}`);
    if (!node) return;
    node.className = `step-node ${n < CP.step ? 'done' : n === CP.step ? 'active' : ''}`;
    circle.innerHTML = n < CP.step
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      : String(n);
    if (conn) conn.className = `step-connector ${n <= CP.step ? 'done' : ''}`;
  });
  // Update pipeline banner stages
  [1,2,3,4,5].forEach(n => {
    const stage = document.getElementById(`ps${n}`);
    if (!stage) return;
    stage.classList.toggle('active-stage', n === CP.step);
    stage.classList.toggle('done-stage', n < CP.step);
  });
}

/* ── Navigation ─────────────────────────────────────────────── */
function goStep(n, force = false) {
  if (!force && !validateStep(CP.step)) return;
  CP.step = n;
  updateStepper();
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`sp${n}`).classList.add('active');
  if (n === 2) setTimeout(resizeCanvas, 80);
  if (n === 3) buildStep3();
  if (n === 4) buildEmailMergeTags();
  if (n === 5) buildReview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(n) {
  if (n === 1) {
    if (!document.getElementById('cpName').value.trim()) { toast('Enter a campaign name', 'error'); return false; }
    if (CP.rows.length === 0) { toast('Load participant data first', 'error'); return false; }
  }
  if (n === 2) {
    if (ED.fields.length === 0) { toast('Add at least one text field to your certificate template', 'warning'); return false; }
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
   STEP 1 — DATA SOURCE
════════════════════════════════════════════════════════════════ */
function switchDataSrc(type) {
  CP.srcType = type;
  document.getElementById('panelSheets').style.display  = type === 'sheets' ? 'block' : 'none';
  document.getElementById('panelFile').style.display    = type === 'file'   ? 'block' : 'none';
  document.getElementById('srcSheetsBtn').className     = 'src-opt' + (type === 'sheets' ? ' active' : '');
  document.getElementById('srcFileBtn').className       = 'src-opt' + (type === 'file'   ? ' active' : '');
}

async function loadSheetData() {
  const id  = document.getElementById('sheetId').value.trim();
  if (!id) { toast('Paste your Sheet ID', 'error'); return; }
  const btn = document.getElementById('loadSheetBtn');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = await apiFetch(`/api/sheets/read?sheetId=${encodeURIComponent(id)}&range=Sheet1`);
    if (!data?.data?.length || data.data.length < 2) { toast('Sheet is empty or could not be read', 'warning'); return; }
    CP.headers = data.data[0].map(h => h.toString().trim());
    CP.rows    = data.data.slice(1).map(row => Object.fromEntries(CP.headers.map((h, i) => [h, row[i] || ''])));
    CP.sheetId = id;
    showDataLoaded('sheetLoadedMsg', `${CP.rows.length} participants, ${CP.headers.length} columns`);
    toast(`Loaded ${CP.rows.length} participants`, 'success');
  } catch (e) { toast('Failed to load Sheet: ' + e.message, 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: r => {
      CP.headers = r.meta.fields; CP.rows = r.data; CP.sheetId = null;
      showDataLoaded('fileLoadedMsg', `${CP.rows.length} rows from ${file.name}`);
      toast(`Loaded ${CP.rows.length} participants`, 'success');
    }});
  } else if (['xlsx','xls'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = e => {
      const wb  = XLSX.read(e.target.result, { type: 'array' });
      const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      CP.headers = Object.keys(arr[0] || {}); CP.rows = arr; CP.sheetId = null;
      showDataLoaded('fileLoadedMsg', `${CP.rows.length} rows from ${file.name}`);
      toast(`Loaded ${CP.rows.length} participants`, 'success');
    };
    reader.readAsArrayBuffer(file);
  } else { toast('Use .csv, .xlsx or .xls', 'error'); }
}

function showDataLoaded(elId, msg) {
  const el = document.getElementById(elId);
  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;font-size:14px;color:var(--text)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    <span><strong style="color:#34d399">Data loaded</strong> — ${msg}</span>
  </div>`;
  el.style.display = 'block';
}

/* ════════════════════════════════════════════════════════════════
   STEP 2 — CANVAS EDITOR
════════════════════════════════════════════════════════════════ */
function initCanvas() {
  _canvas  = document.getElementById('certCanvas');
  _ctx     = _canvas.getContext('2d');
  _overlay = document.getElementById('fieldOverlay');
  resizeCanvas();
  window.addEventListener('resize', () => { if (CP.step === 2) resizeCanvas(); });
}

function resizeCanvas() {
  const wrap = document.getElementById('canvasZone');
  if (!wrap || !_canvas) return;
  const maxW = wrap.clientWidth  - 40;
  const maxH = wrap.clientHeight - 40;
  ED.scale = Math.min(maxW / ED.w, maxH / ED.h, 1);
  const cw = Math.round(ED.w * ED.scale);
  const ch = Math.round(ED.h * ED.scale);
  const cont = document.getElementById('cContainer');
  if (cont) { cont.style.width = cw + 'px'; cont.style.height = ch + 'px'; }
  _canvas.width  = cw;
  _canvas.height = ch;
  redrawCanvas();
}

function redrawCanvas() {
  if (!_ctx) return;
  const w = _canvas.width, h = _canvas.height;
  _ctx.clearRect(0, 0, w, h);
  if (ED.bgImg) { _ctx.drawImage(ED.bgImg, 0, 0, w, h); }
  else { _ctx.fillStyle = ED.bgColor; _ctx.fillRect(0, 0, w, h); }
  renderFieldHandles();
}

function renderFieldHandles() {
  if (!_overlay) return;
  _overlay.innerHTML = '';
  ED.fields.forEach(f => {
    const x  = (f.x / 100) * _canvas.width;
    const y  = (f.y / 100) * _canvas.height;
    const w  = (f.width / 100) * _canvas.width;
    const fs = f.fontSize * ED.scale;
    const bold = (f.fontFamily || '').toLowerCase().includes('bold');

    const el = document.createElement('div');
    el.className = 'tf-handle' + (f.id === ED.selId ? ' sel' : '');
    el.style.cssText = `left:${x}px;top:${y}px;font-size:${fs}px;font-family:${f.fontFamily||'Helvetica'},sans-serif;color:${f.color||'#000'};font-weight:${bold?700:400};text-align:${f.align||'left'};width:${w}px;line-height:1.2;`;
    el.textContent = f.previewText || f.placeholder;

    const del = document.createElement('div');
    del.className = 'tf-del';
    del.textContent = '×';
    del.onclick = e => { e.stopPropagation(); deleteField(f.id); };
    el.appendChild(del);

    el.addEventListener('mousedown', e => { e.stopPropagation(); selectField(f.id); startDrag(e, f, el); });
    _overlay.appendChild(el);
  });
  renderChipList();
}

function startDrag(e, field, el) {
  const sx = e.clientX, sy = e.clientY, sfx = field.x, sfy = field.y;
  const mm = ev => {
    field.x = Math.max(0, Math.min(95, sfx + ((ev.clientX - sx) / _canvas.width)  * 100));
    field.y = Math.max(0, Math.min(95, sfy + ((ev.clientY - sy) / _canvas.height) * 100));
    el.style.left = (field.x / 100 * _canvas.width)  + 'px';
    el.style.top  = (field.y / 100 * _canvas.height) + 'px';
    if (field.id === ED.selId) {
      const px = document.getElementById('pX'), py = document.getElementById('pY');
      if (px) px.value = field.x.toFixed(1);
      if (py) py.value = field.y.toFixed(1);
    }
  };
  const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

/* ── Add Field ─────────────────────────────────────────────────── */
function openAFModal()  { document.getElementById('afOverlay').classList.add('open'); }
function closeAFModal() { document.getElementById('afOverlay').classList.remove('open'); }

function addCanvasField() {
  let ph = document.getElementById('afPh').value;
  if (ph === 'custom') {
    const c = document.getElementById('afCustom').value.trim();
    if (!c) { toast('Enter a custom placeholder', 'error'); return; }
    ph = '{{' + c.replace(/[{}]/g, '') + '}}';
  }
  const previews = { '{{name}}':'John Smith','{{course}}':'Web Development','{{date}}':'March 2026','{{score}}':'95%','{{email}}':'john@example.com','{{org}}':'NIT Trichy' };
  const field = {
    id: 'f_' + Date.now(),
    placeholder: ph,
    previewText: document.getElementById('afPreview').value.trim() || previews[ph] || ph.replace(/[{}]/g,''),
    x: 10, y: 32 + ED.fields.length * 14,
    width: 80, fontSize: parseInt(document.getElementById('afSize').value) || 36,
    fontFamily: 'Helvetica', color: '#1a1a1a', align: 'center',
  };
  ED.fields.push(field);
  closeAFModal();
  selectField(field.id);
  toast(`Added ${ph} field`, 'success', 1800);
}

/* ── Select / Delete ─────────────────────────────────────────── */
function selectField(id) {
  ED.selId = id;
  const f = ED.fields.find(f => f.id === id);
  if (!f) return;
  switchEPTab('props');
  document.getElementById('propsEmpty').style.display = 'none';
  document.getElementById('propsForm').style.display  = 'flex';
  document.getElementById('pPh').value   = f.placeholder;
  document.getElementById('pPrev').value = f.previewText || '';
  document.getElementById('pFont').value = f.fontFamily;
  document.getElementById('pSize').value = f.fontSize;
  document.getElementById('pColor').value = f.color;
  document.getElementById('pColorHex').textContent = f.color;
  document.getElementById('pX').value = f.x.toFixed(1);
  document.getElementById('pY').value = f.y.toFixed(1);
  document.getElementById('pW').value = f.width;
  ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('active'));
  document.getElementById(f.align === 'center' ? 'alC' : f.align === 'right' ? 'alR' : 'alL').classList.add('active');
  renderFieldHandles();
}

function deleteField(id) {
  ED.fields = ED.fields.filter(f => f.id !== id);
  if (ED.selId === id) {
    ED.selId = null;
    const pe = document.getElementById('propsEmpty'), pf = document.getElementById('propsForm');
    if (pe) pe.style.display = ''; if (pf) pf.style.display = 'none';
  }
  renderFieldHandles();
}

function deleteSelField() { if (ED.selId) deleteField(ED.selId); }

function setFP(key, val) {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f[key] = val;
  if (key === 'color') document.getElementById('pColorHex').textContent = val;
  renderFieldHandles();
}

function setFPXY() {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f.x = parseFloat(document.getElementById('pX').value) || f.x;
  f.y = parseFloat(document.getElementById('pY').value) || f.y;
  renderFieldHandles();
}

function setAlign(a) {
  setFP('align', a);
  ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('active'));
  document.getElementById(a === 'center' ? 'alC' : a === 'right' ? 'alR' : 'alL').classList.add('active');
}

function switchEPTab(tab) {
  ['fields','props'].forEach(t => {
    document.getElementById(`epTab_${t}`).className  = 'ep-tab' + (t === tab ? ' active' : '');
    document.getElementById(`epPanel_${t}`).className = 'ep-panel' + (t === tab ? ' active' : '');
  });
}

function renderChipList() {
  const el = document.getElementById('fieldChipList');
  if (!el) return;
  if (!ED.fields.length) { el.innerHTML = '<div style="text-align:center;padding:28px 12px;color:var(--text-3);font-size:13px">No fields yet.<br/><span style="color:var(--cyan)">Click "+ Add Field"</span> to start.</div>'; return; }
  el.innerHTML = ED.fields.map(f => `
    <div class="field-chip ${f.id === ED.selId ? 'sel' : ''}" onclick="selectField('${f.id}')">
      <div class="fc-dot" style="background:${f.color}"></div>
      <span class="fc-label">${f.previewText || f.placeholder}</span>
      <span class="fc-tag">${f.placeholder}</span>
    </div>`).join('');
}

/* ── Background ──────────────────────────────────────────────── */
function uploadBG(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => { ED.bgImg = img; ED.bgBase64 = ev.target.result; redrawCanvas(); toast('Background uploaded', 'success', 2000); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function changeBGColor() { ED.bgColor = document.getElementById('bgColor').value; if (!ED.bgImg) redrawCanvas(); }
function clearBG() { ED.bgImg = null; ED.bgBase64 = null; document.getElementById('bgUpload').value = ''; redrawCanvas(); toast('Background cleared', 'info', 1800); }
function changeSize() {
  const [w, h] = document.getElementById('canvasSize').value.split(',').map(Number);
  ED.w = w; ED.h = h; resizeCanvas();
}
function clearCanvas() {
  ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null;
  const pe = document.getElementById('propsEmpty'), pf = document.getElementById('propsForm');
  if (pe) pe.style.display = ''; if (pf) pf.style.display = 'none';
  redrawCanvas(); toast('Canvas cleared', 'info', 1800);
}

function saveTemplate() {
  localStorage.setItem('cf_template', JSON.stringify({ w: ED.w, h: ED.h, bgColor: ED.bgColor, bgBase64: ED.bgBase64, fields: ED.fields }));
}

function loadSavedTemplate() {
  const raw = localStorage.getItem('cf_template');
  if (!raw) return;
  try {
    const t = JSON.parse(raw);
    ED.w = t.w || 1122; ED.h = t.h || 794;
    ED.bgColor = t.bgColor || '#ffffff'; ED.fields = t.fields || [];
    if (t.bgBase64) { const img = new Image(); img.onload = () => { ED.bgImg = img; redrawCanvas(); }; img.src = t.bgBase64; ED.bgBase64 = t.bgBase64; }
    resizeCanvas();
    if (t.fields?.length) toast('Previous template restored', 'info', 2200);
  } catch {}
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

  // Refresh custom mapping selects
  document.querySelectorAll('.cp-col-sel').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">Sheet column…</option>${opts}`;
    if (cur) sel.value = cur;
  });

  // Columns list
  document.getElementById('colList').innerHTML = CP.headers.map(h =>
    `<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid var(--glass-border)">
      <span style="width:6px;height:6px;background:var(--cyan);border-radius:50%;flex-shrink:0"></span>
      <span style="font-size:14px;color:var(--text);font-weight:500">${h}</span>
    </div>`).join('');

  // Detected template tags
  const tags = ED.fields.map(f => f.placeholder).join(', ');
  const el = document.getElementById('detectedFields');
  if (el) el.textContent = tags || 'none';
}

function addFMapping() {
  const idx = CP.customMappings.length;
  CP.customMappings.push({ col: '', ph: '' });
  const opts    = CP.headers.map(h => `<option value="${h}">${h}</option>`).join('');
  const tagOpts = ED.fields.map(f => `<option value="${f.placeholder.replace(/[{}]/g,'')}">${f.placeholder}</option>`).join('');
  const container = document.getElementById('customMappings');
  const row = document.createElement('div');
  row.className = 'fm-row';
  row.dataset.idx = idx;
  row.innerHTML = `
    <select class="form-select cp-col-sel" onchange="CP.customMappings[${idx}].col=this.value">
      <option value="">Sheet column…</option>${opts}
    </select>
    <svg class="fm-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    <select class="form-select cp-col-sel" onchange="CP.customMappings[${idx}].ph=this.value">
      <option value="">Template tag…</option>${tagOpts}
    </select>
    <button class="fm-del" onclick="removeMapping(${idx},this.closest('.fm-row'))">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  container.appendChild(row);
  document.getElementById('noMappingsNote').style.display = 'none';
}

function removeMapping(idx, rowEl) {
  CP.customMappings.splice(idx, 1);
  if (rowEl) rowEl.remove();
  if (!CP.customMappings.length) document.getElementById('noMappingsNote').style.display = 'flex';
}

function getFullMappings() {
  return {
    name:  document.getElementById('mapName').value,
    email: document.getElementById('mapEmail').value,
    ...Object.fromEntries(CP.customMappings.filter(m => m.col && m.ph).map(m => [m.ph, m.col])),
  };
}

/* ════════════════════════════════════════════════════════════════
   STEP 4 — EMAIL TEMPLATE
════════════════════════════════════════════════════════════════ */
function buildEmailMergeTags() {
  const mappings = getFullMappings();
  const tags = ['{{name}}', '{{email}}', '{{cert_link}}',
    ...Object.keys(mappings).filter(k => !['name','email'].includes(k)).map(k => `{{${k}}}`)
  ];
  document.getElementById('emailMergeTags').innerHTML = tags.map(t =>
    `<span class="mtag" onclick="insertETag('${t}')">${t}</span>`).join('');
  refreshEmailPreview();
}

function insertETag(tag) {
  const ta = document.getElementById('emailTemplate');
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + tag + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + tag.length;
  ta.focus();
  refreshEmailPreview();
}

function setETab(tab) {
  const isHTML = tab === 'html';
  document.getElementById('emailHTMLPane').style.display = isHTML ? 'block' : 'none';
  document.getElementById('emailPrevPane').style.display = isHTML ? 'none'  : 'block';
  document.getElementById('etabHTML').className = 'e-tab' + (isHTML  ? ' active' : '');
  document.getElementById('etabPrev').className = 'e-tab' + (!isHTML ? ' active' : '');
  if (!isHTML) refreshEmailPreview();
}

function refreshEmailPreview() {
  if (!CP.rows.length) return;
  const row      = CP.rows[0];
  const mappings = getFullMappings();
  const name     = row[mappings.name]  || '—';
  const email    = row[mappings.email] || '—';
  const subj     = personalizeText(document.getElementById('emailSubject').value, row, mappings, '');
  const body     = personalizeText(document.getElementById('emailTemplate').value, row, mappings, '');
  const eTo = document.getElementById('eprvTo'), eSubj = document.getElementById('eprvSubject'), eBody = document.getElementById('eprvBody');
  if (eTo)   eTo.textContent   = `${name} <${email}>`;
  if (eSubj) eSubj.textContent = subj;
  if (eBody) eBody.innerHTML   = body;
}

document.addEventListener('input', e => {
  if (e.target?.id === 'emailTemplate' || e.target?.id === 'emailSubject') refreshEmailPreview();
});

function personalizeText(tmpl, row, mappings, certLink) {
  let out = tmpl;
  out = out.replace(/\{\{name\}\}/gi,      row[mappings.name]  || '');
  out = out.replace(/\{\{email\}\}/gi,     row[mappings.email] || '');
  out = out.replace(/\{\{cert_link\}\}/gi, certLink);
  Object.entries(mappings).forEach(([ph, col]) => {
    out = out.replace(new RegExp(`\\{\\{${ph}\\}\\}`, 'gi'), row[col] || '');
  });
  return out;
}

function loadEmailSample() {
  const mappings = getFullMappings();
  const nameTag = Object.keys(mappings).includes('name') ? '{{name}}' : '{{name}}';
  document.getElementById('emailTemplate').value = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif">
  <div style="max-width:580px;margin:40px auto">
    <div style="background:linear-gradient(135deg,#04080f,#0d1728);padding:36px;border-radius:16px 16px 0 0;text-align:center">
      <div style="font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(0,212,255,0.7);text-transform:uppercase;margin-bottom:8px">Honourix</div>
      <h1 style="color:#f0f6ff;font-size:22px;font-weight:800;margin:0;letter-spacing:-0.5px">Your Certificate is Ready</h1>
    </div>
    <div style="background:#ffffff;padding:36px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <p style="font-size:17px;color:#1a2a3a;margin-bottom:18px">Dear <strong>${nameTag}</strong>,</p>
      <p style="color:#3d5a72;font-size:15px;line-height:1.75;margin-bottom:22px">
        Congratulations on completing the course. Your personalised certificate has been generated and is ready to view and download.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="{{cert_link}}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px">
          View Certificate →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12.5px;margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;line-height:1.6">
        This email was sent via Honourix — Automated Certificate & Email Platform.
      </p>
    </div>
  </div>
</body>
</html>`;
  toast('Sample template loaded', 'success');
  refreshEmailPreview();
}

/* ════════════════════════════════════════════════════════════════
   STEP 5 — REVIEW
════════════════════════════════════════════════════════════════ */
function buildReview() {
  const count    = CP.rows.length;
  const mappings = getFullMappings();
  const campName = document.getElementById('cpName').value;

  document.getElementById('rvParticipants').textContent = count;
  document.getElementById('rvCerts').textContent        = count;
  document.getElementById('rvEmails').textContent       = count;

  const details = [
    { k: 'Campaign', v: campName },
    { k: 'Participants', v: `${count}` },
    { k: 'Data Source', v: CP.sheetId ? `Google Sheet (${CP.sheetId.slice(0,16)}…)` : 'Uploaded file' },
    { k: 'Name Column', v: mappings.name },
    { k: 'Email Column', v: mappings.email },
    { k: 'Custom Mappings', v: CP.customMappings.filter(m => m.col && m.ph).length + ' field(s)' },
    { k: 'Certificate Fields', v: `${ED.fields.length} field(s) on canvas` },
    { k: 'Canvas Size', v: `${ED.w}×${ED.h}px` },
    { k: 'Email Subject', v: document.getElementById('emailSubject').value },
    { k: 'Write Links to Sheet', v: document.getElementById('writeBackToggle').classList.contains('on') ? 'Yes' : 'No' },
  ];

  document.getElementById('reviewDetailsEl').innerHTML = details.map(d =>
    `<div class="review-detail-row">
      <span class="review-key">${d.k}</span>
      <span class="review-val ${['Data Source','Email Subject'].includes(d.k) ? 'mono' : ''}">${d.v}</span>
    </div>`).join('');

  // Job info panel for step 6
  document.getElementById('runJobInfo').innerHTML = [
    { k: 'Campaign', v: campName }, { k: 'Participants', v: count }
  ].map(d => `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:5px 0;border-bottom:1px solid var(--glass-border)"><span style="color:var(--text-2)">${d.k}</span><strong style="color:var(--text)">${d.v}</strong></div>`).join('');
}

/* ════════════════════════════════════════════════════════════════
   STEP 6 — PIPELINE EXECUTION
════════════════════════════════════════════════════════════════ */
async function launchPipeline() {
  const btn = document.getElementById('launchBtn');
  btn.disabled = true; btn.style.opacity = '0.6';
  goStep(6, true);

  const mappings  = getFullMappings();
  const subject   = document.getElementById('emailSubject').value;
  const htmlTmpl  = document.getElementById('emailTemplate').value;
  const campName  = document.getElementById('cpName').value;
  const writeBack = document.getElementById('writeBackToggle').classList.contains('on');
  const total     = CP.rows.length;

  let certsDone = 0, mailsDone = 0, failed = 0;
  CP.results = [];

  setProgress(0, total, 'Generating certificates…');
  llLog('info', `Starting pipeline: ${campName} — ${total} participants`);

  for (let i = 0; i < CP.rows.length; i++) {
    const row   = CP.rows[i];
    const name  = row[mappings.name]  || `Person ${i + 1}`;
    const email = row[mappings.email] || '';

    setProgress(i, total, `Processing: ${name} (${i + 1}/${total})`);

    let certLink = '', certOK = false, mailOK = false, errMsg = '';

    // ── A: Generate certificate ──────────────────────────────
    try {
      const payload = {
        campaignName: campName,
        template: {
          width: ED.w, height: ED.h,
          bgColor: ED.bgColor,
          backgroundBase64: ED.bgBase64 || null,
          fields: ED.fields,
        },
        participants: [buildParticipantRow(row, mappings)],
        nameCol:  mappings.name,
        emailCol: mappings.email,
        sheetId:  writeBack ? CP.sheetId : null,
        writeBack,
        rowOffset: i,
      };

      const certRes = await apiFetch('/api/certificates/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (certRes?.results?.[0]?.status === 'success') {
        certLink = certRes.results[0].link || '';
        certOK   = true;
        certsDone++;
        llLog('cert', `PDF saved: ${name}`);
      } else {
        errMsg = certRes?.results?.[0]?.error || 'Generation failed';
        throw new Error(errMsg);
      }
    } catch (e) {
      failed++;
      llLog('err', `Cert failed for ${name}: ${e.message}`);
      CP.results.push({ name, email, certLink: '', certStatus: 'failed', mailStatus: 'skipped', error: e.message });
      setProgress(i + 1, total, `${name} — cert failed, skipping email`);
      continue;
    }

    // ── B: Send email ────────────────────────────────────────
    try {
      const personalHtml = personalizeText(htmlTmpl, row, mappings, certLink);
      const personSubj   = personalizeText(subject,  row, mappings, certLink);

      await apiFetch('/api/mail/send-one', {
        method: 'POST',
        body: JSON.stringify({ to: email, subject: personSubj, html: personalHtml }),
      });
      mailOK = true;
      mailsDone++;
      llLog('mail', `Email sent → ${email}`);
    } catch (e) {
      failed++;
      llLog('err', `Email failed for ${name}: ${e.message}`);
    }

    CP.results.push({ name, email, certLink, certStatus: certOK ? 'success' : 'failed', mailStatus: mailOK ? 'sent' : 'failed' });
    setProgress(i + 1, total, `Processed ${i + 1} of ${total}…`);
    updateRunCounts(certsDone, mailsDone, failed);
  }

  // ── Save to campaign history ─────────────────────────────
  saveCampaignRecord({
    name: campName, type: 'combined',
    date: new Date().toISOString(),
    total, success: certsDone, failed,
  });

  setTimeout(() => showDoneState(certsDone, mailsDone, failed, total), 700);
}

function buildParticipantRow(row, mappings) {
  const obj = { ...row };
  // Ensure standard key names work
  Object.entries(mappings).forEach(([ph, col]) => { obj[ph] = row[col] || ''; });
  return obj;
}

function setProgress(done, total, status) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('runPct').textContent      = pct + '%';
  document.getElementById('runFraction').textContent = `${done} / ${total}`;
  document.getElementById('runStatus').textContent   = status;
  document.getElementById('runBar').style.width      = pct + '%';
  const r = 50; const circ = 2 * Math.PI * r;
  const ringEl = document.getElementById('ringCircle');
  if (ringEl) ringEl.style.strokeDashoffset = circ - (circ * pct / 100);
}

function updateRunCounts(certs, mails, failed) {
  const ec = document.getElementById('runCertsDone');
  const em = document.getElementById('runMailsDone');
  const ef = document.getElementById('runFailed');
  if (ec) ec.textContent = certs;
  if (em) em.textContent = mails;
  if (ef) ef.textContent = failed;
}

function llLog(type, msg) {
  const win = document.getElementById('liveLog');
  if (!win) return;
  const ts  = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el  = document.createElement('div');
  el.className = 'll-row';
  el.innerHTML = `<span class="ll-ts">${ts}</span><span class="ll-${type}">${msg}</span>`;
  win.appendChild(el);
  win.scrollTop = win.scrollHeight;
}

function showDoneState(certs, mails, failed, total) {
  document.getElementById('runningState').style.display = 'none';
  document.getElementById('doneState').style.display    = 'block';
  document.getElementById('dCerts').textContent  = certs;
  document.getElementById('dEmails').textContent = mails;
  document.getElementById('dFailed').textContent = failed;

  const allOK = failed === 0;
  document.getElementById('doneTitle').textContent = allOK ? 'Pipeline Complete!' : `${certs} certs, ${mails} emails — ${failed} failed`;
  document.getElementById('doneSub').textContent   = `Certificates in your Drive · Emails dispatched from your Gmail.`;
  if (!allOK) {
    const ring = document.getElementById('doneRing');
    if (ring) { ring.style.background = 'linear-gradient(135deg,#f59e0b,#ef4444)'; ring.style.boxShadow = '0 0 48px rgba(245,158,11,0.35)'; }
  }

  renderResultTable(CP.results);
  toast(`Pipeline done — ${certs} certs, ${mails} emails`, 'success', 6000);
}

function renderResultTable(results) {
  const tbody = document.getElementById('resultTbody');
  if (!tbody) return;
  tbody.innerHTML = results.map(r => {
    const certBadge = r.certStatus === 'success'
      ? '<span style="background:rgba(0,212,255,0.1);color:var(--cyan);border:1px solid rgba(0,212,255,0.2);padding:3px 9px;border-radius:99px;font-size:12px;font-weight:600">Generated</span>'
      : '<span style="background:rgba(244,63,94,0.1);color:#f43f5e;border:1px solid rgba(244,63,94,0.2);padding:3px 9px;border-radius:99px;font-size:12px;font-weight:600">Failed</span>';
    const mailBadge = r.mailStatus === 'sent'
      ? '<span style="background:rgba(124,58,237,0.1);color:#a78bfa;border:1px solid rgba(124,58,237,0.2);padding:3px 9px;border-radius:99px;font-size:12px;font-weight:600">Sent</span>'
      : r.mailStatus === 'skipped'
      ? '<span style="background:rgba(255,255,255,0.05);color:var(--text-3);border:1px solid var(--glass-border);padding:3px 9px;border-radius:99px;font-size:12px;font-weight:600">Skipped</span>'
      : '<span style="background:rgba(244,63,94,0.1);color:#f43f5e;border:1px solid rgba(244,63,94,0.2);padding:3px 9px;border-radius:99px;font-size:12px;font-weight:600">Failed</span>';
    const certCell = r.certLink
      ? `<a href="${r.certLink}" target="_blank" style="color:var(--cyan);font-size:13px;max-width:220px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.certLink}</a>`
      : '<span style="color:var(--text-3);font-size:13px">—</span>';
    const actions = r.certLink ? `
      <div style="display:flex;gap:6px">
        <button class="icon-btn" onclick="copyToClipboard('${r.certLink}','Link')" title="Copy link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <a href="${r.certLink}" target="_blank" class="icon-btn" title="Open">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      </div>` : '';
    return `<tr data-name="${r.name}" data-email="${r.email||''}">
      <td>${r.name}</td><td style="color:var(--text-2)">${r.email||'—'}</td>
      <td>${certCell}</td><td>${certBadge} ${mailBadge}</td><td>${actions}</td>
    </tr>`;
  }).join('');
}

function filterResultTable() {
  const q = document.getElementById('resultSearch').value.toLowerCase();
  document.querySelectorAll('#resultTbody tr').forEach(tr => {
    const match = !q || tr.dataset.name.toLowerCase().includes(q) || (tr.dataset.email||'').toLowerCase().includes(q);
    tr.style.display = match ? '' : 'none';
  });
}

function downloadFullReport() {
  downloadCSV(CP.results.map(r => ({
    Name: r.name, Email: r.email||'',
    'Cert Status': r.certStatus, 'Email Status': r.mailStatus,
    'Certificate Link': r.certLink||'', Error: r.error||'',
  })), `Honourix-pipeline-${Date.now()}.csv`);
}

/* ── Save campaign to history ─────────────────────────────────── */
function saveCampaignRecord(record) {
  const history = JSON.parse(localStorage.getItem('cf_campaigns') || '[]');
  history.unshift(record);
  if (history.length > 100) history.pop();
  localStorage.setItem('cf_campaigns', JSON.stringify(history));
}

function resetAll() {
  if (!confirm('Start a new campaign? Current results will be cleared.')) return;
  CP.rows = []; CP.results = []; CP.headers = []; CP.customMappings = []; CP.sheetId = null;
  document.getElementById('cpName').value    = '';
  document.getElementById('sheetId').value  = '';
  document.getElementById('emailSubject').value  = '';
  document.getElementById('emailTemplate').value = '';
  document.getElementById('sheetLoadedMsg').style.display = 'none';
  document.getElementById('fileLoadedMsg').style.display  = 'none';
  ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null;
  document.getElementById('customMappings').innerHTML = '';
  CP.customMappings = [];
  goStep(1, true);
}