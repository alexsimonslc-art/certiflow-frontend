// @ts-nocheck
/* ================================================================
   Honourix v2 — Bulk Mail Sender
   mail-tool.js
================================================================ */

/* ── Mail State ──────────────────────────────────────────────── */
const MS = {
  step: 1, totalSteps: 5,
  srcType: 'sheets',
  headers: [], rows: [], results: [],
  prevIdx: 0,
};
let mManualCols = ['Email', 'Name'];
let mManualRows = [{ Email: '', Name: '' }];
const M_LOCKED_COLS = ['Email']; // Email is always first & non-deletable
// Quota — populated by mFetchQuota()
window.mailQuotaRemaining = 9999;             // safe fallback until loaded
const MSTEPS = [
  { label: 'Recipients' },
  { label: 'Email Template' },
  { label: 'Review & Send' },
  { label: 'Sending' },
  { label: 'Report' },
];

/* ── Editor State ────────────────────────────────────────────── */
const ME = {
  blocks: [],
  selectedId: null,
  nextId: 1,
  activeTab: 'visual',
  cm: null,                 // CodeMirror instance
  cmDebounce: null,
  previewDevice: 'desktop',
  initialized: false,
};

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sidebarMount').outerHTML = renderSidebar('mail-tool.html');
  initSidebar();
  mBuildStepper();
  meBuildTemplatePicker();
  lucide.createIcons();
  if (document.getElementById('mManualHeaderRow')) mManualRenderTable();
  // Drag-drop on upload zone
  // Fetch quota on load
  mFetchQuota();

  const zone = document.getElementById('mUploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      mHandleFile({ target: { files: e.dataTransfer.files } });
    });
  }
});

/* ══════════════════════════════════════════════════════════════
   STEPPER
══════════════════════════════════════════════════════════════ */

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
    const node = document.getElementById('msn' + n);
    const circle = document.getElementById('mscircle' + n);
    const conn = document.getElementById('msc' + n);
    if (!node) return;
    node.className = 'step-node ' + (n < MS.step ? 'done' : n === MS.step ? 'active' : '');
    circle.innerHTML = n < MS.step
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      : String(n);
    if (conn) conn.className = 'step-connector ' + (n <= MS.step ? 'done' : '');
  });
}

