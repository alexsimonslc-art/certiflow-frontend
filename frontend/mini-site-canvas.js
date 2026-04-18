/* ================================================================
   Honourix — Mini Site Builder  |  mini-site-canvas.js
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
  return `
<div class="mse-prop-row">
  <div class="mse-prop-label">Section Background</div>
  <div class="mse-color-row">
    <div class="mse-color-swatch" style="background:${v || '#0a0f1e'}">
      <input type="color" value="${v || '#0a0f1e'}"
        oninput="msc_set('${bid}','bgColor',this.value)"/>
    </div>
    <input type="text" class="mse-prop-input" value="${v}" placeholder="Default"
      oninput="msc_set('${bid}','bgColor',this.value)" style="flex:1"/>
    <button onclick="msc_set('${bid}','bgColor','');this.previousElementSibling.value='';this.previousElementSibling.previousElementSibling.style.background='#0a0f1e'"
      style="padding:0 8px;height:32px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:var(--text-3);cursor:pointer;font-size:11px;font-family:var(--font)">Clear</button>
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
   FULL renderBlockProps — overrides the one in mini-site-editor.html
═══════════════════════════════════════════════════════════════ */
function renderBlockProps(block) {
  const p = block.props;
  const bid = block.id;

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
  ${msc_bgRow(bid, p.bgColor)}
</div>`;

    /* ─── ANNOUNCEMENTS ─────────────────────────────────────── */
    case 'announcements': {
      const items = p.items || [];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#00d4ff">Announcements</div>
  ${msc_titleRow(bid, p.title, 'Announcements')}
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
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── DATE & VENUE ──────────────────────────────────────── */
    case 'datetime': return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#f59e0b">Date & Venue</div>
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
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">Questions (${items.length})</div>
    ${items.map((q, i) => msc_itemCard(bid, 'items', i, items.length, `Q${i + 1}`, `
      ${msc_miniField('Question', q.question, `msc_setItem('${bid}','items',${i},'question',this.value)`, 'text', 'The question…')}
      ${msc_miniTextarea('Answer', q.answer, `msc_setItem('${bid}','items',${i},'answer',this.value)`, 'The answer…')}
    `)).join('')}
    ${msc_addBtn('Add Question', `msc_addItem('${bid}','items',{id:'q${msc_uid()}',question:'',answer:''})`)}
  </div>
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── SPONSORS ──────────────────────────────────────────── */
    case 'sponsors': {
      const tiers = p.tiers || [];
      const tiersHtml = tiers.map((tier, ti) => {
        const tierItems = tier.items || [];
        const itemsHtml = tierItems.map((s, si) => msc_itemCard(bid, `__tier_${ti}_items`, si, tierItems.length, s.name || `Sponsor ${si + 1}`, `
          ${msc_miniField('Sponsor Name', s.name, `msc_setSponsorItem('${bid}',${ti},${si},'name',this.value)`, 'text', 'Company name')}
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
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">Tiers (${tiers.length})</div>
    ${tiersHtml}
    ${msc_addBtn('Add Tier', `msc_addTier('${bid}')`)}
  </div>
  ${msc_bgRow(bid, p.bgColor)}
</div>`;
    }

    /* ─── FORM ──────────────────────────────────────────────── */
    case 'form': {
      // ── Migration: old flat fields[] → sections[] ──────────────
      if (p.fields && !p.sections) {
        p.sections = [{
          id: 'sec_1', title: 'Section 1', description: '',
          fields: p.fields.map(f => ({ description: '', ...f })),
          routing: { type: 'auto', conditionFieldId: null, rules: [], defaultGoTo: 'next' },
        }];
        delete p.fields;
        MSState.updateBlock(bid, { sections: p.sections });
        const blk = MSState.getBlock(bid); if (blk) delete blk.props.fields;
      }
      const sections = p.sections || [];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#a78bfa">Registration Form</div>

  <!-- Form settings -->
  ${msc_titleRow(bid, p.title, 'Register Now')}
  <div class="mse-prop-row">
    <div class="mse-prop-label">Subtitle</div>
    <input class="mse-prop-input" value="${(p.subtitle || '').replace(/"/g, '&quot;')}"
      placeholder="Optional description" oninput="msc_set('${bid}','subtitle',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Button Text</div>
    <input class="mse-prop-input" value="${(p.buttonText || 'Submit Registration').replace(/"/g, '&quot;')}"
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
  <div class="mse-prop-row">
    <div class="mse-prop-label">Success Message</div>
    <textarea class="mse-prop-textarea" placeholder="We'll be in touch soon!"
      style="min-height:56px" oninput="msc_set('${bid}','successMessage',this.value)">${(p.successMessage || '').replace(/</g, '&lt;')}</textarea>
    <div class="mse-prop-hint">Shown to the visitor after they submit</div>
  </div>
  <div class="mse-prop-row">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <div class="mse-prop-label" style="margin-bottom:2px">Show Progress Bar</div>
        <div class="mse-prop-hint" style="margin:0">Section X of Y indicator</div>
      </div>
      <div class="mse-toggle ${p.showProgressBar !== false ? 'on' : ''}" style="width:32px;height:18px;flex-shrink:0"
        onclick="msc_set('${bid}','showProgressBar',${p.showProgressBar === false});updateRightPanel()"></div>
    </div>
  </div>
  <div class="mse-prop-row">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div class="mse-prop-label">Alignment</div>
      <div class="mse-align-row">
        ${['left', 'center'].map(a => `<button class="mse-align-btn ${(p.alignment || 'left') === a ? 'on' : ''}"
          onclick="msc_set('${bid}','alignment','${a}');updateRightPanel()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
            ${a === 'left' ? '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>' : '<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>'}
          </svg></button>`).join('')}
      </div>
    </div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Google Sheet <span style="font-size:10px;color:var(--green);font-weight:600;margin-left:6px">AUTO-CREATED ON PUBLISH</span></div>
    <input class="mse-prop-input" value="${p.sheetId || ''}" placeholder="Leave blank — auto-created on Publish"
      oninput="msc_set('${bid}','sheetId',this.value)"/>
    <div class="mse-prop-hint">A Sheet is created automatically when you publish. Or paste an existing Sheet ID here.</div>
  </div>

  <!-- Sections -->
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:10px">
      Sections &nbsp;<span style="font-weight:400;color:var(--text-3)">(${sections.length})</span>
    </div>
    ${sections.map((sec, si) => mscf_sectionCard(bid, sec, si, sections.length)).join('')}
    <button class="mse-add-item-btn" style="margin-top:4px"
      onclick="MSState.addFormSection('${bid}');updateRightPanel()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Section
    </button>
  </div>

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
              <svg viewBox="0 0 24 24" fill="none" stroke="${isActive ? 'var(--cyan)' : 'var(--text-3)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">${ic.path || '<circle cx="12" cy="12" r="10"/>'}</svg>
            </button>`;
      }).join('')}
        </div>
      </div>
      ${msc_miniField('Profile URL', lk.url, `msc_setItem('${bid}','links',${i},'url',this.value)`, 'url', 'https://…')}
    `)).join('')}
    ${msc_addBtn('Add Social Link', `msc_addItem('${bid}','links',{id:'sl${msc_uid()}',platform:'instagram',url:''})`)}
  </div>
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
console.log('[Honourix] mini-site-canvas.js loaded — renderBlockProps overridden ✓');
/* ═══════════════════════════════════════════════════════════════
   FORM BLOCK EDITOR HELPERS  (mscf_*)
   Used exclusively by the case 'form' prop panel.
═══════════════════════════════════════════════════════════════ */

/* Field type metadata — groups + labels */
const MSCF_FIELD_TYPES = [
  {
    group: 'Text Inputs', types: [
      { t: 'text', icon: 'T', label: 'Short Text' },
      { t: 'textarea', icon: '¶', label: 'Long Text' },
      { t: 'email', icon: '@', label: 'Email' },
      { t: 'tel', icon: '#', label: 'Phone' },
      { t: 'number', icon: '12', label: 'Number' },
      { t: 'url', icon: '⎈', label: 'URL' },
      { t: 'date', icon: '📅', label: 'Date' },
      { t: 'time', icon: '⏱', label: 'Time' },
    ]
  },
  {
    group: 'Choice', types: [
      { t: 'radio', icon: '◉', label: 'Multiple Choice' },
      { t: 'checkbox-group', icon: '☑', label: 'Checkboxes' },
      { t: 'dropdown', icon: '▾', label: 'Dropdown' },
      { t: 'linear-scale', icon: '━', label: 'Linear Scale' },
      { t: 'rating', icon: '★', label: 'Star Rating' },
      { t: 'ranking', icon: '↕', label: 'Ranking' },
      { t: 'image-choice', icon: '🖼', label: 'Image Choice' },
    ]
  },
  {
    group: 'Media / Upload', types: [
      { t: 'file', icon: '📎', label: 'File Upload' },
    ]
  },
  {
    group: 'Special', types: [
      { t: 'section-text', icon: 'ℹ', label: 'Instruction Text' },
      { t: 'divider', icon: '─', label: 'Divider' },
    ]
  },
];

function mscf_typeBadge(type) {
  const colors = {
    text: '#60a5fa', textarea: '#60a5fa', email: '#a78bfa', tel: '#a78bfa',
    number: '#34d399', url: '#34d399', date: '#f59e0b', time: '#f59e0b',
    'datetime-local': '#f59e0b',
    radio: '#f472b6', 'checkbox-group': '#f472b6', dropdown: '#f472b6',
    'linear-scale': '#00d4ff', rating: '#fbbf24', ranking: '#fb923c',
    'image-choice': '#c084fc', file: '#94a3b8',
    'section-text': '#4ade80', divider: '#64748b',
  };
  const names = {
    text: 'Text', textarea: 'Textarea', email: 'Email', tel: 'Phone',
    number: 'Number', url: 'URL', date: 'Date', time: 'Time',
    'datetime-local': 'Date+Time', radio: 'Choice', 'checkbox-group': 'Checkboxes',
    dropdown: 'Dropdown', 'linear-scale': 'Scale', rating: 'Rating',
    ranking: 'Ranking', 'image-choice': 'Img Choice', file: 'File',
    'section-text': 'Text Block', divider: 'Divider', select: 'Dropdown',
    checkbox: 'Checkboxes',
  };
  const c = colors[type] || '#94a3b8';
  return `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${c}22;color:${c};flex-shrink:0">${names[type] || type}</span>`;
}

