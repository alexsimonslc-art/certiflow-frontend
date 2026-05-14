/* ================================================================
   GalSol — Mini Site Builder  |  mini-site-canvas.js
   Batch 3 Part 2 — Full property panel for every block type.
   Loaded LAST in mini-site-editor.html — overrides renderBlockProps.
================================================================ */

/* ═══════════════════════════════════════════════════════════════
   ITEM-LEVEL CRUD HELPERS
   Called from inline oninput/onclick attrs in the props panels.
═══════════════════════════════════════════════════════════════ */

/** Update a primitive prop on a block.
 *  NOTE: MSState.updateBlock triggers onChange → refreshCanvas automatically.
 *  We do NOT call refreshCanvas() here to avoid double-render on every keystroke. */
function msc_set(blockId, key, value) {
  MSState.updateBlock(blockId, { [key]: value });
  // canvas refresh is handled by MSState.onChange('update') → refreshCanvas()
}

/** Update a nested item inside a block's array prop. */
function msc_setItem(blockId, arrayKey, idx, key, value) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const arr = JSON.parse(JSON.stringify(block.props[arrayKey] || []));
  if (!arr[idx]) return;
  arr[idx][key] = value;
  MSState.updateBlock(blockId, { [arrayKey]: arr });
  // canvas refresh via onChange
}

/** Remove an item from a block array prop. */
function msc_removeItem(blockId, arrayKey, idx) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const arr = (block.props[arrayKey] || []).filter((_, i) => i !== idx);
  MSState.updateBlock(blockId, { [arrayKey]: arr });
  updateRightPanel();   // rebuild props panel — onChange handles canvas
}

/** Move an item up or down inside an array prop. */
function msc_moveItem(blockId, arrayKey, idx, dir) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const arr = JSON.parse(JSON.stringify(block.props[arrayKey] || []));
  const n = idx + dir;
  if (n < 0 || n >= arr.length) return;
  [arr[idx], arr[n]] = [arr[n], arr[idx]];
  MSState.updateBlock(blockId, { [arrayKey]: arr });
  updateRightPanel();   // onChange handles canvas
}

/** Add a new item to a block array prop. */
function msc_addItem(blockId, arrayKey, newItem) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const arr = JSON.parse(JSON.stringify(block.props[arrayKey] || []));
  arr.push(newItem);
  MSState.updateBlock(blockId, { [arrayKey]: arr });
  updateRightPanel();   // onChange handles canvas
}

/** Helper: tiny unique id. */
function msc_uid() { return Math.random().toString(36).slice(2, 8); }

/* ═══════════════════════════════════════════════════════════════
   SHARED PANEL FRAGMENTS
═══════════════════════════════════════════════════════════════ */

/** Render a common bg-color row (used by every block). */
function msc_bgRow(bid, val) {
  const v = val || '';
  const themeBg = MSState.config.bgOverride || (MSState.config.theme === 'light' ? '#f1f5f9' : '#0a0f1e');
  const displayBg = v || themeBg;
  return `
<div class="mse-prop-row">
  <div class="mse-prop-label">Section Background</div>
  <div class="mse-color-row">
    <div class="mse-color-swatch" style="background:${displayBg}">
      <input type="color" value="${displayBg}"
        oninput="msc_set('${bid}','bgColor',this.value)"/>
    </div>
    <input type="text" class="mse-prop-input" value="${v}" placeholder="Default (theme bg)"
      oninput="msc_set('${bid}','bgColor',this.value)" style="flex:1"/>
    <button onclick="msc_set('${bid}','bgColor','');updateRightPanel()"
      style="padding:0 8px;height:32px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:var(--text-3);cursor:pointer;font-size:11px;font-family:var(--font)">Clear</button>
  </div>
</div>`;
}

/** Render an alignment row — works for every block type. */
function msc_alignRow(bid, p) {
  return `
<div class="mse-prop-row">
  <div class="mse-prop-label">Section Alignment</div>
  <div class="mse-align-row">
    ${['left', 'center', 'right'].map(a => `<button class="mse-align-btn ${(p.alignment || 'left') === a ? 'on' : ''}"
      onclick="msc_set('${bid}','alignment','${a}');updateRightPanel()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
        ${a === 'left' ? '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>'
      : a === 'center' ? '<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>'
        : '<line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="9" y2="14"/>'}
      </svg></button>`).join('')}
  </div>
</div>`;
}

/** Render a section-title field. */
function msc_titleRow(bid, val, placeholder) {
  return `
<div class="mse-prop-row">
  <div class="mse-prop-label">Section Title</div>
  <input class="mse-prop-input" value="${(val || '').replace(/"/g, '&quot;')}"
    placeholder="${placeholder || 'Section title'}"
    oninput="msc_set('${bid}','title',this.value)"/>
</div>`;
}

