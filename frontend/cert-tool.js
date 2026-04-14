/* ================================================================
   Honourix v2 — Certificate Generator
   cert-tool.js
   ================================================================ */

/* ── App State ─────────────────────────────────────────────────── */
const CS = {
  step: 1,
  totalSteps: 6,
  srcType: 'sheets',
  headers: [],
  rows: [],        // [{Name:'', Email:'', ...}, ...]
  fieldMappings: [], // [{col:'', ph:''}]
  results: [],
  jobId: null,
  pollTimer: null,
};

/* ── Canvas Editor State ────────────────────────────────────────── */
let canvas, ctx, fieldOverlay;
const ED = {
  w: 1122, h: 794,
  bgImg: null, bgBase64: null, bgColor: '#ffffff',
  fields: [],
  selId: null,
  scale: 1,
};

const STEPS = [
  { label: 'Data Source' },
  { label: 'Design Template' },
  { label: 'Field Mapping' },
  { label: 'Preview' },
  { label: 'Generate' },
  { label: 'Results' },
];

/* ════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarMount').outerHTML = renderSidebar('cert-tool.html');
  initSidebar();
  buildStepper();
  initCanvas();
  loadSavedTemplate();
  lucide.createIcons();
});

/* ── Build Stepper ──────────────────────────────────────────────── */
function buildStepper() {
  const el = document.getElementById('stepper');
  el.innerHTML = STEPS.map((s, i) => {
    const n = i + 1;
    const isActive = n === CS.step;
    return `
      ${n > 1 ? `<div class="step-connector" id="sc${n}"></div>` : ''}
      <div class="step-node ${isActive ? 'active' : ''}" id="sn${n}">
        <div class="step-circle" id="scircle${n}">${n}</div>
        <div class="step-label">
          <div class="step-num-label">Step ${n}</div>
          <div class="step-title">${s.label}</div>
        </div>
      </div>`;
  }).join('');
}

