/* ================================================================
   CertiFlow — Bulk Mail Sender Logic
   js/mail-tool.js
   ================================================================ */

const mailState = {
  currentStep: 1,
  sourceType:  'sheets',
  headers:     [],
  parsedRows:  [],
  results:     [],
  previewIdx:  0,
};

/* ── Step navigation ─────────────────────────────────────────────── */
function mGoToStep(n, force = false) {
  if (!force && !mValidateStep(mailState.currentStep)) return;
  mailState.currentStep = n;

  for (let i = 1; i <= 5; i++) {
    const node = document.getElementById(`msn${i}`);
    const line = document.getElementById(`msl${i}`);
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
  document.getElementById(`mstep${n}`).classList.add('active');

  if (n === 2) mBuildMergeTags();
  if (n === 3) mBuildPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mValidateStep(n) {
  if (n === 1) {
    if (!document.getElementById('mCampaignName').value.trim()) { toast('Enter a campaign name', 'error'); return false; }
    if (!document.getElementById('mNameCol').value) { toast('Select the Name column', 'error'); return false; }
    if (!document.getElementById('mEmailCol').value) { toast('Select the Email column', 'error'); return false; }
    if (mailState.parsedRows.length === 0) { toast('Load your recipient data first', 'error'); return false; }
    return true;
  }
  if (n === 2) {
    if (!document.getElementById('mSubject').value.trim()) { toast('Enter an email subject', 'error'); return false; }
    if (!document.getElementById('mHtmlTemplate').value.trim()) { toast('Write an email template', 'error'); return false; }
    return true;
  }
  return true;
}

/* ── Source switching ────────────────────────────────────────────── */
function mSwitchSource(type) {
  mailState.sourceType = type;
  document.getElementById('mSourceSheets').style.display = type === 'sheets' ? 'block' : 'none';
  document.getElementById('mSourceCSV').style.display    = type === 'csv'    ? 'block' : 'none';
  document.getElementById('mTabSheets').className = 'source-tab' + (type === 'sheets' ? ' active' : '');
  document.getElementById('mTabCSV').className    = 'source-tab' + (type === 'csv'    ? ' active' : '');
}

/* ── Load Google Sheet ───────────────────────────────────────────── */
async function mLoadSheet() {
  const id = document.getElementById('mSheetId').value.trim();
  if (!id) { toast('Enter a Sheet ID', 'error'); return; }
  const btn = document.querySelector('#mSourceSheets .btn-primary');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = await apiFetch(`/api/sheets/read?sheetId=${encodeURIComponent(id)}&range=Sheet1`);
    if (!data || !data.data || data.data.length < 2) { toast('Sheet is empty or has no data rows', 'warning'); return; }
    mailState.headers    = data.data[0].map(h => h.toString().trim());
    const rows           = data.data.slice(1);
    mailState.parsedRows = rows.map(row => {
      const obj = {};
      mailState.headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });
    mShowSheetPreview();
    mPopulateDropdowns();
    toast(`Loaded ${mailState.parsedRows.length} recipients`, 'success');
  } catch (err) {
    toast('Failed to load Sheet: ' + err.message, 'error');
  } finally { btn.classList.remove('loading'); btn.disabled = false; }
}

function mShowSheetPreview() {
  const wrap  = document.getElementById('mSheetPreview');
  const rows  = mailState.parsedRows.slice(0, 4);
  let html = `<div class="notice notice-green" style="margin-bottom:10px;">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    <span>Sheet loaded — ${mailState.parsedRows.length} recipients, ${mailState.headers.length} columns</span>
  </div>
  <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
  <thead><tr>${mailState.headers.map(h => `<th style="padding:7px 10px;background:var(--surface-2);color:var(--text-3);text-align:left;font-size:11px;text-transform:uppercase;">${h}</th>`).join('')}</tr></thead>
  <tbody>`;
  rows.forEach(r => { html += `<tr style="border-top:1px solid var(--border);">${mailState.headers.map(h => `<td style="padding:7px 10px;color:var(--text-2);">${r[h] || ''}</td>`).join('')}</tr>`; });
  html += `</tbody></table></div>`;
  wrap.innerHTML = html;
  wrap.style.display = 'block';
}

function mPopulateDropdowns() {
  const opts = mailState.headers.map(h => `<option value="${h}">${h}</option>`).join('');
  document.getElementById('mNameCol').innerHTML  = `<option value="">Select...</option>${opts}`;
  document.getElementById('mEmailCol').innerHTML = `<option value="">Select...</option>${opts}`;

  const nameGuess  = mailState.headers.find(h => /name/i.test(h));
  const emailGuess = mailState.headers.find(h => /email|mail/i.test(h));
  if (nameGuess)  document.getElementById('mNameCol').value  = nameGuess;
  if (emailGuess) document.getElementById('mEmailCol').value = emailGuess;

  // Show chip list of extra columns
  document.getElementById('mColumnCard').style.display = 'block';
  const extraCols = mailState.headers.filter(h => h !== nameGuess && h !== emailGuess);
  document.getElementById('mMergeChips').innerHTML = extraCols.map(h =>
    `<div class="merge-chip" onclick="" title="Use {{${h.toLowerCase().replace(/\s+/g,'_')}}} in template">{{${h.toLowerCase().replace(/\s+/g,'_')}}}</div>`
  ).join('');
}

/* ── CSV/Excel upload ────────────────────────────────────────────── */
function mHandleFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => {
      mailState.headers = res.meta.fields;
      mailState.parsedRows = res.data;
      mShowFilePreview(file.name);
      mPopulateDropdowns();
    }});
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb  = XLSX.read(e.target.result, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json(ws, { defval: '' });
      mailState.headers    = Object.keys(arr[0] || {});
      mailState.parsedRows = arr;
      mShowFilePreview(file.name);
      mPopulateDropdowns();
    };
    reader.readAsArrayBuffer(file);
  } else { toast('Use .csv, .xlsx or .xls', 'error'); }
}

