// @ts-nocheck
/* ================================================================
   Honourix v2 — Bulk Mail Sender
   mail-tool.js
   ================================================================ */

const MS = {
  step: 1, totalSteps: 5,
  srcType: 'sheets',
  headers: [], rows: [], results: [],
  prevIdx: 0,
};

const MSTEPS = [
  { label: 'Recipients' },
  { label: 'Email Template' },
  { label: 'Preview' },
  { label: 'Sending' },
  { label: 'Report' },
];

/* ── Init ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarMount').outerHTML = renderSidebar('mail-tool.html');
  initSidebar();
  mBuildStepper();
  lucide.createIcons();

  // Drag-drop
  const zone = document.getElementById('mUploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); mHandleFile({ target: { files: e.dataTransfer.files } }); });
  }
});

/* ── Stepper ─────────────────────────────────────────────────── */
function mBuildStepper() {
  const el = document.getElementById('stepper');
  el.innerHTML = MSTEPS.map((s, i) => {
    const n = i + 1;
    return `${n > 1 ? `<div class="step-connector" id="msc${n}"></div>` : ''}
    <div class="step-node ${n === 1 ? 'active' : ''}" id="msn${n}">
      <div class="step-circle" id="mscircle${n}">${n}</div>
      <div class="step-label">
        <div class="step-num-label">Step ${n}</div>
        <div class="step-title">${s.label}</div>
      </div>
    </div>`;
  }).join('');
}

function mUpdateStepper() {
  MSTEPS.forEach((_, i) => {
    const n = i + 1;
    const node   = document.getElementById('msn' + n);
    const circle = document.getElementById('mscircle' + n);
    const conn   = document.getElementById('msc' + n);
    if (!node) return;
    node.className   = 'step-node ' + (n < MS.step ? 'done' : n === MS.step ? 'active' : '');
    circle.innerHTML = n < MS.step
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      : n;
    if (conn) conn.className = 'step-connector ' + (n <= MS.step ? 'done' : '');
  });
}

