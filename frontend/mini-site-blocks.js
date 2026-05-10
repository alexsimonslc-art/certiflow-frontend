/* ================================================================
   GalSol — Mini Site Builder  |  mini-site-blocks.js
   Production block renderers — used by editor canvas + site.html
   All output is standalone HTML with inline styles (no CSS deps)
================================================================ */

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */

/** Derive all theme variables from site config in one place */
function msb_theme(cfg) {
  const isDark = cfg.theme !== 'light';
  const accent = cfg.accentColor || '#00d4ff';
  const [ar, ag, ab] = msb_hexRgb(accent);
  // Reduce visual weight for heavy display fonts that render too bold at 700+
  const _lightWeightFonts = { 'Bebas Neue':true, 'Abril Fatface':true, 'Pacifico':true, 'Boogaloo':true, 'Great Vibes':true, 'Pinyon Script':true };
  const _titleFont = cfg.titleFont || cfg.fontHeading || cfg.fontFamily || 'Syne';
  const headingWeight = _lightWeightFonts[_titleFont] ? '400' : '700';
  const headingSize = cfg.titleFontSize ? cfg.titleFontSize + 'px' : 'clamp(20px,3vw,32px)';
  const bodySize = cfg.contentFontSize ? cfg.contentFontSize + 'px' : 'clamp(14px,2.2vw,16px)';
  return {
    isDark,
    accent,
    ar, ag, ab,
    accentRgb: `${ar},${ag},${ab}`,
    font: cfg.contentFont || cfg.fontFamily || 'Plus Jakarta Sans',
    fontDisplay: _titleFont,
    headingWeight,
    headingSize,
    bodySize,
    // Text — cfg.titleColor / cfg.contentColor carry the global palette text colors set by prebuilt themes
    text: cfg.titleColor || (isDark ? '#eef4ff' : '#0f172a'),
    sub: cfg.contentColor || (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.62)'),
    muted: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.38)',
    // Backgrounds — bgOverride is respected for both dark and light modes
    bg: cfg.bgOverride || (isDark ? '#0a0f1e' : '#f1f5f9'),
    bgAlt: isDark
      ? (cfg.bgOverride ? 'rgba(255,255,255,0.04)' : '#0d1525')
      : (cfg.bgOverride ? '#ffffff' : '#ffffff'),
    bgCard: isDark ? 'rgba(255,255,255,0.045)' : '#ffffff',
    bgInput: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
    // Borders
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)',
    border2: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.16)',
    // Shadows
    shadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 2px 14px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.05)',
  };
}

function msb_hexRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#00d4ff');
  return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [0, 212, 255];
}