function mShowFilePreview(name) {
  const wrap = document.getElementById('mCSVPreview');
  wrap.innerHTML = `<div class="notice notice-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>${name} — ${mailState.parsedRows.length} recipients loaded</span></div>`;
  wrap.style.display = 'block';
}

/* ── Template Step ───────────────────────────────────────────────── */
function mBuildMergeTags() {
  const tags = mailState.headers.map(h => h.toLowerCase().replace(/\s+/g, '_'));
  document.getElementById('mAvailableTags').innerHTML = tags.map((t, i) => `
    <div class="merge-chip" onclick="mInsertTag('{{${t}}}')">{{${t}}}</div>
  `).join('');
  const user = getUser();
  if (user) document.getElementById('mPreviewFrom').textContent = user.email || 'your@gmail.com';
}

function mInsertTag(tag) {
  const ta = document.getElementById('mHtmlTemplate');
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + tag + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + tag.length;
  ta.focus();
  mRefreshPreview();
}

function mSetTab(tab) {
  const isEditor = tab === 'editor';
  document.getElementById('mEditorPanel').style.display  = isEditor ? 'block' : 'none';
  document.getElementById('mPreviewPanel').style.display = isEditor ? 'none' : 'block';
  document.getElementById('mTabEditor').className  = 'toolbar-btn' + (isEditor  ? ' active' : '');
  document.getElementById('mTabPreview').className = 'toolbar-btn' + (!isEditor ? ' active' : '');
  if (!isEditor) mRefreshPreview();
}

function mRefreshPreview() {
  const sample = mailState.parsedRows[0] || {};
  const html   = mPersonalize(document.getElementById('mHtmlTemplate').value, sample);
  const subj   = mPersonalize(document.getElementById('mSubject').value, sample);
  document.getElementById('mPreviewSubject').textContent = subj || '—';
  document.getElementById('mPreviewBody').innerHTML      = html;
}

document.addEventListener('input', (e) => {
  if (e.target && (e.target.id === 'mHtmlTemplate' || e.target.id === 'mSubject')) {
    mRefreshPreview();
  }
});

