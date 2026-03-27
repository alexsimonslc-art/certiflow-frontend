/* ================================================================
   CertiFlow — Certificate Generator Logic
   js/cert-tool.js
   ================================================================ */

/* ── State ───────────────────────────────────────────────────────── */
const certState = {
  currentStep: 1,
  sourceType: 'sheets',   // 'sheets' | 'csv'
  sheetHeaders: [],       // column headers from sheet
  sheetData: [],          // all rows (array of arrays)
  parsedRows: [],         // normalized: [{Name:'', Email:'', ...}]
  fieldMappings: [],      // [{column:'Course Name', placeholder:'course'}]
  results: [],            // final results from backend
  jobId: null,
  pollInterval: null,
};

/* ── Step Navigation ─────────────────────────────────────────────── */
function goToStep(n, force = false) {
  if (!force && !validateStep(certState.currentStep)) return;
  certState.currentStep = n;

  // Update stepper visuals
  for (let i = 1; i <= 5; i++) {
    const node = document.getElementById(`sn${i}`);
    const line = document.getElementById(`sl${i}`);
    node.className = 'step-node' + (i < n ? ' done' : i === n ? ' active' : '');
    if (line) line.className = 'step-line' + (i < n ? ' done' : '');

    const circle = node.querySelector('.step-circle');
    if (i < n) {
      circle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else {
      circle.textContent = i;
    }
  }

  document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${n}`).classList.add('active');

  if (n === 2) populateColumnDropdowns();
  if (n === 3) buildPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(n) {
  if (n === 1) {
    if (!document.getElementById('campaignName').value.trim()) {
      toast('Please enter a campaign name', 'error'); return false;
    }
    if (!document.getElementById('templateId').value.trim()) {
      toast('Please enter your Slides template ID', 'error'); return false;
    }
    if (!document.getElementById('folderId').value.trim()) {
      toast('Please enter the Drive folder ID', 'error'); return false;
    }
    if (certState.parsedRows.length === 0) {
      toast('Please load your participant data first (Sheet or file upload)', 'error'); return false;
    }
    return true;
  }
  if (n === 2) {
    if (!document.getElementById('nameCol').value) {
      toast('Please select the Name column', 'error'); return false;
    }
    if (!document.getElementById('emailCol').value) {
      toast('Please select the Email column', 'error'); return false;
    }
    return true;
  }
  return true;
}

/* ── Source toggle ───────────────────────────────────────────────── */
function switchSource(type) {
  certState.sourceType = type;
  document.getElementById('sourceSheets').style.display = type === 'sheets' ? 'block' : 'none';
  document.getElementById('sourceCSV').style.display    = type === 'csv'    ? 'block' : 'none';
  document.getElementById('tabSheets').className = 'source-tab' + (type === 'sheets' ? ' active' : '');
  document.getElementById('tabCSV').className    = 'source-tab' + (type === 'csv'    ? ' active' : '');
}

/* ── Google Sheets loading ───────────────────────────────────────── */
async function loadSheet() {
  const sheetId = document.getElementById('sheetId').value.trim();
  if (!sheetId) { toast('Please enter a Sheet ID', 'error'); return; }

  const btn = document.querySelector('#sourceSheets .btn-primary');
  btn.classList.add('loading'); btn.disabled = true;

  try {
    const data = await apiFetch(`/api/sheets/read?sheetId=${encodeURIComponent(sheetId)}&range=Sheet1`);
    if (!data || !data.data || data.data.length < 2) {
      toast('Sheet is empty or has only headers', 'warning'); return;
    }

    certState.sheetHeaders = data.data[0].map(h => h.toString().trim());
    const rows = data.data.slice(1);
    certState.sheetData = rows;
    certState.parsedRows = rows.map(row => {
      const obj = {};
      certState.sheetHeaders.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });

    document.getElementById('sheetLoadMsg').textContent =
      `Sheet loaded — ${certState.parsedRows.length} participants, ${certState.sheetHeaders.length} columns`;
    document.getElementById('sheetPreviewWrap').style.display = 'block';
    renderSheetPreview();
    toast(`Loaded ${certState.parsedRows.length} participants`, 'success');
  } catch (err) {
    toast('Failed to load Sheet: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

function renderSheetPreview() {
  const headers = certState.sheetHeaders;
  const rows    = certState.parsedRows.slice(0, 5);
  let html = `<div class="data-table"><div class="data-row header">${headers.map(h => `<div class="data-cell">${h}</div>`).join('')}</div>`;
  rows.forEach(row => {
    html += `<div class="data-row">${headers.map(h => `<div class="data-cell">${row[h] || ''}</div>`).join('')}</div>`;
  });
  if (certState.parsedRows.length > 5) {
    html += `<div style="padding:10px 12px;font-size:12px;color:var(--text-3);text-align:center;">+${certState.parsedRows.length - 5} more rows</div>`;
  }
  html += '</div>';
  document.getElementById('sheetPreviewTable').innerHTML = html;
}

/* ── CSV / Excel upload ──────────────────────────────────────────── */
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        certState.sheetHeaders = res.meta.fields;
        certState.parsedRows   = res.data;
        showCSVPreview(file.name);
      },
    });
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb  = XLSX.read(e.target.result, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json(ws, { defval: '' });
      certState.sheetHeaders = Object.keys(arr[0] || {});
      certState.parsedRows   = arr;
      showCSVPreview(file.name);
    };
    reader.readAsArrayBuffer(file);
  } else {
    toast('Unsupported file type. Use .csv, .xlsx or .xls', 'error');
  }
}

function showCSVPreview(filename) {
  const wrap  = document.getElementById('csvPreviewWrap');
  const rows  = certState.parsedRows.slice(0, 5);
  const headers = certState.sheetHeaders;
  let html = `<div class="notice notice-green" style="margin-bottom:10px;">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    <span><strong>${filename}</strong> loaded — ${certState.parsedRows.length} rows, ${headers.length} columns</span>
  </div>`;
  html += `<div class="data-table"><div class="data-row header">${headers.map(h => `<div class="data-cell">${h}</div>`).join('')}</div>`;
  rows.forEach(row => {
    html += `<div class="data-row">${headers.map(h => `<div class="data-cell">${row[h] || ''}</div>`).join('')}</div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;
  wrap.style.display = 'block';
  toast(`Loaded ${certState.parsedRows.length} participants from file`, 'success');
}

/* ── Drag & drop ─────────────────────────────────────────────────── */
const uploadZone = document.getElementById('uploadZone');
if (uploadZone) {
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) { handleFileUpload({ target: { files: [file] } }); }
  });
}