/* ── Navigation ─────────────────────────────────────────────────── */
function mGoStep(n, force) {
  if (!force && !mValidate(MS.step)) return;
  MS.step = n;
  mUpdateStepper();
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('sp' + n).classList.add('active');
  if (n === 2) mBuildMergeTags();
  if (n === 3) mBuildPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mValidate(n) {
  if (n === 1) {
    if (!document.getElementById('mCampName').value.trim())  { toast('Enter a campaign name', 'error');        return false; }
    if (!document.getElementById('mNameCol').value)          { toast('Select the Name column', 'error');       return false; }
    if (!document.getElementById('mEmailCol').value)         { toast('Select the Email column', 'error');      return false; }
    if (!MS.rows.length)                                     { toast('Load recipient data first', 'error');    return false; }
  }
  if (n === 2) {
    if (!document.getElementById('mSubject').value.trim())   { toast('Enter an email subject', 'error');       return false; }
    if (!document.getElementById('mHtmlTmpl').value.trim())  { toast('Write an email template', 'error');      return false; }
  }
  return true;
}

/* ── Data Source ─────────────────────────────────────────────────── */
function mSwitchSrc(type) {
  MS.srcType = type;
  document.getElementById('mSrcSheets').style.display  = type === 'sheets' ? 'block' : 'none';
  document.getElementById('mSrcFile').style.display    = type === 'file'   ? 'block' : 'none';
  document.getElementById('mSrcSheetsOpt').className   = 'source-opt' + (type === 'sheets' ? ' active' : '');
  document.getElementById('mSrcFileOpt').className     = 'source-opt' + (type === 'file'   ? ' active' : '');
}

async function mLoadSheet() {
  const id  = document.getElementById('mSheetId').value.trim();
  if (!id) { toast('Paste a Sheet ID first', 'error'); return; }
  const btn = document.getElementById('mLoadBtn');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = await apiFetch('/api/sheets/read?sheetId=' + encodeURIComponent(id) + '&range=Sheet1');
    if (!data || !data.data || data.data.length < 2) { toast('Sheet is empty', 'warning'); return; }
    MS.headers = data.data[0].map(h => h.toString().trim());
    MS.rows    = data.data.slice(1).map(row => Object.fromEntries(MS.headers.map((h, i) => [h, row[i] || ''])));
    mShowSheetPreview();
    mPopulateDropdowns();
    toast('Loaded ' + MS.rows.length + ' recipients', 'success');
  } catch (e) {
    toast('Failed: ' + e.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function mShowSheetPreview() {
  const el   = document.getElementById('mSheetResult');
  const rows = MS.rows.slice(0, 5);
  el.innerHTML =
    '<div class="notice notice-green" style="margin-bottom:12px">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<span>Sheet loaded — <strong>' + MS.rows.length + ' recipients</strong>, ' + MS.headers.length + ' columns</span>' +
    '</div>' +
    '<div class="data-table-wrap"><table>' +
      '<thead><tr>' + MS.headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead>' +
      '<tbody>' + rows.map(r => '<tr>' + MS.headers.map(h => '<td>' + (r[h] || '') + '</td>').join('') + '</tr>').join('') + '</tbody>' +
    '</table></div>' +
    (MS.rows.length > 5 ? '<div style="padding:10px 16px;font-size:13px;color:var(--text-3);text-align:center">+' + (MS.rows.length - 5) + ' more rows</div>' : '');
  el.style.display = 'block';
}

function mHandleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: r => {
        MS.headers = r.meta.fields;
        MS.rows    = r.data;
        mShowFileMsg(file.name);
        mPopulateDropdowns();
      }
    });
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = ev => {
      const wb  = XLSX.read(ev.target.result, { type: 'array' });
      const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      MS.headers = Object.keys(arr[0] || {});
      MS.rows    = arr;
      mShowFileMsg(file.name);
      mPopulateDropdowns();
    };
    reader.readAsArrayBuffer(file);
  } else {
    toast('Use .csv, .xlsx or .xls', 'error');
  }
}

function mShowFileMsg(name) {
  const el = document.getElementById('mFileResult');
  el.innerHTML =
    '<div class="notice notice-green">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<span><strong>' + name + '</strong> — ' + MS.rows.length + ' rows loaded</span>' +
    '</div>';
  el.style.display = 'block';
  toast('Loaded ' + MS.rows.length + ' recipients', 'success');
}

function mPopulateDropdowns() {
  const opts = MS.headers.map(h => '<option value="' + h + '">' + h + '</option>').join('');
  document.getElementById('mNameCol').innerHTML  = '<option value="">Select…</option>' + opts;
  document.getElementById('mEmailCol').innerHTML = '<option value="">Select…</option>' + opts;
  const ng = MS.headers.find(h => /name/i.test(h));
  const eg = MS.headers.find(h => /email|mail/i.test(h));
  if (ng) document.getElementById('mNameCol').value  = ng;
  if (eg) document.getElementById('mEmailCol').value = eg;
  document.getElementById('mColCard').style.display = 'block';
  document.getElementById('mAllTags').innerHTML = MS.headers.map(h => {
    const tag = h.toLowerCase().replace(/\s+/g, '_');
    return '<div class="merge-tag" onclick="mInsertTag(\'{{' + tag + '}}\')">{{' + tag + '}}</div>';
  }).join('');
}

/* ── Template Step ─────────────────────────────────────────────── */
function mBuildMergeTags() {
  const tags = MS.headers.map(h => h.toLowerCase().replace(/\s+/g, '_'));
  document.getElementById('mMergeTags').innerHTML = tags.map(t =>
    '<div class="merge-tag" onclick="mInsertTag(\'{{' + t + '}}\')">{{' + t + '}}</div>'
  ).join('');
  const user = getUser();
  if (user) document.getElementById('mPrvFrom').textContent = user.email || 'your@gmail.com';
  mRefreshPreview();
}

