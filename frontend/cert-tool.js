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
function getFontCSS(name) {
  // FONT_CSS_MAP is declared in dashboard.js — reuse it
  if (typeof FONT_CSS_MAP !== 'undefined' && FONT_CSS_MAP[name]) {
    return FONT_CSS_MAP[name];
  }
  return `'${name}', Helvetica, sans-serif`;
}



function getUsedFontUrls() {
  const urls = {};
  ED.fields.forEach(f => {
    const name = f.fontFamily || 'Helvetica';
    if (FONT_URLS[name]) urls[name] = FONT_URLS[name];
  });
  return urls;
}

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
    const unmapped = ED.fields.filter(f => !f.column);
    if (unmapped.length) { toast('Please map all fields before continuing', 'error'); return false; }
    if (!ED.fields.some(f => f.isPrimary)) { toast('Please star one field as Primary (for filename)', 'error'); return false; }
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   STEP 1 — DATA SOURCE
════════════════════════════════════════════════════════════════ */
function switchSrc(type) {
  CS.srcType = type;
  ['srcSheets', 'srcFile', 'srcManual', 'srcHxForm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['srcSheetsOpt', 'srcFileOpt', 'srcManualOpt', 'srcHxFormOpt'].forEach(id => {
    const el = document.getElementById(id); if (el) el.className = 'src-opt';
  });
  if (type === 'sheets') {
    document.getElementById('srcSheets').style.display = 'block';
    document.getElementById('srcSheetsOpt').className  = 'src-opt active';
  } else if (type === 'file') {
    document.getElementById('srcFile').style.display = 'block';
    document.getElementById('srcFileOpt').className  = 'src-opt active';
  } else if (type === 'manual') {
    document.getElementById('srcManual').style.display = 'block';
    document.getElementById('srcManualOpt').className  = 'src-opt active';
    if (document.getElementById('manualBody').children.length === 0) {
      manualAddRow(); manualAddRow();
    }
  } else if (type === 'hxform') {
    document.getElementById('srcHxForm').style.display = 'block';
    document.getElementById('srcHxFormOpt').className  = 'src-opt active';
    loadHxFormList_cert();
  }
}

