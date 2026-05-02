/* ================================================================
   GalSol — Combined Pipeline  |  combined-tool.js
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

const STEPS = ['Data & Campaign', 'Certificate Design', 'Field Mapping', 'Email Template', 'Review & Launch', 'Results'];


/* ── Canvas Editor State ────────────────────────────────────────── */
let canvas, ctx, fieldOverlay;
let isPanning = false, startPanX = 0, startPanY = 0, scrollStartX = 0, scrollStartY = 0;

const ED = {
  w: 1122, h: 794,
  bgImg: null, bgBase64: null, bgColor: '#ffffff',
  fields: [],
  selId: null,
  scale: 1,
  zoom: 1,
};

function setZoom(val) {
  ED.zoom = Math.max(0.1, Math.min(3, parseFloat(val)));
  const zr = document.getElementById('canvasZoom');
  if (zr) zr.value = ED.zoom;
  const zl = document.getElementById('zoomLabel');
  if (zl) zl.textContent = Math.round(ED.zoom * 100) + '%';
  resizeCanvas();
}



/* ════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const sidebarEl = document.getElementById('sidebarMount');
  sidebarEl.innerHTML = renderSidebar('combined-tool.html');
  initSidebar();
  buildStepper();

  initCanvas();

  loadSavedTemplate();

  manualRenderTable();
  lucide.createIcons();

  const dz = document.getElementById('cpUploadZone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dz-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dz-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dz-over'); handleFileUpload({ target: { files: e.dataTransfer.files } }); });
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
    const ci = document.getElementById(`sci${n}`);
    const conn = document.getElementById(`sc${n}`);
    if (!node) return;
    node.className = `step-node ${n < CP.step ? 'done' : n === CP.step ? 'active' : ''}`;
    ci.innerHTML = n < CP.step ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>` : String(n);
    if (conn) conn.className = `step-connector ${n <= CP.step ? 'done' : ''}`;
  });
}

/* ── Navigation Engine ─────────────────────────────────────────────────── */
function goStep(n, force = false) {
  // 1. Always allow going backwards! (Bypass validation if returning to a previous step)
  if (n < CP.step) force = true;

  // 2. If moving forward, run the validation check for the current step
  if (!force && typeof validateStep === 'function' && !validateStep(CP.step)) return;

  // 3. Update state and Stepper UI
  CP.step = n;
  if (typeof updateStepper === 'function') updateStepper();

  // 4. Switch the active panels
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  const targetPanel = document.getElementById(`sp${n}`);
  if (targetPanel) targetPanel.classList.add('active');

  // 5. Trigger specific step requirements
  if (n === 2) {
    // CRITICAL: Redraw the canvas when returning to Step 2 so it isn't blank
    setTimeout(() => {
      if (typeof resizeCanvas === 'function') resizeCanvas();
    }, 100);
  }
  if (n === 3) {
    if (typeof populateStep3 === 'function') populateStep3();
  }
  if (n === 4) {
    if (typeof initStep4 === 'function') initStep4();
  }
  if (n === 5) {
    if (typeof buildReview === 'function') buildReview();
  }

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
    const hasPrimary = ED.fields.some(f => f.isPrimary && f.column);
    if (!hasPrimary) { toast('Please star a Primary field and map it to a column', 'error'); return false; }
    if (!document.getElementById('s3EmailCol').value) { toast('Select the Email column', 'error'); return false; }
  }
  if (n === 4) {
    if (!document.getElementById('mSubject').value.trim()) { toast('Enter an email subject', 'error'); return false; }

    // Check if the AI canvas has blocks OR the code editor has text
    const hasTemplate = ME.blocks.length > 0 || (ME.cm && ME.cm.getValue().trim() !== '');
    if (!hasTemplate) { toast('Design your email template first', 'error'); return false; }
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   STEP 1 — DATA SOURCE
════════════════════════════════════════════════════════════════ */
function switchDataSrc(type) {
  CP.srcType = type;
  document.getElementById('panelSheets').style.display = type === 'sheets' ? 'block' : 'none';
  document.getElementById('panelFile').style.display = type === 'file' ? 'block' : 'none';
  document.getElementById('panelManual').style.display = type === 'manual' ? 'block' : 'none';
  document.getElementById('panelHxForm').style.display = type === 'gsform' ? 'block' : 'none';
  document.getElementById('srcSheetsBtn').className = 'src-opt' + (type === 'sheets' ? ' active' : '');
  document.getElementById('srcFileBtn').className = 'src-opt' + (type === 'file' ? ' active' : '');
  document.getElementById('srcManualBtn').className = 'src-opt' + (type === 'manual' ? ' active' : '');
  document.getElementById('srcHxFormBtn').className = 'src-opt' + (type === 'gsform' ? ' active' : '');
  if (type === 'gsform') cpLoadHxFormList();
}
async function cpLoadHxFormList() {
  const sel = document.getElementById('cpHxFormSelect');
  if (!sel || sel.dataset.loaded) return;
  try {
    const token = localStorage.getItem('GalSol_token');
    const res = await fetch('https://certiflow-backend-73xk.onrender.com/api/gsdb/summary', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const { forms } = await res.json();
    const eligible = (forms || []).filter(f => f.submissionCount > 0);
    sel.innerHTML = '<option value="">Select a form…</option>' +
      eligible.map(f => `<option value="${f.id}">${f.name} (${f.submissionCount} responses)</option>`).join('');
    if (!eligible.length) sel.innerHTML = '<option value="">No forms with submissions found</option>';
    sel.dataset.loaded = '1'; // Mark as loaded to prevent re-fetching
  } catch { sel.innerHTML = '<option value="">Could not load forms</option>'; }
}

async function cpLoadHxFormData(formId) {
  if (!formId) return;
  const sel = document.getElementById('cpHxFormSelect');
  const el = document.getElementById('gsFormLoadedMsg');
  sel.disabled = true;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border:1px solid var(--glass-border);border-radius:10px;background:var(--glass);font-size:14px;color:var(--text-2)">
    <svg style="flex-shrink:0;animation:spin 0.9s linear infinite" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
    Loading form data…
  </div>`;
  el.style.display = 'block';

  try {
    const token = localStorage.getItem('GalSol_token');
    const res = await fetch(`https://certiflow-backend-73xk.onrender.com/api/gsdb/data/${formId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    if (!data.rows?.length) { toast('No submissions in this form yet', 'warning'); el.style.display = 'none'; return; }

    CP.headers = data.headers;
    CP.rows = data.rows.map(r => Object.fromEntries(data.headers.map((h, i) => [h, r[i] || ''])));
    CP.sheetId = null;

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:var(--green);margin-bottom:16px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><polyline points="20 6 9 17 4 12"/></svg>
        <span style="font-size:14px"><strong>${CP.rows.length} responses</strong> imported from <strong>${data.formName}</strong></span>
      </div>
      <div style="width:100%;box-sizing:border-box;overflow:auto;max-height:280px;border:1px solid var(--glass-border);border-radius:10px;background:var(--surface);scrollbar-width:thin;scrollbar-color:var(--glass-border-2) transparent">
        <table style="width:max-content;min-width:100%;border-collapse:collapse;text-align:left">
          <thead>
            <tr style="position:sticky;top:0;z-index:10;background:var(--surface);box-shadow:0 1px 0 var(--glass-border)">
              ${data.headers.map(h => `<th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${CP.rows.map(r => `<tr style="border-top:1px solid rgba(255,255,255,0.03);transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
              ${data.headers.map(h => `<td style="padding:10px 16px;font-size:13.5px;color:var(--text);white-space:nowrap">${(r[h] || '').toString().replace(/</g, '&lt;')}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    el.style.display = 'block';
    toast(`${CP.rows.length} participants imported`, 'success');
  } catch (e) { toast('Could not load form: ' + e.message, 'error'); el.style.display = 'none'; }
  finally { sel.disabled = false; }
}

async function loadSheetData() {
  const id = document.getElementById('sheetId').value.trim();
  if (!id) { toast('Paste your Sheet ID first', 'error'); return; }
  const btn = document.getElementById('loadSheetBtn');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = await apiFetch(`/api/sheets/read?sheetId=${encodeURIComponent(id)}&range=Sheet1`);
    if (!data?.data?.length || data.data.length < 2) { toast('Sheet is empty or unreadable', 'warning'); return; }
    CP.headers = data.data[0].map(h => h.toString().trim());
    CP.rows = data.data.slice(1).map(row => Object.fromEntries(CP.headers.map((h, i) => [h, row[i] || ''])));
    CP.sheetId = id;
    showDataOK('sheetLoadedMsg', `${CP.rows.length} participants · ${CP.headers.length} columns`);
    toast(`Loaded ${CP.rows.length} participants`, 'success');
  } catch (e) { toast('Could not load sheet: ' + e.message, 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

function handleFileUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, {
      header: true, skipEmptyLines: true, complete: r => {
        CP.headers = r.meta.fields; CP.rows = r.data; CP.sheetId = null;
        showDataOK('fileLoadedMsg', `${CP.rows.length} rows from ${file.name}`);
        toast(`Loaded ${CP.rows.length} participants`, 'success');
      }
    });
  } else if (['xlsx', 'xls'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
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
  // Build preview table from current CP data
  const headers = CP.headers || [];
  const rows = CP.rows || [];
  const theadHtml = headers.map(h =>
    `<th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap">${h}</th>`
  ).join('');
  const tbodyHtml = rows.map(r =>
    `<tr style="border-top:1px solid rgba(255,255,255,0.03);transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
      ${headers.map(h => `<td style="padding:10px 16px;font-size:13.5px;color:var(--text);white-space:nowrap">${(r[h] || '').toString().replace(/</g, '&lt;')}</td>`).join('')}
    </tr>`
  ).join('');
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:var(--green);margin-bottom:16px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><polyline points="20 6 9 17 4 12"/></svg>
      <span style="font-size:14px"><strong>Data loaded</strong> — ${msg}</span>
    </div>
    <div style="width:100%;box-sizing:border-box;overflow:auto;max-height:280px;border:1px solid var(--glass-border);border-radius:10px;background:var(--surface);scrollbar-width:thin;scrollbar-color:var(--glass-border-2) transparent">
      <table style="width:max-content;min-width:100%;border-collapse:collapse;text-align:left">
        <thead>
          <tr style="position:sticky;top:0;z-index:10;background:var(--surface);box-shadow:0 1px 0 var(--glass-border)">${theadHtml}</tr>
        </thead>
        <tbody>${tbodyHtml}</tbody>
      </table>
    </div>`;
  el.style.display = 'block';
}

/* ── Manual Entry ────────────────────────────────────────────────── */
function manualRenderTable() {
  const headerRow = document.getElementById('manualHeaderRow');
  const body = document.getElementById('manualBody');
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
  CP.rows = valid.map(r => ({ ...r }));
  CP.sheetId = null;
  showDataOK('manualLoadedMsg', `${CP.rows.length} participants entered manually`);
  toast(`${CP.rows.length} participants ready`, 'success');
}

function initCanvas() {
  canvas = document.getElementById('certCanvas');
  ctx = canvas.getContext('2d');
  fieldOverlay = document.getElementById('fieldOverlay');

  const zone = document.getElementById('canvasWrap');
  if (zone) {
    // Mouse Wheel Zooming
    zone.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        setZoom((ED.zoom || 1) + delta);
      }
    }, { passive: false });

    // Background Drag/Pan
    let isPanning = false;
    let startX, startY, scrollLeft, scrollTop;

    zone.style.cursor = 'grab';

    zone.addEventListener('mousedown', e => {
      if (e.target === zone || e.target.id === 'certCanvas') {
        isPanning = true;
        zone.style.cursor = 'grabbing';
        startX = e.pageX - zone.offsetLeft;
        startY = e.pageY - zone.offsetTop;
        scrollLeft = zone.scrollLeft;
        scrollTop = zone.scrollTop;
      }
    });
    zone.addEventListener('mousemove', e => {
      if (!isPanning) return;
      e.preventDefault();
      const x = e.pageX - zone.offsetLeft;
      const y = e.pageY - zone.offsetTop;
      zone.scrollLeft = scrollLeft - (x - startX);
      zone.scrollTop = scrollTop - (y - startY);
    });
    window.addEventListener('mouseup', () => {
      isPanning = false;
      if (zone) zone.style.cursor = 'grab';
    });
  }

  // Keyboard Shortcuts
  document.addEventListener('keydown', e => {
    if (CP.step !== 2) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    // Zoom & Duplicate
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom((ED.zoom || 1) + 0.1); return; }
      if (e.key === '-') { e.preventDefault(); setZoom((ED.zoom || 1) - 0.1); return; }
      if (e.key === '0') { e.preventDefault(); setZoom(1); return; }
      if (e.key.toLowerCase() === 'd' && ED.selId) { e.preventDefault(); duplicateField(ED.selId); return; }
    }

    // Nudge Movement
    if (ED.selId) {
      const f = ED.fields.find(x => x.id === ED.selId);
      if (!f) return;
      const step = e.shiftKey ? 1 : 0.1;
      let moved = false;

      if (e.key === 'ArrowUp') { f.y -= step; moved = true; }
      if (e.key === 'ArrowDown') { f.y += step; moved = true; }
      if (e.key === 'ArrowLeft') { f.x -= step; moved = true; }
      if (e.key === 'ArrowRight') { f.x += step; moved = true; }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteField(ED.selId); return; }

      if (moved) {
        e.preventDefault();
        redraw();
        const px = document.getElementById('pX'), py = document.getElementById('pY');
        if (px) px.value = f.x.toFixed(1);
        if (py) py.value = f.y.toFixed(1);
        saveTemplate();
      }
    }
  });

  ED.ready = true;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const zone = document.getElementById('canvasWrap');
  if (!zone) return;

  const zw = zone.clientWidth;
  const zh = zone.clientHeight;
  if (zw < 10) { setTimeout(resizeCanvas, 50); return; }

  // Base fit calculation
  const baseScale = Math.min((zw - 48) / ED.w, (Math.max(zh - 48, 200)) / ED.h, 1);

  // Apply zoom multiplier
  ED.scale = baseScale * (ED.zoom || 1);

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
    const fs = Math.max(4, f.fontSize * ED.scale);
    const ls = (f.letterSpacing || 0) * ED.scale;
    const fw = f.bold ? 700 : getFontWeight(f.fontFamily || 'Helvetica');
    const fi = f.italic ? 'italic' : 'normal';
    const ff = getFontCSS(f.fontFamily || 'Helvetica');

    // Use CP.rows for the Combined Pipeline data connection
    const value = (f.column && CP.rows && CP.rows[0])
      ? (CP.rows[0][f.column] || f.previewText || f.placeholder)
      : (f.previewText || f.placeholder);

    ctx.save();
    ctx.font = `${fi} ${fw} ${fs}px ${ff}`;
    ctx.fillStyle = f.color || '#1a1a1a';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // Advanced Text Wrapper Engine
    const words = String(value).split(' ');
    const lines = [];
    let currentLine = words[0] || '';
    for (let j = 1; j < words.length; j++) {
      const word = words[j];
      const testLine = currentLine + ' ' + word;
      let testWidth = ctx.measureText(testLine).width;
      if (ls > 0 && testLine.length > 1) testWidth += ls * (testLine.length - 1);
      if (testWidth > boxW && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine !== '') lines.push(currentLine);
    if (lines.length === 0) lines.push('');

    const numLines = lines.length;

    // Apply exact center rotation based on total line height
    const cx = boxX + boxW / 2;
    const cy = boxY + (fs * 1.3 * numLines) / 2;
    ctx.translate(cx, cy);
    ctx.rotate((f.rotation || 0) * Math.PI / 180);
    ctx.translate(-cx, -cy);

    lines.forEach((line, i) => {
      const drawY = boxY + (i * fs * 1.3);
      let textW = ctx.measureText(line).width;
      if (ls > 0 && line.length > 1) textW += ls * (line.length - 1);

      let drawX = boxX;
      if ((f.align || 'center') === 'center') drawX = boxX + (boxW - textW) / 2;
      else if (f.align === 'right') drawX = boxX + boxW - textW;

      if (ls > 0 && line.length > 1) {
        let drawCx = drawX;
        for (const ch of line) {
          ctx.fillText(ch, drawCx, drawY);
          drawCx += ctx.measureText(ch).width + ls;
        }
      } else {
        ctx.fillText(line, drawX, drawY);
      }
    });
    ctx.restore();
  });
}

function redraw() {
  redrawCanvas();
  if (typeof renderHandles === 'function') renderHandles();
}

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

    // Auto-calculate the bounding box height based on wrapped lines
    const value = (f.column && CP.rows && CP.rows[0]) ? (CP.rows[0][f.column] || f.previewText || f.placeholder) : (f.previewText || f.placeholder);
    ctx.save();
    ctx.font = `${f.italic ? 'italic' : 'normal'} ${f.bold ? 700 : getFontWeight(f.fontFamily || 'Helvetica')} ${fs}px ${getFontCSS(f.fontFamily || 'Helvetica')}`;
    const ls = (f.letterSpacing || 0) * ED.scale;
    const words = String(value).split(' ');
    let linesCount = 1; let currentLine = words[0] || '';
    for (let j = 1; j < words.length; j++) {
      const testLine = currentLine + ' ' + words[j];
      let testWidth = ctx.measureText(testLine).width;
      if (ls > 0 && testLine.length > 1) testWidth += ls * (testLine.length - 1);
      if (testWidth > w && currentLine !== '') { linesCount++; currentLine = words[j]; }
      else { currentLine = testLine; }
    }
    ctx.restore();

    const h = Math.round(fs * 1.3 * linesCount);
    const cx = x + w / 2;
    const cy = y + h / 2;

    const el = document.createElement('div');
    el.className = 'tf-handle' + (f.id === ED.selId ? ' sel' : '');
    el.dataset.fid = f.id;

    // Core Positioning & Rotation Map
    el.style.cssText = `left:${cx}px;top:${cy}px;width:${w}px;height:${h}px;transform:translate(-50%, -50%) rotate(${f.rotation || 0}deg);background:transparent;color:transparent;`;

    // 1. Top Action Bar (Duplicate & Delete)
    const actionBar = document.createElement('div');
    actionBar.className = 'tf-action-bar';

    const btnDup = document.createElement('div');
    btnDup.className = 'tf-action-btn';
    btnDup.title = "Duplicate";
    btnDup.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    btnDup.addEventListener('mousedown', e => { e.stopPropagation(); duplicateField(f.id); });

    const btnDel = document.createElement('div');
    btnDel.className = 'tf-action-btn del';
    btnDel.title = "Delete";
    btnDel.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    btnDel.addEventListener('mousedown', e => { e.stopPropagation(); deleteField(f.id); });

    actionBar.appendChild(btnDup);
    actionBar.appendChild(btnDel);
    el.appendChild(actionBar);

    // 2. Bottom Control Pill (Move & Rotate)
    const ctrlPill = document.createElement('div');
    ctrlPill.className = 'tf-ctrl-pill';

    const btnMove = document.createElement('div');
    btnMove.className = 'tf-ctrl-btn move';
    btnMove.title = "Move";
    btnMove.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="19 9 22 12 19 15"></polyline><polyline points="9 19 12 22 15 19"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>';
    btnMove.addEventListener('mousedown', e => { e.stopPropagation(); selectField(f.id); startDrag(e, f); });

    const btnRot = document.createElement('div');
    btnRot.className = 'tf-ctrl-btn rot';
    btnRot.title = "Rotate";
    btnRot.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 2.63-6.37L21 8"></path></svg>';
    btnRot.addEventListener('mousedown', e => { e.stopPropagation(); selectField(f.id); startRotate(e, f); });

    ctrlPill.appendChild(btnMove);
    ctrlPill.appendChild(btnRot);
    el.appendChild(ctrlPill);

    // 3. Dynamic Corners & Controllers
    const isSmall = h < 40 || w < 80;

    ['tl', 'tr', 'bl', 'br'].forEach(corner => {
      const cEl = document.createElement('div');
      cEl.className = `tf-resizer-corner ${corner}`;
      if (isSmall && corner !== 'tl') cEl.style.opacity = '0';
      cEl.addEventListener('mousedown', e => { e.stopPropagation(); selectField(f.id); startScale(e, f, corner); });
      el.appendChild(cEl);
    });

    ['left', 'right'].forEach(side => {
      const sEl = document.createElement('div');
      sEl.className = `tf-resizer-width ${side}`;
      if (isSmall && side !== 'right') sEl.style.opacity = '0';
      sEl.addEventListener('mousedown', e => { e.stopPropagation(); selectField(f.id); startWidthResize(e, f, side); });
      el.appendChild(sEl);
    });

    // Freeform Dragging Base
    el.addEventListener('mousedown', e => {
      if (e.target === el) {
        e.stopPropagation(); e.preventDefault(); selectField(f.id); startDrag(e, f);
      }
    });

    fieldOverlay.appendChild(el);
  });

  // Triggers the Fields panel to update so you can click chips in the sidebar!
  if (typeof renderChipList === 'function') renderChipList();
}

function startDrag(e, field) {
  const startX = e.clientX, startY = e.clientY;
  const startFieldX = field.x, startFieldY = field.y;
  const dispW = Math.round(ED.w * ED.scale), dispH = Math.round(ED.h * ED.scale);
  const mm = ev => {
    field.x = startFieldX + (ev.clientX - startX) / dispW * 100;
    field.y = startFieldY + (ev.clientY - startY) / dispH * 100;
    redraw();
    if (field.id === ED.selId) {
      const px = document.getElementById('pX'), py = document.getElementById('pY');
      if (px) px.value = field.x.toFixed(1);
      if (py) py.value = field.y.toFixed(1);
    }
  };
  const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); saveTemplate(); };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

function startScale(e, field, corner = 'r') {
  const startX = e.clientX;
  const startW = field.width, startSize = field.fontSize;
  const dispW = Math.round(ED.w * ED.scale);
  const mm = ev => {
    let dx = ev.clientX - startX;
    if (corner.includes('l')) dx = -dx;
    const deltaPct = dx / dispW * 100;
    const scaleRatio = Math.max(0.1, (startW + deltaPct) / startW);
    field.width = startW * scaleRatio;
    field.fontSize = Math.max(8, Math.round(startSize * scaleRatio));
    redraw();
    if (field.id === ED.selId) {
      const pW = document.getElementById('pW'); if (pW) pW.value = field.width.toFixed(1);
      const pS = document.getElementById('pSize'); if (pS) pS.value = field.fontSize;
      const pSV = document.getElementById('pSizeVal'); if (pSV) pSV.textContent = field.fontSize + 'px';
    }
  };
  const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); saveTemplate(); };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

function startWidthResize(e, field, side) {
  const startX = e.clientX, startFieldX = field.x, startFieldW = field.width;
  const dispW = Math.round(ED.w * ED.scale);
  const mm = ev => {
    const dx = ev.clientX - startX, pctDelta = dx / dispW * 100;
    if (side === 'right') {
      field.width = Math.max(5, startFieldW + pctDelta);
    } else {
      const newW = Math.max(5, startFieldW - pctDelta);
      if (newW > 5) { field.width = newW; field.x = startFieldX + pctDelta; }
    }
    redraw();
    if (field.id === ED.selId) {
      const pX = document.getElementById('pX'); if (pX) pX.value = field.x.toFixed(1);
      const pW = document.getElementById('pW'); if (pW) pW.value = field.width.toFixed(1);
    }
  };
  const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); saveTemplate(); };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

function startRotate(e, field) {
  const handleEl = fieldOverlay.querySelector(`[data-fid="${field.id}"]`);
  const rect = handleEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const tooltip = document.createElement('div');
  tooltip.className = 'tf-rot-tooltip';
  document.body.appendChild(tooltip);
  const mm = ev => {
    const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    field.rotation = ((Math.round(angle + 90) % 360) + 360) % 360;
    tooltip.textContent = field.rotation + '°';
    tooltip.style.left = ev.clientX + 15 + 'px';
    tooltip.style.top = ev.clientY - 35 + 'px';
    tooltip.style.display = 'block';
    redraw();
  };
  const mu = () => {
    document.removeEventListener('mousemove', mm);
    document.removeEventListener('mouseup', mu);
    tooltip.remove();
    saveTemplate();
  };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

const FONT_MAP = {
  'Helvetica': { css: 'Helvetica, Arial, sans-serif', weight: 400 },
  'Montserrat': { css: "'Montserrat', sans-serif", weight: 400 },
  'Raleway': { css: "'Raleway', sans-serif", weight: 400 },
  'Plus Jakarta Sans': { css: "'Plus Jakarta Sans', sans-serif", weight: 400 },
  'Times New Roman': { css: "'Times New Roman', serif", weight: 400 },
  'EB Garamond': { css: "'EB Garamond', serif", weight: 400 },
  'Playfair Display': { css: "'Playfair Display', serif", weight: 400 },
  'Cormorant Garamond': { css: "'Cormorant Garamond', serif", weight: 400 },
  'Dancing Script': { css: "'Dancing Script', cursive", weight: 400 },
  'Cinzel': { css: "'Cinzel', serif", weight: 400 },
  'Courier New': { css: "'Courier New', monospace", weight: 400 },
  'JetBrains Mono': { css: "'JetBrains Mono', monospace", weight: 400 },
};
function getFontCSS(name) { return (FONT_MAP[name] || FONT_MAP['Helvetica']).css; }
function getFontWeight(name) { return (FONT_MAP[name] || FONT_MAP['Helvetica']).weight; }
// Add this helper to combined-tool.js
const FONT_URLS = {
  'Montserrat': 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap',
  'Raleway': 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;700&display=swap',
  'Plus Jakarta Sans': 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap',
  'EB Garamond': 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&display=swap',
  'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap',
  'Cormorant Garamond': 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&display=swap',
  'Dancing Script': 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap',
  'Cinzel': 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap',
  'JetBrains Mono': 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
};

function getUsedFontUrls() {
  const used = [...new Set(ED.fields.map(f => f.fontFamily).filter(Boolean))];
  return used.filter(f => FONT_URLS[f]).map(f => FONT_URLS[f]);
}

function openAFModal() {
  const sel = document.getElementById('afColSelect');
  if (sel) {
    sel.innerHTML = '<option value="">— Select a column —</option>';
    (CP.headers || []).forEach(h => {
      const o = document.createElement('option'); o.value = h; o.textContent = h; sel.appendChild(o);
    });
  }
  const phInner = document.getElementById('afPhInner');
  if (phInner) phInner.value = '';
  const hint = document.getElementById('afColHint');
  if (hint) hint.style.display = 'none';
  const sizeEl = document.getElementById('newFieldSize');
  if (sizeEl) sizeEl.value = 36;
  const afPrimary = document.getElementById('afPrimary');
  if (afPrimary) afPrimary.checked = ED.fields.length === 0;
  const preview = document.getElementById('afFilePreview');
  if (preview) preview.textContent = 'Alex_01.pdf';
  document.getElementById('afOverlay').classList.add('open');
}
function closeAFModal() { document.getElementById('afOverlay').classList.remove('open'); }
function openAddFieldModal() { openAFModal(); }
function closeAddFieldModal() { closeAFModal(); }

function afColumnChanged(col) {
  if (!col) return;
  const suggested = col.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const phInner = document.getElementById('afPhInner');
  if (phInner) phInner.value = suggested;
  const sample = CP.rows && CP.rows[0] ? (CP.rows[0][col] || '') : '';
  const hint = document.getElementById('afColHint');
  if (hint) {
    if (sample) { hint.textContent = 'Sample value from row 1: "' + sample + '"'; hint.style.display = 'block'; }
    else { hint.style.display = 'none'; }
  }
  afPhInput(suggested);
}

function afPhInput(val) {
  const clean = val.replace(/[{}]/g, '').trim();
  const colSel = document.getElementById('afColSelect');
  const col = colSel ? colSel.value : '';
  const sample = col && CP.rows && CP.rows[0] ? (CP.rows[0][col] || clean || 'Alex') : (clean || 'Alex');
  const preview = document.getElementById('afFilePreview');
  if (preview) preview.textContent = (sample || 'Alex') + '_01.pdf';
}

function addField() {
  const colSel = document.getElementById('afColSelect');
  const phInner = document.getElementById('afPhInner').value.trim().replace(/[{}]/g, '');
  const col = colSel ? colSel.value : '';
  const size = parseInt(document.getElementById('newFieldSize')?.value || '36', 10);
  const isPrimary = document.getElementById('afPrimary')?.checked || false;

  if (!phInner) { toast('Enter a placeholder name', 'error'); return; }

  const ph = '{{' + phInner + '}}';
  const previewText = col && CP.rows && CP.rows[0] ? (CP.rows[0][col] || phInner) : phInner;

  if (isPrimary) ED.fields.forEach(f => { f.isPrimary = false; });

  const field = {
    id: 'f_' + Date.now(),
    placeholder: ph, previewText, column: col,
    isPrimary,
    x: 10, y: 35 + ED.fields.length * 14,
    width: 80, fontSize: size,
    fontFamily: 'Helvetica', color: '#1a1a1a',
    align: 'center', bold: false, italic: false, letterSpacing: 0, rotation: 0,
  };
  ED.fields.push(field);
  closeAFModal();
  if (!ED.ready) { requestAnimationFrame(() => requestAnimationFrame(resizeCanvas)); }
  selectField(field.id);
  redraw();
  toast(`Added "${ph}" field`, 'success', 1800);
}

function addCanvasField() { addField(); }

/* ── Select / Delete / Duplicate Field & UI Sync ──────────────────────── */
function selectField(id) {
  ED.selId = id;
  const f = ED.fields.find(f => f.id === id); if (!f) return;
  switchEPTab('props');

  document.getElementById('propsEmpty').style.display = 'none';
  document.getElementById('propsForm').style.display = 'flex';

  document.getElementById('pPh').value = f.placeholder;

  // Connect live preview to CP.rows (Combined Pipeline State)
  const livePreview = (f.column && CP.rows && CP.rows[0]) ? (CP.rows[0][f.column] || f.previewText || '') : (f.previewText || '');
  document.getElementById('pPrev').value = livePreview;
  document.getElementById('pPrev').style.color = (f.column && CP.rows && CP.rows[0]) ? 'var(--cyan)' : 'var(--text)';
  document.getElementById('pPrev').title = f.column ? 'Live value from row 1 of your data' : 'Manual preview text';

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

  ['alL', 'alC', 'alR'].forEach(b => document.getElementById(b).classList.remove('on'));
  document.getElementById(f.align === 'center' ? 'alC' : f.align === 'right' ? 'alR' : 'alL').classList.add('on');

  if (typeof loadFontIfNeeded === 'function') loadFontIfNeeded(f.fontFamily || 'Helvetica');
  updateFontPreview(f.fontFamily || 'Helvetica', f.bold, f.italic);

  renderHandles();
}

function updateFontPreview(name, bold, italic) {
  const el = document.getElementById('fontPreviewSample'); if (!el) return;
  el.style.fontFamily = getFontCSS(name);
  el.style.fontWeight = bold ? 700 : (typeof getFontWeight === 'function' ? getFontWeight(name) : 400);
  el.style.fontStyle = italic ? 'italic' : 'normal';
  el.textContent = name + ' — Aa 123';
}

function deleteField(id) {
  ED.fields = ED.fields.filter(f => f.id !== id);
  if (ED.selId === id) {
    ED.selId = null;
    document.getElementById('propsEmpty').style.display = '';
    document.getElementById('propsForm').style.display = 'none';
  }
  renderHandles();
  redrawCanvas(); // Instantly erase text preview from canvas
}

function duplicateField(id) {
  const f = ED.fields.find(x => x.id === id);
  if (!f) return;
  const newF = JSON.parse(JSON.stringify(f));
  newF.id = 'f_' + Date.now();
  newF.x = Math.min(95, newF.x + 3); // Offset x slightly so it doesn't overlap perfectly
  newF.y = Math.min(95, newF.y + 3); // Offset y slightly
  ED.fields.push(newF);
  selectField(newF.id);
  redraw();
}

function deleteSelectedField() { if (ED.selId) deleteField(ED.selId); }
function deleteSelField() { if (ED.selId) deleteField(ED.selId); }

/* ── Properties Panel Updates ── */
function setFP(key, val) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f[key] = val; if (key === 'color') document.getElementById('pColorHex').textContent = val; redraw(); }
function setFPFont(name) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.fontFamily = name; if (typeof loadFontIfNeeded === 'function') loadFontIfNeeded(name); updateFontPreview(name, f.bold, f.italic); redraw(); }
function setFPXY() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.x = parseFloat(document.getElementById('pX').value) || f.x; f.y = parseFloat(document.getElementById('pY').value) || f.y; redraw(); }
function setAlign(a) { setFP('align', a);['alL', 'alC', 'alR'].forEach(b => document.getElementById(b).classList.remove('on')); document.getElementById(a === 'center' ? 'alC' : a === 'right' ? 'alR' : 'alL').classList.add('on'); }
function toggleBold() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.bold = !f.bold; document.getElementById('boldBtn').classList.toggle('on', f.bold); redraw(); }
function toggleItalic() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.italic = !f.italic; document.getElementById('italicBtn').classList.toggle('on', f.italic); redraw(); }

/* ── UI Helpers ── */
function switchEPTab(tab) {
  ['fields', 'props'].forEach(t => {
    const elT = document.getElementById(`epTab_${t}`);
    const elP = document.getElementById(`epPanel_${t}`);
    if (elT) elT.className = 'ep-tab' + (t === tab ? ' active' : '');
    if (elP) elP.className = 'ep-panel' + (t === tab ? ' active' : '');
  });
}

function renderChipList() {
  const el = document.getElementById('fieldChipList'); if (!el) return;
  if (!ED.fields.length) {
    el.innerHTML = `<div style="text-align:center;padding:28px 8px;color:var(--text-3);font-size:13px">No fields yet.<br/><span style="color:var(--cyan)">Click "+ Add Field"</span></div>`;
    return;
  }
  el.innerHTML = ED.fields.map(f => `
    <div class="fc-chip ${f.id === ED.selId ? 'sel' : ''}" onclick="selectField('${f.id}')">
      <div class="fc-dot" style="background:${f.color}"></div>
      <div style="flex:1;min-width:0">
        <span class="fc-name">${f.previewText || f.placeholder}</span>
        <span class="fc-ph">${f.placeholder}${f.column ? ' → ' + f.column : ''}</span>
      </div>
      ${f.isPrimary ? '<span style="font-size:10px;font-weight:700;color:var(--cyan);background:var(--cyan-dim);border:1px solid rgba(0,212,255,0.25);border-radius:4px;padding:1px 5px;flex-shrink:0">PRIMARY</span>' : ''}
    </div>`).join('');
}

/* ── Custom Spinner Nudge Logic ── */
function nudgeInput(id, step, up) {
  const el = document.getElementById(id);
  if (!el) return;
  const val = parseFloat(el.value) || 0;
  el.value = parseFloat((val + (up ? step : -step)).toFixed(2));
  el.dispatchEvent(new Event('change')); // Triggers setFPXY or setFP naturally
}

function loadFontIfNeeded(name) {
  if (!FONT_URLS[name]) return; // system font, no load needed
  const id = 'gfont_' + name.replace(/\s+/g, '_');
  if (document.getElementById(id)) return; // already loaded
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = FONT_URLS[name];
  document.head.appendChild(link);
}


function uploadBackground(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { const img = new Image(); img.onload = () => { ED.bgImg = img; ED.bgBase64 = ev.target.result; redrawCanvas(); toast('Background uploaded', 'success', 1800); }; img.src = ev.target.result; }; reader.readAsDataURL(file); }
function changeBgColor() { ED.bgColor = document.getElementById('bgColor').value; if (!ED.bgImg) redrawCanvas(); }
function clearBackground() { ED.bgImg = null; ED.bgBase64 = null; document.getElementById('bgUpload').value = ''; redrawCanvas(); toast('Background cleared', 'info', 1800); }
function changeCanvasSize() { const [w, h] = document.getElementById('canvasSize').value.split(',').map(Number); ED.w = w; ED.h = h; resizeCanvas(); }
function clearAll() { ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null; const pe = document.getElementById('propsEmpty'), pf = document.getElementById('propsForm'); if (pe) pe.style.display = ''; if (pf) pf.style.display = 'none'; redrawCanvas(); toast('Canvas cleared', 'info', 1800); }
/* ── Save / Load Template (FIXED: Session Memory Only) ────────────────── */
function saveTemplate() {
  // Intentionally blank! We no longer save to localStorage. 
  // The ED (Editor) object in memory will keep your fields safe 
  // while you navigate between Steps 1 to 5 during an active session.
}

function loadSavedTemplate() {
  // Intentionally blank! 
  // Now, every time you come back to this tool from the Home Page, 
  // you will get a 100% fresh, blank canvas. No ghost fields!
}
/* ── Aliases so existing HTML onclick= still resolves ── */
const uploadBG = uploadBackground;
const changeBGColor = changeBgColor;
const clearBG = clearBackground;
const changeSize = changeCanvasSize;
const clearCanvas = clearAll;

/* ════════════════════════════════════════════════════════════════
   STEP 3 — FIELD MAPPING
════════════════════════════════════════════════════════════════ */
function populateStep3() {
  buildStep3();
  fnRefreshNamePill();
}

function buildStep3() {
  const rows = document.getElementById('s3Rows');
  const empty = document.getElementById('s3Empty');
  const count = document.getElementById('s3FieldCount');
  const emailSel = document.getElementById('s3EmailCol');

  if (emailSel && CP.headers) {
    const currentEmail = emailSel.value;
    emailSel.innerHTML = '<option value="">— Select Email Column —</option>' +
      CP.headers.map(h => `<option value="${h}" ${currentEmail === h ? 'selected' : ''}>${h}</option>`).join('');

    if (!currentEmail) {
      const likelyEmail = CP.headers.find(h => h.toLowerCase().includes('email'));
      if (likelyEmail) emailSel.value = likelyEmail;
    }
  }

  const hints = (CP.headers || []).map(h => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--glass-border)">
      <span style="width:7px;height:7px;background:var(--cyan);border-radius:50%;flex-shrink:0"></span>
      <span style="font-size:14px;color:var(--text)">${h}</span>
    </div>`).join('');
  const ch = document.getElementById('colsListHint');
  if (ch) ch.innerHTML = hints || '<span style="color:var(--text-3);font-size:13px">No columns loaded yet.</span>';

  if (!ED.fields.length) {
    if (rows) rows.style.display = 'none';
    if (empty) empty.style.display = 'block';
    if (count) count.textContent = '0 fields';
    buildStep3Writeback();
    return;
  }

  if (empty) empty.style.display = 'none';
  if (rows) rows.style.display = 'flex';
  if (count) count.textContent = `${ED.fields.length} field${ED.fields.length > 1 ? 's' : ''}`;

  rows.innerHTML = ED.fields.map((f, i) => {
    const isLast = i === ED.fields.length - 1;
    const colOpts = `<option value="">— choose column —</option>${(CP.headers || []).map(h => {
      const match = (f.column && f.column.trim() === h.trim()) ? 'selected' : '';
      return `<option value="${h}" ${match}>${h}</option>`;
    }).join('')}`;

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
      <div title="Set as primary field" onclick="s3SetPrimary('${f.id}')" style="width:32px;height:32px;border-radius:8px;border:1px solid ${f.isPrimary ? 'rgba(0,212,255,0.4)' : 'var(--glass-border)'};background:${f.isPrimary ? 'rgba(0,212,255,0.08)' : 'var(--glass)'};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.18s;flex-shrink:0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${f.isPrimary ? 'var(--cyan)' : 'none'}" stroke="${f.isPrimary ? 'var(--cyan)' : 'var(--text-3)'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </div>
    </div>`;
  }).join('');

  buildStep3Writeback();
}

function s3ColChanged(fieldId, colValue) {
  const f = ED.fields.find(x => x.id === fieldId);
  if (f) { f.column = colValue; if (typeof redraw === 'function') redraw(); }
}

function s3SetPrimary(fieldId) {
  ED.fields.forEach(f => f.isPrimary = (f.id === fieldId));
  buildStep3(); fnRefreshNamePill();
}

function buildStep3Writeback() {
  const badge = document.getElementById('s3WritebackBadge'), desc = document.getElementById('s3WritebackDesc'), options = document.getElementById('s3WritebackOptions');
  if (!badge || !desc) return;
  if (CP.srcType === 'sheets') {
    badge.textContent = 'Active'; badge.style.cssText = 'font-size:11px;padding:3px 9px;border-radius:20px;font-weight:600;background:rgba(0,212,255,0.1);color:var(--cyan);border:1px solid rgba(0,212,255,0.25)';
    desc.textContent = 'After generation, certificate links will be written back to your Google Sheet.';
    if (options) options.style.display = 'block';
  } else {
    badge.textContent = 'N/A for this source'; badge.style.cssText = 'font-size:11px;padding:3px 9px;border-radius:20px;font-weight:600;background:rgba(255,255,255,0.04);color:var(--text-3);border:1px solid var(--glass-border)';
    desc.textContent = 'Write-back is only available when data is imported via Google Sheets ID.';
    if (options) options.style.display = 'none';
  }
}

function validateStep3() {
  const emailCol = document.getElementById('s3EmailCol')?.value;
  if (!emailCol) { toast('Please select the Email Delivery column.', 'error'); return; }
  CP.emailCol = emailCol;
  const unmapped = ED.fields.filter(f => !f.column);
  if (unmapped.length) { toast(`Please map a column for: ${unmapped.map(f => f.placeholder).join(', ')}`, 'error'); return; }
  if (ED.fields.length > 0 && !ED.fields.some(f => f.isPrimary)) { toast('Please star (★) one field as Primary.', 'error'); return; }
  CP.eventName = (document.getElementById('fnEventInput')?.value || '').trim();
  goStep(4, true);
}

function fnRefreshNamePill() {
  const primary = ED.fields.find(f => f.isPrimary);
  const sampleName = primary && CP.rows && CP.rows[0] ? (CP.rows[0][primary.column] || primary.placeholder.replace(/[{}]/g, '')) : 'participant_name';
  const pill = document.getElementById('fnNamePill');
  if (pill) pill.textContent = sampleName;
  fnUpdatePreview();
}

function fnUpdatePreview() {
  const primary = ED.fields.find(f => f.isPrimary);
  const sampleName = primary && CP.rows && CP.rows[0] ? sanitizeFilename(CP.rows[0][primary.column] || 'Name') : 'Name';
  const event = (document.getElementById('fnEventInput')?.value || '').trim();
  const preview = document.getElementById('fnPreviewText');
  if (preview) preview.textContent = sampleName + (event ? '_' + sanitizeFilename(event) : '') + '_01.pdf';
  const sep = document.getElementById('fnSepNum'); if (sep) sep.style.display = event ? 'none' : '';
}

function sanitizeFilename(str) { return String(str).replace(/[^a-zA-Z0-9_\-\u0900-\u097F\u00C0-\u024F]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''); }

function buildOutputFilename(rowData, index) {
  const primary = ED.fields.find(f => f.isPrimary);
  const name = primary ? sanitizeFilename(rowData[primary.column] || 'cert') : 'cert';
  return `${name}${CP.eventName ? '_' + sanitizeFilename(CP.eventName) : ''}_${String(index + 1).padStart(2, '0')}.pdf`;
}

/* ════════════════════════════════════════════════════════════════
   STEP 4 — EMAIL TEMPLATE (AI ENGINE)
════════════════════════════════════════════════════════════════ */

const ME = {
  blocks: [], selectedId: null, nextId: 1, activeTab: 'visual', cm: null, cmDebounce: null, previewDevice: 'desktop', initialized: false, mode: 'visual'
};

function initStep4() {
  if (ME.initialized) return;

  const cmEl = document.getElementById('meCmWrap');
  if (cmEl && typeof CodeMirror !== 'undefined') {
    cmEl.innerHTML = '';
    const txt = document.createElement('textarea');
    cmEl.appendChild(txt);
    ME.cm = CodeMirror.fromTextArea(txt, { mode: 'xml', theme: 'dracula', lineNumbers: true, lineWrapping: true });
    ME.cm.on('change', () => {
      clearTimeout(ME.cmDebounce);
      ME.cmDebounce = setTimeout(() => {
        if (ME.activeTab === 'code') meUpdatePreview();
        const btn = document.getElementById('meBtnApplyCode');
        if (btn) btn.style.display = 'inline-flex';
        document.getElementById('mHtmlTmpl').value = ME.cm.getValue();
      }, 500);
    });
  }

  const canvasEl = document.getElementById('meCanvas');
  if (canvasEl && typeof Sortable !== 'undefined') {
    Sortable.create(canvasEl, {
      animation: 150, handle: '.me-drag-handle', ghostClass: 'm-ghost',
      onEnd: e => {
        if (e.oldIndex === e.newIndex) return;
        const item = ME.blocks.splice(e.oldIndex, 1)[0];
        ME.blocks.splice(e.newIndex, 0, item);
        meSyncToCode();
      }
    });
  }

  meTplGateBuild();
  mePopulateTags();

  document.getElementById('meTplGate').style.display = 'block';
  document.getElementById('meEditorWrap').style.display = 'none';
  document.getElementById('meStep4Nav').style.display = 'none';
  document.getElementById('meHeadActions').style.display = 'none';

  ME.initialized = true;
}

const ME_DEFS = {
  logo: { label: 'Logo / Banner', defaults: () => ({ text: 'GalSol', tagline: '', bgColor: '#0d1728', color: '#00d4ff', fontSize: 22, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 }) },
  header: { label: 'Heading', defaults: () => ({ text: 'Your Email Heading', fontSize: 28, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 32, paddingH: 40 }) },
  text: { label: 'Text', defaults: () => ({ text: 'Write your message here. Use {{name}} to personalize each email for your recipients.', fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 14, paddingH: 40, lineHeight: 1.75 }) },
  button: { label: 'Button', defaults: () => ({ text: 'Click Here', link: '{{certificateLink}}', btnBg: 'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 24, paddingH: 40, borderRadius: 10, fontSize: 15, fontWeight: 700 }) },
  image: { label: 'Image', defaults: () => ({ src: '', alt: 'Image', width: 100, bgColor: '#f8fafc', paddingV: 20, paddingH: 40, borderRadius: 8 }) },
  divider: { label: 'Divider', defaults: () => ({ color: '#e2e8f0', bgColor: '#ffffff', paddingV: 12, thickness: 1 }) },
  spacer: { label: 'Spacer', defaults: () => ({ height: 40, bgColor: '#ffffff' }) },
  footer: { label: 'Footer', defaults: () => ({ text: 'This email was sent via GalSol. If you have questions, contact the organiser directly.', bgColor: '#f8fafc', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 }) },
  social: { label: 'Social Links', defaults: () => ({ platforms: [{ name: 'LinkedIn', url: '', icon: 'linkedin' }, { name: 'Twitter/X', url: '', icon: 'x' }, { name: 'Instagram', url: '', icon: 'instagram' }], bgColor: '#ffffff', align: 'center', paddingV: 20, paddingH: 40, iconSize: 32, style: 'plain', color: '#475569' }) },
  table: { label: 'Table', defaults: () => ({ rows: 3, cols: 3, data: [['Header 1', 'Header 2', 'Header 3'], ['Cell', 'Cell', 'Cell'], ['Cell', 'Cell', 'Cell']], headerRow: true, borderWidth: 1, borderColor: '#e2e8f0', headerBg: '#f1f5f9', headerColor: '#1e293b', cellBg: '#ffffff', cellColor: '#475569', cellPadding: 10, fontSize: 14, bgColor: '#ffffff', paddingV: 20, paddingH: 40, width: '100%' }) },
};

const ME_TEMPLATES = {
  cert: { name: 'Certificate Dispatch', desc: 'Cert link + personalization', blocks: [{ type: 'logo', props: { text: 'GalSol', tagline: 'Certificate Platform', bgColor: '#0d1728', color: '#00d4ff', fontSize: 20, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } }, { type: 'header', props: { text: 'Your Certificate is Ready 🎉', fontSize: 26, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } }, { type: 'text', props: { text: 'Dear {{name}},\n\nCongratulations on completing your course. We are delighted to share your personalized certificate with you.', fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.75 } }, { type: 'button', props: { text: 'Download Certificate', link: '{{Certificate Link}}', btnBg: 'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 10, fontSize: 15, fontWeight: 700 } }, { type: 'divider', props: { color: '#e2e8f0', bgColor: '#ffffff', paddingV: 16, thickness: 1 } }, { type: 'footer', props: { text: 'This email was sent via GalSol. If you have questions, contact the organiser directly.', bgColor: '#f8fafc', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 } }] },
  event: { name: 'Event Invitation', desc: 'Banner + date + RSVP', blocks: [{ type: 'logo', props: { text: 'EVENT', tagline: '', bgColor: '#7c3aed', color: '#ffffff', fontSize: 18, fontWeight: 800, align: 'center', paddingV: 24, paddingH: 40 } }, { type: 'header', props: { text: "You're Invited, {{name}}!", fontSize: 28, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } }, { type: 'text', props: { text: 'We warmly invite you to join us for our upcoming event. Mark your calendar and join us for an unforgettable experience.', fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'center', paddingV: 8, paddingH: 40, lineHeight: 1.75 } }, { type: 'button', props: { text: 'RSVP Now', link: '#', btnBg: '#7c3aed', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 8, fontSize: 15, fontWeight: 700 } }] },
  thankyou: { name: 'Thank You', desc: 'Warm appreciation note', blocks: [{ type: 'logo', props: { text: 'THANK YOU', tagline: '', bgColor: '#10b981', color: '#ffffff', fontSize: 20, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } }, { type: 'header', props: { text: 'Thank You, {{name}}!', fontSize: 28, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } }, { type: 'text', props: { text: 'We wanted to take a moment to express our sincere gratitude for your participation and dedication.\n\nYour contribution has made a real difference, and we truly appreciate everything you bring to the table.', fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 12, paddingH: 40, lineHeight: 1.8 } }, { type: 'divider', props: { color: '#d1fae5', bgColor: '#ffffff', paddingV: 16, thickness: 2 } }, { type: 'footer', props: { text: 'With gratitude,\nThe GalSol Team', bgColor: '#f0fdf4', color: '#6b7280', fontSize: 13, align: 'center', paddingV: 24, paddingH: 40 } }] },
  announcement: { name: 'Announcement', desc: 'Bold headline + CTA', blocks: [{ type: 'logo', props: { text: 'ANNOUNCEMENT', tagline: '', bgColor: '#0f172a', color: '#f59e0b', fontSize: 16, fontWeight: 800, align: 'center', paddingV: 24, paddingH: 40 } }, { type: 'header', props: { text: 'Important Update', fontSize: 30, fontWeight: 800, color: '#0f172a', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } }, { type: 'text', props: { text: 'Dear {{name}},\n\nWe have an important announcement to share with you. Please read the following information carefully.', fontSize: 16, color: '#374151', bgColor: '#ffffff', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.75 } }, { type: 'button', props: { text: 'Learn More', link: '#', btnBg: '#f59e0b', btnColor: '#000000', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 8, fontSize: 15, fontWeight: 700 } }] },
  plain: { name: 'Plain Professional', desc: 'Clean text-only email', blocks: [{ type: 'spacer', props: { height: 24, bgColor: '#ffffff' } }, { type: 'text', props: { text: 'Hi {{name}},', fontSize: 18, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 4, paddingH: 40, lineHeight: 1.6 } }, { type: 'text', props: { text: 'I hope this email finds you well.\n\nThis is the main body of your email. Keep it short, professional, and to the point.', fontSize: 16, color: '#374151', bgColor: '#ffffff', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.8 } }, { type: 'text', props: { text: 'Best regards,\nThe GalSol Team', fontSize: 15, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 12, paddingH: 40, lineHeight: 1.7 } }, { type: 'divider', props: { color: '#e2e8f0', bgColor: '#ffffff', paddingV: 16, thickness: 1 } }, { type: 'footer', props: { text: 'Sent via GalSol', bgColor: '#f8fafc', color: '#9ca3af', fontSize: 12, align: 'center', paddingV: 20, paddingH: 40 } }] },
  welcome: { name: 'Welcome Email', desc: 'Warm onboarding email', blocks: [{ type: 'logo', props: { text: 'GalSol', tagline: 'Welcome aboard!', bgColor: '#6366f1', color: '#ffffff', fontSize: 20, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } }, { type: 'header', props: { text: 'Welcome, {{name}}! 🎉', fontSize: 28, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } }, { type: 'text', props: { text: "We're thrilled to have you on board. You've just taken the first step toward something amazing.", fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.75 } }, { type: 'button', props: { text: 'Get Started Now', link: '#', btnBg: 'linear-gradient(135deg,#6366f1,#8b5cf6)', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 10, fontSize: 15, fontWeight: 700 } }] },
  promo: { name: 'Promotional', desc: 'Bold offer with CTA', blocks: [{ type: 'logo', props: { text: 'SALE', tagline: 'Limited Time Offer', bgColor: '#1a0533', color: '#ec4899', fontSize: 22, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } }, { type: 'header', props: { text: 'Exclusive Offer for You, {{name}}!', fontSize: 28, fontWeight: 800, color: '#ffffff', bgColor: 'linear-gradient(135deg,#ec4899,#f97316)', align: 'center', paddingV: 36, paddingH: 40 } }, { type: 'text', props: { text: "Don't miss out on this limited-time offer. We've curated something special just for you.", fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'center', paddingV: 16, paddingH: 40, lineHeight: 1.75 } }, { type: 'button', props: { text: 'Claim Your Offer →', link: '#', btnBg: 'linear-gradient(135deg,#ec4899,#f97316)', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 30, fontSize: 16, fontWeight: 700 } }] },
  newsletter: { name: 'Newsletter', desc: 'Clean content digest', blocks: [{ type: 'logo', props: { text: 'THE DIGEST', tagline: 'Weekly Newsletter', bgColor: '#0f172a', color: '#0ea5e9', fontSize: 18, fontWeight: 800, align: 'center', paddingV: 24, paddingH: 40 } }, { type: 'header', props: { text: "This Week's Highlights", fontSize: 24, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 28, paddingH: 40 } }, { type: 'divider', props: { color: '#0ea5e9', bgColor: '#ffffff', paddingV: 4, thickness: 2 } }, { type: 'text', props: { text: 'Hi {{name}},\n\nHere\'s what happened this week that you need to know about:', fontSize: 15, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 16, paddingH: 40, lineHeight: 1.75 } }] },
  saas: { name: 'SaaS Onboarding', desc: 'Modern product email', blocks: [{ type: 'logo', props: { text: 'GalSol', tagline: 'Your workspace is ready', bgColor: '#0d1728', color: '#00d4ff', fontSize: 20, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } }, { type: 'header', props: { text: "You're all set, {{name}}!", fontSize: 28, fontWeight: 700, color: '#f8fafc', bgColor: '#1e293b', align: 'center', paddingV: 36, paddingH: 40 } }, { type: 'text', props: { text: 'Your account is active and ready to use. Here\'s a quick overview of what you can do:', fontSize: 16, color: '#cbd5e1', bgColor: '#1e293b', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.75 } }, { type: 'button', props: { text: 'Open Dashboard', link: '#', btnBg: 'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor: '#ffffff', bgColor: '#1e293b', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 10, fontSize: 15, fontWeight: 700 } }] },
  classic: { name: 'Classic Business', desc: 'Formal business email', blocks: [{ type: 'logo', props: { text: 'GalSol', tagline: 'Business Communication', bgColor: '#334155', color: '#f8fafc', fontSize: 18, fontWeight: 700, align: 'left', paddingV: 24, paddingH: 40 } }, { type: 'header', props: { text: 'Dear {{name}},', fontSize: 22, fontWeight: 600, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 32, paddingH: 40 } }, { type: 'text', props: { text: 'I am writing to inform you about an important matter regarding your account with us. Please review the following information carefully.', fontSize: 16, color: '#374151', bgColor: '#ffffff', align: 'left', paddingV: 4, paddingH: 40, lineHeight: 1.8 } }, { type: 'divider', props: { color: '#e2e8f0', bgColor: '#ffffff', paddingV: 12, thickness: 1 } }] }
};
const ME_TPL_CATS = { cert: 'certificate', event: 'event', thankyou: 'welcome', announcement: 'promo', plain: 'welcome', welcome: 'welcome', promo: 'promo', newsletter: 'newsletter', saas: 'welcome', classic: 'welcome' };
let meTplGateSelected = null;

function meTplGateBuild() {
  const grid = document.getElementById('meTplGateGrid');
  if (!grid) return;
  const blankHtml = `
    <div class="me-tpl-gate-card" id="meTplGateCard_blank" onclick="meTplGateSelect('blank')" data-cat="all">
      <div class="me-tpl-gate-thumb" style="background:linear-gradient(135deg,#1e293b,#0f172a);display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" style="width:40px;height:40px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>
      </div>
      <div class="me-tpl-gate-info"><div class="me-tpl-gate-name">Blank Canvas</div><div class="me-tpl-gate-desc">Start from scratch</div></div>
    </div>
    <div class="me-tpl-gate-card" id="meTplGateCard_code" onclick="meTplGateSelect('code')" data-cat="all">
      <div class="me-tpl-gate-thumb" style="background:linear-gradient(135deg,#0d9488,#0f172a);display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" style="width:40px;height:40px"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </div>
      <div class="me-tpl-gate-info"><div class="me-tpl-gate-name">Paste Code</div><div class="me-tpl-gate-desc">Write or paste pure HTML</div></div>
    </div>`;

  const cards = Object.entries(ME_TEMPLATES).map(([key, tpl]) => {
    const cat = ME_TPL_CATS[key] || 'all';
    const previewHtml = meGetHtmlFromBlocks(tpl.blocks).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `<div class="me-tpl-gate-card" id="meTplGateCard_${key}" onclick="meTplGateSelect('${key}')" data-cat="${cat}">
        <div class="me-tpl-gate-thumb"><iframe srcdoc="${previewHtml}" scrolling="no" tabindex="-1"></iframe><div class="me-tpl-gate-thumb-overlay"></div></div>
        <div class="me-tpl-gate-info"><div class="me-tpl-gate-name">${tpl.name}</div><div class="me-tpl-gate-desc">${tpl.desc || ''}</div></div>
      </div>`;
  });
  grid.innerHTML = blankHtml + cards.join('');
}

function meTplGateFilter(cat, btn) {
  document.querySelectorAll('.me-tpl-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('#meTplGateGrid .me-tpl-gate-card').forEach(card => {
    const cardCat = card.dataset.cat || 'all';
    card.style.display = (cat === 'all' || cardCat === cat || card.id === 'meTplGateCard_blank' || card.id === 'meTplGateCard_code') ? '' : 'none';
  });
}

function meTplGateSelect(key) {
  meTplGateSelected = key;
  document.querySelectorAll('#meTplGateGrid .me-tpl-gate-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById('meTplGateCard_' + key);
  if (card) card.classList.add('selected');
  const btn = document.getElementById('meTplGateUseBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = (key === 'blank' || key === 'code') ? `Start ${(key === 'blank' ? 'Visual' : 'Code')} Editor →` : 'Use Template — Open Editor →'; }
}

function meTplGateConfirm() {
  if (!meTplGateSelected) return;
  meSelectTemplate(meTplGateSelected);
}

function meBackToGate() {
  document.getElementById('meTplGate').style.display = 'block';
  document.getElementById('meEditorWrap').style.display = 'none';
  document.getElementById('meStep4Nav').style.display = 'none';
  document.getElementById('meHeadActions').style.display = 'none';
  const fab = document.getElementById('galAiFab');
  if (fab) fab.classList.remove('visible');
  const panel = document.getElementById('galAiPanel');
  if (panel && panel.classList.contains('open')) galAiToggle();
  // Restore all tabs (in case we came from paste-code mode)
  const tv = document.getElementById('meTabVisual');
  if (tv) tv.style.display = '';
}

function meSelectTemplate(type) {
  document.getElementById('meTplGate').style.display = 'none';
  document.getElementById('meEditorWrap').style.display = 'flex';
  document.getElementById('meStep4Nav').style.display = 'flex';
  document.getElementById('meHeadActions').style.display = 'flex';

  ME.mode = (type === 'code') ? 'code' : 'visual';
  ME.codeEditable = (type === 'code'); // only paste-code template is editable

  // Gal AI available for all template types
  const fab = document.getElementById('galAiFab');
  if (fab) fab.classList.add('visible');
  document.getElementById('meTabBarWrap').style.display = 'flex';

  // For paste-code mode, hide the Visual tab
  const tabVisual = document.getElementById('meTabVisual');
  if (tabVisual) tabVisual.style.display = (type === 'code') ? 'none' : '';

  if (type === 'blank') {
    // Blank canvas — no preset blocks, code is view-only
    ME.blocks = []; ME.selectedId = null;
    if (ME.cm) ME.cm.setOption('readOnly', true);
    meSwitchTab('visual');
  } else if (type === 'code') {
    // Paste Code — editable code editor, fresh/empty, no visual tab
    ME.blocks = [];
    if (ME.cm) { ME.cm.setValue(''); ME.cm.setOption('readOnly', false); }
    meRenderCanvas();
    meSwitchTab('code');
    return; // skip meSyncToCode below (editor is already empty)
  } else if (ME_TEMPLATES[type]) {
    // Pre-built templates — visual editor, code is view-only
    ME.blocks = ME_TEMPLATES[type].blocks.map(b => ({
      id: 'b' + (ME.nextId++), type: b.type, props: JSON.parse(JSON.stringify(b.props))
    }));
    ME.selectedId = null;
    if (ME.cm) ME.cm.setOption('readOnly', true);
    meSwitchTab('visual');
  }
  meRenderCanvas(); meSyncToCode();
}

function mePopulateTags() {
  const cont = document.getElementById('meMergeTags');
  if (!cont) return;
  if (!CP.headers || CP.headers.length === 0) {
    cont.innerHTML = '<span style="font-size:12px;color:var(--text-3);font-style:italic">No headers loaded yet.</span>';
    return;
  }
  let html = CP.headers.map(h => `<div class="me-tag" onclick="meInsertTag('{{${h}}}')">{{${h}}}</div>`).join('');
  html += `<div class="me-tag" onclick="meInsertTag('{{Certificate Link}}')" style="background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.3)">★ {{Certificate Link}}</div>`;
  cont.innerHTML = html;
}

let meLastFocusedField = null;
function meInsertTag(tag) {
  if (ME.activeTab === 'code' && ME.cm) {
    ME.cm.replaceSelection(tag); ME.cm.focus(); return;
  }
  if (meLastFocusedField && meLastFocusedField.id === 'mSubject') {
    const el = document.getElementById('mSubject');
    if (el) {
      const start = el.selectionStart, end = el.selectionEnd;
      el.value = el.value.substring(0, start) + tag + el.value.substring(end);
      el.focus(); el.selectionStart = el.selectionEnd = start + tag.length;
    }
    return;
  }
  const block = ME.blocks.find(b => b.id === ME.selectedId);
  if (block && block.props.text !== undefined) {
    block.props.text += tag; meRenderCanvas(); meRenderProps(block); meSyncToCode();
  } else {
    toast('Select a text block or the subject line to insert a tag.', 'info');
  }
}

function meSwitchTab(tab) {
  ME.activeTab = tab;
  ['visual', 'code', 'preview'].forEach(t => {
    const btn = document.getElementById('meTab' + t.charAt(0).toUpperCase() + t.slice(1));
    // Don't mark hidden tab (Visual in code mode) as active — just toggle visible tabs
    if (btn && btn.style.display !== 'none') btn.classList.toggle('active', t === tab);
    const panel = document.getElementById('me' + t.charAt(0).toUpperCase() + t.slice(1));
    if (panel) panel.style.display = (t === tab) ? (t === 'visual' ? 'grid' : 'block') : 'none';
  });
  if (tab === 'code') {
    if (ME.cm) setTimeout(() => ME.cm.refresh(), 50);
    // Update bottom bar label based on editable state
    const bar = document.querySelector('.me-code-apply-bar span');
    if (bar) bar.textContent = ME.codeEditable
      ? 'Type or paste your HTML here — Gal AI can write it for you ✨'
      : 'View-only — use Copy Code to export, or switch to Visual to edit blocks';
  }
  if (tab === 'preview') meUpdatePreview();
}

function meSetDevice(device) {
  ME.previewDevice = device;
  document.getElementById('meBtnDesktop').classList.toggle('active', device === 'desktop');
  document.getElementById('meBtnMobile').classList.toggle('active', device === 'mobile');
  const frame = document.getElementById('mePreviewFrame');
  if (frame) {
    frame.style.width = (device === 'mobile') ? '375px' : '100%';
    setTimeout(() => resizeMailPreview(), 50);
  }
}

function meAddBlock(type) {
  const def = ME_DEFS[type]; if (!def) return;
  const block = { id: 'b' + (ME.nextId++), type, props: def.defaults() };
  ME.blocks.push(block); meRenderCanvas(); meSelectBlock(block.id); meSyncToCode();
  setTimeout(() => { const w = document.getElementById('meCanvasWrap'); if (w) w.scrollTop = w.scrollHeight; }, 50);
}

function meDeleteBlock(id) {
  ME.blocks = ME.blocks.filter(b => b.id !== id);
  if (ME.selectedId === id) { ME.selectedId = null; meRenderProps(null); }
  meRenderCanvas(); meSyncToCode();
}

function meDuplicateBlock(id) {
  const idx = ME.blocks.findIndex(b => b.id === id); if (idx < 0) return;
  const copy = { id: 'b' + (ME.nextId++), type: ME.blocks[idx].type, props: JSON.parse(JSON.stringify(ME.blocks[idx].props)) };
  ME.blocks.splice(idx + 1, 0, copy); meRenderCanvas(); meSelectBlock(copy.id); meSyncToCode();
}

function meSelectBlock(id) {
  ME.selectedId = id;
  document.querySelectorAll('.me-block-wrap').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
  meRenderProps(ME.blocks.find(b => b.id === id));
}

function meRenderCanvas() {
  const canvas = document.getElementById('meCanvas'); if (!canvas) return;
  if (!ME.blocks.length) {
    canvas.innerHTML = `<div class="me-empty-canvas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg><div style="font-size:14px;font-weight:600">Start building your email</div><div style="font-size:12.5px">Click a block type on the left</div></div>`;
    return;
  }
  canvas.innerHTML = ME.blocks.map(b => `
    <div class="me-block-wrap ${b.id === ME.selectedId ? 'selected' : ''}" data-id="${b.id}" onclick="meSelectBlock('${b.id}')">
      <div class="me-drag-handle"><span></span><span></span><span></span><span></span><span></span><span></span></div>
      <div class="me-block-controls">
        <button class="me-ctrl-btn" onclick="event.stopPropagation();meDuplicateBlock('${b.id}')" title="Duplicate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
        <button class="me-ctrl-btn del" onclick="event.stopPropagation();meDeleteBlock('${b.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
      </div>
      <div class="me-block-inner">${meBlockToHtml(b, true)}</div>
    </div>`).join('');
}

function meRenderProps(block) {
  const body = document.getElementById('mePropsBody');
  if (!body) return;
  if (!block) {
    body.innerHTML = `<div class="me-props-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>Click any block to<br/>edit its properties</div>
    </div>`;
    return;
  }
  const p = block.props, rows = [];

  if (['logo', 'header', 'text', 'footer'].includes(block.type)) {
    rows.push(meFieldTextarea('Text', block.id, 'text', p.text));
    if (['header', 'text', 'footer'].includes(block.type)) {
      rows.push(`<div class="me-field">
        <div class="me-field-label">Formatting</div>
        <div class="me-align-btns">
          <button class="me-align-btn ${p.fontWeight >= 700 ? 'active' : ''}" title="Bold"
            onclick="meUpdateProp('${block.id}','fontWeight',${p.fontWeight >= 700 ? 400 : 700});this.closest('.me-align-btns').querySelectorAll('.me-align-btn').forEach((b,i)=>{if(i===0)b.classList.toggle('active',${p.fontWeight < 700})})">
            <strong style="font-size:13px">B</strong>
          </button>
          <button class="me-align-btn ${p.fontWeight === 600 ? 'active' : ''}" title="Semi-Bold"
            onclick="meUpdateProp('${block.id}','fontWeight',${p.fontWeight === 600 ? 400 : 600});this.closest('.me-align-btns').querySelectorAll('.me-align-btn').forEach((b,i)=>{if(i===1)b.classList.toggle('active',${p.fontWeight !== 600})})">
            <span style="font-size:13px;font-weight:600">S</span>
          </button>
          <button class="me-align-btn ${p.fontStyle === 'italic' ? 'active' : ''}" title="Italic"
            onclick="meUpdateProp('${block.id}','fontStyle',${p.fontStyle === 'italic' ? "'normal'" : "'italic'"})">
            <em style="font-size:13px">I</em>
          </button>
        </div>
      </div>`);
    }
  }
  if (block.type === 'logo') rows.push(meFieldText('Tagline', block.id, 'tagline', p.tagline || ''));
  if (block.type === 'button') {
    rows.push(meFieldText('Button Text', block.id, 'text', p.text));
    rows.push(meFieldText('Link / URL', block.id, 'link', p.link));
    rows.push(meFieldColor('Button Color', block.id, 'btnBg', p.btnBg && p.btnBg.startsWith('linear') ? '#00d4ff' : p.btnBg));
    rows.push(meFieldColor('Button Text Color', block.id, 'btnColor', p.btnColor));
    rows.push(meFieldRange('Border Radius', block.id, 'borderRadius', p.borderRadius, 0, 40));
    rows.push(meFieldRange('Font Size', block.id, 'fontSize', p.fontSize, 10, 28));
  }
  if (block.type === 'image') {
    rows.push(meFieldText('Image URL', block.id, 'src', p.src));
    rows.push(meFieldText('Alt Text', block.id, 'alt', p.alt));
    rows.push(meFieldRange('Width %', block.id, 'width', p.width, 20, 100));
    rows.push(meFieldRange('Border Radius', block.id, 'borderRadius', p.borderRadius, 0, 40));
  }
  if (block.type === 'divider') {
    rows.push(meFieldColor('Line Color', block.id, 'color', p.color));
    rows.push(meFieldRange('Thickness (px)', block.id, 'thickness', p.thickness, 1, 8));
  }
  if (block.type === 'social') {
    const plats = ['LinkedIn', 'Twitter/X', 'Instagram', 'Facebook', 'YouTube', 'TikTok', 'Pinterest', 'GitHub', 'WhatsApp', 'Telegram', 'Discord', 'Snapchat', 'Website'];
    const currentPlatforms = p.platforms || [];
    const platRows = currentPlatforms.map((pl, i) => `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <select class="me-input" style="flex:0 0 110px;font-size:12px;padding:6px 8px" onchange="meSocialUpdatePlatform('${block.id}',${i},'name',this.value)">
          ${plats.map(pt => `<option value="${pt}" ${pl.name === pt ? 'selected' : ''}>${pt}</option>`).join('')}
        </select>
        <input class="me-input" type="url" placeholder="https://..." value="${pl.url || ''}"
          onfocus="meLastFocusedField={id:'${block.id}',key:'social_url_${i}',el:this}"
          oninput="meSocialUpdatePlatform('${block.id}',${i},'url',this.value)" style="flex:1;font-size:12px;padding:6px 8px"/>
        <button class="me-ctrl-btn del" onclick="meSocialRemovePlatform('${block.id}',${i})" style="width:24px;height:24px;flex-shrink:0;display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');
    rows.push(`<div class="me-field">
      <div class="me-field-label">Platforms</div>
      ${platRows}
      <button class="btn btn-outline btn-sm" style="margin-top:4px;font-size:11px" onclick="meSocialAddPlatform('${block.id}')">+ Add Platform</button>
    </div>`);
    rows.push(meFieldColor('Icon Color', block.id, 'color', p.color || '#475569'));
    rows.push(`<div class="me-field">
      <div class="me-field-label">Icon Style</div>
      <div class="me-align-btns">
        ${['plain', 'circle', 'square'].map(s => `<button class="me-align-btn ${p.style === s ? 'active' : ''}" onclick="meUpdateProp('${block.id}','style','${s}');this.closest('.me-align-btns').querySelectorAll('.me-align-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`).join('')}
      </div>
    </div>`);
    rows.push(meFieldRange('Icon Size', block.id, 'iconSize', p.iconSize || 32, 20, 60));
    rows.push(meFieldAlign(block.id, p.align));
  }
  if (block.type === 'table') {
    rows.push(`<div class="me-field">
      <div class="me-field-label">Edit Cells</div>
      <div style="overflow-x:auto;border:1px solid rgba(255,255,255,0.08);border-radius:8px;max-height:200px;overflow-y:auto">
        <table style="border-collapse:collapse;width:max-content;min-width:100%">
          ${(p.data || []).map((row, ri) => `<tr>${row.map((cell, ci) => `
            <td style="padding:3px"><input class="me-input" value="${(cell || '').replace(/"/g, '&quot;')}"
              style="width:80px;font-size:12px;padding:5px 7px"
              oninput="meTableUpdateCell('${block.id}',${ri},${ci},this.value)"/></td>`).join('')}</tr>`).join('')}
        </table>
      </div>
    </div>`);
    rows.push(`<div class="me-field"><div class="me-field-label">Size</div>
      <div style="display:flex;gap:6px">
        <div style="flex:1"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Rows</div>
          <input class="me-input" type="number" value="${p.rows}" min="1" max="20" style="font-size:13px;padding:6px 8px" oninput="meTableResize('${block.id}','rows',+this.value)"/></div>
        <div style="flex:1"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Cols</div>
          <input class="me-input" type="number" value="${p.cols}" min="1" max="10" style="font-size:13px;padding:6px 8px" oninput="meTableResize('${block.id}','cols',+this.value)"/></div>
      </div>
    </div>`);
    rows.push(`<div class="me-field"><div class="me-field-label">Header Row</div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" ${p.headerRow ? 'checked' : ''} onchange="meUpdateProp('${block.id}','headerRow',this.checked)" style="accent-color:var(--cyan)"/>
        <span style="font-size:13px;color:var(--text-2)">First row is header</span>
      </label></div>`);
    rows.push(meFieldRange('Border Width', block.id, 'borderWidth', p.borderWidth, 0, 5));
    rows.push(meFieldColor('Border Color', block.id, 'borderColor', p.borderColor));
    rows.push(meFieldColor('Header Background', block.id, 'headerBg', p.headerBg));
    rows.push(meFieldColor('Header Text', block.id, 'headerColor', p.headerColor));
    rows.push(meFieldColor('Cell Background', block.id, 'cellBg', p.cellBg));
    rows.push(meFieldColor('Cell Text', block.id, 'cellColor', p.cellColor));
    rows.push(meFieldRange('Cell Padding', block.id, 'cellPadding', p.cellPadding, 4, 32));
    rows.push(meFieldRange('Font Size', block.id, 'fontSize', p.fontSize, 10, 24));
  }
  if (block.type === 'spacer') rows.push(meFieldRange('Height (px)', block.id, 'height', p.height, 8, 120));

  // Common props
  if (['logo', 'header', 'text', 'button', 'footer'].includes(block.type)) {
    rows.push(meFieldAlign(block.id, p.align));
    if (['header', 'text', 'footer'].includes(block.type)) {
      rows.push(meFieldColor('Text Color', block.id, 'color', p.color));
      rows.push(meFieldRange('Font Size', block.id, 'fontSize', p.fontSize, 10, 48));
    }
    if (block.type === 'logo') {
      rows.push(meFieldColor('Text Color', block.id, 'color', p.color));
      rows.push(meFieldRange('Font Size', block.id, 'fontSize', p.fontSize, 12, 40));
    }
  }
  rows.push(meFieldColor('Background', block.id, 'bgColor', p.bgColor));
  rows.push(meFieldRange('Padding Top/Bottom', block.id, 'paddingV', p.paddingV, 0, 80));
  if (p.paddingH !== undefined) rows.push(meFieldRange('Padding Left/Right', block.id, 'paddingH', p.paddingH, 0, 80));

  body.innerHTML = `<div class="me-props-body">
    <div style="font-size:12px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">${(ME_DEFS[block.type] || {}).label || block.type}</div>
    ${rows.join('')}
  </div>`;
}

function meFieldText(label, id, key, val) {
  return `<div class="me-field"><div class="me-field-label">${label}</div>
    <input class="me-input" type="text" value="${(val || '').replace(/"/g, '&quot;')}"
      onfocus="meLastFocusedField={id:'${id}',key:'${key}',el:this}"
      oninput="meUpdateProp('${id}','${key}',this.value)"/></div>`;
}
function meFieldTextarea(label, id, key, val) {
  return `<div class="me-field"><div class="me-field-label">${label}</div>
    <textarea class="me-textarea" oninput="meUpdateProp('${id}','${key}',this.value)">${(val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></div>`;
}
function meFieldColor(label, id, key, val) {
  return `<div class="me-field"><div class="me-field-label">${label}</div>
    <div class="me-color-row">
      <div class="me-color-swatch" style="background:${val || '#ffffff'}" id="swatch_${id}_${key}">
        <input type="color" value="${val || '#ffffff'}"
          oninput="document.getElementById('swatch_${id}_${key}').style.background=this.value;document.getElementById('hex_${id}_${key}').value=this.value;meUpdateProp('${id}','${key}',this.value)"/>
      </div>
      <input class="me-input" type="text" id="hex_${id}_${key}" value="${val || '#ffffff'}"
        oninput="document.getElementById('swatch_${id}_${key}').style.background=this.value;meUpdateProp('${id}','${key}',this.value)" style="flex:1"/>
    </div></div>`;
}
function meFieldRange(label, id, key, val, min, max) {
  return `<div class="me-field">
    <div class="me-field-label" style="display:flex;justify-content:space-between">${label} <span id="rv_${id}_${key}" style="color:var(--cyan)">${val}</span></div>
    <input class="me-range" type="range" min="${min}" max="${max}" value="${val}" oninput="document.getElementById('rv_${id}_${key}').textContent=this.value;meUpdateProp('${id}','${key}',Number(this.value))"/></div>`;
}
function meFieldAlign(id, val) {
  const opts = [
    ['left', '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>'],
    ['center', '<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/>'],
    ['right', '<line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="21" y2="6"/><line x1="21" y1="14" x2="21" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/>'],
  ];
  return `<div class="me-field"><div class="me-field-label">Alignment</div>
    <div class="me-align-btns">
      ${opts.map(([a, svg]) => `<button class="me-align-btn ${val === a ? 'active' : ''}" onclick="meUpdateProp('${id}','align','${a}');this.closest('.me-align-btns').querySelectorAll('.me-align-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">${svg}</svg>
      </button>`).join('')}
    </div></div>`;
}

function meUpdateProp(id, key, value) {
  const block = ME.blocks.find(b => b.id === id);
  if (!block) return;
  block.props[key] = value;
  const inner = document.querySelector(`.me-block-wrap[data-id="${id}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  clearTimeout(ME._propSyncTimer);
  ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}

function meSocialAddPlatform(blockId) {
  const block = ME.blocks.find(b => b.id === blockId); if (!block) return;
  block.props.platforms = block.props.platforms || [];
  block.props.platforms.push({ name: 'LinkedIn', url: '' });
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  meRenderProps(block);
  clearTimeout(ME._propSyncTimer); ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}
function meSocialRemovePlatform(blockId, idx) {
  const block = ME.blocks.find(b => b.id === blockId); if (!block) return;
  block.props.platforms.splice(idx, 1);
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  meRenderProps(block);
  clearTimeout(ME._propSyncTimer); ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}
function meSocialUpdatePlatform(blockId, idx, field, val) {
  const block = ME.blocks.find(b => b.id === blockId); if (!block) return;
  block.props.platforms[idx][field] = val;
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  clearTimeout(ME._propSyncTimer); ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}
function meTableUpdateCell(blockId, ri, ci, val) {
  const block = ME.blocks.find(b => b.id === blockId); if (!block) return;
  block.props.data[ri][ci] = val;
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  clearTimeout(ME._propSyncTimer); ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}
function meTableResize(blockId, dim, val) {
  const block = ME.blocks.find(b => b.id === blockId); if (!block || val < 1) return;
  const d = block.props.data;
  if (dim === 'rows') {
    block.props.rows = val;
    while (d.length < val) d.push(Array(block.props.cols).fill(''));
    while (d.length > val) d.pop();
  } else {
    block.props.cols = val;
    d.forEach(row => { while (row.length < val) row.push(''); while (row.length > val) row.pop(); });
  }
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  meRenderProps(block);
  clearTimeout(ME._propSyncTimer); ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}

function meSyncToCode() {
  if (ME.cm) {
    const html = meGetHtml(); const pos = ME.cm.getCursor(); ME.cm.setValue(html);
    document.getElementById('mHtmlTmpl').value = html;
    try { ME.cm.setCursor(pos); } catch (e) { }
  }
}

function meApplyCodeToVisual() {
  const btn = document.getElementById('meBtnApplyCode'); if (btn) btn.style.display = 'none';
  toast('Code saved. Note: Direct code edits bypass visual blocks.', 'success');
}

function meFormatCode() { if (ME.cm) { const t = ME.cm.getValue(); ME.cm.setValue(t.replace(/></g, '>\n<')); } }
function meCopyCode() { if (ME.cm) { navigator.clipboard.writeText(ME.cm.getValue()); toast('HTML Copied!', 'success'); } }

function meUpdatePreview() {
  const frame = document.getElementById('mePreviewFrame'); if (!frame) return;
  // Use code editor content when in paste-code mode OR when code tab is active
  let html = (ME.cm && (ME.mode === 'code' || ME.activeTab === 'code')) ? ME.cm.getValue() : meGetHtml();
  if (CP.rows && CP.rows.length) {
    html = html.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      key = key.trim();
      const col = (CP.headers || []).find(h => h.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_') || h === key);
      return col ? (CP.rows[0][col] || '') : (CP.rows[0][key] || '{{' + key + '}}');
    });
  }
  const noScrollCss = `<style>::-webkit-scrollbar { display: none !important; } html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; margin: 0; padding: 0; }</style>`;
  html = html.includes('</head>') ? html.replace('</head>', noScrollCss + '</head>') : noScrollCss + html;
  frame.srcdoc = html;
  frame.onload = () => resizeMailPreview();
}

function resizeMailPreview() {
  const iframe = document.getElementById('mePreviewFrame');
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    setTimeout(() => {
      if (doc.body) { doc.body.style.margin = '0'; doc.body.style.padding = '0'; doc.body.style.overflow = 'hidden'; }
      const h = doc.documentElement;
      const realHeight = Math.max(doc.body.scrollHeight, doc.body.offsetHeight, h.clientHeight, h.scrollHeight, h.offsetHeight, 340);
      iframe.style.height = realHeight + 'px';
    }, 50);
  } catch (e) { }
}

function meGetHtmlFromBlocks(blocks) {
  const inner = blocks.map(b => meBlockToHtml(b)).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap" rel="stylesheet"/></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Plus Jakarta Sans',sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:32px 16px"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)"><tr><td>${inner}</td></tr></table></td></tr></table></body></html>`;
}
function meGetHtml() { return meGetHtmlFromBlocks(ME.blocks); }
function meBlockToHtml(block) {
  const p = block.props;
  const fs = "'Montserrat','Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  switch (block.type) {
    case 'logo':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}"><div style="font-size:${p.fontSize}px;font-weight:${p.fontWeight};color:${p.color};letter-spacing:3px;font-family:${fs}">${p.text}</div>${p.tagline ? `<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:1px;font-family:${fs}">${p.tagline}</div>` : ''}</div>`;
    case 'header':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor}"><h1 style="margin:0;font-size:${p.fontSize}px;font-weight:${p.fontWeight || 700};color:${p.color};line-height:1.2;text-align:${p.align};font-family:${fs};font-style:${p.fontStyle || 'normal'}">${p.text}</h1></div>`;
    case 'text':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor}"><p style="margin:0;font-size:${p.fontSize}px;color:${p.color};line-height:${p.lineHeight};text-align:${p.align};font-family:${fs};font-weight:${p.fontWeight || 400};font-style:${p.fontStyle || 'normal'}">${(p.text || '').replace(/\n/g, '<br/>')}</p></div>`;
    case 'button':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}"><a href="${p.link}" style="display:inline-block;padding:14px 38px;background:${p.btnBg};color:${p.btnColor};text-decoration:none;border-radius:${p.borderRadius}px;font-weight:${p.fontWeight};font-size:${p.fontSize}px;font-family:${fs}">${p.text}</a></div>`;
    case 'image':
      return p.src
        ? `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:center"><img src="${p.src}" alt="${p.alt}" style="width:${p.width}%;max-width:100%;height:auto;border-radius:${p.borderRadius}px;display:block;margin:0 auto"/></div>`
        : `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:center"><div style="width:100%;height:160px;background:#e2e8f0;border-radius:${p.borderRadius}px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px;font-family:${fs}">[Image — add a URL in the properties panel]</div></div>`;
    case 'divider':
      return `<div style="padding:${p.paddingV}px 40px;background:${p.bgColor}"><div style="height:${p.thickness}px;background:${p.color}"></div></div>`;
    case 'spacer':
      return `<div style="height:${p.height}px;background:${p.bgColor};font-size:0;line-height:0">&nbsp;</div>`;
    case 'footer':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}"><p style="margin:0;font-size:${p.fontSize}px;color:${p.color};line-height:1.6;font-family:${fs}">${(p.text || '').replace(/\n/g, '<br/>')}</p></div>`;
    case 'social': {
      // PNG icons at 64 px (2× retina) — SVG via <img> is blocked/blurry in Gmail & Outlook
      const pngMap = {
        linkedin:    'https://img.icons8.com/color/64/linkedin.png',
        'twitter/x': 'https://img.icons8.com/color/64/twitterx--v1.png',
        twitter:     'https://img.icons8.com/color/64/twitter--v1.png',
        x:           'https://img.icons8.com/color/64/twitterx--v1.png',
        instagram:   'https://img.icons8.com/color/64/instagram-new--v1.png',
        facebook:    'https://img.icons8.com/color/64/facebook-new.png',
        youtube:     'https://img.icons8.com/color/64/youtube-play.png',
        tiktok:      'https://img.icons8.com/color/64/tiktok.png',
        pinterest:   'https://img.icons8.com/color/64/pinterest.png',
        website:     'https://img.icons8.com/color/64/domain.png',
        github:      'https://img.icons8.com/ios-filled/64/github.png',
        whatsapp:    'https://img.icons8.com/color/64/whatsapp--v1.png',
        telegram:    'https://img.icons8.com/color/64/telegram-app.png',
        discord:     'https://img.icons8.com/color/64/discord-logo.png',
        snapchat:    'https://img.icons8.com/color/64/snapchat.png',
      };
      const size = p.iconSize || 32;
      const pad = p.style === 'plain' ? 0 : Math.round(size * 0.25);
      const br = p.style === 'circle' ? '50%' : p.style === 'square' ? '8px' : '0';
      const bgBadge = p.style !== 'plain' ? 'background:rgba(128,128,128,0.12);' : '';
      const icons = (p.platforms || []).filter(pl => pl.url).map(pl => {
        const key = pl.icon || (pl.name || '').toLowerCase();
        const src = pngMap[key] || pngMap.website;
        const imgHtml = `<img src="${src}" width="${size}" height="${size}" alt="${pl.name}" style="display:block;outline:none;border:none;-ms-interpolation-mode:bicubic;width:${size}px;height:${size}px"/>`;
        return `<a href="${pl.url}" style="display:inline-block;margin:0 ${Math.round(size * 0.2)}px;text-decoration:none;${bgBadge}padding:${pad}px;border-radius:${br};vertical-align:middle">${imgHtml}</a>`;
      }).join('');
      return icons
        ? `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}">${icons}</div>`
        : `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:center;color:#94a3b8;font-size:13px">Add social links in properties →</div>`;
    }
    case 'table': {
      const d = p.data || [[]];
      const bw = p.borderWidth !== undefined ? p.borderWidth : 1;
      const bst = bw > 0 ? `${bw}px solid ${p.borderColor || '#e2e8f0'}` : 'none';
      const cBg = p.cellBg || '#ffffff', cColor = p.cellColor || '#475569';
      const hBg = p.headerBg || '#f1f5f9', hColor = p.headerColor || '#1e293b';
      const fSize = p.fontSize || 14, pad = p.cellPadding !== undefined ? p.cellPadding : 10;
      const rows = d.map((row, ri) => {
        const isHeader = p.headerRow && ri === 0;
        const cells = row.map(cell => {
          const cleanCell = typeof cell === 'string' ? cell.replace(/color\s*:\s*[^;"]+;?/gi, '') : cell;
          return isHeader
            ? `<th style="padding:${pad}px;background:${hBg};color:${hColor} !important;font-family:${fs};font-weight:700;font-size:${fSize}px;border:${bst};text-align:left">${cleanCell}</th>`
            : `<td style="padding:${pad}px;background:${cBg};color:${cColor} !important;font-family:${fs};font-size:${fSize}px;border:${bst}">${cleanCell}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<div style="padding:${p.paddingV !== undefined ? p.paddingV : 20}px ${p.paddingH !== undefined ? p.paddingH : 40}px;background:${p.bgColor || '#ffffff'}"><table width="${p.width || '100%'}" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:${p.width || '100%'};border:${bst}">${rows}</table></div>`;
    }
    default: return '';
  }
}

/* ── AI Engine & Chat ── */
let meAiChatHistory = [];
let meAiIsLoading = false;

/* ════════════════════════════════════════════════════════════════
   GAL AI — Fixed Panel, Resize, Greeting, Cycling Suggestions
════════════════════════════════════════════════════════════════ */
(function galAiInit() {
  const GAL_SUGGESTIONS = [
    'Generate a professional welcome email',
    'Create a dark-themed SaaS onboarding email',
    'Make the header gradient blue and bold',
    'Add a two-column image + text section',
    'Suggest 5 subject lines for this email',
    'Design a premium certificate completion email',
    'Create a bold promotional email with a CTA',
    'Add a footer with social media links',
    'Make this email look like a luxury brand',
    'Rewrite the body text in a friendly tone',
  ];
  let galCycleIdx = 0;
  let galCycleTimer = null;

  window.galAiStartCycle = function () {
    const el = document.getElementById('galAiCycleText');
    if (!el) return;
    if (galCycleTimer) clearInterval(galCycleTimer);
    galCycleTimer = setInterval(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        galCycleIdx = (galCycleIdx + 1) % GAL_SUGGESTIONS.length;
        el.textContent = GAL_SUGGESTIONS[galCycleIdx];
        el.style.opacity = '1';
      }, 400);
    }, 3000);
  };

  window.galAiSetGreetName = function () {
    try {
      const token = localStorage.getItem('GalSol_token');
      if (!token) return;
      const payload = JSON.parse(atob(token.split('.')[1]));
      const firstName = (payload.name || '').split(' ')[0] || 'there';
      const el = document.getElementById('galAiGreetName');
      if (el) el.innerHTML = `How can I help you today,<br>${firstName}`;
    } catch (e) { }
  };

  window.galAiToggle = function () {
    const panel = document.getElementById('galAiPanel');
    const fab = document.getElementById('galAiFab');
    const main = document.querySelector('.main-area');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    if (fab) fab.classList.toggle('panel-open', isOpen);
    if (main) main.classList.toggle('gal-open', isOpen);
    if (isOpen) {
      galAiStartCycle();
      galAiSetGreetName();
    } else {
      if (galCycleTimer) { clearInterval(galCycleTimer); galCycleTimer = null; }
    }
  };
  window.meToggleAiPanel = window.galAiToggle;

  window.galAiSyncGreeting = function () {
    const chat = document.getElementById('meAiChat');
    const greet = document.getElementById('galAiGreeting');
    if (!chat || !greet) return;
    const hasMessages = Array.from(chat.children).some(c => c.id !== 'galAiGreeting' && c.tagName !== 'STYLE');
    greet.style.display = hasMessages ? 'none' : 'flex';
  };

  const resizeHandle = document.getElementById('galAiResize');
  const panel = document.getElementById('galAiPanel');
  if (resizeHandle && panel) {
    let startX, startW;
    resizeHandle.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startW = parseInt(getComputedStyle(panel).width, 10);
      resizeHandle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (e) => {
        const delta = startX - e.clientX;
        const newW = Math.min(640, Math.max(300, startW + delta));
        document.documentElement.style.setProperty('--gal-width', newW + 'px');
      };
      const onUp = () => {
        resizeHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  window.meAiAppendBubble = function (role, content, isTyping) {
    const chat = document.getElementById('meAiChat');
    if (!chat) return null;
    const wrap = document.createElement('div');
    const id = 'msg_' + Date.now();
    wrap.id = id;

    if (role === 'user') {
      wrap.style.cssText = 'background:rgba(255,255,255,0.08); color:var(--text); padding:14px 20px; border-radius:18px 18px 4px 18px; max-width:85%; align-self:flex-end; font-size:15px; line-height:1.5; font-family:"Plus Jakarta Sans"; margin-bottom:24px; border:1px solid rgba(255,255,255,0.05);';
      wrap.textContent = content;
    } else {
      wrap.style.cssText = 'display:flex; gap:16px; align-self:flex-start; width:100%; color:var(--text); font-size:15px; line-height:1.7; font-family:"Plus Jakarta Sans"; margin-bottom:24px; background:transparent; border:none; padding:0;';
      if (isTyping) {
        const statuses = ['Analyzing style', 'Drafting copy', 'Designing blocks'];
        let sIdx = 0;
        wrap.innerHTML = `
          <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#00d4ff,#7c3aed); display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; box-shadow:0 4px 12px rgba(124,58,237,0.3); margin-top:2px;">✨</div>
          <div style="flex:1; display:flex; align-items:center; gap:8px;">
            <div style="display:flex; gap:4px;">
               <div style="width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:galThinkDot 1.4s ease-in-out infinite 0s;"></div>
               <div style="width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:galThinkDot 1.4s ease-in-out infinite 0.2s;"></div>
               <div style="width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:galThinkDot 1.4s ease-in-out infinite 0.4s;"></div>
            </div>
            <span id="thinkText_${id}" style="color:var(--cyan); font-weight:600; font-size:14px;">Thinking...</span>
          </div>`;
        wrap.dataset.thinkTimer = setInterval(() => {
          sIdx = (sIdx + 1) % statuses.length;
          const el = document.getElementById(`thinkText_${id}`);
          if (el) el.textContent = statuses[sIdx] + '...';
        }, 1500);
      } else {
        let parsed = content.replace(/\n/g, '<br>');
        parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        parsed = parsed.replace(/\*(.*?)\*/g, '<em>$1</em>');
        wrap.innerHTML = `
          <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#00d4ff,#7c3aed); display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; box-shadow:0 4px 12px rgba(124,58,237,0.3); margin-top:2px;">✨</div>
          <div style="flex:1;">${parsed}</div>`;
      }
    }

    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    const greet = document.getElementById('galAiGreeting');
    if (greet) greet.style.display = 'none';
    return wrap;
  };

  document.addEventListener('DOMContentLoaded', () => {
    galAiSyncGreeting();
    galAiSetGreetName();
  });
})();

let _galAiIsPro = null;
async function _galAiCheckPro() {
  if (_galAiIsPro !== null) return _galAiIsPro;
  try {
    const token = localStorage.getItem('GalSol_token');
    const res = await fetch('https://certiflow-backend-73xk.onrender.com/api/settings/plan', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    _galAiIsPro = data?.plan === 'pro';
  } catch (_) { _galAiIsPro = false; }
  return _galAiIsPro;
}

function meAiShowUpgrade() {
  const chat = document.getElementById('meAiChat');
  if (!chat) return;
  const greet = document.getElementById('galAiGreeting');
  if (greet) greet.style.display = 'none';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:12px;margin-bottom:24px';
  wrap.innerHTML = `
    <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;box-shadow:0 4px 12px rgba(124,58,237,0.3);margin-top:2px;">✨</div>
    <div style="flex:1;">
      <div style="font-size:14px;color:var(--text);line-height:1.6;margin-bottom:10px">Gal AI is a <strong>Pro feature</strong>. Upgrade to unlock AI-powered email generation, design suggestions, and unlimited assistance.</div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">
        <a href="settings.html#billing" style="padding:8px 14px;border-radius:10px;background:linear-gradient(90deg,rgba(0,212,255,0.18),rgba(124,58,237,0.18));border:1px solid rgba(0,212,255,0.3);color:var(--cyan);font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;">🚀 Upgrade to Pro →</a>
        <button onclick="meAiShowProDetails(this)" style="padding:8px 14px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--text);font-size:13px;cursor:pointer;font-family:inherit;">What's included?</button>
      </div>
    </div>`;
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}

function meAiShowProDetails(btn) {
  const chat = document.getElementById('meAiChat');
  btn.closest('div[style*="display:flex"]')?.insertAdjacentHTML('afterend',
    `<div style="display:flex;gap:12px;margin-bottom:24px">
      <div style="width:28px;flex-shrink:0"></div>
      <div style="flex:1;font-size:13.5px;color:var(--text-2);line-height:1.8">
        ✦ Unlimited AI email generation<br>
        ✦ Smart design suggestions<br>
        ✦ Block-level AI edits<br>
        ✦ Subject line brainstorming<br>
        ✦ Priority sending quota
      </div>
    </div>`
  );
  btn.remove();
  if (chat) chat.scrollTop = chat.scrollHeight;
}

async function meAiSend() {
  const input = document.getElementById('meAiInput');
  if (!input || meAiIsLoading) return;
  const msg = input.value.trim(); if (!msg) return;

  input.value = '';
  input.style.height = 'auto';
  meAiIsLoading = true;
  const btn = document.getElementById('meAiSendBtn');
  if (btn) btn.disabled = true;

  window.meAiAppendBubble('user', msg);
  const typingEl = window.meAiAppendBubble('ai', '', true);

  const isPro = await _galAiCheckPro();
  if (!isPro) {
    if (typingEl) { clearInterval(typingEl.dataset.thinkTimer); typingEl.remove(); }
    meAiShowUpgrade();
    meAiIsLoading = false;
    if (btn) btn.disabled = false;
    return;
  }

  meAiChatHistory.push({ role: 'user', content: msg });

  try {
    const token = localStorage.getItem('GalSol_token');
    const response = await fetch('https://certiflow-backend-73xk.onrender.com/api/ai/generate-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        userMessage: msg,
        mode: ME.mode || 'visual',
        htmlModeText: (ME.mode === 'code' && ME.cm) ? ME.cm.getValue() : '',
        currentBlocks: ME.blocks,
        headers: CP.headers,
        chatHistory: meAiChatHistory.slice(-10),
        selectedBlockId: ME.selectedId
      }),
    });
    const res = await response.json();
    if (typingEl) { clearInterval(typingEl.dataset.thinkTimer); typingEl.remove(); }

    const action = res.action;
    const message = res.message || '';

    meAiChatHistory.push({ role: 'model', content: message });

    if (action === 'replace_html' && res.html && ME.mode === 'code') { if (typeof res.html === 'string' && ME.cm) { ME.cm.setValue(res.html); document.getElementById('mHtmlTmpl').value = res.html; if (typeof meRefreshPreviewIframe === 'function') meRefreshPreviewIframe(); } window.meAiAppendBubble('ai', message || 'Your HTML code has been updated directly!'); toast('AI updated your HTML', 'success', 2000); }
    else if (action === 'replace_blocks' && res.blocks && res.blocks.length) { ME.blocks = res.blocks.map(b => ({ id: b.id || ('b' + (ME.nextId++)), type: b.type, props: b.props || {} })); ME.selectedId = null; meRenderCanvas(); meRenderProps(null); meSyncToCode(); window.meAiAppendBubble('ai', message || 'Done! Your email has been updated.'); toast('AI updated your email', 'success', 2000); }
    else if (action === 'update_block' && res.blockId && res.props) { const b = ME.blocks.find(x => x.id === res.blockId) || ME.blocks.find(b => b.id === ME.selectedId); if (b) { Object.assign(b.props, res.props); const inner = document.querySelector(`.me-block-wrap[data-id="${b.id}"] .me-block-inner`); if (inner) inner.innerHTML = meBlockToHtml(b); meSyncToCode(); if (ME.selectedId === b.id) meRenderProps(b); window.meAiAppendBubble('ai', message || 'Block updated!'); } else { window.meAiAppendBubble('ai', message || 'Could not find block to update. Please select a block first.'); } }
    else if (action === 'subject_suggestions' && res.suggestions) { if (window.meAiApplySuggestions) window.meAiApplySuggestions(res.suggestions); else window.meAiAppendBubble('ai', message || 'Here are some suggestions.'); }
    else {
      window.meAiAppendBubble('ai', message || 'How else can I help?');
      if (ME.mode === 'code' && ME.cm && /<[a-zA-Z][\s\S]*>/.test(message)) {
        const htmlMatch = message.match(/```html\s*([\s\S]*?)```/) || message.match(/(<!DOCTYPE[\s\S]*?<\/html>)/i) || message.match(/(<html[\s\S]*?<\/html>)/i);
        const htmlCode = htmlMatch ? (htmlMatch[1] || htmlMatch[0]) : message;
        ME.cm.setValue(htmlCode.replace(/^```html\s*/, '').replace(/\s*```$/, ''));
        document.getElementById('mHtmlTmpl').value = ME.cm.getValue();
      }
    }
  } catch (err) { if (typingEl) { clearInterval(typingEl.dataset.thinkTimer); typingEl.remove(); } window.meAiAppendBubble('ai', 'Error: ' + err.message); }
  finally { meAiIsLoading = false; if (btn) btn.disabled = false; }
}

window.meAiApplySuggestions = function (suggestions) {
  const chat = document.getElementById('meAiChat');
  if (!chat || !suggestions?.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'gal-ai-sugg-list';
  suggestions.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'gal-ai-sugg-btn';
    btn.textContent = s;
    btn.onclick = () => window.meAiApplySubject && window.meAiApplySubject(btn, s);
    wrap.appendChild(btn);
  });
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
};

