/* ================================================================
   GalSol — Mini Site Builder  |  mini-site-special.js
   Batch 4 Part A — Drive URL utilities · Font system ·
   Document & Video block deep enhancements
================================================================ */

/* ═══════════════════════════════════════════════════════════════
   DRIVE URL UTILITIES
═══════════════════════════════════════════════════════════════ */

/** Extract file ID from any Google Drive URL format. */
function msd_getDriveFileId(url) {
  if (!url) return null;
  // /file/d/FILE_ID/...
  let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // id=FILE_ID
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // open?id=FILE_ID
  m = url.match(/open\?id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

/**
 * Transform a Google Drive share URL into an embeddable / viewer URL.
 * mode: 'preview'  → Drive file preview  (PDF, Docs, Slides, etc.)
 *       'download' → Direct download link
 *       'image'    → Direct image URL (for photos, logos)
 */
function msd_transformDriveUrl(url, mode) {
  if (!url) return url;
  // Already transformed or not a Drive URL
  if (!url.includes('drive.google.com') && !url.includes('docs.google.com')) return url;
  const fileId = msd_getDriveFileId(url);
  if (!fileId) return url;
  switch (mode) {
    case 'image': return `https://drive.google.com/uc?id=${fileId}`;
    case 'download': return `https://drive.google.com/uc?export=download&id=${fileId}`;
    case 'preview':
    default: return `https://drive.google.com/file/d/${fileId}/preview`;
  }
}

/** Detect whether a URL is a Google Drive link. */
function msd_isDriveUrl(url) {
  return !!(url && (url.includes('drive.google.com') || url.includes('docs.google.com')));
}

/** Get a viewer-ready link for the document block renderer. */
function msd_getDocViewUrl(doc) {
  if (!doc.url) return '#';
  if (doc.linkType === 'manual') return doc.url;
  // Drive link — transform to preview
  return msd_isDriveUrl(doc.url)
    ? msd_transformDriveUrl(doc.url, 'preview')
    : doc.url;
}

/* ═══════════════════════════════════════════════════════════════
   FILE TYPE DETECTION
═══════════════════════════════════════════════════════════════ */
const MSD_FILE_TYPES = {
  pdf: { label: 'PDF', color: '#f43f5e', bgAlpha: '0.10', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>' },
  doc: { label: 'Word', color: '#3b82f6', bgAlpha: '0.10', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  docx: { label: 'Word', color: '#3b82f6', bgAlpha: '0.10', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  xls: { label: 'Excel', color: '#10b981', bgAlpha: '0.10', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  xlsx: { label: 'Excel', color: '#10b981', bgAlpha: '0.10', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  ppt: { label: 'PPT', color: '#f59e0b', bgAlpha: '0.10', icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>' },
  pptx: { label: 'PPT', color: '#f59e0b', bgAlpha: '0.10', icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>' },
  zip: { label: 'ZIP', color: '#8b5cf6', bgAlpha: '0.10', icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' },
  img: { label: 'Image', color: '#06b6d4', bgAlpha: '0.10', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>' },
  link: { label: 'Link', color: '#64748b', bgAlpha: '0.08', icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' },
};
const MSD_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];

function msd_getFileInfo(url) {
  if (!url) return MSD_FILE_TYPES.link;
  if (msd_isDriveUrl(url)) return { ...MSD_FILE_TYPES.link, label: 'Drive', color: '#4285f4' };
  const ext = (url.split('.').pop() || '').toLowerCase().split('?')[0];
  if (MSD_IMAGE_EXTS.includes(ext)) return MSD_FILE_TYPES.img;
  return MSD_FILE_TYPES[ext] || MSD_FILE_TYPES.link;
}

/* ═══════════════════════════════════════════════════════════════
   FONT LOADING SYSTEM
═══════════════════════════════════════════════════════════════ */
const MSD_FONT_URLS = {
  'Plus Jakarta Sans': 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap',
  'Syne': 'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&display=swap',
  'Montserrat': 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap',
  'Raleway': 'https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700&display=swap',
  'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap',
  'Cormorant Garamond': 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&display=swap',
  'Dancing Script': 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;600;700&display=swap',
  'Cinzel': 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap',
  'EB Garamond': 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&display=swap',
  'JetBrains Mono': 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
};

/** Load a Google Font dynamically if not already loaded. */
function msd_loadFont(name) {
  const url = MSD_FONT_URLS[name];
  if (!url) return;
  const id = 'msd_font_' + name.replace(/\s+/g, '_');
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

/** Pre-load all 10 fonts at once (called on editor init). */
function msd_preloadAllFonts() {
  Object.keys(MSD_FONT_URLS).forEach(msd_loadFont);
}

/* ═══════════════════════════════════════════════════════════════
   FONT PREVIEW STRIP
   Rendered in the site settings tab just below the font select.
═══════════════════════════════════════════════════════════════ */
const MSD_FONT_SAMPLES = {
  'Plus Jakarta Sans': { sample: 'Modern clarity', weight: '600', style: 'normal', tag: 'Sans Serif' },
  'Syne': { sample: 'Bold identity', weight: '800', style: 'normal', tag: 'Display' },
  'Montserrat': { sample: 'Geometric precision', weight: '600', style: 'normal', tag: 'Sans Serif' },
  'Raleway': { sample: 'Elegant simplicity', weight: '500', style: 'normal', tag: 'Sans Serif' },
  'Playfair Display': { sample: 'Refined editorial', weight: '700', style: 'normal', tag: 'Serif' },
  'Cormorant Garamond': { sample: 'Classical eloquence', weight: '600', style: 'normal', tag: 'Serif' },
  'Dancing Script': { sample: 'Flowing warmth', weight: '700', style: 'normal', tag: 'Script' },
  'Cinzel': { sample: 'Timeless prestige', weight: '600', style: 'normal', tag: 'Display' },
  'EB Garamond': { sample: 'Scholarly character', weight: '700', style: 'normal', tag: 'Serif' },
  'JetBrains Mono': { sample: 'Technical precision', weight: '500', style: 'normal', tag: 'Monospace' },
};

/**
 * Render a visual font picker grid.
 * Returns HTML string — inject wherever needed.
 */
function msd_renderFontPickerGrid(activeFontName) {
  const fonts = Object.keys(MSD_FONT_URLS);
  return `
<div style="display:flex;flex-direction:column;gap:4px">
  ${fonts.map(name => {
    const info = MSD_FONT_SAMPLES[name] || { sample: 'Sample text', weight: '600', tag: '' };
    const isActive = name === activeFontName;
    return `
<button onclick="msd_selectFont('${name}')"
  style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:9px;border:1px solid ${isActive ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.07)'};background:${isActive ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)'};cursor:pointer;text-align:left;transition:all 0.15s;width:100%">
  <div style="min-width:0;flex:1">
    <div style="font-family:'${name}',sans-serif;font-size:15px;font-weight:${info.weight};font-style:${info.style || 'normal'};color:${isActive ? 'var(--text)' : 'rgba(255,255,255,0.7)'};line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${info.sample}</div>
    <div style="font-size:10.5px;color:var(--text-3);margin-top:2px">${name}</div>
  </div>
  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
    <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-3)">${info.tag}</span>
    ${isActive ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="2.5" style="width:14px;height:14px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
  </div>
</button>`;
  }).join('')}
</div>`;
}

/** Called when user clicks a font in the picker grid. */
function msd_selectFont(name) {
  msd_loadFont(name);
  MSState.updateConfig({ fontFamily: name, fontHeading: name });
  const sel = document.getElementById('siteFontFamily');
  if (sel) sel.value = name;
  refreshCanvas();
  // Re-render font grid to show new active state
  const container = document.getElementById('msd_fontPickerGrid');
  if (container) container.innerHTML = msd_renderFontPickerGrid(name);
}

/**
 * Inject the font picker grid into the site settings tab.
 * Called by mst_rebuildSiteSettings (in mini-site-theme.js).
 */
function msd_injectFontPicker(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = msd_renderFontPickerGrid(MSState.config.fontFamily || 'Plus Jakarta Sans');
}

/* ═══════════════════════════════════════════════════════════════
   DOCUMENT BLOCK — DRIVE LINK AUTO-TRANSFORMER
   Called from the canvas.js document props oninput handler.
   Auto-detects Drive URLs and stores both the original and
   transformed preview URL.
═══════════════════════════════════════════════════════════════ */

/** When a Drive share URL is pasted, auto-transform + validate it. */
function msd_onDocUrlPaste(blockId, itemIdx, rawUrl) {
  const block = MSState.getBlock(blockId);
  if (!block) return;
  const items = JSON.parse(JSON.stringify(block.props.items || []));
  if (!items[itemIdx]) return;

  items[itemIdx].url = rawUrl;
  items[itemIdx].isValid = false;

  if (rawUrl.trim()) {
    if (msd_isDriveUrl(rawUrl)) {
      const fileId = msd_getDriveFileId(rawUrl);
      if (fileId) {
        items[itemIdx].previewUrl = msd_transformDriveUrl(rawUrl, 'preview');
        items[itemIdx].isValid = true;
        items[itemIdx].linkType = 'drive';
      }
    } else if (rawUrl.startsWith('http')) {
      items[itemIdx].previewUrl = rawUrl;
      items[itemIdx].isValid = true;
    }
  }

  MSState.updateBlock(blockId, { items });
  refreshCanvas();
  updateRightPanel();
}

/* ═══════════════════════════════════════════════════════════════
   VIDEO BLOCK — DRIVE VIDEO EMBED
   Google Drive video share links need special handling:
   share URL → /preview URL (renders an iframe-embeddable player)
═══════════════════════════════════════════════════════════════ */

/** Get an embeddable URL for a video (YouTube or Drive). */
function msd_getVideoEmbedUrl(url) {
  if (!url) return null;
  // YouTube
  if (typeof msb_ytId === 'function') {
    const ytId = msb_ytId(url);
    if (ytId) return `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`;
  }
  // Google Drive video
  if (msd_isDriveUrl(url)) {
    return msd_transformDriveUrl(url, 'preview');
  }
  return url;
}

/** Get auto-thumbnail for a video URL. */
function msd_getAutoThumb(url) {
  if (!url) return null;
  if (typeof msb_ytId === 'function') {
    const ytId = msb_ytId(url);
    if (ytId) return `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   TYPOGRAPHY SECTION — SITE SETTINGS INJECTOR
   Called from mini-site-theme.js when building the settings tab.
═══════════════════════════════════════════════════════════════ */

/** Return the full typography section HTML for site settings. */
function msd_typographySectionHtml() {
  const current = MSState.config.fontFamily || 'Plus Jakarta Sans';
  return `
<div class="mse-props-section" style="padding-top:0;padding-bottom:14px">
  <div class="mse-props-sec-label" style="margin-bottom:10px">Typography</div>
  <div id="msd_fontPickerGrid">${msd_renderFontPickerGrid(current)}</div>
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   INIT — preload all fonts as soon as this script loads
═══════════════════════════════════════════════════════════════ */
(function msd_init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', msd_preloadAllFonts);
  } else {
    msd_preloadAllFonts();
  }
})();

console.log('[GalSol] mini-site-special.js loaded ✓');