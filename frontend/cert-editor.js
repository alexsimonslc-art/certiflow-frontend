/* ================================================================
   CertiFlow — Certificate Template Editor
   frontend/cert-editor.js
   ================================================================ */

let canvas, ctx, overlay;

let editorState = {
  width: 1122, height: 794,
  bgImage: null,
  bgBase64: null,
  bgColor: '#ffffff',
  fields: [],
  selectedId: null,
  scale: 1,
};

document.addEventListener('DOMContentLoaded', () => {
  canvas  = document.getElementById('certCanvas');
  ctx     = canvas.getContext('2d');
  overlay = document.getElementById('fieldOverlay');
  requireAuth();
  initSidebar();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  loadSavedTemplate();
});

/* ── Canvas Sizing ───────────────────────────────────────────────── */
function resizeCanvas() {
  const wrap = document.getElementById('canvasWrap');
  const maxW = wrap.clientWidth  - 64;
  const maxH = wrap.clientHeight - 64;
  editorState.scale = Math.min(maxW / editorState.width, maxH / editorState.height, 1);

  const w = editorState.width  * editorState.scale;
  const h = editorState.height * editorState.scale;

  const container = document.getElementById('canvasContainer');
  container.style.width  = w + 'px';
  container.style.height = h + 'px';
  canvas.width  = w;
  canvas.height = h;
  redraw();
}

function changeCanvasSize() {
  const val = document.getElementById('canvasSize').value.split(',');
  editorState.width  = parseInt(val[0]);
  editorState.height = parseInt(val[1]);
  editorState.fields.forEach(f => {
    f.x = Math.min(f.x, 90);
    f.y = Math.min(f.y, 90);
  });
  resizeCanvas();
}

/* ── Drawing ─────────────────────────────────────────────────────── */
function redraw() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (editorState.bgImage) {
    ctx.drawImage(editorState.bgImage, 0, 0, w, h);
  } else {
    ctx.fillStyle = editorState.bgColor;
    ctx.fillRect(0, 0, w, h);
  }
  renderFieldHandles();
}

/* ── Field Handles (overlay) ─────────────────────────────────────── */
function renderFieldHandles() {
  overlay.innerHTML = '';
  editorState.fields.forEach(field => {
    const x        = (field.x / 100) * canvas.width;
    const y        = (field.y / 100) * canvas.height;
    const w        = (field.width / 100) * canvas.width;
    const fontSize = field.fontSize * editorState.scale;

    const el = document.createElement('div');
    el.className = 'text-field-handle' + (field.id === editorState.selectedId ? ' selected' : '');
    el.id = 'handle_' + field.id;
    el.style.cssText = `
      left:${x}px; top:${y}px;
      font-size:${fontSize}px;
      font-family:${field.fontFamily || 'Helvetica'}, sans-serif;
      color:${field.color || '#000000'};
      font-weight:${(field.fontFamily || '').includes('Bold') ? 'bold' : 'normal'};
      text-align:${field.align || 'left'};
      width:${w}px;
      min-width:60px;
    `;
    el.textContent = field.previewText || field.placeholder;

    const del = document.createElement('div');
    del.className = 'field-del';
    del.textContent = '×';
    del.onclick = (e) => { e.stopPropagation(); deleteField(field.id); };
    el.appendChild(del);

    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      selectField(field.id);
      startDrag(e, field, el);
    });

    overlay.appendChild(el);
  });

  renderFieldList();
}