window.meAiApplySubject = function (btn, subject) {
  const el = document.getElementById('mSubject');
  if (el) {
    el.value = subject;
    el.style.borderColor = 'rgba(0,212,255,0.6)';
    setTimeout(() => el.style.borderColor = '', 1500);
    toast('Subject applied!', 'success', 2000);
  }
  btn.style.background = 'rgba(16,185,129,0.2)';
  btn.style.borderColor = 'rgba(16,185,129,0.35)';
};

window.applyAiOption = function (text) {
  if (window.meLastFocusedField && window.meLastFocusedField.id === 'mSubject') {
    const subj = document.getElementById('mSubject');
    if (subj) {
      subj.value = text;
      toast('Subject updated!', 'success');
      return;
    }
  }
  if (typeof ME !== 'undefined' && ME.selectedId) {
    const b = ME.blocks.find(x => x.id === ME.selectedId);
    if (b && (b.type === 'text' || b.type === 'header' || b.type === 'footer')) {
      b.props.text = text;
      if (typeof meRenderCanvas === 'function') meRenderCanvas();
      if (typeof meRenderProps === 'function') meRenderProps(b);
      toast('Text block updated!', 'success');
      return;
    }
  }
  navigator.clipboard.writeText(text);
  toast('Copied to clipboard!', 'info');
};

