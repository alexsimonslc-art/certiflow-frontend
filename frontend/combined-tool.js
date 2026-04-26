/* ================================================================
   Honourix — Combined Pipeline  |  combined-tool.js
   Updated: Full 7-step pipeline
================================================================ */

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
const CP = {
  step:           1,
  srcType:        'sheets',
  headers:        [],
  rows:           [],
  sheetId:        null,
  writeBack:      false,
  results:        [],
  prevRowIdx:     0,
  rvPreviewIdx:   0,
  _jobStarted:    null,
  _jobFinished:   null,
  _jobDuration:   null,
  /* Manual entry */
  manualColumns:  ['Name', 'Email'],
  manualRows:     [{ Name: '', Email: '' }],
};

const STEPS = [
  { label: 'Data Source'      },
  { label: 'Design Cert'      },
  { label: 'Field Mapping'    },
  { label: 'Preview'          },
  { label: 'Email Template'   },
  { label: 'Review & Launch'  },
  { label: 'Results'          },
];

/* ── Canvas state ─────────────────────────────────────────── */
let _canvas, _ctx, _overlay;
const ED = {
  w:        1122,
  h:        794,
  bgImg:    null,
  bgBase64: null,
  bgColor:  '#ffffff',
  fields:   [],
  selId:    null,
  scale:    1,
  zoom:     1,
};

/* ── Email editor state ───────────────────────────────────── */
const ME = {
  blocks:        [],
  selectedId:    null,
  nextId:        1,
  activeTab:     'visual',
  cm:            null,
  cmDebounce:    null,
  previewDevice: 'desktop',
  initialized:   false,
  selectedTpl:   null,
};

/* ── Font URLs for PDF embedding ─────────────────────────── */
const FONT_URLS = {
  'Montserrat':          'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Hw0aXc.woff2',
  'Raleway':             'https://fonts.gstatic.com/s/raleway/v29/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVva.woff2',
  'Plus Jakarta Sans':   'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko50yqe.woff2',
  'Playfair Display':    'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd.woff2',
  'Dancing Script':      'https://fonts.gstatic.com/s/dancingscript/v25/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSo3Sob.woff2',
  'Cinzel':              'https://fonts.gstatic.com/s/cinzel/v23/8vIU7ww63mVu7gtR-kwKxNvkNOjw-uTnTQ.woff2',
  'EB Garamond':         'https://fonts.gstatic.com/s/ebgaramond/v26/SlGDmQSNjdsmc35JDF1K5E55YMjF_7DPuGi-6_RUA4l-uA.woff2',
  'Cormorant Garamond':  'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3YmX5slCNuHLi8bLeY9MK7whWMhyjYqXtK.woff2',
};

function getUsedFontUrls() {
  const urls = {};
  ED.fields.forEach(f => {
    const name = f.fontFamily || 'Helvetica';
    if (FONT_URLS[name]) urls[name] = FONT_URLS[name];
  });
  return urls;
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarMount').outerHTML = renderSidebar('combined-tool.html');
  initSidebar();
  buildStepper();

  _canvas  = document.getElementById('certCanvas');
  _ctx     = _canvas.getContext('2d');
  _overlay = document.getElementById('fieldOverlay');

  cpInitCanvas();
  loadSavedTemplate();
  meBuildTemplatePicker();
  cpManualRenderTable();
  cpFetchQuota();
  lucide.createIcons();

  /* Drag-drop on upload zone */
  const dz = document.getElementById('cpUploadZone');
  if (dz) {
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dz-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dz-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dz-over');
      cpHandleFile({ target: { files: e.dataTransfer.files } });
    });
  }

  /* Canvas scroll-zone grab */
  const sz = document.getElementById('canvasScrollZone');
  if (sz) {
    let drag = false, sx = 0, sy = 0, slx = 0, sly = 0;
    sz.addEventListener('mousedown', e => {
      if (e.target === sz || e.target.id === 'certCanvasContainer') {
        drag = true; sx = e.clientX; sy = e.clientY;
        slx = sz.scrollLeft; sly = sz.scrollTop;
        sz.classList.add('grabbing');
      }
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      sz.scrollLeft = slx - (e.clientX - sx);
      sz.scrollTop  = sly - (e.clientY - sy);
    });
    window.addEventListener('mouseup', () => { drag = false; sz.classList.remove('grabbing'); });

    /* Wheel zoom */
    sz.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        cpSetZoom(ED.zoom - e.deltaY * 0.001);
      }
    }, { passive: false });
  }
});

