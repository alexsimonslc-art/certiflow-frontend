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
    if (!document.getElementById('nameCol').value) { toast('Please select the Name column', 'error'); return false; }
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
  sel.disabled = true;
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
    el.innerHTML = `<div class="notice notice-green">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span><strong>${CS.rows.length} submissions</strong> loaded from <strong>${data.formName}</strong></span>
    </div>`;
    el.style.display = 'block';
    toast(`${CS.rows.length} responses ready`, 'success');
  } catch(e) {
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
  const cont = document.getElementById('canvasContainer');
  if (cont) {
    cont.style.width  = cw + 'px';
    cont.style.height = ch + 'px';
  }
  canvas.width  = cw;
  canvas.height = ch;
  ED.ready = true;
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
    const cw = canvas.width, ch = canvas.height;
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
    fieldOverlay.appendChild(el);
  });
  renderChipList();
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
function openAFModal()  { document.getElementById('afOverlay').classList.add('open'); }
function closeAFModal() { document.getElementById('afOverlay').classList.remove('open'); }
function openAddFieldModal()  { openAFModal(); }
function closeAddFieldModal() { closeAFModal(); }
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
    }));
  } else {
    selectField(field.id);
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
  document.getElementById('pPrev').value  = f.previewText || '';
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
  if (ED.selId === id) { ED.selId = null; document.getElementById('propsEmpty').style.display = ''; document.getElementById('propsForm').style.display = 'none'; }
  renderHandles();
}
function deleteSelectedField() { if (ED.selId) deleteField(ED.selId); }
function deleteSelField()      { if (ED.selId) deleteField(ED.selId); }
function setFP(key, val) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f[key] = val; if (key === 'color') document.getElementById('pColorHex').textContent = val; renderHandles(); }
function setFPFont(name) { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.fontFamily = name; loadFontIfNeeded(name); updateFontPreview(name, f.bold, f.italic); renderHandles(); }
function setFPXY() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.x = parseFloat(document.getElementById('pX').value)||f.x; f.y = parseFloat(document.getElementById('pY').value)||f.y; renderHandles(); }
function setAlign(a) { setFP('align', a); ['alL','alC','alR'].forEach(b => document.getElementById(b).classList.remove('on')); document.getElementById(a==='center'?'alC':a==='right'?'alR':'alL').classList.add('on'); }
function toggleBold()   { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.bold   = !f.bold;   document.getElementById('boldBtn').classList.toggle('on', f.bold);   renderHandles(); }
function toggleItalic() { const f = ED.fields.find(f => f.id === ED.selId); if (!f) return; f.italic = !f.italic; document.getElementById('italicBtn').classList.toggle('on', f.italic); renderHandles(); }
function switchEPTab(tab) { ['fields','props'].forEach(t => { document.getElementById(`epTab_${t}`).className = 'ep-tab'+(t===tab?' active':''); document.getElementById(`epPanel_${t}`).className = 'ep-panel'+(t===tab?' active':''); }); }
function renderChipList() {
  const el = document.getElementById('fieldChipList'); if (!el) return;
  if (!ED.fields.length) { el.innerHTML = `<div style="text-align:center;padding:28px 8px;color:var(--text-3);font-size:13px">No fields yet.<br/><span style="color:var(--cyan)">Click "+ Add Field"</span></div>`; return; }
  el.innerHTML = ED.fields.map(f => `<div class="fc-chip ${f.id===ED.selId?'sel':''}" onclick="selectField('${f.id}')"><div class="fc-dot" style="background:${f.color}"></div><span class="fc-name">${f.previewText||f.placeholder}</span><span class="fc-ph">${f.placeholder}</span></div>`).join('');
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
    ED.fields  = (t.fields || []).map(f => ({ bold: false, italic: false, letterSpacing: 0, ...f }));
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