/* ════════════════════════════════════════════════════════════════
   UPDATE LAUNCH PIPELINE HTML FETCH
════════════════════════════════════════════════════════════════ */
// Ensure we use the textarea value exactly as it is built!
function getFinalHtmlTmpl() {
  return document.getElementById('mHtmlTmpl').value || meGetHtml();
}
/* ════════════════════════════════════════════════════════════════
   STEP 5 — REVIEW
════════════════════════════════════════════════════════════════ */
function personalise(tmpl, row, mappings) {
  return (tmpl || '').replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    key = key.trim();
    if (mappings && mappings[key] && row[mappings[key]] != null) return row[mappings[key]];
    if (row[key] != null) return row[key];
    const col = (CP.headers || []).find(h => h.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_') || h === key);
    return col ? (row[col] ?? '') : ('{{' + key + '}}');
  });
}

let rvPrevIdx = 0;

function rvRenderAt(idx) {
  if (!CP.rows || !CP.rows.length) return;
  idx = Math.max(0, Math.min(idx, CP.rows.length - 1));
  rvPrevIdx = idx;
  const n = CP.rows.length;
  const certNav = document.getElementById('rvCertNavLabel');
  const emailNav = document.getElementById('rvEmailNavLabel');
  if (certNav) certNav.textContent = `${idx + 1} / ${n}`;
  if (emailNav) emailNav.textContent = `${idx + 1} / ${n}`;

  const mappings = getAllMappings();
  const row = CP.rows[idx];
  const emailCol = mappings.email;
  const subjectRaw = document.getElementById('mSubject')?.value || '';

  const toEl = document.getElementById('rvEmailTo');
  const subEl = document.getElementById('rvEmailSubject');
  if (toEl) toEl.textContent = (row[emailCol] || '—');
  if (subEl) subEl.textContent = personalise(subjectRaw, row, mappings) || '—';

  const htmlTmpl = getFinalHtmlTmpl();
  const personHtml = personalise(htmlTmpl, row, mappings);
  const frame = document.getElementById('rvEmailFrame');
  if (frame) {
    frame.srcdoc = personHtml;
    // Auto-resize iframe after content loads
    frame.onload = () => {
      try {
        const h = frame.contentDocument?.body?.scrollHeight;
        if (h && h > 100) frame.style.minHeight = h + 'px';
      } catch (_) { }
    };
  }

  // Render personalized certificate preview
  rvRenderCert(idx);

  // Prev/next button states
  const prevBtn = document.querySelector('[onclick="rvNavPrev()"]');
  const nextBtn = document.querySelector('[onclick="rvNavNext()"]');
  if (prevBtn) prevBtn.disabled = idx === 0;
  if (nextBtn) nextBtn.disabled = idx === n - 1;
}