async function loadHxFormList_cert() {
  const sel = document.getElementById('hxFormSelect');
  if (!sel || sel.dataset.loaded) return;
  try {
    const token = localStorage.getItem('Honourix_token');
    const res   = await fetch('https://certiflow-backend-73xk.onrender.com/api/hxdb/summary', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const { forms } = await res.json();
    const eligible  = (forms || []).filter(f => f.submissionCount > 0);
    sel.innerHTML = '<option value="">Select a form…</option>' +
      eligible.map(f => `<option value="${f.id}">${f.name} (${f.submissionCount} responses)</option>`).join('');
    if (!eligible.length) sel.innerHTML = '<option value="">No forms with submissions yet</option>';
    sel.dataset.loaded = '1';
  } catch { sel.innerHTML = '<option value="">Could not load — check login</option>'; }
}

async function loadHxFormData(formId) {
  if (!formId) return;
  const sel = document.getElementById('hxFormSelect');
  const el  = document.getElementById('hxFormResult');
  sel.disabled = true;
  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border:1px solid var(--glass-border);border-radius:10px;background:var(--glass);margin-top:4px;font-size:14px;color:var(--text-2)">
    <svg style="flex-shrink:0;animation:spin 0.9s linear infinite" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
    Loading form data…
  </div>`;
  el.style.display = 'block';
  try {
    const token = localStorage.getItem('Honourix_token');
    const res   = await fetch(`https://certiflow-backend-73xk.onrender.com/api/hxdb/data/${formId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    if (!data.rows?.length) { toast('No submissions in this form yet', 'warning'); return; }
    CS.headers     = data.headers;
    CS.rows        = data.rows.map(r => Object.fromEntries(data.headers.map((h, i) => [h, r[i] || ''])));
    window.allCols = CS.headers;
    const el       = document.getElementById('hxFormResult');
    const preview  = CS.rows.slice(0, 5);
    el.innerHTML = `<div class="notice notice-green" style="margin-bottom:12px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span><strong>${CS.rows.length} submissions</strong> loaded from <strong>${data.formName}</strong> — ${CS.headers.length} columns</span>
    </div>
    <div style="width:100%;box-sizing:border-box;overflow:auto;max-height:260px;border:1px solid var(--glass-border);border-radius:10px;margin-top:4px;scrollbar-width:thin;scrollbar-color:var(--glass-border-2) transparent">
      <table style="width:max-content;min-width:100%;border-collapse:collapse">
        <thead><tr style="position:sticky;top:0;z-index:1;background:var(--surface)">${CS.headers.map(h => `<th style="padding:10px 14px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--glass-border)">${h}</th>`).join('')}</tr></thead>
        <tbody>${preview.map(r => `<tr style="border-top:1px solid var(--glass-border)">${CS.headers.map(h => `<td style="padding:10px 14px;font-size:13.5px;color:var(--text-2);white-space:nowrap">${r[h]||''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    ${CS.rows.length > 5 ? `<div style="padding:10px 16px;font-size:13px;color:var(--text-3);text-align:center">+${CS.rows.length - 5} more rows not shown</div>` : ''}`;
    el.style.display = 'block';
    toast(`${CS.rows.length} responses ready`, 'success');
    } catch(e) {
    el.style.display = 'none';
    toast('Could not load: ' + e.message, 'error');
  } finally { sel.disabled = false; }
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
    <div style="width:100%;box-sizing:border-box;overflow:auto;max-height:260px;border:1px solid var(--glass-border);border-radius:10px;margin-top:4px;scrollbar-width:thin;scrollbar-color:var(--glass-border-2) transparent">
      <table style="width:max-content;min-width:100%;border-collapse:collapse">
        <thead><tr style="position:sticky;top:0;z-index:1;background:var(--surface)">${CS.headers.map(h => `<th style="padding:10px 14px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--glass-border)">${h}</th>`).join('')}</tr></thead>
        <tbody>${preview.map(r => `<tr style="border-top:1px solid var(--glass-border)">${CS.headers.map(h => `<td style="padding:10px 14px;font-size:13.5px;color:var(--text-2);white-space:nowrap">${r[h]||''}</td>`).join('')}</tr>`).join('')}</tbody>
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
  const preview = CS.rows.slice(0, 5);
  document.getElementById('fileResult').innerHTML = `
    <div class="notice notice-green" style="margin-bottom:12px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span><strong>${name}</strong> — ${CS.rows.length} rows, ${CS.headers.length} columns</span>
    </div>
    <div style="width:100%;box-sizing:border-box;overflow:auto;max-height:260px;border:1px solid var(--glass-border);border-radius:10px;margin-top:4px;scrollbar-width:thin;scrollbar-color:var(--glass-border-2) transparent">
      <table style="width:max-content;min-width:100%;border-collapse:collapse">
        <thead><tr style="position:sticky;top:0;z-index:1;background:var(--surface)">${CS.headers.map(h => `<th style="padding:10px 14px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--glass-border)">${h}</th>`).join('')}</tr></thead>
        <tbody>${preview.map(r => `<tr style="border-top:1px solid var(--glass-border)">${CS.headers.map(h => `<td style="padding:10px 14px;font-size:13.5px;color:var(--text-2);white-space:nowrap">${r[h]||''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    ${CS.rows.length > 5 ? `<div style="padding:10px 16px;font-size:13px;color:var(--text-3);text-align:center">+${CS.rows.length - 5} more rows not shown</div>` : ''}`;
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
  ED.ready     = true;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}
function resizeCanvas() {
  const zone = document.getElementById('canvasWrap');
  if (!zone) return;

  const zw = zone.clientWidth;
  const zh = zone.clientHeight;
  if (zw < 10) { setTimeout(resizeCanvas, 50); return; }

  ED.scale = Math.min((zw - 48) / ED.w, (Math.max(zh - 48, 200)) / ED.h, 1);

  const cw = Math.round(ED.w * ED.scale);
  const ch = Math.round(ED.h * ED.scale);
  const dpr = window.devicePixelRatio || 1;

  const cont = document.getElementById('canvasContainer');
  if (cont) {
    cont.style.width = cw + 'px';
    cont.style.height = ch + 'px';
  }

  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  ED.ready = true;
  redraw();
}

function redrawCanvas() {
  const w = Math.round(ED.w * ED.scale);
  const h = Math.round(ED.h * ED.scale);

  ctx.clearRect(0, 0, w, h);

  if (ED.bgImg) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ED.bgImg, 0, 0, w, h);
  } else {
    ctx.fillStyle = ED.bgColor;
    ctx.fillRect(0, 0, w, h);
  }

  ED.fields.forEach(f => {
    const boxX = (f.x / 100) * w;
    const boxY = (f.y / 100) * h;
    const boxW = (f.width / 100) * w;
    const fs   = Math.max(4, f.fontSize * ED.scale);
    const ls   = (f.letterSpacing || 0) * ED.scale;
    const fw   = f.bold ? 700 : getFontWeight(f.fontFamily || 'Helvetica');
    const fi   = f.italic ? 'italic' : 'normal';
    const ff   = getFontCSS(f.fontFamily || 'Helvetica');

    const value = (f.column && CS.rows && CS.rows[0])
      ? (CS.rows[0][f.column] || f.previewText || f.placeholder)
      : (f.previewText || f.placeholder);

    ctx.save();
    
    // Apply Canvas rotation to match the CSS bounding box perfectly
    const cx = boxX + boxW / 2;
    const cy = boxY + (fs * 1.3) / 2;
    ctx.translate(cx, cy);
    ctx.rotate((f.rotation || 0) * Math.PI / 180);
    ctx.translate(-cx, -cy);

    ctx.font = `${fi} ${fw} ${fs}px ${ff}`;
    ctx.fillStyle = f.color || '#1a1a1a';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let textW = ctx.measureText(value).width;
    if (ls > 0 && value.length > 1) textW += ls * (value.length - 1);

    let drawX = boxX;
    if ((f.align || 'center') === 'center') drawX = boxX + (boxW - textW) / 2;
    else if (f.align === 'right') drawX = boxX + boxW - textW;

    if (ls > 0 && value.length > 1) {
      let drawCx = drawX;
      for (const ch of value) {
        ctx.fillText(ch, drawCx, boxY);
        drawCx += ctx.measureText(ch).width + ls;
      }
    } else {
      ctx.fillText(value, drawX, boxY);
    }
    ctx.restore();
  });
}

function redraw() {
  redrawCanvas();
  renderHandles();
}

/* ── Field Handles ──────────────────────────────────────────────── */
function renderHandles() {
  if (!fieldOverlay) return;
  fieldOverlay.innerHTML = '';
  ED.fields.forEach(f => {
    const cw = Math.round(ED.w * ED.scale);
    const ch = Math.round(ED.h * ED.scale);
    const x = (f.x / 100) * cw;
    const y = (f.y / 100) * ch;
    const w = (f.width / 100) * cw;
    const fs = Math.max(6, f.fontSize * ED.scale);
    const h = Math.round(fs * 1.3);

    const cx = x + w / 2;
    const cy = y + h / 2;

    const el = document.createElement('div');
    el.className = 'tf-handle' + (f.id === ED.selId ? ' sel' : '');
    el.dataset.fid = f.id;
    
    // Apply center-based positioning to allow smooth CSS rotation
    el.style.cssText = `left:${cx}px;top:${cy}px;width:${w}px;height:${h}px;transform:translate(-50%, -50%) rotate(${f.rotation || 0}deg);background:transparent;color:transparent;`;

    // Modern Delete Button
    const del = document.createElement('div');
    del.className = 'tf-del-btn';
    del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    del.addEventListener('mousedown', e => { e.stopPropagation(); deleteField(f.id); });
    el.appendChild(del);

    // Resize Handle (Bottom Right)
    const resizer = document.createElement('div');
    resizer.className = 'tf-resizer br';
    resizer.addEventListener('mousedown', e => { e.stopPropagation(); startResize(e, f); });
    el.appendChild(resizer);

    // Rotate Handle (Top Center)
    const rotLine = document.createElement('div');
    rotLine.className = 'tf-rotater-line';
    const rotater = document.createElement('div');
    rotater.className = 'tf-rotater';
    rotater.addEventListener('mousedown', e => { e.stopPropagation(); startRotate(e, f); });
    el.appendChild(rotLine);
    el.appendChild(rotater);

    // Drag/Move
    el.addEventListener('mousedown', e => { 
        if (e.target === el) {
            e.stopPropagation(); e.preventDefault(); selectField(f.id); startDrag(e, f); 
        }
    });
    fieldOverlay.appendChild(el);
  });
  renderChipList();
}

// New Resize Logic
function startResize(e, field) {
  selectField(field.id);
  const startX = e.clientX;
  const startW = field.width;
  const startSize = field.fontSize;
  const dispW = Math.round(ED.w * ED.scale);

  const mm = ev => {
    const dx = ev.clientX - startX;
    const deltaPct = (dx / dispW) * 100;
    const scaleRatio = Math.max(0.1, (startW + deltaPct) / startW);
    field.width = startW * scaleRatio;
    field.fontSize = Math.max(8, Math.round(startSize * scaleRatio));
    redraw();
    if (field.id === ED.selId) {
      const pW = document.getElementById('pW'); if(pW) pW.value = field.width.toFixed(1);
      const pSize = document.getElementById('pSize'); if(pSize) pSize.value = field.fontSize;
      const pSizeVal = document.getElementById('pSizeVal'); if(pSizeVal) pSizeVal.textContent = field.fontSize + 'px';
    }
  };
  const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

// New Rotate Logic
function startRotate(e, field) {
  selectField(field.id);
  const handleEl = fieldOverlay.querySelector(`[data-fid="${field.id}"]`);
  const rect = handleEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const mm = ev => {
    const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    // Native Math.atan2 is 0 at right (3 o'clock). Handle points up (-90deg). Add 90.
    field.rotation = Math.round((angle + 90) % 360);
    redraw();
  };
  const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
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
function loadFontIfNeeded(name) {
  if (!FONT_URLS[name]) return;
  const id = 'gfont_' + name.replace(/\s+/g, '_');
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet'; link.href = FONT_URLS[name];
  document.head.appendChild(link);
}

/* ── Drag ─────────────────────────────────────────────────────── */
function startDrag(e, field) {
  const startX = e.clientX;
  const startY = e.clientY;
  const startFieldX = field.x;
  const startFieldY = field.y;
  
  const dispW = Math.round(ED.w * ED.scale);
  const dispH = Math.round(ED.h * ED.scale);

  const mm = ev => {
    // Calculate raw mouse movement distance
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    
    // Convert to percentages and apply directly
    field.x = startFieldX + (dx / dispW) * 100;
    field.y = startFieldY + (dy / dispH) * 100;
    
    // Update the right-side properties panel coordinates instantly
    if (field.id === ED.selId) {
      const pX = document.getElementById('pX'); if(pX) pX.value = field.x.toFixed(1);
      const pY = document.getElementById('pY'); if(pY) pY.value = field.y.toFixed(1);
    }
    
    // Redraw graphics and handles
    redraw();
    renderHandles();
  };

  const mu = () => { 
    document.removeEventListener('mousemove', mm); 
    document.removeEventListener('mouseup', mu); 
    saveTemplate(); 
  };
  
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

/* ── Add Field ─────────────────────────────────────────────────── */
function openAFModal() {
  // Populate column dropdown from imported data
  const sel = document.getElementById('afColSelect');
  sel.innerHTML = '<option value="">— Select a column —</option>';
  if (CS.headers && CS.headers.length) {
    CS.headers.forEach(h => {
      const o = document.createElement('option');
      o.value = h; o.textContent = h;
      sel.appendChild(o);
    });
  }
  // Reset fields
  document.getElementById('afPhInner').value = '';
  document.getElementById('afColHint').style.display = 'none';
  document.getElementById('newFieldSize').value = 36;
  document.getElementById('afPrimary').checked = ED.fields.length === 0; // auto-check for first field
  document.getElementById('afFilePreview').textContent = 'Alex_01.pdf';
  document.getElementById('afOverlay').classList.add('open');
}
function closeAFModal() { document.getElementById('afOverlay').classList.remove('open'); }
function openAddFieldModal()  { openAFModal(); }
function closeAddFieldModal() { closeAFModal(); }
/* ── File Naming Modal ─────────────────────────────── */
function fnRefreshNamePill() {
  const primary = ED.fields.find(f => f.isPrimary);
  const sampleName = primary && CS.rows && CS.rows[0]
    ? (CS.rows[0][primary.column] || primary.placeholder.replace(/[{}]/g,''))
    : 'participant_name';
  const pill = document.getElementById('fnNamePill');
  if (pill) pill.textContent = sampleName;
  fnUpdatePreview();
}

function fnUpdatePreview() {
  const primary = ED.fields.find(f => f.isPrimary);
  const sampleName = primary && CS.rows && CS.rows[0]
    ? sanitizeFilename(CS.rows[0][primary.column] || 'Name')
    : 'Name';
  const eventInput = document.getElementById('fnEventInput');
  const event = eventInput ? eventInput.value.trim() : '';
  const eventPart = event ? '_' + sanitizeFilename(event) : '';
  const preview = document.getElementById('fnPreviewText');
  if (preview) preview.textContent = sampleName + eventPart + '_01.pdf';
  const sep = document.getElementById('fnSepNum');
  if (sep) sep.style.display = event ? 'none' : '';
}

function sanitizeFilename(str) {
  return String(str).replace(/[^a-zA-Z0-9_\-\u0900-\u097F\u00C0-\u024F]/g, '_').replace(/_+/g,'_').replace(/^_|_$/g,'');
}

function buildOutputFilename(rowData, index) {
  const primary = ED.fields.find(f => f.isPrimary);
  const name = primary ? sanitizeFilename(rowData[primary.column] || 'cert') : 'cert';
  const event = CS.eventName ? '_' + sanitizeFilename(CS.eventName) : '';
  const num = String(index + 1).padStart(2, '0');
  return `${name}${event}_${num}.pdf`;
}
function afColumnChanged(col) {
  if (!col) return;
  // Auto-suggest placeholder from column name
  const suggested = col.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  document.getElementById('afPhInner').value = suggested;
  // Show sample value from Row 0
  const sample = CS.rows && CS.rows[0] ? (CS.rows[0][col] || '') : '';
  const hint = document.getElementById('afColHint');
  if (sample) {
    hint.textContent = 'Sample value from row 1: "' + sample + '"';
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
  afPhInput(suggested);
}

function afPhInput(val) {
  const clean = val.replace(/[{}]/g, '').trim();
  const sample = document.getElementById('afColSelect').value && CS.rows && CS.rows[0]
    ? (CS.rows[0][document.getElementById('afColSelect').value] || clean || 'Alex')
    : (clean || 'Alex');
  document.getElementById('afFilePreview').textContent = (sample || 'Alex') + '_01.pdf';
}

function addField() {
  const colSel  = document.getElementById('afColSelect');
  const phInner = document.getElementById('afPhInner').value.trim().replace(/[{}]/g, '');
  const col     = colSel.value;
  const size    = parseInt(document.getElementById('newFieldSize').value) || 36;
  const isPrimary = document.getElementById('afPrimary').checked;

  if (!phInner) { toast('Enter a placeholder name', 'error'); return; }

  const ph = '{{' + phInner + '}}';

  // Derive live previewText from Row 0 data
  const previewText = col && CS.rows && CS.rows[0] ? (CS.rows[0][col] || phInner) : phInner;

  // If marking as primary, unmark others
  if (isPrimary) ED.fields.forEach(f => { f.isPrimary = false; });

  const field = {
    id: 'f_' + Date.now(),
    placeholder: ph,
    previewText,
    column: col,
    isPrimary,
    x: 10, y: 35 + ED.fields.length * 14,
    width: 80, fontSize: size,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
    align: 'center',
    bold: false,
    italic: false,
    letterSpacing: 0,
  };
  ED.fields.push(field);
  closeAFModal();
  if (!canvas.width) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resizeCanvas();
      selectField(field.id);
      redraw();
    }));
  } else {
    selectField(field.id);
    redraw();
  }
  toast(`Added ${ph} field`, 'success', 2000);
}

/* ── Select / Delete Field ──────────────────────────────────────── */
function selectField(id) {
  ED.selId = id;
  const f = ED.fields.find(f => f.id === id); if (!f) return;
  switchEPTab('props');
  document.getElementById('propsEmpty').style.display = 'none';
  document.getElementById('propsForm').style.display  = 'flex';
  document.getElementById('pPh').value    = f.placeholder;
  const livePreview = (f.column && CS.rows && CS.rows[0]) ? (CS.rows[0][f.column] || f.previewText || '') : (f.previewText || '');
  document.getElementById('pPrev').value = livePreview;
  document.getElementById('pPrev').style.color = (f.column && CS.rows && CS.rows[0]) ? 'var(--cyan)' : 'var(--text)';
  document.getElementById('pPrev').title = f.column ? 'Live value from row 1 of your data' : 'Manual preview text';
  document.getElementById('pFont').value  = f.fontFamily || 'Helvetica';
  document.getElementById('pSize').value  = f.fontSize;
  document.getElementById('pSizeVal').textContent = f.fontSize + 'px';
  document.getElementById('pColor').value = f.color || '#111111';
  document.getElementById('pColorHex').textContent = f.color || '#111111';
  document.getElementById('pX').value     = f.x.toFixed(1);
  document.getElementById('pY').value     = f.y.toFixed(1);
  document.getElementById('pW').value     = f.width;
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
  if (ED.selId === id) { ED.selId = null; hideProps(); }
  renderHandles();
  renderChipList();
  redraw(); // FIX: Force the canvas to wipe the deleted text immediately
  saveTemplate();
}
function deleteSelectedField() { if (ED.selId) deleteField(ED.selId); }
function deleteSelField()      { if (ED.selId) deleteField(ED.selId); }
function setFP(key, val) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f[key] = val; if (key === 'color') document.getElementById('pColorHex').textContent = val; redraw(); }
function setFPFont(name) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.fontFamily = name; loadFontIfNeeded(name); updateFontPreview(name, f.bold, f.italic); redraw(); }
function setFPXY() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.x = parseFloat(document.getElementById('pX').value)||f.x; f.y = parseFloat(document.getElementById('pY').value)||f.y; redraw(); }
function setAlign(a) { setFP('align', a); ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('on')); document.getElementById(a==='center'?'alC':a==='right'?'alR':'alL').classList.add('on'); }
function toggleBold()   { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.bold   = !f.bold;   document.getElementById('boldBtn').classList.toggle('on', f.bold);   redraw(); }
function toggleItalic() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.italic = !f.italic; document.getElementById('italicBtn').classList.toggle('on', f.italic); redraw(); }
function switchEPTab(tab) { ['fields','props'].forEach(t => { document.getElementById(`epTab_${t}`).className = 'ep-tab'+(t===tab?' active':''); document.getElementById(`epPanel_${t}`).className = 'ep-panel'+(t===tab?' active':''); }); }
function renderChipList() {
  const el = document.getElementById('fieldChipList'); if (!el) return;
  if (!ED.fields.length) { el.innerHTML = `<div style="text-align:center;padding:28px 8px;color:var(--text-3);font-size:13px">No fields yet.<br/><span style="color:var(--cyan)">Click "+ Add Field"</span></div>`; return; }
  el.innerHTML = ED.fields.map(f => `<div class="fc-chip ${f.id===ED.selId?'sel':''}" onclick="selectField('${f.id}')"><div class="fc-dot" style="background:${f.color}"></div><div style="flex:1;min-width:0"><span class="fc-name">${f.previewText||f.placeholder}</span><span class="fc-ph">${f.placeholder}${f.column?' → '+f.column:''}</span></div>${f.isPrimary?'<span style="font-size:10px;font-weight:700;color:var(--cyan);background:var(--cyan-dim);border:1px solid rgba(0,212,255,0.25);border-radius:4px;padding:1px 5px;flex-shrink:0">PRIMARY</span>':''}</div>`).join('');
}
/* ── Background ──────────────────────────────────────────────────── */
function uploadBackground(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast('Please upload a valid image file', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => { ED.bgImg = img; ED.bgBase64 = ev.target.result; redraw(); toast('Background uploaded', 'success', 2000); };
    img.onerror = () => toast('Invalid image file — try a different file', 'error');
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
    // FIX: Force fields to be totally empty on load so old campaign text doesn't carry over
    ED.fields  = [];
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
  buildStep3();
  fnRefreshNamePill();
}

function buildStep3() {
  const rows  = document.getElementById('s3Rows');
  const empty = document.getElementById('s3Empty');
  const count = document.getElementById('s3FieldCount');

  // Rebuild the column hint list on the right panel
  const hints = CS.headers.map(h => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--glass-border)">
      <span style="width:7px;height:7px;background:var(--cyan);border-radius:50%;flex-shrink:0"></span>
      <span style="font-size:14px;color:var(--text)">${h}</span>
    </div>`).join('');
  const ch = document.getElementById('colsListHint');
  if (ch) ch.innerHTML = hints || '<span style="color:var(--text-3);font-size:13px">No columns loaded yet.</span>';

  if (!ED.fields.length) {
    if (rows)  rows.style.display  = 'none';
    if (empty) empty.style.display = 'block';
    if (count) count.textContent   = '0 fields';
    buildStep3Writeback();
    return;
  }

  if (empty) empty.style.display = 'none';
  if (rows)  rows.style.display  = 'flex';
  if (count) count.textContent   = `${ED.fields.length} field${ED.fields.length > 1 ? 's' : ''}`;

  const opts = CS.headers.map(h => `<option value="${h}">${h}</option>`).join('');

  rows.innerHTML = ED.fields.map((f, i) => {
    const isLast = i === ED.fields.length - 1;
    const colOpts = `<option value="">— choose column —</option>${CS.headers.map(h =>
      `<option value="${h}" ${f.column === h ? 'selected' : ''}>${h}</option>`
    ).join('')}`;

    return `
    <div style="display:grid;grid-template-columns:1fr auto 1fr auto;align-items:center;gap:12px;padding:14px 18px;${!isLast ? 'border-bottom:1px solid var(--glass-border)' : ''}">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <div style="width:8px;height:8px;border-radius:50%;background:${f.isPrimary ? 'var(--cyan)' : 'var(--glass-border)'};flex-shrink:0;transition:background 0.2s"></div>
        <code style="font-family:var(--font-mono);font-size:13px;color:var(--cyan);background:rgba(0,212,255,0.08);padding:4px 10px;border-radius:6px;white-space:nowrap">${f.placeholder}</code>
        ${f.isPrimary ? '<span style="font-size:10.5px;padding:2px 7px;background:rgba(0,212,255,0.12);border:1px solid rgba(0,212,255,0.25);border-radius:12px;color:var(--cyan);font-weight:700;letter-spacing:.03em;flex-shrink:0">PRIMARY</span>' : ''}
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-3);flex-shrink:0"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      <select class="form-select" style="font-size:13.5px;padding:9px 32px 9px 12px" onchange="s3ColChanged('${f.id}', this.value)">
        ${colOpts}
      </select>
      <div title="Set as primary field (used for PDF filename)"
        onclick="s3SetPrimary('${f.id}')"
        style="width:32px;height:32px;border-radius:8px;border:1px solid ${f.isPrimary ? 'rgba(0,212,255,0.4)' : 'var(--glass-border)'};background:${f.isPrimary ? 'rgba(0,212,255,0.08)' : 'var(--glass)'};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.18s;flex-shrink:0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${f.isPrimary ? 'var(--cyan)' : 'none'}" stroke="${f.isPrimary ? 'var(--cyan)' : 'var(--text-3)'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </div>
    </div>`;
  }).join('');

  buildStep3Writeback();
}

function s3ColChanged(fieldId, colValue) {
  const f = ED.fields.find(x => x.id === fieldId);
  if (f) { f.column = colValue; renderCanvas(); }
}

function s3SetPrimary(fieldId) {
  ED.fields.forEach(f => f.isPrimary = (f.id === fieldId));
  buildStep3();
}

function buildStep3Writeback() {
  const badge   = document.getElementById('s3WritebackBadge');
  const desc    = document.getElementById('s3WritebackDesc');
  const options = document.getElementById('s3WritebackOptions');
  const isGS    = CS.srcType === 'sheets';

  if (!badge || !desc) return;

  if (isGS) {
    badge.textContent = 'Active';
    badge.style.cssText = 'font-size:11px;padding:3px 9px;border-radius:20px;font-weight:600;background:rgba(0,212,255,0.1);color:var(--cyan);border:1px solid rgba(0,212,255,0.25)';
    desc.textContent = 'After generation, certificate links will be written back to your Google Sheet as a new column at the end of your data.';
    if (options) options.style.display = 'block';
  } else {
    const srcLabel = CS.srcType === 'file' ? 'CSV/Excel upload' : CS.srcType === 'manual' ? 'manual entry' : CS.srcType === 'hxform' ? 'HX Form' : 'this source';
    badge.textContent = 'N/A for this source';
    badge.style.cssText = 'font-size:11px;padding:3px 9px;border-radius:20px;font-weight:600;background:rgba(255,255,255,0.04);color:var(--text-3);border:1px solid var(--glass-border)';
    desc.textContent = `Write-back is only available when data is imported via Google Sheets ID. You imported data via ${srcLabel}, so this option is not applicable.`;
    if (options) options.style.display = 'none';
  }
}

function validateStep3() {
  const unmapped = ED.fields.filter(f => !f.column);
  if (unmapped.length) {
    toast(`Please map a column for: ${unmapped.map(f => f.placeholder).join(', ')}`, 'error');
    return;
  }
  const hasPrimary = ED.fields.some(f => f.isPrimary);
  if (!hasPrimary) {
    toast('Please star (★) one field as Primary — it will be used for the PDF filename.', 'error');
    return;
  }
  // Save event name from the inline card input, then proceed
  CS.eventName = (document.getElementById('fnEventInput')?.value || '').trim();
  goStep(4);
}

/* ════════════════════════════════════════════════════════════════
   STEP 4 — PREVIEW
════════════════════════════════════════════════════════════════ */
// tracks which cert is currently shown in preview
let certPrevIndex = 0;

function buildPreview() {
  const count = CS.rows.length;
  const camp  = document.getElementById('campaignName').value;

  document.getElementById('participantBadge').textContent = `${count} participant${count !== 1 ? 's' : ''}`;
  document.getElementById('genCountLabel').textContent    = `(${count})`;

  // -- Summary grid (removed email col + sheet ID, added est. size) --
  const b64clean = ED.bgBase64 ? ED.bgBase64.split(',')[1] || ED.bgBase64 : null;
  const bgKB = b64clean ? Math.round(b64clean.length * 0.75 / 1024) : 0;
  const estMB = bgKB > 0 ? ((bgKB * count * 1.15) / 1024).toFixed(1) : '—';
  const items = [
    { k: 'Campaign',        v: camp },
    { k: 'Participants',    v: `${count}` },
    { k: 'Template fields', v: `${ED.fields.length} field${ED.fields.length !== 1 ? 's' : ''}` },
    { k: 'Canvas size',     v: `${ED.w} × ${ED.h} px` },
    { k: 'Est. total size', v: `~${estMB} MB (approx)` },
    { k: 'Write links back',v: document.getElementById('writeBackToggle')?.classList.contains('on') ? 'Yes' : 'No' },
  ];
  document.getElementById('summaryGrid').innerHTML = items.map(i =>
    `<div class="summary-item"><div class="summary-key">${i.k}</div><div class="summary-val">${i.v}</div></div>`
  ).join('');

  // -- Mappings review panel (right sidebar) --
  document.getElementById('mappingsReview').innerHTML = ED.fields.map(f => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:var(--glass);border-radius:8px">
      <span style="font-size:13.5px;color:var(--text);font-weight:500">${f.column || '—'}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      <code style="background:rgba(0,212,255,0.08);color:var(--cyan);padding:2px 9px;border-radius:5px;font-size:12px;font-family:var(--font-mono)">${f.placeholder}</code>
    </div>`).join('');

  // -- Job summary (step 5 sidebar) --
  document.getElementById('jobSummary').innerHTML = items.slice(0, 4).map(i =>
    `<div class="summary-item"><div class="summary-key">${i.k}</div><div class="summary-val">${i.v}</div></div>`
  ).join('');

  // -- Cert preview --
  certPrevIndex = 0;
  renderCertPreview(0);
}