/* Type picker overlay (injected inline beneath the "Add Field" button) */
function mscf_showTypePicker(bid, secId) {
  const existing = document.getElementById(`mscf-picker-${secId}`);
  if (existing) { existing.remove(); return; }
  const btn = document.querySelector(`[data-add-field-btn="${secId}"]`);
  if (!btn) return;
  const div = document.createElement('div');
  div.id = `mscf-picker-${secId}`;
  div.style.cssText = 'background:#0d1424;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-top:8px;position:relative;z-index:10';
  div.innerHTML = MSCF_FIELD_TYPES.map(group => `
    <div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">${group.group}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        ${group.types.map(ft => `
        <button onclick="MSState.addFormField('${bid}','${secId}','${ft.t}');updateRightPanel()"
          style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.03);color:var(--text-2);font-size:12px;cursor:pointer;font-family:var(--font);text-align:left;transition:background 0.1s"
          onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)'">
          <span style="font-size:13px;flex-shrink:0">${ft.icon}</span>
          <span>${ft.label}</span>
        </button>`).join('')}
      </div>
    </div>`).join('');
  btn.insertAdjacentElement('afterend', div);
}

/* Section-level card (wraps fields + routing) */
function mscf_sectionCard(bid, sec, si, total) {
  const fields = sec.fields || [];
  const canDel = total > 1;
  return `
<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.09);border-radius:11px;margin-bottom:10px;overflow:hidden">

  <!-- Section header -->
  <div style="display:flex;align-items:center;gap:6px;padding:9px 10px;background:rgba(124,58,237,0.08);border-bottom:1px solid rgba(255,255,255,0.06)">
    <span style="font-size:11px;font-weight:700;color:#a78bfa;flex-shrink:0">${si + 1}</span>
    <input class="mse-prop-input" value="${(sec.title || '').replace(/"/g, '&quot;')}"
      placeholder="Section title"
      style="flex:1;font-size:12.5px;padding:4px 8px;background:transparent;border-color:transparent"
      oninput="mscf_updateSection('${bid}','${sec.id}','title',this.value)"/>
    ${si > 0 ? `<button class="mse-icon-btn" title="Move up" onclick="mscf_moveSection('${bid}',${si},-1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
    ${si < total - 1 ? `<button class="mse-icon-btn" title="Move down" onclick="mscf_moveSection('${bid}',${si},+1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
    ${canDel ? `<button class="mse-icon-btn" title="Delete section" style="color:var(--red)"
      onclick="if(confirm('Delete this section and all its fields?'))MSState.removeFormSection('${bid}','${sec.id}');updateRightPanel()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
  </div>

  <!-- Section body -->
  <div style="padding:10px">
    <!-- Description -->
    <div style="margin-bottom:10px">
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Description (optional)</div>
      <textarea class="mse-prop-textarea" placeholder="Instructions shown above fields…"
        style="min-height:44px;font-size:12px"
        oninput="mscf_updateSection('${bid}','${sec.id}','description',this.value)">${(sec.description || '').replace(/</g, '&lt;')}</textarea>
    </div>

    <!-- Fields list -->
    <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">
      Fields (${fields.length})
    </div>
    ${fields.length ? fields.map((f, fi) => mscf_fieldCard(bid, sec.id, f, fi, fields.length)).join('') : `
    <div style="text-align:center;padding:14px 0;font-size:12px;color:var(--text-3)">No fields yet — add one below</div>`}

    <!-- Add field -->
    <button class="mse-add-item-btn" style="width:100%;margin-top:6px"
      data-add-field-btn="${sec.id}"
      onclick="mscf_showTypePicker('${bid}','${sec.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Field
    </button>

    <!-- Section routing -->
    ${mscf_routingPanel(bid, sec, si, total)}
  </div>
</div>`;
}

/* Individual field row with expand-on-click details */
function mscf_fieldCard(bid, secId, f, fi, total) {
  const hasOptions = ['radio', 'checkbox-group', 'dropdown', 'ranking', 'image-choice', 'checkbox', 'select'].includes(f.type);
  const isSpecial = f.type === 'section-text' || f.type === 'divider';
  return `
<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;margin-bottom:6px;overflow:hidden">

  <!-- Field row: label + type badge + required + move/del -->
  <div style="display:flex;align-items:center;gap:6px;padding:7px 8px">
    <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0;cursor:ns-resize;opacity:0.35">
      <div style="width:12px;height:1.5px;background:currentColor;border-radius:2px"></div>
      <div style="width:12px;height:1.5px;background:currentColor;border-radius:2px"></div>
      <div style="width:12px;height:1.5px;background:currentColor;border-radius:2px"></div>
    </div>
    ${mscf_typeBadge(f.type)}
    ${isSpecial
      ? `<span style="flex:1;font-size:12px;color:var(--text-3);font-style:italic">${f.type === 'divider' ? '— divider —' : (f.heading || 'Instruction text')}</span>`
      : `<input class="mse-prop-input" value="${(f.label || '').replace(/"/g, '&quot;')}"
          placeholder="Question label" style="flex:1;font-size:12.5px;padding:4px 7px;background:transparent;border-color:transparent"
          oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{label:this.value})"/>`}
    ${!isSpecial ? `<div class="mse-toggle ${f.required ? 'on' : ''}" title="${f.required ? 'Required' : 'Optional'}" style="width:28px;height:16px;flex-shrink:0"
      onclick="MSState.updateFormField('${bid}','${secId}','${f.id}',{required:${!f.required}});updateRightPanel()"></div>` : ''}
    ${fi > 0 ? `<button class="mse-icon-btn" onclick="mscf_moveField('${bid}','${secId}',${fi},-1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
    ${fi < total - 1 ? `<button class="mse-icon-btn" onclick="mscf_moveField('${bid}','${secId}',${fi},+1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
    <button class="mse-icon-btn" style="color:var(--red)"
      onclick="MSState.removeFormField('${bid}','${secId}','${f.id}');updateRightPanel()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    <button class="mse-icon-btn" title="Expand"
      onclick="const d=this.closest('[data-field-card]').querySelector('[data-field-detail]');d.style.display=d.style.display==='none'?'block':'none'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><polyline points="6 9 12 15 18 9"/></svg></button>
  </div>

  <!-- Expanded details (hidden by default) -->
  <div data-field-detail style="display:none;padding:8px 10px;border-top:1px solid rgba(255,255,255,0.06)">
    ${isSpecial ? mscf_specialFieldProps(bid, secId, f) : mscf_fieldProps(bid, secId, f, hasOptions)}
  </div>

</div>`;
}

function mscf_fieldProps(bid, secId, f, hasOptions) {
  return `
  ${f.type !== 'rating' ? `
  <div style="margin-bottom:8px">
    <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Placeholder</div>
    <input class="mse-prop-input" value="${(f.placeholder || '').replace(/"/g, '&quot;')}"
      placeholder="Hint text inside the input" style="font-size:12px;padding:6px 8px"
      oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{placeholder:this.value})"/>
  </div>` : ''}
  <div style="margin-bottom:8px">
    <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Helper Text</div>
    <input class="mse-prop-input" value="${(f.description || '').replace(/"/g, '&quot;')}"
      placeholder="Optional note shown below the label" style="font-size:12px;padding:6px 8px"
      oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{description:this.value})"/>
  </div>
  ${hasOptions ? `
  <div style="margin-bottom:8px">
    <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Options (one per line)</div>
    <textarea class="mse-prop-textarea" style="min-height:72px;font-size:12px;font-family:var(--font-mono)"
      oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{options:this.value.split('\\n').map(s=>s.trim()).filter(Boolean)})">${((f.options || []).map(o => typeof o === 'object' ? o.label : o)).join('\n').replace(/</g, '&lt;')}</textarea>
  </div>` : ''}
  ${f.type === 'linear-scale' ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
    <div>
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Min</div>
      <input type="number" class="mse-prop-input" value="${f.min || 1}" style="font-size:12px;padding:6px 8px"
        oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{min:+this.value})"/>
    </div>
    <div>
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Max</div>
      <input type="number" class="mse-prop-input" value="${f.max || 5}" style="font-size:12px;padding:6px 8px"
        oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{max:+this.value})"/>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
    <div>
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Min Label</div>
      <input class="mse-prop-input" value="${(f.minLabel || '').replace(/"/g, '&quot;')}" placeholder="e.g. Not at all"
        style="font-size:12px;padding:6px 8px"
        oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{minLabel:this.value})"/>
    </div>
    <div>
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Max Label</div>
      <input class="mse-prop-input" value="${(f.maxLabel || '').replace(/"/g, '&quot;')}" placeholder="e.g. Absolutely"
        style="font-size:12px;padding:6px 8px"
        oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{maxLabel:this.value})"/>
    </div>
  </div>` : ''}
  ${f.type === 'file' ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
    <div>
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Accepted Types</div>
      <input class="mse-prop-input" value="${(f.accept || '.pdf,.jpg,.png').replace(/"/g, '&quot;')}" placeholder=".pdf,.jpg,.png"
        style="font-size:12px;padding:6px 8px"
        oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{accept:this.value})"/>
    </div>
    <div>
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Max Size (MB)</div>
      <input type="number" class="mse-prop-input" value="${f.maxSizeMB || 5}" style="font-size:12px;padding:6px 8px"
        oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{maxSizeMB:+this.value})"/>
    </div>
  </div>` : ''}
  ${f.type === 'number' ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
    <div>
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Min Value</div>
      <input type="number" class="mse-prop-input" value="${f.min || ''}" placeholder="None"
        style="font-size:12px;padding:6px 8px"
        oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{min:this.value?+this.value:undefined})"/>
    </div>
    <div>
      <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Max Value</div>
      <input type="number" class="mse-prop-input" value="${f.max || ''}" placeholder="None"
        style="font-size:12px;padding:6px 8px"
        oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{max:this.value?+this.value:undefined})"/>
    </div>
  </div>` : ''}
  `;
}

