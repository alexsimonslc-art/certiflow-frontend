/* ================================================================
   Honourix — Combined Pipeline  |  combined-tool.js
   7-Step: Data → Cert Design → Field Map → Preview → Email → Review → Results
================================================================ */

/* ── Global State ──────────────────────────────────────────────── */
const CP = {
  step: 1,
  srcType: 'sheets',
  headers: [],
  rows: [],
  sheetId: null,
  campaignName: '',
  manualColumns: ['Name', 'Email'],
  manualRows: [{ Name: '', Email: '' }],
  previewIdx: 0,
  results: [],
  fieldMappings: [],   // [{fieldId, col, isPrimary}]
  writebackEnabled: false,
};

const STEPS = [
  'Data Source',
  'Design Certificate',
  'Field Mapping',
  'Certificate Preview',
  'Email Template',
  'Review & Launch',
  'Results'
];

/* ── Canvas / Editor state ─────────────────────────────────────── */
let _canvas, _ctx, _overlay, _ovCtx;
const ED = {
  w: 1122, h: 794,
  bgImg: null, bgBase64: null, bgColor: '#ffffff',
  fields: [],
  selId: null,
  scale: 1,
  zoom: 0.7,
  ctrlMode: 'move',   // 'move' | 'rotate'
  drag: null,
  resize: null,
  ready: false,
};

/* ── Email Editor state ────────────────────────────────────────── */
const ME = {
  blocks: [],
  selectedId: null,
  nextId: 1,
  activeTab: 'visual',
  cm: null,
  cmDebounce: null,
  previewDevice: 'desktop',
  initialized: false,
  selectedTemplate: null,
};

let meLastFocusedField = null;

/* ════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof renderSidebar === 'function') {
    document.getElementById('sidebarMount').outerHTML = renderSidebar('combined-tool.html');
    if (typeof initSidebar === 'function') initSidebar();
  } else {
    document.getElementById('sidebarMount').innerHTML = '';
  }

  buildStepper();

  _canvas  = document.getElementById('certCanvas');
  _ctx     = _canvas.getContext('2d');
  _overlay = document.getElementById('fieldOverlay');
  _ovCtx   = _overlay.getContext('2d');

  resizeCanvas();
  loadSavedTemplate();
  meBuildTemplatePicker();
  cpManualRenderTable();
  fetchQuota();

  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Upload zone drag-and-drop
  const dz = document.getElementById('cpUploadZone');
  if (dz) {
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dz-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dz-over'));
    dz.addEventListener('drop',      e => {
      e.preventDefault(); dz.classList.remove('dz-over');
      handleFileUpload({ target: { files: e.dataTransfer.files } });
    });
  }

  // HX Form list
  loadHxFormList();
});

/* ════════════════════════════════════════════════════════════════
   STEPPER
════════════════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════════ */
function goStep(n, force = false) {
  if (!force && !validateStep(CP.step)) return;
  // Sync email code → blocks when leaving step 5
  if (CP.step === 5 && ME.activeTab === 'code') meSyncFromCode();

  CP.step = n;
  updateStepper();

  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`sp${n}`);
  if (target) target.classList.add('active');

  // Step-specific onEnter
  if (n === 3) populateStep3();
  if (n === 4) populateStep4();
  if (n === 5) populateStep5MergeTags();
  if (n === 6) populateStep6();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(n) {
  if (n === 1) {
    const name = document.getElementById('campaignName').value.trim();
    if (!name) { toast('Please enter a campaign name', 'warn'); return false; }
    if (!CP.rows.length) { toast('Please load participant data first', 'warn'); return false; }
    const nc = document.getElementById('colName').value;
    const ec = document.getElementById('colEmail').value;
    if (!nc || !ec) { toast('Please select Name and Email columns', 'warn'); return false; }
    CP.campaignName = name;
    return true;
  }
  if (n === 2) {
    if (!ED.fields.length) { toast('Add at least one text field to your certificate', 'warn'); return false; }
    return true;
  }
  if (n === 3) return true;
  if (n === 4) return true;
  if (n === 5) {
    if (!document.getElementById('meEditorWrap').classList.contains('visible')) {
      toast('Please select and open a template first', 'warn'); return false;
    }
    return true;
  }
  if (n === 6) {
    const subj = document.getElementById('mSubject').value.trim();
    if (!subj) { toast('Please enter an email subject line', 'warn'); return false; }
    return true;
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   STEP 1: DATA SOURCE
════════════════════════════════════════════════════════════════ */
function setSrc(type) {
  CP.srcType = type;
  ['sheets','file','manual','hxform'].forEach(t => {
    document.getElementById('src' + t.charAt(0).toUpperCase() + t.slice(1).replace('form','Form')).classList.toggle('active', t === type);
    const panelId = 'panel' + t.charAt(0).toUpperCase() + t.slice(1).replace('form','HxForm');
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = t === type ? 'block' : 'none';
  });
  // Fix panel IDs
  document.getElementById('panelSheets').style.display   = type === 'sheets'  ? 'block' : 'none';
  document.getElementById('panelFile').style.display     = type === 'file'    ? 'block' : 'none';
  document.getElementById('panelManual').style.display   = type === 'manual'  ? 'block' : 'none';
  document.getElementById('panelHxForm').style.display   = type === 'hxform'  ? 'block' : 'none';
}

/* ── Google Sheets ─────────────────────────────────────────────── */
async function loadSheetData() {
  const raw = document.getElementById('sheetUrl').value.trim();
  if (!raw) { toast('Paste a Google Sheets URL', 'warn'); return; }
  const id = extractSheetId(raw);
  if (!id) { toast('Could not parse Sheet ID from URL', 'error'); return; }
  CP.sheetId = id;
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  try {
    const res  = await fetch(url);
    const text = await res.text();
    parseCSV(text);
    showDataResult('sheetsResult', CP.rows.length);
    toast(`Loaded ${CP.rows.length} rows from Google Sheets`, 'success');
    showColMapCard();
    showWritebackCard();
  } catch (e) {
    toast('Failed to load sheet. Check sharing settings.', 'error');
    console.error(e);
  }
}

function extractSheetId(raw) {
  const m = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{30,}$/.test(raw)) return raw;
  return null;
}

/* ── File Upload ───────────────────────────────────────────────── */
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = ev => {
      parseCSV(ev.target.result);
      showDataResult('fileResult', CP.rows.length);
      toast(`Loaded ${CP.rows.length} rows from ${file.name}`, 'success');
      showColMapCard();
    };
    reader.readAsText(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    toast('Excel support requires SheetJS. Please export as CSV first.', 'warn');
  }
}

/* ── Manual Entry ──────────────────────────────────────────────── */
function cpManualRenderTable() {
  const hrow = document.getElementById('cpManualHeaderRow');
  const tbody = document.getElementById('cpManualBody');
  if (!hrow || !tbody) return;

  hrow.innerHTML = CP.manualColumns.map((col, ci) =>
    `<th style="padding:8px 6px;min-width:110px">
      <div style="display:flex;align-items:center;gap:4px">
        <input class="me-input" value="${col}" style="width:90px;font-size:11px;padding:4px 6px"
          onchange="cpManualRenameCol(${ci},this.value)"/>
        ${CP.manualColumns.length > 1
          ? `<button class="manual-col-del" onclick="cpManualDelCol(${ci})">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
             </button>`
          : ''}
      </div>
    </th>`
  ).join('') + '<th style="width:32px"></th>';

  tbody.innerHTML = CP.manualRows.map((row, ri) =>
    `<tr>${CP.manualColumns.map(col =>
      `<td><input value="${(row[col] || '').replace(/"/g, '&quot;')}"
        onchange="CP.manualRows[${ri}]['${col}']=this.value"
        placeholder="${col}…"/></td>`
    ).join('')}
    <td>
      <button class="manual-col-del" onclick="cpManualDelRow(${ri})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </td></tr>`
  ).join('');
}

function cpManualAddCol() {
  const name = `Column ${CP.manualColumns.length + 1}`;
  CP.manualColumns.push(name);
  CP.manualRows.forEach(r => r[name] = '');
  cpManualRenderTable();
}

function cpManualDelCol(ci) {
  const col = CP.manualColumns[ci];
  CP.manualColumns.splice(ci, 1);
  CP.manualRows.forEach(r => delete r[col]);
  cpManualRenderTable();
}

function cpManualRenameCol(ci, newName) {
  const old = CP.manualColumns[ci];
  CP.manualColumns[ci] = newName;
  CP.manualRows.forEach(r => { r[newName] = r[old] || ''; delete r[old]; });
}

function cpManualAddRow() {
  const row = {};
  CP.manualColumns.forEach(c => row[c] = '');
  CP.manualRows.push(row);
  cpManualRenderTable();
}

function cpManualDelRow(ri) {
  CP.manualRows.splice(ri, 1);
  if (!CP.manualRows.length) cpManualAddRow();
  else cpManualRenderTable();
}

function cpManualApply() {
  CP.headers = [...CP.manualColumns];
  CP.rows    = CP.manualRows.map(r => CP.manualColumns.map(c => r[c] || ''));
  const res  = document.getElementById('manualResult');
  res.style.display = 'block';
  res.innerHTML = renderDataBadge(CP.rows.length, CP.headers.length);
  toast(`Applied ${CP.rows.length} rows of manual data`, 'success');
  showColMapCard();
}

/* ── HX Form ───────────────────────────────────────────────────── */
async function loadHxFormList() {
  try {
    if (typeof supabase === 'undefined') return;
    const { data } = await supabase.from('hx_forms').select('id,form_name').order('created_at', { ascending: false });
    const sel = document.getElementById('hxFormSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select a form —</option>' +
      (data || []).map(f => `<option value="${f.id}">${f.form_name}</option>`).join('');
  } catch(e) { console.warn('HX Form list:', e); }
}

async function loadHxFormData(formId) {
  if (!formId) return;
  try {
    const { data } = await supabase
      .from('hx_responses')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: true });
    if (!data || !data.length) { toast('No responses found for this form', 'warn'); return; }
    CP.headers = Object.keys(data[0]).filter(k => !['id','form_id','created_at'].includes(k));
    CP.rows    = data.map(r => CP.headers.map(h => r[h] || ''));
    const res  = document.getElementById('hxFormResult');
    res.style.display = 'block';
    res.innerHTML = renderDataBadge(CP.rows.length, CP.headers.length);
    toast(`Loaded ${CP.rows.length} responses from HX Form`, 'success');
    showColMapCard();
  } catch(e) { toast('Failed to load HX Form data', 'error'); console.error(e); }
}

/* ── Helpers ───────────────────────────────────────────────────── */
function parseCSV(text) {
  const lines  = text.trim().split('\n').filter(l => l.trim());
  const parseRow = line => {
    const res = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { res.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    res.push(cur.trim());
    return res;
  };
  CP.headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g,''));
  CP.rows    = lines.slice(1).map(l => parseRow(l).map(v => v.replace(/^"|"$/g,'')));
}

function showColMapCard() {
  const card = document.getElementById('colMapCard');
  card.style.display = 'block';
  populateColDropdowns('colName', 'colEmail');
  populateAllTags();
}

function showWritebackCard() {
  const card = document.getElementById('s3WritebackCard');
  if (card) card.style.display = CP.srcType === 'sheets' ? 'block' : 'none';
}

function populateColDropdowns(nameId, emailId) {
  const opts = CP.headers.map(h => `<option value="${h}">${h}</option>`).join('');
  document.getElementById(nameId).innerHTML  = '<option value="">Select…</option>' + opts;
  document.getElementById(emailId).innerHTML = '<option value="">Select…</option>' + opts;
  // Auto-detect common column names
  const nc = CP.headers.find(h => /name/i.test(h));
  const ec = CP.headers.find(h => /email/i.test(h));
  if (nc) document.getElementById(nameId).value  = nc;
  if (ec) document.getElementById(emailId).value = ec;
}

function populateAllTags() {
  const wrap = document.getElementById('cpAllTags');
  if (!wrap) return;
  wrap.innerHTML = CP.headers.map(h =>
    `<span style="font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid rgba(0,212,255,0.2);background:rgba(0,212,255,0.07);color:#00d4ff;font-family:var(--font-mono)">{{${h}}}</span>`
  ).join('');
}

function showDataResult(id, count) {
  const el = document.getElementById(id);
  el.style.display = 'block';
  el.innerHTML = renderDataBadge(count, CP.headers.length);
}