function certPrevNav(dir) {
  const total = CS.rows.length;
  certPrevIndex = Math.max(0, Math.min(total - 1, certPrevIndex + dir));
  renderCertPreview(certPrevIndex);
}

function renderCertPreview(idx) {
  const total  = CS.rows.length;
  const row    = CS.rows[idx] || {};
  const canvas = document.getElementById('certPrevCanvas');
  const strip  = document.getElementById('certPrevStrip');
  const navLbl = document.getElementById('certNavLabel');
  if (!canvas) return;

  if (navLbl) navLbl.textContent = `${idx + 1} / ${total}`;

  if (strip) {
    strip.innerHTML = ED.fields.map(f =>
      `<span><span style="color:var(--text-3);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-right:4px">${f.placeholder.replace(/[{}]/g,'')}</span><span style="color:var(--text);font-weight:500">${row[f.column] || '—'}</span></span>`
    ).join('');
  }

  const dpr   = window.devicePixelRatio || 1;
  const scale = Math.min(1, 720 / ED.w);
  const cssW  = Math.round(ED.w * scale);
  const cssH  = Math.round(ED.h * scale);

  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale * dpr, scale * dpr);

  const drawFields = () => {
    ED.fields.forEach(f => {
      const boxX = (f.x / 100) * ED.w;
      const boxY = (f.y / 100) * ED.h;
      const boxW = (f.width / 100) * ED.w;
      const value = (f.column && row[f.column]) ? String(row[f.column]) : (f.previewText || f.placeholder || '');

      const fontStyle = f.italic ? 'italic' : 'normal';
      const fontWeight = f.bold ? 700 : getFontWeight(f.fontFamily || 'Helvetica');
      const fontCSS = getFontCSS(f.fontFamily || 'Helvetica');
      const fontSize = f.fontSize || 32;
      const letterSpacing = Number(f.letterSpacing || 0);

      ctx.save();
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontCSS}`;
      ctx.fillStyle = f.color || '#1a1a1a';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      let textWidth = ctx.measureText(value).width;
      if (letterSpacing > 0 && value.length > 1) {
        textWidth += letterSpacing * (value.length - 1);
      }

      let drawX = boxX;
      if ((f.align || 'center') === 'center') drawX = boxX + (boxW - textWidth) / 2;
      else if (f.align === 'right') drawX = boxX + boxW - textWidth;

      const drawY = boxY;

      if (letterSpacing > 0 && value.length > 1) {
        let cx = drawX;
        for (const ch of value) {
          ctx.fillText(ch, cx, drawY);
          cx += ctx.measureText(ch).width + letterSpacing;
        }
      } else {
        ctx.fillText(value, drawX, drawY);
      }

      ctx.restore();
    });
  };

  if (ED.bgImg) {
    ctx.drawImage(ED.bgImg, 0, 0, ED.w, ED.h);
    drawFields();
  } else if (ED.bgBase64) {
    const img = new Image();
    img.onload = () => {
      const ctx2 = canvas.getContext('2d');
      ctx2.setTransform(1, 0, 0, 1, 0, 0);
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
      ctx2.scale(scale * dpr, scale * dpr);
      ctx2.drawImage(img, 0, 0, ED.w, ED.h);
      drawFields();
    };
    img.src = ED.bgBase64;
  } else {
    ctx.fillStyle = ED.bgColor || '#ffffff';
    ctx.fillRect(0, 0, ED.w, ED.h);
    drawFields();
  }
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
    backgroundBase64: ED.bgBase64,
    bgColor: ED.bgColor,
    fields: ED.fields.map(f => ({ ...f })),
    fontUrls: getUsedFontUrls(),
    },
    participants:  CS.rows,
    nameCol:       ED.fields.find(f => f.isPrimary)?.column || '',
    emailCol:      '',
    fieldMappings: ED.fields.map(f => ({ col: f.column, ph: f.placeholder })),
    sheetId:       document.getElementById('sheetId')?.value || null,
    writeBack:     document.getElementById('writeBackToggle').classList.contains('on'),
  };

  try {
    // Reset bar to 0
    document.getElementById('genBar').style.width = '0%';
    document.getElementById('genPct').textContent  = '0%';
    document.getElementById('genStatus').textContent = 'Sending job to server…';
    log('info', `Sending ${total} certificates to generation server…`);

    const res = await apiFetch('/api/certificates/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    CS.results = res.results || [];
    const ok  = CS.results.filter(r => r.status === 'success').length;
    const bad = CS.results.filter(r => r.status !== 'success').length;

    // Animate progress based on each completed certificate
    let displayed = 0;
    function animateNext() {
      if (displayed >= CS.results.length) {
        setTimeout(() => showResults(), 600);
        return;
      }
      const r    = CS.results[displayed];
      displayed++;
      const pct  = Math.round(displayed / total * 100);

      document.getElementById('genCounter').textContent  = `${displayed} / ${total}`;
      document.getElementById('genBar').style.width      = pct + '%';
      document.getElementById('genPct').textContent      = pct + '%';
      document.getElementById('genStatus').textContent   = `Processing… ${displayed} of ${total} complete`;

      if (r.status === 'success') {
        log('ok', `✓ ${r.name || 'Certificate ' + displayed}`);
      } else {
        log('err', `✗ ${r.name || 'Certificate ' + displayed} — ${r.error || 'Failed'}`);
      }

      // Delay per cert scales with total: fast for small batches, steady for large
      const delay = Math.max(60, Math.min(300, Math.round(8000 / total)));
      setTimeout(animateNext, delay);
    }

    animateNext();

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
if (typeof saveCampaign === 'function') {
  saveCampaign(
    'cert',
    document.getElementById('campaignName').value || 'Certificate Run',
    CS.results.length,
    CS.results.filter(r => r.status === 'success').length,
    ''
  );
}
  toast(`${ok} certificates ready!`, 'success', 5000);
}

function renderResultRows(results) {
  const container = document.getElementById('resultRows');

  // Build merged rows: original CS.rows data + certificate link appended
  const allCols = CS.headers || [];

  // Match each result to its original row by index (results preserve order)
  const mergedRows = results.map((r, i) => {
    const original = CS.rows[i] || {};
    return { ...original, __status: r.status, __link: r.link || '', __error: r.error || '', __name: r.name || '' };
  });

  // Table wrapper with horizontal scroll, link column frozen right
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:minmax(0, 1fr); width:100%;">
        <div style="width:100%; box-sizing:border-box; overflow-x:auto; max-height:420px; border:1px solid var(--glass-border); border-radius:12px; scrollbar-width:thin; scrollbar-color:var(--glass-border-2) transparent;" id="resultTableWrap">
          <table style="width:max-content; min-width:100%; border-collapse:collapse; font-size:13.5px;">
            <thead>
              <tr style="position:sticky;top:0;z-index:3;background:var(--surface)">
                <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;text-align:left;white-space:nowrap;border-bottom:1px solid var(--glass-border);min-width:36px">#</th>
                ${allCols.map(h => `
                  <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;text-align:left;white-space:nowrap;border-bottom:1px solid var(--glass-border);min-width:120px">${h}</th>
                `).join('')}
                <th style="padding:10px 18px;font-size:11px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.06em;text-align:left;white-space:nowrap;border-bottom:1px solid var(--glass-border);border-left:1px solid var(--glass-border);min-width:220px;position:sticky;right:0;z-index:4;background:var(--surface)">Certificate Link</th>
              </tr>
            </thead>
            <tbody>
              ${mergedRows.map((row, i) => {
                const r = results[i];
                const isOk = r.status === 'success';
                const linkCell = isOk
                  ? `<a href="${r.link}" target="_blank" style="color:var(--cyan);text-decoration:none;display:flex;align-items:center;gap:6px;font-size:12.5px;white-space:nowrap" title="${r.link}">
                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                       Open PDF
                     </a>`
                  : `<span style="color:var(--red);font-size:12.5px">${r.error || 'Failed'}</span>`;
                return `
                <tr data-n="${row.__name}" data-e="${row[CS.headers?.[1]] || ''}" style="border-top:1px solid rgba(255,255,255,0.04);transition:background 0.12s" onmouseenter="this.style.background='rgba(255,255,255,0.02)'" onmouseleave="this.style.background=''">
                  <td style="padding:10px 14px;color:var(--text-3);text-align:center;font-size:12px">${i + 1}</td>
                  ${allCols.map(h => `<td style="padding:10px 14px;color:var(--text-2);white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${row[h] || ''}">${row[h] || '—'}</td>`).join('')}
                  <td style="padding:10px 18px;border-left:1px solid var(--glass-border);position:sticky;right:0;z-index:2;background:var(--surface)">
                    ${linkCell}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
}

function filterResults() {
  const q = document.getElementById('resultSearch').value.toLowerCase();
  document.querySelectorAll('#resultRows tbody tr').forEach(row => {
    const match = !q || (row.dataset.n || '').toLowerCase().includes(q) || (row.dataset.e || '').toLowerCase().includes(q);
    row.style.display = match ? '' : 'none';
  });
}

function downloadResults() {
  const allCols = CS.headers || [];

  // Build export rows: all original data + Certificate Link at end
  const exportData = CS.results.map((r, i) => {
    const original = CS.rows[i] || {};
    const row = {};
    allCols.forEach(h => { row[h] = original[h] ?? ''; });
    row['Certificate Link'] = r.link || (r.error ? `ERROR: ${r.error}` : '');
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(exportData);

  // Style header row (column widths)
  const colWidths = [...allCols.map(h => ({ wch: Math.max(h.length + 2, 15) })), { wch: 55 }];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Certificates');
  XLSX.writeFile(wb, `Honourix-certs-${Date.now()}.xlsx`);
  toast('Excel file downloaded!', 'success', 3000);
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



/* ══════════════════════════════════════════════
   MANUAL ENTRY — state & helpers
   ══════════════════════════════════════════════ */
let manualCols = ['Name'];

function manualRebuildHeader() {
  const tr = document.getElementById('manualHeaderRow');
  const thStyle = 'padding:10px 12px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;text-align:left;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--glass-border)';
  tr.innerHTML = `<th style="${thStyle};width:36px">#</th>`;
  manualCols.forEach((col, ci) => {
    const th = document.createElement('th');
    th.setAttribute('style', thStyle);
    th.innerHTML = `<div style="display:flex;align-items:center;gap:6px">
      <span>${col}</span>
            ${ci >= 1 ? `<button onclick=\"manualDeleteCol(${ci})\" title=\"Remove column\"
        style="width:16px;height:16px;border-radius:4px;background:none;border:none;color:var(--text-3);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>` : ''}
    </div>`;
    tr.appendChild(th);
  });
  tr.innerHTML += `<th style="${thStyle};width:36px"></th>`;
  _manualRefreshRows();
}

function _manualRefreshRows() {
  const tbody = document.getElementById('manualBody');
  const saved = Array.from(tbody.querySelectorAll('tr')).map(row =>
    Array.from(row.querySelectorAll('input')).map(i => i.value)
  );
  tbody.innerHTML = '';
  saved.forEach(vals => manualAddRow(vals));
}

function manualAddRow(vals = []) {
  const tbody = document.getElementById('manualBody');
  const idx = tbody.children.length;
  const tr = document.createElement('tr');
  let html = `<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:center;font-size:12px;color:var(--text-3);width:36px">${idx + 1}</td>`;
  manualCols.forEach((col, ci) => {
    html += `<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.04)">
      <input type="text" placeholder="${col}" value="${vals[ci] || ''}"
        style="width:100%;padding:8px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:7px;color:var(--text);font-size:13.5px;font-family:var(--font);outline:none;transition:border-color 0.15s"
        onfocus="this.style.borderColor='rgba(0,212,255,0.4)'"
        onblur="this.style.borderColor='rgba(255,255,255,0.08)'" />
    </td>`;
  });
  html += `<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.04);width:36px">
    <button onclick="this.closest('tr').remove();_manualReindex()" title="Remove row"
      style="width:28px;height:28px;border-radius:6px;background:none;border:none;color:var(--text-3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s"
      onmouseenter="this.style.color='#f43f5e';this.style.background='rgba(244,63,94,0.1)'"
      onmouseleave="this.style.color='var(--text-3)';this.style.background='none'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </td>`;
  tr.innerHTML = html;
  tbody.appendChild(tr);
}

function _manualReindex() {
  document.querySelectorAll('#manualBody tr').forEach((tr, i) => {
    tr.cells[0].textContent = i + 1;
  });
}

function manualAddColumn() {
  const name = prompt('New column name (e.g. Course, Date):');
  if (!name || !name.trim()) return;
  manualCols.push(name.trim());
  manualRebuildHeader();
}

function manualDeleteCol(ci) {
  if (!confirm(`Remove column "${manualCols[ci]}"?`)) return;
  manualCols.splice(ci, 1);
  manualRebuildHeader();
}

function manualApply() {
  const rows = Array.from(document.querySelectorAll('#manualBody tr'));
  const data = rows.map(row => {
    const inputs = row.querySelectorAll('input');
    const obj = {};
    manualCols.forEach((col, ci) => { obj[col] = inputs[ci] ? inputs[ci].value.trim() : ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v));

  if (!data.length) { alert('Please add at least one row with data.'); return; }

  // ── Feed into cert-tool's CS state ──
  CS.rows    = data;
  CS.headers = manualCols;
  window.allCols = manualCols;

  // Populate Name / Email column dropdowns in Step 3
  ['nameCol', 'emailCol'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Select column…</option>';
    manualCols.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      if (c === prev) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  // Update column hint panel in Step 3
  const hint = document.getElementById('colsListHint');
  if (hint) hint.innerHTML = manualCols.map(c =>
    `<span style="display:inline-block;background:var(--glass);border:1px solid var(--glass-border);border-radius:6px;padding:3px 9px;font-size:12.5px;margin:3px 4px 3px 0;font-family:var(--font-mono)">${c}</span>`
  ).join('');

  // Show success message
  const msg = document.getElementById('manualAppliedMsg');
  msg.style.display = 'block';
  msg.innerHTML = `<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#10b981;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
    <span><strong style="color:#10b981">${data.length} participant${data.length !== 1 ? 's' : ''}</strong> ready — columns: ${manualCols.map(c => `<code style="font-family:var(--font-mono);font-size:12px;background:var(--glass);padding:1px 5px;border-radius:4px">${c}</code>`).join(', ')}</span>
  </div>`;
}