function updateStepper() {
  STEPS.forEach((_, i) => {
    const n = i + 1;
    const node = document.getElementById(`sn${n}`);
    const circle = document.getElementById(`scircle${n}`);
    const conn = document.getElementById(`sc${n}`);
    if (!node) return;

    node.className = `step-node ${n < CS.step ? 'done' : n === CS.step ? 'active' : ''}`;
    if (n < CS.step) {
      circle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else {
      circle.textContent = n;
    }
    if (conn) conn.className = `step-connector ${n <= CS.step ? 'done' : ''}`;
  });
}

/* ── Navigation ─────────────────────────────────────────────────── */
function goStep(n, force = false) {
  if (!force && !validateStep(CS.step)) return;
  CS.step = n;
  updateStepper();
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`sp${n}`).classList.add('active');

  if (n === 2) setTimeout(resizeCanvas, 100);
  if (n === 3) populateStep3();
  if (n === 4) buildPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(n) {
  if (n === 1) {
    if (!document.getElementById('campaignName').value.trim()) { toast('Please enter a campaign name', 'error'); return false; }
    if (CS.rows.length === 0) { toast('Please load participant data first', 'error'); return false; }
  }
  if (n === 2) {
    if (ED.fields.length === 0) { toast('Please add at least one text field to your template', 'warning'); return false; }
  }
  if (n === 3) {
    if (!document.getElementById('nameCol').value) { toast('Please select the Name column', 'error'); return false; }
    if (!document.getElementById('emailCol').value) { toast('Please select the Email column', 'error'); return false; }
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   STEP 1 — DATA SOURCE
════════════════════════════════════════════════════════════════ */
function switchSrc(type) {
  CS.srcType = type;
  document.getElementById('srcSheets').style.display = type === 'sheets' ? 'block' : 'none';
  document.getElementById('srcFile').style.display   = type === 'file'   ? 'block' : 'none';
  document.getElementById('srcSheetsOpt').className  = 'source-opt' + (type === 'sheets' ? ' active' : '');
  document.getElementById('srcFileOpt').className    = 'source-opt' + (type === 'file'   ? ' active' : '');
}

async function loadSheet() {
  const id  = document.getElementById('sheetId').value.trim();
  if (!id) { toast('Paste your Sheet ID first', 'error'); return; }
  const btn = document.getElementById('loadSheetBtn');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = await apiFetch(`/api/sheets/read?sheetId=${encodeURIComponent(id)}&range=Sheet1`);
    if (!data?.data?.length || data.data.length < 2) { toast('Sheet is empty or has no data rows', 'warning'); return; }
    CS.headers = data.data[0].map(h => h.toString().trim());
    CS.rows    = data.data.slice(1).map(row => Object.fromEntries(CS.headers.map((h, i) => [h, row[i] || ''])));
    renderSheetPreview();
    toast(`Loaded ${CS.rows.length} participants`, 'success');
  } catch (e) {
    toast('Could not load sheet: ' + e.message, 'error');
  } finally { btn.classList.remove('loading'); btn.disabled = false; }
}

function renderSheetPreview() {
  const el = document.getElementById('sheetResult');
  const preview = CS.rows.slice(0, 5);
  el.innerHTML = `
    <div class="notice notice-green" style="margin-bottom:12px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Sheet loaded — <strong>${CS.rows.length} participants</strong>, ${CS.headers.length} columns detected</span>
    </div>
    <div class="data-table-wrap">
      <table>
        <thead><tr>${CS.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${preview.map(r => `<tr>${CS.headers.map(h => `<td>${r[h]||''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    ${CS.rows.length > 5 ? `<div style="padding:10px 16px;font-size:13px;color:var(--text-3);text-align:center">+${CS.rows.length - 5} more rows not shown</div>` : ''}
  `;
  el.style.display = 'block';
}

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: r => {
      CS.headers = r.meta.fields; CS.rows = r.data; showFilePreview(file.name);
    }});
  } else if (['xlsx', 'xls'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = e2 => {
      const wb  = XLSX.read(e2.target.result, { type: 'array' });
      const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      CS.headers = Object.keys(arr[0] || {}); CS.rows = arr; showFilePreview(file.name);
    };
    reader.readAsArrayBuffer(file);
  } else { toast('Use .csv, .xlsx or .xls', 'error'); }
}

function showFilePreview(name) {
  document.getElementById('fileResult').innerHTML = `
    <div class="notice notice-green" style="margin-bottom:12px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span><strong>${name}</strong> — ${CS.rows.length} rows, ${CS.headers.length} columns</span>
    </div>`;
  document.getElementById('fileResult').style.display = 'block';
  toast(`Loaded ${CS.rows.length} participants from file`, 'success');
}

// Drag & drop
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); handleFile({ target: { files: e.dataTransfer.files } }); });
});

/* ════════════════════════════════════════════════════════════════
   STEP 2 — CANVAS EDITOR
════════════════════════════════════════════════════════════════ */
function initCanvas() {
  canvas       = document.getElementById('certCanvas');
  ctx          = canvas.getContext('2d');
  fieldOverlay = document.getElementById('fieldOverlay');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const wrap = document.getElementById('canvasWrap');
  if (!wrap) return;
  const maxW = wrap.clientWidth  - 48;
  const maxH = wrap.clientHeight - 48;
  ED.scale = Math.min(maxW / ED.w, maxH / ED.h, 1);
  const cw = Math.round(ED.w * ED.scale);
  const ch = Math.round(ED.h * ED.scale);
  const container = document.getElementById('canvasContainer');
  if (container) { container.style.width = cw + 'px'; container.style.height = ch + 'px'; }
  canvas.width  = cw;
  canvas.height = ch;
  redraw();
}

function redraw() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (ED.bgImg) {
    ctx.drawImage(ED.bgImg, 0, 0, w, h);
  } else {
    ctx.fillStyle = ED.bgColor;
    ctx.fillRect(0, 0, w, h);
  }
  renderHandles();
}