function mPersonalize(tmpl, data) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const colKey = mailState.headers.find(h => h.toLowerCase().replace(/\s+/g,'_') === key);
    return (colKey ? data[colKey] : data[key]) || `{{${key}}}`;
  });
}

function mLoadSampleTemplate() {
  const sample = mailState.headers.length ? mailState.headers[0] : 'Name';
  const nameTag = sample.toLowerCase().replace(/\s+/g,'_');
  document.getElementById('mHtmlTemplate').value = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px 36px;">
      <h1 style="color:#00d4ff;margin:0;font-size:22px;font-weight:700;">CertiFlow</h1>
    </div>
    <div style="padding:36px;">
      <p style="font-size:17px;color:#1e293b;margin-bottom:20px;">Dear <strong>{{${nameTag}}}</strong>,</p>
      <p style="color:#475569;line-height:1.7;margin-bottom:20px;">
        We are pleased to share your certificate with you. Thank you for your participation and dedication.
      </p>
      {{cert_link}}
      <p style="color:#94a3b8;font-size:13px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:20px;">
        This email was sent via CertiFlow. If you have any questions, please contact the organizers.
      </p>
    </div>
  </div>
</body>
</html>`;
  toast('Sample template loaded', 'success');
}

/* ── Preview Step ────────────────────────────────────────────────── */
function mBuildPreview() {
  mailState.previewIdx = 0;
  mRenderPreviewAt(0);

  // Summary
  const items = [
    { key: 'Campaign', val: document.getElementById('mCampaignName').value },
    { key: 'Total recipients', val: `${mailState.parsedRows.length}` },
    { key: 'Name column', val: document.getElementById('mNameCol').value },
    { key: 'Email column', val: document.getElementById('mEmailCol').value },
    { key: 'Subject', val: document.getElementById('mSubject').value.slice(0, 40) + '...' },
  ];
  document.getElementById('mSummaryList').innerHTML = items.map(i => `
    <div class="summary-item"><span class="summary-key">${i.key}</span><span class="summary-val">${i.val}</span></div>
  `).join('');

  // Recipient list
  document.getElementById('mRecipientList').innerHTML = mailState.parsedRows.slice(0, 40).map((r, i) => {
    const name  = r[document.getElementById('mNameCol').value]  || '—';
    const email = r[document.getElementById('mEmailCol').value] || '—';
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">
      <span style="color:var(--text-3);width:20px;text-align:right;font-size:11px;">${i+1}</span>
      <span style="flex:1;color:var(--text);">${name}</span>
      <span style="color:var(--text-2);font-size:12px;">${email}</span>
    </div>`;
  }).join('') + (mailState.parsedRows.length > 40 ? `<div style="padding:8px;text-align:center;font-size:12px;color:var(--text-3);">+${mailState.parsedRows.length - 40} more</div>` : '');
}

function mRenderPreviewAt(idx) {
  const row   = mailState.parsedRows[idx];
  if (!row) return;
  const subj  = mPersonalize(document.getElementById('mSubject').value, row);
  const body  = mPersonalize(document.getElementById('mHtmlTemplate').value, row);
  const email = row[document.getElementById('mEmailCol').value] || '?';
  const name  = row[document.getElementById('mNameCol').value]  || '?';

  document.getElementById('mFinalTo').textContent      = `${name} <${email}>`;
  document.getElementById('mFinalSubject').textContent = subj;
  document.getElementById('mFinalBody').innerHTML      = body;
  document.getElementById('mPreviewNav').textContent   = `${idx + 1} / ${mailState.parsedRows.length}`;
}

function mPreviewPrev() {
  if (mailState.previewIdx > 0) { mailState.previewIdx--; mRenderPreviewAt(mailState.previewIdx); }
}
function mPreviewNext() {
  if (mailState.previewIdx < mailState.parsedRows.length - 1) { mailState.previewIdx++; mRenderPreviewAt(mailState.previewIdx); }
}