function renderDataBadge(rows, cols) {
  return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px">
    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" style="width:18px;height:18px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
    <span style="font-size:13.5px;color:#e0f2f1;font-weight:600">${rows} participants · ${cols} columns loaded</span>
    <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.25);color:#10b981;font-size:11.5px;font-weight:700;margin-left:auto">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="20 6 9 17 4 12"/></svg>
      Ready
    </div>
  </div>`;
}

/* ── Quota Widget ──────────────────────────────────────────────── */
async function fetchQuota() {
  try {
    if (typeof supabase === 'undefined') return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    document.getElementById('acctLabel').textContent = user.email || 'Authenticated';
    document.getElementById('acctDot').style.background = '#10b981';
    const today = new Date().toISOString().slice(0,10);
    const { data: quota } = await supabase
      .from('email_quota')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();
    const sent    = quota?.sent || 0;
    const limit   = quota?.daily_limit || 500;
    const left    = Math.max(0, limit - sent);
    const pct     = Math.min(100, (sent / limit) * 100);
    document.getElementById('quotaCounter').textContent = `${sent}/${limit}`;
    document.getElementById('quotaBar').style.width     = `${pct}%`;
    document.getElementById('quotaSent').textContent    = `${sent} sent`;
    document.getElementById('quotaLeft').textContent    = `${left} remaining`;
    document.getElementById('quotaBadge').textContent   = pct >= 90 ? 'CRITICAL' : pct >= 70 ? 'HIGH' : 'HEALTHY';
    document.getElementById('quotaBadge').style.background = pct >= 90
      ? 'rgba(239,68,68,0.15)' : pct >= 70 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)';
    document.getElementById('quotaBadge').style.color = pct >= 90
      ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981';
    const { count: lifetime } = await supabase
      .from('email_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'sent');
    document.getElementById('quotaLifetime').textContent = (lifetime || 0).toLocaleString();
  } catch(e) { console.warn('Quota:', e); }
}

/* ════════════════════════════════════════════════════════════════
   STEP 2: CERTIFICATE DESIGNER
════════════════════════════════════════════════════════════════ */

/* ── Canvas Setup ──────────────────────────────────────────────── */
function resizeCanvas() {
  const z = ED.zoom;
  _canvas.width  = ED.w;
  _canvas.height = ED.h;
  _overlay.width  = ED.w;
  _overlay.height = ED.h;
  _canvas.style.width   = `${ED.w * z}px`;
  _canvas.style.height  = `${ED.h * z}px`;
  _overlay.style.width  = `${ED.w * z}px`;
  _overlay.style.height = `${ED.h * z}px`;
  drawCanvas();
  drawOverlay();
}

function setZoom(v) {
  ED.zoom = v;
  document.getElementById('zoomLabel').textContent = `${Math.round(v * 100)}%`;
  resizeCanvas();
}

function applyCanvasPreset(val) {
  if (val === 'custom') {
    const w = parseInt(prompt('Width (px):', ED.w));
    const h = parseInt(prompt('Height (px):', ED.h));
    if (w > 0 && h > 0) { ED.w = w; ED.h = h; resizeCanvas(); }
    return;
  }
  const [w, h] = val.split('x').map(Number);
  ED.w = w; ED.h = h;
  resizeCanvas();
}

function setCtrlMode(mode) {
  ED.ctrlMode = mode;
  document.getElementById('pillMove').classList.toggle('active', mode === 'move');
  document.getElementById('pillRotate').classList.toggle('active', mode === 'rotate');
}

/* ── Background ────────────────────────────────────────────────── */
function loadBgImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      ED.bgImg    = img;
      ED.bgBase64 = ev.target.result;
      ED.bgColor  = null;
      document.getElementById('bgClearBtn').style.display = 'inline-flex';
      drawCanvas();
      toast('Background image loaded', 'success');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function setBgColor(hex) {
  ED.bgColor = hex;
  ED.bgImg   = null;
  ED.bgBase64= null;
  document.getElementById('bgClearBtn').style.display = 'inline-flex';
  drawCanvas();
}

function clearBg() {
  ED.bgImg    = null;
  ED.bgBase64 = null;
  ED.bgColor  = '#ffffff';
  document.getElementById('bgUpload').value = '';
  document.getElementById('bgColor').value  = '#ffffff';
  document.getElementById('bgClearBtn').style.display = 'none';
  drawCanvas();
}

/* ── Fields ────────────────────────────────────────────────────── */
let _fieldIdSeq = 1;

function makeField(isStatic = false) {
  return {
    id:            'f' + (_fieldIdSeq++),
    label:         isStatic ? 'Static Text' : 'Field ' + _fieldIdSeq,
    text:          isStatic ? 'Static Text' : '{{field}}',
    isStatic,
    isPrimary:     false,
    x:             50, y: 50,          // % of canvas
    width:         40,                 // % of canvas width
    fontSize:      36,
    fontFamily:    'Arial',
    color:         '#000000',
    align:         'center',
    letterSpacing: 0,
    rotation:      0,
  };
}

function addField() {
  const f = makeField(false);
  ED.fields.push(f);
  selectField(f.id);
  drawCanvas(); drawOverlay();
  renderFieldChips();
  toast('Text field added', 'success', 1500);
}

function addStaticField() {
  const f = makeField(true);
  ED.fields.push(f);
  selectField(f.id);
  drawCanvas(); drawOverlay();
  renderFieldChips();
  toast('Static field added', 'success', 1500);
}

function selectField(id) {
  ED.selId = id;
  renderFieldChips();
  renderFieldProps();
  // Show action bar and ctrl pill if field selected
  document.getElementById('certActionBar').classList.toggle('visible', !!id);
  document.getElementById('certCtrlPill').classList.toggle('visible', !!id);
  drawOverlay();
}

function deleteSelField() {
  if (!ED.selId) return;
  ED.fields = ED.fields.filter(f => f.id !== ED.selId);
  ED.selId  = null;
  document.getElementById('certActionBar').classList.remove('visible');
  document.getElementById('certCtrlPill').classList.remove('visible');
  renderFieldChips();
  renderFieldProps();
  drawCanvas(); drawOverlay();
  toast('Field deleted', 'success', 1200);
}

function duplicateSelField() {
  if (!ED.selId) return;
  const orig = ED.fields.find(f => f.id === ED.selId);
  if (!orig) return;
  const copy = { ...JSON.parse(JSON.stringify(orig)), id: 'f' + (_fieldIdSeq++), x: orig.x + 2, y: orig.y + 2 };
  ED.fields.push(copy);
  selectField(copy.id);
  drawCanvas(); drawOverlay();
  renderFieldChips();
  toast('Field duplicated', 'success', 1200);
}

/* ── Field Chips ───────────────────────────────────────────────── */
function renderFieldChips() {
  const body  = document.getElementById('certPropsBody');
  const empty = document.getElementById('certPropsEmpty');
  const count = document.getElementById('fieldCount');
  if (!body) return;
  count.textContent = `${ED.fields.length} field${ED.fields.length !== 1 ? 's' : ''}`;

  if (!ED.fields.length) {
    if (empty) empty.style.display = 'flex';
    // Remove chip list if exists
    const cl = body.querySelector('.field-chip-list');
    if (cl) cl.remove();
    return;
  }
  if (empty) empty.style.display = 'none';

  let chipList = body.querySelector('.field-chip-list');
  if (!chipList) {
    chipList = document.createElement('div');
    chipList.className = 'field-chip-list';
    body.insertBefore(chipList, body.firstChild);
  }

  chipList.innerHTML = ED.fields.map(f => `
    <div class="field-chip ${f.id === ED.selId ? 'active' : ''}" onclick="selectField('${f.id}');renderFieldProps()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;flex-shrink:0">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${f.label}</span>
      ${f.isStatic ? '' : `<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:rgba(0,212,255,0.1);color:#00d4ff;font-weight:700;flex-shrink:0">DYN</span>`}
      <span class="field-chip-star ${f.isPrimary ? 'starred' : ''}"
        onclick="event.stopPropagation();togglePrimary('${f.id}')" title="Set as primary (used for file naming)">★</span>
      <span class="field-chip-del" onclick="event.stopPropagation();ED.selId='${f.id}';deleteSelField()">×</span>
    </div>`).join('');
}

function togglePrimary(id) {
  ED.fields.forEach(f => f.isPrimary = f.id === id ? !f.isPrimary : false);
  renderFieldChips();
}

/* ── Field Properties Panel ────────────────────────────────────── */
function renderFieldProps() {
  const body = document.getElementById('certPropsBody');
  if (!body) return;

  // Remove existing props section
  const old = body.querySelector('.field-props-section');
  if (old) old.remove();

  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;

  const FONTS = ['Arial','Georgia','Times New Roman','Courier New','Verdana','Trebuchet MS','Impact'];
  const sec = document.createElement('div');
  sec.className = 'field-props-section';
  sec.innerHTML = `
    <div class="ep-sec">Text</div>
    <div class="pr-row">
      <div class="pr-label">Label</div>
      <input class="pr-input" value="${f.label}" onchange="setFP('label',this.value)"/>
    </div>
    <div class="pr-row">
      <div class="pr-label">Preview Text</div>
      <input class="pr-input" value="${f.text}" onchange="setFP('text',this.value)"/>
    </div>

    <div class="ep-sec">Typography</div>
    <div class="pr-row">
      <div class="pr-label">Font Family</div>
      <select class="pr-input" onchange="setFP('fontFamily',this.value)">
        ${FONTS.map(fn => `<option value="${fn}" ${f.fontFamily===fn?'selected':''}>${fn}</option>`).join('')}
      </select>
    </div>
    <div class="pr-row">
      <div class="range-row">
        <div class="range-hdr"><span class="pr-label">Font Size</span><span class="range-val" id="pSizeVal">${f.fontSize}px</span></div>
        <input type="range" class="pr-range" min="8" max="160" step="1" value="${f.fontSize}"
          oninput="document.getElementById('pSizeVal').textContent=this.value+'px';setFP('fontSize',+this.value)"/>
      </div>
    </div>
    <div class="pr-row">
      <div class="range-row">
        <div class="range-hdr"><span class="pr-label">Letter Spacing</span><span class="range-val" id="pSpacingVal">${f.letterSpacing}px</span></div>
        <input type="range" class="pr-range" min="-5" max="30" step="0.5" value="${f.letterSpacing}"
          oninput="document.getElementById('pSpacingVal').textContent=this.value+'px';setFP('letterSpacing',+this.value)"/>
      </div>
    </div>
    <div class="pr-row">
      <div class="pr-label">Text Colour</div>
      <div style="display:flex;align-items:center;gap:8px">
        <input type="color" value="${f.color}" onchange="setFP('color',this.value)"
          style="width:32px;height:32px;border:1px solid var(--glass-border);border-radius:7px;padding:3px;background:var(--glass);cursor:pointer"/>
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-2)">${f.color}</span>
      </div>
    </div>

    <div class="ep-sec">Alignment</div>
    <div class="align-row">
      <button class="al-btn ${f.align==='left'?'on':''}" onclick="setAlign('left')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/></svg>
      </button>
      <button class="al-btn ${f.align==='center'?'on':''}" onclick="setAlign('center')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/></svg>
      </button>
      <button class="al-btn ${f.align==='right'?'on':''}" onclick="setAlign('right')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="9" y2="14"/></svg>
      </button>
    </div>

    <div class="ep-sec">Position & Size</div>
    <div class="pr-2col">
      <div class="pr-row">
        <div class="pr-label">X (%)</div>
        <div class="num-input-wrap">
          <input type="number" class="pr-input pr-input-num" id="pX" step="0.5" value="${f.x.toFixed(1)}" onchange="setFPXY()"/>
          <div class="num-spinners">
            <button class="num-spin-btn" onmousedown="nudgeInput('pX',0.5,true)">▲</button>
            <button class="num-spin-btn" onmousedown="nudgeInput('pX',0.5,false)">▼</button>
          </div>
        </div>
      </div>
      <div class="pr-row">
        <div class="pr-label">Y (%)</div>
        <div class="num-input-wrap">
          <input type="number" class="pr-input pr-input-num" id="pY" step="0.5" value="${f.y.toFixed(1)}" onchange="setFPXY()"/>
          <div class="num-spinners">
            <button class="num-spin-btn" onmousedown="nudgeInput('pY',0.5,true)">▲</button>
            <button class="num-spin-btn" onmousedown="nudgeInput('pY',0.5,false)">▼</button>
          </div>
        </div>
      </div>
    </div>
    <div class="pr-row">
      <div class="pr-label">Width (%)</div>
      <div class="num-input-wrap">
        <input type="number" class="pr-input pr-input-num" id="pW" min="5" max="100" step="1" value="${f.width.toFixed(1)}"
          onchange="setFP('width',+this.value)"/>
        <div class="num-spinners">
          <button class="num-spin-btn" onmousedown="nudgeInput('pW',1,true)">▲</button>
          <button class="num-spin-btn" onmousedown="nudgeInput('pW',1,false)">▼</button>
        </div>
      </div>
    </div>
    <div class="pr-row">
      <div class="range-row">
        <div class="range-hdr"><span class="pr-label">Rotation</span><span class="range-val" id="pRotVal">${f.rotation}°</span></div>
        <input type="range" class="pr-range" min="-180" max="180" step="1" value="${f.rotation}"
          oninput="document.getElementById('pRotVal').textContent=this.value+'°';setFP('rotation',+this.value)"/>
      </div>
    </div>

    <button class="btn btn-danger btn-full btn-sm" style="margin-top:14px" onclick="deleteSelField()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Delete Field
    </button>`;
  body.appendChild(sec);
}

function setFP(key, val) {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f[key] = val;
  drawCanvas(); drawOverlay();
}

function setFPXY() {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f.x = +document.getElementById('pX').value;
  f.y = +document.getElementById('pY').value;
  drawCanvas(); drawOverlay();
}

function setAlign(a) {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f.align = a;
  document.querySelectorAll('.al-btn').forEach(b => b.classList.remove('on'));
  event.currentTarget.classList.add('on');
  drawCanvas();
}

function nudgeInput(id, step, up) {
  const el = document.getElementById(id);
  if (!el) return;
  let v = parseFloat(el.value) || 0;
  el.value = (up ? v + step : v - step).toFixed(1);
  el.dispatchEvent(new Event('change'));
}

/* ── Canvas Draw ───────────────────────────────────────────────── */
function drawCanvas(overrideFields) {
  const fields = overrideFields || ED.fields;
  _ctx.clearRect(0, 0, ED.w, ED.h);

  // Background
  if (ED.bgImg) {
    _ctx.drawImage(ED.bgImg, 0, 0, ED.w, ED.h);
  } else {
    _ctx.fillStyle = ED.bgColor || '#ffffff';
    _ctx.fillRect(0, 0, ED.w, ED.h);
  }

  // Fields
  fields.forEach(f => {
    _ctx.save();
    const cx = (f.x / 100) * ED.w;
    const cy = (f.y / 100) * ED.h;
    const fw = (f.width / 100) * ED.w;
    _ctx.translate(cx, cy);
    _ctx.rotate((f.rotation || 0) * Math.PI / 180);
    _ctx.font = `${f.fontSize}px "${f.fontFamily}"`;
    _ctx.fillStyle = f.color || '#000000';
    _ctx.textAlign = f.align || 'center';
    _ctx.textBaseline = 'middle';
    if (f.letterSpacing) {
      drawTextWithSpacing(_ctx, f.text, 0, 0, fw, f.letterSpacing, f.align);
    } else {
      _ctx.fillText(f.text, 0, 0, fw);
    }
    _ctx.restore();
  });
}

function drawTextWithSpacing(ctx, text, x, y, maxW, spacing, align) {
  const chars  = text.split('');
  const total  = chars.reduce((s, c, i) => s + ctx.measureText(c).width + (i < chars.length - 1 ? spacing : 0), 0);
  let startX   = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  chars.forEach(c => {
    ctx.fillText(c, startX, y);
    startX += ctx.measureText(c).width + spacing;
  });
}

/* ── Overlay (handles) ─────────────────────────────────────────── */
function drawOverlay() {
  _ovCtx.clearRect(0, 0, ED.w, ED.h);
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;

  const cx = (f.x / 100) * ED.w;
  const cy = (f.y / 100) * ED.h;
  const fw = (f.width / 100) * ED.w;
  _ovCtx.save();
  _ovCtx.translate(cx, cy);
  _ovCtx.rotate((f.rotation || 0) * Math.PI / 180);

  const fh = f.fontSize * 1.4;
  const hw = fw / 2, hh = fh / 2;
  const ox = f.align === 'center' ? -hw : f.align === 'right' ? -fw : 0;

  // Bounding box
  _ovCtx.strokeStyle = 'rgba(0,212,255,0.8)';
  _ovCtx.lineWidth   = 1.5 / ED.zoom;
  _ovCtx.setLineDash([4 / ED.zoom, 3 / ED.zoom]);
  _ovCtx.strokeRect(ox, -hh, fw, fh);
  _ovCtx.setLineDash([]);

  // Handles
  const hs = 7 / ED.zoom;
  const corners = [
    [ox, -hh], [ox + fw, -hh],
    [ox, hh],  [ox + fw, hh],
    [ox + fw / 2, -hh - 14 / ED.zoom] // rotation handle
  ];
  corners.forEach(([hx, hy]) => {
    _ovCtx.fillStyle   = '#fff';
    _ovCtx.strokeStyle = '#00d4ff';
    _ovCtx.lineWidth   = 1.5 / ED.zoom;
    _ovCtx.beginPath();
    _ovCtx.arc(hx, hy, hs, 0, Math.PI * 2);
    _ovCtx.fill(); _ovCtx.stroke();
  });
  _ovCtx.restore();
}

/* ── Overlay Mouse Events ──────────────────────────────────────── */
function canvasXY(e) {
  const rect = _overlay.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / ED.zoom,
    y: (e.clientY - rect.top)  / ED.zoom,
  };
}

function overlayMouseDown(e) {
  const { x, y } = canvasXY(e);
  // Find clicked field (reverse order so top-most is hit first)
  let hit = null;
  for (let i = ED.fields.length - 1; i >= 0; i--) {
    const f  = ED.fields[i];
    const cx = (f.x / 100) * ED.w;
    const cy = (f.y / 100) * ED.h;
    const fw = (f.width / 100) * ED.w;
    const fh = f.fontSize * 1.4;
    const ox = f.align === 'center' ? cx - fw/2 : f.align === 'right' ? cx - fw : cx;
    if (x >= ox && x <= ox + fw && y >= cy - fh/2 && y <= cy + fh/2) {
      hit = f; break;
    }
  }
  if (hit) {
    selectField(hit.id);
    ED.drag = { startX: x, startY: y, origX: hit.x, origY: hit.y };
  } else {
    selectField(null);
  }
}

function overlayMouseMove(e) {
  if (!ED.drag || !ED.selId) return;
  const { x, y } = canvasXY(e);
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  if (ED.ctrlMode === 'move') {
    f.x = ED.drag.origX + ((x - ED.drag.startX) / ED.w) * 100;
    f.y = ED.drag.origY + ((y - ED.drag.startY) / ED.h) * 100;
    // Update numeric inputs live
    const px = document.getElementById('pX'); if (px) px.value = f.x.toFixed(1);
    const py = document.getElementById('pY'); if (py) py.value = f.y.toFixed(1);
    drawCanvas(); drawOverlay();
  } else if (ED.ctrlMode === 'rotate') {
    const cx = (f.x / 100) * ED.w;
    const cy = (f.y / 100) * ED.h;
    f.rotation = Math.round(Math.atan2(y - cy, x - cx) * 180 / Math.PI);
    drawCanvas(); drawOverlay();
  }
}

function overlayMouseUp() { ED.drag = null; }

function overlayDblClick(e) {
  const { x, y } = canvasXY(e);
  for (let i = ED.fields.length - 1; i >= 0; i--) {
    const f  = ED.fields[i];
    const cx = (f.x / 100) * ED.w;
    const cy = (f.y / 100) * ED.h;
    const fw = (f.width / 100) * ED.w;
    const fh = f.fontSize * 1.4;
    const ox = f.align === 'center' ? cx - fw/2 : f.align === 'right' ? cx - fw : cx;
    if (x >= ox && x <= ox + fw && y >= cy - fh/2 && y <= cy + fh/2) {
      const newText = prompt('Edit text:', f.text);
      if (newText !== null) { f.text = newText; drawCanvas(); drawOverlay(); }
      return;
    }
  }
}

/* ── Template Save/Load ────────────────────────────────────────── */
function saveTemplate() {
  try {
    localStorage.setItem('cp_template', JSON.stringify({
      w: ED.w, h: ED.h,
      bgColor: ED.bgColor,
      bgBase64: ED.bgBase64,
      fields: ED.fields,
    }));
    toast('Template saved', 'success');
  } catch(e) { toast('Could not save template', 'error'); }
}

function loadSavedTemplate() {
  try {
    const raw = localStorage.getItem('cp_template');
    if (!raw) return;
    const t = JSON.parse(raw);
    ED.w = t.w || 1122; ED.h = t.h || 794;
    ED.bgColor = t.bgColor || '#ffffff';
    ED.fields  = t.fields  || [];
    if (t.bgBase64) {
      const img = new Image();
      img.onload = () => { ED.bgImg = img; drawCanvas(); };
      img.src = t.bgBase64;
      ED.bgBase64 = t.bgBase64;
    }
    resizeCanvas();
    renderFieldChips();
    toast('Saved template loaded', 'success', 1500);
  } catch(e) { console.warn('Load template:', e); }
}

/* ── Render a certificate for a specific row ───────────────────── */
function renderCertForRow(rowIdx, targetCanvas) {
  const row = CP.rows[rowIdx];
  if (!row) return;
  const tc  = targetCanvas || document.createElement('canvas');
  tc.width  = ED.w; tc.height = ED.h;
  const ctx = tc.getContext('2d');
  // Background
  if (ED.bgImg) { ctx.drawImage(ED.bgImg, 0, 0, ED.w, ED.h); }
  else { ctx.fillStyle = ED.bgColor || '#ffffff'; ctx.fillRect(0, 0, ED.w, ED.h); }
  // Fields
  ED.fields.forEach(f => {
    let text = f.text;
    if (!f.isStatic) {
      // Replace {{fieldname}} with mapped column value
      const mapping = CP.fieldMappings.find(m => m.fieldId === f.id);
      if (mapping && mapping.col) {
        const ci = CP.headers.indexOf(mapping.col);
        if (ci >= 0) text = row[ci] || '';
      }
    }
    ctx.save();
    const cx = (f.x / 100) * ED.w;
    const cy = (f.y / 100) * ED.h;
    const fw = (f.width / 100) * ED.w;
    ctx.translate(cx, cy);
    ctx.rotate((f.rotation || 0) * Math.PI / 180);
    ctx.font = `${f.fontSize}px "${f.fontFamily}"`;
    ctx.fillStyle   = f.color || '#000000';
    ctx.textAlign   = f.align || 'center';
    ctx.textBaseline= 'middle';
    if (f.letterSpacing) drawTextWithSpacing(ctx, text, 0, 0, fw, f.letterSpacing, f.align);
    else ctx.fillText(text, 0, 0, fw);
    ctx.restore();
  });
  return tc;
}

/* ── Get primary name for a row ────────────────────────────────── */
function getPrimaryName(rowIdx) {
  const row = CP.rows[rowIdx];
  if (!row) return `participant_${rowIdx + 1}`;
  // Try field marked as primary
  const pf = ED.fields.find(f => f.isPrimary);
  if (pf) {
    const mp = CP.fieldMappings.find(m => m.fieldId === pf.id);
    if (mp && mp.col) {
      const ci = CP.headers.indexOf(mp.col);
      if (ci >= 0 && row[ci]) return row[ci];
    }
  }
  // Fallback: Name column
  const nc = document.getElementById('colName')?.value;
  if (nc) {
    const ci = CP.headers.indexOf(nc);
    if (ci >= 0 && row[ci]) return row[ci];
  }
  return `participant_${rowIdx + 1}`;
}

/* ════════════════════════════════════════════════════════════════
   STEP 3: FIELD MAPPING
════════════════════════════════════════════════════════════════ */
function populateStep3() {
  const rows  = document.getElementById('s3Rows');
  const empty = document.getElementById('s3Empty');
  const count = document.getElementById('s3FieldCount');
  const wb    = document.getElementById('s3WritebackCard');

  const dynFields = ED.fields.filter(f => !f.isStatic);
  count.textContent = `${dynFields.length} dynamic field${dynFields.length !== 1 ? 's' : ''}`;

  if (!dynFields.length) {
    empty.style.display = 'block';
    rows.innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  if (wb) wb.style.display = CP.srcType === 'sheets' ? 'block' : 'none';

  // Preserve existing mappings
  const existingMap = {};
  CP.fieldMappings.forEach(m => existingMap[m.fieldId] = m.col);

  rows.innerHTML = dynFields.map(f => {
    const isPrimary = f.isPrimary;
    const currentCol = existingMap[f.id] || '';
    return `
    <div class="map-row">
      <div class="map-field-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        ${f.label}
      </div>
      <select class="form-select" style="font-size:13px;padding:8px 30px 8px 10px"
        onchange="setFieldMapping('${f.id}',this.value)">
        <option value="">— Not mapped —</option>
        ${CP.headers.map(h => `<option value="${h}" ${currentCol===h?'selected':''}>${h}</option>`).join('')}
      </select>
      <button class="map-star-btn ${isPrimary ? 'starred' : ''}" title="Set as primary"
        onclick="togglePrimary('${f.id}');populateStep3()">★</button>
      <div style="display:flex;align-items:center;justify-content:center">
        ${currentCol ? `<span class="map-preview-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><polyline points="20 6 9 17 4 12"/></svg>
          OK
        </span>` : ''}
      </div>
    </div>`;
  }).join('');

  // Rebuild mappings array from current state
  rebuildMappings();
  updateS3Preview();
  fnUpdatePreview();
}

function setFieldMapping(fieldId, col) {
  const existing = CP.fieldMappings.find(m => m.fieldId === fieldId);
  if (existing) { existing.col = col; }
  else { CP.fieldMappings.push({ fieldId, col, isPrimary: false }); }
  updateS3Preview();
}

function rebuildMappings() {
  const dynFields = ED.fields.filter(f => !f.isStatic);
  const existing  = {};
  CP.fieldMappings.forEach(m => existing[m.fieldId] = m.col);
  CP.fieldMappings = dynFields.map(f => ({
    fieldId:   f.id,
    col:       existing[f.id] || '',
    isPrimary: f.isPrimary,
  }));
}

function updateS3Preview() {
  if (!CP.rows.length) return;
  const card   = document.getElementById('s3PreviewCard');
  const canvas = document.getElementById('s3PreviewCanvas');
  const label  = document.getElementById('s3PreviewLabel');
  card.style.display = 'block';
  rebuildMappings();
  renderCertForRow(0, canvas);
  canvas.style.width = '100%';
  label.textContent  = getPrimaryName(0);
}

function toggleWriteback() {
  CP.writebackEnabled = !CP.writebackEnabled;
  const track = document.getElementById('wbTrack');
  if (track) {
    track.style.background = CP.writebackEnabled ? 'rgba(0,212,255,0.3)' : 'var(--glass)';
  }
}

function fnUpdatePreview() {
  const ev   = (document.getElementById('fnEventInput').value || '').trim();
  const pill = document.getElementById('fnNamePill');
  const prev = document.getElementById('fnPreview');
  const name = getPrimaryName(0).replace(/\s+/g, '_') || 'participant_name';
  pill.textContent = name;
  prev.textContent = ev ? `${name}_${ev}_001.pdf` : `${name}_001.pdf`;
}

/* ════════════════════════════════════════════════════════════════
   STEP 4: CERTIFICATE PREVIEW
════════════════════════════════════════════════════════════════ */
function populateStep4() {
  const grid = document.getElementById('previewGrid');
  const sub  = document.getElementById('s4Subtitle');
  if (!CP.rows.length) {
    grid.innerHTML = '<div style="color:var(--text-3);padding:20px">No data to preview.</div>';
    return;
  }
  rebuildMappings();
  sub.textContent = `Showing ${CP.rows.length} participant certificate${CP.rows.length !== 1 ? 's' : ''}`;
  grid.innerHTML = '';
  const limit = Math.min(CP.rows.length, 20); // Show up to 20 previews
  for (let i = 0; i < limit; i++) {
    const card = document.createElement('div');
    card.className = 'preview-card';
    const tc = renderCertForRow(i);
    tc.style.width = '100%';
    const label = document.createElement('div');
    label.className = 'preview-card-label';
    label.textContent = getPrimaryName(i);
    card.appendChild(tc);
    card.appendChild(label);
    grid.appendChild(card);
  }
  if (CP.rows.length > limit) {
    const more = document.createElement('div');
    more.style.cssText = 'grid-column:1/-1;text-align:center;font-size:13px;color:var(--text-3);padding:10px';
    more.textContent = `+ ${CP.rows.length - limit} more (will be generated during send)`;
    grid.appendChild(more);
  }
}

/* ════════════════════════════════════════════════════════════════
   STEP 5: EMAIL TEMPLATE (full 3-tab editor from mail-tool)
════════════════════════════════════════════════════════════════ */

/* ── Block Definitions ─────────────────────────────────────────── */
const ME_DEFS = {
  logo: {
    label: 'Logo / Banner',
    defaults: () => ({
      text: 'YOUR BRAND',
      tagline: '',
      bg: '#1a1a2e',
      color: '#00d4ff',
      fontSize: 22,
      fontWeight: 800,
    }),
  },
  header: {
    label: 'Heading',
    defaults: () => ({
      text: 'Congratulations, {{name}}!',
      fontSize: 28,
      fontWeight: 700,
      fontStyle: 'normal',
      color: '#1e293b',
      align: 'center',
      bg: 'transparent',
    }),
  },
  text: {
    label: 'Text',
    defaults: () => ({
      text: 'We are pleased to present you with this certificate in recognition of your outstanding achievement.',
      fontSize: 15,
      fontWeight: 400,
      fontStyle: 'normal',
      color: '#475569',
      align: 'center',
      bg: 'transparent',
    }),
  },
  button: {
    label: 'Button',
    defaults: () => ({
      text: 'View Certificate',
      link: '#',
      btnBg: '#00d4ff',
      btnColor: '#ffffff',
      fontSize: 15,
      borderRadius: 8,
      align: 'center',
    }),
  },
  image: {
    label: 'Image',
    defaults: () => ({
      src: 'https://via.placeholder.com/600x200/e2e8f0/94a3b8?text=Your+Image',
      alt: 'Image',
      width: 100,
      borderRadius: 0,
    }),
  },
  divider: {
    label: 'Divider',
    defaults: () => ({ color: '#e2e8f0', thickness: 1 }),
  },
  social: {
    label: 'Social Links',
    defaults: () => ({
      platforms: [
        { name: 'LinkedIn', url: '' },
        { name: 'Twitter/X', url: '' },
      ],
      style: 'circle',
      iconSize: 28,
      color: '#475569',
      align: 'center',
    }),
  },
  footer: {
    label: 'Footer',
    defaults: () => ({
      text: '© 2025 Your Organisation. All rights reserved.',
      fontSize: 12,
      color: '#94a3b8',
      align: 'center',
      bg: '#f8fafc',
      fontWeight: 400,
      fontStyle: 'normal',
    }),
  },
  raw: {
    label: 'Custom HTML',
    defaults: () => ({ html: '<div style="padding:16px;text-align:center;color:#475569">Custom HTML block</div>' }),
  },
  spacer: {
    label: 'Spacer',
    defaults: () => ({ height: 20, bg: 'transparent' }),
  },
  attachment: {
    label: 'Attachment Notice',
    defaults: () => ({
      label: 'Your Certificate is Attached',
      filename: '{{name}}_Certificate.pdf',
      bg: '#fff7ed',
      iconColor: '#f97316',
    }),
  },
  cert_preview: {
    label: 'Certificate Preview',
    defaults: () => ({
      caption: 'Your Certificate of Completion',
      bg: '#f8fafc',
      imgWidth: 90,
      radius: 8,
    }),
  },
};

/* ── Block to HTML ─────────────────────────────────────────────── */
function meBlockToHtml(block, rowIdx = null) {
  const p = block.props;
  const ps = s => (rowIdx !== null && s) ? mPersonalise(String(s), rowIdx) : (s || '');
  switch (block.type) {
    case 'logo':
      return `<div style="background:${p.bg||'#1a1a2e'};padding:20px 32px;text-align:center">
        <div style="font-size:${p.fontSize||22}px;font-weight:${p.fontWeight||800};color:${p.color||'#00d4ff'};letter-spacing:2px;font-family:sans-serif">${ps(p.text)}</div>
        ${p.tagline ? `<div style="font-size:12px;color:${p.color||'#00d4ff'};opacity:0.7;margin-top:4px">${ps(p.tagline)}</div>` : ''}
      </div>`;
    case 'header':
      return `<div style="background:${p.bg||'transparent'};padding:24px 32px;text-align:${p.align||'center'}">
        <div style="font-size:${p.fontSize||28}px;font-weight:${p.fontWeight||700};font-style:${p.fontStyle||'normal'};color:${p.color||'#1e293b'};font-family:sans-serif;line-height:1.3">${ps(p.text)}</div>
      </div>`;
    case 'text':
      return `<div style="background:${p.bg||'transparent'};padding:12px 32px;text-align:${p.align||'center'}">
        <div style="font-size:${p.fontSize||15}px;font-weight:${p.fontWeight||400};font-style:${p.fontStyle||'normal'};color:${p.color||'#475569'};font-family:sans-serif;line-height:1.7">${ps(p.text)}</div>
      </div>`;
    case 'button':
      return `<div style="padding:16px 32px;text-align:${p.align||'center'}">
        <a href="${ps(p.link)||'#'}" style="display:inline-block;padding:12px 28px;background:${p.btnBg||'#00d4ff'};color:${p.btnColor||'#fff'};text-decoration:none;border-radius:${p.borderRadius||8}px;font-size:${p.fontSize||15}px;font-weight:700;font-family:sans-serif">${ps(p.text)}</a>
      </div>`;
    case 'image':
      return `<div style="padding:12px 0;text-align:center">
        <img src="${ps(p.src)}" alt="${p.alt||''}" width="${p.width||100}%" style="border-radius:${p.borderRadius||0}px;max-width:100%;display:inline-block"/>
      </div>`;
    case 'divider':
      return `<div style="padding:8px 32px"><hr style="border:none;border-top:${p.thickness||1}px solid ${p.color||'#e2e8f0'};margin:0"/></div>`;
    case 'spacer':
      return `<div style="height:${p.height||20}px;background:${p.bg||'transparent'}"></div>`;
    case 'social': {
      const plats = (p.platforms || []).filter(pl => pl.url);
      const iconMap = { LinkedIn:'in', 'Twitter/X':'𝕏', Instagram:'ig', Facebook:'fb', YouTube:'yt', GitHub:'gh', WhatsApp:'wa', Telegram:'tg', Discord:'dc', TikTok:'tt', Website:'🌐' };
      const sz = p.iconSize || 28;
      const btns = plats.map(pl => {
        const lbl = iconMap[pl.name] || pl.name.slice(0,2).toLowerCase();
        const st = p.style === 'circle'
          ? `display:inline-flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:50%;background:${p.color||'#475569'};color:#fff;font-size:${Math.round(sz*0.4)}px;text-decoration:none;font-weight:700;font-family:sans-serif;margin:0 4px`
          : p.style === 'square'
          ? `display:inline-flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:4px;background:${p.color||'#475569'};color:#fff;font-size:${Math.round(sz*0.4)}px;text-decoration:none;font-weight:700;font-family:sans-serif;margin:0 4px`
          : `display:inline-block;font-size:${Math.round(sz*0.5)}px;color:${p.color||'#475569'};text-decoration:none;font-family:sans-serif;margin:0 6px;font-weight:700`;
        return `<a href="${pl.url}" style="${st}">${lbl}</a>`;
      }).join('');
      return `<div style="padding:12px 32px;text-align:${p.align||'center'}">${btns}</div>`;
    }
    case 'footer':
      return `<div style="background:${p.bg||'#f8fafc'};padding:16px 32px;text-align:${p.align||'center'}">
        <div style="font-size:${p.fontSize||12}px;color:${p.color||'#94a3b8'};font-family:sans-serif;font-weight:${p.fontWeight||400};font-style:${p.fontStyle||'normal'};line-height:1.6">${ps(p.text)}</div>
      </div>`;
    case 'attachment':
      return `<div style="background:${p.bg||'#fff7ed'};padding:16px 32px">
        <table cellpadding="0" cellspacing="0" width="100%"><tr>
          <td width="44" valign="middle">
            <div style="width:40px;height:40px;border-radius:8px;background:${p.iconColor||'#f97316'};display:inline-flex;align-items:center;justify-content:center;font-size:20px">📎</div>
          </td>
          <td style="padding-left:14px;vertical-align:middle">
            <div style="font-size:14px;font-weight:700;color:#1e293b">${ps(p.label||'Your Certificate is Attached')}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">${ps(p.filename||'certificate.pdf')} · Attached to this email</div>
          </td>
        </tr></table>
      </div>`;
    case 'cert_preview': {
      let imgContent;
      if (rowIdx !== null) {
        try {
          const tc = renderCertForRow(rowIdx);
          const dataUrl = tc.toDataURL('image/png');
          imgContent = `<img src="${dataUrl}" alt="${ps(p.caption||'Certificate')}" style="border-radius:${p.radius||8}px;width:${p.imgWidth||90}%;max-width:100%;display:block;margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,0.12)"/>`;
        } catch(e) {
          imgContent = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">Certificate preview unavailable</div>`;
        }
      } else {
        imgContent = `<div style="padding:32px;text-align:center;background:#f1f5f9;border-radius:${p.radius||8}px;color:#94a3b8;font-size:13px;border:2px dashed #e2e8f0">[ Certificate thumbnail renders per-recipient ]</div>`;
      }
      return `<div style="background:${p.bg||'#f8fafc'};padding:20px 32px;text-align:center">
        ${imgContent}
        ${p.caption ? `<div style="font-size:13px;color:#64748b;margin-top:10px">${ps(p.caption)}</div>` : ''}
      </div>`;
    }
    case 'raw':
      return ps(p.html || '');
    default:
      return `<div style="padding:12px;color:#475569">[${block.type}]</div>`;
  }
}