/** Item card shell with move-up / move-down / delete controls. */
function msc_itemCard(bid, arrayKey, idx, total, label, innerHtml) {
  return `
<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:8px;overflow:hidden">
  <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06)">
    <span style="font-size:11.5px;font-weight:700;color:var(--text-3);flex:1;text-transform:uppercase;letter-spacing:0.5px">${label}</span>
    ${idx > 0 ? `<button class="mse-icon-btn" title="Move up"   onclick="msc_moveItem('${bid}','${arrayKey}',${idx},-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
    ${idx < total - 1 ? `<button class="mse-icon-btn" title="Move down" onclick="msc_moveItem('${bid}','${arrayKey}',${idx},+1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
    <button class="mse-icon-btn" title="Delete" style="color:var(--red)" onclick="msc_removeItem('${bid}','${arrayKey}',${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div style="padding:10px">${innerHtml}</div>
</div>`;
}

/** "Add" button. */
function msc_addBtn(label, onclick) {
  return `<button class="mse-add-item-btn" onclick="${onclick}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    ${label}
  </button>`;
}

/** Small labelled input helper (used inside item cards). */
function msc_miniField(label, value, oninput, type, placeholder) {
  return `
<div style="margin-bottom:8px">
  <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${label}</div>
  <input type="${type || 'text'}" class="mse-prop-input" value="${(value || '').replace(/"/g, '&quot;')}"
    placeholder="${placeholder || ''}" oninput="${oninput}" style="font-size:12.5px;padding:7px 9px"/>
</div>`;
}

/** Small labelled textarea helper. */
function msc_miniTextarea(label, value, oninput, placeholder) {
  return `
<div style="margin-bottom:8px">
  <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${label}</div>
  <textarea class="mse-prop-textarea" oninput="${oninput}"
    placeholder="${placeholder || ''}"
    style="font-size:12.5px;padding:7px 9px;min-height:60px">${(value || '').replace(/</g, '&lt;')}</textarea>
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   COLOUR HELPERS — per-block text colour pickers
═══════════════════════════════════════════════════════════════ */

/** Snapshot of theme defaults at call-time — used for Reset swatch fallback. */
function msc_themeDefaults() {
  const isDark = MSState.config.theme !== 'light';
  return {
    text: isDark ? '#eef4ff' : '#1e293b',
    sub: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)',
    muted: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
    accent: MSState.config.accentColor || '#00d4ff',
  };
}

/** Swatch + hex input + Reset row for a single block text-colour prop. */
function msc_colorRow(bid, prop, label, defaultColor) {
  const block = MSState.getBlock(bid);
  const val = (block?.props[prop]) || '';
  const disp = val || defaultColor || '#888888';
  return `
<div class="mse-prop-row" style="margin-bottom:6px">
  <div class="mse-prop-label">${label}</div>
  <div class="mse-color-row">
    <div class="mse-color-swatch" style="background:${disp}">
      <input type="color" value="${val || defaultColor || '#ffffff'}"
        oninput="msc_set('${bid}','${prop}',this.value);this.parentNode.style.background=this.value;this.parentNode.nextElementSibling.value=this.value"/>
    </div>
    <input type="text" class="mse-prop-input" value="${val}" placeholder="Theme default" style="flex:1"
      oninput="if(/^#[0-9a-f]{6}$/i.test(this.value)){msc_set('${bid}','${prop}',this.value);this.previousElementSibling.style.background=this.value}else if(!this.value.trim()){msc_set('${bid}','${prop}','')}"/>
    <button onclick="msc_set('${bid}','${prop}','');this.previousElementSibling.value='';this.previousElementSibling.previousElementSibling.style.background='${disp}'"
      style="padding:0 8px;height:32px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:var(--text-3);cursor:pointer;font-size:11px;font-family:var(--font)">Reset</button>
  </div>
</div>`;
}

/** Font size slider row — produces a range slider with an Auto reset button. */
function msc_fontSizeRow(bid, key, val, label, min, max, defaultVal) {
  const v = val || '';
  const current = v || defaultVal;
  const displayLabel = v ? v + 'px' : 'Auto';
  return `
<div class="mse-prop-row" style="margin-bottom:6px">
  <div class="mse-range-row">
    <div class="mse-range-header">
      <span class="mse-prop-label">${label}</span>
      <span class="mse-range-val" id="fsz_${bid}_${key}">${displayLabel}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <input type="range" class="mse-prop-range" min="${min}" max="${max}" step="1" value="${current}"
        oninput="document.getElementById('fsz_${bid}_${key}').textContent=this.value+'px';msc_set('${bid}','${key}',+this.value)"
        style="flex:1"/>
      <button onclick="msc_set('${bid}','${key}','');document.getElementById('fsz_${bid}_${key}').textContent='Auto';this.previousElementSibling.value=${defaultVal}"
        style="padding:0 8px;height:28px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:var(--text-3);cursor:pointer;font-size:11px;font-family:var(--font);white-space:nowrap">Auto</button>
    </div>
  </div>
</div>`;
}

/** Wraps colour rows in a compact "Text Colours" labelled box. */
function msc_colorSection(bid, fields) {
  return `
<div style="margin-top:4px;padding:10px 10px 4px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:9px">
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-3);margin-bottom:6px;display:flex;align-items:center;gap:5px">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;flex-shrink:0"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/></svg>
    Text Colours
  </div>
  ${fields.map(([prop, label, def]) => msc_colorRow(bid, prop, label, def)).join('')}
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   FULL renderBlockProps — overrides the one in mini-site-editor.html
═══════════════════════════════════════════════════════════════ */
function renderBlockProps(block) {
  const p = block.props;
  const bid = block.id;
  const td = msc_themeDefaults();

  switch (block.type) {

    /* ─── COVER ─────────────────────────────────────────────── */
    case 'cover': return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#00d4ff">Cover / Hero</div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Site Name</div>
    <input class="mse-prop-input" value="${(p.siteName || '').replace(/"/g, '&quot;')}" placeholder="Your event name"
      oninput="msc_set('${bid}','siteName',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Tagline</div>
    <input class="mse-prop-input" value="${(p.tagline || '').replace(/"/g, '&quot;')}" placeholder="A short tagline"
      oninput="msc_set('${bid}','tagline',this.value)"/>
  </div>
  ${msc_alignRow(bid, p)}
  <div class="mse-prop-row">
    <div class="mse-prop-label">Cover Image URL</div>
    <input class="mse-prop-input" type="url" value="${p.coverImage || ''}" placeholder="https://… or public Drive link"
      oninput="msc_set('${bid}','coverImage',this.value)"/>
    <div class="mse-prop-hint">Paste a public image URL. Google Drive: Share → Anyone with link → copy URL.</div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Cover Overlay</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','coverOverlay',this.value)">
      <option value="dark" ${p.coverOverlay === 'dark' ? 'selected' : ''}>Dark</option>
      <option value="blur" ${p.coverOverlay === 'blur' ? 'selected' : ''}>Blur</option>
      <option value="none" ${p.coverOverlay === 'none' ? 'selected' : ''}>None</option>
    </select>
  </div>
  <div class="mse-toggle-row">
    <span>Show Logo</span>
    <div class="mse-toggle ${p.showLogo !== false ? 'on' : ''}"
      onclick="msc_set('${bid}','showLogo',${p.showLogo === false});updateRightPanel()"></div>
  </div>
  ${p.showLogo !== false ? `
  <div class="mse-prop-row">
    <div class="mse-prop-label">Logo Image URL</div>
    <input class="mse-prop-input" type="url" value="${p.logoImage || ''}" placeholder="https://… or Drive link"
      oninput="msc_set('${bid}','logoImage',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Logo Shape</div>
    <div class="mse-shape-row">
      ${['circle', 'rounded', 'square', 'rectangle'].map(s => `<button class="mse-shape-btn ${p.logoShape === s ? 'on' : ''}"
        onclick="msc_set('${bid}','logoShape','${s}');updateRightPanel()">
        <div class="mse-shape-preview ${s}"></div>${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>
  </div>` : ''}
  <div class="mse-prop-row">
    <div class="mse-range-row">
      <div class="mse-range-header">
        <span class="mse-prop-label">Logo Size</span>
        <span class="mse-range-val" id="logoSzV_${bid}">${p.logoSize || 88}px</span>
      </div>
      <input type="range" class="mse-prop-range" min="40" max="180" step="4" value="${p.logoSize || 88}"
        oninput="document.getElementById('logoSzV_${bid}').textContent=this.value+'px';msc_set('${bid}','logoSize',+this.value)"/>
    </div>
  </div>
  <div class="mse-toggle-row">
    <span>Show Logo Border & Background</span>
    <div class="mse-toggle ${p.logoBorder !== false ? 'on' : ''}"
      onclick="msc_set('${bid}','logoBorder',${p.logoBorder === false});updateRightPanel()"></div>
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Site Name Size', 20, 80, 40)}
  ${msc_colorSection(bid, [
      ['titleColor', 'Site Name', '#ffffff'],
      ['taglineColor', 'Tagline', 'rgba(255,255,255,0.68)'],
    ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;

    /* ─── ABOUT ─────────────────────────────────────────────── */
    case 'about': return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#00d4ff">About</div>
  ${msc_titleRow(bid, p.title, 'About This Event')}
  <div class="mse-prop-row">
    <div class="mse-prop-label">Content</div>
    <textarea class="mse-prop-textarea" oninput="msc_set('${bid}','content',this.value)"
      placeholder="Describe your event…">${(p.content || '').replace(/</g, '&lt;')}</textarea>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Alignment</div>
    <div class="mse-align-row">
      ${['left', 'center', 'right'].map(a => `<button class="mse-align-btn ${p.alignment === a ? 'on' : ''}"
        onclick="msc_set('${bid}','alignment','${a}');updateRightPanel()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
          ${a === 'left' ? '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>' : a === 'center' ? '<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>' : '<line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="9" y2="14"/>'}
        </svg></button>`).join('')}
    </div>
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_fontSizeRow(bid, 'textFontSize', p.textFontSize, 'Content Size', 12, 28, 16)}
  ${msc_colorSection(bid, [
      ['titleColor', 'Section Title', td.text],
      ['textColor', 'Content Text', td.sub],
    ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;

    /* ─── ANNOUNCEMENTS ─────────────────────────────────────── */
    case 'announcements': {
      const items = p.items || [];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#00d4ff">Announcements</div>
  ${msc_titleRow(bid, p.title, 'Announcements')}
  ${msc_alignRow(bid, p)}
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">Items (${items.length})</div>
    ${items.map((item, i) => msc_itemCard(bid, 'items', i, items.length, `Item ${i + 1}`, `
      ${msc_miniTextarea('Text', item.text, `msc_setItem('${bid}','items',${i},'text',this.value)`, 'Announcement text…')}
      ${msc_miniField('Date / Time', item.date, `msc_setItem('${bid}','items',${i},'date',this.value)`, 'text', 'e.g. 10 March 2026')}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
        <span style="font-size:11.5px;color:var(--text-3)">Pinned</span>
        <div class="mse-toggle ${item.pinned ? 'on' : ''}" style="width:32px;height:18px"
          onclick="msc_setItem('${bid}','items',${i},'pinned',${!item.pinned});updateRightPanel()"></div>
      </div>
    `)).join('')}
    ${msc_addBtn('Add Announcement', `msc_addItem('${bid}','items',{id:'a${msc_uid()}',text:'New announcement',date:'',pinned:false})`)}
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_fontSizeRow(bid, 'textFontSize', p.textFontSize, 'Content Size', 12, 28, 15)}
  ${msc_colorSection(bid, [
        ['titleColor', 'Section Title', td.text],
        ['itemTextColor', 'Item Text', td.text],
        ['itemDateColor', 'Item Date', td.muted],
      ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── DATE & VENUE ──────────────────────────────────────── */
    case 'datetime': return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#f59e0b">Date & Venue</div>
  ${msc_alignRow(bid, p)}
  <div class="mse-prop-row">
    <div class="mse-prop-label">Event Date</div>
    <input class="mse-prop-input" value="${(p.date || '').replace(/"/g, '&quot;')}" placeholder="e.g. 15 March 2026"
      oninput="msc_set('${bid}','date',this.value)"/>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="mse-prop-row">
      <div class="mse-prop-label">Start Time</div>
      <input class="mse-prop-input" value="${p.time || ''}" placeholder="10:00 AM"
        oninput="msc_set('${bid}','time',this.value)"/>
    </div>
    <div class="mse-prop-row">
      <div class="mse-prop-label">End Time</div>
      <input class="mse-prop-input" value="${p.endTime || ''}" placeholder="5:00 PM"
        oninput="msc_set('${bid}','endTime',this.value)"/>
    </div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Timezone</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','timezone',this.value)">
      ${['IST', 'UTC', 'GMT', 'EST', 'PST', 'CST', 'AEST', 'CET'].map(tz => `<option value="${tz}" ${p.timezone === tz ? 'selected' : ''}>${tz}</option>`).join('')}
    </select>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Venue Type</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','venueType',this.value);updateRightPanel()">
      <option value="in-person" ${p.venueType !== 'online' && p.venueType !== 'hybrid' ? 'selected' : ''}>In-Person</option>
      <option value="online"    ${p.venueType === 'online' ? 'selected' : ''}>Online</option>
      <option value="hybrid"    ${p.venueType === 'hybrid' ? 'selected' : ''}>Hybrid</option>
    </select>
  </div>
  ${p.venueType !== 'online' ? `
  <div class="mse-prop-row">
    <div class="mse-prop-label">Venue Name</div>
    <input class="mse-prop-input" value="${(p.venueName || '').replace(/"/g, '&quot;')}" placeholder="e.g. Main Auditorium"
      oninput="msc_set('${bid}','venueName',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Address</div>
    <input class="mse-prop-input" value="${(p.venueAddress || '').replace(/"/g, '&quot;')}" placeholder="City, State"
      oninput="msc_set('${bid}','venueAddress',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Google Maps Link</div>
    <input class="mse-prop-input" type="url" value="${p.mapLink || ''}" placeholder="https://maps.google.com/…"
      oninput="msc_set('${bid}','mapLink',this.value)"/>
  </div>` : `
  <div class="mse-prop-row">
    <div class="mse-prop-label">Meeting Link</div>
    <input class="mse-prop-input" type="url" value="${p.onlineLink || ''}" placeholder="https://meet.google.com/…"
      oninput="msc_set('${bid}','onlineLink',this.value)"/>
  </div>`}
  ${msc_colorSection(bid, [
      ['valueColor', 'Value Text', td.text],
      ['labelColor', 'Label Text', td.muted],
    ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;

    /* ─── COUNTDOWN ─────────────────────────────────────────── */
    case 'countdown': return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#f59e0b">Countdown</div>
  ${msc_titleRow(bid, p.title, 'Event Starts In')}
  <div class="mse-prop-row">
    <div class="mse-prop-label">Subtitle</div>
    <input class="mse-prop-input" value="${(p.subtitle || '').replace(/"/g, '&quot;')}" placeholder="Optional supporting text"
      oninput="msc_set('${bid}','subtitle',this.value)"/>
  </div>
  ${msc_alignRow(bid, p)}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="mse-prop-row">
      <div class="mse-prop-label">End Date</div>
      <input class="mse-prop-input" type="date" value="${p.endDate || ''}"
        oninput="msc_set('${bid}','endDate',this.value)"/>
    </div>
    <div class="mse-prop-row">
      <div class="mse-prop-label">End Time</div>
      <input class="mse-prop-input" type="time" value="${p.endTime || ''}"
        oninput="msc_set('${bid}','endTime',this.value)"/>
    </div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Timezone</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','timezoneOffset',this.value)">
      ${[
        ['+05:30', 'IST (UTC+05:30)'],
        ['+00:00', 'UTC / GMT'],
        ['-05:00', 'EST (UTC-05:00)'],
        ['-08:00', 'PST (UTC-08:00)'],
        ['+01:00', 'CET (UTC+01:00)'],
        ['+04:00', 'GST (UTC+04:00)'],
        ['+08:00', 'SGT (UTC+08:00)'],
        ['+10:00', 'AEST (UTC+10:00)'],
      ].map(([v, label]) => `<option value="${v}" ${(p.timezoneOffset || '+05:30') === v ? 'selected' : ''}>${label}</option>`).join('')}
    </select>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Expired Message</div>
    <input class="mse-prop-input" value="${(p.expiredMessage || '').replace(/"/g, '&quot;')}" placeholder="Shown when the timer reaches zero"
      oninput="msc_set('${bid}','expiredMessage',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Display Style</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','layout',this.value)">
      <option value="cards" ${p.layout !== 'minimal' ? 'selected' : ''}>Cards</option>
      <option value="minimal" ${p.layout === 'minimal' ? 'selected' : ''}>Minimal</option>
    </select>
  </div>
  <div class="mse-toggle-row">
    <span>Show Unit Labels</span>
    <div class="mse-toggle ${p.showLabels !== false ? 'on' : ''}"
      onclick="msc_set('${bid}','showLabels',${p.showLabels === false});updateRightPanel()"></div>
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_fontSizeRow(bid, 'numberFontSize', p.numberFontSize, 'Number Size', 22, 72, 48)}
  ${msc_colorSection(bid, [
      ['titleColor', 'Section Title', td.text],
      ['subtitleColor', 'Subtitle', td.sub],
      ['numberColor', 'Numbers', td.text],
      ['labelColor', 'Unit Labels', td.muted],
      ['cardColor', 'Card Background', td.text],
    ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;

    /* ─── SPEAKERS ──────────────────────────────────────────── */
    case 'speakers': {
      const items = p.items || [];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#f59e0b">Speakers / Team</div>
  ${msc_titleRow(bid, p.title, 'Speakers')}
  <div class="mse-prop-row">
    <div class="mse-prop-label">Layout</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','layout',this.value)">
      <option value="grid" ${p.layout !== 'list' ? 'selected' : ''}>Grid</option>
      <option value="list" ${p.layout === 'list' ? 'selected' : ''}>List</option>
    </select>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Card Alignment</div>
    <div class="mse-align-row">
      ${['left', 'center'].map(a => `<button class="mse-align-btn ${(p.alignment || 'center') === a ? 'on' : ''}"
        onclick="msc_set('${bid}','alignment','${a}');updateRightPanel()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
          ${a === 'left' ? '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>' : '<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>'}
        </svg></button>`).join('')}
    </div>
  </div>
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">People (${items.length})</div>
    ${items.map((sp, i) => msc_itemCard(bid, 'items', i, items.length, sp.name || `Person ${i + 1}`, `
      ${msc_miniField('Name', sp.name, `msc_setItem('${bid}','items',${i},'name',this.value)`, 'text', 'Full name')}
      ${msc_miniField('Role', sp.role, `msc_setItem('${bid}','items',${i},'role',this.value)`, 'text', 'e.g. Keynote Speaker')}
      ${msc_miniField('Photo URL', sp.photo, `msc_setItem('${bid}','items',${i},'photo',this.value);updateRightPanel()`, 'url', 'https://…')}
    ${sp.photo ? `<div style="margin-bottom:8px;border-radius:8px;overflow:hidden;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"><img src="${sp.photo}" style="width:100%;max-height:80px;object-fit:cover;display:block" onerror="this.style.display='none'"/></div>` : ''}
      ${msc_miniTextarea('Short Bio', sp.bio, `msc_setItem('${bid}','items',${i},'bio',this.value)`, 'Brief biography…')}
    `)).join('')}
    ${msc_addBtn('Add Person', `msc_addItem('${bid}','items',{id:'sp${msc_uid()}',name:'',role:'',photo:'',bio:''})`)}
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_colorSection(bid, [
        ['titleColor', 'Section Title', td.text],
        ['nameColor', 'Speaker Name', td.text],
        ['roleColor', 'Role / Title', td.accent],
        ['bioColor', 'Bio Text', td.sub],
      ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── FAQ ───────────────────────────────────────────────── */
    case 'faq': {
      const items = p.items || [];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#f59e0b">FAQ</div>
  ${msc_titleRow(bid, p.title, 'Frequently Asked Questions')}
  ${msc_alignRow(bid, p)}
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">Questions (${items.length})</div>
    ${items.map((q, i) => msc_itemCard(bid, 'items', i, items.length, `Q${i + 1}`, `
      ${msc_miniField('Question', q.question, `msc_setItem('${bid}','items',${i},'question',this.value)`, 'text', 'The question…')}
      ${msc_miniTextarea('Answer', q.answer, `msc_setItem('${bid}','items',${i},'answer',this.value)`, 'The answer…')}
    `)).join('')}
    ${msc_addBtn('Add Question', `msc_addItem('${bid}','items',{id:'q${msc_uid()}',question:'',answer:''})`)}
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_fontSizeRow(bid, 'textFontSize', p.textFontSize, 'Q&A Text Size', 12, 28, 15)}
  ${msc_colorSection(bid, [
        ['titleColor', 'Section Title', td.text],
        ['questionColor', 'Question', td.text],
        ['answerColor', 'Answer', td.sub],
      ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }
      /** Sponsor item card — uses msc_removeSponsorItem instead of msc_removeItem */
      function msc_sponsorItemCard(bid, tierIdx, si, total, label, innerHtml) {
        return `