/* ── Send ────────────────────────────────────────────────────────── */
async function mStartSend() {
  mGoToStep(4, true);
  const total = mailState.parsedRows.length;
  document.getElementById('mSendCounter').textContent = `0 / ${total}`;

  const nameCol  = document.getElementById('mNameCol').value;
  const emailCol = document.getElementById('mEmailCol').value;

  const recipients = mailState.parsedRows.map(row => {
    const obj = { email: row[emailCol], name: row[nameCol] };
    mailState.headers.forEach(h => { obj[h.toLowerCase().replace(/\s+/g,'_')] = row[h] || ''; });
    return obj;
  });

  mLog('info', `Sending ${total} emails...`);

  try {
    const res = await apiFetch('/api/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        recipients,
        subject: document.getElementById('mSubject').value,
        htmlTemplate: document.getElementById('mHtmlTemplate').value,
        campaignName: document.getElementById('mCampaignName').value,
      }),
    });

    mailState.results = res.results || [];
    const sent   = mailState.results.filter(r => r.status === 'sent').length;
    const failed = mailState.results.filter(r => r.status !== 'sent').length;

    mailState.results.forEach((r, i) => {
      setTimeout(() => {
        const n = i + 1;
        document.getElementById('mSendCounter').textContent = `${n} / ${total}`;
        document.getElementById('mSendProgress').style.width = `${Math.round(n/total*100)}%`;
        if (r.status === 'sent') {
          mLog('ok', `Sent to ${r.email}`);
        } else {
          mLog('err', `Failed: ${r.email} — ${r.error}`);
        }
      }, i * 60);
    });

    setTimeout(() => {
      mShowReport(sent, failed, total);
    }, mailState.results.length * 60 + 800);

  } catch (err) {
    mLog('err', 'Send failed: ' + err.message);
    toast('Send failed: ' + err.message, 'error');
  }
}

function mLog(type, msg) {
  const log = document.getElementById('mSendLog');
  const ts  = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el  = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-ts">${ts}</span> <span class="log-${type}">${msg}</span>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function mShowReport(sent, failed, total) {
  mGoToStep(5, true);
  document.getElementById('mResTotal').textContent  = total;
  document.getElementById('mResSent').textContent   = sent;
  document.getElementById('mResFailed').textContent = failed;
  document.getElementById('mResultTitle').textContent = failed === 0 ? 'All emails sent' : `${sent} sent, ${failed} failed`;
  document.getElementById('mResultSub').textContent  = `Campaign completed from your Gmail account.`;

  const rows = document.getElementById('mReportRows');
  rows.innerHTML = `<div class="send-result-row header"><div>Name</div><div>Email</div><div>Status</div></div>`;
  mailState.results.forEach(r => {
    rows.innerHTML += `<div class="send-result-row">
      <div style="color:var(--text);font-weight:500;">${r.name || '—'}</div>
      <div style="color:var(--text-2);">${r.email}</div>
      <div>${r.status === 'sent' ? '<span class="badge badge-green">Sent</span>' : `<span class="badge badge-red">Failed</span>`}</div>
    </div>`;
  });
  toast(`${sent} emails sent`, 'success', 5000);
}

function mDownloadReport() {
  downloadCSV(mailState.results.map(r => ({
    Name: r.name || '', Email: r.email, Status: r.status, Error: r.error || '',
  })), `certiflow-mail-report-${Date.now()}.csv`);
}

function mNewCampaign() {
  mailState.parsedRows = []; mailState.results = []; mailState.headers = [];
  document.getElementById('mCampaignName').value   = '';
  document.getElementById('mSheetId').value        = '';
  document.getElementById('mSubject').value        = '';
  document.getElementById('mHtmlTemplate').value   = '';
  document.getElementById('mSheetPreview').style.display = 'none';
  document.getElementById('mColumnCard').style.display   = 'none';
  mGoToStep(1, true);
}

/* ── Init ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarMount').outerHTML = renderSidebar('mail-tool.html');
  lucide.createIcons();
});