function rvNavPrev() { rvRenderAt(rvPrevIdx - 1); }
function rvNavNext() { rvRenderAt(rvPrevIdx + 1); }

function rvRenderCert(idx) {
  const row = CP.rows[idx] || {};
  const canvas = document.getElementById('rvCertPreviewCanvas');
  const fallback = document.getElementById('rvCertFallback');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(1, 720 / ED.w);
  const cssW = Math.round(ED.w * scale);
  const cssH = Math.round(ED.h * scale);

  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = '100%';
  canvas.style.maxWidth = Math.max(cssW, 800) + 'px';
  canvas.style.maxHeight = '600px';
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = `${ED.w} / ${ED.h}`;
  canvas.style.objectFit = 'contain';
  canvas.style.display = 'block';
  if (fallback) fallback.style.display = 'none';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale * dpr, scale * dpr);

  const drawFields = () => {
    ED.fields.forEach(f => {
      const boxX = (f.x / 100) * ED.w;
      const boxY = (f.y / 100) * ED.h;
      const boxW = (f.width / 100) * ED.w;
      const fs = Math.max(4, f.fontSize);
      const ls = (f.letterSpacing || 0);
      const fw = f.bold ? 700 : getFontWeight(f.fontFamily || 'Helvetica');
      const fi = f.italic ? 'italic' : 'normal';
      const ff = getFontCSS(f.fontFamily || 'Helvetica');

      let value = f.placeholder;
      if (f.column && row[f.column] !== undefined) {
        value = String(row[f.column]);
      } else {
        Object.keys(row).forEach(col => {
          value = value.replace(new RegExp(`{{${col}}}`, 'gi'), row[col] || '');
        });
        if (value === f.placeholder) value = f.previewText || f.placeholder;
      }

      ctx.save();
      ctx.font = `${fi} ${fw} ${fs}px ${ff}`;
      ctx.fillStyle = f.color || '#1a1a1a';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      const words = String(value).split(' ');
      const lines = [];
      let currentLine = words[0] || '';
      for (let j = 1; j < words.length; j++) {
        const word = words[j];
        const testLine = currentLine + ' ' + word;
        let testWidth = ctx.measureText(testLine).width;
        if (ls > 0 && testLine.length > 1) testWidth += ls * (testLine.length - 1);
        if (testWidth > boxW && currentLine !== '') {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine !== '') lines.push(currentLine);
      if (lines.length === 0) lines.push('');

      const numLines = lines.length;

      const cx = boxX + boxW / 2;
      const cy = boxY + (fs * 1.3 * numLines) / 2;
      ctx.translate(cx, cy);
      ctx.rotate((f.rotation || 0) * Math.PI / 180);
      ctx.translate(-cx, -cy);

      lines.forEach((line, i) => {
        const drawY = boxY + (i * fs * 1.3);
        let textW = ctx.measureText(line).width;
        if (ls > 0 && line.length > 1) textW += ls * (line.length - 1);

        let drawX = boxX;
        if ((f.align || 'center') === 'center') drawX = boxX + (boxW - textW) / 2;
        else if (f.align === 'right') drawX = boxX + boxW - textW;

        if (ls > 0 && line.length > 1) {
          let drawCx = drawX;
          for (const ch of line) {
            ctx.fillText(ch, drawCx, drawY);
            drawCx += ctx.measureText(ch).width + ls;
          }
        } else {
          ctx.fillText(line, drawX, drawY);
        }
      });
      ctx.restore();
    });
  };

  if (ED.bgImg) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
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

function buildReview() {
  const n = CP.rows.length, mappings = getAllMappings(), camp = document.getElementById('cpName').value;

  // Email preview — first recipient
  rvPrevIdx = 0;
  rvRenderAt(0);

  const b64clean = ED.bgBase64 ? ED.bgBase64.split(',')[1] || ED.bgBase64 : null;
  const bgKB = b64clean ? Math.round(b64clean.length * 0.75 / 1024) : 0;
  const estMB = bgKB > 0 ? ((bgKB * n * 1.15) / 1024).toFixed(1) : '—';

  // Config summary table
  const rows = [
    { k: 'Campaign', v: camp }, { k: 'Participants', v: String(n) },
    { k: 'Data source', v: CP.sheetId ? `Sheet (${CP.sheetId.slice(0, 18)}…)` : CP.srcType === 'manual' ? 'Manual entry' : 'Uploaded file' },
    { k: 'Name column', v: mappings.name }, { k: 'Email column', v: mappings.email },
    { k: 'Certificate fields', v: `${ED.fields.length} text field(s)` },
    { k: 'Canvas size', v: `${ED.w} × ${ED.h} px` },
    { k: 'Est. total size', v: `~${estMB} MB (approx)` },
    { k: 'Email subject', v: document.getElementById('mSubject')?.value || '—' },
    { k: 'Write links back', v: document.getElementById('writeBackToggle')?.classList.contains('on') ? 'Yes' : 'No' },
  ];
  const detailsEl = document.getElementById('reviewDetailsEl');
  if (detailsEl) {
    detailsEl.style.display = 'grid';
    detailsEl.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
    detailsEl.style.gap = '16px 24px';
    detailsEl.style.padding = '8px 16px';
    detailsEl.innerHTML = rows.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--surface-2);border:1px solid var(--glass-border);border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.05);"><span style="color:var(--text-2);font-size:12.5px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700">${r.k}</span><span style="color:var(--text);font-size:14.5px;font-weight:600;text-align:right">${r.v}</span></div>`).join('');
  }
  const runJobEl = document.getElementById('runJobInfo');
  if (runJobEl) runJobEl.innerHTML = rows.slice(0, 3).map(r => `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:8px 0;border-bottom:1px solid var(--glass-border)"><span style="color:var(--text-2)">${r.k}</span><strong style="color:var(--text)">${r.v}</strong></div>`).join('');
}