<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:8px;overflow:hidden">
  <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06)">
    <span style="font-size:11.5px;font-weight:700;color:var(--text-3);flex:1;text-transform:uppercase;letter-spacing:0.5px">${label}</span>
    ${si > 0 ? `<button class="mse-icon-btn" title="Move up" onclick="msc_moveSponsorItem('${bid}',${tierIdx},${si},-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
    ${si < total - 1 ? `<button class="mse-icon-btn" title="Move down" onclick="msc_moveSponsorItem('${bid}',${tierIdx},${si},1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
    <button class="mse-icon-btn" title="Delete" style="color:var(--red)" onclick="msc_removeSponsorItem('${bid}',${tierIdx},${si})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div style="padding:10px">${innerHtml}</div>
</div>`;
      }

      function msc_moveSponsorItem(blockId, tierIdx, si, dir) {
        const block = MSState.getBlock(blockId);
        if (!block) return;
        const tiers = JSON.parse(JSON.stringify(block.props.tiers || []));
        const items = tiers[tierIdx]?.items;
        if (!items) return;
        const n = si + dir;
        if (n < 0 || n >= items.length) return;
        [items[si], items[n]] = [items[n], items[si]];
        MSState.updateBlock(blockId, { tiers });
        updateRightPanel();
      }
    /* ─── SPONSORS ──────────────────────────────────────────── */
    case 'sponsors': {
      const tiers = p.tiers || [];
      const tiersHtml = tiers.map((tier, ti) => {
        const tierItems = tier.items || [];
        const itemsHtml = tierItems.map((s, si) => msc_sponsorItemCard(bid, ti, si, tierItems.length, s.name || `Sponsor ${si + 1}`, `          ${msc_miniField('Sponsor Name', s.name, `msc_setSponsorItem('${bid}',${ti},${si},'name',this.value)`, 'text', 'Company name')}
          ${msc_miniField('Logo URL', s.logo, `msc_setSponsorItem('${bid}',${ti},${si},'logo',this.value)`, 'url', 'https://…')}
          ${msc_miniField('Website URL', s.url, `msc_setSponsorItem('${bid}',${ti},${si},'url',this.value)`, 'url', 'https://…')}
        `)).join('');
        return `
<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:10px;overflow:hidden">
  <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(245,158,11,0.06);border-bottom:1px solid rgba(255,255,255,0.06)">
    <input class="mse-prop-input" value="${(tier.name || '').replace(/"/g, '&quot;')}"
      placeholder="Tier name" style="flex:1;font-size:12.5px;padding:5px 8px;font-weight:700"
      oninput="msc_setTierName('${bid}',${ti},this.value)"/>
    ${tiers.length > 1 ? `<button class="mse-icon-btn" title="Remove tier" style="color:var(--red)"
      onclick="msc_removeTier('${bid}',${ti})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>` : ''}
  </div>
  <div style="padding:8px 10px">
    ${itemsHtml}
    ${msc_addBtn('Add Sponsor', `msc_addSponsorItem('${bid}',${ti})`)}
  </div>