function msb_attr(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

/** Wrap a block section in a sectioncontainer with optional bg override */
function msb_wrap(content, bg, extraStyle) {
  return `<div style="width:100%;${bg ? `background:${bg};` : ''}${extraStyle || ''}">${content}</div>`;
}

/** Section title with accent left-bar. Pass optional `color` to override theme text colour, `size` to override font size. */
function msb_title(text, t, align, color, size) {
  const a = align || 'center';
  const c = color || t.text;
  const fs = size || t.headingSize;
  const fw = t.headingWeight;
  if (a === 'center') return `<div style="text-align:center;margin-bottom:20px">
    <h2 style="margin:0 0 8px;font-size:${fs};font-weight:${fw};color:${c};font-family:'${t.fontDisplay}','${t.font}',sans-serif;letter-spacing:-0.3px;line-height:1.2">${text}</h2>
    <div style="width:40px;height:3px;background:${t.accent};border-radius:99px;margin:0 auto"></div>
  </div>`;
  if (a === 'right') return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-direction:row-reverse">
    <div style="width:3px;height:28px;background:${t.accent};border-radius:99px;flex-shrink:0"></div>
    <h2 style="margin:0;flex:1;text-align:right;font-size:${fs};font-weight:${fw};color:${c};font-family:'${t.fontDisplay}','${t.font}',sans-serif;letter-spacing:-0.3px;line-height:1.2">${text}</h2>
  </div>`;
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
    <div style="width:3px;height:28px;background:${t.accent};border-radius:99px;flex-shrink:0"></div>
    <h2 style="margin:0;font-size:${fs};font-weight:${fw};color:${c};font-family:'${t.fontDisplay}','${t.font}',sans-serif;letter-spacing:-0.3px;line-height:1.2">${text}</h2>
  </div>`;
}

/** Extract YouTube video ID from any YouTube URL format */
function msb_ytId(url) {
  const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&\n?#]+)/);
  return m ? m[1] : null;
}

/* ═══════════════════════════════════════════════════════════════
   SOCIAL ICON SVG PATHS
═══════════════════════════════════════════════════════════════ */
const MSB_SOCIAL_ICONS = {
  instagram: { path: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>', color: '#e1306c' },
  twitter: { path: '<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>', color: '#1da1f2' },
  x: { path: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L2.25 2.25H9.08l4.264 5.633L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>', color: '#b0b0b0', fill: true },
  linkedin: { path: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>', color: '#0077b5' },
  youtube: { path: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.4 19.54C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>', color: '#ff0000' },
  github: { path: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>', color: '#8b949e' },
  facebook: { path: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>', color: '#1877f2' },
  whatsapp: { path: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="M9.5 9.2c-.5.8-.3 1.9.5 2.8.8.8 1.9 1.4 2.8 1.5.8.1 1.4-.1 1.7-.6.1-.2 0-.5-.2-.7l-.9-.7c-.3-.2-.6-.1-.8.1l-.2.3c-.1.1-.2.2-.4.1a3.5 3.5 0 0 1-1.6-1.6c-.1-.2 0-.3.1-.4l.3-.2c.2-.2.3-.5.1-.8l-.7-.9c-.2-.2-.5-.3-.7-.2-.3.2-.5.5-.6.8 0 .1-.1.2-.1.3z"/>', color: '#25d366' },
  telegram: { path: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', color: '#2ca5e0' },
  discord: { path: '<path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z"/>', color: '#5865f2' },
  website: { path: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', color: '#6366f1' },
};

function msb_socialIcon(platform, color, size = 20) {
  const ic = MSB_SOCIAL_ICONS[platform] || MSB_SOCIAL_ICONS.website;
  const c = color || 'currentColor';
  if (ic.fill) {
    return `<svg viewBox="0 0 24 24" fill="${c}" stroke="none" style="width:${size}px;height:${size}px;display:block">${ic.path}</svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:${size}px;height:${size}px;display:block">${ic.path}</svg>`;
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 1 — COVER / HERO
═══════════════════════════════════════════════════════════════ */
function msb_cover(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const shape = p.logoShape || cfg.logoShape || 'circle';
  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '22px' : shape === 'rectangle' ? '10px' : '4px';
  const logoW = p.logoSize || 88;
  const logoH = shape === 'rectangle' ? Math.round(logoW * 0.5) : logoW;
  const overlayMap = {
    dark: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.65) 100%)',
    blur: 'rgba(10,15,30,0.5)',
    none: 'transparent',
  };
  const overlay = overlayMap[p.coverOverlay] || overlayMap.dark;
  const bgBase = p.coverImage
    ? 'transparent'
    : (t.isDark
        ? `linear-gradient(160deg,#0d1f3c 0%,${t.bg} 100%)`
        : `linear-gradient(160deg,rgba(${t.ar},${t.ag},${t.ab},0.18) 0%,${t.bg} 100%)`);

  return `
<div style="position:relative;min-height:300px;background:${p.bgColor || t.bg};display:flex;flex-direction:column;align-items:${p.alignment === 'left' ? 'flex-start' : p.alignment === 'right' ? 'flex-end' : 'center'};justify-content:flex-end;padding:0 clamp(24px,6vw,64px) 52px;overflow:hidden;font-family:'${t.font}',sans-serif;box-sizing:border-box">
  ${p.coverImage
      ? `<div style="position:absolute;inset:0;background:url('${p.coverImage}') center/cover no-repeat"></div>`
      : `<div style="position:absolute;inset:0;background:${bgBase}"></div>`}
  ${(p.coverImage || t.isDark) ? `<div style="position:absolute;inset:0;background:${overlay}"></div>` : ''}
  ${(p.coverImage || t.isDark) ? `<div style="position:absolute;bottom:0;left:0;right:0;height:100px;background:linear-gradient(to bottom,transparent,rgba(0,0,0,0.45))"></div>` : ''}

  ${p.showLogo !== false ? `
  <div style="position:relative;z-index:3;margin-bottom:18px">
    <div style="width:min(${logoW}px,42vw);height:min(${logoH}px,${shape === 'rectangle' ? '21vw' : '42vw'});border-radius:${radius};background:${p.logoBorder === false ? 'transparent' : (p.logoImage ? 'transparent' : (t.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'))};${p.logoBorder === false ? '' : `border:2.5px solid ${t.isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.14)'};backdrop-filter:blur(6px);box-shadow:${t.shadow};`}display:flex;align-items:center;justify-content:center;overflow:hidden">
      ${p.logoImage
        ? `<img src="${p.logoImage}" style="width:100%;height:100%;object-fit:contain" alt="logo"/>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="${t.isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}" stroke-width="1.2" style="width:34px;height:34px"><circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`}
    </div>
  </div>` : '<div style="height:28px;position:relative;z-index:3"></div>'}

  <div style="position:relative;z-index:3;text-align:${p.alignment || 'center'};max-width:540px;width:100%">
    ${(p.siteName || cfg.name) ? `<h1 style="margin:0 0 10px;font-size:${p.titleFontSize ? p.titleFontSize+'px' : 'clamp(24px,5vw,40px)'};font-weight:${t.headingWeight};color:${p.titleColor || (p.coverImage || t.isDark ? '#ffffff' : t.text)};line-height:1.1;letter-spacing:-0.8px;font-family:'${t.fontDisplay}','${t.font}',sans-serif;${p.coverImage || t.isDark ? 'text-shadow:0 2px 16px rgba(0,0,0,0.4)' : ''}">${p.siteName || cfg.name}</h1>` : ''}
    ${p.tagline ? `<p style="margin:0;font-size:clamp(13px,2.2vw,16px);color:${p.taglineColor || (p.coverImage || t.isDark ? 'rgba(255,255,255,0.68)' : t.sub)};font-weight:400;line-height:1.6;letter-spacing:0.1px">${p.tagline}</p>` : ''}
  </div>

  <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:64px;height:4px;background:${t.accent};border-radius:99px 99px 0 0;z-index:4;box-shadow:0 0 16px rgba(${t.accentRgb},0.6)"></div>
</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 2 — ABOUT
═══════════════════════════════════════════════════════════════ */
function msb_about(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bg;
  const align = p.alignment || 'center';
  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'About This Event', t, p.alignment, p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null)}
  <p style="margin:0;font-size:${p.textFontSize ? p.textFontSize+'px' : t.bodySize};color:${p.textColor || t.sub};line-height:1.8;text-align:${align};white-space:pre-wrap">${p.content || ''}</p>
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 3 — ANNOUNCEMENTS
═══════════════════════════════════════════════════════════════ */
function msb_announcements(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bgAlt;
  const items = p.items || [];
  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'Announcements', t, p.alignment, p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null)}
  <div style="display:flex;flex-direction:column;gap:10px">
    ${items.length ? items.map(item => `
    <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-radius:12px;background:rgba(${t.accentRgb},0.07);border:1px solid rgba(${t.accentRgb},0.18);position:relative;overflow:hidden">
      <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${t.accent};border-radius:0 3px 3px 0"></div>
      <div style="width:8px;height:8px;border-radius:50%;background:${t.accent};flex-shrink:0;margin-top:5px;box-shadow:0 0 8px rgba(${t.accentRgb},0.6)"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14.5px;color:${p.itemTextColor || t.text};line-height:1.55;font-weight:500">${item.text || ''}</div>
        ${item.date ? `<div style="font-size:11.5px;color:${p.itemDateColor || t.muted};margin-top:4px">${item.date}</div>` : ''}
      </div>
      ${item.pinned ? `<div style="font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${t.accent};background:rgba(${t.accentRgb},0.12);border:1px solid rgba(${t.accentRgb},0.25);padding:3px 8px;border-radius:99px;flex-shrink:0">Pinned</div>` : ''}
    </div>`).join('') : `<div style="color:${t.muted};font-size:14px;padding:12px 0">No announcements yet.</div>`}
  </div>
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 4 — DATE & VENUE
═══════════════════════════════════════════════════════════════ */
function msb_datetime(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bg;
  const isOnline = p.venueType === 'online';

  const card = (iconSvg, value, label, link) => `
  <div style="flex:1;min-width:140px;padding:20px 16px;border-radius:14px;background:${t.bgCard};border:1px solid ${t.border};display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;box-sizing:border-box">
    <div style="width:44px;height:44px;border-radius:11px;background:rgba(${t.accentRgb},0.12);border:1px solid rgba(${t.accentRgb},0.2);display:flex;align-items:center;justify-content:center">${iconSvg}</div>
    ${link
      ? `<a href="${link}" target="_blank" style="font-size:clamp(15px,2vw,19px);font-weight:700;color:${t.accent};line-height:1.3;text-decoration:none;word-break:break-word">${value || '—'}</a>`
      : `<div style="font-size:clamp(15px,2vw,19px);font-weight:700;color:${p.valueColor || t.text};line-height:1.3;word-break:break-word">${value || '—'}</div>`}
    <div style="font-size:11.5px;color:${p.labelColor || t.muted};text-transform:uppercase;letter-spacing:0.6px;font-weight:600">${label}</div>
  </div>`;

  const calSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${t.accent}" stroke-width="2" style="width:20px;height:20px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>`;
  const clkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${t.accent}" stroke-width="2" style="width:20px;height:20px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const locSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${t.accent}" stroke-width="2" style="width:20px;height:20px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const linkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${t.accent}" stroke-width="2" style="width:20px;height:20px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

  const timeStr = p.time ? (p.endTime ? `${p.time} – ${p.endTime}` : p.time) + (p.timezone ? ` ${p.timezone}` : '') : '—';
  const venueVal = isOnline ? (p.onlineLink ? 'Join Online' : 'Online Event') : (p.venueName || '—');
  const venueLink = isOnline ? p.onlineLink : p.mapLink;

  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:${p.alignment === 'left' ? 'flex-start' : 'center'}">
    ${card(calSvg, p.date || '—', 'Date')}
    ${card(clkSvg, timeStr, 'Time')}
    ${card(isOnline ? linkSvg : locSvg, venueVal, isOnline ? 'Online' : (p.venueAddress || 'Venue'), venueLink)}
  </div>
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 5 — SPEAKERS / TEAM
═══════════════════════════════════════════════════════════════ */
function msb_speakers(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bgAlt;
  const items = p.items || [];
  const uid = block.id || ('sp' + Math.random().toString(36).slice(2, 7));
  const isList = p.layout === 'list';

  const gridCard = (sp) => `
<div class="spk-card-${uid}" style="flex-shrink:0;width:210px;border-radius:16px;overflow:hidden;background:${t.bgCard};border:1px solid ${t.border2};box-shadow:0 4px 24px rgba(0,0,0,0.18);display:flex;flex-direction:column;scroll-snap-align:start">
  <div style="width:100%;height:240px;overflow:hidden;background:rgba(${t.accentRgb},0.10);flex-shrink:0;position:relative">
    ${sp.photo
      ? `<img src="${sp.photo}" style="width:100%;height:100%;object-fit:cover;display:block" alt="${sp.name || ''}"/>`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:800;color:${t.accent};opacity:0.35">${(sp.name || '?')[0].toUpperCase()}</div>`}
    <div style="position:absolute;bottom:0;left:0;right:0;height:60px;background:linear-gradient(to bottom,transparent,${t.bgCard})"></div>
  </div>
  <div style="padding:14px 16px 18px;text-align:center;flex:1;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:16px;font-weight:700;color:${p.nameColor || t.text};line-height:1.25">${sp.name || 'Speaker'}</div>
    ${sp.role ? `<div style="font-size:12.5px;font-weight:500;color:${p.roleColor || t.accent}">${sp.role}</div>` : ''}
    ${sp.bio ? `<div style="font-size:12px;color:${p.bioColor || t.sub};margin-top:6px;line-height:1.55">${sp.bio}</div>` : ''}
  </div>
</div>`;

  const listCard = (sp) => `
<div style="display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:12px;background:${t.bgCard};border:1px solid ${t.border}">
  <div style="width:52px;height:52px;border-radius:50%;background:${sp.photo ? 'transparent' : 'rgba(' + t.accentRgb + ',0.12)'};border:2px solid rgba(${t.accentRgb},0.2);overflow:hidden;flex-shrink:0">
    ${sp.photo ? `<img src="${sp.photo}" style="width:100%;height:100%;object-fit:cover" alt="${sp.name || ''}"/>` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${t.accent}">${(sp.name || '?')[0]}</div>`}
  </div>
  <div>
    <div style="font-size:15px;font-weight:700;color:${p.nameColor || t.text}">${sp.name || 'Speaker'}</div>
    ${sp.role ? `<div style="font-size:13px;color:${p.roleColor || t.muted};margin-top:2px">${sp.role}</div>` : ''}
    ${sp.bio ? `<div style="font-size:12.5px;color:${p.bioColor || t.sub};margin-top:6px;line-height:1.5">${sp.bio}</div>` : ''}
  </div>
</div>`;

  const dots = items.length > 1 ? `
<div id="spkDots_${uid}" style="display:none;justify-content:center;gap:6px;margin-top:16px">
  ${items.map((_, i) => `<div id="spkDot_${uid}_${i}" style="width:${i === 0 ? '20px' : '6px'};height:6px;border-radius:99px;background:${i === 0 ? t.accent : 'rgba(255,255,255,0.2)'};transition:all 0.3s ease;cursor:pointer" onclick="spkGoTo_${uid}(${i})"></div>`).join('')}
</div>` : '';

  const carousel = `
<div style="position:relative">
  <div id="spkTrack_${uid}" style="display:flex;gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:4px 4px 8px;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none">
    ${items.map(sp => gridCard(sp)).join('')}
  </div>
  ${dots}
</div>
<style>#spkTrack_${uid}::-webkit-scrollbar{display:none}</style>
<svg style="display:none" onload="
(function(){
  var track=document.getElementById('spkTrack_${uid}');
  var dotsEl=document.getElementById('spkDots_${uid}');
  if(!track)return;
  var cards=track.querySelectorAll('.spk-card-${uid}');
  var n=cards.length;
  var cur=0,timer;

  function goTo(i){
    cur=((i%n)+n)%n;
    track.scrollTo({left:cards[cur].offsetLeft,behavior:'smooth'});
    updateDots();
  }
  window['spkGoTo_${uid}']=goTo;

  function updateDots(){
    for(var i=0;i&lt;n;i++){
      var d=document.getElementById('spkDot_${uid}_'+i);
      if(!d)continue;
      d.style.width=i===cur?'20px':'6px';
      d.style.background=i===cur?'${t.accent}':'rgba(255,255,255,0.2)';
    }
  }

  function startAuto(){timer=setInterval(function(){goTo(cur+1);},5500);}
  function stopAuto(){clearInterval(timer);}

  function applyMode(){
    var overflows=track.scrollWidth > track.clientWidth + 4;
    if(overflows){
      /* CAROUSEL MODE */
      track.style.flexWrap='nowrap';
      track.style.overflowX='auto';
      track.style.justifyContent='flex-start';
      track.style.scrollSnapType='x mandatory';
      if(dotsEl) dotsEl.style.display='flex';
      stopAuto();
      if(n&gt;1){
        track.addEventListener('mouseenter',stopAuto);
        track.addEventListener('mouseleave',startAuto);
        track.addEventListener('touchstart',stopAuto,{passive:true});
        track.addEventListener('touchend',function(){setTimeout(startAuto,4000);},{passive:true});
        track.addEventListener('scroll',function(){
          var best=0,min=Infinity;
          for(var i=0;i&lt;n;i++){var dx=Math.abs(cards[i].offsetLeft-track.scrollLeft);if(dx&lt;min){min=dx;best=i;}}
          if(best!==cur){cur=best;updateDots();}
        },{passive:true});
        startAuto();
      }
    } else {
      /* GRID MODE — centered, no scroll, no dots */
      stopAuto();
      track.style.flexWrap='wrap';
      track.style.overflowX='visible';
      track.style.justifyContent='center';
      track.style.scrollSnapType='none';
      if(dotsEl) dotsEl.style.display='none';
    }
  }

  /* Run after layout paint so scrollWidth is accurate */
  setTimeout(applyMode, 0);
  window.addEventListener('resize', applyMode);
})();
"></svg>`;

  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'Speakers', t, p.alignment || 'center', p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null)}
  ${items.length
      ? (isList
        ? `<div style="display:flex;flex-direction:column;gap:14px">${items.map(listCard).join('')}</div>`
        : carousel)
      : `<div style="color:${t.muted};font-size:14px;padding:8px 0">Add speakers in the properties panel.</div>`}
</div>`, bg);
}
/* ═══════════════════════════════════════════════════════════════
   BLOCK 6 — FAQ
═══════════════════════════════════════════════════════════════ */
function msb_faq(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bg;
  const items = p.items || [];
  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'Frequently Asked Questions', t, p.alignment, p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null)}
  <div style="display:flex;flex-direction:column;gap:10px;max-width:820px;margin:0 auto">
    ${items.map((q, i) => `
    <details style="border:1px solid ${t.border};border-radius:12px;overflow:hidden;background:${t.bgCard}" ${i === 0 ? 'open' : ''}>
      <summary style="list-style:none;padding:16px 18px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;user-select:none">
        <span style="font-size:${p.textFontSize ? p.textFontSize+'px' : '15px'};font-weight:600;color:${p.questionColor || t.text};line-height:1.4;flex:1">${q.question || ''}</span>
        <div style="width:22px;height:22px;border-radius:6px;background:rgba(${t.accentRgb},0.1);border:1px solid rgba(${t.accentRgb},0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="${t.accent}" stroke-width="2.5" style="width:12px;height:12px"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </summary>
      <div style="padding:4px 18px 16px;border-top:1px solid ${t.border}">
        <p style="margin:12px 0 0;font-size:${p.textFontSize ? Math.max(12, p.textFontSize - 1)+'px' : '14.5px'};color:${p.answerColor || t.sub};line-height:1.75">${q.answer || ''}</p>
      </div>
    </details>`).join('')}
    ${!items.length ? `<div style="color:${t.muted};font-size:14px;padding:8px 0">Add FAQ items in the properties panel.</div>` : ''}
  </div>
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 7 — SPONSORS
═══════════════════════════════════════════════════════════════ */
function msb_sponsors(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bgAlt;
  const tiers = p.tiers || [];
  const tierSizes = { 0: '80px', 1: '64px', 2: '52px', 3: '48px' };
  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'Our Sponsors', t, p.alignment, p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null)}
  ${tiers.map((tier, ti) => `
  <div style="margin-bottom:28px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${p.tierNameColor || t.muted};margin-bottom:12px;text-align:${p.alignment === 'center' ? 'center' : p.alignment === 'right' ? 'right' : 'left'}">${tier.name}</div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;justify-content:${p.alignment === 'right' ? 'flex-end' : p.alignment === 'center' ? 'center' : 'flex-start'};flex-direction:${p.horizontal === false ? 'column' : 'row'}">
      ${tier.items?.length ? tier.items.map(s => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:7px">
          <div style="padding:10px 16px;min-height:${tierSizes[ti] || '48px'};border-radius:10px;background:${t.bgCard};border:1px solid ${t.border};display:inline-flex;align-items:center;justify-content:center">
            ${s.logo ? `<img src="${s.logo}" style="height:${tierSizes[ti] ? parseInt(tierSizes[ti]) - 20 + 'px' : '28px'};max-width:120px;object-fit:contain" alt="${s.name || ''}"/>` : `<span style="font-size:13px;font-weight:600;color:${t.sub}">${s.name || 'Sponsor'}</span>`}
          </div>
          ${s.logo && s.name ? `<span style="font-size:11px;font-weight:500;color:${t.muted};text-align:center;max-width:100px;word-break:break-word">${s.name}</span>` : ''}
        </div>`).join('') :
      `<div style="padding:10px 20px;min-height:${tierSizes[ti] || '48px'};border-radius:10px;border:1.5px dashed ${t.border};display:inline-flex;align-items:center;justify-content:center">
          <span style="font-size:12px;color:${t.muted}">Add logos →</span>
        </div>`}
    </div>
  </div>`).join('')}
  ${!tiers.length ? `<div style="color:${t.muted};font-size:14px;padding:8px 0">Configure sponsor tiers in the properties panel.</div>` : ''}
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 8 — REGISTRATION FORM
═══════════════════════════════════════════════════════════════ */
function msb_form(block, cfg) {
  const p = block.props;
  const t = msb_theme(cfg);
  const bg = p.bgColor || t.bgAlt;
  const btnBg = p.buttonColor || t.accent;
  const [br, bg_, bb] = msb_hexRgb(btnBg);
  const isOpen = cfg.registrationOpen !== false;

  const hasUrl = p.connectType === 'url' && p.connectUrl;
  const gsSlug = p.gsFormSlug || ((p.connectUrl || '').match(/[?&]f=([^&#]+)/)?.[1] || '');
  const cleanHxSlug = gsSlug ? (() => { try { return decodeURIComponent(gsSlug); } catch { return gsSlug; } })() : '';
  const gsUrl = p.connectType === 'gsform' && cleanHxSlug
    ? `/gs-form-view.html?f=${encodeURIComponent(cleanHxSlug)}&embed=1`
    : '';

  return msb_wrap(`
<div style="padding:48px clamp(20px,5%,56px);font-family:'${t.font}',sans-serif;text-align:center">

  ${msb_title(p.title || 'Register Now', t, 'center', p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null)}
  ${p.subtitle ? `<p style="margin:-12px 0 28px;font-size:15px;color:${p.subtitleColor || t.sub};line-height:1.65">${p.subtitle}</p>` : ''}

  ${isOpen ? `
  ${gsUrl ? `
  <!-- Connected GS Form -->
  <div style="max-width:760px;margin:0 auto;text-align:left">
    <div style="margin:0 0 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:9px;color:${t.sub};font-size:13px;font-weight:600">
        <span style="width:9px;height:9px;border-radius:99px;background:#10b981;box-shadow:0 0 10px rgba(16,185,129,0.6)"></span>
        ${p.gsFormName ? msb_attr(p.gsFormName) : 'GS Form connected'}
      </div>
      <a href="${gsUrl.replace('&embed=1', '')}" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:7px;color:${t.accent};font-size:12.5px;font-weight:700;text-decoration:none">
        Open full form
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </div>
    <iframe src="${gsUrl}" title="${msb_attr(p.gsFormName || 'Registration form')}" loading="lazy"
      style="display:block;width:100%;height:${p.gsEmbedHeight || 820}px;border:1px solid ${t.border2};border-radius:18px;background:${t.bgCard};box-shadow:${t.shadow}"></iframe>
  </div>
  ` : hasUrl ? `
  <!-- Connected form button -->
  <a href="${p.connectUrl}" target="_blank" rel="noopener"
    style="display:inline-flex;align-items:center;gap:10px;padding:15px 36px;background:${btnBg};color:#fff;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none;font-family:'${t.font}',sans-serif;box-shadow:0 6px 28px rgba(${br},${bg_},${bb},0.32);transition:opacity 0.15s">
    ${p.buttonText || 'Register Now →'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:15px;height:15px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
  </a>
  <p style="margin-top:14px;font-size:12.5px;color:${t.muted}">Opens in a new tab</p>
  ` : `
  <!-- No form connected — placeholder -->
  <div style="max-width:380px;margin:0 auto;padding:28px 24px;border:2px dashed rgba(${br},${bg_},${bb},0.3);border-radius:14px;background:rgba(${br},${bg_},${bb},0.05)">
    <div style="width:48px;height:48px;border-radius:12px;background:rgba(${br},${bg_},${bb},0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
      <svg viewBox="0 0 24 24" fill="none" stroke="${btnBg}" stroke-width="2" style="width:22px;height:22px"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
    </div>
    <div style="font-size:14.5px;font-weight:700;color:${p.subtitleColor || t.sub};margin-bottom:6px">No form connected yet</div>
    <div style="font-size:13px;color:${p.subtitleColor || t.sub};line-height:1.55">Paste your Google Forms, Typeform, or any form URL in the Block settings panel.</div>
  </div>
  `}
  ` : `
  <div style="max-width:360px;margin:0 auto;padding:22px 20px;border-radius:12px;background:rgba(244,63,94,0.07);border:1px solid rgba(244,63,94,0.2)">
    <div style="width:44px;height:44px;border-radius:12px;background:rgba(244,63,94,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">
      <svg viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" style="width:21px;height:21px"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
    </div>
    <div style="font-size:15px;font-weight:600;color:#f43f5e;margin-bottom:4px">Registrations Closed</div>
    <div style="font-size:13px;color:${t.sub}">Registration is currently closed.</div>
  </div>`}

</div>`, bg);
}


function msb_documents(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bg;
  const items = p.items || [];
  const fileIcons = {
    pdf: '#f43f5e', doc: '#3b82f6', xls: '#10b981',
    ppt: '#f59e0b', zip: '#8b5cf6', default: '#64748b',
  };
  const getExt = url => ((url || '').split('.').pop() || '').toLowerCase().split('?')[0];
  const getColor = url => { const ext = getExt(url); return fileIcons[ext] || fileIcons.default; };

  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'Resources', t, p.alignment, p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null)}
  <div style="display:flex;flex-direction:column;gap:10px;max-width:600px;margin:0 auto">
    ${items.length ? items.map(doc => {
    const color = doc.iconColor || getColor(doc.url);
    const [cr, cg, cb] = msb_hexRgb(color);
    return `
    <a href="${doc.url || '#'}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;background:${t.bgCard};border:1px solid ${t.border};text-decoration:none;transition:border-color 0.15s">
      <div style="width:40px;height:40px;border-radius:9px;background:rgba(${cr},${cg},${cb},0.12);border:1px solid rgba(${cr},${cg},${cb},0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" style="width:18px;height:18px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14.5px;font-weight:600;color:${p.itemLabelColor || t.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${doc.label || 'Document'}</div>
        ${doc.desc ? `<div style="font-size:12px;color:${p.itemDescColor || t.muted};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${doc.desc}</div>` : ''}
      </div>
      <div style="flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="${t.muted}" stroke-width="2" style="width:15px;height:15px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </div>
    </a>`;
  }).join('') :
      `<div style="color:${t.muted};font-size:14px;padding:8px 0">Add document links in the properties panel.</div>`}
  </div>
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 10 — VIDEO
═══════════════════════════════════════════════════════════════ */
function msb_video(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bg;
  const items = (p.items || []).slice(0, 2);

  const videoCard = (v) => {
    const ytId = msb_ytId(v.url || '');
    const thumb = v.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : '');
    const embedUrl = ytId ? `https://www.youtube.com/embed/${ytId}` : (v.url || '');
    const isYT = !!ytId;

    return `
  <div style="width:100%;max-width:640px;margin:0 auto 20px">
    ${v.title ? `<div style="font-size:15px;font-weight:600;color:${p.videoTitleColor || t.text};margin-bottom:10px">${v.title}</div>` : ''}
    ${isYT ? `
    <div style="position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;${t.shadow ? `box-shadow:${t.shadow}` : ''}">
      <iframe src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:none" allowfullscreen loading="lazy" title="${v.title || 'Video'}"></iframe>
    </div>` : `
    <div style="position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;${t.shadow ? `box-shadow:${t.shadow}` : ''}">
      ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;opacity:0.75" alt="${v.title || ''}"/>` : `<div style="width:100%;height:100%;background:${t.bgCard};border:1px solid ${t.border};display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px"><svg viewBox="0 0 24 24" fill="none" stroke="${t.muted}" stroke-width="1.5" style="width:36px;height:36px"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><span style="font-size:13px;color:${t.muted}">Video preview</span></div>`}
      <a href="${v.url || '#'}" target="_blank" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-decoration:none">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,0,0,0.7);border:2px solid rgba(255,255,255,0.5);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)">
          <svg viewBox="0 0 24 24" fill="#fff" style="width:20px;height:20px;margin-left:3px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </a>
    </div>`}
  </div>`;
  };

  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${p.title ? msb_title(p.title, t, p.alignment, p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null) : ''}
  ${items.length ? items.map(v => videoCard(v)).join('') :
      `<div style="aspect-ratio:16/9;border-radius:12px;background:${t.bgCard};border:1.5px dashed ${t.border};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">
    <svg viewBox="0 0 24 24" fill="none" stroke="${t.muted}" stroke-width="1.5" style="width:36px;height:36px"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
    <span style="font-size:13.5px;color:${t.muted}">Paste a YouTube or Drive link →</span>
  </div>`}
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 11 — SOCIAL LINKS
═══════════════════════════════════════════════════════════════ */
function msb_socials(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bgAlt;
  const links = p.links || [];
  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif;text-align:center">
  ${p.title ? msb_title(p.title, t, 'center', p.titleColor, p.titleFontSize ? p.titleFontSize+'px' : null) : ''}
  <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px">
    ${links.length ? links.map(lk => {
    const ic = MSB_SOCIAL_ICONS[lk.platform] || MSB_SOCIAL_ICONS.website;
    const color = ic.color;
    const [cr, cg, cb] = msb_hexRgb(color);
    return `
    <a href="${lk.url || '#'}" target="_blank" rel="noopener" title="${lk.platform}" style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:13px;background:rgba(${cr},${cg},${cb},0.12);border:1.5px solid rgba(${cr},${cg},${cb},0.25);text-decoration:none;transition:transform 0.15s,box-shadow 0.15s">
      ${ic.fill
        ? `<svg viewBox="0 0 24 24" fill="${color}" stroke="none" style="width:20px;height:20px">${ic.path}</svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px">${ic.path}</svg>`}
    </a>`;
  }).join('') :
      `<div style="color:${t.muted};font-size:14px">Add social links in the properties panel.</div>`}
  </div>
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 12 — DIVIDER
═══════════════════════════════════════════════════════════════ */
function msb_divider(block, cfg) {
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || 'transparent';
  const opacity = (p.opacity || 30) / 100;
  const color = t.isDark ? `rgba(255,255,255,${opacity})` : `rgba(0,0,0,${opacity * 0.7})`;
  const thickness = p.thickness || 1;

  if (p.style === 'dots') {
    return msb_wrap(`
<div style="padding:16px clamp(20px,5%,48px);display:flex;align-items:center;justify-content:center;gap:6px">
  ${[1, 2, 3, 4, 5].map(() => `<div style="width:4px;height:4px;border-radius:50%;background:${color}"></div>`).join('')}
</div>`, bg);
  }
  return msb_wrap(`
<div style="padding:4px clamp(20px,5%,48px)">
  <div style="height:${thickness}px;background:${color};border-radius:99px"></div>
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 13 — SPACER
═══════════════════════════════════════════════════════════════ */
function msb_spacer(block, cfg) {
  const p = block.props;
  const bg = p.bgColor || 'transparent';
  return `<div style="height:${p.height || 48}px;background:${bg}"></div>`;
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API — renderMSBlock(block, config)
   Dispatch to the correct renderer. Used by:
    · mini-site-editor.html  (canvas preview via renderBlockCanvas)
    · site.html              (public visitor page, Batch 6)
═══════════════════════════════════════════════════════════════ */
const MSB_RENDERERS = {
  cover: msb_cover,
  about: msb_about,
  announcements: msb_announcements,
  datetime: msb_datetime,
  speakers: msb_speakers,
  faq: msb_faq,
  sponsors: msb_sponsors,
  form: msb_form,
  documents: msb_documents,
  video: msb_video,
  socials: msb_socials,
  divider: msb_divider,
  spacer: msb_spacer,
};

function renderMSBlock(block, config) {
  if (!block || !block.type) return '';
  const fn = MSB_RENDERERS[block.type];
  if (!fn) return `<div style="padding:24px;text-align:center;opacity:0.3;font-size:13px">${block.type}</div>`;
  try { return fn(block, config || {}); }
  catch (e) { console.error('renderMSBlock error for', block.type, e); return ''; }
}

/**
 * Render a full mini site (all blocks) as a standalone HTML document.
 * Used by site.html to render the public visitor page.
 */
function renderMSSite(siteConfig, blocks) {
  const t = msb_theme(siteConfig);
  const titleFont   = siteConfig.titleFont   || siteConfig.fontFamily || 'Syne';
  const contentFont = siteConfig.contentFont || siteConfig.fontFamily || 'Plus Jakarta Sans';
  const fontUrls = [...new Set([
    MSB_GOOGLE_FONT_URLS[titleFont]   || '',
    MSB_GOOGLE_FONT_URLS[contentFont] || '',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Syne:wght@600;700;800&display=swap',
  ])].filter(Boolean).map(u => `  <link href="${u}" rel="stylesheet"/>`).join('\n');
  const titleColorRule  = siteConfig.titleColor   ? `h1,h2,h3,h4,h5{color:${siteConfig.titleColor}!important}` : '';
  const contentColorRule = siteConfig.contentColor ? `p,li,span{color:${siteConfig.contentColor}!important}` : '';
  const body = (blocks || []).map(b => renderMSBlock(b, siteConfig)).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${siteConfig.name || 'Event'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
${fontUrls}
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'${contentFont}','Plus Jakarta Sans',sans-serif;background:${t.bg};color:${t.text};-webkit-font-smoothing:antialiased}
    h1,h2,h3,h4,h5{font-family:'${titleFont}',sans-serif}
    ${titleColorRule}${contentColorRule}
    details summary::-webkit-details-marker{display:none}
    details[open]>summary svg{transform:rotate(180deg)}
    details>summary svg{transition:transform 0.2s}
    input:focus,select:focus,textarea:focus{border-color:${t.accent}!important;outline:none;box-shadow:0 0 0 3px rgba(${t.accentRgb},0.12)!important}
    @media(max-width:600px){.ms-hide-mobile{display:none!important}}
  </style>
</head>
<body>
${body}
<script>
// Form submission — wired in Batch 5
document.querySelectorAll('[data-ms-form]').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const sheetId = form.dataset.msForm;
    const btn = form.querySelector('[type="submit"]');
    if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }
    try {
      const data = Object.fromEntries(new FormData(form));
      await fetch('/api/minisite/submit', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ siteId: '${siteConfig.siteId || ''}', sheetId, data }),
      });
      form.innerHTML = '<div style="text-align:center;padding:32px;font-size:15px;color:${t.accent};font-weight:600">✓ Registered successfully!</div>';
    } catch(err) {
      if (btn) { btn.textContent = 'Try Again'; btn.disabled = false; }
    }
  });
});
</script>
</body>
</html>`;
}

/* Google Fonts URL map — used by renderMSSite (public page) and mobile preview iframe */
const MSB_GOOGLE_FONT_URLS = {
  // Professional sans-serif
  'Plus Jakarta Sans': 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  'Lexend':            'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap',
  'Space Grotesk':     'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap',
  'Syne':              'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&display=swap',
  'Montserrat':        'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap',
  'Raleway':           'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap',
  'Oswald':            'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap',
  // Professional serif
  'Playfair Display':  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap',
  'Lora':              'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap',
  'EB Garamond':       'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&display=swap',
  'Cormorant Garamond':'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&display=swap',
  'Cinzel':            'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap',
  // Display / Impact
  'Bebas Neue':        'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
  'Abril Fatface':     'https://fonts.googleapis.com/css2?family=Abril+Fatface&display=swap',
  // Calligraphy / Script
  'Great Vibes':       'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap',
  'Pinyon Script':     'https://fonts.googleapis.com/css2?family=Pinyon+Script&display=swap',
  'Dancing Script':    'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;600;700&display=swap',
  // Comical / Fun
  'Pacifico':          'https://fonts.googleapis.com/css2?family=Pacifico&display=swap',
  'Boogaloo':          'https://fonts.googleapis.com/css2?family=Boogaloo&display=swap',
  // Monospace
  'JetBrains Mono':    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
};