/* ════════════════════════════════════════════════════════════════
   STEP 6 — LAUNCH PIPELINE
════════════════════════════════════════════════════════════════ */
function getAllMappings() {
  const m = { email: CP.emailCol || '', name: '' };
  const primary = ED.fields.find(f => f.isPrimary);
  if (primary && primary.column) m.name = primary.column;
  ED.fields.forEach(f => { if (f.column) m[f.placeholder.replace(/[{}]/g, '')] = f.column; });
  return m;
}

async function launchPipeline() {
  const btn = document.getElementById('launchBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = 'Launching...'; }
  goStep(6, true);

  const mappings = getAllMappings();
  const subject = document.getElementById('mSubject').value;
  const htmlTmpl = getFinalHtmlTmpl();
  const campName = document.getElementById('cpName').value;
  const writeBack = document.getElementById('writeBackToggle').classList.contains('on');
  const total = CP.rows.length;

  // ── INJECT NEW UI FOR RESULTS PAGE ──
  const sp6 = document.getElementById('sp6');
  if (sp6) {
    sp6.innerHTML = `
      <style>
        #liveLog::-webkit-scrollbar { width: 6px; }
        #liveLog::-webkit-scrollbar-track { background: transparent; }
        #liveLog::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
        #liveLog::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
        @keyframes typingLine {
          0% { max-width: 0; opacity: 0; }
          100% { max-width: 100%; opacity: 1; }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px currentColor; }
          50% { opacity: 0.4; box-shadow: 0 0 3px currentColor; }
        }
      </style>
      <div style="max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px;">
        <div style="text-align: center; margin-bottom: 8px;">
          <div id="runPct" style="font-size: 72px; font-family: var(--font); font-weight: 800; color: transparent; background: linear-gradient(135deg, #00d4ff, #7c3aed); -webkit-background-clip: text; background-clip: text; line-height: 1; letter-spacing: -2px; text-shadow: 0 4px 24px rgba(0,212,255,0.2);">0%</div>
          <div id="runStatus" style="font-size: 15px; color: var(--text-2); font-weight: 500; margin-top: 12px; letter-spacing: 0.5px;">Connecting to Google Server...</div>
        </div>

        <div style="display: flex; justify-content: center; gap: 24px;">
          <div style="flex: 1; background: var(--surface); backdrop-filter: blur(20px); padding: 24px; border-radius: 16px; border: 1px solid var(--glass-border); box-shadow: 0 8px 32px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; transition: transform 0.2s;">
            <div style="font-size: 38px; font-weight: 800; color: var(--cyan); font-family: var(--font-display); line-height: 1; display:flex; align-items:baseline; gap:6px;"><span id="runCertsDone">0</span><span style="font-size:20px;color:var(--text-3);font-weight:600">/ <span class="totalCount">${total}</span></span></div>
            <div style="font-size: 12.5px; color: var(--text-2); margin-top: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Certificates Created</div>
          </div>
          <div style="flex: 1; background: var(--surface); backdrop-filter: blur(20px); padding: 24px; border-radius: 16px; border: 1px solid var(--glass-border); box-shadow: 0 8px 32px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; transition: transform 0.2s;">
            <div style="font-size: 38px; font-weight: 800; color: #a78bfa; font-family: var(--font-display); line-height: 1; display:flex; align-items:baseline; gap:6px;"><span id="runMailsDone">0</span><span style="font-size:20px;color:var(--text-3);font-weight:600">/ <span class="totalCount">${total}</span></span></div>
            <div style="font-size: 12.5px; color: var(--text-2); margin-top: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Mails Sent</div>
          </div>
        </div>

        <div style="height: 8px; background: rgba(255,255,255,0.06); border-radius: 99px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2); margin-top: 8px;">
          <div id="runBar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #00d4ff, #7c3aed); border-radius: 99px; transition: width 0.3s ease; box-shadow: 0 0 12px rgba(0,212,255,0.4);"></div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
          <div style="font-size: 12px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 1px; padding-left: 4px; display:flex; align-items:center; gap:8px;">
             <span style="width:8px;height:8px;background:var(--cyan);border-radius:50%;display:inline-block;animation:pulseDot 1.5s infinite;color:var(--cyan);"></span> Live Log
          </div>
          <div id="liveLog" style="background:rgba(4,8,16,0.6); backdrop-filter:blur(12px); border:1px solid var(--glass-border); border-radius:14px; padding:16px 20px; font-family:var(--font-mono); font-size:13px; height:280px; overflow-y:auto; display:flex; flex-direction:column; box-shadow:inset 0 2px 20px rgba(0,0,0,0.4); scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.15) transparent;"></div>
        </div>

        <div id="doneState" style="display: none; animation: fadeInUp 0.6s ease; margin-top: 32px; padding-top: 32px; border-top: 1px solid var(--glass-border);">
          <div style="text-align:center;margin-bottom:32px;">
            <h2 id="doneTitle" style="font-family: var(--font); font-size: 48px; font-weight: 800; color: transparent; background: linear-gradient(135deg, #10b981, #00d4ff); -webkit-background-clip: text; background-clip: text; margin-bottom: 8px; letter-spacing: -1px;">Pipeline completed successfully.</h2>
            <h2 id="doneTitle" style="font-family: var(--font-display, 'Syne', sans-serif); font-size: 48px; font-weight: 500; color: transparent; background: linear-gradient(135deg, #10b981, #00d4ff); -webkit-background-clip: text; background-clip: text; margin-bottom: 8px; letter-spacing: -1px;">Pipeline Completed!</h2>
            <p id="doneSub" style="color:var(--text-2);font-size:15px;">Results</p>
          </div>
          <div style="display: flex; justify-content: center; gap: 16px; margin-bottom: 32px;">
            <button class="btn btn-primary btn-lg" onclick="downloadFullReport()" style="box-shadow: 0 4px 20px rgba(0,212,255,0.25);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Excel
            </button>
            <button class="btn btn-secondary btn-lg" onclick="window.location.href='dashboard.html'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              Home
            </button>
            <button class="btn btn-outline btn-lg" onclick="resetAll()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              New Campaign
            </button>
          </div>
          <div id="resultTableWrap"></div>
        </div>
      </div>
    `;
  }

  let certsDone = 0, mailsDone = 0, failed = 0;
  CP.results = [];

  function setRunPct(pct, statusStr) {
    const pEl = document.getElementById('runPct'); if (pEl) pEl.textContent = pct + '%';
    const sEl = document.getElementById('runStatus'); if (sEl && statusStr) sEl.textContent = statusStr;
    const bEl = document.getElementById('runBar'); if (bEl) bEl.style.width = pct + '%';
  }
  function upCounts(c, m) {
    const cd = document.getElementById('runCertsDone'); if (cd) cd.textContent = c;
    const md = document.getElementById('runMailsDone'); if (md) md.textContent = m;
  }

  setRunPct(1, 'Connecting to Google Server...');
  llLog('info', `Launching: ${campName} — ${total} participants`);
  await new Promise(r => setTimeout(r, 800));

  setRunPct(2, 'Initializing workspace...');
  llLog('info', `Preparing data streams...`);
  await new Promise(r => setTimeout(r, 600));

  const payload = {
    campaignName: campName,
    eventName: CP.eventName || '',
    template: {
      width: ED.w,
      height: ED.h,
      backgroundBase64: ED.bgBase64 || null,
      bgColor: ED.bgColor,
      fields: ED.fields.map(f => ({ ...f })),
      fontUrls: getUsedFontUrls()
    },
    participants: CP.rows,
    nameCol: mappings.name,
    emailCol: mappings.email,
    sheetId: writeBack ? CP.sheetId : null,
    writeBack: writeBack,
    fieldMappings: Object.keys(mappings).map(k => ({ ph: k, col: mappings[k] }))
  };

  try {
    const token = localStorage.getItem('GalSol_token');
    const response = await fetch('https://certiflow-backend-73xk.onrender.com/api/certificates/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP Error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let processed = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the last partial line in the buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          if (event.type === 'info') {
            llLog('info', event.message);
            const sEl = document.getElementById('runStatus');
            if (sEl) sEl.textContent = event.message;
          }
          else if (event.type === 'success' || event.type === 'error') {
            processed++;
            const r = event.result; // { name, email, link, status, error }
            const row = CP.rows[processed - 1]; // Sequential alignment
            const name = r.name || `Person ${processed}`;
            const email = r.email || row[mappings.email] || '';

            if (event.type === 'success') {
              certsDone++;
              llLog('cert', `Certificate generated: ${name}`);
              const certLink = r.link || '';

              try {
                const personHtml = personalise(htmlTmpl, row, mappings).replace(/\{\{Certificate Link\}\}/gi, certLink).replace(/\{\{cert_link\}\}/gi, certLink);
                const personSubj = personalise(subject, row, mappings).replace(/\{\{Certificate Link\}\}/gi, certLink).replace(/\{\{cert_link\}\}/gi, certLink);
                await apiFetch('/api/mail/send-one', { method: 'POST', body: JSON.stringify({ to: email, subject: personSubj, html: personHtml }) });
                mailsDone++;
                llLog('mail', `Email sent → ${email}`);
                CP.results.push({ name, email, certLink, certStatus: 'success', mailStatus: 'sent' });
              } catch (e) {
                failed++;
                llLog('err', `✗ Email failed for ${name}: ${e.message}`);
                CP.results.push({ name, email, certLink, certStatus: 'success', mailStatus: 'failed', error: e.message });
              }
            } else {
              failed++;
              llLog('err', `✗ Cert failed for ${name} — ${r.error}`);
              CP.results.push({ name, email, certLink: '', certStatus: 'failed', mailStatus: 'skipped', error: r.error });
            }

            const realPct = 2 + Math.round((processed / total) * 98);
            setRunPct(realPct, `Processing: ${name} (${processed}/${total})`);
            upCounts(certsDone, mailsDone);
          }
          else if (event.type === 'done') {
            llLog('ok', event.message);
          }
        } catch (e) {
          console.warn("Error parsing stream chunk:", e, line);
        }
      }
    }
  } catch (err) {
    llLog('err', 'Pipeline execution stopped: ' + err.message);
    toast('Failed: ' + err.message, 'error');
  }

  saveCampaignHistory({ name: campName, type: 'combined', date: new Date().toISOString(), total, success: certsDone, failed });
  setTimeout(() => showDone(certsDone, mailsDone, failed, total), 800);
}