/* ── Full Email HTML ───────────────────────────────────────────── */
function meGetFullHtml(rowIdx = null) {
  const body = ME.blocks.map(b => meBlockToHtml(b, rowIdx)).join('\n');
  const subject = document.getElementById('mSubject')?.value || 'Your Certificate';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
<style>body{margin:0;padding:0;background:#f4f7fb;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}img{border:0;display:block;max-width:100%}table{border-collapse:collapse}a{color:inherit}</style>
</head>
<body style="margin:0;padding:0;background:#f4f7fb">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:20px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%">
<tr><td>${body}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function meGenerateHTML(rowIdx = null) {
  return meGetFullHtml(rowIdx);
}

/* ── Template Picker ───────────────────────────────────────────── */
const ME_TEMPLATES = [
  {
    id: 'cert-clean', name: 'Certificate Delivery', category: 'certificate',
    html: () => {
      ME.blocks = [
        { id:'b1', type:'logo',         props:{ ...ME_DEFS.logo.defaults(),         text:'HONOURIX', bg:'#0f172a', color:'#00d4ff' } },
        { id:'b2', type:'header',       props:{ ...ME_DEFS.header.defaults(),       text:'Congratulations, {{name}}!' } },
        { id:'b3', type:'text',         props:{ ...ME_DEFS.text.defaults(),         text:'We are delighted to present your certificate for <strong>{{event}}</strong>. Your dedication and hard work have earned this recognition.' } },
        { id:'b4', type:'cert_preview', props:ME_DEFS.cert_preview.defaults() },
        { id:'b5', type:'attachment',   props:ME_DEFS.attachment.defaults() },
        { id:'b6', type:'button',       props:{ ...ME_DEFS.button.defaults(),       text:'Download Your Certificate', link:'#', btnBg:'#00d4ff', btnColor:'#0f172a' } },
        { id:'b7', type:'divider',      props:ME_DEFS.divider.defaults() },
        { id:'b8', type:'footer',       props:ME_DEFS.footer.defaults() },
      ];
      ME.nextId = 9;
    }
  },
  {
    id: 'cert-minimal', name: 'Minimal Certificate', category: 'certificate',
    html: () => {
      ME.blocks = [
        { id:'b1', type:'logo',         props:{ ...ME_DEFS.logo.defaults(),         bg:'#18181b', color:'#a78bfa' } },
        { id:'b2', type:'header',       props:{ ...ME_DEFS.header.defaults(),       text:'🎓 Congratulations, {{name}}!' } },
        { id:'b3', type:'cert_preview', props:{ ...ME_DEFS.cert_preview.defaults(), bg:'#ffffff', imgWidth:92 } },
        { id:'b4', type:'attachment',   props:{ ...ME_DEFS.attachment.defaults(),   bg:'#fafafa', iconColor:'#a78bfa' } },
        { id:'b5', type:'footer',       props:ME_DEFS.footer.defaults() },
      ];
      ME.nextId = 6;
    }
  },
  {
    id: 'workshop', name: 'Workshop Participation', category: 'certificate',
    html: () => {
      ME.blocks = [
        { id:'b1', type:'logo',         props:{ ...ME_DEFS.logo.defaults(),         text:'{{event}}', bg:'#1e3a5f', color:'#fbbf24' } },
        { id:'b2', type:'header',       props:{ ...ME_DEFS.header.defaults(),       text:'Hello {{name}},' } },
        { id:'b3', type:'text',         props:{ ...ME_DEFS.text.defaults(),         text:'Thank you for participating in <strong>{{event}}</strong>. Please find your certificate of participation attached.' } },
        { id:'b4', type:'cert_preview', props:{ ...ME_DEFS.cert_preview.defaults(), bg:'#fffbeb' } },
        { id:'b5', type:'attachment',   props:{ ...ME_DEFS.attachment.defaults(),   bg:'#fffbeb', iconColor:'#f59e0b' } },
        { id:'b6', type:'divider',      props:{ ...ME_DEFS.divider.defaults(),      color:'#fde68a' } },
        { id:'b7', type:'footer',       props:ME_DEFS.footer.defaults() },
      ];
      ME.nextId = 8;
    }
  },
  {
    id: 'welcome', name: 'Welcome Email', category: 'welcome',
    html: () => {
      ME.blocks = [
        { id:'b1', type:'logo',   props:ME_DEFS.logo.defaults() },
        { id:'b2', type:'header', props:{ ...ME_DEFS.header.defaults(), text:'Welcome, {{name}}! 👋' } },
        { id:'b3', type:'text',   props:{ ...ME_DEFS.text.defaults(),   text:'We are thrilled to have you on board. Here is everything you need to get started.' } },
        { id:'b4', type:'button', props:ME_DEFS.button.defaults() },
        { id:'b5', type:'footer', props:ME_DEFS.footer.defaults() },
      ];
      ME.nextId = 6;
    }
  },
  {
    id: 'event-invite', name: 'Event Invitation', category: 'event',
    html: () => {
      ME.blocks = [
        { id:'b1', type:'image',  props:{ ...ME_DEFS.image.defaults(),  src:'https://via.placeholder.com/600x200/1e293b/00d4ff?text=EVENT+2025' } },
        { id:'b2', type:'header', props:{ ...ME_DEFS.header.defaults(), text:'You\'re Invited, {{name}}!' } },
        { id:'b3', type:'text',   props:{ ...ME_DEFS.text.defaults(),   text:'Join us for an unforgettable event. Reserve your spot today.' } },
        { id:'b4', type:'button', props:{ ...ME_DEFS.button.defaults(), text:'Register Now', btnBg:'#7c3aed' } },
        { id:'b5', type:'divider',props:ME_DEFS.divider.defaults() },
        { id:'b6', type:'footer', props:ME_DEFS.footer.defaults() },
      ];
      ME.nextId = 7;
    }
  },
  {
    id: 'promo', name: 'Promotional', category: 'promo',
    html: () => {
      ME.blocks = [
        { id:'b1', type:'logo',   props:{ ...ME_DEFS.logo.defaults(),   bg:'#7c3aed', color:'#fff' } },
        { id:'b2', type:'header', props:{ ...ME_DEFS.header.defaults(), text:'Exclusive Offer for {{name}} 🎉', color:'#7c3aed' } },
        { id:'b3', type:'text',   props:ME_DEFS.text.defaults() },
        { id:'b4', type:'button', props:{ ...ME_DEFS.button.defaults(), btnBg:'#7c3aed', text:'Claim Offer' } },
        { id:'b5', type:'footer', props:ME_DEFS.footer.defaults() },
      ];
      ME.nextId = 6;
    }
  },
  {
    id: 'newsletter', name: 'Newsletter', category: 'newsletter',
    html: () => {
      ME.blocks = [
        { id:'b1', type:'logo',   props:ME_DEFS.logo.defaults() },
        { id:'b2', type:'header', props:{ ...ME_DEFS.header.defaults(), text:'Monthly Update — {{name}}', fontSize:22 } },
        { id:'b3', type:'text',   props:ME_DEFS.text.defaults() },
        { id:'b4', type:'divider',props:ME_DEFS.divider.defaults() },
        { id:'b5', type:'text',   props:{ ...ME_DEFS.text.defaults(),   text:'Section 2: More updates and news here.' } },
        { id:'b6', type:'social', props:ME_DEFS.social.defaults() },
        { id:'b7', type:'footer', props:ME_DEFS.footer.defaults() },
      ];
      ME.nextId = 8;
    }
  },
  {
    id: 'blank', name: 'Blank Canvas', category: 'all',
    html: () => { ME.blocks = []; ME.nextId = 1; }
  },
];

function meBuildTemplatePicker() {
  const grid = document.getElementById('meTplGateGrid');
  if (!grid) return;
  grid.innerHTML = ME_TEMPLATES.map(t => `
    <div class="me-tpl-card" data-id="${t.id}" data-cat="${t.category}" onclick="meTplSelect('${t.id}', this)">
      <div class="me-tpl-preview">
        <iframe srcdoc="${htmlEntities(meTplPreviewHtml(t))}" sandbox="allow-same-origin" style="width:200%;height:200%;transform:scale(0.5);transform-origin:top left;pointer-events:none;border:none"></iframe>
      </div>
      <div class="me-tpl-info">
        <div class="me-tpl-name">${t.name}</div>
        <div class="me-tpl-cat-tag">${t.category === 'all' ? 'General' : t.category}</div>
      </div>
    </div>`).join('');
}

function meTplPreviewHtml(t) {
  // Build a mini preview without modifying ME state
  const savedBlocks = [...ME.blocks];
  const savedId     = ME.nextId;
  t.html();
  const html = meGetFullHtml();
  ME.blocks  = savedBlocks;
  ME.nextId  = savedId;
  return html;
}

function htmlEntities(str) {
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function meTplSelect(id, el) {
  ME.selectedTemplate = id;
  document.querySelectorAll('.me-tpl-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('meTplGateUseBtn').disabled = false;
}

function meTplGateFilter(cat, btn) {
  document.querySelectorAll('.me-tpl-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.me-tpl-card').forEach(card => {
    const match = cat === 'all' || card.dataset.cat === cat || card.dataset.id === 'blank';
    card.style.display = match ? '' : 'none';
  });
}

function meTplGateConfirm() {
  if (!ME.selectedTemplate) return;
  const tpl = ME_TEMPLATES.find(t => t.id === ME.selectedTemplate);
  if (!tpl) return;
  tpl.html();
  document.getElementById('meTplGate').style.display = 'none';
  const wrap = document.getElementById('meEditorWrap');
  wrap.style.display = 'flex';
  wrap.classList.add('visible');
  document.getElementById('meTabBarWrap').style.display = '';
  document.getElementById('meAiToggleBtn').style.display = '';
  meRenderCanvas();
  meSyncToCode();
  meInitCodeMirror();
  meRenderMergeTags();
  meSwitchTab('visual');
  toast(`Template "${tpl.name}" loaded`, 'success', 1800);
}

function meBackToGate() {
  document.getElementById('meTplGate').style.display = '';
  const wrap = document.getElementById('meEditorWrap');
  wrap.style.display = 'none';
  wrap.classList.remove('visible');
  document.getElementById('meTabBarWrap').style.display = 'none';
  document.getElementById('meAiToggleBtn').style.display = 'none';
}

/* ── Tab Switching ─────────────────────────────────────────────── */
function meSwitchTab(tab) {
  ME.activeTab = tab;
  document.getElementById('meVisual').style.display  = tab === 'visual'  ? '' : 'none';
  document.getElementById('meCode').style.display    = tab === 'code'    ? '' : 'none';
  document.getElementById('mePreview').style.display = tab === 'preview' ? '' : 'none';
  ['Visual','Code','Preview'].forEach(t =>
    document.getElementById(`meTab${t}`)?.classList.toggle('active', tab === t.toLowerCase())
  );
  if (tab === 'code') { meSyncToCode(); if (ME.cm) setTimeout(() => ME.cm.refresh(), 50); }
  if (tab === 'preview') meUpdatePreview();
}

/* ── Block Operations ──────────────────────────────────────────── */
function meRenderCanvas() {
  // Target inner canvas div so drag handles have left-padding room
  const canvas = document.getElementById('meCanvas') || document.getElementById('meCanvasWrap');
  if (!canvas) return;
  canvas.innerHTML = '';

  // Empty state
  const emptyEl = document.getElementById('meEmptyCanvas');
  if (emptyEl) emptyEl.style.display = ME.blocks.length ? 'none' : '';

  ME.blocks.forEach((block, idx) => {
    const wrap = document.createElement('div');
    wrap.className = `me-block-wrap${ME.selectedId === block.id ? ' selected' : ''}`;
    wrap.dataset.id = block.id;

    // Drag handle (SortableJS grip)
    const drag = document.createElement('div');
    drag.className = 'me-drag-handle';
    drag.innerHTML = '<span></span><span></span><span></span><span></span><span></span><span></span>';

    // Controls
    const ctrl = document.createElement('div');
    ctrl.className = 'me-block-controls';
    ctrl.innerHTML =
      (idx > 0 ? `<button class="me-ctrl-btn" onclick="event.stopPropagation();meMoveBlock('${block.id}',-1)" title="Move up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg></button>` : '') +
      (idx < ME.blocks.length - 1 ? `<button class="me-ctrl-btn" onclick="event.stopPropagation();meMoveBlock('${block.id}',1)" title="Move down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>` : '') +
      `<button class="me-ctrl-btn" onclick="event.stopPropagation();meDuplicateBlock('${block.id}')" title="Duplicate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` +
      `<button class="me-ctrl-btn del" onclick="event.stopPropagation();meDeleteBlock('${block.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;

    // Block type label
    const label = document.createElement('div');
    label.className = 'me-block-label';
    label.style.cssText = 'position:absolute;top:4px;left:8px;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:rgba(0,212,255,0.7);opacity:0;transition:opacity 0.15s;pointer-events:none;z-index:5';
    label.textContent = (ME_DEFS[block.type] || {}).label || block.type;

    const inner = document.createElement('div');
    inner.className = 'me-block-inner';
    inner.innerHTML = meBlockToHtml(block);

    wrap.appendChild(drag);
    wrap.appendChild(ctrl);
    wrap.appendChild(label);
    wrap.appendChild(inner);
    wrap.addEventListener('click', () => meSelectBlock(block.id));
    canvas.appendChild(wrap);
  });

  // Inject label-hover CSS once
  if (!document.getElementById('me-label-css')) {
    const s = document.createElement('style');
    s.id = 'me-label-css';
    s.textContent = '.me-block-wrap:hover .me-block-label,.me-block-wrap.selected .me-block-label{opacity:1!important}';
    document.head.appendChild(s);
  }

  // Re-init SortableJS (drag-to-reorder via grip handle)
  if (typeof Sortable !== 'undefined') {
    Sortable.create(canvas, {
      animation: 150,
      handle: '.me-drag-handle',
      onEnd: ev => {
        const [removed] = ME.blocks.splice(ev.oldIndex, 1);
        ME.blocks.splice(ev.newIndex, 0, removed);
        meSyncToCode();
      }
    });
  }
}

function meAddBlock(type) {
  const def = ME_DEFS[type];
  if (!def) return;
  const block = { id: 'b' + (ME.nextId++), type, props: def.defaults() };
  ME.blocks.push(block);
  meRenderCanvas();
  meSelectBlock(block.id);
  meSyncToCode();
  const wrap = document.getElementById('meCanvasWrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
  toast(`Added ${def.label}`, 'success', 1400);
}

function meDeleteBlock(id) {
  ME.blocks = ME.blocks.filter(b => b.id !== id);
  if (ME.selectedId === id) ME.selectedId = null;
  meRenderCanvas();
  meRenderProps();
  meSyncToCode();
}

function meDuplicateBlock(id) {
  const idx = ME.blocks.findIndex(b => b.id === id);
  if (idx < 0) return;
  const copy = JSON.parse(JSON.stringify(ME.blocks[idx]));
  copy.id = 'b' + (ME.nextId++);
  ME.blocks.splice(idx + 1, 0, copy);
  meRenderCanvas();
  meSelectBlock(copy.id);
  meSyncToCode();
  toast('Block duplicated', 'success', 1200);
}

function meMoveBlock(id, dir) {
  const idx = ME.blocks.findIndex(b => b.id === id);
  if (idx < 0) return;
  const target = idx + dir;
  if (target < 0 || target >= ME.blocks.length) return;
  [ME.blocks[idx], ME.blocks[target]] = [ME.blocks[target], ME.blocks[idx]];
  meRenderCanvas();
  meSelectBlock(id);
  meSyncToCode();
}

function meSelectBlock(id) {
  ME.selectedId = id;
  meRenderCanvas();
  meRenderProps();
}

/* ── Block Properties Panel ────────────────────────────────────── */
function meRenderProps() {
  const body = document.getElementById('mePropsBody');
  if (!body) return;

  const existing = body.querySelector('.me-props-content');
  if (existing) existing.remove();
  const empty = body.querySelector('.me-props-empty');

  const b = ME.blocks.find(b => b.id === ME.selectedId);
  if (!b) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const def = ME_DEFS[b.type];
  const wrap = document.createElement('div');
  wrap.className = 'me-props-content';
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--glass-border)">
      <div style="font-size:13px;font-weight:700;color:var(--text)">${def ? def.label : b.type} Properties</div>
      <button class="me-block-btn danger" onclick="meDeleteBlock('${b.id}')" title="Delete block">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">
      ${mePropFields(b)}
    </div>`;
  body.appendChild(wrap);
  mePropWire(b);
}

function mePropFields(b) {
  const p = b.props;
  const row = (label, content) =>
    `<div class="pr-row"><div class="pr-label">${label}</div>${content}</div>`;
  const inp = (key, val, type = 'text') =>
    `<input class="me-input prop-live" data-key="${key}" type="${type}" value="${(val||'').toString().replace(/"/g,'&quot;')}"/>`;
  const colorRow = (key, val) =>
    `<div style="display:flex;align-items:center;gap:8px">
      <input type="color" class="prop-live" data-key="${key}" value="${val||'#000000'}" style="width:32px;height:32px;border:1px solid var(--glass-border);border-radius:7px;padding:3px;background:var(--glass);cursor:pointer"/>
      <span class="prop-hex-label" style="font-family:var(--font-mono);font-size:11px;color:var(--text-2)">${val||'#000000'}</span>
    </div>`;
  const rangeRow = (key, val, min, max, step = 1, unit = '') =>
    `<div class="range-row">
      <div class="range-hdr"><span></span><span class="range-val">${val}${unit}</span></div>
      <input type="range" class="pr-range prop-live" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${val}"/>
    </div>`;
  const selRow = (key, val, opts) =>
    `<select class="form-select prop-live" data-key="${key}" style="font-size:13px;padding:8px 30px 8px 10px">
      ${opts.map(([v,l]) => `<option value="${v}" ${val===v?'selected':''}>${l}</option>`).join('')}
    </select>`;

  switch (b.type) {
    case 'logo':
      return row('Brand Text',  inp('text', p.text))
           + row('Tagline',     inp('tagline', p.tagline))
           + row('Background',  colorRow('bg', p.bg))
           + row('Text Color',  colorRow('color', p.color))
           + row('Font Size',   rangeRow('fontSize', p.fontSize||22, 14, 60, 1, 'px'))
           + row('Font Weight', rangeRow('fontWeight', p.fontWeight||800, 100, 900, 100));

    case 'header':
      return row('Heading Text', `<textarea class="me-textarea prop-live" data-key="text" style="min-height:70px">${p.text||''}</textarea>`)
           + row('Font Size',    rangeRow('fontSize', p.fontSize||28, 14, 72, 1, 'px'))
           + row('Font Weight',  selRow('fontWeight', p.fontWeight||700, [[400,'Regular'],[600,'Semi Bold'],[700,'Bold'],[800,'Extra Bold']]))
           + row('Font Style',   selRow('fontStyle',  p.fontStyle||'normal', [['normal','Normal'],['italic','Italic']]))
           + row('Color',        colorRow('color', p.color))
           + row('Align',        selRow('align', p.align||'center', [['left','Left'],['center','Center'],['right','Right']]))
           + row('Background',   colorRow('bg', p.bg||'transparent'));

    case 'text':
      return `<div class="pr-label" style="margin-bottom:4px">Content (HTML supported)</div>
              <textarea class="me-textarea prop-live" data-key="text" style="min-height:120px">${p.text||''}</textarea>`
           + row('Font Size',   rangeRow('fontSize', p.fontSize||15, 10, 32, 1, 'px'))
           + row('Font Weight', selRow('fontWeight', p.fontWeight||400, [[400,'Regular'],[600,'Semi Bold'],[700,'Bold']]))
           + row('Font Style',  selRow('fontStyle',  p.fontStyle||'normal', [['normal','Normal'],['italic','Italic']]))
           + row('Color',       colorRow('color', p.color))
           + row('Align',       selRow('align', p.align||'center', [['left','Left'],['center','Center'],['right','Right']]))
           + row('Background',  colorRow('bg', p.bg||'transparent'));

    case 'button':
      return row('Button Text',   inp('text', p.text))
           + row('Link URL',      inp('link', p.link))
           + row('Button BG',     colorRow('btnBg', p.btnBg))
           + row('Button Color',  colorRow('btnColor', p.btnColor))
           + row('Font Size',     rangeRow('fontSize', p.fontSize||15, 11, 24, 1, 'px'))
           + row('Border Radius', rangeRow('borderRadius', p.borderRadius||8, 0, 40, 2, 'px'))
           + row('Align',         selRow('align', p.align||'center', [['left','Left'],['center','Center'],['right','Right']]));

    case 'image':
      return row('Image URL',     inp('src', p.src))
           + row('Alt Text',      inp('alt', p.alt))
           + row('Width',         rangeRow('width', p.width||100, 20, 100, 5, '%'))
           + row('Border Radius', rangeRow('borderRadius', p.borderRadius||0, 0, 32, 2, 'px'));

    case 'divider':
      return row('Color',     colorRow('color', p.color))
           + row('Thickness', rangeRow('thickness', p.thickness||1, 1, 8, 1, 'px'));

    case 'spacer':
      return row('Height',     rangeRow('height', p.height||20, 4, 120, 4, 'px'))
           + row('Background', colorRow('bg', p.bg||'transparent'));

    case 'social':
      return `<div class="pr-label" style="margin-bottom:8px">Social Links</div>
        ${(p.platforms || []).map((pl, i) => `
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
            <select class="form-select prop-social-platform" data-idx="${i}" style="font-size:12px;flex:0 0 120px;padding:6px 22px 6px 8px">
              ${['LinkedIn','Twitter/X','Instagram','Facebook','YouTube','GitHub','WhatsApp','Telegram','Discord','TikTok','Website']
                .map(n => `<option value="${n}" ${pl.name===n?'selected':''}>${n}</option>`).join('')}
            </select>
            <input class="me-input prop-social-url" data-idx="${i}" placeholder="URL" value="${pl.url||''}" style="flex:1;font-size:12px"/>
            <button class="me-block-btn danger" onclick="meSocialDelLink(${i},'${b.id}')">×</button>
          </div>`).join('')}
        <button class="btn btn-outline btn-sm" style="margin-top:4px" onclick="meSocialAddLink('${b.id}')">+ Add Link</button>`
      + row('Style',     selRow('style', p.style||'circle', [['circle','Circle'],['square','Square'],['text','Text']]))
      + row('Icon Size', rangeRow('iconSize', p.iconSize||28, 16, 56, 2, 'px'))
      + row('Color',     colorRow('color', p.color))
      + row('Align',     selRow('align', p.align||'center', [['left','Left'],['center','Center'],['right','Right']]));

    case 'footer':
      return `<div class="pr-label" style="margin-bottom:4px">Footer Text</div>
              <textarea class="me-textarea prop-live" data-key="text" style="min-height:70px">${p.text||''}</textarea>`
           + row('Font Size',  rangeRow('fontSize', p.fontSize||12, 10, 20, 1, 'px'))
           + row('Color',      colorRow('color', p.color))
           + row('Align',      selRow('align', p.align||'center', [['left','Left'],['center','Center'],['right','Right']]))
           + row('Background', colorRow('bg', p.bg));

    case 'attachment':
      return row('Label Text',  inp('label', p.label))
           + row('Filename',    inp('filename', p.filename))
           + row('Background',  colorRow('bg', p.bg))
           + row('Icon Color',  colorRow('iconColor', p.iconColor));

    case 'cert_preview':
      return row('Caption',       inp('caption', p.caption))
           + row('Background',    colorRow('bg', p.bg))
           + row('Image Width',   rangeRow('imgWidth', p.imgWidth||90, 40, 100, 5, '%'))
           + row('Border Radius', rangeRow('radius', p.radius||8, 0, 32, 2, 'px'));

    case 'raw':
      return `<div class="pr-label" style="margin-bottom:4px">Custom HTML</div>
              <textarea class="me-textarea prop-live" data-key="html" style="min-height:160px;font-family:var(--font-mono);font-size:12px">${p.html||''}</textarea>`;

    default:
      return '<div style="padding:12px;color:var(--text-3)">No editable properties.</div>';
  }
}

function mePropWire(b) {
  const body = document.getElementById('mePropsBody');
  if (!body) return;
  body.querySelectorAll('.prop-live').forEach(el => {
    const key = el.dataset.key;
    if (!key) return;
    const update = () => {
      b.props[key] = (el.type === 'range' || el.type === 'number') ? +el.value : el.value;
      if (el.type === 'color') {
        const lbl = el.parentElement?.querySelector('.prop-hex-label');
        if (lbl) lbl.textContent = el.value;
      }
      if (el.type === 'range') {
        const valEl = el.closest('.range-row')?.querySelector('.range-val');
        if (valEl) {
          const pctKeys = ['width', 'imgWidth'];
          const noUnit  = ['fontWeight'];
          valEl.textContent = el.value + (pctKeys.includes(key) ? '%' : noUnit.includes(key) ? '' : 'px');
        }
      }
      meRenderCanvas();
      meSyncToCode();
    };
    el.addEventListener('input',  update);
    el.addEventListener('change', update);
  });
  body.querySelectorAll('.prop-social-platform').forEach(el => {
    el.addEventListener('change', () => {
      const i = +el.dataset.idx;
      if (b.props.platforms && b.props.platforms[i]) b.props.platforms[i].name = el.value;
      meRenderCanvas(); meSyncToCode();
    });
  });
  body.querySelectorAll('.prop-social-url').forEach(el => {
    el.addEventListener('input', () => {
      const i = +el.dataset.idx;
      if (b.props.platforms && b.props.platforms[i]) b.props.platforms[i].url = el.value;
      meRenderCanvas(); meSyncToCode();
    });
  });
}

function meBlockSubtitle(b) {
  const p = b.props || {};
  const tr = (s, n = 32) => s && s.length > n ? s.slice(0, n) + '…' : (s || '');
  switch (b.type) {
    case 'logo':        return tr(p.text);
    case 'header':      return tr((p.text || '').replace(/<[^>]+>/g, ''));
    case 'text':        return tr((p.text || '').replace(/<[^>]+>/g, ''));
    case 'image':       return p.src ? 'Custom image' : 'No image set';
    case 'button':      return tr(p.text);
    case 'divider':     return `${p.thickness||1}px · ${p.color||'#e2e8f0'}`;
    case 'spacer':      return `${p.height||20}px height`;
    case 'social':      return (p.platforms || []).map(pl => pl.name).filter(Boolean).join(', ') || 'No links';
    case 'footer':      return tr((p.text || '').replace(/<[^>]+>/g, ''));
    case 'attachment':  return tr(p.filename || '');
    case 'cert_preview':return p.caption || 'Certificate thumbnail';
    case 'raw':         return 'Custom HTML block';
    default:            return b.type;
  }
}

function meSocialAddLink(blockId) {
  const b = ME.blocks.find(b => b.id === blockId);
  if (!b) return;
  if (!b.props.platforms) b.props.platforms = [];
  b.props.platforms.push({ name: 'LinkedIn', url: '' });
  meSelectBlock(blockId);
  meSyncToCode();
}

function meSocialDelLink(idx, blockId) {
  const b = ME.blocks.find(b => b.id === blockId);
  if (!b || !b.props.platforms) return;
  b.props.platforms.splice(idx, 1);
  meSelectBlock(blockId);
  meSyncToCode();
}

/* ── Code Editor ───────────────────────────────────────────────── */
function meInitCodeMirror() {
  const ta = document.getElementById('meCodeEditor');
  if (!ta || ME.cm) return;
  if (typeof CodeMirror !== 'undefined') {
    ME.cm = CodeMirror.fromTextArea(ta, {
      mode: 'htmlmixed',
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
      indentWithTabs: false,
    });
    ME.cm.on('change', () => {
      clearTimeout(ME.cmDebounce);
      ME.cmDebounce = setTimeout(meSyncFromCode, 800);
    });
  }
}

function meSyncToCode() {
  const html = meGetFullHtml();
  if (ME.cm) { ME.cm.setValue(html); return; }
  const ta = document.getElementById('meCodeEditor');
  if (ta) ta.value = html;
}

function meSyncFromCode() {
  const html = ME.cm ? ME.cm.getValue() : (document.getElementById('meCodeEditor')?.value || '');
  ME.blocks = [{ id: 'raw', type: 'raw', props: { html } }];
  meRenderCanvas();
  meRenderProps();
}

function meFormatCode() {
  if (!ME.cm) return;
  const raw = ME.cm.getValue();
  try {
    const formatted = raw
      .replace(/>\s*</g, '>\n<')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join('\n');
    ME.cm.setValue(formatted);
  } catch(e) {}
}

function meCopyCode() {
  const html = ME.cm ? ME.cm.getValue() : (document.getElementById('meCodeEditor')?.value || '');
  navigator.clipboard?.writeText(html).then(() => toast('HTML copied', 'success', 1500))
    .catch(() => toast('Copy failed', 'error'));
}

/* ── Merge Tags ─────────────────────────────────────────────────── */
function meRenderMergeTags() {
  const wrap = document.getElementById('meMergeTags');
  if (!wrap) return;
  wrap.innerHTML = CP.headers.map(h =>
    `<button class="merge-tag-chip" onclick="meInsertMergeTag('{{${h}}}')">{{${h}}}</button>`
  ).join('');
}

/* ── AI & Preview ───────────────────────────────────────────────── */
function meToggleAiPanel() {
  const panel = document.getElementById('meAiPanel');
  if (panel) panel.classList.toggle('open');
}

function meUpdatePreview() {
  const iframe = document.getElementById('mePreviewIframe');
  if (!iframe) return;
  const html = meGetFullHtml();
  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open(); doc.write(html); doc.close();
  } catch(e) {}
  setTimeout(resizeMailPreview, 200);
}

/* ── Preview Sync ──────────────────────────────────────────────── */
function meSyncToPreview() {
  const iframes = [
    document.getElementById('mePreviewIframe'),
  ].filter(Boolean);
  const html = meGenerateHTML();
  iframes.forEach(iframe => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      doc.open(); doc.write(html); doc.close();
    } catch(e) {}
  });
  resizeMailPreview();
}

function resizeMailPreview() {
  const iframes = [
    document.getElementById('mePreviewIframe'),
    document.getElementById('mPreviewIframe'),
  ].filter(Boolean);
  iframes.forEach(iframe => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || !doc.body) return;
      const h = Math.max(doc.body.scrollHeight, 300);
      iframe.style.height = h + 'px';
    } catch(e) {}
  });
}