function mscf_specialFieldProps(bid, secId, f) {
  if (f.type === 'divider') return `<div style="font-size:12px;color:var(--text-3);text-align:center;padding:6px 0">Visual divider — no properties</div>`;
  return `
  <div style="margin-bottom:8px">
    <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Heading</div>
    <input class="mse-prop-input" value="${(f.heading || '').replace(/"/g, '&quot;')}"
      placeholder="Optional heading text" style="font-size:12px;padding:6px 8px"
      oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{heading:this.value})"/>
  </div>
  <div>
    <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Body</div>
    <textarea class="mse-prop-textarea" style="min-height:72px;font-size:12px"
      placeholder="Instruction or note text shown to visitors…"
      oninput="MSState.updateFormField('${bid}','${secId}','${f.id}',{body:this.value})">${(f.body || '').replace(/</g, '&lt;')}</textarea>
  </div>`;
}

/* Routing / Logic panel per section */
function mscf_routingPanel(bid, sec, si, total) {
  const r = sec.routing || {};
  const routingType = r.type || 'auto';
  const condFields = (sec.fields || []).filter(f => ['radio', 'dropdown', 'checkbox-group', 'select'].includes(f.type));
  const condField = condFields.find(f => f.id === r.conditionFieldId);

  return `
<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px">
  <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Section Logic</div>

  <!-- Routing type selector -->
  <div style="display:flex;gap:4px;margin-bottom:${routingType === 'conditional' ? '10px' : '0'}">
    ${[
      { v: 'auto', label: 'Auto Next' },
      { v: 'conditional', label: 'Conditional', disabled: condFields.length === 0 },
      { v: 'submit', label: 'Go to Submit' },
    ].map(opt => `
    <button onclick="MSState.updateSectionRouting('${bid}','${sec.id}',{type:'${opt.v}'});updateRightPanel()"
      ${opt.disabled ? 'disabled title="Add a radio/dropdown field first"' : ''}
      style="flex:1;padding:5px 4px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font);
             border:1px solid ${routingType === opt.v ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'};
             background:${routingType === opt.v ? 'rgba(124,58,237,0.18)' : 'transparent'};
             color:${routingType === opt.v ? '#a78bfa' : 'var(--text-3)'};
             ${opt.disabled ? 'opacity:0.4;' : ''}">
      ${opt.label}
    </button>`).join('')}
  </div>

  ${routingType === 'conditional' ? `
  <!-- Condition field picker -->
  <div style="margin-bottom:8px">
    <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Based on answer to</div>
    <select class="mse-prop-select" style="font-size:12px"
      onchange="MSState.updateSectionRouting('${bid}','${sec.id}',{conditionFieldId:this.value,rules:[]});updateRightPanel()">
      <option value="">-- pick a field --</option>
      ${condFields.map(f => `<option value="${f.id}" ${r.conditionFieldId === f.id ? 'selected' : ''}>${f.label || f.id}</option>`).join('')}
    </select>
  </div>

  ${condField ? `
  <!-- Rules: value → goto section -->
  <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">If answer is…</div>
  ${(condField.options || []).map((opt, oi) => {
      const optLabel = typeof opt === 'object' ? opt.label : opt;
      const rule = (r.rules || []).find(rule => rule.value === optLabel) || {};
      const allSections = MSState.getBlock(bid)?.props?.sections || [];
      return `
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
    <div style="flex:1;font-size:12px;color:var(--text-2);padding:5px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${optLabel}</div>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;flex-shrink:0;color:var(--text-3)"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    <select class="mse-prop-select" style="font-size:11.5px;flex:1"
      onchange="mscf_setRule('${bid}','${sec.id}','${optLabel}',this.value)">
      <option value="next" ${(rule.goTo || 'next') === 'next' ? 'selected' : ''}>Next Section</option>
      <option value="submit" ${rule.goTo === 'submit' ? 'selected' : ''}>Submit Form</option>
      ${allSections.filter((s, i) => s.id !== sec.id).map(s => `<option value="${s.id}" ${rule.goTo === s.id ? 'selected' : ''}>${s.title || 'Section ' + (allSections.indexOf(s) + 1)}</option>`).join('')}
    </select>
  </div>`;
    }).join('')}

  <!-- Default -->
  <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">
    <div style="flex:1;font-size:12px;color:var(--text-3)">Default (no match)</div>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;flex-shrink:0;color:var(--text-3)"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    <select class="mse-prop-select" style="font-size:11.5px;flex:1"
      onchange="MSState.updateSectionRouting('${bid}','${sec.id}',{defaultGoTo:this.value})">
      <option value="next" ${(r.defaultGoTo || 'next') === 'next' ? 'selected' : ''}>Next Section</option>
      <option value="submit" ${r.defaultGoTo === 'submit' ? 'selected' : ''}>Submit Form</option>
      ${(MSState.getBlock(bid)?.props?.sections || []).filter(s => s.id !== sec.id).map(s => `<option value="${s.id}" ${r.defaultGoTo === s.id ? 'selected' : ''}>${s.title || 'Section'}</option>`).join('')}
    </select>
  </div>` : ''}` : ''}

</div>`;
}

/* ── Mutation helpers called from event handlers ── */

function mscf_updateSection(bid, secId, key, value) {
  const block = MSState.getBlock(bid);
  if (!block) return;
  const sec = block.props.sections?.find(s => s.id === secId);
  if (!sec) return;
  sec[key] = value;
  MSState.dirty = true;
  MSState._notify('update');
}

function mscf_moveSection(bid, idx, dir) {
  const block = MSState.getBlock(bid);
  if (!block) return;
  const arr = block.props.sections;
  const n = idx + dir;
  if (n < 0 || n >= arr.length) return;
  [arr[idx], arr[n]] = [arr[n], arr[idx]];
  MSState.updateBlock(bid, { sections: arr });
  updateRightPanel();
}

function mscf_moveField(bid, secId, fi, dir) {
  const block = MSState.getBlock(bid);
  if (!block) return;
  const sec = block.props.sections?.find(s => s.id === secId);
  if (!sec) return;
  const arr = sec.fields;
  const n = fi + dir;
  if (n < 0 || n >= arr.length) return;
  [arr[fi], arr[n]] = [arr[n], arr[fi]];
  MSState.updateBlock(bid, { sections: block.props.sections });
  updateRightPanel();
}

function mscf_setRule(bid, secId, optValue, goTo) {
  const block = MSState.getBlock(bid);
  if (!block) return;
  const sec = block.props.sections?.find(s => s.id === secId);
  if (!sec) return;
  const rules = JSON.parse(JSON.stringify(sec.routing?.rules || []));
  const idx = rules.findIndex(r => r.value === optValue);
  if (idx >= 0) rules[idx].goTo = goTo;
  else rules.push({ value: optValue, goTo });
  MSState.updateSectionRouting(bid, secId, { rules });
}