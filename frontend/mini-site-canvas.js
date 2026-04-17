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
  const arr   = JSON.parse(JSON.stringify(block.props[arrayKey] || []));
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
  const n   = idx + dir;
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
    <div class="mse-color-swatch" style="background:${v||'#0a0f1e'}">
      <input type="color" value="${v||'#0a0f1e'}"
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
  <input class="mse-prop-input" value="${(val||'').replace(/"/g,'&quot;')}"
    placeholder="${placeholder||'Section title'}"
    oninput="msc_set('${bid}','title',this.value)"/>
</div>`;
}

/** Item card shell with move-up / move-down / delete controls. */
function msc_itemCard(bid, arrayKey, idx, total, label, innerHtml) {
  return `
<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:8px;overflow:hidden">
  <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06)">
    <span style="font-size:11.5px;font-weight:700;color:var(--text-3);flex:1;text-transform:uppercase;letter-spacing:0.5px">${label}</span>
    ${idx > 0       ? `<button class="mse-icon-btn" title="Move up"   onclick="msc_moveItem('${bid}','${arrayKey}',${idx},-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
    ${idx < total-1 ? `<button class="mse-icon-btn" title="Move down" onclick="msc_moveItem('${bid}','${arrayKey}',${idx},+1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
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
  <input type="${type||'text'}" class="mse-prop-input" value="${(value||'').replace(/"/g,'&quot;')}"
    placeholder="${placeholder||''}" oninput="${oninput}" style="font-size:12.5px;padding:7px 9px"/>
</div>`;
}

/** Small labelled textarea helper. */
function msc_miniTextarea(label, value, oninput, placeholder) {
  return `
