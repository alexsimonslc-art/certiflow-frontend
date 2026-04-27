/* ================================================================
   Honourix — Mini Site Builder  |  mini-site-theme.js
   Batch 4 Part B — Color palettes · Font pairings ·
   Visual theme picker · QR code · Overrides site settings tab
================================================================ */

/* ═══════════════════════════════════════════════════════════════
   COLOR PALETTE PRESETS
   Each preset defines: theme (dark/light), accent, bg, name,
   and a 3-color preview strip.
═══════════════════════════════════════════════════════════════ */
const MST_PALETTES = [
  {
    id: 'cyber',
    name: 'Cyber',
    tag: 'Tech / Hackathon',
    theme: 'dark',
    accent: '#00d4ff',
    bg: '#04080f',
    preview: ['#04080f', '#0d1525', '#00d4ff'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tag: 'Conferences',
    theme: 'dark',
    accent: '#7c3aed',
    bg: '#07030f',
    preview: ['#07030f', '#130820', '#7c3aed'],
  },
  {
    id: 'forest',
    name: 'Forest',
    tag: 'Sports / Outdoors',
    theme: 'dark',
    accent: '#10b981',
    bg: '#030d06',
    preview: ['#030d06', '#0a1f10', '#10b981'],
  },
  {
    id: 'gold',
    name: 'Gold Class',
    tag: 'Galas / Symposiums',
    theme: 'dark',
    accent: '#f59e0b',
    bg: '#0a0700',
    preview: ['#0a0700', '#1a1100', '#f59e0b'],
  },
  {
    id: 'festival',
    name: 'Festival',
    tag: 'Cultural / Music',
    theme: 'dark',
    accent: '#f472b6',
    bg: '#0d0015',
    preview: ['#0d0015', '#1a0028', '#f472b6'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    tag: 'Webinars / Online',
    theme: 'dark',
    accent: '#60a5fa',
    bg: '#020e1a',
    preview: ['#020e1a', '#041c34', '#60a5fa'],
  },
  {
    id: 'paper',
    name: 'Paper',
    tag: 'Academic / Workshops',
    theme: 'light',
    accent: '#6366f1',
    bg: '#f9f7f4',
    preview: ['#f9f7f4', '#e8e5e0', '#6366f1'],
  },
  {
    id: 'clean',
    name: 'Clean White',
    tag: 'Corporate / Minimal',
    theme: 'light',
    accent: '#0f172a',
    bg: '#ffffff',
    preview: ['#ffffff', '#f1f5f9', '#0f172a'],
  },
];

/* ═══════════════════════════════════════════════════════════════
   FONT PAIR PRESETS
   Each pair defines a display font (headings) + body font.
═══════════════════════════════════════════════════════════════ */
const MST_FONT_PAIRS = [
  {
    id: 'tech',
    name: 'Tech',
    display: 'Syne',
    body: 'Plus Jakarta Sans',
    sampleDisplay: 'Bold Clarity',
    sampleBody: 'Clean and modern',
    tag: 'Hackathons · Tech events',
  },
  {
    id: 'elegant',
    name: 'Elegant',
    display: 'Cinzel',
    body: 'Cormorant Garamond',
    sampleDisplay: 'Timeless',
    sampleBody: 'Refined and classical',
    tag: 'Galas · Symposiums',
  },
  {
    id: 'festive',
    name: 'Festive',
    display: 'Dancing Script',
    body: 'Raleway',
    sampleDisplay: 'Joyful vibes',
    sampleBody: 'Warm and friendly',
    tag: 'Cultural · Music fests',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    display: 'Playfair Display',
    body: 'EB Garamond',
    sampleDisplay: 'Editorial voice',
    sampleBody: 'Scholarly and thoughtful',
    tag: 'Conferences · Academic',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    display: 'Montserrat',
    body: 'Montserrat',
    sampleDisplay: 'Pure Precision',
    sampleBody: 'Geometric and neutral',
    tag: 'Corporate · Workshops',
  },
];

/* ═══════════════════════════════════════════════════════════════
   APPLY PALETTE / FONT PAIR
═══════════════════════════════════════════════════════════════ */

function mst_applyPalette(id) {
  const pal = MST_PALETTES.find(p => p.id === id);
  if (!pal) return;
  MSState.updateConfig({
    theme: pal.theme,
    accentColor: pal.accent,
    activePalette: id,
  });
  refreshCanvas();
  mst_rebuildSiteSettings();
  mseToast(`Theme: ${pal.name}`, 'success', 1800);
}

function mst_applyFontPair(id) {
  const pair = MST_FONT_PAIRS.find(p => p.id === id);
  if (!pair) return;
  if (typeof msd_loadFont === 'function') {
    msd_loadFont(pair.display);
    msd_loadFont(pair.body);
  }
  MSState.updateConfig({
    fontFamily: pair.body,
    fontHeading: pair.display,
    activeFontPair: id,
  });
  refreshCanvas();
  mst_rebuildSiteSettings();
  mseToast(`Font: ${pair.name}`, 'success', 1800);
}

/* ═══════════════════════════════════════════════════════════════
   PALETTE GRID RENDERER
═══════════════════════════════════════════════════════════════ */
function mst_renderPaletteGrid() {
  const active = MSState.config.activePalette;
  return `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
  ${MST_PALETTES.map(pal => {
    const isActive = pal.id === active ||
      (!active && pal.accent === MSState.config.accentColor && pal.theme === MSState.config.theme);
    return `
<button onclick="mst_applyPalette('${pal.id}')"
  style="padding:10px;border-radius:10px;border:1.5px solid ${isActive ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.07)'};background:${isActive ? 'rgba(0,212,255,0.07)' : 'rgba(255,255,255,0.03)'};cursor:pointer;text-align:left;transition:all 0.18s">
  <div style="display:flex;gap:3px;margin-bottom:7px">
    ${pal.preview.map((c, i) => `<div style="flex:${i === 0 ? 2 : i === 1 ? 1.5 : 1};height:22px;border-radius:${i === 0 ? '5px 0 0 5px' : i === 2 ? '0 5px 5px 0' : '0'};background:${c}"></div>`).join('')}
  </div>
  <div style="font-size:12.5px;font-weight:700;color:${isActive ? 'var(--cyan)' : 'var(--text)'};margin-bottom:2px">${pal.name}</div>
  <div style="font-size:10.5px;color:var(--text-3)">${pal.tag}</div>
  ${isActive ? `<div style="font-size:10px;font-weight:700;color:var(--cyan);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">✓ Active</div>` : ''}
</button>`;
  }).join('')}
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   FONT PAIR RENDERER
═══════════════════════════════════════════════════════════════ */
function mst_renderFontPairGrid() {
  const active = MSState.config.activeFontPair;
  return `
<div style="display:flex;flex-direction:column;gap:6px">
  ${MST_FONT_PAIRS.map(pair => {
    const isActive = pair.id === active ||
      (!active && pair.body === MSState.config.fontFamily);
    return `
<button onclick="mst_applyFontPair('${pair.id}')"
  style="padding:12px 14px;border-radius:10px;border:1.5px solid ${isActive ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.07)'};background:${isActive ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.02)'};cursor:pointer;text-align:left;transition:all 0.18s;width:100%">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
    <div style="flex:1;min-width:0">
      <div style="font-family:'${pair.display}',serif,sans-serif;font-size:16px;font-weight:700;color:${isActive ? 'var(--text)' : 'rgba(255,255,255,0.7)'};line-height:1.2;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pair.sampleDisplay}</div>
      <div style="font-family:'${pair.body}',sans-serif;font-size:12px;color:${isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)'};margin-bottom:5px">${pair.sampleBody}</div>
      <div style="font-size:10px;color:var(--text-3)">${pair.tag}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
      <span style="font-size:11px;font-weight:700;color:${isActive ? 'var(--cyan)' : 'var(--text-3)'};">${pair.name}</span>
      ${isActive ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="2.5" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
    </div>
  </div>
</button>`;
  }).join('')}
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   QR CODE GENERATOR
   Uses the free qrserver.com API — no key needed.
═══════════════════════════════════════════════════════════════ */
function mst_getQRUrl(siteUrl) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(siteUrl)}&color=00d4ff&bgcolor=04080f`;
}

function mst_renderQRSection(slug) {
  if (!slug || slug.length < 3) {
    return `
<div style="padding:14px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:9px;font-size:12.5px;color:rgba(255,255,255,0.5);text-align:center">
  Set a URL slug in Site Settings to generate a QR code.
</div>`;
  }
  const siteUrl = `${window.location.origin}/site.html?slug=${slug}`;
  const qrUrl = mst_getQRUrl(siteUrl);
  return `
<div style="display:flex;align-items:center;gap:18px">
  <div style="flex-shrink:0;padding:8px;background:#04080f;border-radius:10px;border:1px solid rgba(0,212,255,0.2)">
    <img src="${qrUrl}" width="90" height="90" alt="QR Code" loading="lazy"
      style="display:block;image-rendering:pixelated;border-radius:4px"
      onerror="this.style.display='none'"/>
  </div>
  <div>
    <div style="font-size:12.5px;font-weight:600;color:var(--text);margin-bottom:4px">Scan to visit</div>
    <div style="font-size:11.5px;color:var(--text-3);margin-bottom:10px;font-family:var(--font-mono);word-break:break-all">${siteUrl}</div>
    <a href="${qrUrl}" download="qr-${slug}.png" target="_blank"
      style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.2);color:var(--cyan);font-size:12px;font-weight:600;text-decoration:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download PNG
    </a>
  </div>
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   COVER OVERLAY VISUAL PICKER
   Shown in the Cover block props panel (enhanced).
═══════════════════════════════════════════════════════════════ */
const MST_OVERLAYS = [
  { id: 'dark', label: 'Dark', bg: 'rgba(0,0,0,0.6)', preview: '#000' },
  { id: 'blur', label: 'Blur', bg: 'rgba(0,0,0,0.35)', preview: '#222' },
  { id: 'accent', label: 'Accent', bg: null, preview: null },
  { id: 'none', label: 'None', bg: 'transparent', preview: 'transparent' },
];

function mst_renderOverlayPicker(blockId, currentOverlay) {
  return `
<div style="display:flex;gap:6px">
  ${MST_OVERLAYS.map(ov => {
    const isActive = (currentOverlay || 'dark') === ov.id;
    const previewBg = ov.preview === null
      ? (MSState.config.accentColor || '#00d4ff')
      : ov.preview;
    return `
<button onclick="msc_set('${blockId}','coverOverlay','${ov.id}');updateRightPanel()"
  style="flex:1;padding:8px 4px;border-radius:8px;border:1.5px solid ${isActive ? 'rgba(0,212,255,0.45)' : 'rgba(255,255,255,0.07)'};background:${isActive ? 'rgba(0,212,255,0.09)' : 'rgba(255,255,255,0.03)'};cursor:pointer;text-align:center;transition:all 0.15s">
  <div style="width:100%;height:18px;border-radius:4px;background:${previewBg};margin:0 auto 5px;opacity:${ov.id === 'none' ? 0.15 : 0.7};border:1px solid rgba(255,255,255,0.1)"></div>
  <div style="font-size:10.5px;font-weight:600;color:${isActive ? 'var(--cyan)' : 'var(--text-3)'}">${ov.label}</div>
</button>`;
  }).join('')}
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   REBUILD SITE SETTINGS TAB
   Completely replaces the content of #rightSiteBody with a
   rich visual layout: palette grid + font pairs + toggles.
═══════════════════════════════════════════════════════════════ */
function mst_rebuildSiteSettings() {
  const el = document.getElementById('rightSiteBody');
  if (!el) return;
  const c = MSState.config;

  el.innerHTML = `

  <!-- COLOUR THEMES -->
  <div class="mse-props-section">
    <div class="mse-props-sec-label" style="margin-bottom:10px">Colour Theme</div>
    ${mst_renderPaletteGrid()}
    <div style="margin-top:10px">
      <div class="mse-prop-label" style="margin-bottom:7px">Custom Accent Colour</div>
      <div class="mse-color-row">
        <div class="mse-color-swatch" id="mstAccentSwatch" style="background:${c.accentColor || '#00d4ff'}">
          <input type="color" id="mstAccentInput" value="${c.accentColor || '#00d4ff'}"
            oninput="mst_onAccentChange(this.value)"/>
        </div>
        <input type="text" class="mse-prop-input" id="mstAccentHex" value="${c.accentColor || '#00d4ff'}"
          placeholder="#00d4ff" maxlength="7"
          oninput="if(/^#[0-9a-f]{6}$/i.test(this.value))mst_onAccentChange(this.value)" style="flex:1"/>
      </div>
    </div>
  </div>

  <!-- TYPOGRAPHY -->
  <div class="mse-props-section" style="padding-top:14px">
    <div class="mse-props-sec-label" style="margin-bottom:10px">Typography</div>
    ${(typeof msd_typographySectionHtml === 'function')
      ? `<div id="msd_fontPickerGrid">${(typeof msd_renderFontPickerGrid === 'function') ? msd_renderFontPickerGrid(c.fontFamily || 'Plus Jakarta Sans') : ''}</div>`
      : ''}
  </div>

  <!-- FONT PAIRINGS -->
  <div class="mse-props-section" style="padding-top:14px">
    <div class="mse-props-sec-label" style="margin-bottom:10px">Font Pairings</div>
    <div style="font-size:11.5px;color:var(--text-3);margin-bottom:8px;line-height:1.5">Quick presets — applies a curated heading + body combination</div>
    ${mst_renderFontPairGrid()}
  </div>

  <!-- REGISTRATION -->
  <div class="mse-props-section" style="padding-top:14px">
    <div class="mse-props-sec-label">Registration</div>
    <div class="mse-toggle-row" style="margin-top:8px">
      <div>
        <div style="font-size:13.5px;font-weight:600;color:var(--text)">Registrations Open</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">Controls your form block's submit state</div>
      </div>
      <div class="mse-toggle ${c.registrationOpen !== false ? 'on' : ''}" id="mstRegToggle"
        onclick="mst_toggleReg()"></div>
    </div>
  </div>

  <!-- SITE INFO -->
  <div class="mse-props-section" style="padding-top:14px;padding-bottom:16px">
    <div class="mse-props-sec-label">Site Info</div>
    <div class="mse-prop-row" style="margin-top:8px">
      <div class="mse-prop-label">Site URL Slug</div>
      <input type="text" class="mse-prop-input" id="mstSlugInput" value="${c.slug || ''}"
        placeholder="my-event-2026"
        oninput="mst_onSlugInput(this.value)"/>
      <div style="font-size:11.5px;color:var(--cyan);margin-top:4px;font-family:var(--font-mono);word-break:break-all" id="mstSlugHint">${c.slug ? `${window.location.origin}/site.html?slug=${c.slug}` : `${window.location.origin}/site.html?slug=…`}</div>
    </div>
  </div>

  `;
  setTimeout(mst_wireCardHovers, 0);
}

/* ═══════════════════════════════════════════════════════════════
   SITE SETTINGS HELPERS
   Thin wrappers that update MSState + re-render as needed.
═══════════════════════════════════════════════════════════════ */
function mst_onAccentChange(val) {
  document.getElementById('mstAccentInput') && (document.getElementById('mstAccentInput').value = val);
  document.getElementById('mstAccentHex') && (document.getElementById('mstAccentHex').value = val);
  const sw = document.getElementById('mstAccentSwatch');
  if (sw) sw.style.background = val;
  MSState.updateConfig({ accentColor: val, activePalette: null });
  refreshCanvas();
}

function mst_setLogoShape(shape) {
  MSState.updateConfig({ logoShape: shape });
  ['circle', 'rounded', 'square'].forEach(s => {
    const el = document.getElementById(`mstShape_${s}`);
    if (el) el.classList.toggle('on', s === shape);
  });
  refreshCanvas();
}

function mst_toggleReg() {
  const next = MSState.config.registrationOpen === false;
  MSState.updateConfig({ registrationOpen: next });
  const el = document.getElementById('mstRegToggle');
  if (el) el.classList.toggle('on', next);
  // Sync original toggle IDs too
  ['regToggle', 'publishRegToggle'].forEach(id => {
    const t = document.getElementById(id);
    if (t) t.classList.toggle('on', next);
  });
  refreshCanvas();
}

function mst_onSlugInput(val) {
  const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const input = document.getElementById('mstSlugInput');
  if (input) input.value = clean;
  const preview = document.getElementById('mstSlugPreview');
  if (preview) preview.textContent = clean || '—';
  // Sync to original slug elements
  const orig = document.getElementById('siteSlugInput');
  if (orig) orig.value = clean;
  const origPrev = document.getElementById('slugPreview');
  if (origPrev) origPrev.textContent = clean || '—';
  const chrome = document.getElementById('chromeUrl');
  const _url = clean ? `${window.location.origin}/site.html?slug=${clean}` : `${window.location.origin}/site.html?slug=…`;
  if (chrome) chrome.textContent = _url;
  const pub = document.getElementById('publishUrlDisplay');
  if (pub) pub.textContent = _url;
  const hint = document.getElementById('mstSlugHint');
  if (hint) hint.textContent = _url;
  MSState.updateConfig({ slug: clean });
}

/* ═══════════════════════════════════════════════════════════════
   PATCH: switchRightTab — inject theme UI on first visit
═══════════════════════════════════════════════════════════════ */
const _mst_origSwitchRightTab = (typeof switchRightTab === 'function') ? switchRightTab : null;

function switchRightTab(tab) {
  document.getElementById('rtabBlock').classList.toggle('active', tab === 'block');
  document.getElementById('rtabSite').classList.toggle('active', tab === 'site');
  document.getElementById('rightBlockBody').style.display = tab === 'block' ? 'block' : 'none';
  document.getElementById('rightSiteBody').style.display = tab === 'site' ? 'block' : 'none';
  if (tab === 'site') {
    mst_rebuildSiteSettings();
  }
}

/* ═══════════════════════════════════════════════════════════════
   PATCH: openPublish — inject QR code section
═══════════════════════════════════════════════════════════════ */
const _mst_origOpenPublish = (typeof openPublish === 'function') ? openPublish : null;

function openPublish() {
  const slug = MSState.config.slug || '';
  const isLive = MSState.config.status === 'published';
  const publicUrl = slug
    ? `${window.location.origin}/site.html?slug=${slug}`
    : `${window.location.origin}/site.html?slug=…`;

  const pubUrl = document.getElementById('publishUrlDisplay');
  if (pubUrl) pubUrl.textContent = publicUrl;
  const pubReg = document.getElementById('publishRegToggle');
  if (pubReg) pubReg.classList.toggle('on', MSState.config.registrationOpen !== false);

  // Always rebuild the confirm button so it's never stuck in disabled/Published state
  const btn = document.getElementById('publishConfirmBtn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M5 3l14 9-14 9V3z"/></svg><span id="publishConfirmLabel">${isLive ? 'Update Site' : 'Publish Now'}</span>`;
  }
  document.getElementById('publishPanelTitle').textContent = isLive ? 'Update Site' : 'Publish Site';

  // Inject QR code section if not already present
  const body = document.querySelector('.mse-publish-body');
  if (body && !document.getElementById('mstQRSection')) {
    const qrWrap = document.createElement('div');
    qrWrap.id = 'mstQRSection';
    qrWrap.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.07)';
    qrWrap.innerHTML = `
<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-3);margin-bottom:10px">Share QR Code</div>
${mst_renderQRSection(slug)}`;
    body.appendChild(qrWrap);
  } else if (document.getElementById('mstQRSection')) {
    // Refresh QR with current slug
    document.getElementById('mstQRSection').innerHTML = `
<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-3);margin-bottom:10px">Share QR Code</div>
${mst_renderQRSection(slug)}`;
  }

  document.getElementById('publishOverlay').classList.add('open');
}

