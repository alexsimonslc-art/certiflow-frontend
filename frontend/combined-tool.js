/* ================================================================
   CertiFlow — Combined Pipeline JS
   combined-tool.js
================================================================ */

let state = {
  dataMode: 'sheets',
  rows: [],
  headers: [],
  sheetId: null,
  currentStep: 1,
};

document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth();
  if (!user) return;
  initSidebar();
});

/* ── Step navigation ──────────────────────────────────────────── */
function goToStep(n) {
  if (n === 2 && !validateStep1()) return;
  if (n === 3 && !validateStep2()) return;
  if (n === 4 && !validateStep3()) return;
  if (n === 4) buildReviewPanel();

  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step-item').forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
  });
  document.getElementById(`step${n}`).classList.add('active');
  state.currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep1() {
  const name = document.getElementById('campaignName').value.trim();
  const tmpl = document.getElementById('templateId').value.trim();
  const folder = document.getElementById('folderId').value.trim();
  if (!name)   { toast('Enter a campaign name', 'warning'); return false; }
  if (state.rows.length === 0) { toast('Load your participant data first', 'warning'); return false; }
  if (!tmpl)   { toast('Enter your Slides template ID', 'warning'); return false; }
  if (!folder) { toast('Enter your Drive folder ID', 'warning'); return false; }
  populateColumnSelects();
  return true;
}

function validateStep2() {
  if (!document.getElementById('mapName').value)  { toast('Map the Name column', 'warning'); return false; }
  if (!document.getElementById('mapEmail').value) { toast('Map the Email column', 'warning'); return false; }
  updateMergeTags();
  return true;
}

function validateStep3() {
  const subj = document.getElementById('emailSubject').value.trim();
  const body = document.getElementById('emailTemplate').value.trim();
  if (!subj) { toast('Enter an email subject', 'warning'); return false; }
  if (!body) { toast('Write your email template', 'warning'); return false; }
  buildEmailPreview();
  return true;
}

/* ── Data source ──────────────────────────────────────────────── */
function selectDataMode(mode) {
  state.dataMode = mode;
  document.getElementById('modeSheets').classList.toggle('active', mode === 'sheets');
  document.getElementById('modeUpload').classList.toggle('active', mode === 'upload');
  document.getElementById('sheetsInput').style.display  = mode === 'sheets' ? '' : 'none';
  document.getElementById('uploadInput').style.display  = mode === 'upload' ? '' : 'none';
}