/* ── Field Handles ──────────────────────────────────────────────── */
function renderHandles() {
  if (!fieldOverlay) return;
  fieldOverlay.innerHTML = '';
  ED.fields.forEach(f => {
    const x = (f.x / 100) * canvas.width;
    const y = (f.y / 100) * canvas.height;
    const w = (f.width / 100) * canvas.width;
    const fs = f.fontSize * ED.scale;
    const bold = (f.fontFamily || '').toLowerCase().includes('bold');

    const el = document.createElement('div');
    el.className = 'text-field-handle' + (f.id === ED.selId ? ' selected' : '');
    el.id = 'hdl_' + f.id;
    el.style.cssText = `left:${x}px;top:${y}px;font-size:${fs}px;font-family:${getFontCSS(f.fontFamily || 'Helvetica')};color:${f.color||'#000'};font-weight:${bold?700:400};text-align:${f.align||'left'};width:${w}px;line-height:1.2;`;
    el.textContent = f.previewText || f.placeholder;

    const del = document.createElement('div');
    del.className = 'field-del';
    del.innerHTML = '×';
    del.onclick = e => { e.stopPropagation(); deleteField(f.id); };
    el.appendChild(del);

    el.addEventListener('mousedown', e => { e.stopPropagation(); selectField(f.id); startDrag(e, f, el); });
    fieldOverlay.appendChild(el);
  });
  renderFieldList();
}