function setRunProgress(done, total, status) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const pctEl = document.getElementById('runPct');
  if (pctEl) { pctEl.textContent = pct + '%'; }
  const fracEl = document.getElementById('runFraction');
  if (fracEl) { fracEl.textContent = `${done} / ${total}`; }
  if (status) { const statEl = document.getElementById('runStatus'); if (statEl) { statEl.textContent = status; } }
  const bar = document.getElementById('runBar');
  if (bar) { bar.style.width = pct + '%'; }
  const rc = document.getElementById('ringCircle');
  if (rc) { rc.style.strokeDasharray = '345'; rc.style.strokeDashoffset = 345 - (345 * pct / 100); }
}
function updateRunCounts(c, m, f) {
  const cd = document.getElementById('runCertsDone');
  const md = document.getElementById('runMailsDone');
  const fd = document.getElementById('runFailed');
  const sharedStyle = 'font-size: 28px; font-weight: 700; line-height: 1.1; font-family: var(--font);';
  if (cd) { cd.textContent = c; cd.style.cssText = sharedStyle + ' color: var(--cyan);'; }
  if (md) { md.textContent = m; md.style.cssText = sharedStyle + ' color: #a78bfa;'; }
  if (fd) { fd.textContent = f; fd.style.cssText = sharedStyle + ` color: ${f > 0 ? 'var(--red)' : 'var(--text-3)'};`; }
}
function llLog(type, msg) {
  const win = document.getElementById('liveLog');
  if (!win) return;
  const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el = document.createElement('div');
  let color = '#7a90b0';
  let icon = '·';
  if (type === 'cert' || type === 'ok') { color = '#10b981'; icon = '✓'; }
  else if (type === 'mail' || type === 'info') { color = '#00d4ff'; icon = '✉'; }
  else if (type === 'err') { color = '#f43f5e'; icon = '✗'; }
  else if (type === 'warn') { color = '#f59e0b'; icon = '⚠'; }
  el.style.cssText = `color:${color}; display:flex; align-items:flex-start; gap:8px; line-height:1.5; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.03);`;
  el.innerHTML = `<span style="color:#8aa0c0;flex-shrink:0;font-size:11.5px;margin-top:2px;">[${ts}]</span><span style="flex-shrink:0;font-weight:700;color:${color}">${icon}</span><span style="flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; animation:typingLine 0.4s cubic-bezier(0.2,1,0.3,1) forwards;">${msg}</span>`;
  win.appendChild(el);
  win.scrollTop = win.scrollHeight;
}