/* ═══════════════════════════════════════════════════════════════
   PATCH: populateSiteSettings — keep original controls in sync
   but redirect to mst_rebuildSiteSettings for the visual tab
═══════════════════════════════════════════════════════════════ */
const _mst_origPopulate = (typeof populateSiteSettings === 'function') ? populateSiteSettings : null;

function populateSiteSettings() {
  const c = MSState.config;
  // Keep the topbar site name in sync
  const nameInput = document.getElementById('siteNameInput');
  if (nameInput && document.activeElement !== nameInput) nameInput.value = c.name || '';
  // Keep save status + publish button label
  const ssT = document.getElementById('saveStatusText');
  const pubLbl = document.getElementById('publishBtnLabel');
  if (c.status === 'published') {
    document.getElementById('saveStatus')?.classList.add('live');
    if (ssT) ssT.textContent = 'Live';
    if (pubLbl) pubLbl.textContent = 'Update';
  }
  // If site settings tab is currently visible, rebuild it
  const siteBody = document.getElementById('rightSiteBody');
  if (siteBody && siteBody.style.display !== 'none') {
    mst_rebuildSiteSettings();
  }
}

/* ═══════════════════════════════════════════════════════════════
   INIT — load font pair fonts, rebuild settings if tab open
═══════════════════════════════════════════════════════════════ */
(function mst_init() {
  const run = () => {
    // Pre-load all font pairs
    if (typeof msd_loadFont === 'function') {
      MST_FONT_PAIRS.forEach(p => {
        msd_loadFont(p.display);
        msd_loadFont(p.body);
      });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

function mst_wireCardHovers() {
  document.querySelectorAll('#rightSiteBody button').forEach(function (btn) {
    if (btn._mstHooked) return;
    btn._mstHooked = true;

    // Snapshot the FULL inline style string before any hover
    var savedCss = btn.style.cssText;

    btn.addEventListener('mouseenter', function () {
      // Append hover styles on top
      this.style.cssText = savedCss +
        ';background:linear-gradient(135deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0.07) 60%,rgba(255,255,255,0.03) 100%)!important' +
        ';border-color:rgba(255,255,255,0.50)!important' +
        ';box-shadow:inset 0 1px 0 rgba(255,255,255,0.22),0 6px 20px rgba(0,0,0,0.38)!important' +
        ';transform:translateY(-1px)!important';
    });

    btn.addEventListener('mouseleave', function () {
      // Full restore — wipes every hover property in one shot
      this.style.cssText = savedCss;
    });
  });
}

console.log('[Honourix] mini-site-theme.js loaded ✓');