/* ══════════════════════════════════════════════════════════════
   STEPPER
══════════════════════════════════════════════════════════════ */
function buildStepper() {
  const el = document.getElementById('stepper');
  if (!el) return;
  el.innerHTML = STEPS.map((s, i) => {
    const n       = i + 1;
    const isActive = n === CP.step;
    const isDone   = n < CP.step;
    return `
      ${n > 1 ? `<div class="step-connector ${isDone ? 'done' : ''}"></div>` : ''}
      <div class="step-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}"
           onclick="cpGoStep(${n})" style="cursor:pointer">
        <div class="step-num">${isDone ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:13px;height:13px"><polyline points="20 6 9 17 4 12"/></svg>` : n}</div>
        <div class="step-label">${s.label}</div>
      </div>`;
  }).join('');
}

function cpGoStep(n) {
  if (n < 1 || n > STEPS.length) return;

  /* Guards */
  if (n >= 2 && !CP.rows.length) {
    showToast('Load participant data first.'); cpGoStep(1); return;
  }
  if (n >= 3 && !ED.fields.length) {
    showToast('Add at least one field to the certificate.'); return;
  }
  if (n >= 4) cpPopulateStep3();
  if (n === 4) cpRenderPreview();
  if (n === 5) cpPopulatePreviewRowSel();
  if (n === 6) cpPopulateReview();

  CP.step = n;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('sp' + n);
  if (panel) panel.classList.add('active');
  buildStepper();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════════════════════════════
   STEP 1 — DATA SOURCE
══════════════════════════════════════════════════════════════ */

/* ── Source switcher ──────────────────────────────────────── */
function cpSwitchSrc(type) {
  CP.srcType = type;
  ['sheets','file','manual','hxform'].forEach(t => {
    document.getElementById('cpSrc' + t.charAt(0).toUpperCase() + t.slice(1))
      .style.display = t === type ? 'block' : 'none';
    document.getElementById('src' + t.charAt(0).toUpperCase() + t.slice(1) + 'Opt')
      .classList.toggle('active', t === type);
  });
  /* Capitalise first letter helper already inline above */
  if (type === 'hxform') cpLoadHxFormList();
}

/* ── Google Sheets ────────────────────────────────────────── */
async function cpLoadSheet() {
  const id  = document.getElementById('sheetId').value.trim();
  if (!id) { showToast('Paste a Sheet ID first.'); return; }
  CP.sheetId = id;

  const btn = document.getElementById('loadSheetBtn');
  btn.disabled = true;
  btn.innerHTML = `<svg style="animation:spin 1s linear infinite;width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Loading…`;

  try {
    const token = await getAccessToken();
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1?key=&access_token=${token}`;
    const res   = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error('Sheet not accessible. Make sure it is shared.');
    const data  = await res.json();
    const rows  = data.values || [];
    if (!rows.length) throw new Error('Sheet is empty.');

    CP.headers = rows[0].map(h => String(h).trim());
    CP.rows    = rows.slice(1).map(r => {
      const obj = {};
      CP.headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]) : ''; });
      return obj;
    }).filter(r => Object.values(r).some(v => v));

    cpShowDataResult('sheetResult', CP.headers, CP.rows, 'Google Sheets');
    showToast(`Loaded ${CP.rows.length} rows from Sheets`);
  } catch (err) {
    document.getElementById('sheetResult').style.display = 'block';
    document.getElementById('sheetResult').innerHTML =
      `<div class="notice notice-gold" style="margin-top:10px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ${err.message}
      </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Load`;
  }
}

/* ── File Upload ──────────────────────────────────────────── */
function cpHandleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      let rows;
      if (file.name.endsWith('.csv')) {
        rows = cpParseCSV(evt.target.result);
      } else {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        // Normalise to array-of-arrays first style
        if (rows.length) {
          CP.headers = Object.keys(rows[0]);
          CP.rows    = rows.map(r => {
            const obj = {};
            CP.headers.forEach(h => { obj[h] = String(r[h] !== undefined ? r[h] : ''); });
            return obj;
          });
          cpShowDataResult('fileResult', CP.headers, CP.rows, file.name);
          return;
        }
      }
      if (!rows || rows.length < 2) throw new Error('File appears empty.');
      CP.headers = rows[0];
      CP.rows    = rows.slice(1).map(r => {
        const obj = {};
        CP.headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]) : ''; });
        return obj;
      }).filter(r => Object.values(r).some(v => v));
      cpShowDataResult('fileResult', CP.headers, CP.rows, file.name);
      showToast(`Loaded ${CP.rows.length} rows from ${file.name}`);
    } catch (err) {
      showToast('Could not parse file: ' + err.message);
    }
  };
  file.name.endsWith('.csv') ? reader.readAsText(file) : reader.readAsBinaryString(file);
}

function cpParseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(l => {
    const cols = []; let cur = ''; let inQ = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    cols.push(cur.trim());
    return cols;
  });
}

/* ── Manual Entry ─────────────────────────────────────────── */
function cpManualRenderTable() {
  const headerRow = document.getElementById('cpManualHeader');
  const tbody     = document.getElementById('cpManualBody');
  if (!headerRow || !tbody) return;

  headerRow.innerHTML = CP.manualColumns.map((col, ci) => `
    <th>
      <div class="manual-col-header">
        <input value="${col}" onchange="CP.manualColumns[${ci}]=this.value;cpManualRenderTable()"
          style="background:none;border:none;color:var(--text);font-weight:700;font-size:13px;
                 font-family:var(--font);outline:none;width:100%;min-width:60px"/>
        ${CP.manualColumns.length > 1 ? `
          <button class="manual-col-del" onclick="cpManualDelCol(${ci})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>` : ''}
      </div>
    </th>`).join('') + '<th style="width:36px"></th>';

  tbody.innerHTML = CP.manualRows.map((row, ri) => `
    <tr>
      ${CP.manualColumns.map(col => `
        <td>
          <input value="${(row[col] || '').replace(/"/g,'&quot;')}"
            onchange="CP.manualRows[${ri}]['${col}']=this.value"
            placeholder="${col}…"/>
        </td>`).join('')}
      <td>
        <button class="manual-row-del" onclick="cpManualDelRow(${ri})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </td>
    </tr>`).join('');
}

function cpManualAddColumn() {
  const name = prompt('Column name:', 'Column ' + (CP.manualColumns.length + 1));
  if (!name) return;
  CP.manualColumns.push(name.trim());
  CP.manualRows.forEach(r => { r[name.trim()] = ''; });
  cpManualRenderTable();
}

function cpManualDelCol(ci) {
  if (CP.manualColumns.length <= 1) return;
  const col = CP.manualColumns.splice(ci, 1)[0];
  CP.manualRows.forEach(r => delete r[col]);
  cpManualRenderTable();
}

function cpManualAddRow() {
  const row = {};
  CP.manualColumns.forEach(c => { row[c] = ''; });
  CP.manualRows.push(row);
  cpManualRenderTable();
}

function cpManualDelRow(ri) {
  CP.manualRows.splice(ri, 1);
  if (!CP.manualRows.length) cpManualAddRow();
  cpManualRenderTable();
}

function cpManualApply() {
  /* Sync current input values first */
  const trs = document.querySelectorAll('#cpManualBody tr');
  trs.forEach((tr, ri) => {
    const inputs = tr.querySelectorAll('input');
    inputs.forEach((inp, ci) => {
      if (ci < CP.manualColumns.length)
        CP.manualRows[ri][CP.manualColumns[ci]] = inp.value;
    });
  });

  CP.headers = [...CP.manualColumns];
  CP.rows    = CP.manualRows
    .map(r => { const o = {}; CP.headers.forEach(h => { o[h] = r[h] || ''; }); return o; })
    .filter(r => Object.values(r).some(v => v.trim()));

  if (!CP.rows.length) { showToast('Add at least one row with data.'); return; }
  cpShowDataResult('manualResult', CP.headers, CP.rows, 'Manual Entry');
  showToast(`Applied ${CP.rows.length} rows`);
}

/* ── HX Form ──────────────────────────────────────────────── */
async function cpLoadHxFormList() {
  const sel = document.getElementById('cpHxFormSelect');
  if (!sel) return;
  sel.innerHTML = '<option>Loading forms…</option>';
  try {
    const token = await getAccessToken();
    const res   = await fetch('/api/hxforms/list', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    const forms = data.forms || [];
    sel.innerHTML = forms.length
      ? forms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
      : '<option value="">No forms found</option>';
    if (forms.length) cpLoadHxFormData(forms[0].id);
  } catch {
    sel.innerHTML = '<option value="">Could not load forms</option>';
  }
}

async function cpLoadHxFormData(formId) {
  if (!formId) return;
  const resultEl = document.getElementById('hxFormResult');
  resultEl.style.display = 'none';
  try {
    const token = await getAccessToken();
    const res   = await fetch(`/api/hxforms/${formId}/responses`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    const rows = data.responses || [];
    if (!rows.length) throw new Error('No responses in this form yet.');
    CP.headers = Object.keys(rows[0]);
    CP.rows    = rows.map(r => {
      const obj = {};
      CP.headers.forEach(h => { obj[h] = String(r[h] !== undefined ? r[h] : ''); });
      return obj;
    });
    cpShowDataResult('hxFormResult', CP.headers, CP.rows, 'HX Form');
    showToast(`Loaded ${CP.rows.length} responses`);
  } catch (err) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div class="notice notice-gold" style="margin-top:10px">${err.message}</div>`;
  }
}

/* ── Shared: show data preview table ─────────────────────── */
function cpShowDataResult(containerId, headers, rows, sourceName) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const preview = rows.slice(0, 4);
  el.style.display = 'block';
  el.innerHTML = `
    <div class="notice notice-green" style="margin-bottom:10px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="20 6 9 17 4 12"/></svg>
      <strong>${rows.length} rows</strong> loaded from <strong>${sourceName}</strong>
      &nbsp;·&nbsp; ${headers.length} columns
    </div>
    <div style="overflow-x:auto;border:1px solid var(--glass-border);border-radius:10px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:rgba(255,255,255,0.04)">
            ${headers.map(h => `<th style="padding:8px 12px;text-align:left;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--glass-border);white-space:nowrap">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${preview.map((r, ri) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.03);background:${ri%2?'rgba(255,255,255,0.01)':'transparent'}">
              ${headers.map(h => `<td style="padding:7px 12px;color:var(--text-2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r[h] || ''}</td>`).join('')}
            </tr>`).join('')}
          ${rows.length > 4 ? `<tr><td colspan="${headers.length}" style="padding:8px 12px;text-align:center;color:var(--text-3);font-size:12px">…and ${rows.length - 4} more rows</td></tr>` : ''}
        </tbody>
      </table>
    </div>`;
}

/* ── Quota widget ─────────────────────────────────────────── */
async function cpFetchQuota() {
  try {
    const token = await getAccessToken();
    const res   = await fetch('/api/quota', { headers: { Authorization: 'Bearer ' + token } });
    const q     = await res.json();

    const sent    = q.todaySent    || 0;
    const limit   = q.dailyLimit   || 500;
    const left    = limit - sent;
    const pct     = Math.min(100, Math.round((sent / limit) * 100));
    const lifetime = q.lifetimeSent || 0;

    document.getElementById('cpAcctLabel').textContent   = q.email || 'Your Account';
    document.getElementById('cpAcctDot').style.background = left > 50 ? 'var(--green)' : left > 10 ? 'var(--gold)' : 'var(--red)';
    document.getElementById('cpQuotaBadge').textContent   = left > 0 ? 'Active' : 'Limit Reached';
    document.getElementById('cpQuotaCounter').textContent = `${sent} / ${limit}`;
    document.getElementById('cpQuotaBar').style.width     = pct + '%';
    document.getElementById('cpQuotaSent').textContent    = `${sent} sent today`;
    document.getElementById('cpQuotaLeft').textContent    = `${left} remaining`;
    document.getElementById('cpQuotaLifetime').textContent = lifetime.toLocaleString();
    document.getElementById('cpQuotaLimitDisplay').textContent = limit;

    window.cpQuotaRemaining = left;
  } catch {
    document.getElementById('cpAcctLabel').textContent = 'Could not load quota';
  }
}