function showDone(certs, mails, failed, total) {
  const doneState = document.getElementById('doneState');
  if (doneState) {
    doneState.style.display = 'block';
    setTimeout(() => {
      doneState.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  const dt = document.getElementById('doneTitle');
  const ds = document.getElementById('doneSub');
  if (dt) {
    dt.textContent = 'Results';
    dt.textContent = 'Pipeline Completed!';
    if (failed === 0) {
      dt.style.background = 'linear-gradient(135deg, #10b981, #00d4ff)';
    } else {
      dt.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)';
    }
    dt.style.webkitBackgroundClip = 'text';
    dt.style.backgroundClip = 'text';
  }
  if (ds) {
    if (failed === 0) {
      ds.textContent = `Pipeline completed! ${certs} certificates generated, ${mails} emails sent.`;
    } else {
      ds.textContent = `Completed with ${failed} failure(s). ${certs} certificates generated, ${mails} emails sent.`;
    }
  }

  renderResultTable(CP.results);
  toast(`Done — ${certs} certs, ${mails} emails`, 'success', 6000);
}

function renderResultTable(results) {
  const wrap = document.getElementById('resultTableWrap');
  if (!wrap) return;

  const headers = CP.headers || [];
  const displayCols = headers.length > 0 ? headers : (CP.manualColumns || []);

  wrap.innerHTML = `
    <div style="display:grid; grid-template-columns:minmax(0, 1fr); width:100%;">
      <div style="width:100%; box-sizing:border-box; overflow-x:auto; max-height:500px; border:1px solid var(--glass-border); border-radius:12px; scrollbar-width:thin; scrollbar-color:var(--glass-border-2) transparent; background:var(--surface);">
        <table style="width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; font-size:13.5px; text-align:left;">
          <thead>
            <tr style="position:sticky;top:0;z-index:20;background:var(--surface);box-shadow:0 1px 0 var(--glass-border);">
              <th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--glass-border);">#</th>
              ${displayCols.map(h => `<th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--glass-border);">${h}</th>`).join('')}
              <th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--glass-border);border-left:1px solid var(--glass-border);position:sticky;right:160px;z-index:21;background:var(--surface);width:140px;min-width:140px;">Mail Status</th>
              <th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--glass-border);position:sticky;right:0;z-index:21;background:var(--surface);width:160px;min-width:160px;">Certificate Link</th>
            </tr>
          </thead>
          <tbody>
            ${results.map((r, i) => {
    const rowData = CP.rows[i] || {};

    const mailBadge = r.mailStatus === 'sent'
      ? `<span style="background:rgba(124,58,237,0.1);color:#a78bfa;border:1px solid rgba(124,58,237,0.2);padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Sent</span>`
      : r.mailStatus === 'skipped'
        ? `<span style="background:rgba(255,255,255,0.05);color:var(--text-3);border:1px solid var(--glass-border);padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Skipped</span>`
        : `<span style="background:rgba(244,63,94,0.1);color:var(--red);border:1px solid rgba(244,63,94,0.2);padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;" title="${(r.error || '').replace(/"/g, '&quot;')}">Failed</span>`;

    const certLink = r.certLink
      ? `<a href="${r.certLink}" target="_blank" style="color:var(--cyan);text-decoration:none;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:6px 12px;background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.2);border-radius:8px;transition:all 0.2s;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Open PDF</a>`
      : `<span style="color:var(--red);font-size:13px;font-weight:500;" title="${(r.error || '').replace(/"/g, '&quot;')}">Failed</span>`;

    return `
              <tr style="transition:background 0.15s" onmouseenter="this.style.background='rgba(255,255,255,0.02)'" onmouseleave="this.style.background=''">
                <td style="padding:14px 16px;color:var(--text-3);font-size:12px;font-weight:600;border-top:1px solid rgba(255,255,255,0.04);">${i + 1}</td>
                ${displayCols.map(h => `<td style="padding:14px 16px;color:var(--text-2);white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;border-top:1px solid rgba(255,255,255,0.04);" title="${(rowData[h] || '').toString().replace(/"/g, '&quot;')}">${(rowData[h] || '—')}</td>`).join('')}
                
                <td style="padding:14px 16px;border-left:1px solid var(--glass-border);border-top:1px solid rgba(255,255,255,0.04);position:sticky;right:160px;z-index:2;background:var(--surface);">${mailBadge}</td>
                <td style="padding:14px 16px;border-top:1px solid rgba(255,255,255,0.04);position:sticky;right:0;z-index:2;background:var(--surface);">${certLink}</td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}