/* ── Column dropdowns ────────────────────────────────────────────── */
function populateColumnDropdowns() {
  const headers = certState.sheetHeaders;
  const nameSelect  = document.getElementById('nameCol');
  const emailSelect = document.getElementById('emailCol');

  const opts = headers.map(h => `<option value="${h}">${h}</option>`).join('');
  nameSelect.innerHTML  = `<option value="">Select column...</option>${opts}`;
  emailSelect.innerHTML = `<option value="">Select column...</option>${opts}`;

  // Auto-detect common names
  const nameGuess  = headers.find(h => /name/i.test(h));
  const emailGuess = headers.find(h => /email|mail/i.test(h));
  if (nameGuess)  nameSelect.value  = nameGuess;
  if (emailGuess) emailSelect.value = emailGuess;

  // Column list in right panel
  const colPreview = document.getElementById('colPreview');
  colPreview.innerHTML = headers.map(h => `
    <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);">
      <span style="width:6px;height:6px;background:var(--cyan);border-radius:50%;flex-shrink:0;"></span>
      <span>${h}</span>
    </div>
  `).join('');

  // Refresh field mapping dropdowns
  document.querySelectorAll('.field-col-select').forEach(sel => {
    sel.innerHTML = `<option value="">Select column...</option>${opts}`;
  });
}