function mInsertTag(tag) {
  const ta = document.getElementById('mHtmlTmpl');
  const s  = ta.selectionStart;
  const e  = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + tag + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + tag.length;
  ta.focus();
  mRefreshPreview();
}

function mSetEditorTab(tab) {
  const isEditor = tab === 'editor';
  document.getElementById('mEditorPane').style.display  = isEditor ? 'block' : 'none';
  document.getElementById('mPreviewPane').style.display = isEditor ? 'none'  : 'block';
  document.getElementById('etEditor').className  = 'editor-tab' + (isEditor  ? ' active' : '');
  document.getElementById('etPreview').className = 'editor-tab' + (!isEditor ? ' active' : '');
  if (!isEditor) mRefreshPreview();
}

function mRefreshPreview() {
  const sample   = MS.rows[0] || {};
  const nameCol  = document.getElementById('mNameCol')  ? document.getElementById('mNameCol').value  : '';
  const emailCol = document.getElementById('mEmailCol') ? document.getElementById('mEmailCol').value : '';
  const subj     = mPersonalise(document.getElementById('mSubject').value,   sample);
  const body     = mPersonalise(document.getElementById('mHtmlTmpl').value,  sample);

  const emailEl = document.getElementById('mPrvTo');
  if (emailEl && nameCol) {
    const nm = sample[nameCol]  || 'First Recipient';
    const em = sample[emailCol] || '...';
    emailEl.textContent = nm + ' <' + em + '>';
  }

  const sEl = document.getElementById('mPrvSubject');
  const bEl = document.getElementById('mPrvBody');
  if (sEl) sEl.textContent = subj || '—';
  if (bEl) bEl.innerHTML   = body;
}

document.addEventListener('input', e => {
  if (e.target && (e.target.id === 'mHtmlTmpl' || e.target.id === 'mSubject')) mRefreshPreview();
});

function mPersonalise(tmpl, data) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, function(_, key) {
    const col = MS.headers.find(h => h.toLowerCase().replace(/\s+/g, '_') === key);
    return col ? (data[col] || '') : (data[key] || '{{' + key + '}}');
  });
}

function mLoadSample() {
  const nameTag = (MS.headers.find(h => /name/i.test(h)) || 'Name').toLowerCase().replace(/\s+/g, '_');
  document.getElementById('mHtmlTmpl').value = '<!DOCTYPE html>\n' +
'<html>\n' +
'<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>\n' +
'<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">\n' +
'  <div style="max-width:580px;margin:40px auto">\n' +
'    <div style="background:linear-gradient(135deg,#050a15,#0d1728);padding:36px 40px;border-radius:16px 16px 0 0;text-align:center">\n' +
'      <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(0,212,255,0.7);text-transform:uppercase;margin-bottom:10px">Honourix</div>\n' +
'      <h1 style="color:#e8f0fd;font-size:24px;font-weight:700;margin:0;letter-spacing:-0.5px">Your Certificate is Ready</h1>\n' +
'    </div>\n' +
'    <div style="background:#ffffff;padding:40px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">\n' +
'      <p style="font-size:17px;color:#1e293b;margin-bottom:20px;font-weight:500">Dear <strong>{{' + nameTag + '}}</strong>,</p>\n' +
'      <p style="color:#475569;line-height:1.75;font-size:15px;margin-bottom:24px">Congratulations on completing your course. We are delighted to share your personalised certificate with you.</p>\n' +
'      <div style="text-align:center;margin:32px 0">\n' +
'        <a href="{{cert_link}}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">Download Certificate</a>\n' +
'      </div>\n' +
'      <p style="color:#94a3b8;font-size:13px;margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;text-align:center;line-height:1.6">This email was sent via Honourix.<br/>If you have questions, contact the organiser directly.</p>\n' +
'    </div>\n' +
'  </div>\n' +
'</body>\n' +
'</html>';
  toast('Sample template loaded', 'success');
  mRefreshPreview();
}