function filterResultTable() { const q = document.getElementById('resultSearch').value.toLowerCase(); document.querySelectorAll('#resultTbody tr').forEach(tr => { tr.style.display = (!q || tr.dataset.name.toLowerCase().includes(q) || (tr.dataset.email || '').toLowerCase().includes(q)) ? '' : 'none'; }); }
function downloadFullReport() { downloadCSV(CP.results.map(r => ({ Name: r.name, Email: r.email || '', 'Cert Status': r.certStatus, 'Email Status': r.mailStatus, 'Certificate Link': r.certLink || '', Error: r.error || '' })), `GalSol-pipeline-${Date.now()}.csv`); }

async function saveCampaignHistory(rec) {
  const mappings = getAllMappings();
  const backupData = CP.results.map((r, i) => {
    const original = CP.rows[i] || {};
    const rowData = { 'S.No': i + 1 };

    ED.fields.forEach(f => {
      if (f.column) rowData[f.column] = original[f.column] || '';
    });

    if (mappings.email && !rowData[mappings.email]) {
      rowData[mappings.email] = r.email || original[mappings.email] || '';
    }

    rowData['Certificate Link'] = r.certLink || '';
    rowData['Email Status'] = r.mailStatus || '';
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
        backup_data: backupData,
      }),
    });
  } catch (e) {
    console.error('Pipeline database save failed', e);
  }
}

function resetAll() {
  if (!confirm('Start a new campaign? Current results will be cleared.')) return;
  CP.rows = []; CP.results = []; CP.headers = []; CP.customMappings = []; CP.sheetId = null;
  ED.fields = []; ED.bgImg = null; ED.bgBase64 = null; ED.selId = null; ED.ready = false;
  ME.blocks = []; ME.selectedId = null; ME.initialized = false;
  ['cpName', 'sheetId', 'emailSubject', 'emailTemplate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['sheetLoadedMsg', 'fileLoadedMsg', 'manualLoadedMsg', 'gsFormLoadedMsg'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('customMappings').innerHTML = '';
  if (ME.cm) ME.cm.setValue('');
  goStep(1, true);
}