</div>`;
      }).join('');
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#f59e0b">Sponsors</div>
  ${msc_titleRow(bid, p.title, 'Our Sponsors')}
  <div class="mse-prop-row">
    <div class="mse-prop-label">Logo Alignment</div>
    <div class="mse-align-row">
      ${['left', 'center', 'right'].map(a => `<button class="mse-align-btn ${(p.alignment || 'center') === a ? 'on' : ''}"
        onclick="msc_set('${bid}','alignment','${a}');updateRightPanel()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
          ${a === 'left' ? '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>' : a === 'center' ? '<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>' : '<line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="9" y2="14"/>'}
        </svg></button>`).join('')}
    </div>
  </div>
  <div class="mse-toggle-row">
    <span>Horizontal layout (side by side)</span>
    <div class="mse-toggle ${p.horizontal !== false ? 'on' : ''}"
      onclick="msc_set('${bid}','horizontal',${p.horizontal === false});updateRightPanel()"></div>
  </div>
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">Tiers (${tiers.length})</div>
    ${tiersHtml}
    ${msc_addBtn('Add Tier', `msc_addTier('${bid}')`)}
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_colorSection(bid, [
        ['titleColor', 'Section Title', td.text],
        ['tierNameColor', 'Tier Name', td.muted],
      ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── FORM ──────────────────────────────────────────────── */
    case 'form': {
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#a78bfa">Connect a Form</div>

  <div class="mse-prop-row">
    <div class="mse-prop-label">Block Title</div>
    <input class="mse-prop-input" value="${p.title || 'Register Now'}"
      oninput="msc_set('${bid}','title',this.value)"/>
  </div>

  <div class="mse-prop-row">
    <div class="mse-prop-label">Subtitle</div>
    <input class="mse-prop-input" value="${(p.subtitle || '').replace(/"/g, '&quot;')}" placeholder="Optional tagline"
      oninput="msc_set('${bid}','subtitle',this.value)"/>
  </div>

  <div class="mse-prop-row">
    <div class="mse-prop-label">Form Source</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${['url', 'gsform'].map(t => `
      <label style="display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:8px;cursor:pointer;border:1.5px solid ${(p.connectType || 'url') === t ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.12)'};background:${(p.connectType || 'url') === t ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)'};transition:all 0.15s">
        <input type="radio" name="ct_${bid}" value="${t}" ${(p.connectType || 'url') === t ? 'checked' : ''} style="display:none"
          onchange="msc_set('${bid}','connectType','${t}');updateRightPanel()"/>
        <div style="width:14px;height:14px;border-radius:50%;border:2px solid ${(p.connectType || 'url') === t ? 'var(--cyan)' : 'rgba(255,255,255,0.3)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${(p.connectType || 'url') === t ? '<div style=\"width:6px;height:6px;border-radius:50%;background:var(--cyan)\"></div>' : ''}
        </div>
        <div>
          <div style="font-size:12.5px;font-weight:600;color:var(--text)">${t === 'url' ? 'Paste any form URL' : 'GS Forms'}</div>
          <div style="font-size:11px;color:var(--text-3)">${t === 'url' ? 'Google Forms, Typeform, Jotform…' : 'Forms built with our Form Builder'}</div>
        </div>
      </label>`).join('')}
    </div>
  </div>

  ${(p.connectType || 'url') === 'url' ? `
  <div class="mse-prop-row">
    <div class="mse-prop-label">Form URL</div>
    <input class="mse-prop-input" type="url" value="${p.connectUrl || ''}" placeholder="https://forms.google.com/…"
      oninput="msc_set('${bid}','connectUrl',this.value)"/>
    <div class="mse-prop-hint">Paste your Google Forms, Typeform, or any other form link</div>
  </div>` : `
  <div class="mse-prop-row">
    <div class="mse-prop-label">Select GS Form</div>
    <select class="mse-prop-select" id="gsfPicker_${bid}"
            onchange="if(typeof msePickHxForm==='function') { msePickHxForm('${bid}',this.value); } else { msc_set('${bid}', 'gsFormSlug', this.value); msc_set('${bid}', 'connectUrl', window.location.origin + '/gs-form-view.html?f=' + this.value); }">
      <option value="">Loading your forms…</option>
    </select>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Embed Height</div>
    <input class="mse-prop-input" type="number" min="520" max="1400" step="20" value="${p.gsEmbedHeight || 820}"
      oninput="msc_set('${bid}','gsEmbedHeight',Math.max(520,Math.min(1400,+this.value||820)))"/>
    <div class="mse-prop-hint">Adjust if your form needs more vertical space on the public mini site</div>
  </div>
  <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" 
       onload="(typeof mseLoadHxForms==='function') && mseLoadHxForms('${bid}','${(p.gsFormSlug || ((p.connectUrl || '').match(/[?&]f=([^&#]+)/)?.[1] || '')).replace(/'/g, "\\\\\\'")}');" 
       style="display:none">`}

  <div class="mse-prop-row">
    <div class="mse-prop-label">Button Label</div>
    <input class="mse-prop-input" value="${p.buttonText || 'Register Now'}"
      oninput="msc_set('${bid}','buttonText',this.value)"/>
  </div>

  <div class="mse-prop-row">
    <div class="mse-prop-label">Button Colour</div>
    <div class="mse-color-row">
      <div class="mse-color-swatch" style="background:${p.buttonColor || MSState.config.accentColor || '#00d4ff'}">
        <input type="color" value="${p.buttonColor || MSState.config.accentColor || '#00d4ff'}"
          oninput="msc_set('${bid}','buttonColor',this.value)"/>
      </div>
      <input type="text" class="mse-prop-input" value="${p.buttonColor || ''}" placeholder="Uses accent colour"
        oninput="msc_set('${bid}','buttonColor',this.value)" style="flex:1"/>
    </div>
  </div>

  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_colorSection(bid, [
        ['titleColor', 'Block Title', td.text],
        ['subtitleColor', 'Subtitle', td.sub],
      ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── DOCUMENTS ─────────────────────────────────────────── */
    case 'documents': {
      const items = p.items || [];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#a78bfa">Document Links</div>
  ${msc_titleRow(bid, p.title, 'Resources')}
  ${msc_alignRow(bid, p)}
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">Documents (${items.length})</div>
    ${items.map((doc, i) => msc_itemCard(bid, 'items', i, items.length, doc.label || `Document ${i + 1}`, `
      ${msc_miniField('Label', doc.label, `msc_setItem('${bid}','items',${i},'label',this.value)`, 'text', 'e.g. Rule Book, Brochure')}
      ${msc_miniField('Short Description', doc.desc, `msc_setItem('${bid}','items',${i},'desc',this.value)`, 'text', 'Optional — PDF, 2 pages')}
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Link Source</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <button onclick="msc_setItem('${bid}','items',${i},'linkType','drive');updateRightPanel()"
            style="padding:6px 4px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all 0.15s;border:1px solid ${doc.linkType !== 'manual' ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.08)'};background:${doc.linkType !== 'manual' ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)'};color:${doc.linkType !== 'manual' ? 'var(--cyan)' : 'var(--text-3)'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;display:inline;vertical-align:-1px;margin-right:3px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Drive Link
          </button>
          <button onclick="msc_setItem('${bid}','items',${i},'linkType','manual');updateRightPanel()"
            style="padding:6px 4px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all 0.15s;border:1px solid ${doc.linkType === 'manual' ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.08)'};background:${doc.linkType === 'manual' ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)'};color:${doc.linkType === 'manual' ? 'var(--cyan)' : 'var(--text-3)'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;display:inline;vertical-align:-1px;margin-right:3px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Paste URL
          </button>
        </div>
      </div>
      <div>
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${doc.linkType === 'manual' ? 'URL' : 'Google Drive Share Link'}</div>
        <input type="url" class="mse-prop-input" value="${doc.url || ''}"
          placeholder="${doc.linkType === 'manual' ? 'https://…' : 'Paste Drive share link'}"
          oninput="msc_setItem('${bid}','items',${i},'url',this.value)"
          style="font-size:12.5px;padding:7px 9px"/>
        <div style="font-size:10.5px;color:var(--text-3);margin-top:3px;line-height:1.5">
          ${doc.linkType === 'manual' ? 'Any public URL — PDF, Doc, image, etc.' : 'On Drive: Share → Anyone with link → Copy link. File opens in Drive viewer.'}
        </div>
      </div>
    `)).join('')}
    ${msc_addBtn('Add Document', `msc_addItem('${bid}','items',{id:'d${msc_uid()}',label:'',desc:'',url:'',linkType:'drive'})`)}
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_colorSection(bid, [
        ['titleColor', 'Section Title', td.text],
        ['itemLabelColor', 'Item Label', td.text],
        ['itemDescColor', 'Item Desc', td.muted],
      ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── VIDEO ─────────────────────────────────────────────── */
    case 'video': {
      const items = p.items || [];
      const atMax = items.length >= 2;
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#a78bfa">Video</div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Section Title</div>
    <input class="mse-prop-input" value="${(p.title || '').replace(/"/g, '&quot;')}" placeholder="Optional — leave blank to hide"
      oninput="msc_set('${bid}','title',this.value)"/>
  </div>
  ${msc_alignRow(bid, p)}
  <div class="mse-prop-row" style="margin-top:4px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="mse-prop-label">Videos (${items.length} / 2)</div>
      ${atMax ? `<span style="font-size:11px;color:var(--gold);font-weight:600">Max 2 reached</span>` : ''}
    </div>
    ${items.map((v, i) => msc_itemCard(bid, 'items', i, items.length, v.title || `Video ${i + 1}`, `
      ${msc_miniField('Title', v.title, `msc_setItem('${bid}','items',${i},'title',this.value)`, 'text', 'Optional video title')}
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Video URL</div>
        <input type="url" class="mse-prop-input" value="${v.url || ''}"
          placeholder="YouTube or Google Drive link"
          oninput="msc_onVideoUrl('${bid}',${i},this.value)"
          style="font-size:12.5px;padding:7px 9px"/>
        <div style="font-size:10.5px;color:var(--text-3);margin-top:3px;line-height:1.5">YouTube links auto-embed. Drive links need a custom thumbnail.</div>
      </div>
      <div>
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">
          Thumbnail
          ${v.url && msb_ytId && msb_ytId(v.url) ? '<span style="color:var(--green);font-weight:700;margin-left:4px">✓ Auto from YouTube</span>' : ''}
        </div>
        ${v.url && msb_ytId && msb_ytId(v.url) ?
          `<div style="aspect-ratio:16/9;border-radius:6px;overflow:hidden;margin-bottom:6px;background:#000"><img src="https://img.youtube.com/vi/${msb_ytId(v.url)}/maxresdefault.jpg" style="width:100%;height:100%;object-fit:cover;opacity:0.8"/></div>` : ''}
        ${!v.url || !msb_ytId || !msb_ytId(v.url) ?
          `<input type="url" class="mse-prop-input" value="${v.thumbnail || ''}"
            placeholder="https://… custom thumbnail URL"
            oninput="msc_setItem('${bid}','items',${i},'thumbnail',this.value)"
            style="font-size:12.5px;padding:7px 9px"/>` : ''}
      </div>
    `)).join('')}
    ${!atMax ? msc_addBtn('Add Video', `msc_addItem('${bid}','items',{id:'v${msc_uid()}',url:'',title:'',thumbnail:''})`) : ''}
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_colorSection(bid, [
            ['titleColor', 'Section Title', td.text],
            ['videoTitleColor', 'Video Title', td.text],
          ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── SOCIALS ────────────────────────────────────────────── */
    case 'socials': {
      const links = p.links || [];
      const PLATFORMS = [
        'instagram', 'twitter', 'x', 'linkedin', 'youtube',
        'github', 'facebook', 'whatsapp', 'telegram', 'discord', 'website',
      ];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#a78bfa">Social Links</div>
  ${msc_titleRow(bid, p.title, 'Follow Us')}
  ${msc_alignRow(bid, p)}
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">Links (${links.length})</div>
    ${links.map((lk, i) => msc_itemCard(bid, 'links', i, links.length, lk.platform || `Link ${i + 1}`, `
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Platform</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${PLATFORMS.map(pl => {
        const ic = (typeof MSB_SOCIAL_ICONS !== 'undefined' && MSB_SOCIAL_ICONS[pl]) || {};
        const isActive = lk.platform === pl;
        return `<button onclick="msc_setItem('${bid}','links',${i},'platform','${pl}');updateRightPanel()"
              title="${pl}"
              style="width:30px;height:30px;border-radius:7px;border:1px solid ${isActive ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.07)'};background:${isActive ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)'};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s">
              ${ic.fill
                ? `<svg viewBox="0 0 24 24" fill="${isActive ? 'var(--cyan)' : 'var(--text-3)'}" stroke="none" style="width:13px;height:13px">${ic.path}</svg>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="${isActive ? 'var(--cyan)' : 'var(--text-3)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">${ic.path || '<circle cx="12" cy="12" r="10"/>'}</svg>`}
            </button>`;
      }).join('')}
        </div>
      </div>
      ${msc_miniField('Profile URL', lk.url, `msc_setItem('${bid}','links',${i},'url',this.value)`, 'url', 'https://…')}
    `)).join('')}
    ${msc_addBtn('Add Social Link', `msc_addItem('${bid}','links',{id:'sl${msc_uid()}',platform:'instagram',url:''})`)}
  </div>
  ${msc_fontSizeRow(bid, 'titleFontSize', p.titleFontSize, 'Title Size', 16, 60, 32)}
  ${msc_colorSection(bid, [
        ['titleColor', 'Section Title', td.text],
      ])}
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── DIVIDER ────────────────────────────────────────────── */
    case 'divider': return `