/* ── Preview Step ─────────────────────────────────────────────── */
function mBuildPreview() {
  MS.prevIdx = 0;
  mRenderAt(0);

  const name  = document.getElementById('mNameCol').value;
  const email = document.getElementById('mEmailCol').value;
  const n     = MS.rows.length;
  const camp  = document.getElementById('mCampName').value;

  document.getElementById('mSendCountLabel').textContent = '(' + n + ')';

  document.getElementById('mSummaryGrid').innerHTML = [
    { k: 'Campaign',          v: camp },
    { k: 'Total Recipients',  v: '' + n },
    { k: 'Name Column',       v: name },
    { k: 'Email Column',      v: email },
    { k: 'Subject',           v: document.getElementById('mSubject').value.slice(0, 42) + '…' },
    { k: 'Merge Tags Used',   v: [...new Set((document.getElementById('mHtmlTmpl').value.match(/\{\{(\w+)\}\}/g) || []))].join(', ') || '—' },
  ].map(i =>
    '<div class="summary-item"><div class="summary-key">' + i.k + '</div><div class="summary-val">' + i.v + '</div></div>'
  ).join('');

  document.getElementById('mRecipientList').innerHTML = MS.rows.slice(0, 50).map((r, i) =>
    '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--glass-border)">' +
      '<span style="color:var(--text-3);width:22px;font-size:12px;text-align:right;flex-shrink:0">' + (i + 1) + '</span>' +
      '<span style="flex:1;font-size:14px;color:var(--text);font-weight:500">' + (r[name] || '—') + '</span>' +
      '<span style="font-size:12.5px;color:var(--text-2)">' + (r[email] || '—') + '</span>' +
    '</div>'
  ).join('') + (MS.rows.length > 50 ? '<div style="padding:8px 0;text-align:center;font-size:12.5px;color:var(--text-3)">+' + (MS.rows.length - 50) + ' more</div>' : '');

  document.getElementById('mJobInfo').innerHTML = [
    { k: 'Campaign', v: camp },
    { k: 'Recipients', v: '' + n },
  ].map(i =>
    '<div class="summary-item"><div class="summary-key">' + i.k + '</div><div class="summary-val">' + i.v + '</div></div>'
  ).join('');
}

function mRenderAt(idx) {
  const row = MS.rows[idx];
  if (!row) return;
  const name  = document.getElementById('mNameCol').value;
  const email = document.getElementById('mEmailCol').value;
  const subj  = mPersonalise(document.getElementById('mSubject').value,  row);
  const body  = mPersonalise(document.getElementById('mHtmlTmpl').value, row);
  document.getElementById('mFinalTo').textContent      = (row[name] || '?') + ' <' + (row[email] || '?') + '>';
  document.getElementById('mFinalSubject').textContent = subj;
  document.getElementById('mFinalBody').innerHTML      = body;
  document.getElementById('mPrvNav').textContent       = (idx + 1) + ' / ' + MS.rows.length;
}

function mNavPrev() { if (MS.prevIdx > 0)                     { MS.prevIdx--; mRenderAt(MS.prevIdx); } }
function mNavNext() { if (MS.prevIdx < MS.rows.length - 1)    { MS.prevIdx++; mRenderAt(MS.prevIdx); } }