/* ── Custom field mappings ───────────────────────────────────────── */
function addFieldMapping() {
  const container = document.getElementById('fieldMappings');
  document.getElementById('noMappings').style.display = 'none';

  const idx  = certState.fieldMappings.length;
  certState.fieldMappings.push({ column: '', placeholder: '' });
  const headers = certState.sheetHeaders;
  const opts    = headers.map(h => `<option value="${h}">${h}</option>`).join('');

  const row = document.createElement('div');
  row.className = 'field-map-row';
  row.dataset.idx = idx;
  row.innerHTML = `
    <select class="form-select field-col-select" onchange="updateMapping(${idx},'column',this.value)">
      <option value="">Sheet column...</option>${opts}
    </select>
    <svg class="field-map-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    <div style="position:relative;flex:1;">
      <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:13px;pointer-events:none;">{{</span>
      <input type="text" class="form-input" placeholder="placeholder" style="padding-left:28px;"
        onchange="updateMapping(${idx},'placeholder',this.value)"
        oninput="updateMapping(${idx},'placeholder',this.value)"/>
      <span style="position:absolute;right:11px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:13px;pointer-events:none;">}}</span>
    </div>
    <button class="remove-btn" onclick="removeMapping(${idx},this.parentElement)" title="Remove">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  container.appendChild(row);
}

function updateMapping(idx, key, val) {
  if (certState.fieldMappings[idx]) {
    certState.fieldMappings[idx][key] = val.trim();
  }
}

function removeMapping(idx, el) {
  certState.fieldMappings.splice(idx, 1);
  el.remove();
  if (certState.fieldMappings.length === 0) {
    document.getElementById('noMappings').style.display = 'flex';
  }
}

/* ── Preview (Step 3) ────────────────────────────────────────────── */
function buildPreview() {
  const nameCol  = document.getElementById('nameCol').value;
  const emailCol = document.getElementById('emailCol').value;
  const rows     = certState.parsedRows;
  const count    = rows.length;

  document.getElementById('participantCount').textContent = `${count} participants`;
  document.getElementById('confirmCount').textContent     = `(${count})`;

  // Summary
  const campaignName = document.getElementById('campaignName').value;
  const templateId   = document.getElementById('templateId').value;
  const folderId     = document.getElementById('folderId').value;
  const writeBack    = document.getElementById('writeBackToggle').classList.contains('on');

  const summaryItems = [
    { key: 'Campaign', val: campaignName },
    { key: 'Participants', val: `${count} rows` },
    { key: 'Name column', val: nameCol },
    { key: 'Email column', val: emailCol },
    { key: 'Slides template', val: templateId.slice(0, 28) + '...' },
    { key: 'Drive folder', val: folderId.slice(0, 28) + '...' },
    { key: 'Write links back', val: writeBack ? 'Yes' : 'No' },
  ];
  document.getElementById('summaryList').innerHTML = summaryItems.map(i => `
    <div class="summary-item">
      <span class="summary-key">${i.key}</span>
      <span class="summary-val">${i.val}</span>
    </div>
  `).join('');

  // Participant preview table
  const cols = [nameCol, emailCol, ...certState.fieldMappings.filter(m => m.column).map(m => m.column)];
  const preview = rows.slice(0, 10);
  let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
    <thead><tr>${cols.map(c => `<th style="padding:9px 12px;background:var(--surface-2);font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;text-align:left;white-space:nowrap;">${c}</th>`).join('')}</tr></thead>
    <tbody>`;
  preview.forEach(row => {
    html += `<tr style="border-top:1px solid var(--border);">${cols.map(c => `<td style="padding:9px 12px;font-size:12.5px;color:var(--text-2);">${row[c] || ''}</td>`).join('')}</tr>`;
  });
  if (rows.length > 10) html += `<tr><td colspan="${cols.length}" style="padding:9px 12px;font-size:12px;color:var(--text-3);text-align:center;">+ ${rows.length - 10} more</td></tr>`;
  html += '</tbody></table></div>';
  document.getElementById('previewTable').innerHTML = html;

  // Mappings preview
  const allMappings = [
    { column: nameCol, placeholder: 'name' },
    { column: emailCol, placeholder: 'email' },
    ...certState.fieldMappings.filter(m => m.column && m.placeholder),
  ];
  document.getElementById('mappingsPreview').innerHTML = allMappings.map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--surface-2);border-radius:6px;">
      <span style="color:var(--text);">${m.column}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      <code style="background:var(--purple-dim);color:#a78bfa;padding:2px 7px;border-radius:4px;font-size:12px;">{{${m.placeholder}}}</code>
    </div>
  `).join('');

  document.getElementById('processSummary').innerHTML = summaryItems.slice(0, 4).map(i => `
    <div class="summary-item"><span class="summary-key">${i.key}</span><span class="summary-val">${i.val}</span></div>
  `).join('');
}

/* ── Start Generation ────────────────────────────────────────────── */
async function startGeneration() {
  goToStep(4, true);
  const templateRaw = localStorage.getItem('certiflow_template');
  if (!templateRaw) {
    toast('No template found. Design one in the Template Editor first.', 'error');
    goToStep(1, true);
    return;
  }
  const template = JSON.parse(templateRaw);
  const nameCol  = document.getElementById('nameCol').value;
  const emailCol = document.getElementById('emailCol').value;

  try {
    const res = await apiFetch('/api/certificates/generate', {
      method: 'POST',
      body: JSON.stringify({
        campaignName: document.getElementById('campaignName').value,
        template,
        participants: certState.parsedRows,
        nameCol,
        emailCol,
        sheetId:   certState.sheetId || null,
        writeBack: document.getElementById('writeBackToggle')?.checked || false,
      }),
    });

    certState.results = res.results;
    const success = res.results.filter(r => r.status === 'success').length;
    const failed  = res.results.filter(r => r.status === 'failed').length;

    document.getElementById('resDoneCount').textContent  = success;
    document.getElementById('resFailCount').textContent  = failed;
    document.getElementById('resTotalCount').textContent = res.total;
    document.getElementById('resFolderLink').href        = res.folderLink;
    document.getElementById('resFolderLink').style.display = '';

    renderResultsTable(res.results);
    goToStep(5, true);
    toast(`${success} certificates generated!`, 'success', 5000);
  } catch (e) {
    toast('Generation failed: ' + e.message, 'error');
    goToStep(3, true);
  }
}


function pollProgress(total) {
  certState.pollInterval = setInterval(async () => {
    if (!certState.jobId) return;
    try {
      const status = await apiFetch(`/api/certificates/progress/${certState.jobId}`);
      if (!status) return;

      const done = status.completed || 0;
      const pct  = total > 0 ? Math.round((done / total) * 100) : 0;

      document.getElementById('genCounter').textContent = `${done} / ${total}`;
      document.getElementById('genProgressFill').style.width = pct + '%';
      document.getElementById('genStatus').textContent = `Processing... ${pct}% complete`;

      // Add log entries for new results
      if (status.latestResult) {
        const r = status.latestResult;
        if (r.status === 'done') {
          addLog('ok', `Certificate generated for ${r.name}`);
        } else {
          addLog('err', `Failed: ${r.name} — ${r.error}`);
        }
      }

      if (status.status === 'done' || status.status === 'failed') {
        clearInterval(certState.pollInterval);
        certState.results = status.results || [];
        document.getElementById('genStatus').textContent = 'Completed';
        addLog('info', `Done — ${status.successCount} success, ${status.failCount} failed`);
        setTimeout(() => showResults(status), 1200);
      }
    } catch (err) {
      // Silently continue polling on transient errors
    }
  }, 1800);
}

function addLog(type, msg) {
  const log  = document.getElementById('genLog');
  const ts   = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-ts">${ts}</span> <span class="log-${type}">${msg}</span>`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