/* ── Drag ────────────────────────────────────────────────────────── */
function startDrag(e, field, el) {
  const startX = e.clientX, startY = e.clientY;
  const startFX = field.x,  startFY = field.y;

  function onMove(ev) {
    const dx = ((ev.clientX - startX) / canvas.width)  * 100;
    const dy = ((ev.clientY - startY) / canvas.height) * 100;
    field.x = Math.max(0, Math.min(95, startFX + dx));
    field.y = Math.max(0, Math.min(95, startFY + dy));
    el.style.left = (field.x / 100 * canvas.width)  + 'px';
    el.style.top  = (field.y / 100 * canvas.height) + 'px';
    if (field.id === editorState.selectedId) {
      document.getElementById('propX').value = field.x.toFixed(1);
      document.getElementById('propY').value = field.y.toFixed(1);
    }
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

/* ── Add Field Modal ─────────────────────────────────────────────── */
function openAddFieldModal() {
  const modal = document.getElementById('addFieldModal');
  modal.style.display = 'flex';
  document.getElementById('newFieldPh').onchange = function () {
    document.getElementById('newFieldCustom').style.display =
      this.value === 'custom' ? 'block' : 'none';
  };
}

function closeAddFieldModal() {
  document.getElementById('addFieldModal').style.display = 'none';
}

function addField() {
  let ph = document.getElementById('newFieldPh').value;
  if (ph === 'custom') {
    ph = document.getElementById('newFieldCustom').value.trim() || '{{custom}}';
    if (!ph.startsWith('{{')) ph = '{{' + ph + '}}';
  }

  const previewTexts = {
    '{{name}}': 'John Smith', '{{course}}': 'Web Development',
    '{{date}}': 'March 2026', '{{score}}': '95%',
    '{{email}}': 'john@example.com', '{{org}}': 'Loyola College',
  };

  const field = {
    id:          'field_' + Date.now(),
    placeholder: ph,
    previewText: previewTexts[ph] || ph.replace(/[{}]/g, ''),
    column:      '',
    x: 10,
    y: 30 + editorState.fields.length * 12,
    width: 80,
    fontSize: 36,
    fontFamily: 'Helvetica',
    color: '#000000',
    align: 'center',
  };

  editorState.fields.push(field);
  closeAddFieldModal();
  selectField(field.id);
  renderFieldHandles();
  toast('Added ' + ph + ' field', 'success', 2000);
}

/* ── Field Management ────────────────────────────────────────────── */
function deleteField(id) {
  editorState.fields = editorState.fields.filter(f => f.id !== id);
  if (editorState.selectedId === id) {
    editorState.selectedId = null;
    document.getElementById('noFieldSelected').style.display = '';
    document.getElementById('fieldProps').style.display      = 'none';
  }
  renderFieldHandles();
}

function deleteSelectedField() {
  if (editorState.selectedId) deleteField(editorState.selectedId);
}

function selectField(id) {
  editorState.selectedId = id;
  const field = editorState.fields.find(f => f.id === id);
  if (!field) return;

  document.getElementById('noFieldSelected').style.display = 'none';
  document.getElementById('fieldProps').style.display      = '';

  document.getElementById('propPlaceholder').value  = field.placeholder;
  document.getElementById('propPreview').value       = field.previewText  || '';
  document.getElementById('propFont').value          = field.fontFamily;
  document.getElementById('propSize').value          = field.fontSize;
  document.getElementById('propColor').value         = field.color;
  document.getElementById('propColorHex').textContent = field.color;
  document.getElementById('propX').value             = field.x.toFixed(1);
  document.getElementById('propY').value             = field.y.toFixed(1);
  document.getElementById('propWidth').value         = field.width;

  ['alignLeft', 'alignCenter', 'alignRight'].forEach(bid =>
    document.getElementById(bid).classList.remove('active'));
  const activeBtn = field.align === 'center' ? 'alignCenter'
                  : field.align === 'right'  ? 'alignRight'
                  : 'alignLeft';
  document.getElementById(activeBtn).classList.add('active');

  renderFieldHandles();
}

function updateFieldProp(key, value) {
  const field = editorState.fields.find(f => f.id === editorState.selectedId);
  if (!field) return;
  field[key] = value;
  if (key === 'color') document.getElementById('propColorHex').textContent = value;
  renderFieldHandles();
}

function setAlign(align) {
  updateFieldProp('align', align);
  ['alignLeft', 'alignCenter', 'alignRight'].forEach(bid =>
    document.getElementById(bid).classList.remove('active'));
  const activeBtn = align === 'center' ? 'alignCenter'
                  : align === 'right'  ? 'alignRight'
                  : 'alignLeft';
  document.getElementById(activeBtn).classList.add('active');
}

function renderFieldList() {
  const list = document.getElementById('fieldList');
  if (!editorState.fields.length) {
    list.innerHTML = '<div class="empty-fields">No fields yet.<br>Click "+ Add Field" to start.</div>';
    return;
  }
  list.innerHTML = editorState.fields.map(f => `
    <div class="field-list-item ${f.id === editorState.selectedId ? 'selected' : ''}"
         onclick="selectField('${f.id}')">
      <div class="field-list-dot" style="background:${f.color}"></div>
      <span class="field-list-name">${f.previewText || f.placeholder}</span>
      <span class="field-list-ph">${f.placeholder}</span>
    </div>
  `).join('');
}

/* ── Background ──────────────────────────────────────────────────── */
function uploadBackground(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img  = new Image();
    img.onload = () => {
      editorState.bgImage  = img;
      editorState.bgBase64 = e.target.result;
      redraw();
      toast('Background uploaded ✅', 'success', 2000);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function changeBgColor() {
  editorState.bgColor = document.getElementById('bgColor').value;
  if (!editorState.bgImage) redraw();
}

function clearBackground() {
  editorState.bgImage  = null;
  editorState.bgBase64 = null;
  document.getElementById('bgUpload').value = '';
  redraw();
  toast('Background removed', 'info', 2000);
}

/* ── Save / Load Template ────────────────────────────────────────── */
function saveTemplate() {
  const template = {
    width:            editorState.width,
    height:           editorState.height,
    bgColor:          editorState.bgColor,
    backgroundBase64: editorState.bgBase64 || null,
    fields:           editorState.fields.map(f => ({ ...f })),
    savedAt:          new Date().toISOString(),
  };
  localStorage.setItem('certiflow_template', JSON.stringify(template));
  toast('Template saved! ✅', 'success');
}

function loadSavedTemplate() {
  const raw = localStorage.getItem('certiflow_template');
  if (!raw) return;
  try {
    const t = JSON.parse(raw);
    editorState.width   = t.width   || 1122;
    editorState.height  = t.height  || 794;
    editorState.bgColor = t.bgColor || '#ffffff';
    editorState.fields  = t.fields  || [];
    if (t.backgroundBase64) {
      editorState.bgBase64 = t.backgroundBase64;
      const img = new Image();
      img.onload = () => { editorState.bgImage = img; redraw(); };
      img.src = t.backgroundBase64;
    }
    resizeCanvas();
    if (t.fields?.length) toast('Previous template loaded', 'info', 2000);
  } catch (e) { /* no valid saved template */ }
}

function clearAll() {
  if (!editorState.fields.length && !editorState.bgImage) return;
  editorState.fields   = [];
  editorState.bgImage  = null;
  editorState.bgBase64 = null;
  editorState.selectedId = null;
  document.getElementById('noFieldSelected').style.display = '';
  document.getElementById('fieldProps').style.display      = 'none';
  redraw();
  toast('Canvas cleared', 'info', 2000);
}

function previewTemplate() {
  saveTemplate();
  toast('Template saved — redirecting to Generate…', 'info');
  setTimeout(() => window.location.href = 'cert-tool.html', 1500);
}