<div class="mse-props-section">
  <div class="mse-props-sec-label">Divider</div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Style</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','style',this.value)">
      <option value="line" ${p.style !== 'dots' ? 'selected' : ''}>Line</option>
      <option value="dots" ${p.style === 'dots' ? 'selected' : ''}>Dots</option>
    </select>
  </div>
  <div class="mse-prop-row">
    <div class="mse-range-row">
      <div class="mse-range-header">
        <span class="mse-prop-label">Opacity</span>
        <span class="mse-range-val" id="divOpV_${bid}">${p.opacity || 30}%</span>
      </div>
      <input type="range" class="mse-prop-range" min="5" max="100" step="5" value="${p.opacity || 30}"
        oninput="document.getElementById('divOpV_${bid}').textContent=this.value+'%';msc_set('${bid}','opacity',+this.value)"/>
    </div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-range-row">
      <div class="mse-range-header">
        <span class="mse-prop-label">Thickness</span>
        <span class="mse-range-val" id="divThV_${bid}">${p.thickness || 1}px</span>
      </div>
      <input type="range" class="mse-prop-range" min="1" max="8" step="1" value="${p.thickness || 1}"
        oninput="document.getElementById('divThV_${bid}').textContent=this.value+'px';msc_set('${bid}','thickness',+this.value)"/>
    </div>
  </div>
  ${msc_bgRow(bid, p.bgColor)}