/* ── Drag ─────────────────────────────────────────────────────── */
function startDrag(e, field, el) {
  const sx = e.clientX, sy = e.clientY;
  const sfx = field.x, sfy = field.y;
  const mm = ev => {
    field.x = Math.max(0, Math.min(95, sfx + ((ev.clientX - sx) / canvas.width) * 100));
    field.y = Math.max(0, Math.min(95, sfy + ((ev.clientY - sy) / canvas.height) * 100));
    el.style.left = (field.x / 100 * canvas.width)  + 'px';
    el.style.top  = (field.y / 100 * canvas.height) + 'px';
    if (field.id === ED.selId) {
      const px = document.getElementById('propX'), py = document.getElementById('propY');
      if (px) px.value = field.x.toFixed(1);
      if (py) py.value = field.y.toFixed(1);
    }
  };
  const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

/* ── Add Field ─────────────────────────────────────────────────── */
function openAddFieldModal() {
  document.getElementById('addFieldModal').classList.add('open');
}
function closeAddFieldModal() {
  document.getElementById('addFieldModal').classList.remove('open');
}

function addField() {
  let ph = document.getElementById('newFieldPh').value;
  if (ph === 'custom') {
    const custom = document.getElementById('customPhInput').value.trim();
    if (!custom) { toast('Enter a custom placeholder', 'error'); return; }
    ph = '{{' + custom.replace(/[{}]/g, '') + '}}';
  }
  const prev = document.getElementById('newFieldPreview').value.trim();
  const size = parseInt(document.getElementById('newFieldSize').value) || 36;
  const previews = { '{{name}}':'John Smith','{{course}}':'Web Development','{{date}}':'March 2026','{{score}}':'95%','{{email}}':'john@example.com','{{org}}':'NIT Trichy' };

  const field = {
    id: 'f_' + Date.now(),
    placeholder: ph,
    previewText: prev || previews[ph] || ph.replace(/[{}]/g, ''),
    column: '',
    x: 10, y: 35 + ED.fields.length * 14,
    width: 80, fontSize: size,
    fontFamily: 'Helvetica', color: '#1a1a1a', align: 'center',
  };
  ED.fields.push(field);
  closeAddFieldModal();
  selectField(field.id);
  toast(`Added ${ph} field`, 'success', 2000);
}

/* ── Select / Delete Field ──────────────────────────────────────── */
function selectField(id) {
  ED.selId = id;
  const f = ED.fields.find(f => f.id === id);
  if (!f) return;

  switchErTab('props');
  document.getElementById('noFieldMsg').style.display  = 'none';
  document.getElementById('fieldProps').style.display  = 'flex';

  document.getElementById('propPlaceholder').value = f.placeholder;
  document.getElementById('propPreview').value     = f.previewText || '';
  document.getElementById('propFont').value        = f.fontFamily;
  document.getElementById('propSize').value        = f.fontSize;
  document.getElementById('propColor').value       = f.color;
  document.getElementById('propColorHex').textContent = f.color;
  document.getElementById('propX').value           = f.x.toFixed(1);
  document.getElementById('propY').value           = f.y.toFixed(1);
  document.getElementById('propWidth').value       = f.width;

  ['alignLeft','alignCenter','alignRight'].forEach(b => document.getElementById(b).classList.remove('active'));
  const btn = f.align === 'center' ? 'alignCenter' : f.align === 'right' ? 'alignRight' : 'alignLeft';
  document.getElementById(btn).classList.add('active');
  renderHandles();
}

function deleteField(id) {
  ED.fields = ED.fields.filter(f => f.id !== id);
  if (ED.selId === id) {
    ED.selId = null;
    const nm = document.getElementById('noFieldMsg');
    const fp = document.getElementById('fieldProps');
    if (nm) nm.style.display = '';
    if (fp) fp.style.display = 'none';
  }
  renderHandles();
}

function deleteSelectedField() { if (ED.selId) deleteField(ED.selId); }

function updateFieldProp(key, val) {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f[key] = val;
  if (key === 'color') document.getElementById('propColorHex').textContent = val;
  renderHandles();
}

function updateFieldFromProp() {
  const f = ED.fields.find(f => f.id === ED.selId);
  if (!f) return;
  f.x = parseFloat(document.getElementById('propX').value) || f.x;
  f.y = parseFloat(document.getElementById('propY').value) || f.y;
  renderHandles();
}

function setAlign(align) {
  updateFieldProp('align', align);
  ['alignLeft','alignCenter','alignRight'].forEach(b => document.getElementById(b).classList.remove('active'));
  const btn = align === 'center' ? 'alignCenter' : align === 'right' ? 'alignRight' : 'alignLeft';
  document.getElementById(btn).classList.add('active');
}

/* ── Right Panel Tab ─────────────────────────────────────────────── */
function switchErTab(tab) {
  ['fields','props'].forEach(t => {
    document.getElementById(`erTab_${t}`).className   = 'er-tab' + (t === tab ? ' active' : '');
    document.getElementById(`erPanel_${t}`).className = 'er-panel' + (t === tab ? ' active' : '');
  });
}

/* ── Field List in "Fields" tab ─────────────────────────────────── */
function renderFieldList() {
  const list = document.getElementById('fieldList');
  if (!list) return;
  if (!ED.fields.length) {
    list.innerHTML = `<div class="empty-state" style="padding:32px 12px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><h3>No fields yet</h3><p>Click "+ Add Field" to start.</p></div>`;
    return;
  }
  list.innerHTML = ED.fields.map(f => `
    <div class="field-chip ${f.id === ED.selId ? 'selected' : ''}" onclick="selectField('${f.id}')">
      <div class="field-chip-dot" style="background:${f.color}"></div>
      <span class="field-chip-label">${f.previewText || f.placeholder}</span>
      <span class="field-chip-tag">${f.placeholder}</span>
    </div>`).join('');
}

/* ── Background ──────────────────────────────────────────────────── */
function uploadBackground(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => { ED.bgImg = img; ED.bgBase64 = ev.target.result; redraw(); toast('Background uploaded', 'success', 2000); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function changeBgColor() { ED.bgColor = document.getElementById('bgColor').value; if (!ED.bgImg) redraw(); }
function clearBackground() { ED.bgImg = null; ED.bgBase64 = null; document.getElementById('bgUpload').value = ''; redraw(); toast('Background removed', 'info', 2000); }
function changeCanvasSize() {
  const [w, h] = document.getElementById('canvasSize').value.split(',').map(Number);
  ED.w = w; ED.h = h; resizeCanvas();
}
function clearAll() {
  if (!ED.fields.length && !ED.bgImg) return;
  ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null;
  const nm = document.getElementById('noFieldMsg'), fp = document.getElementById('fieldProps');
  if (nm) nm.style.display = ''; if (fp) fp.style.display = 'none';
  redraw(); toast('Canvas cleared', 'info', 2000);
}

/* ── Save / Load Template ────────────────────────────────────────── */
function saveTemplate() {
  localStorage.setItem('hx_template', JSON.stringify({ w: ED.w, h: ED.h, bgColor: ED.bgColor, backgroundBase64: ED.bgBase64,  fields: ED.fields }));
}

function loadSavedTemplate() {
  const raw = localStorage.getItem('hx_template');
  if (!raw) return;
  try {
    const t = JSON.parse(raw);
    ED.w = t.w || 1122; ED.h = t.h || 794;
    ED.bgColor = t.bgColor || '#ffffff';
    ED.fields  = t.fields  || [];
    if (t.bgBase64) { const img = new Image(); img.onload = () => { ED.bgImg = img; redraw(); }; img.src = t.bgBase64; ED.bgBase64 = t.bgBase64; }
    resizeCanvas();
    if (t.fields?.length) toast('Previous template restored', 'info', 2500);
  } catch {}
}

/* ════════════════════════════════════════════════════════════════
   STEP 3 — FIELD MAPPING
════════════════════════════════════════════════════════════════ */
function populateStep3() {
  saveTemplate();
  const opts = CS.headers.map(h => `<option value="${h}">${h}</option>`).join('');
  ['nameCol','emailCol'].forEach(id => {
    document.getElementById(id).innerHTML = `<option value="">Select column…</option>${opts}`;
  });
  const ng = CS.headers.find(h => /name/i.test(h));
  const eg = CS.headers.find(h => /email|mail/i.test(h));
  if (ng) document.getElementById('nameCol').value  = ng;
  if (eg) document.getElementById('emailCol').value = eg;

  // Column hint list
  const hints = CS.headers.map(h => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--glass-border)">
      <span style="width:7px;height:7px;background:var(--cyan);border-radius:50%;flex-shrink:0"></span>
      <span style="font-size:14px;color:var(--text)">${h}</span>
    </div>`).join('');
  const ch = document.getElementById('colsListHint');
  if (ch) ch.innerHTML = hints;

  // Detected tags from template
  const tags = ED.fields.map(f => f.placeholder);
  const tagEl = document.getElementById('detectedTagsList');
  if (tagEl) tagEl.textContent = tags.join(', ') || 'none';

  // Refresh mapping dropdowns
  document.querySelectorAll('.map-col-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">Sheet column…</option>${opts}`;
    if (cur) sel.value = cur;
  });
}

function addMapping() {
  CS.fieldMappings.push({ col: '', ph: '' });
  renderMappingRows();
  document.getElementById('noMappingsMsg').style.display = 'none';
}

function renderMappingRows() {
  const opts  = CS.headers.map(h => `<option value="${h}">${h}</option>`).join('');
  const tags  = ED.fields.map(f => f.placeholder.replace(/[{}]/g, '')).filter(Boolean);
  const tagOpts = tags.map(t => `<option value="${t}">{{${t}}}</option>`).join('');
  const container = document.getElementById('fieldMappings');
  container.innerHTML = CS.fieldMappings.map((m, i) => `
    <div class="field-map-row">
      <select class="form-select map-col-select" onchange="CS.fieldMappings[${i}].col=this.value">
        <option value="">Sheet column…</option>${opts}
        ${m.col ? `<option value="${m.col}" selected>${m.col}</option>` : ''}
      </select>
      <svg class="field-map-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      <select class="form-select map-col-select" onchange="CS.fieldMappings[${i}].ph=this.value">
        <option value="">Template tag…</option>${tagOpts}
        ${m.ph ? `<option value="${m.ph}" selected>{{${m.ph}}}</option>` : ''}
      </select>
      <button class="field-map-remove" onclick="removeMapping(${i})" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function removeMapping(i) {
  CS.fieldMappings.splice(i, 1);
  renderMappingRows();
  if (!CS.fieldMappings.length) document.getElementById('noMappingsMsg').style.display = 'flex';
}

/* ════════════════════════════════════════════════════════════════
   STEP 4 — PREVIEW
════════════════════════════════════════════════════════════════ */
function buildPreview() {
  const name  = document.getElementById('nameCol').value;
  const email = document.getElementById('emailCol').value;
  const count = CS.rows.length;
  const camp  = document.getElementById('campaignName').value;

  document.getElementById('participantBadge').textContent = `${count} participants`;
  document.getElementById('genCountLabel').textContent    = `(${count})`;

  const items = [
    { k: 'Campaign', v: camp },
    { k: 'Participants', v: `${count}` },
    { k: 'Name column', v: name },
    { k: 'Email column', v: email },
    { k: 'Template fields', v: `${ED.fields.length} fields` },
    { k: 'Canvas size', v: `${ED.w}×${ED.h}px` },
    { k: 'Write links back', v: document.getElementById('writeBackToggle').classList.contains('on') ? 'Yes' : 'No' },
    { k: 'Sheet ID', v: document.getElementById('sheetId')?.value?.slice(0,12) + '…' || 'CSV file' },
  ];
  document.getElementById('summaryGrid').innerHTML = items.map(i =>
    `<div class="summary-item"><div class="summary-key">${i.k}</div><div class="summary-val">${i.v}</div></div>`
  ).join('');

  const cols = [name, email, ...CS.fieldMappings.filter(m => m.col).map(m => m.col)];
  const rows = CS.rows.slice(0, 12);
  document.getElementById('previewTableWrap').innerHTML = `
    <div class="data-table-wrap">
      <table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${r[c]||''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    ${count > 12 ? `<div style="padding:10px 16px;font-size:13px;color:var(--text-3);text-align:center">+${count-12} more rows</div>` : ''}
  `;

  const allMaps = [{ col: name, ph: 'name' }, { col: email, ph: 'email' }, ...CS.fieldMappings.filter(m => m.col && m.ph)];
  document.getElementById('mappingsReview').innerHTML = allMaps.map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:var(--glass);border-radius:8px">
      <span style="font-size:14px;color:var(--text);font-weight:500">${m.col}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      <code style="background:var(--purple-dim);color:var(--purple-2);padding:2px 9px;border-radius:5px;font-size:12.5px;font-family:var(--font-mono)">{{${m.ph}}}</code>
    </div>`).join('');

  document.getElementById('jobSummary').innerHTML = items.slice(0, 4).map(i =>
    `<div class="summary-item"><div class="summary-key">${i.k}</div><div class="summary-val">${i.v}</div></div>`
  ).join('');
}

/* ════════════════════════════════════════════════════════════════
   STEP 5 — GENERATE
════════════════════════════════════════════════════════════════ */
async function startGeneration() {
  goStep(5, true);
  const total = CS.rows.length;
  document.getElementById('genCounter').textContent = `0 / ${total}`;
  log('info', 'Preparing certificate generation job…');

  const payload = {
    campaignName:  document.getElementById('campaignName').value,
    template: {
    width: ED.w,
    height: ED.h,
    backgroundBase64: ED.bgBase64,   // ← only rename the KEY, not the value
    bgColor: ED.bgColor,
    fields: ED.fields,
    fontUrls: getUsedFontUrls(),
    },
    participants:  CS.rows,
    nameCol:       document.getElementById('nameCol').value,
    emailCol:      document.getElementById('emailCol').value,
    fieldMappings: CS.fieldMappings.filter(m => m.col && m.ph),
    sheetId:       document.getElementById('sheetId')?.value || null,
    writeBack:     document.getElementById('writeBackToggle').classList.contains('on'),
  };

  try {
    const res = await apiFetch('/api/certificates/generate', { method: 'POST', body: JSON.stringify(payload) });
    CS.results = res.results || [];
    CS.results.forEach((r, i) => {
      setTimeout(() => {
        const done = i + 1;
        const pct = Math.round(done / total * 100);
        document.getElementById('genCounter').textContent = `${done} / ${total}`;
        document.getElementById('genBar').style.width = pct + '%';
        document.getElementById('genPct').textContent  = pct + '%';
        document.getElementById('genStatus').textContent = `Processing… ${pct}% complete`;
        r.status === 'success' ? log('ok', `Generated: ${r.name}`) : log('err', `Failed: ${r.name} — ${r.error}`);
        if (done === total) setTimeout(() => showResults(), 600);
      }, i * 80);
    });
  } catch (e) {
    log('err', 'Generation failed: ' + e.message);
    toast('Failed: ' + e.message, 'error');
  }
}

function log(type, msg) {
  const win = document.getElementById('genLog');
  const ts  = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el  = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-ts">${ts}</span><span class="log-${type}">${msg}</span>`;
  win.appendChild(el);
  win.scrollTop = win.scrollHeight;
}

/* ════════════════════════════════════════════════════════════════
   STEP 6 — RESULTS
════════════════════════════════════════════════════════════════ */
function showResults() {
  goStep(6, true);
  const ok  = CS.results.filter(r => r.status === 'success').length;
  const bad = CS.results.filter(r => r.status !== 'success').length;
  document.getElementById('resTotal').textContent   = CS.results.length;
  document.getElementById('resSuccess').textContent = ok;
  document.getElementById('resFailed').textContent  = bad;
  document.getElementById('resultTitle').textContent = bad === 0 ? 'All certificates generated!' : `${ok} generated, ${bad} failed`;
  document.getElementById('resultSub').textContent   = `${ok} PDFs saved to your Google Drive.`;
  if (bad > 0) {
    document.getElementById('completionRing').style.background = 'linear-gradient(135deg,#f59e0b,#ef4444)';
    document.getElementById('completionRing').style.boxShadow  = '0 0 40px rgba(245,158,11,0.3)';
  }
  renderResultRows(CS.results);
  
// After results are received in generateCertificates()
saveCampaign('cert', CS.campaignName || 'Certificate Run', results.length, results.filter(r=>r.status==='success').length, folderLink);
  toast(`${ok} certificates ready!`, 'success', 5000);
}

function renderResultRows(results) {
  const el = document.getElementById('resultRows');
  el.innerHTML = results.map(r => `
    <div class="result-grid" data-n="${r.name}" data-e="${r.email||''}">
      <div style="font-weight:600;color:var(--text);font-size:14.5px">${r.name}</div>
      <div style="color:var(--text-2);font-size:14px">${r.email||'—'}</div>
      <div style="min-width:0">
        ${r.status === 'success'
          ? `<a href="${r.link}" target="_blank" style="color:var(--cyan);font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.link}</a>`
          : `<span style="color:var(--red);font-size:13px">${r.error||'Failed'}</span>`}
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        ${r.status === 'success' ? `
          <button class="icon-btn" onclick="copyToClipboard('${r.link}','Link')" title="Copy link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <a href="${r.link}" target="_blank" class="icon-btn" title="Open PDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>` : `<span class="badge badge-red">Failed</span>`}
      </div>
    </div>`).join('');
}

function filterResults() {
  const q = document.getElementById('resultSearch').value.toLowerCase();
  document.querySelectorAll('#resultRows .result-grid').forEach(row => {
    const match = !q || (row.dataset.n||'').toLowerCase().includes(q) || (row.dataset.e||'').toLowerCase().includes(q);
    row.style.display = match ? '' : 'none';
  });
}

function downloadResults() {
  downloadCSV(CS.results.map(r => ({ Name: r.name, Email: r.email||'', Status: r.status, 'Certificate Link': r.link||'', Error: r.error||'' })), `Honourix-certs-${Date.now()}.csv`);
}

function startNew() {
  if (!window.confirm('Start a new campaign? Current results will be cleared.')) return;
  CS.rows = []; CS.results = []; CS.fieldMappings = [];
  document.getElementById('campaignName').value = '';
  const sid = document.getElementById('sheetId'); if (sid) sid.value = '';
  document.getElementById('sheetResult').style.display = 'none';
  ED.fields = []; ED.selId = null;
  redraw();
  goStep(1, true);
}