async function loadSheet() {
  const id = document.getElementById('sheetId').value.trim();
  if (!id) { toast('Paste your Sheet ID first', 'warning'); return; }
  state.sheetId = id;
  try {
    toast('Loading sheet…', 'info', 2000);
    const data = await apiFetch(`/api/sheets/read?sheetId=${id}`);
    if (!data?.data?.length) { toast('Sheet is empty or could not be read', 'error'); return; }
    state.headers = data.data[0];
    state.rows    = data.data.slice(1);
    renderPreview(state.headers, state.rows.slice(0, 5));
    toast(`Loaded ${state.rows.length} rows`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split('\n').filter(l => l.trim());
    state.headers = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
    state.rows    = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/"/g,'')));
    state.sheetId = null;
    renderPreview(state.headers, state.rows.slice(0, 5));
    toast(`Loaded ${state.rows.length} rows from file`, 'success');
  };
  reader.readAsText(file);
}

function renderPreview(headers, rows) {
  const wrap = document.getElementById('sheetPreview');
  const info = document.getElementById('previewInfo');
  info.textContent = `${state.rows.length} rows · ${headers.length} columns — showing first 5`;
  let html = '<table class="preview-table"><thead><tr>';
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => html += `<td>${cell}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('previewTable').innerHTML = html;
  wrap.style.display = '';
}

function clearSheet() {
  state.rows = []; state.headers = []; state.sheetId = null;
  document.getElementById('sheetPreview').style.display = 'none';
  document.getElementById('sheetId').value = '';
}

/* ── Column mapping ───────────────────────────────────────────── */
function populateColumnSelects() {
  ['mapName','mapEmail'].forEach(id => {
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = '<option value="">Select column…</option>';
    state.headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      if (h === cur) opt.selected = true;
      sel.appendChild(opt);
    });
    // Auto-detect
    if (!cur) {
      const guesses = { mapName: ['name','full name','participant'], mapEmail: ['email','e-mail','mail'] };
      const match = state.headers.find(h => guesses[id].some(g => h.toLowerCase().includes(g)));
      if (match) sel.value = match;
    }
  });
  // Refresh custom field selects
  document.querySelectorAll('.custom-col-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">Select column…</option>';
    state.headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      if (h === cur) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function addCustomField() {
  const wrap = document.getElementById('customMappings');
  const row = document.createElement('div');
  row.className = 'mapping-row';
  row.innerHTML = `
    <input type="text" class="form-input form-input-sm custom-placeholder" placeholder="{{field}}" style="max-width:140px">
    <span class="mapping-arrow">←</span>
    <select class="form-select custom-col-select">
      <option value="">Select column…</option>
      ${state.headers.map(h => `<option value="${h}">${h}</option>`).join('')}
    </select>
    <button class="btn-ghost btn-sm" onclick="this.parentElement.remove()">✕</button>
  `;
  wrap.appendChild(row);
}

function getFieldMappings() {
  const mappings = {
    name:  document.getElementById('mapName').value,
    email: document.getElementById('mapEmail').value,
  };
  document.querySelectorAll('#customMappings .mapping-row').forEach(row => {
    const ph  = row.querySelector('.custom-placeholder')?.value?.replace(/[{}]/g,'').trim();
    const col = row.querySelector('.custom-col-select')?.value;
    if (ph && col) mappings[ph] = col;
  });
  return mappings;
}

/* ── Email step ───────────────────────────────────────────────── */
function updateMergeTags() {
  const container = document.getElementById('mergeTags');
  const fixed = ['{{name}}','{{email}}','{{cert_link}}'];
  const custom = Object.keys(getFieldMappings())
    .filter(k => !['name','email'].includes(k))
    .map(k => `{{${k}}}`);
  const all = [...new Set([...fixed, ...custom])];
  container.innerHTML = all.map(t => `<span class="merge-tag" onclick="insertTag('${t}')">${t}</span>`).join('');
}

function insertTag(tag) {
  const ta = document.getElementById('emailTemplate');
  const start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.substring(0, start) + tag + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = start + tag.length;
  ta.focus();
}

function buildEmailPreview() {
  if (!state.rows.length) return;
  const box = document.getElementById('emailPreviewBox');
  const mappings = getFieldMappings();
  const firstRow = state.rows[0];
  const getData = col => firstRow[state.headers.indexOf(col)] || '';
  const name  = getData(mappings.name);
  const email = getData(mappings.email);
  const subj  = personalize(document.getElementById('emailSubject').value, mappings, firstRow, name);
  const body  = personalize(document.getElementById('emailTemplate').value, mappings, firstRow, name);
  document.getElementById('previewTo').textContent      = email;
  document.getElementById('previewSubject').textContent = subj;
  document.getElementById('previewBody').innerHTML      = body;
  box.style.display = '';
}

function refreshPreview() { buildEmailPreview(); }

function personalize(template, mappings, row, name) {
  let out = template.replace(/{{name}}/g, name);
  Object.entries(mappings).forEach(([ph, col]) => {
    const val = row[state.headers.indexOf(col)] || '';
    out = out.replace(new RegExp(`{{${ph}}}`, 'g'), val);
  });
  return out;
}

/* ── Review panel ─────────────────────────────────────────────── */
function buildReviewPanel() {
  const count = state.rows.length;
  document.getElementById('reviewCount').textContent  = count;
  document.getElementById('reviewCerts').textContent  = count;
  document.getElementById('reviewEmails').textContent = count;

  const mappings = getFieldMappings();
  const writeBack = document.getElementById('writeBack').checked;
  document.getElementById('reviewDetails').innerHTML = `
    <div class="review-row"><span>Campaign</span><strong>${document.getElementById('campaignName').value}</strong></div>
    <div class="review-row"><span>Participants</span><strong>${count} people</strong></div>
    <div class="review-row"><span>Template</span><strong>${document.getElementById('templateId').value.substring(0,24)}…</strong></div>
    <div class="review-row"><span>Drive Folder</span><strong>${document.getElementById('folderId').value.substring(0,24)}…</strong></div>
    <div class="review-row"><span>Name Column</span><strong>${mappings.name}</strong></div>
    <div class="review-row"><span>Email Column</span><strong>${mappings.email}</strong></div>
    <div class="review-row"><span>Subject</span><strong>${document.getElementById('emailSubject').value}</strong></div>
    <div class="review-row"><span>Write links back</span><strong>${writeBack ? '✅ Yes' : '❌ No'}</strong></div>
  `;
}

/* ── Launch pipeline ──────────────────────────────────────────── */
async function launchPipeline() {
  const btn = document.getElementById('launchBtn');
  btn.disabled = true;
  btn.textContent = 'Launching…';
  goToStep(5);

  const mappings   = getFieldMappings();
  const writeBack  = document.getElementById('writeBack').checked;
  const subject    = document.getElementById('emailSubject').value;
  const htmlTmpl   = document.getElementById('emailTemplate').value;
  const total      = state.rows.length;
  let certDone = 0, mailDone = 0, failed = 0;

  document.getElementById('progressCount').textContent = `0 / ${total}`;
  const logBox = document.getElementById('logBox');

  function addLog(name, certStatus, mailStatus) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const certDot = certStatus === 'ok' ? 'cert' : 'err';
    const mailDot = mailStatus === 'ok' ? 'mail' : (mailStatus === 'pending' ? 'pend' : 'err');
    entry.innerHTML = `
      <div class="log-dot ${certDot}"></div>
      <span class="log-name">${name}</span>
      <span class="log-status ${certDot}">cert: ${certStatus}</span>
      <span style="margin:0 6px;color:#334155">|</span>
      <div class="log-dot ${mailDot}"></div>
      <span class="log-status ${mailDot}">mail: ${mailStatus}</span>
    `;
    logBox.insertBefore(entry, logBox.firstChild);
  }

  function updateProgress(done) {
    const pct = Math.round((done / total) * 100);
    document.getElementById('progressBar').style.width  = pct + '%';
    document.getElementById('progressCount').textContent = `${done} / ${total}`;
  }

  // Process each participant
  for (let i = 0; i < state.rows.length; i++) {
    const row  = state.rows[i];
    const name  = row[state.headers.indexOf(mappings.name)]  || `Person ${i+1}`;
    const email = row[state.headers.indexOf(mappings.email)] || '';

    document.getElementById('progressLabel').textContent = `Processing: ${name}`;

    // Build replacements object for this row
    const replacements = {};
    Object.entries(mappings).forEach(([ph, col]) => {
      replacements[ph] = row[state.headers.indexOf(col)] || '';
    });

    let certLink = '';
    let certStatus = 'failed', mailStatus = 'failed';

    try {
      // Step A: Generate certificate
      const certRes = await apiFetch('/api/certificates/generate-one', {
        method: 'POST',
        body: JSON.stringify({
          participantName: name,
          templateId: document.getElementById('templateId').value.trim(),
          folderId:   document.getElementById('folderId').value.trim(),
          replacements,
          sheetId:    writeBack ? state.sheetId : null,
          rowIndex:   i + 1,
        }),
      });
      certLink   = certRes?.link || '';
      certStatus = 'ok';
      certDone++;
    } catch (e) {
      failed++;
      addLog(name, 'failed', 'skipped');
      updateProgress(i + 1);
      continue;
    }

    try {
      // Step B: Send email
      const personalizedHtml = htmlTmpl
        .replace(/{{name}}/g, name)
        .replace(/{{email}}/g, email)
        .replace(/{{cert_link}}/g, certLink);
      Object.entries(replacements).forEach(([ph, val]) => {
        personalizedHtml.replace(new RegExp(`{{${ph}}}`, 'g'), val);
      });

      await apiFetch('/api/mail/send-one', {
        method: 'POST',
        body: JSON.stringify({ to: email, subject, html: personalizedHtml }),
      });
      mailStatus = 'ok';
      mailDone++;
    } catch (e) {
      failed++;
    }

    addLog(name, certStatus, mailStatus);
    updateProgress(i + 1);
  }

  // Show done state
  document.getElementById('runningState').style.display = 'none';
  document.getElementById('doneState').style.display    = '';
  document.getElementById('resCertDone').textContent    = certDone;
  document.getElementById('resMailDone').textContent    = mailDone;
  document.getElementById('resFailed').textContent      = failed;
  document.getElementById('finalLog').innerHTML         = logBox.innerHTML;
  toast(`Pipeline complete — ${certDone} certs, ${mailDone} emails`, 'success', 5000);
}

function resetPipeline() {
  window.location.reload();
}