/* ══════════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════ */
function mGoStep(n, force) {
  if (!force && !mValidate(MS.step)) return;
  // On leaving step 2, ensure textarea is synced
  if (MS.step === 2) meSyncTextarea();
  MS.step = n;
  mUpdateStepper();
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('sp' + n).classList.add('active');
  if (n === 2) meOnStepEnter();
  if (n === 3) mBuildPreview();

  // Manage AI Fab Visibility globally: only visible in step 2 if editor is open
  const fab = document.getElementById('galAiFab');
  if (fab) {
    if (n === 2 && document.getElementById('meEditorWrap').classList.contains('visible')) {
      fab.classList.add('visible');
    } else {
      fab.classList.remove('visible');
      const panel = document.getElementById('galAiPanel');
      if (panel && panel.classList.contains('open')) {
        window.galAiToggle(); // Close panel automatically
      }
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mValidate(n) {
  if (n === 1) {
    if (!document.getElementById('mCampName').value.trim()) { toast('Enter a campaign name', 'error'); return false; }
    if (!document.getElementById('mNameCol').value) { toast('Select the Name column', 'error'); return false; }
    if (!document.getElementById('mEmailCol').value) { toast('Select the Email column', 'error'); return false; }
    if (!MS.rows.length) { toast('Load recipient data first', 'error'); return false; }
  }
  if (n === 2) {
    if (!document.getElementById('mSubject').value.trim()) { toast('Enter an email subject', 'error'); return false; }
    meSyncTextarea();
    if (!document.getElementById('mHtmlTmpl').value.trim()) { toast('Design your email template first', 'error'); return false; }
  }
  return true;
}
function mSwitchSrc(type) {
  MS.srcType = type;
  document.querySelectorAll('.src-tab').forEach(t => t.classList.toggle('active', t.dataset.src === type));
  document.querySelectorAll('.src-panel').forEach(p => p.style.display = p.id === 'mSrc_' + type ? 'block' : 'none');
}
/* ══════════════════════════════════════════════════════════════
   DATA SOURCE — Step 1
══════════════════════════════════════════════════════════════ */
// PREMIUM CERT-TOOL DATA PREVIEW RENDERING LOGIC
function mRenderPremiumTable(elementId, noticeHtml) {
  const el = document.getElementById(elementId);
  if (!el || !MS.rows.length) return;

  // Build Sticky Header
  let thead = MS.headers.map(h => `<th style="padding:12px 16px; font-size:12px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:0.5px; text-align:left; white-space:nowrap; border-bottom:1px solid var(--glass-border); position:sticky; top:0; background:var(--surface); z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">${h}</th>`).join('');

  // Build Rows with Hover Effect
  let tbody = MS.rows.map(r => `<tr style="border-bottom:1px solid rgba(255,255,255,0.04); transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">` +
    MS.headers.map(h => `<td style="padding:10px 16px; font-size:13.5px; color:var(--text); white-space:nowrap;">${(r[h] || '').toString().replace(/</g, '&lt;')}</td>`).join('') +
    `</tr>`).join('');

  // Inject the Glassmorphic Container
  el.innerHTML = `
    <div class="notice notice-green" style="margin-bottom:0; display:flex; align-items:center; gap:10px; padding:12px 16px; border-radius:10px; background:rgba(16, 185, 129, 0.1); border:1px solid rgba(16, 185, 129, 0.2); color:var(--green);">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${noticeHtml}</span>
    </div>
    <div style="width:100%; box-sizing:border-box; overflow:auto; max-height:300px; border:1px solid var(--glass-border); border-radius:10px; margin-top:16px; scrollbar-width:thin; scrollbar-color:var(--glass-border-2) transparent; background:var(--surface); box-shadow:0 4px 16px rgba(0,0,0,0.1);">
      <table style="width:100%; min-width:max-content; border-collapse:collapse;">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
  el.style.display = 'block';
}
async function mLoadSheet() {
  const id = document.getElementById('mSheetId').value.trim();
  if (!id) { toast('Paste a Sheet ID first', 'error'); return; }
  const btn = document.getElementById('mLoadBtn');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = await apiFetch('/api/sheets/read?sheetId=' + encodeURIComponent(id) + '&range=Sheet1');
    if (!data || !data.data || data.data.length < 2) { toast('Sheet is empty', 'warn'); return; }
    MS.headers = data.data[0].map(h => h.toString().trim());
    MS.rows = data.data.slice(1).map(row => Object.fromEntries(MS.headers.map((h, i) => [h, row[i] || ''])));
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
  const el = document.getElementById('mSheetResult');
  el.innerHTML = `
    <div class="notice notice-green" style="margin-bottom:16px;padding:14px 18px;border-radius:10px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><polyline points="20 6 9 17 4 12"/></svg>
      <span style="font-size:14px">Sheet loaded — <strong>${MS.rows.length} recipients</strong>, ${MS.headers.length} columns detected</span>
    </div>
    <div style="width:100%;box-sizing:border-box;overflow:auto;max-height:280px;border:1px solid var(--glass-border);border-radius:10px;background:var(--surface);scrollbar-width:thin;scrollbar-color:var(--glass-border-2) transparent">
      <table style="width:max-content;min-width:100%;border-collapse:collapse;text-align:left">
        <thead>
          <tr style="position:sticky;top:0;z-index:10;background:var(--surface);box-shadow:0 1px 0 var(--glass-border)">
            ${MS.headers.map(h => `<th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${MS.rows.map(r => `<tr style="border-top:1px solid rgba(255,255,255,0.03);transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            ${MS.headers.map(h => `<td style="padding:10px 16px;font-size:13.5px;color:var(--text);white-space:nowrap">${(r[h] || '').toString().replace(/</g, '&lt;')}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  el.style.display = 'block';
}
function mHandleFile(e) {
  const file = e.target.files[0] || (e.dataTransfer && e.dataTransfer.files[0]);
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    Papa.parse(file, {
      header: true, skipEmptyLines: true, complete: r => {
        MS.headers = r.meta.fields;
        MS.rows = r.data;
        mShowFileMsg(file.name);
        mPopulateDropdowns();
      }
    });
  } else if (['xlsx', 'xls'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = e2 => {
      const wb = XLSX.read(e2.target.result, { type: 'array' });
      const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      MS.headers = Object.keys(arr[0] || {});
      MS.rows = arr;
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
  el.innerHTML = `
    <div class="notice notice-green" style="margin-bottom:16px;padding:14px 18px;border-radius:10px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><polyline points="20 6 9 17 4 12"/></svg>
      <span style="font-size:14px"><strong>${name}</strong> — ${MS.rows.length} recipients loaded</span>
    </div>
    <div style="width:100%;box-sizing:border-box;overflow:auto;max-height:280px;border:1px solid var(--glass-border);border-radius:10px;background:var(--surface);scrollbar-width:thin;scrollbar-color:var(--glass-border-2) transparent">
      <table style="width:max-content;min-width:100%;border-collapse:collapse;text-align:left">
        <thead>
          <tr style="position:sticky;top:0;z-index:10;background:var(--surface);box-shadow:0 1px 0 var(--glass-border)">
            ${MS.headers.map(h => `<th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${MS.rows.map(r => `<tr style="border-top:1px solid rgba(255,255,255,0.03);transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            ${MS.headers.map(h => `<td style="padding:10px 16px;font-size:13.5px;color:var(--text);white-space:nowrap">${(r[h] || '').toString().replace(/</g, '&lt;')}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  el.style.display = 'block';
  toast('Loaded ' + MS.rows.length + ' recipients', 'success');
}
function mPopulateDropdowns() {
  const opts = MS.headers.map(h => '<option value="' + h + '">' + h + '</option>').join('');
  document.getElementById('mNameCol').innerHTML = '<option value="">Select…</option>' + opts;
  document.getElementById('mEmailCol').innerHTML = '<option value="">Select…</option>' + opts;
  const ng = MS.headers.find(h => /name/i.test(h));
  const eg = MS.headers.find(h => /email|mail/i.test(h));
  if (ng) document.getElementById('mNameCol').value = ng;
  if (eg) document.getElementById('mEmailCol').value = eg;
  document.getElementById('mColCard').style.display = 'block';
  document.getElementById('mAllTags').innerHTML = MS.headers.map(h => {
    const tag = '{{' + h.toLowerCase().replace(/\s+/g, '_') + '}}';
    return '<div class="merge-tag" onclick="meInsertTag(\'' + tag + '\')">' + tag + '</div>';
  }).join('');
}
/* ══════════════════════════════════════════════════════════════
   QUOTA — fetch & render widget
══════════════════════════════════════════════════════════════ */
async function mFetchQuota() {
  try {
    const data = await apiFetch('/api/quota');
    const sentToday = data.sentToday || 0;
    const limit = data.limit || (data.isWorkspace ? 1500 : 100);
    const isWorkspace = data.isWorkspace || false;
    const email = data.email || '';
    const totalSent = data.totalSent || sentToday;

    window.mailQuotaRemaining = Math.max(0, limit - sentToday);

    const pct = Math.min(100, sentToday === 0 ? 0 : Math.round((sentToday / limit) * 100));

    // Badge
    const badge = document.getElementById('mQuotaBadge');
    if (badge) {
      badge.textContent = isWorkspace ? 'WORKSPACE' : 'STANDARD';
      badge.style.background = isWorkspace ? 'rgba(124,58,237,0.15)' : 'rgba(0,212,255,0.12)';
      badge.style.color = isWorkspace ? 'var(--purple-2,#a78bfa)' : 'var(--cyan)';
    }

    // Account dot + label
    const dot = document.getElementById('mAcctDot');
    const lbl = document.getElementById('mAcctLabel');
    if (dot) dot.style.background = isWorkspace ? '#7c3aed' : '#00d4ff';
    if (lbl) lbl.textContent = isWorkspace
      ? `Workspace · ${email}`
      : `Standard Gmail · ${email}`;

    // Counter
    const counter = document.getElementById('mQuotaCounter');
    if (counter) counter.textContent = sentToday + ' / ' + limit;

    // Progress bar colour
    const bar = document.getElementById('mQuotaBar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = pct >= 90
        ? 'linear-gradient(90deg,#f43f5e,#ef4444)'
        : pct >= 70
          ? 'linear-gradient(90deg,#f59e0b,#f97316)'
          : 'linear-gradient(90deg,#00d4ff,#7c3aed)';
    }

    // Sub labels
    const sentEl = document.getElementById('mQuotaSent');
    const leftEl = document.getElementById('mQuotaLeft');
    if (sentEl) sentEl.textContent = sentToday + ' sent today';
    if (leftEl) leftEl.textContent = window.mailQuotaRemaining + ' remaining';

    // Micro stats
    const lifeEl = document.getElementById('mQuotaLifetime');
    const limitEl = document.getElementById('mQuotaLimitDisplay');
    if (lifeEl) lifeEl.textContent = totalSent.toLocaleString();
    if (limitEl) limitEl.textContent = limit.toLocaleString();

  } catch (e) {
    const counter = document.getElementById('mQuotaCounter');
    const lbl = document.getElementById('mAcctLabel');
    if (counter) counter.textContent = 'Unavailable';
    if (lbl) lbl.textContent = 'Could not load quota';
    console.warn('Quota fetch failed:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════════
   PERSONALISE HELPER
══════════════════════════════════════════════════════════════ */
function mPersonalise(tmpl, data) {
  return (tmpl || '').replace(/\{\{(\w+)\}\}/g, function (_, key) {
    const col = MS.headers.find(h => h.toLowerCase().replace(/\s+/g, '_') === key);
    return col ? (data[col] || '') : (data[key] || '{{' + key + '}}');
  });
}

/* ══════════════════════════════════════════════════════════════
   BLOCK DEFINITIONS
══════════════════════════════════════════════════════════════ */
const ME_DEFS = {
  logo: {
    label: 'Logo / Banner',
    defaults: () => ({ text: 'HONOURIX', tagline: '', bgColor: '#0d1728', color: '#00d4ff', fontSize: 22, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 }),
  },
  header: {
    label: 'Heading',
    defaults: () => ({ text: 'Your Email Heading', fontSize: 28, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 32, paddingH: 40 }),
  },
  text: {
    label: 'Text',
    defaults: () => ({ text: 'Write your message here. Use {{name}} to personalize each email for your recipients.', fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 14, paddingH: 40, lineHeight: 1.75 }),
  },
  button: {
    label: 'Button',
    defaults: () => ({ text: 'Click Here', link: '{{certificateLink}}', btnBg: 'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 24, paddingH: 40, borderRadius: 10, fontSize: 15, fontWeight: 700 }),
  },
  image: {
    label: 'Image',
    defaults: () => ({ src: '', alt: 'Image', width: 100, bgColor: '#f8fafc', paddingV: 20, paddingH: 40, borderRadius: 8 }),
  },
  divider: {
    label: 'Divider',
    defaults: () => ({ color: '#e2e8f0', bgColor: '#ffffff', paddingV: 12, thickness: 1 }),
  },
  spacer: {
    label: 'Spacer',
    defaults: () => ({ height: 40, bgColor: '#ffffff' }),
  },
  footer: {
    label: 'Footer',
    defaults: () => ({ text: 'This email was sent via Honourix. If you have questions, contact the organiser directly.', bgColor: '#f8fafc', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 }),
  },
  social: {
    label: 'Social Links',
    defaults: () => ({
      platforms: [
        { name: 'LinkedIn', url: '', icon: 'linkedin' },
        { name: 'Twitter/X', url: '', icon: 'x' },
        { name: 'Instagram', url: '', icon: 'instagram' },
      ],
      bgColor: '#ffffff',
      align: 'center',
      paddingV: 20,
      paddingH: 40,
      iconSize: 32,
      style: 'plain',
      color: '#475569',
    }),
  },
  table: {
    label: 'Table',
    defaults: () => ({
      rows: 3, cols: 3,
      data: [['Header 1', 'Header 2', 'Header 3'], ['Cell', 'Cell', 'Cell'], ['Cell', 'Cell', 'Cell']],
      headerRow: true,
      borderWidth: 1,
      borderColor: '#e2e8f0',
      headerBg: '#f1f5f9',
      headerColor: '#1e293b',
      cellBg: '#ffffff',
      cellColor: '#475569',
      cellPadding: 10,
      fontSize: 14,
      bgColor: '#ffffff',
      paddingV: 20,
      paddingH: 40,
      width: '100%',
    }),
  },
};

/* ══════════════════════════════════════════════════════════════
   BLOCK → EMAIL HTML
══════════════════════════════════════════════════════════════ */
function meBlockToHtml(block) {
  const p = block.props;
  const fontStack = "'Montserrat','Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

  switch (block.type) {
    case 'logo':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}">
  <div style="font-size:${p.fontSize}px;font-weight:${p.fontWeight};color:${p.color};letter-spacing:3px;font-family:${fontStack}">${p.text}</div>
  ${p.tagline ? `<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:1px;font-family:${fontStack}">${p.tagline}</div>` : ''}
</div>`;

    case 'header':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor}">
  <h1 style="margin:0;font-size:${p.fontSize}px;font-weight:${p.fontWeight || 700};color:${p.color};line-height:1.2;text-align:${p.align};font-family:${fontStack};font-style:${p.fontStyle || 'normal'}">${p.text}</h1>
</div>`;

    case 'text':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor}">
  <p style="margin:0;font-size:${p.fontSize}px;color:${p.color};line-height:${p.lineHeight};text-align:${p.align};font-family:${fontStack};font-weight:${p.fontWeight || 400};font-style:${p.fontStyle || 'normal'}">${p.text.replace(/\n/g, '<br/>')}</p>
</div>`;

    case 'button':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}">
  <a class="me-btn-block" href="${p.link}" style="display:inline-block;padding:14px 38px;background:${p.btnBg};color:${p.btnColor};text-decoration:none;border-radius:${p.borderRadius}px;font-weight:${p.fontWeight};font-size:${p.fontSize}px;font-family:${fontStack}">${p.text}</a>
</div>`;

    case 'image':
      if (p.src) {
        return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:center">
  <img src="${p.src}" alt="${p.alt}" style="width:${p.width}%;max-width:100%;height:auto;border-radius:${p.borderRadius}px;display:block;margin:0 auto"/>
</div>`;
      }
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:center">
  <div style="width:100%;height:160px;background:#e2e8f0;border-radius:${p.borderRadius}px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px;font-family:${fontStack}">[Image — add a URL in the properties panel]</div>
</div>`;

    case 'divider':
      return `<div style="padding:${p.paddingV}px 40px;background:${p.bgColor}">
  <div style="height:${p.thickness}px;background:${p.color}"></div>
</div>`;

    case 'spacer':
      return `<div style="height:${p.height}px;background:${p.bgColor};font-size:0;line-height:0">&nbsp;</div>`;

    case 'footer':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}">
  <p style="margin:0;font-size:${p.fontSize}px;color:${p.color};line-height:1.6;font-family:${fontStack}">${p.text.replace(/\n/g, '<br/>')}</p>
</div>`;
    case 'social': {
      const iconBase = 'https://cdn.simpleicons.org/';
      const knownIcons = {
        linkedin: 'linkedin', 'twitter/x': 'x', twitter: 'x', instagram: 'instagram',
        facebook: 'facebook', youtube: 'youtube', tiktok: 'tiktok', pinterest: 'pinterest',
        github: 'github', whatsapp: 'whatsapp', telegram: 'telegram', discord: 'discord',
        snapchat: 'snapchat', website: '',
      };
      const size = p.iconSize || 32;
      const pad = p.style === 'plain' ? 0 : Math.round(size * 0.25);
      const br = p.style === 'circle' ? '50%' : p.style === 'square' ? '8px' : '0';
      const bgBadge = p.style !== 'plain' ? `background:rgba(0,0,0,0.08);` : '';

      const icons = (p.platforms || []).filter(pl => pl.url).map(pl => {
        const slug = knownIcons[(pl.name || '').toLowerCase()] || (pl.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const imgHtml = slug
          ? `<img src="${iconBase}${slug}" width="${size}" height="${size}" alt="${pl.name}" style="display:block;width:${size}px;height:${size}px"/>`
          : `<span style="font-size:${size * 0.5}px;line-height:${size}px;color:${p.color}">${pl.name.slice(0, 2).toUpperCase()}</span>`;
        return `<a href="${pl.url}" style="display:inline-block;margin:0 ${Math.round(size * 0.2)}px;text-decoration:none;${bgBadge}padding:${pad}px;border-radius:${br};vertical-align:middle">${imgHtml}</a>`;
      }).join('');

      return icons
        ? `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}">${icons}</div>`
        : `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:center;color:#94a3b8;font-size:13px">Add social links in properties →</div>`;
    }

    case 'table': {
      const d   = p.data || [[]];
      const bw  = p.borderWidth !== undefined ? p.borderWidth : 1;
      const bst = bw > 0 ? `${bw}px solid ${p.borderColor || '#e2e8f0'}` : 'none';
      
      // Strict fallbacks to prevent "undefined" CSS crashes
      const cBg = p.cellBg || '#ffffff';
      const cColor = p.cellColor || '#475569';
      const hBg = p.headerBg || '#f1f5f9';
      const hColor = p.headerColor || '#1e293b';
      const fSize = p.fontSize || 14;
      const pad = p.cellPadding !== undefined ? p.cellPadding : 10;
      
      const rows = d.map((row, ri) => {
        const isHeader = p.headerRow && ri === 0;
        const cells = row.map(cell =>
          isHeader
            ? `<th style="padding:${pad}px;background:${hBg};color:${hColor};font-family:${fontStack};font-weight:700;font-size:${fSize}px;border:${bst};text-align:left">${cell}</th>`
            : `<td style="padding:${pad}px;background:${cBg};color:${cColor};font-family:${fontStack};font-size:${fSize}px;border:${bst}">${cell}</td>`
        ).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      
      return `<div style="padding:${p.paddingV !== undefined ? p.paddingV : 20}px ${p.paddingH !== undefined ? p.paddingH : 40}px;background:${p.bgColor || '#ffffff'}">
        <table width="${p.width || '100%'}" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:${p.width || '100%'};border:${bst}">
          ${rows}
        </table>
      </div>`;
    }
    case 'raw':
      return p.html || '';

    default:
      return '';
  }
}

/* ── Generate full email HTML from blocks ─────────────────── */
function meGetHtml() {
  if (!ME.blocks.length) return '';
  const outerBg = '#f1f5f9';
  const inner = ME.blocks.map(b => meBlockToHtml(b)).join('\n');
  const brandingBar = `<div style="padding:12px 24px;background:#f1f5f9;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif">
      Sent via <a href="https://honourix.com" style="color:#64748b;text-decoration:none;font-weight:600">Honourix</a>
      &nbsp;·&nbsp; <span style="letter-spacing:0.5px">Trusted Certificate &amp; Mail Platform</span>
    </p>
  </div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>Email</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,700;1,400;1,700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Dancing+Script:wght@400;700&family=Cinzel:wght@400;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,700;1,400&family=Raleway:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:${outerBg};font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${outerBg}">
<tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
<tr><td>
${inner}
${brandingBar}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ══════════════════════════════════════════════════════════════
   EDITOR INIT
══════════════════════════════════════════════════════════════ */
function meOnStepEnter() {
  // Build merge tags row from loaded headers
  meBuildMergeTagsRow();

  if (ME.initialized) {
    // Refresh CM if already initialized
    if (ME.cm) ME.cm.refresh();
    return;
  }
  ME.initialized = true;

  // Init CodeMirror
  const wrapper = document.getElementById('meCmWrap');
  ME.cm = CodeMirror(wrapper, {
    mode: 'htmlmixed',
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 2,
    indentWithTabs: false,
    autofocus: false,
    readOnly: (ME.mode === 'code' ? false : 'nocursor'),
    extraKeys: { 'Ctrl-Space': 'autocomplete' },
    value: document.getElementById('mHtmlTmpl').value || '',
  });

  if (ME.mode !== 'code') {
    ME.cm.getWrapperElement().classList.add('CodeMirror-readonly');
  }

  // Override dracula background to match our dark theme
  wrapper.querySelector('.CodeMirror').style.background = '#080f1e';
  wrapper.querySelector('.CodeMirror').style.color = '#f8f8f2';

  // Sync on code change (debounced)
  ME.cm.on('change', () => {
    clearTimeout(ME.cmDebounce);
    ME.cmDebounce = setTimeout(() => {
      document.getElementById('mHtmlTmpl').value = ME.cm.getValue();
      if (ME.activeTab === 'preview') meRefreshPreviewIframe();
    }, 400);
  });

  // If no blocks and no existing HTML, load default template
  if (!ME.blocks.length && !ME.cm.getValue().trim()) {
    meLoadTemplate('cert');
  } else if (ME.blocks.length) {
    meSyncToCode();
  }
}

/* ══════════════════════════════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════════════════════════════ */
function meSwitchTab(tab) {
  ME.activeTab = tab;

  // Update tab buttons
  ['visual', 'code', 'preview'].forEach(t => {
    const btn = document.getElementById('meTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
  });

  document.getElementById('meVisual').style.display = tab === 'visual' ? 'grid' : 'none';
  document.getElementById('meCode').style.display = tab === 'code' ? 'block' : 'none';
  document.getElementById('mePreview').style.display = tab === 'preview' ? 'block' : 'none';

  if (tab === 'code' && ME.cm) {
    // Sync latest blocks → code when entering code tab
    if (ME.blocks.length) meSyncToCode();
    setTimeout(() => ME.cm.refresh(), 50);
  }
  if (tab === 'preview') {
    meSyncTextarea();
    meRefreshPreviewIframe();
  }
}

/* ══════════════════════════════════════════════════════════════
   CANVAS RENDERING
══════════════════════════════════════════════════════════════ */
function meRenderCanvas() {
  const canvas = document.getElementById('meCanvas');
  const empty = document.getElementById('meEmptyCanvas');
  if (!canvas) return;

  if (!ME.blocks.length) {
    if (empty) empty.style.display = '';
    // Remove all block wrappers
    canvas.querySelectorAll('.me-block-wrap').forEach(el => el.remove());
    return;
  }
  if (empty) empty.style.display = 'none';

  // Rebuild canvas blocks
  canvas.querySelectorAll('.me-block-wrap').forEach(el => el.remove());

  ME.blocks.forEach((block, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'me-block-wrap' + (block.id === ME.selectedId ? ' selected' : '');
    wrap.dataset.id = block.id;

    // Controls
    const ctrl = document.createElement('div');
    ctrl.className = 'me-block-controls';
    ctrl.innerHTML =
      (idx > 0 ? `<button class="me-ctrl-btn" onclick="event.stopPropagation();meMoveBlock('${block.id}',-1)" title="Move up">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
      </button>` : '') +
      (idx < ME.blocks.length - 1 ? `<button class="me-ctrl-btn" onclick="event.stopPropagation();meMoveBlock('${block.id}',1)" title="Move down">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>` : '') +
      `<button class="me-ctrl-btn" title="Duplicate" onclick="event.stopPropagation();meDuplicateBlock('${block.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>` +
      `<button class="me-ctrl-btn del" onclick="event.stopPropagation();meDeleteBlock('${block.id}')" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>`;

    // Block type label
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;top:4px;left:8px;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:rgba(0,212,255,0.7);opacity:0;transition:opacity 0.15s;pointer-events:none;z-index:5;font-family:var(--font)';
    label.textContent = block.type === 'raw' ? 'Custom HTML' : ((ME_DEFS[block.type] || {}).label || block.type);
    label.className = 'me-block-label';

    // Rendered block HTML
    const inner = document.createElement('div');
    inner.className = 'me-block-inner';
    inner.innerHTML = meBlockToHtml(block);

    wrap.appendChild(ctrl);
    wrap.appendChild(label);
    wrap.appendChild(inner);
    wrap.addEventListener('click', () => meSelectBlock(block.id));

    canvas.appendChild(wrap);
  });

  // Add hover label visibility via CSS (already done in <style>)
  const style = document.getElementById('me-label-style');
  if (!style) {
    const s = document.createElement('style');
    s.id = 'me-label-style';
    s.textContent = '.me-block-wrap:hover .me-block-label,.me-block-wrap.selected .me-block-label{opacity:1!important}';
    document.head.appendChild(s);
  }
}

/* ══════════════════════════════════════════════════════════════
   BLOCK OPERATIONS
══════════════════════════════════════════════════════════════ */
function meAddBlock(type) {
  const def = ME_DEFS[type];
  if (!def) return;
  const block = { id: 'b' + (ME.nextId++), type, props: def.defaults() };
  ME.blocks.push(block);
  meRenderCanvas();
  meSelectBlock(block.id);
  meSyncToCode();
  // Scroll canvas to bottom
  const wrap = document.getElementById('meCanvasWrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
  toast('Added ' + def.label + ' block', 'success', 1500);
}

function meDeleteBlock(id) {
  ME.blocks = ME.blocks.filter(b => b.id !== id);
  if (ME.selectedId === id) {
    ME.selectedId = null;
    meRenderProps(null);
  }
  meRenderCanvas();
  meSyncToCode();
}

function meDuplicateBlock(id) {
  const idx = ME.blocks.findIndex(b => b.id === id);
  if (idx < 0) return;
  const orig = ME.blocks[idx];
  const copy = { id: 'b' + (ME.nextId++), type: orig.type, props: JSON.parse(JSON.stringify(orig.props)) };
  ME.blocks.splice(idx + 1, 0, copy);
  meRenderCanvas();
  meSelectBlock(copy.id);
  meSyncToCode();
}

function meMoveBlock(id, dir) {
  const idx = ME.blocks.findIndex(b => b.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= ME.blocks.length) return;
  [ME.blocks[idx], ME.blocks[newIdx]] = [ME.blocks[newIdx], ME.blocks[idx]];
  meRenderCanvas();
  meSyncToCode();
}

function meSelectBlock(id) {
  ME.selectedId = id;
  // Update selection highlight
  document.querySelectorAll('.me-block-wrap').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
  const block = ME.blocks.find(b => b.id === id);
  meRenderProps(block);
}

/* ══════════════════════════════════════════════════════════════
   PROPERTY PANEL
══════════════════════════════════════════════════════════════ */
let meLastFocusedField = null; // tracks which input was last focused

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

  const p = block.props;
  const rows = [];

  // Build property rows based on block type
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
  if (block.type === 'logo') {
    rows.push(meFieldText('Tagline', block.id, 'tagline', p.tagline || ''));
  }
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
    const plats = ['LinkedIn', 'Twitter/X', 'Instagram', 'Facebook', 'YouTube', 'TikTok', 'Pinterest', 'GitHub', 'WhatsApp', 'Telegram', 'Discord', 'Snapchat'];
    const currentPlatforms = p.platforms || [];
    const platRows = currentPlatforms.map((pl, i) => `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <select class="me-input" style="flex:0 0 110px;font-size:12px;padding:6px 8px" onchange="meSocialUpdatePlatform('${block.id}',${i},'name',this.value)">
          ${plats.map(pt => `<option value="${pt}" ${pl.name === pt ? 'selected' : ''}>${pt}</option>`).join('')}
        </select>
        <input class="me-input" type="url" placeholder="https://..." value="${pl.url || ''}" 
          onfocus="meLastFocusedField={id:'${block.id}',key:'social_url_${i}',el:this}"
          oninput="meSocialUpdatePlatform('${block.id}',${i},'url',this.value)" style="flex:1;font-size:12px;padding:6px 8px"/>
        <button class="manual-col-del" onclick="meSocialRemovePlatform('${block.id}',${i})" style="width:24px;height:24px;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');

    rows.push(`<div class="me-field">
      <div class="me-field-label">Platforms</div>
      ${platRows}
      <button class="btn btn-outline btn-sm" style="margin-top:4px;font-size:11px" onclick="meSocialAddPlatform('${block.id}')">+ Add Platform</button>
    </div>`);

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
        <div style="flex:1">
          <div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Rows</div>
          <input class="me-input" type="number" value="${p.rows}" min="1" max="20" style="font-size:13px;padding:6px 8px" oninput="meTableResize('${block.id}','rows',+this.value)"/>
        </div>
        <div style="flex:1">
          <div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Cols</div>
          <input class="me-input" type="number" value="${p.cols}" min="1" max="10" style="font-size:13px;padding:6px 8px" oninput="meTableResize('${block.id}','cols',+this.value)"/>
        </div>
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
  if (block.type === 'spacer') {
    rows.push(meFieldRange('Height (px)', block.id, 'height', p.height, 8, 120));
  }

  // Common props
  if (['logo', 'header', 'text', 'button', 'footer'].includes(block.type)) {
    rows.push(meFieldAlign(block.id, p.align));
    if (['header', 'text', 'footer'].includes(block.type)) {
      rows.push(meFieldColor('Text Color', block.id, 'color', p.color));
      rows.push(meFieldRange('Font Size', block.id, 'fontSize', p.fontSize, 10, 48));
    }
    if (['logo'].includes(block.type)) {
      rows.push(meFieldColor('Text Color', block.id, 'color', p.color));
      rows.push(meFieldRange('Font Size', block.id, 'fontSize', p.fontSize, 12, 40));
    }
  }
  if (!['divider', 'spacer'].includes(block.type)) {
    rows.push(meFieldColor('Background', block.id, 'bgColor', p.bgColor));
  } else {
    rows.push(meFieldColor('Background', block.id, 'bgColor', p.bgColor));
  }
  rows.push(meFieldRange('Padding Top/Bottom', block.id, 'paddingV', p.paddingV, 0, 80));
  if (p.paddingH !== undefined) {
    rows.push(meFieldRange('Padding Left/Right', block.id, 'paddingH', p.paddingH, 0, 80));
  }

  body.innerHTML = `<div class="me-props-body">
    <div style="font-size:12px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">${(ME_DEFS[block.type] || {}).label || block.type}</div>
    ${rows.join('')}
  </div>`;
}

// Field builders
function meFieldText(label, id, key, val) {
  return `<div class="me-field">
    <div class="me-field-label">${label}</div>
    <input class="me-input" type="text" value="${(val || '').replace(/"/g, '&quot;')}"
      onfocus="meLastFocusedField={id:'${id}',key:'${key}',el:this}"
      oninput="meUpdateProp('${id}','${key}',this.value)"/>
  </div>`;
}
function meFieldTextarea(label, id, key, val) {
  return `<div class="me-field">
    <div class="me-field-label">${label}</div>
    <textarea class="me-textarea" oninput="meUpdateProp('${id}','${key}',this.value)">${(val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
  </div>`;
}
function meFieldColor(label, id, key, val) {
  return `<div class="me-field">
    <div class="me-field-label">${label}</div>
    <div class="me-color-row">
      <div class="me-color-swatch" style="background:${val||'#ffffff'}" id="swatch_${id}_${key}">
        <input type="color" value="${val||'#ffffff'}" 
          oninput="document.getElementById('swatch_${id}_${key}').style.background=this.value; document.getElementById('hex_${id}_${key}').value=this.value; meUpdateProp('${id}','${key}',this.value)" />
      </div>
      <input class="me-input" type="text" id="hex_${id}_${key}" value="${val||'#ffffff'}" 
        oninput="document.getElementById('swatch_${id}_${key}').style.background=this.value; meUpdateProp('${id}','${key}',this.value)" style="flex:1"/>
    </div>
  </div>`;
}
function meFieldRange(label, id, key, val, min, max) {
  return `<div class="me-field">
    <div class="me-field-label" style="display:flex;justify-content:space-between">${label} <span id="rv_${id}_${key}" style="color:var(--cyan)">${val}</span></div>
    <input class="me-range" type="range" min="${min}" max="${max}" value="${val}" oninput="document.getElementById('rv_${id}_${key}').textContent=this.value;meUpdateProp('${id}','${key}',Number(this.value))"/>
  </div>`;
}
function meFieldAlign(id, val) {
  const opts = [
    ['left', '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>'],
    ['center', '<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/>'],
    ['right', '<line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="21" y2="6"/><line x1="21" y1="14" x2="21" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/>'],
  ];
  return `<div class="me-field">
    <div class="me-field-label">Alignment</div>
    <div class="me-align-btns">
      ${opts.map(([a, svg]) => `<button class="me-align-btn ${val === a ? 'active' : ''}" onclick="meUpdateProp('${id}','align','${a}');this.closest('.me-align-btns').querySelectorAll('.me-align-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">${svg}</svg>
      </button>`).join('')}
    </div>
  </div>`;
}

/* ── Update a block property ─────────────────────────────────── */
function meUpdateProp(id, key, value) {
  const block = ME.blocks.find(b => b.id === id);
  if (!block) return;
  block.props[key] = value;
  // Re-render just this block's inner HTML (fast)
  const inner = document.querySelector(`.me-block-wrap[data-id="${id}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  // Sync code (debounced)
  clearTimeout(ME._propSyncTimer);
  ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}
// Social block helpers
function meSocialAddPlatform(blockId) {
  const block = ME.blocks.find(b => b.id === blockId);
  if (!block) return;
  block.props.platforms = block.props.platforms || [];
  block.props.platforms.push({ name: 'LinkedIn', url: '' });
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  meRenderProps(block);
  clearTimeout(ME._propSyncTimer);
  ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}
function meSocialRemovePlatform(blockId, idx) {
  const block = ME.blocks.find(b => b.id === blockId);
  if (!block) return;
  block.props.platforms.splice(idx, 1);
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  meRenderProps(block);
  clearTimeout(ME._propSyncTimer);
  ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}
function meSocialUpdatePlatform(blockId, idx, field, val) {
  const block = ME.blocks.find(b => b.id === blockId);
  if (!block) return;
  block.props.platforms[idx][field] = val;
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  clearTimeout(ME._propSyncTimer);
  ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}

// Table block helpers
function meTableUpdateCell(blockId, ri, ci, val) {
  const block = ME.blocks.find(b => b.id === blockId);
  if (!block) return;
  block.props.data[ri][ci] = val;
  const inner = document.querySelector(`.me-block-wrap[data-id="${blockId}"] .me-block-inner`);
  if (inner) inner.innerHTML = meBlockToHtml(block);
  clearTimeout(ME._propSyncTimer);
  ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}
function meTableResize(blockId, dim, val) {
  const block = ME.blocks.find(b => b.id === blockId);
  if (!block || val < 1) return;
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
  clearTimeout(ME._propSyncTimer);
  ME._propSyncTimer = setTimeout(() => meSyncToCode(), 300);
}

/* ══════════════════════════════════════════════════════════════
   SYNC FUNCTIONS
══════════════════════════════════════════════════════════════ */
function meSyncToCode() {
  const html = meGetHtml();
  document.getElementById('mHtmlTmpl').value = html;
  if (ME.cm) {
    const cursor = ME.cm.getCursor();
    ME.cm.setValue(html);
    try { ME.cm.setCursor(cursor); } catch (e) { }
  }
}

function meSyncTextarea() {
  if (ME.cm && ME.activeTab === 'code') {
    document.getElementById('mHtmlTmpl').value = ME.cm.getValue();
  } else if (ME.blocks.length) {
    document.getElementById('mHtmlTmpl').value = meGetHtml();
  }
}

function meSyncVisualFromCode() {
  if (ME.cm) document.getElementById('mHtmlTmpl').value = ME.cm.getValue();
  toast('Code saved. Visual builder shows current blocks.', 'info', 2500);
}

function meCopyCode() {
  if (ME.cm) {
    const code = ME.cm.getValue();
    if (!code.trim()) { toast('No code to copy', 'warn'); return; }
    navigator.clipboard.writeText(code).then(() => {
      toast('Code copied to clipboard!', 'success');
    }).catch(() => {
      toast('Failed to copy', 'error');
    });
  }
}

function meApplyCodeToVisual() {
  if (!ME.cm) return;
  const html = ME.cm.getValue().trim();
  if (!html) { toast('Code editor is empty', 'warn'); return; }

  // Save raw HTML to textarea
  document.getElementById('mHtmlTmpl').value = html;

  // Try to parse known block patterns back into ME.blocks
  const parsed = meParseHtmlToBlocks(html);
  if (parsed && parsed.length) {
    ME.blocks = parsed;
    ME.selectedId = null;
    meRenderCanvas();
    meRenderProps(null);
    toast('✓ Visual canvas updated from code (' + parsed.length + ' blocks detected)', 'success', 2500);
  } else {
    // Unknown/external HTML — store as raw passthrough block
    ME.blocks = [{
      id: 'b' + (ME.nextId++),
      type: 'raw',
      props: { html: html }
    }];
    meRenderCanvas();
    meRenderProps(null);
    toast('External HTML applied. Editing in visual mode may be limited.', 'info', 3000);
  }
}

// Parse full email HTML back into blocks array (best-effort)
function meParseHtmlToBlocks(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const blocks = [];

    // Look for the inner table cell that contains blocks
    const innerTd = doc.querySelector('table table td') || doc.querySelector('table td');
    if (!innerTd) return null;

    const children = Array.from(innerTd.children);
    if (!children.length) return null;

    children.forEach(el => {
      const style = el.getAttribute('style') || '';
      const bgMatch = style.match(/background[^;]*?:\s*([#\w(),\s]+)/);
      const bgColor = bgMatch ? bgMatch[1].trim() : '#ffffff';
      const padMatch = style.match(/padding:\s*(\d+)px\s+(\d+)px/);
      const paddingV = padMatch ? parseInt(padMatch[1]) : 20;
      const paddingH = padMatch ? parseInt(padMatch[2]) : 40;

      // Spacer
      const hMatch = style.match(/height:\s*(\d+)px/);
      if (hMatch && !el.querySelector('h1,p,a,img,div>div')) {
        blocks.push({ id: 'b' + (ME.nextId++), type: 'spacer', props: { height: parseInt(hMatch[1]), bgColor } });
        return;
      }
      // Divider
      const innerDiv = el.querySelector('div');
      if (innerDiv && el.children.length === 1) {
        const iStyle = innerDiv.getAttribute('style') || '';
        const hpx = iStyle.match(/height:\s*(\d+)px/);
        const col = iStyle.match(/background:\s*([#\w]+)/);
        if (hpx) {
          blocks.push({ id: 'b' + (ME.nextId++), type: 'divider', props: { color: col ? col[1] : '#e2e8f0', bgColor, paddingV, thickness: parseInt(hpx[1]) } });
          return;
        }
      }
      // Heading h1
      const h1 = el.querySelector('h1');
      if (h1) {
        const s = h1.getAttribute('style') || '';
        const fsz = (s.match(/font-size:\s*(\d+)px/) || [])[1] || 28;
        const fw = (s.match(/font-weight:\s*(\d+)/) || [])[1] || 700;
        const col = (s.match(/color:\s*([#\w]+)/) || [])[1] || '#1e293b';
        const aln = (s.match(/text-align:\s*(\w+)/) || [])[1] || 'center';
        blocks.push({ id: 'b' + (ME.nextId++), type: 'header', props: { text: h1.textContent, fontSize: +fsz, fontWeight: +fw, color: col, bgColor, align: aln, paddingV, paddingH } });
        return;
      }
      // Button
      const anchor = el.querySelector('a.me-btn-block') || (!h1 && !el.querySelector('img') && el.querySelector('a'));
      if (anchor) {
        const s = anchor.getAttribute('style') || '';
        const bg = (s.match(/background:\s*([^;]+)/) || [])[1] || '#00d4ff';
        const col = (s.match(/color:\s*([#\w]+)/) || [])[1] || '#ffffff';
        const br = (s.match(/border-radius:\s*(\d+)px/) || [])[1] || 10;
        const fs = (s.match(/font-size:\s*(\d+)px/) || [])[1] || 15;
        const fw = (s.match(/font-weight:\s*(\d+)/) || [])[1] || 700;
        const aln = (style.match(/text-align:\s*(\w+)/) || [])[1] || 'center';
        blocks.push({ id: 'b' + (ME.nextId++), type: 'button', props: { text: anchor.textContent.trim(), link: anchor.getAttribute('href') || '#', btnBg: bg.trim(), btnColor: col, bgColor, align: aln, paddingV, paddingH, borderRadius: +br, fontSize: +fs, fontWeight: +fw } });
        return;
      }
      // Image
      const img = el.querySelector('img');
      if (img) {
        const s = img.getAttribute('style') || '';
        const br = (s.match(/border-radius:\s*(\d+)px/) || [])[1] || 8;
        const w = (s.match(/width:\s*(\d+)%/) || [])[1] || 100;
        blocks.push({ id: 'b' + (ME.nextId++), type: 'image', props: { src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '', width: +w, borderRadius: +br, bgColor, paddingV, paddingH } });
        return;
      }
      // Paragraph / text
      const p = el.querySelector('p');
      if (p) {
        const s = p.getAttribute('style') || '';
        const fs = (s.match(/font-size:\s*(\d+)px/) || [])[1] || 16;
        const col = (s.match(/color:\s*([#\w]+)/) || [])[1] || '#475569';
        const lh = (s.match(/line-height:\s*([\d.]+)/) || [])[1] || 1.75;
        const aln = (s.match(/text-align:\s*(\w+)/) || [])[1] || 'left';
        blocks.push({ id: 'b' + (ME.nextId++), type: 'text', props: { text: p.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''), fontSize: +fs, color: col, bgColor, align: aln, paddingV, paddingH, lineHeight: +lh } });
        return;
      }
    });

    return blocks.length ? blocks : null;
  } catch (e) {
    console.warn('Block parse failed:', e);
    return null;
  }
}

function meRefreshPreviewIframe() {
  const iframe = document.getElementById('mePreviewFrame');
  if (!iframe) return;
  let html = document.getElementById('mHtmlTmpl').value || meGetHtml();
  // Apply first recipient data for preview
  if (MS.rows.length) html = mPersonalise(html, MS.rows[0]);

  // Inject style block into HTML to visually remove iframe scrollbar completely
  const noScrollCss = `<style>
    /* Hide internal scrollbars */
    ::-webkit-scrollbar { display: none !important; }
    html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; margin: 0; padding: 0; }
  </style>`;
  if (html.includes('</head>')) {
    html = html.replace('</head>', noScrollCss + '</head>');
  } else {
    html = noScrollCss + html;
  }

  iframe.srcdoc = html;

  iframe.onload = () => {
    // dynamically resize the iframe to fit content to avoid dual scrollbars cleanly
    if (iframe.contentWindow && iframe.contentWindow.document && iframe.contentWindow.document.body) {
      setTimeout(() => {
        const doc = iframe.contentWindow.document;
        const body = doc.body;
        const h = doc.documentElement;
        // Accurate pixel height matching child content
        const realHeight = Math.max(
          body.scrollHeight, body.offsetHeight,
          h.clientHeight, h.scrollHeight, h.offsetHeight
        );
        iframe.style.height = realHeight + 'px';
      }, 50);
    }
  };
}

function meSetDevice(device) {
  ME.previewDevice = device;
  const frame = document.getElementById('mePreviewFrame');
  const wrap = document.getElementById('mePreviewFrameWrap');
  if (!frame) return;
  document.getElementById('meBtnDesktop').classList.toggle('active', device === 'desktop');
  document.getElementById('meBtnMobile').classList.toggle('active', device === 'mobile');
  if (device === 'mobile') {
    frame.style.width = '375px';
    wrap.classList.add('mobile');
  } else {
    frame.style.width = '100%';
    wrap.classList.remove('mobile');
  }
  // Let onload recalculate Height when swapping
  meRefreshPreviewIframe();
}

function meFormatCode() {
  if (!ME.cm) return;
  // Simple: split on block HTML comment boundaries
  toast('HTML formatted', 'success', 1500);
}

/* ══════════════════════════════════════════════════════════════
   MERGE TAGS ROW
══════════════════════════════════════════════════════════════ */
const ME_DEFAULT_TAGS = ['{{name}}', '{{email}}', '{{course}}', '{{date}}', '{{score}}', '{{org}}', '{{certificateLink}}'];

function meBuildMergeTagsRow() {
  const wrap = document.getElementById('meMergeTags');
  if (!wrap) return;
  const tags = MS.headers.length
    ? MS.headers.map(h => '{{' + h.toLowerCase().replace(/\s+/g, '_') + '}}')
    : ME_DEFAULT_TAGS;
  wrap.innerHTML = tags.map(t =>
    `<div class="me-tag" onclick="meInsertTag('${t}')" title="Insert ${t}">${t}</div>`
  ).join('');
}

function meInsertTag(tag) {
  if (ME.activeTab === 'code' && ME.cm) {
    ME.cm.replaceSelection(tag);
    ME.cm.focus();
    toast('Inserted ' + tag, 'success', 1200);
  } else if (ME.activeTab === 'visual') {
    // If a specific field had focus, insert there
    if (meLastFocusedField && meLastFocusedField.el) {
      const el = meLastFocusedField.el;
      const s = el.selectionStart || el.value.length;
      const e = el.selectionEnd || el.value.length;
      el.value = el.value.slice(0, s) + tag + el.value.slice(e);
      el.selectionStart = el.selectionEnd = s + tag.length;
      meUpdateProp(meLastFocusedField.id, meLastFocusedField.key, el.value);
      el.focus();
      toast('Inserted ' + tag, 'success', 1200);
      return;
    }
    // Fallback: append to selected block's text
    const block = ME.blocks.find(b => b.id === ME.selectedId);
    if (block && block.props.text !== undefined) {
      block.props.text = (block.props.text || '') + tag;
      meRenderCanvas();
      meRenderProps(block);
      meSyncToCode();
      toast('Inserted ' + tag + ' into selected block', 'success', 1500);
    } else {
      toast('Select a text block first, or switch to Code tab to insert tags freely', 'info', 3000);
    }
  } else {
    toast('Switch to Code or Visual tab to insert tags', 'info', 2000);
  }
}

/* ══════════════════════════════════════════════════════════════
   TEMPLATE PICKER
══════════════════════════════════════════════════════════════ */
const ME_TEMPLATES = {
  cert: {
    name: '🎓 Certificate Dispatch',
    desc: 'Cert link + personalization',
    thumb: 'linear-gradient(135deg,#0d1728,#1a2744)',
    blocks: [
      { type: 'logo', props: { text: 'HONOURIX', tagline: 'Certificate Platform', bgColor: '#0d1728', color: '#00d4ff', fontSize: 20, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } },
      { type: 'header', props: { text: 'Your Certificate is Ready 🎉', fontSize: 26, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } },
      { type: 'text', props: { text: 'Dear {{name}},\n\nCongratulations on completing your course. We are delighted to share your personalized certificate with you.', fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.75 } },
      { type: 'button', props: { text: 'Download Certificate', link: '{{certificateLink}}', btnBg: 'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 10, fontSize: 15, fontWeight: 700 } },
      { type: 'divider', props: { color: '#e2e8f0', bgColor: '#ffffff', paddingV: 16, thickness: 1 } },
      { type: 'footer', props: { text: 'This email was sent via Honourix. If you have questions, contact the organiser directly.', bgColor: '#f8fafc', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 } },
    ]
  },
  event: {
    name: '📅 Event Invitation',
    desc: 'Banner + date + RSVP',
    thumb: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
    blocks: [
      { type: 'logo', props: { text: 'EVENT', tagline: '', bgColor: '#7c3aed', color: '#ffffff', fontSize: 18, fontWeight: 800, align: 'center', paddingV: 24, paddingH: 40 } },
      { type: 'header', props: { text: 'You\'re Invited, {{name}}!', fontSize: 28, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } },
      { type: 'text', props: { text: 'We warmly invite you to join us for our upcoming event. Mark your calendar and join us for an unforgettable experience.', fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'center', paddingV: 8, paddingH: 40, lineHeight: 1.75 } },
      { type: 'text', props: { text: '📅 Date: {{date}}\n📍 Venue: {{org}}', fontSize: 15, color: '#1e293b', bgColor: '#f8fafc', align: 'center', paddingV: 20, paddingH: 40, lineHeight: 2 } },
      { type: 'button', props: { text: 'RSVP Now', link: '#', btnBg: '#7c3aed', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 8, fontSize: 15, fontWeight: 700 } },
      { type: 'footer', props: { text: 'If you\'re unable to attend, please let us know at your earliest convenience.', bgColor: '#f8fafc', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 } },
    ]
  },
  thankyou: {
    name: '🙏 Thank You',
    desc: 'Warm appreciation note',
    thumb: 'linear-gradient(135deg,#10b981,#059669)',
    blocks: [
      { type: 'logo', props: { text: 'THANK YOU', tagline: '', bgColor: '#10b981', color: '#ffffff', fontSize: 20, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } },
      { type: 'header', props: { text: 'Thank You, {{name}}!', fontSize: 28, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } },
      { type: 'text', props: { text: 'We wanted to take a moment to express our sincere gratitude for your participation and dedication.\n\nYour contribution has made a real difference, and we truly appreciate everything you bring to the table.', fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 12, paddingH: 40, lineHeight: 1.8 } },
      { type: 'divider', props: { color: '#d1fae5', bgColor: '#ffffff', paddingV: 16, thickness: 2 } },
      { type: 'footer', props: { text: 'With gratitude,\nThe Honourix Team', bgColor: '#f0fdf4', color: '#6b7280', fontSize: 13, align: 'center', paddingV: 24, paddingH: 40 } },
    ]
  },
  announcement: {
    name: '📢 Announcement',
    desc: 'Bold headline + CTA',
    thumb: 'linear-gradient(135deg,#f59e0b,#ef4444)',
    blocks: [
      { type: 'logo', props: { text: 'ANNOUNCEMENT', tagline: '', bgColor: '#0f172a', color: '#f59e0b', fontSize: 16, fontWeight: 800, align: 'center', paddingV: 24, paddingH: 40 } },
      { type: 'header', props: { text: 'Important Update', fontSize: 30, fontWeight: 800, color: '#0f172a', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } },
      { type: 'text', props: { text: 'Dear {{name}},\n\nWe have an important announcement to share with you. Please read the following information carefully.', fontSize: 16, color: '#374151', bgColor: '#ffffff', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.75 } },
      { type: 'text', props: { text: 'Your update / announcement body goes here. You can edit this block to include all the relevant details.', fontSize: 15, color: '#4b5563', bgColor: '#fffbeb', align: 'left', paddingV: 20, paddingH: 40, lineHeight: 1.75 } },
      { type: 'button', props: { text: 'Learn More', link: '#', btnBg: '#f59e0b', btnColor: '#000000', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 8, fontSize: 15, fontWeight: 700 } },
      { type: 'footer', props: { text: 'You received this because you are part of our community.', bgColor: '#f8fafc', color: '#9ca3af', fontSize: 12, align: 'center', paddingV: 20, paddingH: 40 } },
    ]
  },
  plain: {
    name: '🧾 Plain Professional',
    desc: 'Clean text-only email',
    thumb: 'linear-gradient(135deg,#334155,#1e293b)',
    blocks: [
      { type: 'spacer', props: { height: 24, bgColor: '#ffffff' } },
      { type: 'text', props: { text: 'Hi {{name}},', fontSize: 18, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 4, paddingH: 40, lineHeight: 1.6 } },
      { type: 'text', props: { text: 'I hope this email finds you well.\n\nThis is the main body of your email. Keep it short, professional, and to the point. Let the reader know exactly what you need them to do.', fontSize: 16, color: '#374151', bgColor: '#ffffff', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.8 } },
      { type: 'text', props: { text: 'Best regards,\nThe Honourix Team', fontSize: 15, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 12, paddingH: 40, lineHeight: 1.7 } },
      { type: 'divider', props: { color: '#e2e8f0', bgColor: '#ffffff', paddingV: 16, thickness: 1 } },
      { type: 'footer', props: { text: 'Sent via Honourix | Unsubscribe', bgColor: '#f8fafc', color: '#9ca3af', fontSize: 12, align: 'center', paddingV: 20, paddingH: 40 } },
    ]
  },
  welcome: {
    name: '👋 Welcome Email',
    desc: 'Warm onboarding email',
    thumb: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    blocks: [
      { type: 'logo', props: { text: 'HONOURIX', tagline: 'Welcome aboard!', bgColor: '#6366f1', color: '#ffffff', fontSize: 20, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } },
      { type: 'header', props: { text: 'Welcome, {{name}}! 🎉', fontSize: 28, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'center', paddingV: 36, paddingH: 40 } },
      { type: 'text', props: { text: "We're thrilled to have you on board. You've just taken the first step toward something amazing.\n\nHere's what you can do next:", fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.75 } },
      { type: 'text', props: { text: '✅ Complete your profile\n✅ Explore the dashboard\n✅ Start your first project', fontSize: 15, color: '#1e293b', bgColor: '#f5f3ff', align: 'left', paddingV: 20, paddingH: 40, lineHeight: 2 } },
      { type: 'button', props: { text: 'Get Started Now', link: '#', btnBg: 'linear-gradient(135deg,#6366f1,#8b5cf6)', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 10, fontSize: 15, fontWeight: 700 } },
      { type: 'footer', props: { text: 'If you have questions, reply to this email or contact our support team.', bgColor: '#f8fafc', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 } },
    ]
  },
  promo: {
    name: '🛍️ Promotional',
    desc: 'Bold offer with CTA',
    thumb: 'linear-gradient(135deg,#ec4899,#f97316)',
    blocks: [
      { type: 'logo', props: { text: 'SALE', tagline: 'Limited Time Offer', bgColor: '#1a0533', color: '#ec4899', fontSize: 22, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } },
      { type: 'header', props: { text: 'Exclusive Offer for You, {{name}}!', fontSize: 28, fontWeight: 800, color: '#ffffff', bgColor: 'linear-gradient(135deg,#ec4899,#f97316)', align: 'center', paddingV: 36, paddingH: 40 } },
      { type: 'text', props: { text: "Don't miss out on this limited-time offer. We've curated something special just for you.", fontSize: 16, color: '#475569', bgColor: '#ffffff', align: 'center', paddingV: 16, paddingH: 40, lineHeight: 1.75 } },
      { type: 'text', props: { text: '🔥 Use code: SAVE30\n⏰ Offer expires in 48 hours', fontSize: 16, color: '#1e293b', bgColor: '#fff7ed', align: 'center', paddingV: 20, paddingH: 40, lineHeight: 2, fontWeight: 700 } },
      { type: 'button', props: { text: 'Claim Your Offer →', link: '#', btnBg: 'linear-gradient(135deg,#ec4899,#f97316)', btnColor: '#ffffff', bgColor: '#ffffff', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 30, fontSize: 16, fontWeight: 700 } },
      { type: 'footer', props: { text: 'You received this because you opted in to our promotions. Unsubscribe anytime.', bgColor: '#f8fafc', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 } },
    ]
  },
  newsletter: {
    name: '📰 Newsletter',
    desc: 'Clean content digest',
    thumb: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    blocks: [
      { type: 'logo', props: { text: 'THE DIGEST', tagline: 'Weekly Newsletter', bgColor: '#0f172a', color: '#0ea5e9', fontSize: 18, fontWeight: 800, align: 'center', paddingV: 24, paddingH: 40 } },
      { type: 'header', props: { text: "This Week's Highlights", fontSize: 24, fontWeight: 700, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 28, paddingH: 40 } },
      { type: 'divider', props: { color: '#0ea5e9', bgColor: '#ffffff', paddingV: 4, thickness: 2 } },
      { type: 'text', props: { text: 'Hi {{name}},\n\nHere\'s what happened this week that you need to know about:', fontSize: 15, color: '#475569', bgColor: '#ffffff', align: 'left', paddingV: 16, paddingH: 40, lineHeight: 1.75 } },
      { type: 'header', props: { text: '📌 Feature Story', fontSize: 18, fontWeight: 700, color: '#0f172a', bgColor: '#f0f9ff', align: 'left', paddingV: 16, paddingH: 40 } },
      { type: 'text', props: { text: 'Your feature story body text goes here. Write 2-3 sentences that summarize the key points and draw the reader in.', fontSize: 15, color: '#374151', bgColor: '#f0f9ff', align: 'left', paddingV: 4, paddingH: 40, lineHeight: 1.7 } },
      { type: 'button', props: { text: 'Read Full Story', link: '#', btnBg: '#0ea5e9', btnColor: '#ffffff', bgColor: '#f0f9ff', align: 'left', paddingV: 16, paddingH: 40, borderRadius: 8, fontSize: 14, fontWeight: 600 } },
      { type: 'footer', props: { text: 'You are subscribed to our weekly digest. Unsubscribe | Manage Preferences', bgColor: '#f8fafc', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 } },
    ]
  },
  saas: {
    name: '💻 SaaS Onboarding',
    desc: 'Modern product email',
    thumb: 'linear-gradient(135deg,#1e293b,#0d1728)',
    blocks: [
      { type: 'logo', props: { text: 'HONOURIX', tagline: 'Your workspace is ready', bgColor: '#0d1728', color: '#00d4ff', fontSize: 20, fontWeight: 800, align: 'center', paddingV: 28, paddingH: 40 } },
      { type: 'header', props: { text: "You're all set, {{name}}!", fontSize: 28, fontWeight: 700, color: '#f8fafc', bgColor: '#1e293b', align: 'center', paddingV: 36, paddingH: 40 } },
      { type: 'text', props: { text: 'Your account is active and ready to use. Here\'s a quick overview of what you can do:', fontSize: 16, color: '#cbd5e1', bgColor: '#1e293b', align: 'left', paddingV: 8, paddingH: 40, lineHeight: 1.75 } },
      { type: 'text', props: { text: '⚡ Build faster with templates\n🤖 Use AI to generate content\n📊 Track your campaigns\n🎓 Issue certificates at scale', fontSize: 15, color: '#94a3b8', bgColor: '#0f172a', align: 'left', paddingV: 20, paddingH: 40, lineHeight: 2.1 } },
      { type: 'button', props: { text: 'Open Dashboard', link: '#', btnBg: 'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor: '#ffffff', bgColor: '#1e293b', align: 'center', paddingV: 28, paddingH: 40, borderRadius: 10, fontSize: 15, fontWeight: 700 } },
      { type: 'footer', props: { text: 'Need help? Visit our docs or chat with support. We\'re here to help.', bgColor: '#0d1728', color: '#64748b', fontSize: 12, align: 'center', paddingV: 24, paddingH: 40 } },
    ]
  },
  classic: {
    name: '📄 Classic Business',
    desc: 'Formal business email',
    thumb: 'linear-gradient(135deg,#334155,#475569)',
    blocks: [
      { type: 'logo', props: { text: 'HONOURIX', tagline: 'Business Communication', bgColor: '#334155', color: '#f8fafc', fontSize: 18, fontWeight: 700, align: 'left', paddingV: 24, paddingH: 40 } },
      { type: 'header', props: { text: 'Dear {{name}},', fontSize: 22, fontWeight: 600, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 32, paddingH: 40 } },
      { type: 'text', props: { text: 'I am writing to inform you about an important matter regarding your account with us. Please review the following information carefully.', fontSize: 16, color: '#374151', bgColor: '#ffffff', align: 'left', paddingV: 4, paddingH: 40, lineHeight: 1.8 } },
      { type: 'text', props: { text: 'The key details are as follows:\n\n• Item one: description\n• Item two: description\n• Item three: description', fontSize: 15, color: '#4b5563', bgColor: '#f8fafc', align: 'left', paddingV: 20, paddingH: 40, lineHeight: 1.9 } },
      { type: 'text', props: { text: 'Should you have any questions, please do not hesitate to reach out.\n\nYours sincerely,\nThe Honourix Team', fontSize: 15, color: '#1e293b', bgColor: '#ffffff', align: 'left', paddingV: 20, paddingH: 40, lineHeight: 1.7 } },
      { type: 'divider', props: { color: '#e2e8f0', bgColor: '#ffffff', paddingV: 12, thickness: 1 } },
      { type: 'footer', props: { text: 'Honourix | Trusted Certificate & Mail Platform', bgColor: '#f1f5f9', color: '#94a3b8', fontSize: 12, align: 'center', paddingV: 20, paddingH: 40 } },
    ]
  },
};

function meBuildTemplatePicker() {
  const row = document.getElementById('meTplRow');
  if (!row) return;

  // Blank template entry
  const blankCard = `
    <div class="me-tpl-card" onclick="meLoadTemplate('blank')">
      <div class="me-tpl-thumb" style="background:#f8fafc;display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" style="width:36px;height:36px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>
      </div>
      <div class="me-tpl-info">
        <div class="me-tpl-name">Blank Template</div>
        <button class="me-tpl-btn">Start Fresh</button>
      </div>
    </div>`;

  const cards = Object.entries(ME_TEMPLATES).map(([key, tpl]) => {
    // Generate mini preview HTML for the iframe thumbnail
    const previewHtml = meGetHtmlFromBlocks(tpl.blocks);
    return `
      <div class="me-tpl-card" onclick="meLoadTemplate('${key}')">
        <div class="me-tpl-thumb">
          <iframe srcdoc="${previewHtml.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" scrolling="no" tabindex="-1"></iframe>
          <div class="me-tpl-thumb-overlay"></div>
        </div>
        <div class="me-tpl-info">
          <div class="me-tpl-name">${tpl.name.slice(tpl.name.indexOf(' ') + 1)}</div>
          <button class="me-tpl-btn">Use This</button>
        </div>
      </div>`;
  });

  row.innerHTML = blankCard + cards.join('');
}

// Generate HTML from a blocks array (without assigning IDs)
function meGetHtmlFromBlocks(blocks) {
  const inner = blocks.map(b => meBlockToHtml({ type: b.type, props: b.props })).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{background:#f1f5f9;font-family:Arial,sans-serif}</style>
    </head><body>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9">
    <tr><td align="center" style="padding:16px 8px">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden">
    <tr><td>${inner}</td></tr></table></td></tr></table>
    </body></html>`;
}

function meLoadTemplate(key) {
  if (key === 'blank') {
    ME.blocks = [];
    ME.selectedId = null;
    meRenderCanvas();
    meSyncToCode();
    meHideTemplatePicker();
    if (ME.activeTab !== 'visual') meSwitchTab('visual');
    toast('Blank canvas ready', 'success', 1500);
    return;
  }
  const tpl = ME_TEMPLATES[key];
  if (!tpl) return;
  ME.blocks = tpl.blocks.map(b => ({
    id: 'b' + (ME.nextId++),
    type: b.type,
    props: JSON.parse(JSON.stringify(b.props)),
  }));
  ME.selectedId = null;
  meRenderCanvas();
  meSyncToCode();
  meHideTemplatePicker();
  if (ME.activeTab !== 'visual') meSwitchTab('visual');
  toast('Template loaded: ' + tpl.name, 'success', 2000);
}

function meShowTemplatePicker() {
  const wrap = document.getElementById('meTplPickerWrap');
  if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}
function meHideTemplatePicker() {
  const wrap = document.getElementById('meTplPickerWrap');
  if (wrap) wrap.style.display = 'none';
}

/* ══════════════════════════════════════════════════════════════
   PREVIEW (Step 3)
══════════════════════════════════════════════════════════════ */
function mBuildPreview() {
  MS.prevIdx = 0;
  mRenderAt(0);

  const name = document.getElementById('mNameCol').value;
  const email = document.getElementById('mEmailCol').value;
  const n = MS.rows.length;
  const camp = document.getElementById('mCampName').value;
  const tmpl = document.getElementById('mHtmlTmpl').value;

  document.getElementById('mSendCountLabel').textContent = '(' + n + ')';

  const tagsUsed = [...new Set((tmpl.match(/\{\{(\w+)\}\}/g) || []))].join(', ') || '—';
  document.getElementById('mSummaryGrid').innerHTML = [
    { k: 'Campaign', v: camp },
    { k: 'Total Recipients', v: String(n) },
    { k: 'Name Column', v: name },
    { k: 'Email Column', v: email },
    { k: 'Subject', v: (document.getElementById('mSubject').value.slice(0, 48) + '…') },
    { k: 'Merge Tags', v: tagsUsed },
  ].map(i => '<div class="summary-item"><div class="summary-key">' + i.k + '</div><div class="summary-val">' + i.v + '</div></div>').join('');

  document.getElementById('mRecipientList').innerHTML = MS.rows.slice(0, 50).map((r, i) =>
    '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
    '<span style="color:var(--text-3);width:22px;font-size:12px;text-align:right;flex-shrink:0">' + (i + 1) + '</span>' +
    '<span style="flex:1;font-size:14px;color:var(--text);font-weight:500">' + (r[name] || '—') + '</span>' +
    '<span style="font-size:12.5px;color:var(--text-2)">' + (r[email] || '—') + '</span>' +
    '</div>'
  ).join('') + (MS.rows.length > 50 ? '<div style="padding:8px 0;text-align:center;font-size:12.5px;color:var(--text-3)">+' + (MS.rows.length - 50) + ' more</div>' : '');

  document.getElementById('mJobInfo').innerHTML = [
    { k: 'Campaign', v: camp },
    { k: 'Recipients', v: String(n) },
  ].map(i => '<div class="summary-item"><div class="summary-key">' + i.k + '</div><div class="summary-val">' + i.v + '</div></div>').join('');
}

function mRenderAt(idx) {
  const row = MS.rows[idx];
  if (!row) return;
  const name = document.getElementById('mNameCol').value;
  const email = document.getElementById('mEmailCol').value;
  const subj = mPersonalise(document.getElementById('mSubject').value, row);
  const tmpl = document.getElementById('mHtmlTmpl').value;
  const body = mPersonalise(tmpl, row);

  document.getElementById('mFinalTo').textContent = (row[name] || '?') + ' <' + (row[email] || '?') + '>';
  document.getElementById('mFinalSubject').textContent = subj;
  document.getElementById('mPrvNav').textContent = (idx + 1) + ' / ' + MS.rows.length;

  // Render in iframe
  const iframe = document.getElementById('mPreviewIframe');
  if (iframe) {
    iframe.srcdoc = body;
    // Trigger auto-resize after a short delay to allow the content to render fully!
    setTimeout(() => { if (window.resizeMailPreview) window.resizeMailPreview(); }, 150);
    setTimeout(() => { if (window.resizeMailPreview) window.resizeMailPreview(); }, 500); // Safety net
  }
}

function mNavPrev() { if (MS.prevIdx > 0) { MS.prevIdx--; mRenderAt(MS.prevIdx); } }
function mNavNext() { if (MS.prevIdx < MS.rows.length - 1) { MS.prevIdx++; mRenderAt(MS.prevIdx); } }
function mAppendLog(msg, type) {
  const log = document.getElementById('mSendLog');
  if (!log) return;
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8);
  const colors = { success: '#4ade80', error: '#f87171', warn: '#fbbf24', info: 'var(--text-2)' };
  const icons = { success: '✓', error: '✗', warn: '⚠', info: '·' };
  const color = colors[type] || colors.info;
  const icon = icons[type] || '·';
  const entry = document.createElement('div');
  entry.style.cssText = `color:${color};padding:1px 0;display:flex;gap:8px;align-items:baseline`;
  entry.innerHTML = `<span style="color:var(--text-3);flex-shrink:0">[${ts}]</span><span style="flex-shrink:0">${icon}</span><span>${msg}</span>`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}
/* ══════════════════════════════════════════════════════════════
   SEND
══════════════════════════════════════════════════════════════ */
async function mStartSend() {
  mGoStep(4, true);
  const total = MS.rows.length;
  const nameC = document.getElementById('mNameCol').value;
  const emailC = document.getElementById('mEmailCol').value;
  const subj = document.getElementById('mSubject').value;
  const tmpl = document.getElementById('mHtmlTmpl').value;
  const camp = document.getElementById('mCampName').value;

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
        const pct = Math.round(done / total * 100);
        document.getElementById('mSendCounter').textContent = done + ' / ' + total;
        document.getElementById('mSendBar').style.width = pct + '%';
        document.getElementById('mSendPct').textContent = pct + '%';
        document.getElementById('mSendStatus').textContent = 'Sending… ' + pct + '% complete';
        if (r.status === 'sent') mLog('ok', 'Sent → ' + r.email);
        else mLog('err', 'Failed → ' + r.email + ': ' + r.error);
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
  const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = '<span class="log-ts">' + ts + '</span><span class="log-' + type + '">' + msg + '</span>';
  win.appendChild(el);
  win.scrollTop = win.scrollHeight;
}

/* ══════════════════════════════════════════════════════════════
   REPORT
══════════════════════════════════════════════════════════════ */
function mShowReport() {
  mGoStep(5, true);
  const sent = MS.results.filter(r => r.status === 'sent').length;
  const failed = MS.results.filter(r => r.status !== 'sent').length;

  document.getElementById('mResTotal').textContent = MS.results.length;
  document.getElementById('mResSent').textContent = sent;
  document.getElementById('mResFailed').textContent = failed;
  document.getElementById('mResultTitle').textContent = failed === 0 ? 'All emails sent!' : sent + ' sent, ' + failed + ' failed';
  document.getElementById('mResultSub').textContent = 'Campaign dispatched from your Gmail account.';

  if (failed > 0) {
    document.getElementById('mCompRing').style.background = 'linear-gradient(135deg,#f59e0b,#ef4444)';
    document.getElementById('mCompRing').style.boxShadow = '0 0 40px rgba(245,158,11,0.3)';
  }

  document.getElementById('mReportRows').innerHTML = MS.results.map(r =>
    '<div class="report-row">' +
    '<div style="font-weight:600;color:var(--text);font-size:14px">' + (r.name || '—') + '</div>' +
    '<div style="color:var(--text-2);font-size:14px">' + r.email + '</div>' +
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
  ME.blocks = []; ME.selectedId = null; ME.initialized = false;
  ['mCampName', 'mSheetId', 'mSubject', 'mHtmlTmpl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['mSheetResult', 'mFileResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('mColCard').style.display = 'none';
  if (ME.cm) ME.cm.setValue('');
  mGoStep(1, true);
}

/* ══════════════════════════════════════════════════════════════
   SAVE CAMPAIGN TO SUPABASE
══════════════════════════════════════════════════════════════ */
async function saveCampaign(type, name, total, success, folderLink) {
  const status = success === total ? 'completed' : (success > 0 ? 'partial' : 'failed');
  try {
    await apiFetch('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: name || 'Email Campaign',
        type: 'mail',
        total_count: total,
        sent_count: success,
        status: status
      })
    });
  } catch (e) {
    console.error('Campaign database save failed', e);
  }
}

/* ══════════════════════════════════════════════════════════════
   SWITCH SOURCE (sheets / file / manual)
══════════════════════════════════════════════════════════════ */
function mSwitchSrc(mode) {
  document.getElementById('mSrcSheets').style.display = mode === 'sheets' ? 'block' : 'none';
  document.getElementById('mSrcFile').style.display = mode === 'file' ? 'block' : 'none';
  document.getElementById('mSrcManual').style.display = mode === 'manual' ? 'block' : 'none';
  const hxEl = document.getElementById('mSrcHxForm');
  if (hxEl) hxEl.style.display = mode === 'hxform' ? 'block' : 'none';
  ['mSrcSheetsOpt', 'mSrcFileOpt', 'mSrcManualOpt', 'mSrcHxFormOpt'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  const activeId = { sheets: 'mSrcSheetsOpt', file: 'mSrcFileOpt', manual: 'mSrcManualOpt', hxform: 'mSrcHxFormOpt' }[mode];
  document.getElementById(activeId)?.classList.add('active');
  if (mode === 'manual') mManualRenderTable();
  if (mode === 'hxform') mLoadHxFormList();
}

async function mLoadHxFormList() {
  const sel = document.getElementById('mHxFormSelect');
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

async function mLoadHxFormData(formId) {
  if (!formId) return;
  const sel = document.getElementById('mHxFormSelect');
  const el = document.getElementById('mHxFormResult');
  sel.disabled = true;

  // ─── SHOW LOADING ANIMATION ───
  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border:1px solid var(--glass-border);border-radius:10px;background:var(--glass);margin-top:4px;font-size:14px;color:var(--text-2)">
    <svg style="flex-shrink:0;animation:spin 0.9s linear infinite" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
    Loading form data...
  </div>`;
  el.style.display = 'block';

  try {
    const token = localStorage.getItem('Honourix_token');
    const res = await fetch(`https://certiflow-backend-73xk.onrender.com/api/hxdb/data/${formId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    if (!data.rows?.length) {
      toast('No submissions in this form yet', 'warning');
      el.style.display = 'none';
      return;
    }

    MS.headers = data.headers;
    MS.rows = data.rows.map(r => Object.fromEntries(data.headers.map((h, i) => [h, r[i] || ''])));
    mPopulateDropdowns();

    // Force-set Name/Email if those columns exist
    const nameEl = document.getElementById('mNameCol');
    const emailEl = document.getElementById('mEmailCol');
    const nameH = data.headers.find(h => /^name$/i.test(h) || /submitted.*name/i.test(h) || h === 'Full Name');
    const emailH = data.headers.find(h => /email/i.test(h));
    if (nameH && nameEl) nameEl.value = nameH;
    if (emailH && emailEl) emailEl.value = emailH;

    // ─── PREMIUM UI INJECTION ───
    el.innerHTML = `
      <div class="notice notice-green" style="margin-bottom:16px;padding:14px 18px;border-radius:10px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><polyline points="20 6 9 17 4 12"/></svg>
        <span style="font-size:14px"><strong>${MS.rows.length} responses</strong> imported from <strong>${data.formName}</strong></span>
      </div>
      <div style="width:100%;box-sizing:border-box;overflow:auto;max-height:280px;border:1px solid var(--glass-border);border-radius:10px;background:var(--surface);scrollbar-width:thin;scrollbar-color:var(--glass-border-2) transparent">
        <table style="width:max-content;min-width:100%;border-collapse:collapse;text-align:left">
          <thead>
            <tr style="position:sticky;top:0;z-index:10;background:var(--surface);box-shadow:0 1px 0 var(--glass-border)">
              ${MS.headers.map(h => `<th style="padding:12px 16px;font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${MS.rows.map(r => `<tr style="border-top:1px solid rgba(255,255,255,0.03);transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
              ${MS.headers.map(h => `<td style="padding:10px 16px;font-size:13.5px;color:var(--text);white-space:nowrap">${(r[h] || '').toString().replace(/</g, '&lt;')}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    toast(`${MS.rows.length} recipients ready`, 'success');

  } catch (e) {
    el.style.display = 'none';
    toast('Could not load form: ' + e.message, 'error');
  } finally {
    sel.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   MANUAL ENTRY — mirrors combined-tool exactly
══════════════════════════════════════════════════════════════ */
function mManualRenderTable() {
  const thead = document.getElementById('mManualHeaderRow');
  const tbody = document.getElementById('mManualBody');
  if (!thead || !tbody) return;

  // Header row (Now with the '#' column at the start)
  thead.innerHTML = '<th style="width:36px; text-align:center; padding:10px 0;">#</th>' +
    mManualCols.map(col => {
      const locked = M_LOCKED_COLS.includes(col);
      return `<th>
        <div class="manual-col-header">
          <span>${col}</span>
          ${locked
          ? `<span title="Required" style="color:var(--cyan);font-size:10px;font-weight:700;margin-left:2px">✱</span>`
          : `<button class="manual-col-del" onclick="mManualDeleteColumn('${col}')" title="Remove column">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>`}
        </div>
      </th>`;
    }).join('') + '<th style="width:36px"></th>';

  // Body rows (Now injecting the row index + 1 at the start of each row)
  tbody.innerHTML = mManualRows.map((row, ri) => `
    <tr>
      <td><div style="font-size:12px; color:var(--text-3); text-align:center; font-weight:600;">${ri + 1}</div></td>
      ${mManualCols.map(col => {
    const locked = M_LOCKED_COLS.includes(col);
    return `<td>
          <input type="${locked ? 'email' : 'text'}"
            placeholder="${locked ? 'email@example.com' : col}"
            value="${(row[col] || '').replace(/"/g, '&quot;')}"
            oninput="mManualRows[${ri}]['${col}']=this.value"
            style="${locked ? 'border-color:rgba(0,212,255,0.2)' : ''}"/>
        </td>`;
  }).join('')}
      <td><button class="manual-row-del" onclick="mManualRemoveRow(${ri})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button></td>
    </tr>
  `).join('');
}

function mManualAddRow() {
  const row = {};
  mManualCols.forEach(c => row[c] = '');
  mManualRows.push(row);
  mManualRenderTable();
}

function mManualRemoveRow(idx) {
  if (mManualRows.length <= 1) { toast('Need at least one row', 'warning'); return; }
  mManualRows.splice(idx, 1);
  mManualRenderTable();
}

function mManualAddColumn() {
  const name = prompt('Column name:');
  if (!name || !name.trim()) return;
  const col = name.trim();
  if (mManualCols.includes(col)) { toast('Column already exists', 'warn'); return; }
  mManualCols.push(col);
  mManualRows.forEach(r => r[col] = '');
  mManualRenderTable();
}

function mManualDeleteColumn(col) {
  if (M_LOCKED_COLS.includes(col)) { toast('Email column is required and cannot be removed', 'warn'); return; }
  mManualCols = mManualCols.filter(c => c !== col);
  mManualRows.forEach(r => delete r[col]);
  mManualRenderTable();
}

function mManualRemoveColumn(ci) {
  const col = mManualCols[ci];
  if (col === 'Email') { toast('The Email column is required and cannot be removed.', 'error'); return; }
  if (col === 'Name') { toast('Cannot remove default columns', 'warning'); return; }
  mManualCols.splice(ci, 1);
  mManualRows.forEach(r => delete r[col]);
  mManualRenderTable();
}

function mManualApplyData() {
  // Validate: all Email fields must be filled
  const emptyEmails = mManualRows.filter(r => !r['Email'] || !r['Email'].trim());
  if (emptyEmails.length) {
    toast(`${emptyEmails.length} row(s) missing Email — Email is required for all rows`, 'error');
    return;
  }
  const validRows = mManualRows.filter(r => mManualCols.some(c => r[c] && r[c].trim()));
  if (!validRows.length) { toast('Add at least one recipient', 'error'); return; }
  MS.headers = [...mManualCols];
  MS.rows = validRows;
  mPopulateDropdowns();
  // Auto-select Email column
  const emailSel = document.getElementById('mEmailCol');
  if (emailSel) emailSel.value = 'Email';
  const msg = document.getElementById('mManualLoadedMsg');
  msg.innerHTML = `<div class="notice notice-green">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    <span><strong>${validRows.length} recipients</strong> loaded from manual entry</span>
  </div>`;
  msg.style.display = 'block';
  toast(validRows.length + ' recipients applied', 'success');
}

/* ══════════════════════════════════════════════════════════════
   TEMPLATE GATE — Step 2 entry screen
══════════════════════════════════════════════════════════════ */

// Category mapping for each template key
const ME_TPL_CATS = {
  cert: 'certificate', welcome: 'welcome', promo: 'promo',
  classic: 'welcome', newsletter: 'newsletter', event: 'event',
  saas: 'welcome', thankyou: 'welcome', announcement: 'promo', plain: 'welcome',
};

let meTplGateSelected = null; // currently selected template key in gate

function meTplGateBuild() {
  const grid = document.getElementById('meTplGateGrid');
  if (!grid) return;

  // Blank card first + Paste Code card
  const blankHtml = `
    <div class="me-tpl-gate-card" id="meTplGateCard_blank" onclick="meTplGateSelect('blank')" data-cat="all">
      <div class="me-tpl-gate-thumb" style="background:linear-gradient(135deg,#1e293b,#0f172a);display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" style="width:40px;height:40px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>
      </div>
      <div class="me-tpl-gate-info">
        <div class="me-tpl-gate-name">Blank Canvas</div>
        <div class="me-tpl-gate-desc">Start from scratch</div>
      </div>
    </div>
    <div class="me-tpl-gate-card" id="meTplGateCard_paste" onclick="meTplGateSelect('paste')" data-cat="all">
      <div class="me-tpl-gate-thumb" style="background:linear-gradient(135deg,#0d9488,#0f172a);display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" style="width:40px;height:40px"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
      </div>
      <div class="me-tpl-gate-info">
        <div class="me-tpl-gate-name">Paste Code</div>
        <div class="me-tpl-gate-desc">Write or paste pure HTML (Advanced)</div>
      </div>
    </div>`;

  const cards = Object.entries(ME_TEMPLATES).map(([key, tpl]) => {
    const cat = ME_TPL_CATS[key] || 'all';
    const previewHtml = meGetHtmlFromBlocks(tpl.blocks);
    const escapedHtml = previewHtml.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `
      <div class="me-tpl-gate-card" id="meTplGateCard_${key}" onclick="meTplGateSelect('${key}')" data-cat="${cat}">
        <div class="me-tpl-gate-thumb">
          <iframe srcdoc="${escapedHtml}" scrolling="no" tabindex="-1"></iframe>
          <div class="me-tpl-gate-thumb-overlay"></div>
        </div>
        <div class="me-tpl-gate-info">
          <div class="me-tpl-gate-name">${tpl.name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}\u{2B50}\u{2B55}\u{1F004}\u{1F0CF}\u{1F18E}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}]/gu, '').trim()}</div>
          <div class="me-tpl-gate-desc">${tpl.desc || ''}</div>
        </div>
      </div>`;
  });

  grid.innerHTML = blankHtml + cards.join('');
}

function meTplGateFilter(cat, btn) {
  // Update active button
  document.querySelectorAll('.me-tpl-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Show/hide cards
  document.querySelectorAll('#meTplGateGrid .me-tpl-gate-card').forEach(card => {
    const cardCat = card.dataset.cat || 'all';
    card.style.display = (cat === 'all' || cardCat === cat || card.id === 'meTplGateCard_blank') ? '' : 'none';
  });
}

function meTplGateSelect(key) {
  meTplGateSelected = key;
  document.querySelectorAll('#meTplGateGrid .me-tpl-gate-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById('meTplGateCard_' + key);
  if (card) card.classList.add('selected');
  const btn = document.getElementById('meTplGateUseBtn');
  if (btn) { btn.disabled = false; btn.textContent = key === 'blank' ? 'Start with Blank Canvas →' : 'Use Template — Open Editor →'; }
}

function meTplGateConfirm() {
  if (!meTplGateSelected) return;
  meLoadTemplateAndOpenEditor(meTplGateSelected);
}

function meLoadTemplateAndOpenEditor(key) {
  if (key === 'paste') {
    ME.mode = 'code';
    ME.blocks = [];
    ME.selectedId = null;
    document.getElementById('mHtmlTmpl').value = '';
    if (ME.cm) {
      ME.cm.setValue('');
      ME.cm.setOption('readOnly', false);
    }
  } else if (key === 'blank') {
    ME.mode = 'visual';
    ME.blocks = [];
    ME.selectedId = null;
    meRenderCanvas();
    meSyncToCode();
  } else {
    ME.mode = 'visual';
    const tpl = ME_TEMPLATES[key];
    if (!tpl) return;
    ME.blocks = tpl.blocks.map(b => ({
      id: 'b' + (ME.nextId++),
      type: b.type,
      props: JSON.parse(JSON.stringify(b.props)),
    }));
    ME.selectedId = null;
    meRenderCanvas();
    meSyncToCode();
  }

  // Show editor, hide gate
  document.getElementById('meTplGate').style.display = 'none';
  document.getElementById('meEditorWrap').classList.add('visible');
  document.getElementById('meTabBarWrap').style.display = '';
  document.getElementById('meAiToggleBtn').style.display = '';
  document.getElementById('meStep2Nav').style.display = '';

  // Conditionally display Visual tab and Sync functionality
  const tabVisual = document.getElementById('meTabVisual');
  const btnApplyCode = document.getElementById('meBtnApplyCode');
  const btnCopyCode = document.getElementById('meBtnCopyCode');
  const codeSaveNotice = document.getElementById('meCodeSaveNotice');

  if (ME.mode === 'code') {
    if (tabVisual) tabVisual.style.display = 'none';
    if (btnApplyCode) btnApplyCode.style.display = 'none';
    if (btnCopyCode) btnCopyCode.style.display = 'none';
    if (codeSaveNotice) codeSaveNotice.style.display = 'none';
    meSwitchTab('code');       // Force switch to code view
    if (ME.cm) {
      ME.cm.setOption('readOnly', false);
      ME.cm.getWrapperElement().classList.remove('CodeMirror-readonly');
    }
  } else {
    if (tabVisual) tabVisual.style.display = '';
    if (btnApplyCode) btnApplyCode.style.display = 'none';
    if (btnCopyCode) btnCopyCode.style.display = '';
    if (codeSaveNotice) codeSaveNotice.style.display = 'block';
    if (ME.cm) {
      ME.cm.setOption('readOnly', 'nocursor');
      // Adding purely visually helpful readOnly class
      ME.cm.getWrapperElement().classList.add('CodeMirror-readonly');
    }
    meSwitchTab('visual');
  }

  // Update header sub-text
  const sub = document.querySelector('#meCard .me-head > div > div[style*="color:var(--text-3)"]');
  if (sub) sub.textContent = 'Build visually, edit code, preview — all in sync';

  // Init CM if not done yet
  if (!ME.initialized) meOnStepEnterInternal();
  else if (ME.cm) ME.cm.refresh();
  if (ME.mode !== 'code') meSwitchTab('visual');
  meBuildMergeTagsRow();
  meInitSortable();

  // Snap back to top of the card
  const editorCard = document.getElementById('meCard');
  if (editorCard) {
    editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function meBackToGate() {
  document.getElementById('meTplGate').style.display = '';
  document.getElementById('meEditorWrap').classList.remove('visible');
  document.getElementById('meTabBarWrap').style.display = 'none';
  document.getElementById('meAiToggleBtn').style.display = 'none';
  document.getElementById('meStep2Nav').style.display = 'none';
  meTplGateSelected = null;
  document.querySelectorAll('#meTplGateGrid .me-tpl-gate-card').forEach(c => c.classList.remove('selected'));
  const btn = document.getElementById('meTplGateUseBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Use Template — Open Editor'; }
}

// Override meOnStepEnter to use the gate
function meOnStepEnter() {
  meTplGateBuild();
  meBuildMergeTagsRow();

  // If already has blocks (returning to step 2), skip gate and show editor directly
  if (ME.blocks.length > 0) {
    document.getElementById('meTplGate').style.display = 'none';
    document.getElementById('meEditorWrap').classList.add('visible');
    document.getElementById('meTabBarWrap').style.display = '';
    document.getElementById('meAiToggleBtn').style.display = '';
    document.getElementById('meStep2Nav').style.display = '';
    if (!ME.initialized) meOnStepEnterInternal();
    else if (ME.cm) ME.cm.refresh();
    return;
  }
}

function meOnStepEnterInternal() {
  if (ME.initialized) {
    if (ME.cm) ME.cm.refresh();
    return;
  }
  ME.initialized = true;

  const wrapper = document.getElementById('meCmWrap');
  if (!wrapper) return;
  ME.cm = CodeMirror(wrapper, {
    mode: 'htmlmixed',
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 2,
    indentWithTabs: false,
    autofocus: false,
    readOnly: (ME.mode === 'code' ? false : 'nocursor'),
    extraKeys: { 'Ctrl-Space': 'autocomplete' },
    value: document.getElementById('mHtmlTmpl').value || '',
  });

  if (ME.mode !== 'code') {
    ME.cm.getWrapperElement().classList.add('CodeMirror-readonly');
  }

  wrapper.querySelector('.CodeMirror').style.background = '#080f1e';
  wrapper.querySelector('.CodeMirror').style.color = '#f8f8f2';
  ME.cm.on('change', () => {
    clearTimeout(ME.cmDebounce);
    ME.cmDebounce = setTimeout(() => {
      document.getElementById('mHtmlTmpl').value = ME.cm.getValue();
      if (ME.activeTab === 'preview') meRefreshPreviewIframe();
    }, 400);
  });
  if (ME.blocks.length) meSyncToCode();
}

// Override meLoadTemplate (old floating picker calls) to use the new approach
function meLoadTemplate(key) {
  meTplGateSelect(key);
  meTplGateConfirm();
}
function meShowTemplatePicker() { meBackToGate(); }
function meHideTemplatePicker() { }

// Override meBuildTemplatePicker to do nothing (gate handles it now)
function meBuildTemplatePicker() { }

/* ══════════════════════════════════════════════════════════════
   UNDO / REDO
══════════════════════════════════════════════════════════════ */
const ME_HISTORY = [];
let ME_HIST_IDX = -1;
const ME_HIST_MAX = 30;

function mePushHistory() {
  // Trim forward history if we're not at the end
  if (ME_HIST_IDX < ME_HISTORY.length - 1) {
    ME_HISTORY.splice(ME_HIST_IDX + 1);
  }
  ME_HISTORY.push(JSON.parse(JSON.stringify(ME.blocks)));
  if (ME_HISTORY.length > ME_HIST_MAX) ME_HISTORY.shift();
  ME_HIST_IDX = ME_HISTORY.length - 1;
}

function meUndo() {
  if (ME_HIST_IDX <= 0) { toast('Nothing to undo', 'info', 1200); return; }
  ME_HIST_IDX--;
  ME.blocks = JSON.parse(JSON.stringify(ME_HISTORY[ME_HIST_IDX]));
  ME.selectedId = null;
  meRenderCanvas();
  meRenderProps(null);
  meSyncToCode();
  toast('Undo', 'info', 900);
}

function meRedo() {
  if (ME_HIST_IDX >= ME_HISTORY.length - 1) { toast('Nothing to redo', 'info', 1200); return; }
  ME_HIST_IDX++;
  ME.blocks = JSON.parse(JSON.stringify(ME_HISTORY[ME_HIST_IDX]));
  ME.selectedId = null;
  meRenderCanvas();
  meRenderProps(null);
  meSyncToCode();
  toast('Redo', 'info', 900);
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); meUndo();
    }
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); meRedo();
    }
  }
});

// Patch meAddBlock, meDeleteBlock, meDuplicateBlock, meMoveBlock to push history
const _meAddBlock_orig = meAddBlock;
const _meDeleteBlock_orig = meDeleteBlock;
const _meDuplicateBlock_orig = meDuplicateBlock;
const _meMoveBlock_orig = meMoveBlock;

meAddBlock = function (type) {
  mePushHistory();
  _meAddBlock_orig(type);
};
meDeleteBlock = function (id) {
  mePushHistory();
  _meDeleteBlock_orig(id);
};
meDuplicateBlock = function (id) {
  mePushHistory();
  _meDuplicateBlock_orig(id);
};
meMoveBlock = function (id, dir) {
  mePushHistory();
  _meMoveBlock_orig(id, dir);
};

/* ══════════════════════════════════════════════════════════════
   SORTABLEJS — drag to reorder blocks
══════════════════════════════════════════════════════════════ */
let meSortableInstance = null;

function meInitSortable() {
  const canvas = document.getElementById('meCanvas');
  if (!canvas || typeof Sortable === 'undefined') return;
  if (meSortableInstance) meSortableInstance.destroy();

  meSortableInstance = Sortable.create(canvas, {
    animation: 150,
    handle: '.me-drag-handle',
    draggable: '.me-block-wrap',
    ghostClass: 'me-sort-ghost',
    chosenClass: 'me-sort-chosen',
    onStart: () => mePushHistory(),
    onEnd: (evt) => {
      const oldIdx = evt.oldIndex;
      const newIdx = evt.newIndex;
      if (oldIdx === newIdx) return;
      const moved = ME.blocks.splice(oldIdx, 1)[0];
      ME.blocks.splice(newIdx, 0, moved);
      meSyncToCode();
    },
  });

  // Add ghost/chosen styles once
  if (!document.getElementById('me-sortable-style')) {
    const s = document.createElement('style');
    s.id = 'me-sortable-style';
    s.textContent = '.me-sort-ghost{opacity:0.3;background:rgba(0,212,255,0.08)!important}.me-sort-chosen{outline:2px solid var(--cyan)!important}';
    document.head.appendChild(s);
  }
}

// Patch meRenderCanvas to re-init sortable and add drag handles after render
const _meRenderCanvas_orig = meRenderCanvas;
meRenderCanvas = function () {
  _meRenderCanvas_orig();
  // Add drag handles to each block
  document.querySelectorAll('.me-block-wrap').forEach(wrap => {
    if (!wrap.querySelector('.me-drag-handle')) {
      const handle = document.createElement('div');
      handle.className = 'me-drag-handle';
      handle.title = 'Drag to reorder';
      handle.innerHTML = '<span></span><span></span><span></span><span></span><span></span><span></span>';
      wrap.appendChild(handle);
    }
  });
  meInitSortable();
};

/* ══════════════════════════════════════════════════════════════
   INLINE TEXT EDITING — double-click blocks
══════════════════════════════════════════════════════════════ */
let meInlineToolbar = null;

function meEnableInlineEdit(blockId) {
  const blockEl = document.querySelector(`.me-block-wrap[data-id="${blockId}"]`);
  const inner = blockEl && blockEl.querySelector('.me-block-inner');
  if (!inner) return;
  const block = ME.blocks.find(b => b.id === blockId);
  if (!block || !['header', 'text', 'footer', 'logo'].includes(block.type)) return;

  // Remove any existing toolbar
  meCloseInlineEdit();

  inner.contentEditable = 'true';
  inner.focus();

  // Create floating toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'me-inline-toolbar';
  toolbar.id = 'meInlineToolbar';
  toolbar.innerHTML = `
    <button class="me-itb-btn" title="Bold" onmousedown="event.preventDefault();document.execCommand('bold')"><strong>B</strong></button>
    <button class="me-itb-btn" title="Italic" onmousedown="event.preventDefault();document.execCommand('italic')"><em>I</em></button>
    <button class="me-itb-btn" title="Underline" onmousedown="event.preventDefault();document.execCommand('underline')"><u>U</u></button>
    <div class="me-itb-sep"></div>
    <button class="me-itb-btn" title="Done editing" onmousedown="event.preventDefault();meCloseInlineEdit()" style="font-size:11px;color:var(--cyan);font-weight:700">Done</button>
  `;
  blockEl.style.position = 'relative';
  blockEl.appendChild(toolbar);
  meInlineToolbar = toolbar;

  // On blur, save content back to block
  const saveContent = () => {
    const text = inner.innerText || inner.textContent || '';
    block.props.text = text;
    inner.contentEditable = 'false';
    inner.blur();
    toolbar.remove();
    meInlineToolbar = null;
    meSyncToCode();
  };

  inner.addEventListener('blur', saveContent, { once: true });
}

function meCloseInlineEdit() {
  if (meInlineToolbar) { meInlineToolbar.remove(); meInlineToolbar = null; }
  document.querySelectorAll('.me-block-inner[contenteditable="true"]').forEach(el => {
    el.contentEditable = 'false';
  });
}

// Patch meRenderCanvas to add double-click listeners
const _meRenderCanvas_orig2 = meRenderCanvas;
meRenderCanvas = function () {
  _meRenderCanvas_orig2();
  document.querySelectorAll('.me-block-wrap').forEach(wrap => {
    const blockId = wrap.dataset.id;
    const block = ME.blocks.find(b => b.id === blockId);
    if (!block || !['header', 'text', 'footer', 'logo'].includes(block.type)) return;
    wrap.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      meEnableInlineEdit(blockId);
    }, { once: false });
  });
};

/* ══════════════════════════════════════════════════════════════
   AI CHAT PANEL
══════════════════════════════════════════════════════════════ */
let meAiChatHistory = [];
let meAiIsLoading = false;

function meToggleAiPanel() {
  const panel = document.getElementById('meAiPanel');
  const toggle = document.getElementById('meAiToggleBtn');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (toggle) toggle.classList.toggle('active', isOpen);
}

function meAiAppendBubble(role, content, isTyping) {
  const chat = document.getElementById('meAiChat');
  if (!chat) return null;

  const div = document.createElement('div');
  div.className = 'me-ai-bubble ' + role;

  if (isTyping) {
    div.classList.add('typing');
    div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  } else if (role === 'ai') {
    div.innerHTML = `<div class="ai-avatar">✨ Gemini AI</div>${content.replace(/\n/g, '<br>')}`;
  } else {
    div.textContent = content;
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function meAiApplySuggestions(suggestions) {
  const chat = document.getElementById('meAiChat');
  if (!chat || !suggestions || !suggestions.length) return;

  const div = document.createElement('div');
  div.className = 'me-ai-bubble ai';
  const btns = suggestions.map((s, i) =>
    `<button class="me-ai-suggestion-btn" onclick="meAiApplySubject(this,'${s.replace(/'/g, "\\'")}')">
      <span style="color:var(--text-3);font-size:11px;margin-right:5px">${i + 1}.</span>${s}
    </button>`
  ).join('');
  div.innerHTML = `<div class="ai-avatar">✨ Gemini AI</div>
    <div style="margin-bottom:8px">Here are 5 subject line suggestions. Click one to apply:</div>
    <div class="me-ai-suggestions">${btns}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function meAiApplySubject(btn, subject) {
  const el = document.getElementById('mSubject');
  if (el) {
    el.value = subject;
    el.style.borderColor = 'rgba(0,212,255,0.6)';
    setTimeout(() => el.style.borderColor = '', 1500);
    toast('Subject applied: ' + subject.slice(0, 40) + '…', 'success', 2000);
  }
  btn.style.background = 'rgba(16,185,129,0.2)';
  btn.style.borderColor = 'rgba(16,185,129,0.35)';
}

async function meAiSend() {
  const input = document.getElementById('meAiInput');
  if (!input || meAiIsLoading) return;

  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  input.style.height = 'auto';
  meAiIsLoading = true;
  document.getElementById('meAiSendBtn').disabled = true;

  meAiAppendBubble('user', msg);
  const typingEl = meAiAppendBubble('ai', '', true);

  meAiChatHistory.push({ role: 'user', content: msg });

  try {
    mePushHistory(); // save undo snapshot before AI modifies canvas

    const body = {
      userMessage: msg,
      mode: ME.mode || 'visual',
      htmlModeText: (ME.mode === 'code' && ME.cm) ? ME.cm.getValue() : '',
      currentBlocks: ME.blocks,
      headers: MS.headers,
      chatHistory: meAiChatHistory.slice(-10),
      selectedBlockId: ME.selectedId,
    };

    // ── FIXED: Native Fetch with Authorization ──
    const token = localStorage.getItem('Honourix_token');
    const response = await fetch('https://certiflow-backend-73xk.onrender.com/api/ai/generate-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(body),
    });
    const res = await response.json();
    // ──────────────────────────────────────────

    if (typingEl) typingEl.remove();

    // Plan gate
    if (response.status === 403 && res.error === 'AI_LOCKED') {
      meAiAppendBubble('ai', '🔒 AI features require a **Pro plan**. [Upgrade in Settings →](settings.html#billing)');
      return;
    }
    const action = res.action;
    const message = res.message || '';

    meAiChatHistory.push({ role: 'model', content: message });

    if (action === 'replace_html' && res.html && ME.mode === 'code') {
      if (typeof res.html === 'string' && ME.cm) {
        ME.cm.setValue(res.html);
        document.getElementById('mHtmlTmpl').value = res.html;
        meRefreshPreviewIframe();
      }
      meAiAppendBubble('ai', message || 'Your HTML code has been updated directly!');
      toast('AI updated your HTML', 'success', 2000);

    } else if (action === 'replace_blocks' && res.blocks && res.blocks.length) {
      ME.blocks = res.blocks.map(b => ({
        id: b.id || ('b' + (ME.nextId++)),
        type: b.type,
        props: b.props || {},
      }));
      ME.selectedId = null;
      meRenderCanvas();
      meRenderProps(null);
      meSyncToCode();
      meAiAppendBubble('ai', message || 'Done! Your email has been updated.');
      toast('AI updated your email', 'success', 2000);

    } else if (action === 'update_block' && res.blockId && res.props) {
      const block = ME.blocks.find(b => b.id === res.blockId) || ME.blocks.find(b => b.id === ME.selectedId);
      if (block) {
        Object.assign(block.props, res.props);
        const inner = document.querySelector(`.me-block-wrap[data-id="${block.id}"] .me-block-inner`);
        if (inner) inner.innerHTML = meBlockToHtml(block);
        meSyncToCode();
        meAiAppendBubble('ai', message || 'Block updated!');
      } else {
        meAiAppendBubble('ai', message || 'Could not find block to update. Please select a block first.');
      }

    } else if (action === 'subject_suggestions' && res.suggestions) {
      meAiApplySuggestions(res.suggestions);

    } else {
      // reply_only or unknown
      meAiAppendBubble('ai', message || 'I\'m here to help! Try asking me to generate or modify your email.');
    }

  } catch (err) {
    if (typingEl) typingEl.remove();
    meAiAppendBubble('ai', 'Sorry, something went wrong: ' + (err.message || 'Unknown error'));
  } finally {
    meAiIsLoading = false;
    document.getElementById('meAiSendBtn').disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   PATCH mNewCampaign to reset gate state
══════════════════════════════════════════════════════════════ */
const _mNewCampaign_orig = mNewCampaign;
mNewCampaign = function () {
  _mNewCampaign_orig();
  // Reset gate
  meTplGateSelected = null;
  meAiChatHistory = [];
  ME_HISTORY.length = 0;
  ME_HIST_IDX = -1;
  const gate = document.getElementById('meTplGate');
  const wrap = document.getElementById('meEditorWrap');
  if (gate) gate.style.display = '';
  if (wrap) wrap.classList.remove('visible');
  const tabBar = document.getElementById('meTabBarWrap');
  const aiBtn = document.getElementById('meAiToggleBtn');
  const nav = document.getElementById('meStep2Nav');
  if (tabBar) tabBar.style.display = 'none';
  if (aiBtn) aiBtn.style.display = 'none';
  if (nav) nav.style.display = 'none';
  // Reset AI chat
  const aiChat = document.getElementById('meAiChat');
  if (aiChat) aiChat.innerHTML = `<div class="me-ai-bubble ai">
    <div class="ai-avatar">✨ Gemini AI</div>
    Hi! I can help you create beautiful email designs. Try asking me:<br><br>
    <strong>• "Generate a professional welcome email"</strong><br>
    <strong>• "Make the header dark blue and bold"</strong><br>
    <strong>• "Suggest 5 subject lines"</strong><br>
    <strong>• Paste any HTML to import it</strong>
  </div>`;
  // Close AI panel
  const panel = document.getElementById('meAiPanel');
  if (panel) panel.classList.remove('open');
};

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

  // Start cycling suggestions in the greeting screen
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

  // Set greeting name from JWT token
  window.galAiSetGreetName = function () {
    try {
      const token = localStorage.getItem('Honourix_token');
      if (!token) return;
      const payload = JSON.parse(atob(token.split('.')[1]));
      const firstName = (payload.name || '').split(' ')[0] || 'there';
      const el = document.getElementById('galAiGreetName');
      if (el) el.innerHTML = `How can I help you today,<br>${firstName}`;
    } catch (e) { }
  };

  // Toggle panel open/close
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
  // Old name still used by AI JS below
  window.meToggleAiPanel = window.galAiToggle;

  // Show greeting / hide greeting based on chat messages
  window.galAiSyncGreeting = function () {
    const chat = document.getElementById('meAiChat');
    const greet = document.getElementById('galAiGreeting');
    if (!chat || !greet) return;
    const hasMessages = Array.from(chat.children).some(c => c.id !== 'galAiGreeting' && c.tagName !== 'STYLE');
    greet.style.display = hasMessages ? 'none' : 'flex';
  };

  // ── Resize handle ──
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

  // Show FAB when template is selected (editor becomes visible)
  const _origOpen = window.meLoadTemplateAndOpenEditor;
  window.meLoadTemplateAndOpenEditor = function (key) {
    if (_origOpen) _origOpen.apply(this, arguments);
    const fab = document.getElementById('galAiFab');
    if (fab) fab.classList.add('visible');
  };

  // Patch meAiAppendBubble for Gemini Layout (Right align User, Center AI, Custom Statuses)
  // Patch meAiAppendBubble for Gemini Layout (Right align User Box, Center/Unboxed AI)
  window.meAiAppendBubble = function (role, content, isTyping) {
    const chat = document.getElementById('meAiChat');
    if (!chat) return null;
    const wrap = document.createElement('div');
    const id = 'msg_' + Date.now();
    wrap.id = id;

    if (role === 'user') {
      // User: Right Aligned, Inside a Box
      wrap.style.cssText = 'background:rgba(255,255,255,0.08); color:var(--text); padding:14px 20px; border-radius:18px 18px 4px 18px; max-width:85%; align-self:flex-end; font-size:15px; line-height:1.5; font-family:"Plus Jakarta Sans"; margin-bottom:24px; border:1px solid rgba(255,255,255,0.05);';
      wrap.textContent = content;
    } else {
      // AI: Unboxed, slightly wider, centered feel with sparkle
      wrap.style.cssText = 'display:flex; gap:16px; align-self:flex-start; width:100%; color:var(--text); font-size:15px; line-height:1.7; font-family:"Plus Jakarta Sans"; margin-bottom:24px; background:transparent; border:none; padding:0;';

      if (isTyping) {
        const statuses = ['Analyzing style', 'Drafting copy', 'Designing blocks'];
        let sIdx = 0;
        wrap.innerHTML = `
          <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #00d4ff, #7c3aed); display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; box-shadow:0 4px 12px rgba(124,58,237,0.3); margin-top:2px;">✨</div>
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
        // Parse Markdown & Clickable Options
        let parsedContent = content.replace(/\n/g, '<br>');
        parsedContent = parsedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        parsedContent = parsedContent.replace(/\*(.*?)\*/g, '<em>$1</em>');
        parsedContent = parsedContent.replace(/<br>[•\-\*]\s+(.+)/g, '<br><div class="ai-clickable-option" onclick="applyAiOption(this.innerText)">$1</div>');
        parsedContent = parsedContent.replace(/<br>\d+\.\s+(.+)/g, '<br><div class="ai-clickable-option" onclick="applyAiOption(this.innerText)">$1</div>');

        wrap.innerHTML = `
          <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #00d4ff, #7c3aed); display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; box-shadow:0 4px 12px rgba(124,58,237,0.3); margin-top:2px;">✨</div>
          <div style="flex:1;">${parsedContent}</div>`;
      }
    }

    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;

    // Hide Greeting explicitly when chat begins
    const greet = document.getElementById('galAiGreeting');
    if (greet) greet.style.display = 'none';

    return wrap;
  };

  // Patch meAiApplySuggestions to use Gal AI suggestion button style
  const _origSugg = window.meAiApplySuggestions;
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

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    galAiSyncGreeting();
    galAiStartCycle();
    galAiSetGreetName();
  });

})();

/* ════════════════════════════════════════════════════════════════
   AI CLICKABLE OPTION HANDLER
════════════════════════════════════════════════════════════════ */
window.applyAiOption = function (text) {
  // 1. If user was last typing in the Subject Field, update the subject!
  if (window.meLastFocusedField && window.meLastFocusedField.id === 'mSubject') {
    const subj = document.getElementById('mSubject');
    if (subj) {
      subj.value = text;
      if (typeof meToast === 'function') meToast('Subject updated!', 'success');
      return;
    }
  }

  // 2. If user has a Text block actively selected on the Canvas, update it!
  if (typeof ME !== 'undefined' && ME.selectedId) {
    const b = ME.blocks.find(x => x.id === ME.selectedId);
    if (b && (b.type === 'text' || b.type === 'title')) {
      b.props.text = text;
      if (typeof meRenderCanvas === 'function') meRenderCanvas();
      if (typeof meToast === 'function') meToast('Text block updated!', 'success');
      return;
    }
  }

  // 3. Fallback: Copy to clipboard
  navigator.clipboard.writeText(text);
  if (typeof meToast === 'function') meToast('Copied to clipboard!', 'info');
};

/* ════════════════════════════════════════════════════════════════
   DYNAMIC IFRAME RESIZER & CUSTOM SCROLLBARS
════════════════════════════════════════════════════════════════ */
window.resizeMailPreview = function () {
  const iframe = document.getElementById('mPreviewIframe');
  if (!iframe) return;

  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;

    // Auto-Expand Height with precisely no artificial gap
    setTimeout(() => {
      const body = doc.body;
      const h = doc.documentElement;

      // Clear out artificial margin/padding to eliminate gap at the bottom
      if (body) {
        body.style.margin = '0';
        body.style.padding = '0';
        body.style.overflow = 'hidden'; // Hide internal scrollbar to prevent gliching
      }

      // Calculate perfect height bounding entirely on actual content 
      const realHeight = Math.max(
        body.scrollHeight, body.offsetHeight,
        h.clientHeight, h.scrollHeight, h.offsetHeight, 340
      );

      iframe.style.height = realHeight + 'px';
    }, 50);

  } catch (e) {
    console.warn("Could not resize iframe due to cross-origin or loading state.");
  }
};

window.mSetDeviceS3 = function (device) {
  const frame = document.getElementById('mPrvBoxS3');
  if (!frame) return;
  document.getElementById('mBtnDesktopS3').classList.toggle('active', device === 'desktop');
  document.getElementById('mBtnMobileS3').classList.toggle('active', device === 'mobile');

  if (device === 'mobile') {
    frame.style.width = '375px';
  } else {
    frame.style.width = '100%';
  }

  // Automatically trigger height recalculation for the new width
  if (window.resizeMailPreview) window.resizeMailPreview();
};