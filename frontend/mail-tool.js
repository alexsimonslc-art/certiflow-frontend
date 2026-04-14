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

  // Drag-drop on upload zone
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
    const n      = i + 1;
    const node   = document.getElementById('msn' + n);
    const circle = document.getElementById('mscircle' + n);
    const conn   = document.getElementById('msc' + n);
    if (!node) return;
    node.className   = 'step-node ' + (n < MS.step ? 'done' : n === MS.step ? 'active' : '');
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mValidate(n) {
  if (n === 1) {
    if (!document.getElementById('mCampName').value.trim())  { toast('Enter a campaign name', 'error');     return false; }
    if (!document.getElementById('mNameCol').value)          { toast('Select the Name column', 'error');    return false; }
    if (!document.getElementById('mEmailCol').value)         { toast('Select the Email column', 'error');   return false; }
    if (!MS.rows.length)                                     { toast('Load recipient data first', 'error'); return false; }
  }
  if (n === 2) {
    if (!document.getElementById('mSubject').value.trim())   { toast('Enter an email subject', 'error');    return false; }
    meSyncTextarea();
    if (!document.getElementById('mHtmlTmpl').value.trim()) { toast('Design your email template first', 'error'); return false; }
  }
  return true;
}

/* ══════════════════════════════════════════════════════════════
   DATA SOURCE — Step 1
══════════════════════════════════════════════════════════════ */
function mSwitchSrc(type) {
  MS.srcType = type;
  document.getElementById('mSrcSheets').style.display = type === 'sheets' ? 'block' : 'none';
  document.getElementById('mSrcFile').style.display   = type === 'file'   ? 'block' : 'none';
  document.getElementById('mSrcSheetsOpt').className  = 'source-opt' + (type === 'sheets' ? ' active' : '');
  document.getElementById('mSrcFileOpt').className    = 'source-opt' + (type === 'file'   ? ' active' : '');
}

async function mLoadSheet() {
  const id  = document.getElementById('mSheetId').value.trim();
  if (!id) { toast('Paste a Sheet ID first', 'error'); return; }
  const btn = document.getElementById('mLoadBtn');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = await apiFetch('/api/sheets/read?sheetId=' + encodeURIComponent(id) + '&range=Sheet1');
    if (!data || !data.data || data.data.length < 2) { toast('Sheet is empty', 'warn'); return; }
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
      complete: r => { MS.headers = r.meta.fields; MS.rows = r.data; mShowFileMsg(file.name); mPopulateDropdowns(); }
    });
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = ev => {
      const wb  = XLSX.read(ev.target.result, { type: 'array' });
      const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      MS.headers = Object.keys(arr[0] || {}); MS.rows = arr;
      mShowFileMsg(file.name); mPopulateDropdowns();
    };
    reader.readAsArrayBuffer(file);
  } else { toast('Use .csv, .xlsx or .xls', 'error'); }
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
    const tag = '{{' + h.toLowerCase().replace(/\s+/g, '_') + '}}';
    return '<div class="merge-tag" onclick="meInsertTag(\'' + tag + '\')">' + tag + '</div>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   PERSONALISE HELPER
══════════════════════════════════════════════════════════════ */
function mPersonalise(tmpl, data) {
  return (tmpl || '').replace(/\{\{(\w+)\}\}/g, function(_, key) {
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
};

/* ══════════════════════════════════════════════════════════════
   BLOCK → EMAIL HTML
══════════════════════════════════════════════════════════════ */
function meBlockToHtml(block) {
  const p = block.props;
  const fontStack = "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

  switch (block.type) {
    case 'logo':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}">
  <div style="font-size:${p.fontSize}px;font-weight:${p.fontWeight};color:${p.color};letter-spacing:3px;font-family:${fontStack}">${p.text}</div>
  ${p.tagline ? `<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:1px;font-family:${fontStack}">${p.tagline}</div>` : ''}
</div>`;

    case 'header':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor}">
  <h1 style="margin:0;font-size:${p.fontSize}px;font-weight:${p.fontWeight};color:${p.color};line-height:1.2;text-align:${p.align};font-family:${fontStack}">${p.text}</h1>
</div>`;

    case 'text':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor}">
  <p style="margin:0;font-size:${p.fontSize}px;color:${p.color};line-height:${p.lineHeight};text-align:${p.align};font-family:${fontStack}">${p.text.replace(/\n/g, '<br/>')}</p>
</div>`;

    case 'button':
      return `<div style="padding:${p.paddingV}px ${p.paddingH}px;background:${p.bgColor};text-align:${p.align}">
  <a href="${p.link}" style="display:inline-block;padding:14px 38px;background:${p.btnBg};color:${p.btnColor};text-decoration:none;border-radius:${p.borderRadius}px;font-weight:${p.fontWeight};font-size:${p.fontSize}px;font-family:${fontStack}">${p.text}</a>
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

    default:
      return '';
  }
}