</div>`;

    /* ─── SPACER ─────────────────────────────────────────────── */
    case 'spacer': return `
<div class="mse-props-section">
  <div class="mse-props-sec-label">Spacer</div>
  <div class="mse-prop-row">
    <div class="mse-range-row">
      <div class="mse-range-header">
        <span class="mse-prop-label">Height</span>
        <span class="mse-range-val" id="spHV_${bid}">${p.height || 48}px</span>
      </div>
      <input type="range" class="mse-prop-range" min="8" max="200" step="4" value="${p.height || 48}"
        oninput="document.getElementById('spHV_${bid}').textContent=this.value+'px';msc_set('${bid}','height',+this.value)"/>
    </div>
  </div>
  ${msc_bgRow(bid, p.bgColor)}
</div>`;

    default:
      return `<div class="mse-right-empty"><p>No properties for this block type.</p></div>`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   SPONSOR-SPECIFIC HELPERS
   (sponsors have a nested array-of-arrays structure)
═══════════════════════════════════════════════════════════════ */
function msc_setTierName(blockId, tierIdx, value) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const tiers = JSON.parse(JSON.stringify(block.props.tiers || []));
  if (!tiers[tierIdx]) return;
  tiers[tierIdx].name = value;
  MSState.updateBlock(blockId, { tiers });
  // onChange handles canvas refresh
}

function msc_removeTier(blockId, tierIdx) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const tiers = (block.props.tiers || []).filter((_, i) => i !== tierIdx);
  MSState.updateBlock(blockId, { tiers });
  updateRightPanel();
}

function msc_addTier(blockId) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const tiers = JSON.parse(JSON.stringify(block.props.tiers || []));
  tiers.push({ id: 't' + msc_uid(), name: 'Sponsor Tier', items: [] });
  MSState.updateBlock(blockId, { tiers });
  updateRightPanel();
}

function msc_addSponsorItem(blockId, tierIdx) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const tiers = JSON.parse(JSON.stringify(block.props.tiers || []));
  if (!tiers[tierIdx]) return;
  if (!tiers[tierIdx].items) tiers[tierIdx].items = [];
  tiers[tierIdx].items.push({ id: 's' + msc_uid(), name: '', logo: '', url: '' });
  MSState.updateBlock(blockId, { tiers });
  updateRightPanel();
}

function msc_setSponsorItem(blockId, tierIdx, itemIdx, key, value) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const tiers = JSON.parse(JSON.stringify(block.props.tiers || []));
  if (!tiers[tierIdx]?.items?.[itemIdx]) return;
  tiers[tierIdx].items[itemIdx][key] = value;
  MSState.updateBlock(blockId, { tiers });
  // onChange handles canvas
}

function msc_removeSponsorItem(blockId, tierIdx, itemIdx) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const tiers = JSON.parse(JSON.stringify(block.props.tiers || []));
  tiers[tierIdx].items = tiers[tierIdx].items.filter((_, i) => i !== itemIdx);
  MSState.updateBlock(blockId, { tiers });
  updateRightPanel();
}

/* ═══════════════════════════════════════════════════════════════
   VIDEO URL HANDLER — auto-extracts YouTube thumbnail
═══════════════════════════════════════════════════════════════ */
function msc_onVideoUrl(blockId, idx, url) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const items = JSON.parse(JSON.stringify(block.props.items || []));
  if (!items[idx]) return;
  items[idx].url = url;
  // Auto-set thumbnail for YouTube
  if (typeof msb_ytId === 'function') {
    const ytId = msb_ytId(url);
    if (ytId) {
      items[idx].thumbnail = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
    }
  }
  MSState.updateBlock(blockId, { items });
  updateRightPanel();   // onChange handles canvas
}

/* ═══════════════════════════════════════════════════════════════
   CONFIRM: mini-site-canvas.js fully loaded
═══════════════════════════════════════════════════════════════ */
console.log('[GalSol] mini-site-canvas.js loaded — renderBlockProps overridden ✓');
