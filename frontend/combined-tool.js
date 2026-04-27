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
    // (We will build the Step 4 init next!)
    if (typeof initStep4 === 'function') initStep4(); 
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
    if (!document.getElementById('mapName').value)  { toast('Select the Name column', 'error'); return false; }
    if (!document.getElementById('mapEmail').value) { toast('Select the Email column', 'error'); return false; }
  }
  if (n === 4) {
    if (!document.getElementById('emailSubject').value.trim()) { toast('Enter an email subject', 'error'); return false; }
    
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
  document.getElementById('panelSheets').style.display  = type === 'sheets' ? 'block' : 'none';
  document.getElementById('panelFile').style.display    = type === 'file'   ? 'block' : 'none';
  document.getElementById('panelManual').style.display  = type === 'manual' ? 'block' : 'none';
  document.getElementById('panelHxForm').style.display  = type === 'hxform' ? 'block' : 'none';
  document.getElementById('srcSheetsBtn').className     = 'src-opt' + (type === 'sheets' ? ' active' : '');
  document.getElementById('srcFileBtn').className       = 'src-opt' + (type === 'file'   ? ' active' : '');
  document.getElementById('srcManualBtn').className     = 'src-opt' + (type === 'manual' ? ' active' : '');
  document.getElementById('srcHxFormBtn').className     = 'src-opt' + (type === 'hxform' ? ' active' : '');
  if (type === 'hxform') cpLoadHxFormList();
}
async function cpLoadHxFormList() {
  const sel = document.getElementById('cpHxFormSelect');
  if (!sel || sel.dataset.loaded) return;
  try {
    const token = localStorage.getItem('Honourix_token');
    const res = await fetch('https://certiflow-backend-73xk.onrender.com/api/hxdb/summary', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const { forms } = await res.json();
    const eligible = (forms || []).filter(f => f.submissionCount > 0);
    sel.innerHTML = '<option value="">Select a form…</option>' +
      eligible.map(f => `<option value="${f.id}">${f.name} (${f.submissionCount} responses)</option>`).join('');
    if (!eligible.length) sel.innerHTML = '<option value="">No forms with submissions found</option>';
    sel.dataset.loaded = '1';
  } catch { sel.innerHTML = '<option value="">Could not load forms</option>'; }
}

async function cpLoadHxFormData(formId) {
  if (!formId) return;
  const sel = document.getElementById('cpHxFormSelect');
  const el  = document.getElementById('hxFormLoadedMsg');
  sel.disabled = true;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border:1px solid var(--glass-border);border-radius:10px;background:var(--glass);font-size:14px;color:var(--text-2)">
    <svg style="flex-shrink:0;animation:spin 0.9s linear infinite" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
    Loading form data…
  </div>`;
  el.style.display = 'block';

  try {
    const token = localStorage.getItem('Honourix_token');
    const res = await fetch(`https://certiflow-backend-73xk.onrender.com/api/hxdb/data/${formId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    if (!data.rows?.length) { toast('No submissions in this form yet', 'warning'); el.style.display = 'none'; return; }

    CP.headers = data.headers;
    CP.rows    = data.rows.map(r => Object.fromEntries(data.headers.map((h, i) => [h, r[i] || ''])));
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
              ${data.headers.map(h => `<td style="padding:10px 16px;font-size:13.5px;color:var(--text);white-space:nowrap">${(r[h] || '').toString().replace(/</g,'&lt;')}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    el.style.display = 'block';
    toast(`${CP.rows.length} participants imported`, 'success');
  } catch(e) { toast('Could not load form: ' + e.message, 'error'); el.style.display = 'none'; }
  finally { sel.disabled = false; }
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
  // Build preview table from current CP data
  const headers = CP.headers || [];
  const rows    = CP.rows    || [];
  const theadHtml = headers.map(h =>
    `<th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap">${h}</th>`
  ).join('');
  const tbodyHtml = rows.map(r =>
    `<tr style="border-top:1px solid rgba(255,255,255,0.03);transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
      ${headers.map(h => `<td style="padding:10px 16px;font-size:13.5px;color:var(--text);white-space:nowrap">${(r[h] || '').toString().replace(/</g,'&lt;')}</td>`).join('')}
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
    const fs   = Math.max(4, f.fontSize * ED.scale);
    const ls   = (f.letterSpacing || 0) * ED.scale;
    const fw   = f.bold ? 700 : getFontWeight(f.fontFamily || 'Helvetica');
    const fi   = f.italic ? 'italic' : 'normal';
    const ff   = getFontCSS(f.fontFamily || 'Helvetica');

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
  const startX  = e.clientX;
  const startW  = field.width, startSize = field.fontSize;
  const dispW   = Math.round(ED.w * ED.scale);
  const mm = ev => {
    let dx = ev.clientX - startX;
    if (corner.includes('l')) dx = -dx;
    const deltaPct   = dx / dispW * 100;
    const scaleRatio = Math.max(0.1, (startW + deltaPct) / startW);
    field.width    = startW    * scaleRatio;
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
  const dispW  = Math.round(ED.w * ED.scale);
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
    tooltip.style.left  = ev.clientX + 15 + 'px';
    tooltip.style.top   = ev.clientY - 35 + 'px';
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
function openAddFieldModal()  { openAFModal(); }
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
  const colSel  = document.getElementById('afColSelect');
  const phInner = document.getElementById('afPhInner').value.trim().replace(/[{}]/g, '');
  const col     = colSel ? colSel.value : '';
  const size    = parseInt(document.getElementById('newFieldSize')?.value || '36', 10);
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
  document.getElementById('propsForm').style.display  = 'flex';
  
  document.getElementById('pPh').value = f.placeholder;
  
  // Connect live preview to CP.rows (Combined Pipeline State)
  const livePreview = (f.column && CP.rows && CP.rows[0]) ? (CP.rows[0][f.column] || f.previewText || '') : (f.previewText || '');
  document.getElementById('pPrev').value = livePreview;
  document.getElementById('pPrev').style.color = (f.column && CP.rows && CP.rows[0]) ? 'var(--cyan)' : 'var(--text)';
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
  
  if (typeof loadFontIfNeeded === 'function') loadFontIfNeeded(f.fontFamily || 'Helvetica');
  updateFontPreview(f.fontFamily || 'Helvetica', f.bold, f.italic);
  
  renderHandles();
}

function updateFontPreview(name, bold, italic) {
  const el = document.getElementById('fontPreviewSample'); if (!el) return;
  el.style.fontFamily = getFontCSS(name);
  el.style.fontWeight = bold ? 700 : (typeof getFontWeight === 'function' ? getFontWeight(name) : 400);
  el.style.fontStyle  = italic ? 'italic' : 'normal';
  el.textContent      = name + ' — Aa 123';
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
function deleteSelField()      { if (ED.selId) deleteField(ED.selId); }

/* ── Properties Panel Updates ── */
function setFP(key, val) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f[key] = val; if (key === 'color') document.getElementById('pColorHex').textContent = val; redraw(); }
function setFPFont(name) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.fontFamily = name; if (typeof loadFontIfNeeded === 'function') loadFontIfNeeded(name); updateFontPreview(name, f.bold, f.italic); redraw(); }
function setFPXY() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.x = parseFloat(document.getElementById('pX').value)||f.x; f.y = parseFloat(document.getElementById('pY').value)||f.y; redraw(); }
function setAlign(a) { setFP('align', a); ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('on')); document.getElementById(a==='center'?'alC':a==='right'?'alR':'alL').classList.add('on'); }
function toggleBold()   { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.bold   = !f.bold;   document.getElementById('boldBtn').classList.toggle('on', f.bold);   redraw(); }
function toggleItalic() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.italic = !f.italic; document.getElementById('italicBtn').classList.toggle('on', f.italic); redraw(); }

/* ── UI Helpers ── */
function switchEPTab(tab) { 
  ['fields','props'].forEach(t => { 
    const elT = document.getElementById(`epTab_${t}`); 
    const elP = document.getElementById(`epPanel_${t}`); 
    if(elT) elT.className = 'ep-tab'+(t===tab?' active':''); 
    if(elP) elP.className = 'ep-panel'+(t===tab?' active':''); 
  }); 
}

function renderChipList() {
  const el = document.getElementById('fieldChipList'); if (!el) return;
  if (!ED.fields.length) { 
    el.innerHTML = `<div style="text-align:center;padding:28px 8px;color:var(--text-3);font-size:13px">No fields yet.<br/><span style="color:var(--cyan)">Click "+ Add Field"</span></div>`; 
    return; 
  }
  el.innerHTML = ED.fields.map(f => `
    <div class="fc-chip ${f.id===ED.selId?'sel':''}" onclick="selectField('${f.id}')">
      <div class="fc-dot" style="background:${f.color}"></div>
      <div style="flex:1;min-width:0">
        <span class="fc-name">${f.previewText||f.placeholder}</span>
        <span class="fc-ph">${f.placeholder}${f.column?' → '+f.column:''}</span>
      </div>
      ${f.isPrimary?'<span style="font-size:10px;font-weight:700;color:var(--cyan);background:var(--cyan-dim);border:1px solid rgba(0,212,255,0.25);border-radius:4px;padding:1px 5px;flex-shrink:0">PRIMARY</span>':''}
    </div>`).join('');
}

/* ── Custom Spinner Nudge Logic ── */
function nudgeInput(id, step, up) {
  const el = document.getElementById(id);
  if(!el) return;
  const val = parseFloat(el.value) || 0;
  el.value = parseFloat((val + (up ? step : -step)).toFixed(2));
  el.dispatchEvent(new Event('change')); // Triggers setFPXY or setFP naturally
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
const uploadBG          = uploadBackground;
const changeBGColor     = changeBgColor;
const clearBG           = clearBackground;
const changeSize        = changeCanvasSize;
const clearCanvas       = clearAll;

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
  const emailSel = document.getElementById('s3EmailCol');

  // Populate Email Column Dropdown (Crucial for Combined Pipeline)
  if (emailSel && CP.headers) {
    const currentEmail = emailSel.value;
    emailSel.innerHTML = '<option value="">— Select Email Column —</option>' + 
      CP.headers.map(h => `<option value="${h}" ${currentEmail === h ? 'selected' : ''}>${h}</option>`).join('');
      
    if (!currentEmail) {
        const likelyEmail = CP.headers.find(h => h.toLowerCase().includes('email'));
        if (likelyEmail) emailSel.value = likelyEmail;
    }
  }

  // Rebuild the column hint list on the right panel
  const hints = (CP.headers || []).map(h => `
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

  rows.innerHTML = ED.fields.map((f, i) => {
    const isLast = i === ED.fields.length - 1;
    
    // FIX: Strict whitespace trimming to guarantee the dropdown auto-populates!
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
  if (f) { f.column = colValue; if (typeof redraw === 'function') redraw(); }
}

function s3SetPrimary(fieldId) {
  ED.fields.forEach(f => f.isPrimary = (f.id === fieldId));
  buildStep3();
  fnRefreshNamePill();
}

function buildStep3Writeback() {
  const badge   = document.getElementById('s3WritebackBadge');
  const desc    = document.getElementById('s3WritebackDesc');
  const options = document.getElementById('s3WritebackOptions');
  const isGS    = CP.srcType === 'sheets';

  if (!badge || !desc) return;

  if (isGS) {
    badge.textContent = 'Active';
    badge.style.cssText = 'font-size:11px;padding:3px 9px;border-radius:20px;font-weight:600;background:rgba(0,212,255,0.1);color:var(--cyan);border:1px solid rgba(0,212,255,0.25)';
    desc.textContent = 'After generation, certificate links will be written back to your Google Sheet as a new column at the end of your data.';
    if (options) options.style.display = 'block';
  } else {
    const srcLabel = CP.srcType === 'file' ? 'CSV/Excel upload' : CP.srcType === 'manual' ? 'manual entry' : CP.srcType === 'hxform' ? 'HX Form' : 'this source';
    badge.textContent = 'N/A for this source';
    badge.style.cssText = 'font-size:11px;padding:3px 9px;border-radius:20px;font-weight:600;background:rgba(255,255,255,0.04);color:var(--text-3);border:1px solid var(--glass-border)';
    desc.textContent = `Write-back is only available when data is imported via Google Sheets ID. You imported data via ${srcLabel}, so this option is not applicable.`;
    if (options) options.style.display = 'none';
  }
}

function validateStep3() {
  const emailCol = document.getElementById('s3EmailCol')?.value;
  if (!emailCol) {
    toast('Please select the Email Delivery column.', 'error');
    return;
  }
  CP.emailCol = emailCol;

  const unmapped = ED.fields.filter(f => !f.column);
  if (unmapped.length) {
    toast(`Please map a column for: ${unmapped.map(f => f.placeholder).join(', ')}`, 'error');
    return;
  }
  const hasPrimary = ED.fields.some(f => f.isPrimary);
  if (ED.fields.length > 0 && !hasPrimary) {
    toast('Please star (★) one field as Primary — it will be used for the PDF filename.', 'error');
    return;
  }
  
  // ... inside validateStep3() ...
    CP.eventName = (document.getElementById('fnEventInput')?.value || '').trim();
    
    // THE FIX: Add 'true' to force the pipeline forward into Step 4
    goStep(4, true); 
}
/* ── File Naming Logic ─────────────────────────────── */
function fnRefreshNamePill() {
  const primary = ED.fields.find(f => f.isPrimary);
  const sampleName = primary && CP.rows && CP.rows[0]
    ? (CP.rows[0][primary.column] || primary.placeholder.replace(/[{}]/g,''))
    : 'participant_name';
  const pill = document.getElementById('fnNamePill');
  if (pill) pill.textContent = sampleName;
  fnUpdatePreview();
}

function fnUpdatePreview() {
  const primary = ED.fields.find(f => f.isPrimary);
  const sampleName = primary && CP.rows && CP.rows[0]
    ? sanitizeFilename(CP.rows[0][primary.column] || 'Name')
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
  const event = CP.eventName ? '_' + sanitizeFilename(CP.eventName) : '';
  const num = String(index + 1).padStart(2, '0');
  return `${name}${event}_${num}.pdf`;
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
/* ── Pipeline Helpers ── */
function getAllMappings() {
  const m = { email: CP.emailCol || '', name: '' };
  const primary = ED.fields.find(f => f.isPrimary);
  if (primary && primary.column) m.name = primary.column;
  ED.fields.forEach(f => { if (f.column) m[f.placeholder.replace(/[{}]/g, '')] = f.column; });
  return m;
}
async function launchPipeline() {
  const btn = document.getElementById('launchBtn');
  btn.disabled = true; btn.style.opacity = '0.6';
  goStep(6, true);
  const mappings = getAllMappings(), subject = document.getElementById('emailSubject').value;
  // NEW: Grab HTML directly from CodeMirror or the Block generator!
  const htmlTmpl = (ME.cm && document.getElementById('mCodeWrapS3').style.display === 'block') ? ME.cm.getValue() : meGetHtml();
  
  const campName = document.getElementById('cpName').value;
  const writeBack = document.getElementById('writeBackToggle').classList.contains('on');
  const total = CP.rows.length;
  meSyncTextarea();
  
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
  
  // Build Backup Sheet Payload: S.No | Email | mapped cert fields | Certificate Link
  const backupData = CP.results.map((r, i) => {
    const original = CP.rows[i] || {};
    const rowData  = { 'S.No': i + 1, 'Email': r.email || '' };

    // Add any extra mapped columns (name + custom mappings, excluding email)
    if (mappings.name && mappings.name !== mappings.email) {
      rowData[mappings.name] = r.name || original[mappings.name] || '';
    }
    CP.customMappings.forEach(m => {
      if (m.col && m.col !== mappings.email) rowData[m.col] = original[m.col] || '';
    });

    rowData['Certificate Link'] = r.certLink || '';
    return rowData;
  });

  try {
    await apiFetch('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name:        rec.name || 'Combined Campaign',
        type:        'combined',
        total_count: rec.total,
        sent_count:  rec.success,
        status:      rec.failed === 0 ? 'completed' : (rec.success > 0 ? 'partial' : 'failed'),
        backup_data: backupData,
      }),
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
  ['sheetLoadedMsg','fileLoadedMsg','manualLoadedMsg','hxFormLoadedMsg'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('customMappings').innerHTML = '';
  if (ME.cm) ME.cm.setValue('');
  goStep(1, true);
}



/* ════════════════════════════════════════════════════════════════
   STEP 4 — EMAIL TEMPLATE (AI ENGINE)
════════════════════════════════════════════════════════════════ */

const ME = {
  blocks: [],
  selectedId: null,
  nextId: 1,
  cm: null,
  cmDebounce: null,
  initialized: false,
};

function initStep4() {
  if (ME.initialized) return;
  
  // 1. SortableJS for Visual Canvas
  const el = document.getElementById('mVisualListS3');
  if (el && typeof Sortable !== 'undefined') {
    Sortable.create(el, {
      animation: 150, handle: '.m-drag-handle', ghostClass: 'm-ghost',
      onEnd: e => {
        const item = ME.blocks.splice(e.oldIndex, 1)[0];
        ME.blocks.splice(e.newIndex, 0, item);
        mSyncToCode();
      }
    });
  }

  // 2. CodeMirror for Raw HTML Editor
  const cmEl = document.getElementById('mCodeEditorS3');
  if (cmEl && typeof CodeMirror !== 'undefined') {
    ME.cm = CodeMirror.fromTextArea(cmEl, { mode: 'xml', theme: 'dracula', lineNumbers: true, lineWrapping: true });
    ME.cm.on('change', () => {
      clearTimeout(ME.cmDebounce);
      ME.cmDebounce = setTimeout(() => {
        mUpdatePreview();
      }, 500);
    });
  }

  // Default Template Load
  if (ME.blocks.length === 0) { 
      mAddBlock('logo'); 
      mAddBlock('header'); 
      mAddBlock('text'); 
      mAddBlock('button'); 
  }
  mPopulateTags();
  mSwitchView('visual');
  ME.initialized = true;
}

// Automatically loads tags based on Step 1 / Step 3 data
function mPopulateTags() {
  const list = document.getElementById('mTagsList');
  if (!list) return;
  if (!CP.headers || CP.headers.length === 0) {
    list.innerHTML = '<div style="font-style:italic; color:var(--text-3); font-size:12px;">No data loaded. Go back to Step 1.</div>';
    return;
  }
  let html = CP.headers.map(h => 
    `<div onclick="mInsertTag('{{${h}}}')" style="padding:8px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--glass-border); border-radius:6px; cursor:pointer; font-family:var(--font-mono); font-size:12px; color:var(--cyan); transition:0.2s;" onmouseover="this.style.background='rgba(0,212,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">{{${h}}}</div>`
  ).join('');
  html += `<div onclick="mInsertTag('{{Certificate Link}}')" style="padding:8px 12px; margin-top:8px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); border-radius:6px; cursor:pointer; font-family:var(--font-mono); font-size:12px; color:var(--green); transition:0.2s;" onmouseover="this.style.background='rgba(16,185,129,0.15)'" onmouseout="this.style.background='rgba(16,185,129,0.08)'">★ {{Certificate Link}}</div>`;
  list.innerHTML = html;
}

function mInsertTag(tag) {
  if (document.getElementById('mCodeWrapS3').style.display === 'block' && ME.cm) {
    ME.cm.replaceSelection(tag); ME.cm.focus();
  } else {
    const block = ME.blocks.find(b => b.id === ME.selectedId);
    if (block && block.props.text !== undefined) {
      block.props.text += tag;
      mRenderVisual(); mRenderProps(block); mSyncToCode();
    } else {
      toast('Select a text block to insert tag, or use Code View', 'info');
    }
  }
}

// Side Panel Tabs
function switchLeftTab(tab) {
  document.getElementById('mTab_ai').className = 'ep-tab ' + (tab === 'ai' ? 'active' : '');
  document.getElementById('mTab_props').className = 'ep-tab ' + (tab === 'props' ? 'active' : '');
  document.getElementById('mPanel_ai').style.display = tab === 'ai' ? 'flex' : 'none';
  document.getElementById('mPanel_props').style.display = tab === 'props' ? 'flex' : 'none';
  if (tab === 'ai') {
    document.getElementById('mTab_ai').style.color = 'var(--cyan)';
    document.getElementById('mTab_ai').style.borderBottomColor = 'var(--cyan)';
    document.getElementById('mTab_props').style.color = 'var(--text-3)';
    document.getElementById('mTab_props').style.borderBottomColor = 'transparent';
  } else {
    document.getElementById('mTab_props').style.color = 'var(--cyan)';
    document.getElementById('mTab_props').style.borderBottomColor = 'var(--cyan)';
    document.getElementById('mTab_ai').style.color = 'var(--text-3)';
    document.getElementById('mTab_ai').style.borderBottomColor = 'transparent';
  }
}

function mSwitchView(view) {
  document.getElementById('mBtnVisual').className = 'btn btn-ghost btn-sm ' + (view === 'visual' ? 'active' : '');
  document.getElementById('mBtnCode').className = 'btn btn-ghost btn-sm ' + (view === 'code' ? 'active' : '');
  document.getElementById('mVisualCol').style.display = view === 'visual' ? 'flex' : 'none';
  document.getElementById('mCodeWrapS3').style.display = view === 'code' ? 'block' : 'none';
  if (view === 'code' && ME.cm) {
    mSyncToCode();
    setTimeout(() => ME.cm.refresh(), 50);
  }
}

function mSetDeviceS3(dev) {
  document.getElementById('mBtnDesktopS3').className = 'btn btn-ghost btn-sm ' + (dev === 'desktop' ? 'active' : '');
  document.getElementById('mBtnMobileS3').className = 'btn btn-ghost btn-sm ' + (dev === 'mobile' ? 'active' : '');
  document.getElementById('mPrvBoxS3').style.width = dev === 'mobile' ? '375px' : '600px';
}

function mClearAll() {
  ME.blocks = []; ME.selectedId = null;
  mRenderVisual(); mRenderProps(null); mSyncToCode();
}

function mAddBlock(type) {
  const def = ME_DEFS[type]; if (!def) return;
  const block = { id: 'b' + (ME.nextId++), type, props: def.defaults() };
  ME.blocks.push(block);
  mRenderVisual(); mSelectBlock(block.id); mSyncToCode();
  const list = document.getElementById('mVisualListS3');
  if (list) list.scrollTop = list.scrollHeight;
}

function mDeleteBlock(id) {
  ME.blocks = ME.blocks.filter(b => b.id !== id);
  if (ME.selectedId === id) { ME.selectedId = null; mRenderProps(null); }
  mRenderVisual(); mSyncToCode();
}

function mDuplicateBlock(id) {
  const idx = ME.blocks.findIndex(b => b.id === id); if (idx < 0) return;
  const copy = { id: 'b' + (ME.nextId++), type: ME.blocks[idx].type, props: JSON.parse(JSON.stringify(ME.blocks[idx].props)) };
  ME.blocks.splice(idx + 1, 0, copy);
  mRenderVisual(); mSelectBlock(copy.id); mSyncToCode();
}

function mSelectBlock(id) {
  ME.selectedId = id;
  document.querySelectorAll('.m-block-wrap').forEach(el => el.style.borderColor = el.dataset.id === id ? 'var(--cyan)' : 'transparent');
  const block = ME.blocks.find(b => b.id === id);
  mRenderProps(block);
  switchLeftTab('props');
}

function mRenderVisual() {
  const list = document.getElementById('mVisualListS3'); if (!list) return;
  list.innerHTML = ME.blocks.map(b => {
    return `<div class="m-block-wrap" data-id="${b.id}" onclick="mSelectBlock('${b.id}')" style="background:rgba(255,255,255,0.03); border:1px solid ${b.id === ME.selectedId ? 'var(--cyan)' : 'transparent'}; border-radius:8px; padding:12px; cursor:pointer; position:relative; margin-bottom:8px;">
      <div class="m-drag-handle" style="position:absolute; top:12px; left:8px; cursor:grab; color:var(--text-3);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div>
      <div style="margin-left:24px; font-size:12px; font-weight:700; color:var(--text-2); text-transform:uppercase;">${(ME_DEFS[b.type]||{}).label||b.type}</div>
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:4px;">
        <button onclick="event.stopPropagation();mDuplicateBlock('${b.id}')" style="background:var(--glass); border:1px solid var(--glass-border); border-radius:4px; color:var(--text-2); cursor:pointer; padding:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        <button onclick="event.stopPropagation();mDeleteBlock('${b.id}')" style="background:var(--glass); border:1px solid var(--glass-border); border-radius:4px; color:#f43f5e; cursor:pointer; padding:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>
    </div>`;
  }).join('');
}

function mRenderProps(block) {
  const form = document.getElementById('mPropsForm');
  const empty = document.getElementById('mPropsEmpty');
  if (!block) { form.style.display = 'none'; empty.style.display = 'block'; return; }
  form.style.display = 'flex'; empty.style.display = 'none';
  
  const p = block.props, rows = [];
  if (['logo','header','text','footer'].includes(block.type)) rows.push(mPropTextarea('Text Content', block.id, 'text', p.text));
  if (block.type === 'logo') rows.push(mPropText('Tagline', block.id, 'tagline', p.tagline));
  if (block.type === 'button') { rows.push(mPropText('Button Text', block.id, 'text', p.text)); rows.push(mPropText('Link URL', block.id, 'link', p.link)); rows.push(mPropColor('Button BG', block.id, 'btnBg', p.btnBg?.startsWith('linear')?'#00d4ff':p.btnBg)); rows.push(mPropColor('Text Color', block.id, 'btnColor', p.btnColor)); rows.push(mPropRange('Radius', block.id, 'borderRadius', p.borderRadius, 0, 40)); }
  if (block.type === 'image') { rows.push(mPropText('Image URL', block.id, 'src', p.src)); rows.push(mPropRange('Width %', block.id, 'width', p.width, 20, 100)); }
  if (block.type === 'divider') { rows.push(mPropColor('Color', block.id, 'color', p.color)); rows.push(mPropRange('Thickness', block.id, 'thickness', p.thickness, 1, 10)); }
  if (block.type === 'spacer') rows.push(mPropRange('Height', block.id, 'height', p.height, 10, 100));
  
  if (['logo','header','text','button','footer'].includes(block.type)) {
      if(block.type !== 'button') rows.push(mPropColor('Text Color', block.id, 'color', p.color));
      if(block.type !== 'logo') rows.push(mPropRange('Font Size', block.id, 'fontSize', p.fontSize, 10, 40));
  }
  rows.push(mPropColor('Background', block.id, 'bgColor', p.bgColor));
  rows.push(mPropRange('Padding V', block.id, 'paddingV', p.paddingV, 0, 80));
  
  form.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;">${(ME_DEFS[block.type]||{}).label||block.type} Settings</div>${rows.join('')}`;
}

function mPropText(label, id, key, val) { return `<div style="display:flex;flex-direction:column;gap:4px;"><label style="font-size:11.5px;color:var(--text-3);font-weight:600;">${label}</label><input type="text" class="pr-input" value="${(val||'').replace(/"/g,'&quot;')}" oninput="mUpdateProp('${id}','${key}',this.value)"/></div>`; }
function mPropTextarea(label, id, key, val) { return `<div style="display:flex;flex-direction:column;gap:4px;"><label style="font-size:11.5px;color:var(--text-3);font-weight:600;">${label}</label><textarea class="pr-input" style="min-height:80px;resize:vertical;" oninput="mUpdateProp('${id}','${key}',this.value)">${(val||'').replace(/</g,'&lt;')}</textarea></div>`; }
function mPropColor(label, id, key, val) { return `<div style="display:flex;flex-direction:column;gap:4px;"><label style="font-size:11.5px;color:var(--text-3);font-weight:600;">${label}</label><div style="display:flex;gap:8px;"><input type="color" value="${val||'#ffffff'}" style="width:34px;height:34px;padding:2px;background:var(--glass);border:1px solid var(--glass-border);border-radius:6px;cursor:pointer;" oninput="mUpdateProp('${id}','${key}',this.value)"/><input type="text" class="pr-input" value="${val||'#ffffff'}" oninput="mUpdateProp('${id}','${key}',this.value)"/></div></div>`; }
function mPropRange(label, id, key, val, min, max) { return `<div style="display:flex;flex-direction:column;gap:4px;"><div style="display:flex;justify-content:space-between;"><label style="font-size:11.5px;color:var(--text-3);font-weight:600;">${label}</label><span id="mrv_${id}_${key}" style="font-size:11px;color:var(--cyan);font-family:var(--font-mono);">${val}</span></div><input type="range" class="pr-range" min="${min}" max="${max}" value="${val}" oninput="document.getElementById('mrv_${id}_${key}').textContent=this.value;mUpdateProp('${id}','${key}',Number(this.value))"/></div>`; }

function mUpdateProp(id, key, val) {
  const block = ME.blocks.find(b => b.id === id); if (!block) return;
  block.props[key] = val;
  mSyncToCode();
}

function mSyncToCode() {
  const html = meGetHtml();
  if (ME.cm && document.getElementById('mCodeWrapS3').style.display !== 'none') {
      const c = ME.cm.getCursor(); ME.cm.setValue(html); try{ME.cm.setCursor(c);}catch(e){}
  }
  mUpdatePreview(html);
}

function mUpdatePreview(htmlOverride) {
  const frame = document.getElementById('mPrvBoxS3'); if (!frame) return;
  let html = htmlOverride || (ME.cm && document.getElementById('mCodeWrapS3').style.display === 'block' ? ME.cm.getValue() : meGetHtml());
  
  if (CP.rows && CP.rows.length) {
    html = html.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      const col = (CP.headers || []).find(h => h.toLowerCase().replace(/\s+/g, '_') === key);
      return col ? (CP.rows[0][col] || '') : (CP.rows[0][key] || '{{' + key + '}}');
    });
  }
  const noScrollCss = `<style>::-webkit-scrollbar { display: none !important; } html, body { scrollbar-width: none !important; margin: 0; padding: 0; }</style>`;
  html = html.includes('</head>') ? html.replace('</head>', noScrollCss + '</head>') : noScrollCss + html;
  
  frame.srcdoc = html;
}

const ME_DEFS = {
  logo:    { label:'Logo',    defaults:()=>({ text:'HONOURIX', tagline:'', bgColor:'#0d1728', color:'#00d4ff', fontSize:22, fontWeight:800, align:'center', paddingV:28, paddingH:40 }) },
  header:  { label:'Heading', defaults:()=>({ text:'Your Heading', fontSize:28, fontWeight:700, color:'#1e293b', bgColor:'#ffffff', align:'center', paddingV:32, paddingH:40 }) },
  text:    { label:'Text',    defaults:()=>({ text:'Write your message here. Use {{name}} to personalize.', fontSize:16, color:'#475569', bgColor:'#ffffff', align:'left', paddingV:14, paddingH:40, lineHeight:1.75 }) },
  button:  { label:'Button',  defaults:()=>({ text:'Click Here', link:'{{Certificate Link}}', btnBg:'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor:'#ffffff', bgColor:'#ffffff', align:'center', paddingV:24, paddingH:40, borderRadius:10, fontSize:15, fontWeight:700 }) },
  image:   { label:'Image',   defaults:()=>({ src:'', alt:'Image', width:100, bgColor:'#f8fafc', paddingV:20, paddingH:40, borderRadius:8 }) },
  divider: { label:'Divider', defaults:()=>({ color:'#e2e8f0', bgColor:'#ffffff', paddingV:12, thickness:1 }) },
  spacer:  { label:'Spacer',  defaults:()=>({ height:40, bgColor:'#ffffff' }) },
  footer:  { label:'Footer',  defaults:()=>({ text:'Sent via Honourix. Contact the organiser for questions.', bgColor:'#f8fafc', color:'#94a3b8', fontSize:12, align:'center', paddingV:24, paddingH:40 }) },
};

function meBlockToHtml(block) {
  const p = block.props, fs = "'Plus Jakarta Sans',sans-serif";
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
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap" rel="stylesheet"/></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Plus Jakarta Sans',sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:32px 16px"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)"><tr><td>${inner}</td></tr></table></td></tr></table></body></html>`;
}

/* ── AI CHAT ENGINE ── */
let meAiChatHistory = [];
let meAiIsLoading = false;

function meAiAppendBubble(role, content) {
  const chat = document.getElementById('meAiChatBox');
  if (!chat) return null;
  const div = document.createElement('div');
  div.style.display = 'flex'; div.style.gap = '12px';
  if (role === 'ai') {
    div.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:rgba(0,212,255,0.15);display:flex;align-items:center;justify-content:center;color:var(--cyan);flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 7.1"/><path d="M12 12l9.9 4.9"/></svg></div>
    <div style="background:var(--glass); border:1px solid var(--glass-border); padding:12px 14px; border-radius:12px; border-top-left-radius:0; font-size:13.5px; color:var(--text); line-height:1.5;">${content.replace(/\n/g, '<br>')}</div>`;
  } else {
    div.style.justifyContent = 'flex-end';
    div.innerHTML = `<div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); padding:12px 14px; border-radius:12px; border-top-right-radius:0; font-size:13.5px; color:var(--text); line-height:1.5; max-width:85%;">${content}</div>`;
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

async function meAiSend() {
  const input = document.getElementById('meAiInput');
  if (!input || meAiIsLoading) return;
  const msg = input.value.trim(); if (!msg) return;
  input.value = ''; meAiIsLoading = true;
  document.getElementById('meAiSendBtn').style.opacity = '0.5';

  meAiAppendBubble('user', msg);
  const typingEl = meAiAppendBubble('ai', 'Thinking...');
  meAiChatHistory.push({ role: 'user', content: msg });

  try {
    const token = localStorage.getItem('Honourix_token');
    const response = await fetch('https://certiflow-backend-73xk.onrender.com/api/ai/generate-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        userMessage: msg,
        mode: document.getElementById('mCodeWrapS3').style.display === 'block' ? 'code' : 'visual',
        htmlModeText: ME.cm ? ME.cm.getValue() : '',
        currentBlocks: ME.blocks,
        headers: CP.headers,
        chatHistory: meAiChatHistory.slice(-10),
        selectedBlockId: ME.selectedId,
      }),
    });
    const res = await response.json();
    typingEl.remove();

    if (response.status === 403 && res.error === 'AI_LOCKED') {
      meAiAppendBubble('ai', '🔒 AI features require a Pro plan.'); return;
    }

    meAiChatHistory.push({ role: 'model', content: res.message || '' });

    if (res.action === 'replace_blocks' && res.blocks) {
      ME.blocks = res.blocks.map(b => ({ id: b.id || ('b' + (ME.nextId++)), type: b.type, props: b.props || {} }));
      ME.selectedId = null; mRenderVisual(); mRenderProps(null); mSyncToCode();
      meAiAppendBubble('ai', res.message || 'Done! Canvas updated.');
    } else if (res.action === 'replace_html' && res.html && ME.cm) {
      ME.cm.setValue(res.html);
      meAiAppendBubble('ai', res.message || 'Code updated.');
    } else if (res.action === 'update_block' && res.blockId && res.props) {
      const b = ME.blocks.find(x => x.id === res.blockId);
      if (b) { Object.assign(b.props, res.props); mSyncToCode(); mRenderVisual(); if(ME.selectedId===b.id)mRenderProps(b); }
      meAiAppendBubble('ai', res.message || 'Block updated.');
    } else {
      meAiAppendBubble('ai', res.message || 'How else can I help?');
    }
  } catch (err) {
    if (typingEl) typingEl.remove();
    meAiAppendBubble('ai', 'Error: ' + err.message);
  } finally {
    meAiIsLoading = false; document.getElementById('meAiSendBtn').style.opacity = '1';
  }
}