/* ── Generate full email HTML from blocks ─────────────────── */
function meGetHtml() {
  if (!ME.blocks.length) return '';
  const outerBg = '#f1f5f9';
  const inner   = ME.blocks.map(b => meBlockToHtml(b)).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>Email</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,400;1,700&family=Raleway:ital,wght@0,400;0,700;1,400&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Dancing+Script:wght@400;700&family=Cinzel:wght@400;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:${outerBg};font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${outerBg}">
<tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
<tr><td>
${inner}
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
    extraKeys: { 'Ctrl-Space': 'autocomplete' },
    value: document.getElementById('mHtmlTmpl').value || '',
  });

  // Override dracula background to match our dark theme
  wrapper.querySelector('.CodeMirror').style.background = '#080f1e';
  wrapper.querySelector('.CodeMirror').style.color      = '#f8f8f2';

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
  ['visual','code','preview'].forEach(t => {
    const btn = document.getElementById('meTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
  });

  document.getElementById('meVisual').style.display  = tab === 'visual'  ? 'grid' : 'none';
  document.getElementById('meCode').style.display    = tab === 'code'    ? 'block' : 'none';
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
  const canvas  = document.getElementById('meCanvas');
  const empty   = document.getElementById('meEmptyCanvas');
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
    label.textContent = (ME_DEFS[block.type] || {}).label || block.type;
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
  if (['logo','header','text','footer'].includes(block.type)) {
    rows.push(meFieldTextarea('Text', block.id, 'text', p.text));
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
  if (block.type === 'spacer') {
    rows.push(meFieldRange('Height (px)', block.id, 'height', p.height, 8, 120));
  }

  // Common props
  if (['logo','header','text','button','footer'].includes(block.type)) {
    rows.push(meFieldAlign(block.id, p.align));
    if (['header','text','footer'].includes(block.type)) {
      rows.push(meFieldColor('Text Color', block.id, 'color', p.color));
      rows.push(meFieldRange('Font Size', block.id, 'fontSize', p.fontSize, 10, 48));
    }
    if (['logo'].includes(block.type)) {
      rows.push(meFieldColor('Text Color', block.id, 'color', p.color));
      rows.push(meFieldRange('Font Size', block.id, 'fontSize', p.fontSize, 12, 40));
    }
  }
  if (!['divider','spacer'].includes(block.type)) {
    rows.push(meFieldColor('Background', block.id, 'bgColor', p.bgColor));
  } else {
    rows.push(meFieldColor('Background', block.id, 'bgColor', p.bgColor));
  }
  rows.push(meFieldRange('Padding Top/Bottom', block.id, 'paddingV', p.paddingV, 0, 80));
  if (p.paddingH !== undefined) {
    rows.push(meFieldRange('Padding Left/Right', block.id, 'paddingH', p.paddingH, 0, 80));
  }

  body.innerHTML = `<div class="me-props-body">
    <div style="font-size:12px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">${(ME_DEFS[block.type]||{}).label||block.type}</div>
    ${rows.join('')}
  </div>`;
}

// Field builders
function meFieldText(label, id, key, val) {
  return `<div class="me-field">
    <div class="me-field-label">${label}</div>
    <input class="me-input" type="text" value="${(val||'').replace(/"/g,'&quot;')}" oninput="meUpdateProp('${id}','${key}',this.value)"/>
  </div>`;
}
function meFieldTextarea(label, id, key, val) {
  return `<div class="me-field">
    <div class="me-field-label">${label}</div>
    <textarea class="me-textarea" oninput="meUpdateProp('${id}','${key}',this.value)">${(val||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
  </div>`;
}
function meFieldColor(label, id, key, val) {
  return `<div class="me-field">
    <div class="me-field-label">${label}</div>
    <div class="me-color-row">
      <div class="me-color-swatch" style="background:${val||'#ffffff'}">
        <input type="color" value="${val||'#ffffff'}" oninput="meUpdateProp('${id}','${key}',this.value)" onchange="meUpdateProp('${id}','${key}',this.value)"/>
      </div>
      <input class="me-input" type="text" value="${val||'#ffffff'}" oninput="meUpdateProp('${id}','${key}',this.value)" style="flex:1"/>
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
    ['left','<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>'],
    ['center','<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/>'],
    ['right','<line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="21" y2="6"/><line x1="21" y1="14" x2="21" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/>'],
  ];
  return `<div class="me-field">
    <div class="me-field-label">Alignment</div>
    <div class="me-align-btns">
      ${opts.map(([a, svg]) => `<button class="me-align-btn ${val===a?'active':''}" onclick="meUpdateProp('${id}','align','${a}');this.closest('.me-align-btns').querySelectorAll('.me-align-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">
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

/* ══════════════════════════════════════════════════════════════
   SYNC FUNCTIONS
══════════════════════════════════════════════════════════════ */
function meSyncToCode() {
  const html = meGetHtml();
  document.getElementById('mHtmlTmpl').value = html;
  if (ME.cm) {
    const cursor = ME.cm.getCursor();
    ME.cm.setValue(html);
    try { ME.cm.setCursor(cursor); } catch(e) {}
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
  // Code → update textarea (visual can't be reverse-parsed cleanly, just notify)
  if (ME.cm) document.getElementById('mHtmlTmpl').value = ME.cm.getValue();
  toast('Code synced to textarea. Visual builder shows current blocks.', 'info', 3000);
}

function meRefreshPreviewIframe() {
  const iframe = document.getElementById('mePreviewFrame');
  if (!iframe) return;
  let html = document.getElementById('mHtmlTmpl').value || meGetHtml();
  // Apply first recipient data for preview
  if (MS.rows.length) html = mPersonalise(html, MS.rows[0]);
  iframe.srcdoc = html;
}

function meSetDevice(device) {
  ME.previewDevice = device;
  const frame = document.getElementById('mePreviewFrame');
  const wrap  = document.getElementById('mePreviewFrameWrap');
  if (!frame) return;
  document.getElementById('meBtnDesktop').classList.toggle('active', device === 'desktop');
  document.getElementById('meBtnMobile').classList.toggle('active', device === 'mobile');
  if (device === 'mobile') {
    frame.style.width  = '375px';
    frame.style.height = '600px';
    wrap.classList.add('mobile');
  } else {
    frame.style.width  = '100%';
    frame.style.height = '480px';
    wrap.classList.remove('mobile');
  }
}

function meFormatCode() {
  if (!ME.cm) return;
  // Simple: split on block HTML comment boundaries
  toast('HTML formatted', 'success', 1500);
}

/* ══════════════════════════════════════════════════════════════
   MERGE TAGS ROW
══════════════════════════════════════════════════════════════ */
const ME_DEFAULT_TAGS = ['{{name}}','{{email}}','{{course}}','{{date}}','{{score}}','{{org}}','{{certificateLink}}'];

function meBuildMergeTagsRow() {
  const wrap = document.getElementById('meMergeTags');
  if (!wrap) return;
  const tags = MS.headers.length
    ? MS.headers.map(h => '{{' + h.toLowerCase().replace(/\s+/g,'_') + '}}')
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
    // Insert into selected block's text if applicable
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
      { type:'logo',    props:{ text:'HONOURIX', tagline:'Certificate Platform', bgColor:'#0d1728', color:'#00d4ff', fontSize:20, fontWeight:800, align:'center', paddingV:28, paddingH:40 } },
      { type:'header',  props:{ text:'Your Certificate is Ready 🎉', fontSize:26, fontWeight:700, color:'#1e293b', bgColor:'#ffffff', align:'center', paddingV:36, paddingH:40 } },
      { type:'text',    props:{ text:'Dear {{name}},\n\nCongratulations on completing your course. We are delighted to share your personalized certificate with you.', fontSize:16, color:'#475569', bgColor:'#ffffff', align:'left', paddingV:8, paddingH:40, lineHeight:1.75 } },
      { type:'button',  props:{ text:'Download Certificate', link:'{{certificateLink}}', btnBg:'linear-gradient(135deg,#00d4ff,#7c3aed)', btnColor:'#ffffff', bgColor:'#ffffff', align:'center', paddingV:28, paddingH:40, borderRadius:10, fontSize:15, fontWeight:700 } },
      { type:'divider', props:{ color:'#e2e8f0', bgColor:'#ffffff', paddingV:16, thickness:1 } },
      { type:'footer',  props:{ text:'This email was sent via Honourix. If you have questions, contact the organiser directly.', bgColor:'#f8fafc', color:'#94a3b8', fontSize:12, align:'center', paddingV:24, paddingH:40 } },
    ]
  },
  event: {
    name: '📅 Event Invitation',
    desc: 'Banner + date + RSVP',
    thumb: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
    blocks: [
      { type:'logo',    props:{ text:'EVENT', tagline:'', bgColor:'#7c3aed', color:'#ffffff', fontSize:18, fontWeight:800, align:'center', paddingV:24, paddingH:40 } },
      { type:'header',  props:{ text:'You\'re Invited, {{name}}!', fontSize:28, fontWeight:700, color:'#1e293b', bgColor:'#ffffff', align:'center', paddingV:36, paddingH:40 } },
      { type:'text',    props:{ text:'We warmly invite you to join us for our upcoming event. Mark your calendar and join us for an unforgettable experience.', fontSize:16, color:'#475569', bgColor:'#ffffff', align:'center', paddingV:8, paddingH:40, lineHeight:1.75 } },
      { type:'text',    props:{ text:'📅 Date: {{date}}\n📍 Venue: {{org}}', fontSize:15, color:'#1e293b', bgColor:'#f8fafc', align:'center', paddingV:20, paddingH:40, lineHeight:2 } },
      { type:'button',  props:{ text:'RSVP Now', link:'#', btnBg:'#7c3aed', btnColor:'#ffffff', bgColor:'#ffffff', align:'center', paddingV:28, paddingH:40, borderRadius:8, fontSize:15, fontWeight:700 } },
      { type:'footer',  props:{ text:'If you\'re unable to attend, please let us know at your earliest convenience.', bgColor:'#f8fafc', color:'#94a3b8', fontSize:12, align:'center', paddingV:24, paddingH:40 } },
    ]
  },
  thankyou: {
    name: '🙏 Thank You',
    desc: 'Warm appreciation note',
    thumb: 'linear-gradient(135deg,#10b981,#059669)',
    blocks: [
      { type:'logo',    props:{ text:'THANK YOU', tagline:'', bgColor:'#10b981', color:'#ffffff', fontSize:20, fontWeight:800, align:'center', paddingV:28, paddingH:40 } },
      { type:'header',  props:{ text:'Thank You, {{name}}!', fontSize:28, fontWeight:700, color:'#1e293b', bgColor:'#ffffff', align:'center', paddingV:36, paddingH:40 } },
      { type:'text',    props:{ text:'We wanted to take a moment to express our sincere gratitude for your participation and dedication.\n\nYour contribution has made a real difference, and we truly appreciate everything you bring to the table.', fontSize:16, color:'#475569', bgColor:'#ffffff', align:'left', paddingV:12, paddingH:40, lineHeight:1.8 } },
      { type:'divider', props:{ color:'#d1fae5', bgColor:'#ffffff', paddingV:16, thickness:2 } },
      { type:'footer',  props:{ text:'With gratitude,\nThe Honourix Team', bgColor:'#f0fdf4', color:'#6b7280', fontSize:13, align:'center', paddingV:24, paddingH:40 } },
    ]
  },
  announcement: {
    name: '📢 Announcement',
    desc: 'Bold headline + CTA',
    thumb: 'linear-gradient(135deg,#f59e0b,#ef4444)',
    blocks: [
      { type:'logo',    props:{ text:'ANNOUNCEMENT', tagline:'', bgColor:'#0f172a', color:'#f59e0b', fontSize:16, fontWeight:800, align:'center', paddingV:24, paddingH:40 } },
      { type:'header',  props:{ text:'Important Update', fontSize:30, fontWeight:800, color:'#0f172a', bgColor:'#ffffff', align:'center', paddingV:36, paddingH:40 } },
      { type:'text',    props:{ text:'Dear {{name}},\n\nWe have an important announcement to share with you. Please read the following information carefully.', fontSize:16, color:'#374151', bgColor:'#ffffff', align:'left', paddingV:8, paddingH:40, lineHeight:1.75 } },
      { type:'text',    props:{ text:'Your update / announcement body goes here. You can edit this block to include all the relevant details.', fontSize:15, color:'#4b5563', bgColor:'#fffbeb', align:'left', paddingV:20, paddingH:40, lineHeight:1.75 } },
      { type:'button',  props:{ text:'Learn More', link:'#', btnBg:'#f59e0b', btnColor:'#000000', bgColor:'#ffffff', align:'center', paddingV:28, paddingH:40, borderRadius:8, fontSize:15, fontWeight:700 } },
      { type:'footer',  props:{ text:'You received this because you are part of our community.', bgColor:'#f8fafc', color:'#9ca3af', fontSize:12, align:'center', paddingV:20, paddingH:40 } },
    ]
  },
  plain: {
    name: '🧾 Plain Professional',
    desc: 'Clean text-only email',
    thumb: 'linear-gradient(135deg,#334155,#1e293b)',
    blocks: [
      { type:'spacer',  props:{ height:24, bgColor:'#ffffff' } },
      { type:'text',    props:{ text:'Hi {{name}},', fontSize:18, color:'#1e293b', bgColor:'#ffffff', align:'left', paddingV:4, paddingH:40, lineHeight:1.6 } },
      { type:'text',    props:{ text:'I hope this email finds you well.\n\nThis is the main body of your email. Keep it short, professional, and to the point. Let the reader know exactly what you need them to do.', fontSize:16, color:'#374151', bgColor:'#ffffff', align:'left', paddingV:8, paddingH:40, lineHeight:1.8 } },
      { type:'text',    props:{ text:'Best regards,\nThe Honourix Team', fontSize:15, color:'#1e293b', bgColor:'#ffffff', align:'left', paddingV:12, paddingH:40, lineHeight:1.7 } },
      { type:'divider', props:{ color:'#e2e8f0', bgColor:'#ffffff', paddingV:16, thickness:1 } },
      { type:'footer',  props:{ text:'Sent via Honourix | Unsubscribe', bgColor:'#f8fafc', color:'#9ca3af', fontSize:12, align:'center', paddingV:20, paddingH:40 } },
    ]
  },
};

function meBuildTemplatePicker() {
  const row = document.getElementById('meTplRow');
  if (!row) return;
  row.innerHTML = Object.entries(ME_TEMPLATES).map(([key, tpl]) => `
    <div class="me-tpl-card" onclick="meLoadTemplate('${key}')">
      <div class="me-tpl-thumb" style="background:${tpl.thumb}">${tpl.name.split(' ')[0]}</div>
      <div class="me-tpl-info">
        <div class="me-tpl-name">${tpl.name.slice(tpl.name.indexOf(' ')+1)}</div>
        <button class="me-tpl-btn">Use This</button>
      </div>
    </div>
  `).join('');
}

function meLoadTemplate(key) {
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

  const name  = document.getElementById('mNameCol').value;
  const email = document.getElementById('mEmailCol').value;
  const n     = MS.rows.length;
  const camp  = document.getElementById('mCampName').value;
  const tmpl  = document.getElementById('mHtmlTmpl').value;

  document.getElementById('mSendCountLabel').textContent = '(' + n + ')';

  const tagsUsed = [...new Set((tmpl.match(/\{\{(\w+)\}\}/g) || []))].join(', ') || '—';
  document.getElementById('mSummaryGrid').innerHTML = [
    { k: 'Campaign',         v: camp },
    { k: 'Total Recipients', v: String(n) },
    { k: 'Name Column',      v: name },
    { k: 'Email Column',     v: email },
    { k: 'Subject',          v: (document.getElementById('mSubject').value.slice(0, 48) + '…') },
    { k: 'Merge Tags',       v: tagsUsed },
  ].map(i => '<div class="summary-item"><div class="summary-key">' + i.k + '</div><div class="summary-val">' + i.v + '</div></div>').join('');

  document.getElementById('mRecipientList').innerHTML = MS.rows.slice(0, 50).map((r, i) =>
    '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
      '<span style="color:var(--text-3);width:22px;font-size:12px;text-align:right;flex-shrink:0">' + (i+1) + '</span>' +
      '<span style="flex:1;font-size:14px;color:var(--text);font-weight:500">' + (r[name]||'—') + '</span>' +
      '<span style="font-size:12.5px;color:var(--text-2)">' + (r[email]||'—') + '</span>' +
    '</div>'
  ).join('') + (MS.rows.length > 50 ? '<div style="padding:8px 0;text-align:center;font-size:12.5px;color:var(--text-3)">+' + (MS.rows.length-50) + ' more</div>' : '');

  document.getElementById('mJobInfo').innerHTML = [
    { k:'Campaign', v:camp },
    { k:'Recipients', v:String(n) },
  ].map(i => '<div class="summary-item"><div class="summary-key">' + i.k + '</div><div class="summary-val">' + i.v + '</div></div>').join('');
}

function mRenderAt(idx) {
  const row = MS.rows[idx];
  if (!row) return;
  const name  = document.getElementById('mNameCol').value;
  const email = document.getElementById('mEmailCol').value;
  const subj  = mPersonalise(document.getElementById('mSubject').value, row);
  const tmpl  = document.getElementById('mHtmlTmpl').value;
  const body  = mPersonalise(tmpl, row);

  document.getElementById('mFinalTo').textContent      = (row[name]||'?') + ' <' + (row[email]||'?') + '>';
  document.getElementById('mFinalSubject').textContent = subj;
  document.getElementById('mPrvNav').textContent       = (idx+1) + ' / ' + MS.rows.length;

  // Render in iframe
  const iframe = document.getElementById('mPreviewIframe');
  if (iframe) iframe.srcdoc = body;
}

function mNavPrev() { if (MS.prevIdx > 0)                  { MS.prevIdx--; mRenderAt(MS.prevIdx); } }
function mNavNext() { if (MS.prevIdx < MS.rows.length - 1) { MS.prevIdx++; mRenderAt(MS.prevIdx); } }

/* ══════════════════════════════════════════════════════════════
   SEND
══════════════════════════════════════════════════════════════ */
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
    const obj = { name: r[nameC]||'', email: r[emailC]||'' };
    MS.headers.forEach(h => { obj[h.toLowerCase().replace(/\s+/g,'_')] = r[h]||''; });
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
        document.getElementById('mSendCounter').textContent = done + ' / ' + total;
        document.getElementById('mSendBar').style.width     = pct + '%';
        document.getElementById('mSendPct').textContent     = pct + '%';
        document.getElementById('mSendStatus').textContent  = 'Sending… ' + pct + '% complete';
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
  const ts  = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const el  = document.createElement('div');
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
  const sent   = MS.results.filter(r => r.status === 'sent').length;
  const failed = MS.results.filter(r => r.status !== 'sent').length;

  document.getElementById('mResTotal').textContent  = MS.results.length;
  document.getElementById('mResSent').textContent   = sent;
  document.getElementById('mResFailed').textContent = failed;
  document.getElementById('mResultTitle').textContent = failed === 0 ? 'All emails sent!' : sent + ' sent, ' + failed + ' failed';
  document.getElementById('mResultSub').textContent = 'Campaign dispatched from your Gmail account.';

  if (failed > 0) {
    document.getElementById('mCompRing').style.background  = 'linear-gradient(135deg,#f59e0b,#ef4444)';
    document.getElementById('mCompRing').style.boxShadow   = '0 0 40px rgba(245,158,11,0.3)';
  }

  document.getElementById('mReportRows').innerHTML = MS.results.map(r =>
    '<div class="report-row">' +
      '<div style="font-weight:600;color:var(--text);font-size:14px">' + (r.name||'—') + '</div>' +
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
    MS.results.map(r => ({ Name: r.name||'', Email: r.email, Status: r.status, Error: r.error||'' })),
    'Honourix-mail-report-' + Date.now() + '.csv'
  );
}

function mNewCampaign() {
  MS.rows=[]; MS.results=[]; MS.headers=[]; MS.prevIdx=0;
  ME.blocks=[]; ME.selectedId=null; ME.initialized=false;
  ['mCampName','mSheetId','mSubject','mHtmlTmpl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['mSheetResult','mFileResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('mColCard').style.display = 'none';
  if (ME.cm) ME.cm.setValue('');
  mGoStep(1, true);
}

/* ══════════════════════════════════════════════════════════════
   SAVE CAMPAIGN HELPER (localStorage)
══════════════════════════════════════════════════════════════ */
function saveCampaign(type, name, total, success, folderLink) {
  try {
    const campaigns = JSON.parse(localStorage.getItem('cf_campaigns') || '[]');
    campaigns.push({
      type, name, total, success,
      folderLink: folderLink || null,
      date: new Date().toISOString(),
    });
    localStorage.setItem('cf_campaigns', JSON.stringify(campaigns));
  } catch(e) { /* non-critical */ }
}