/* ── Device Toggle ─────────────────────────────────────────────── */
function meSetDevice(d) {
  ME.previewDevice = d;
  const wrap = document.getElementById('mePreviewBox');
  if (wrap) wrap.classList.toggle('mobile', d === 'mobile');
  const sizer = document.getElementById('mePreviewSizer');
  if (sizer) sizer.style.maxWidth = d === 'mobile' ? '375px' : '600px';
  document.getElementById('mBtnDesktop')?.classList.toggle('active', d === 'desktop');
  document.getElementById('mBtnMobile')?.classList.toggle('active', d === 'mobile');
  setTimeout(resizeMailPreview, 350);
}

function mSetDeviceS6(d) {
  const box = document.getElementById('mPrvBoxS6');
  if (box) box.style.maxWidth = d === 'mobile' ? '375px' : '600px';
  document.getElementById('mBtnDesktopS6')?.classList.toggle('active', d === 'desktop');
  document.getElementById('mBtnMobileS6')?.classList.toggle('active', d === 'mobile');
  setTimeout(resizeMailPreview, 350);
}

/* ── Merge Tags ────────────────────────────────────────────────── */
function populateStep5MergeTags() {
  meRenderMergeTags();
}

function meInsertMergeTag(tag) {
  if (ME.activeTab === 'code' && ME.cm) {
    ME.cm.replaceSelection(tag);
    ME.cm.focus();
    return;
  }
  // Try to insert into focused subject field
  const subj = document.getElementById('mSubject');
  if (document.activeElement === subj) {
    const s = subj.selectionStart, e = subj.selectionEnd;
    subj.value = subj.value.slice(0, s) + tag + subj.value.slice(e);
    subj.setSelectionRange(s + tag.length, s + tag.length);
    return;
  }
  // Visual mode: insert into selected text block
  const sel = ME.blocks.find(b => b.id === ME.selectedId && (b.type === 'text' || b.type === 'button'));
  if (sel) {
    if (sel.type === 'text')   sel.props.text   = (sel.props.text   || '') + tag;
    if (sel.type === 'button') sel.props.label  = (sel.props.label  || '') + tag;
    meRenderProps();
    meSyncToCode();
    toast(`Inserted ${tag}`, 'success', 1000);
    return;
  }
  toast('Select a text or button block first, then click a tag', 'warn');
}