/* ── Send ─────────────────────────────────────────────────────── */
async function mStartSend() {
  mGoStep(4, true);
  const total  = MS.rows.length;
  const nameC  = document.getElementById('mNameCol').value;
  const emailC = document.getElementById('mEmailCol').value;
  const subj   = document.getElementById('mSubject').value;
  const tmpl   = document.getElementById('mHtmlTmpl').value;
  const camp   = document.getElementById('mCampName').value;

  document.getElementById('mSendCounter').textContent = '0 / ' + total;
  mLog('info', 'Starting campaign: ' + camp + ' — ' + total + ' recipients');

  const recipients = MS.rows.map(r => {
    const obj = { name: r[nameC] || '', email: r[emailC] || '' };
    MS.headers.forEach(h => { obj[h.toLowerCase().replace(/\s+/g, '_')] = r[h] || ''; });
    return obj;
  });

  try {
    const res = await apiFetch('/api/mail/send', {
      method: 'POST',
      body: JSON.stringify({ recipients, subject: subj, htmlTemplate: tmpl, campaignName: camp }),
    });
    MS.results = res.results || [];
    MS.results.forEach((r, i) => {
      setTimeout(() => {
        const done = i + 1;
        const pct  = Math.round(done / total * 100);
        document.getElementById('mSendCounter').textContent  = done + ' / ' + total;
        document.getElementById('mSendBar').style.width      = pct + '%';
        document.getElementById('mSendPct').textContent      = pct + '%';
        document.getElementById('mSendStatus').textContent   = 'Sending… ' + pct + '% complete';
        if (r.status === 'sent') {
          mLog('ok', 'Sent → ' + r.email);
        } else {
          mLog('err', 'Failed → ' + r.email + ': ' + r.error);
        }
        if (done === total) setTimeout(mShowReport, 800);
      }, i * 60);
    });
  } catch (e) {
    mLog('err', 'Send failed: ' + e.message);
    toast('Send failed: ' + e.message, 'error');
  }
}

function mLog(type, msg) {
  const win = document.getElementById('mSendLog');
  const ts  = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el  = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = '<span class="log-ts">' + ts + '</span><span class="log-' + type + '">' + msg + '</span>';
  win.appendChild(el);
  win.scrollTop = win.scrollHeight;
}

/* ── Report ─────────────────────────────────────────────────── */
function mShowReport() {
  mGoStep(5, true);
  const sent   = MS.results.filter(r => r.status === 'sent').length;
  const failed = MS.results.filter(r => r.status !== 'sent').length;

  document.getElementById('mResTotal').textContent    = MS.results.length;
  document.getElementById('mResSent').textContent     = sent;
  document.getElementById('mResFailed').textContent   = failed;
  document.getElementById('mResultTitle').textContent = failed === 0 ? 'All emails sent!' : sent + ' sent, ' + failed + ' failed';
  document.getElementById('mResultSub').textContent   = 'Campaign dispatched from your Gmail account.';

  if (failed > 0) {
    document.getElementById('mCompRing').style.background = 'linear-gradient(135deg,#f59e0b,#ef4444)';
    document.getElementById('mCompRing').style.boxShadow  = '0 0 40px rgba(245,158,11,0.3)';
  }

  document.getElementById('mReportRows').innerHTML = MS.results.map(r =>
    '<div class="report-row">' +
      '<div style="font-weight:600;color:var(--text);font-size:14px">'   + (r.name  || '—') + '</div>' +
      '<div style="color:var(--text-2);font-size:14px">'                 +  r.email          + '</div>' +
      '<div>' + (r.status === 'sent'
        ? '<span class="badge badge-green">Sent</span>'
        : '<span class="badge badge-red">Failed</span>') + '</div>' +
    '</div>'
  ).join('');

  toast(sent + ' emails delivered', 'success', 5000);
  saveCampaign('mail', document.getElementById('mCampName').value, MS.results.length, sent, null);
}

function mDownloadReport() {
  downloadCSV(
    MS.results.map(r => ({ Name: r.name || '', Email: r.email, Status: r.status, Error: r.error || '' })),
    'Honourix-mail-report-' + Date.now() + '.csv'
  );
}

function mNewCampaign() {
  MS.rows = []; MS.results = []; MS.headers = []; MS.prevIdx = 0;
  ['mCampName', 'mSheetId', 'mSubject', 'mHtmlTmpl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['mSheetResult', 'mFileResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('mColCard').style.display = 'none';
  mGoStep(1, true);
}