<div style="margin-bottom:8px">
  <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${label}</div>
  <textarea class="mse-prop-textarea" oninput="${oninput}"
    placeholder="${placeholder||''}"
    style="font-size:12.5px;padding:7px 9px;min-height:60px">${(value||'').replace(/</g,'&lt;')}</textarea>
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   FULL renderBlockProps — overrides the one in mini-site-editor.html
═══════════════════════════════════════════════════════════════ */
function renderBlockProps(block) {
  const p   = block.props;
  const bid = block.id;

  switch (block.type) {

    /* ─── COVER ─────────────────────────────────────────────── */
    case 'cover': return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#00d4ff">Cover / Hero</div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Site Name</div>
    <input class="mse-prop-input" value="${(p.siteName||'').replace(/"/g,'&quot;')}" placeholder="Your event name"
      oninput="msc_set('${bid}','siteName',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Tagline</div>
    <input class="mse-prop-input" value="${(p.tagline||'').replace(/"/g,'&quot;')}" placeholder="A short tagline"
      oninput="msc_set('${bid}','tagline',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Cover Image URL</div>
    <input class="mse-prop-input" type="url" value="${p.coverImage||''}" placeholder="https://… or public Drive link"
      oninput="msc_set('${bid}','coverImage',this.value)"/>
    <div class="mse-prop-hint">Paste a public image URL. Google Drive: Share → Anyone with link → copy URL.</div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Cover Overlay</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','coverOverlay',this.value)">
      <option value="dark" ${p.coverOverlay==='dark'?'selected':''}>Dark</option>
      <option value="blur" ${p.coverOverlay==='blur'?'selected':''}>Blur</option>
      <option value="none" ${p.coverOverlay==='none'?'selected':''}>None</option>
    </select>
  </div>
  <div class="mse-toggle-row">
    <span>Show Logo</span>
    <div class="mse-toggle ${p.showLogo!==false?'on':''}"
      onclick="msc_set('${bid}','showLogo',${p.showLogo===false});updateRightPanel()"></div>
  </div>
  ${p.showLogo !== false ? `
  <div class="mse-prop-row">
    <div class="mse-prop-label">Logo Image URL</div>
    <input class="mse-prop-input" type="url" value="${p.logoImage||''}" placeholder="https://… or Drive link"
      oninput="msc_set('${bid}','logoImage',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Logo Shape</div>
    <div class="mse-shape-row">
      ${['circle','rounded','square'].map(s=>`<button class="mse-shape-btn ${p.logoShape===s?'on':''}"
        onclick="msc_set('${bid}','logoShape','${s}');updateRightPanel()">
        <div class="mse-shape-preview ${s}"></div>${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}
    </div>
  </div>` : ''}
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
      placeholder="Describe your event…">${(p.content||'').replace(/</g,'&lt;')}</textarea>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Alignment</div>
    <div class="mse-align-row">
      ${['left','center','right'].map(a=>`<button class="mse-align-btn ${p.alignment===a?'on':''}"
        onclick="msc_set('${bid}','alignment','${a}');updateRightPanel()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
          ${a==='left'?'<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>':a==='center'?'<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/>':'<line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="9" y2="14"/>'}
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
    ${items.map((item, i) => msc_itemCard(bid, 'items', i, items.length, `Item ${i+1}`, `
      ${msc_miniTextarea('Text', item.text, `msc_setItem('${bid}','items',${i},'text',this.value)`, 'Announcement text…')}
      ${msc_miniField('Date / Time', item.date, `msc_setItem('${bid}','items',${i},'date',this.value)`, 'text', 'e.g. 10 March 2026')}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
        <span style="font-size:11.5px;color:var(--text-3)">Pinned</span>
        <div class="mse-toggle ${item.pinned?'on':''}" style="width:32px;height:18px"
          onclick="msc_setItem('${bid}','items',${i},'pinned',${!item.pinned})"></div>
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
    <input class="mse-prop-input" value="${(p.date||'').replace(/"/g,'&quot;')}" placeholder="e.g. 15 March 2026"
      oninput="msc_set('${bid}','date',this.value)"/>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="mse-prop-row">
      <div class="mse-prop-label">Start Time</div>
      <input class="mse-prop-input" value="${p.time||''}" placeholder="10:00 AM"
        oninput="msc_set('${bid}','time',this.value)"/>
    </div>
    <div class="mse-prop-row">
      <div class="mse-prop-label">End Time</div>
      <input class="mse-prop-input" value="${p.endTime||''}" placeholder="5:00 PM"
        oninput="msc_set('${bid}','endTime',this.value)"/>
    </div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Timezone</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','timezone',this.value)">
      ${['IST','UTC','GMT','EST','PST','CST','AEST','CET'].map(tz=>`<option value="${tz}" ${p.timezone===tz?'selected':''}>${tz}</option>`).join('')}
    </select>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Venue Type</div>
    <select class="mse-prop-select" onchange="msc_set('${bid}','venueType',this.value);updateRightPanel()">
      <option value="in-person" ${p.venueType!=='online'&&p.venueType!=='hybrid'?'selected':''}>In-Person</option>
      <option value="online"    ${p.venueType==='online'?'selected':''}>Online</option>
      <option value="hybrid"    ${p.venueType==='hybrid'?'selected':''}>Hybrid</option>
    </select>
  </div>
  ${p.venueType !== 'online' ? `
  <div class="mse-prop-row">
    <div class="mse-prop-label">Venue Name</div>
    <input class="mse-prop-input" value="${(p.venueName||'').replace(/"/g,'&quot;')}" placeholder="e.g. Main Auditorium"
      oninput="msc_set('${bid}','venueName',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Address</div>
    <input class="mse-prop-input" value="${(p.venueAddress||'').replace(/"/g,'&quot;')}" placeholder="City, State"
      oninput="msc_set('${bid}','venueAddress',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Google Maps Link</div>
    <input class="mse-prop-input" type="url" value="${p.mapLink||''}" placeholder="https://maps.google.com/…"
      oninput="msc_set('${bid}','mapLink',this.value)"/>
  </div>` : `
  <div class="mse-prop-row">
    <div class="mse-prop-label">Meeting Link</div>
    <input class="mse-prop-input" type="url" value="${p.onlineLink||''}" placeholder="https://meet.google.com/…"
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
      <option value="grid" ${p.layout!=='list'?'selected':''}>Grid</option>
      <option value="list" ${p.layout==='list'?'selected':''}>List</option>
    </select>
  </div>
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">People (${items.length})</div>
    ${items.map((sp, i) => msc_itemCard(bid, 'items', i, items.length, sp.name || `Person ${i+1}`, `
      ${msc_miniField('Name',  sp.name,  `msc_setItem('${bid}','items',${i},'name',this.value)`,  'text', 'Full name')}
      ${msc_miniField('Role',  sp.role,  `msc_setItem('${bid}','items',${i},'role',this.value)`,  'text', 'e.g. Keynote Speaker')}
      ${msc_miniField('Photo URL', sp.photo, `msc_setItem('${bid}','items',${i},'photo',this.value)`, 'url', 'https://…')}
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
    ${items.map((q, i) => msc_itemCard(bid, 'items', i, items.length, `Q${i+1}`, `
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
        const itemsHtml = tierItems.map((s, si) => msc_itemCard(bid, `__tier_${ti}_items`, si, tierItems.length, s.name||`Sponsor ${si+1}`, `
          ${msc_miniField('Sponsor Name', s.name, `msc_setSponsorItem('${bid}',${ti},${si},'name',this.value)`, 'text', 'Company name')}
          ${msc_miniField('Logo URL', s.logo, `msc_setSponsorItem('${bid}',${ti},${si},'logo',this.value)`, 'url', 'https://…')}
          ${msc_miniField('Website URL', s.url, `msc_setSponsorItem('${bid}',${ti},${si},'url',this.value)`, 'url', 'https://…')}
        `)).join('');
        return `
<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:10px;overflow:hidden">
  <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(245,158,11,0.06);border-bottom:1px solid rgba(255,255,255,0.06)">
    <input class="mse-prop-input" value="${(tier.name||'').replace(/"/g,'&quot;')}"
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
      const fields = p.fields || [];
      const FIELD_TYPES = ['text','email','tel','number','date','textarea','select','checkbox'];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#a78bfa">Registration Form</div>
  ${msc_titleRow(bid, p.title, 'Register Now')}
  <div class="mse-prop-row">
    <div class="mse-prop-label">Subtitle</div>
    <input class="mse-prop-input" value="${(p.subtitle||'').replace(/"/g,'&quot;')}" placeholder="Optional description"
      oninput="msc_set('${bid}','subtitle',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Button Text</div>
    <input class="mse-prop-input" value="${(p.buttonText||'Submit Registration').replace(/"/g,'&quot;')}"
      oninput="msc_set('${bid}','buttonText',this.value)"/>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Button Colour</div>
    <div class="mse-color-row">
      <div class="mse-color-swatch" style="background:${p.buttonColor||MSState.config.accentColor||'#00d4ff'}">
        <input type="color" value="${p.buttonColor||MSState.config.accentColor||'#00d4ff'}"
          oninput="msc_set('${bid}','buttonColor',this.value)"/>
      </div>
      <input type="text" class="mse-prop-input" value="${p.buttonColor||''}" placeholder="Uses accent colour"
        oninput="msc_set('${bid}','buttonColor',this.value)" style="flex:1"/>
    </div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-prop-label">Google Sheet ID</div>
    <input class="mse-prop-input" value="${p.sheetId||''}" placeholder="Sheet ID from Drive URL"
      oninput="msc_set('${bid}','sheetId',this.value)"/>
    <div class="mse-prop-hint">Responses go directly to your Google Sheet. Find the ID in the URL: …/d/<strong style="color:var(--cyan)">SHEET_ID</strong>/edit</div>
  </div>
  <div class="mse-prop-row" style="margin-top:8px">
    <div class="mse-prop-label" style="margin-bottom:8px">Form Fields (${fields.length})</div>
    ${fields.map((f, i) => msc_itemCard(bid, 'fields', i, fields.length, f.label||`Field ${i+1}`, `
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Label</div>
        <input type="text" class="mse-prop-input" value="${(f.label||'').replace(/"/g,'&quot;')}"
          placeholder="Field label" style="font-size:12.5px;padding:7px 9px"
          oninput="MSState.updateBlockField('${bid}','${f.id}',{label:this.value})"/>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Field Type</div>
        <select class="mse-prop-select" style="font-size:12.5px"
          onchange="MSState.updateBlockField('${bid}','${f.id}',{type:this.value})">
          ${FIELD_TYPES.map(t=>`<option value="${t}" ${f.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Placeholder</div>
        <input type="text" class="mse-prop-input" value="${(f.placeholder||'').replace(/"/g,'&quot;')}"
          placeholder="Hint text…" style="font-size:12.5px;padding:7px 9px"
          oninput="MSState.updateBlockField('${bid}','${f.id}',{placeholder:this.value})"/>
      </div>
      ${f.type === 'select' ? `
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Options (comma-separated)</div>
        <input type="text" class="mse-prop-input" value="${(f.options||[]).join(',').replace(/"/g,'&quot;')}"
          placeholder="Option A, Option B" style="font-size:12.5px;padding:7px 9px"
          oninput="MSState.updateBlockField('${bid}','${f.id}',{options:this.value.split(',').map(s=>s.trim())})"/>
      </div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
        <span style="font-size:11.5px;color:var(--text-3)">Required</span>
        <!-- Uses updateBlockField (not msc_setItem) so 'field-update' notify fires
             and onChange rebuilds the right panel → toggle reflects new state instantly -->
        <div class="mse-toggle ${f.required?'on':''}" style="width:32px;height:18px"
          onclick="MSState.updateBlockField('${bid}','${f.id}',{required:${!f.required}})"></div>
      </div>
    `)).join('')}
    ${msc_addBtn('Add Field', `msc_addItem('${bid}','fields',{id:'f${msc_uid()}',type:'text',label:'New Field',required:false,placeholder:''})`)}
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
    ${items.map((doc, i) => msc_itemCard(bid, 'items', i, items.length, doc.label||`Document ${i+1}`, `
      ${msc_miniField('Label', doc.label, `msc_setItem('${bid}','items',${i},'label',this.value)`, 'text', 'e.g. Rule Book, Brochure')}
      ${msc_miniField('Short Description', doc.desc, `msc_setItem('${bid}','items',${i},'desc',this.value)`, 'text', 'Optional — PDF, 2 pages')}
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Link Source</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <button onclick="msc_setItem('${bid}','items',${i},'linkType','drive');updateRightPanel()"
            style="padding:6px 4px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all 0.15s;border:1px solid ${doc.linkType!=='manual'?'rgba(0,212,255,0.35)':'rgba(255,255,255,0.08)'};background:${doc.linkType!=='manual'?'rgba(0,212,255,0.1)':'rgba(255,255,255,0.03)'};color:${doc.linkType!=='manual'?'var(--cyan)':'var(--text-3)'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;display:inline;vertical-align:-1px;margin-right:3px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Drive Link
          </button>
          <button onclick="msc_setItem('${bid}','items',${i},'linkType','manual');updateRightPanel()"
            style="padding:6px 4px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all 0.15s;border:1px solid ${doc.linkType==='manual'?'rgba(0,212,255,0.35)':'rgba(255,255,255,0.08)'};background:${doc.linkType==='manual'?'rgba(0,212,255,0.1)':'rgba(255,255,255,0.03)'};color:${doc.linkType==='manual'?'var(--cyan)':'var(--text-3)'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;display:inline;vertical-align:-1px;margin-right:3px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Paste URL
          </button>
        </div>
      </div>
      <div>
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${doc.linkType==='manual'?'URL':'Google Drive Share Link'}</div>
        <input type="url" class="mse-prop-input" value="${doc.url||''}"
          placeholder="${doc.linkType==='manual'?'https://…':'Paste Drive share link'}"
          oninput="msc_setItem('${bid}','items',${i},'url',this.value)"
          style="font-size:12.5px;padding:7px 9px"/>
        <div style="font-size:10.5px;color:var(--text-3);margin-top:3px;line-height:1.5">
          ${doc.linkType==='manual'?'Any public URL — PDF, Doc, image, etc.':'On Drive: Share → Anyone with link → Copy link. File opens in Drive viewer.'}
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
    <input class="mse-prop-input" value="${(p.title||'').replace(/"/g,'&quot;')}" placeholder="Optional — leave blank to hide"
      oninput="msc_set('${bid}','title',this.value)"/>
  </div>
  <div class="mse-prop-row" style="margin-top:4px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="mse-prop-label">Videos (${items.length} / 2)</div>
      ${atMax ? `<span style="font-size:11px;color:var(--gold);font-weight:600">Max 2 reached</span>` : ''}
    </div>
    ${items.map((v, i) => msc_itemCard(bid, 'items', i, items.length, v.title||`Video ${i+1}`, `
      ${msc_miniField('Title', v.title, `msc_setItem('${bid}','items',${i},'title',this.value)`, 'text', 'Optional video title')}
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Video URL</div>
        <input type="url" class="mse-prop-input" value="${v.url||''}"
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
          `<input type="url" class="mse-prop-input" value="${v.thumbnail||''}"
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
        'instagram','twitter','x','linkedin','youtube',
        'github','facebook','whatsapp','telegram','discord','website',
      ];
      return `
<div class="mse-props-section">
  <div class="mse-props-sec-label" style="color:#a78bfa">Social Links</div>
  ${msc_titleRow(bid, p.title, 'Follow Us')}
  <div class="mse-prop-row" style="margin-top:4px">
    <div class="mse-prop-label" style="margin-bottom:8px">Links (${links.length})</div>
    ${links.map((lk, i) => msc_itemCard(bid, 'links', i, links.length, lk.platform||`Link ${i+1}`, `
      <div style="margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Platform</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${PLATFORMS.map(pl => {
            const ic = (typeof MSB_SOCIAL_ICONS !== 'undefined' && MSB_SOCIAL_ICONS[pl]) || {};
            const isActive = lk.platform === pl;
            return `<button onclick="msc_setItem('${bid}','links',${i},'platform','${pl}');updateRightPanel()"
              title="${pl}"
              style="width:30px;height:30px;border-radius:7px;border:1px solid ${isActive?'rgba(0,212,255,0.4)':'rgba(255,255,255,0.07)'};background:${isActive?'rgba(0,212,255,0.12)':'rgba(255,255,255,0.03)'};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s">
              <svg viewBox="0 0 24 24" fill="none" stroke="${isActive?'var(--cyan)':'var(--text-3)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">${ic.path||'<circle cx="12" cy="12" r="10"/>'}</svg>
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
      <option value="line" ${p.style!=='dots'?'selected':''}>Line</option>
      <option value="dots" ${p.style==='dots'?'selected':''}>Dots</option>
    </select>
  </div>
  <div class="mse-prop-row">
    <div class="mse-range-row">
      <div class="mse-range-header">
        <span class="mse-prop-label">Opacity</span>
        <span class="mse-range-val" id="divOpV_${bid}">${p.opacity||30}%</span>
      </div>
      <input type="range" class="mse-prop-range" min="5" max="100" step="5" value="${p.opacity||30}"
        oninput="document.getElementById('divOpV_${bid}').textContent=this.value+'%';msc_set('${bid}','opacity',+this.value)"/>
    </div>
  </div>
  <div class="mse-prop-row">
    <div class="mse-range-row">
      <div class="mse-range-header">
        <span class="mse-prop-label">Thickness</span>
        <span class="mse-range-val" id="divThV_${bid}">${p.thickness||1}px</span>
      </div>
      <input type="range" class="mse-prop-range" min="1" max="8" step="1" value="${p.thickness||1}"
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
        <span class="mse-range-val" id="spHV_${bid}">${p.height||48}px</span>
      </div>
      <input type="range" class="mse-prop-range" min="8" max="200" step="4" value="${p.height||48}"
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