async function meRunAi() {
  const prompt = document.getElementById('meAiPrompt').value.trim();
  const result = document.getElementById('meAiResult');
  if (!prompt) { toast('Enter an AI prompt first', 'warn'); return; }
  result.style.display = 'block';
  result.textContent   = '✨ Generating…';
  try {
    if (typeof supabase === 'undefined') throw new Error('No Supabase');
    const current = meGenerateHTML();
    const { data, error } = await supabase.functions.invoke('ai-email-assist', {
      body: { prompt, currentHtml: current },
    });
    if (error) throw error;
    const html = data?.html || '';
    if (html) {
      ME.blocks = [{ id: 'raw', type: 'raw_html', props: { html } }];
      meSyncToCode();
      result.textContent = '✅ Applied! Switched to AI-generated HTML.';
      toast('AI email generated', 'success');
    } else {
      result.textContent = data?.message || 'No response from AI.';
    }
  } catch(e) {
    result.textContent = '⚠ AI unavailable. ' + (e.message || '');
    console.error(e);
  }
}

/* ════════════════════════════════════════════════════════════════
   STEP 6: REVIEW & LAUNCH
════════════════════════════════════════════════════════════════ */
function populateStep6() {
  rebuildMappings();
  // Summary grid
  const grid = document.getElementById('mSummaryGrid');
  const nc   = document.getElementById('colName')?.value;
  const ec   = document.getElementById('colEmail')?.value;
  if (grid) {
    grid.innerHTML = [
      ['Campaign', CP.campaignName],
      ['Participants', CP.rows.length],
      ['Email Column', ec || '—'],
      ['Template', ME.selectedTemplate?.name || 'Custom'],
      ['Subject', document.getElementById('mSubject')?.value || '—'],
      ['Certificate Fields', ED.fields.filter(f => !f.isStatic).length],
      ['Certificates', `${CP.rows.length} PDFs`],
    ].map(([k, v]) => `
      <div class="summary-item">
        <div class="summary-item-label">${k}</div>
        <div class="summary-item-val">${v}</div>
      </div>`).join('');
  }

  // Recipients list
  const list = document.getElementById('mRecipientList');
  const countLabel = document.getElementById('mSendCountLabel');
  if (list) {
    const ec2 = CP.headers.indexOf(ec);
    const nc2 = CP.headers.indexOf(nc || '');
    list.innerHTML = CP.rows.map((row, i) => {
      const name  = nc2 >= 0 ? row[nc2] : `Participant ${i + 1}`;
      const email = ec2 >= 0 ? row[ec2] : '—';
      return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:7px;background:rgba(255,255,255,0.02);border:1px solid transparent;transition:background 0.15s" onmouseenter="this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.background='rgba(255,255,255,0.02)'">
        <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,rgba(0,212,255,0.2),rgba(124,58,237,0.2));border:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-2);flex-shrink:0">
          ${(name.charAt(0) || '#').toUpperCase()}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
          <div style="font-size:11.5px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${email}</div>
        </div>
        <div style="font-size:11px;color:var(--text-3);flex-shrink:0">#${i + 1}</div>
      </div>`;
    }).join('');
    if (countLabel) countLabel.textContent = `(${CP.rows.length})`;
  }

  // Personalised preview – first row
  CP.previewIdx = 0;
  mUpdatePersonalisedPreview();
}

/* ── Personalised Preview Navigation ──────────────────────────── */
function mNavNext() {
  if (CP.previewIdx < CP.rows.length - 1) { CP.previewIdx++; mUpdatePersonalisedPreview(); }
}
function mNavPrev() {
  if (CP.previewIdx > 0) { CP.previewIdx--; mUpdatePersonalisedPreview(); }
}

function mUpdatePersonalisedPreview() {
  const nav   = document.getElementById('mPrvNav');
  const toEl  = document.getElementById('mFinalTo');
  const subEl = document.getElementById('mFinalSubject');
  const iframe= document.getElementById('mPreviewIframe');

  const i   = CP.previewIdx;
  const row = CP.rows[i];
  if (!row) return;

  const ec = CP.headers.indexOf(document.getElementById('colEmail')?.value || '');
  const email   = ec >= 0 ? row[ec] : '—';
  const subject = mPersonalise(document.getElementById('mSubject')?.value || '', i);
  const html    = meGenerateHTML(i);

  if (nav)    nav.textContent = `${i + 1} / ${CP.rows.length}`;
  if (toEl)   toEl.textContent   = email;
  if (subEl)  subEl.textContent  = subject;

  if (iframe) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      doc.open(); doc.write(html); doc.close();
    } catch(e) {}
    setTimeout(resizeMailPreview, 200);
  }
}

/* ── Personalize merge tags ────────────────────────────────────── */
function mPersonalise(str, rowIdx) {
  if (!str) return str;
  const row = CP.rows[rowIdx];
  if (!row) return str;
  return CP.headers.reduce((s, h, ci) => s.replace(new RegExp(`{{${h}}}`, 'g'), row[ci] || ''), str);
}

/* ════════════════════════════════════════════════════════════════
   STEP 6b / 7: SEND ENGINE
════════════════════════════════════════════════════════════════ */
async function mStartSend() {
  if (!validateStep(6)) return;

  const ec = document.getElementById('colEmail')?.value;
  if (!ec) { toast('No Email column selected', 'error'); return; }

  // Switch to sending panel
  document.getElementById('sp6').classList.remove('active');
  document.getElementById('sp6b').classList.add('active');
  CP.step = '6b';
  updateStepper();

  const subjectTpl = document.getElementById('mSubject').value;
  const total      = CP.rows.length;
  const eci        = CP.headers.indexOf(ec);
  const delay      = 1200; // ms between sends
  CP.results       = [];

  // Job info card
  document.getElementById('mJobInfo').innerHTML = [
    ['Campaign',     CP.campaignName],
    ['Participants', total],
    ['Template',     ME.selectedTemplate?.name || 'Custom'],
  ].map(([k, v]) => `
    <div class="summary-item">
      <div class="summary-item-label">${k}</div>
      <div class="summary-item-val">${v}</div>
    </div>`).join('');

  document.getElementById('mSendCounter').textContent = `0 / ${total}`;

  for (let i = 0; i < total; i++) {
    const row    = CP.rows[i];
    const email  = row[eci] || '';
    const name   = getPrimaryName(i);
    const subject= mPersonalise(subjectTpl, i);
    const html   = meGenerateHTML(i);

    document.getElementById('mSendStatus').textContent  = `Sending to ${email}…`;
    document.getElementById('mSendCounter').textContent = `${i + 1} / ${total}`;
    const pct = Math.round(((i + 1) / total) * 100);
    document.getElementById('mSendBar').style.width   = pct + '%';
    document.getElementById('mSendPct').textContent   = pct + '%';

    let status = 'sent', error = '';
    const t0 = Date.now();

    try {
      // Step 1: Generate certificate PDF as base64
      const certCanvas = renderCertForRow(i);
      const certBlob   = await canvasToBlob(certCanvas);
      const certB64    = await blobToBase64(certBlob);
      const certName   = `${name.replace(/\s+/g, '_')}_Certificate.pdf`;

      // Step 2: Send email via Supabase edge function
      if (typeof supabase !== 'undefined') {
        const { error: sendErr } = await supabase.functions.invoke('send-cert-email', {
          body: {
            to:          email,
            subject:     subject,
            html:        html,
            attachment:  certB64,
            filename:    certName,
            campaign:    CP.campaignName,
          }
        });
        if (sendErr) throw sendErr;
      } else {
        // Dev-mode: simulate
        await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
        if (Math.random() < 0.03) throw new Error('Simulated failure');
      }
    } catch(e) {
      status = 'failed';
      error  = e.message || 'Unknown error';
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    CP.results.push({ idx: i, name, email, subject, status, error, elapsed });

    // Log entry
    appendSendLog(name, email, status, elapsed);

    // Google Sheets writeback
    if (status === 'sent' && CP.writebackEnabled && CP.sheetId) {
      writebackToSheet(i, 'Sent');
    }

    // Wait between sends (except last)
    if (i < total - 1) await new Promise(r => setTimeout(r, delay));
  }

  // Done — go to results
  CP.step = 7;
  updateStepper();
  document.getElementById('sp6b').classList.remove('active');
  document.getElementById('sp7').classList.add('active');
  populateResults();
  saveCampaign();
}

function appendSendLog(name, email, status, elapsed) {
  const log  = document.getElementById('mSendLog');
  const time = new Date().toLocaleTimeString();
  const icon = status === 'sent'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const entry = document.createElement('div');
  entry.className = `log-entry ${status}`;
  entry.innerHTML = `${icon}
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      <strong>${name}</strong> · ${email}
    </span>
    <span style="flex-shrink:0;font-family:var(--font-mono);font-size:10px;color:var(--text-3)">${elapsed}s · ${time}</span>`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

/* ── Writeback ─────────────────────────────────────────────────── */
async function writebackToSheet(rowIdx, value) {
  try {
    if (typeof supabase === 'undefined') return;
    await supabase.functions.invoke('sheets-writeback', {
      body: { sheetId: CP.sheetId, rowIdx, value }
    });
  } catch(e) { console.warn('Writeback:', e); }
}

/* ── Results ───────────────────────────────────────────────────── */
function populateResults() {
  const sent   = CP.results.filter(r => r.status === 'sent').length;
  const failed = CP.results.filter(r => r.status === 'failed').length;
  const total  = CP.results.length;
  const rate   = total ? Math.round((sent / total) * 100) : 0;

  document.getElementById('rTotal').textContent  = total;
  document.getElementById('rSent').textContent   = sent;
  document.getElementById('rFailed').textContent = failed;
  document.getElementById('rRate').textContent   = rate + '%';

  const ring = document.getElementById('mCompRing');
  if (failed > 0 && sent === 0) {
    ring.style.background = 'linear-gradient(135deg,#ef4444,#f97316)';
    ring.style.boxShadow  = '0 0 40px rgba(239,68,68,0.3)';
    document.getElementById('mCompTitle').textContent = 'Send Completed with Errors';
  } else if (failed > 0) {
    ring.style.background = 'linear-gradient(135deg,#f59e0b,#10b981)';
    ring.style.boxShadow  = '0 0 40px rgba(245,158,11,0.3)';
    document.getElementById('mCompTitle').textContent = 'Mostly Successful!';
  }
  document.getElementById('mCompSub').textContent =
    `${sent} email${sent !== 1 ? 's' : ''} sent with certificate${sent !== 1 ? 's' : ''} · ${failed} failed`;

  // Report table
  const tbody = document.getElementById('mReportBody');
  tbody.innerHTML = CP.results.map((r, i) => `
    <tr>
      <td style="text-align:center;color:var(--text-3);font-size:12px">${i + 1}</td>
      <td style="font-weight:600">${r.name}</td>
      <td style="color:var(--text-2);font-family:var(--font-mono);font-size:12px">${r.email}</td>
      <td style="font-size:12px;color:var(--text-2)">${r.name.replace(/\s+/g, '_')}_Certificate.pdf</td>
      <td>
        <span class="badge ${r.status === 'sent' ? 'badge-green' : 'badge-red'}">
          ${r.status === 'sent'
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><polyline points="20 6 9 17 4 12"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`}
          ${r.status}
        </span>
        ${r.error ? `<div style="font-size:10px;color:var(--red);margin-top:2px">${r.error}</div>` : ''}
      </td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-3)">${r.elapsed}s</td>
    </tr>`).join('');
}

function mDownloadReport() {
  if (!CP.results.length) { toast('No results to download', 'warn'); return; }
  const headers = ['#', 'Name', 'Email', 'Certificate', 'Status', 'Error', 'Time(s)', 'Timestamp'];
  const rows    = CP.results.map((r, i) => [
    i + 1, r.name, r.email,
    `${r.name.replace(/\s+/g, '_')}_Certificate.pdf`,
    r.status, r.error || '',
    r.elapsed,
    new Date().toISOString(),
  ]);
  const csv  = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${CP.campaignName || 'campaign'}_report.csv`;
  a.click();
  toast('Report downloaded', 'success');
}

function mNewCampaign() {
  if (!confirm('Start a new campaign? All current progress will be reset.')) return;
  Object.assign(CP, {
    step: 1, srcType: 'sheets', headers: [], rows: [], sheetId: null,
    campaignName: '', previewIdx: 0, results: [], fieldMappings: [],
  });
  Object.assign(ME, { blocks: [], selectedId: null, nextId: 1, selectedTemplate: null });
  Object.assign(ED, { fields: [], selId: null, bgImg: null, bgBase64: null, bgColor: '#ffffff' });
  document.getElementById('campaignName').value = '';
  document.getElementById('mSubject').value = '';
  document.getElementById('meEditorWrap').style.display = 'none';
  document.getElementById('meEditorWrap').classList.remove('visible');
  document.getElementById('meTplGate').style.display = 'block';
  drawCanvas(); drawOverlay();
  renderFieldChips();
  ['sheetsResult','fileResult','manualResult','hxFormResult','colMapCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  goStep(1, true);
  toast('Ready for new campaign', 'success');
}

/* ── Save Campaign to Supabase ─────────────────────────────────── */
async function saveCampaign() {
  try {
    if (typeof supabase === 'undefined') return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const sent   = CP.results.filter(r => r.status === 'sent').length;
    const failed = CP.results.filter(r => r.status === 'failed').length;
    await supabase.from('campaigns').insert({
      user_id:     user.id,
      name:        CP.campaignName,
      template:    ME.selectedTemplate?.name || 'Custom',
      total:       CP.results.length,
      sent,
      failed,
      created_at:  new Date().toISOString(),
    });
  } catch(e) { console.warn('saveCampaign:', e); }
}

/* ════════════════════════════════════════════════════════════════
   CANVAS / BLOB UTILITIES
════════════════════════════════════════════════════════════════ */
function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ════════════════════════════════════════════════════════════════
   TOAST NOTIFICATION
════════════════════════════════════════════════════════════════ */
function toast(msg, type = 'info', dur = 3200) {
  const container = document.getElementById('toastContainer');
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    warn:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, dur);
}

/* ════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  // Canvas shortcuts when on step 2
  if (CP.step === 2) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && ED.selId && !e.target.closest('input, textarea')) {
      e.preventDefault(); deleteSelField();
    }
    if (e.key === 'd' && (e.ctrlKey || e.metaKey) && ED.selId) {
      e.preventDefault(); duplicateSelField();
    }
    // Arrow nudge
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && ED.selId) {
      e.preventDefault();
      const step = e.shiftKey ? 2 : 0.5;
      const f = ED.fields.find(f => f.id === ED.selId);
      if (!f) return;
      if (e.key === 'ArrowLeft')  f.x -= step;
      if (e.key === 'ArrowRight') f.x += step;
      if (e.key === 'ArrowUp')    f.y -= step;
      if (e.key === 'ArrowDown')  f.y += step;
      drawCanvas(); drawOverlay();
      const px = document.getElementById('pX'); if (px) px.value = f.x.toFixed(1);
      const py = document.getElementById('pY'); if (py) py.value = f.y.toFixed(1);
    }
  }
  // Escape deselects
  if (e.key === 'Escape') {
    if (ED.selId) { selectField(null); }
  }
});

/* ════════════════════════════════════════════════════════════════
   RESIZE OBSERVER — keep canvas wrapper scrollable
════════════════════════════════════════════════════════════════ */
window.addEventListener('resize', () => {
  if (CP.step === 2) resizeCanvas();
});