/* ── Results (Step 5) ────────────────────────────────────────────── */
function showResults(status) {
  goToStep(5, true);
  const results = certState.results;
  const success = results.filter(r => r.status === 'done').length;
  const failed  = results.filter(r => r.status !== 'done').length;

  document.getElementById('resTotal').textContent   = results.length;
  document.getElementById('resSuccess').textContent = success;
  document.getElementById('resFailed').textContent  = failed;

  if (failed === 0) {
    document.getElementById('resultTitle').textContent    = 'All certificates generated';
    document.getElementById('resultSubtitle').textContent = `${success} PDF certificates saved to your Drive.`;
  } else {
    document.getElementById('resultTitle').textContent    = `${success} generated, ${failed} failed`;
    document.getElementById('resultSubtitle').textContent = 'Check the table below for error details.';
  }

  renderResultRows(results);
  toast(`Generation complete — ${success} certificates ready`, 'success', 5000);
}

function renderResultRows(results) {
  const container = document.getElementById('resultRows');
  container.innerHTML = results.map(r => `
    <div class="result-row" data-name="${r.name}" data-email="${r.email || ''}">
      <div class="result-name">${r.name}</div>
      <div class="result-email">${r.email || '—'}</div>
      <div class="result-link">
        ${r.status === 'done'
          ? `<a href="${r.link}" target="_blank">${r.link}</a>`
          : `<span style="color:var(--red);font-size:12px;">${r.error || 'Failed'}</span>`
        }
      </div>
      <div class="result-actions">
        ${r.status === 'done' ? `
          <button class="icon-btn" onclick="copyToClipboard('${r.link}','Link')" title="Copy link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <a href="${r.link}" target="_blank" class="icon-btn" title="Open">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        ` : `<span class="badge badge-red">Failed</span>`}
      </div>
    </div>
  `).join('');
}

function filterResults() {
  const q = document.getElementById('resultSearch').value.toLowerCase();
  document.querySelectorAll('#resultRows .result-row').forEach(row => {
    const name  = (row.dataset.name  || '').toLowerCase();
    const email = (row.dataset.email || '').toLowerCase();
    row.style.display = (!q || name.includes(q) || email.includes(q)) ? '' : 'none';
  });
}

function downloadResults() {
  downloadCSV(certState.results.map(r => ({
    Name: r.name, Email: r.email || '', Status: r.status,
    'Certificate Link': r.link || '', Error: r.error || '',
  })), `certiflow-results-${Date.now()}.csv`);
}

function newCampaign() {
  confirm('Start a new campaign? Your current results will be cleared.', () => {
    certState.parsedRows = []; certState.results = []; certState.fieldMappings = [];
    certState.jobId = null;
    if (certState.pollInterval) clearInterval(certState.pollInterval);
    document.getElementById('campaignName').value = '';
    document.getElementById('sheetId').value = '';
    document.getElementById('templateId').value = '';
    document.getElementById('folderId').value = '';
    document.getElementById('sheetPreviewWrap').style.display = 'none';
    document.getElementById('fieldMappings').innerHTML = '';
    document.getElementById('noMappings').style.display = 'flex';
    goToStep(1, true);
  });
}

/* ── Init ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarMount').outerHTML = renderSidebar('cert-tool.html');
  lucide.createIcons();
});

let selectedSheetId = null;

async function pickSheet() {
  await openGooglePicker('sheet', ({ id, name }) => {
    selectedSheetId = id;
    document.getElementById('sheetName').textContent = name;
    loadSheetData(id); // auto-loads after picking
  });
}