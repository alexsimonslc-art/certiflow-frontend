/* ================================================================
   Honourix — Mini Site Builder  |  mini-site-blocks.js
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
  const font = cfg.fontFamily || 'Plus Jakarta Sans';
  return {
    isDark,
    accent,
    ar, ag, ab,
    accentRgb: `${ar},${ag},${ab}`,
    font,
    fontDisplay: cfg.fontHeading || cfg.fontFamily || 'Syne',
    // Text
    text: isDark ? '#eef4ff' : '#1e293b',
    sub: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)',
    muted: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
    // Backgrounds
    bg: isDark ? (cfg.bgOverride || '#0a0f1e') : '#ffffff',
    bgAlt: isDark ? '#0d1525' : '#f8fafc',
    bgCard: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
    bgInput: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    // Borders
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    border2: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)',
    // Shadows
    shadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.08)',
  };
}

function msb_hexRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#00d4ff');
  return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [0, 212, 255];
}

/** Wrap a block section in a sectioncontainer with optional bg override */
function msb_wrap(content, bg, extraStyle) {
  return `<div style="width:100%;${bg ? `background:${bg};` : ''}${extraStyle || ''}">${content}</div>`;
}

/** Section title with accent left-bar */
function msb_title(text, t, align) {
  const a = align || 'left';
  if (a === 'center') return `<div style="text-align:center;margin-bottom:20px">
    <h2 style="margin:0 0 8px;font-size:clamp(18px,3vw,24px);font-weight:700;color:${t.text};font-family:'${t.fontDisplay}','${t.font}',sans-serif;letter-spacing:-0.3px;line-height:1.2">${text}</h2>
    <div style="width:40px;height:3px;background:${t.accent};border-radius:99px;margin:0 auto"></div>
  </div>`;
  if (a === 'right') return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-direction:row-reverse">
    <div style="width:3px;height:28px;background:${t.accent};border-radius:99px;flex-shrink:0"></div>
    <h2 style="margin:0;flex:1;text-align:right;font-size:clamp(18px,3vw,24px);font-weight:700;color:${t.text};font-family:'${t.fontDisplay}','${t.font}',sans-serif;letter-spacing:-0.3px;line-height:1.2">${text}</h2>
  </div>`;
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
    <div style="width:3px;height:28px;background:${t.accent};border-radius:99px;flex-shrink:0"></div>
    <h2 style="margin:0;font-size:clamp(18px,3vw,24px);font-weight:700;color:${t.text};font-family:'${t.fontDisplay}','${t.font}',sans-serif;letter-spacing:-0.3px;line-height:1.2">${text}</h2>
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
  x: { path: '<path d="M4 4l16 16M4 20L20 4"/>', color: '#000000' },
  linkedin: { path: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>', color: '#0077b5' },
  youtube: { path: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.4 19.54C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>', color: '#ff0000' },
  github: { path: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>', color: '#181717' },
  facebook: { path: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>', color: '#1877f2' },
  whatsapp: { path: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>', color: '#25d366' },
  telegram: { path: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', color: '#2ca5e0' },
  discord: { path: '<path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z"/>', color: '#5865f2' },
  website: { path: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', color: '#6366f1' },
};

function msb_socialIcon(platform, color, size = 20) {
  const ic = MSB_SOCIAL_ICONS[platform] || MSB_SOCIAL_ICONS.website;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:${size}px;height:${size}px;display:block">${ic.path}</svg>`;
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
    : (t.isDark ? 'linear-gradient(160deg,#0d1f3c 0%,#04080f 100%)' : 'linear-gradient(160deg,#e0e7ff,#c7d2fe)');

  return `
<div style="position:relative;min-height:300px;background:${p.bgColor || (t.isDark ? '#04080f' : '#1e293b')};display:flex;flex-direction:column;align-items:${p.alignment === 'left' ? 'flex-start' : p.alignment === 'right' ? 'flex-end' : 'center'};justify-content:flex-end;padding:0 clamp(24px,6vw,64px) 52px;overflow:hidden;font-family:'${t.font}',sans-serif;box-sizing:border-box">
  ${p.coverImage
      ? `<div style="position:absolute;inset:0;background:url('${p.coverImage}') center/cover no-repeat"></div>`
      : `<div style="position:absolute;inset:0;background:${bgBase}"></div>`}
  <div style="position:absolute;inset:0;background:${overlay}"></div>
  <div style="position:absolute;bottom:0;left:0;right:0;height:100px;background:linear-gradient(to bottom,transparent,rgba(0,0,0,0.45))"></div>

  ${p.showLogo !== false ? `
  <div style="position:relative;z-index:3;margin-bottom:18px">
    <div style="width:min(${logoW}px,42vw);height:min(${logoH}px,${shape === 'rectangle' ? '21vw' : '42vw'});border-radius:${radius};background:${p.logoBorder === false ? 'transparent' : (p.logoImage ? 'transparent' : 'rgba(255,255,255,0.12)')};${p.logoBorder === false ? '' : 'border:2.5px solid rgba(255,255,255,0.28);backdrop-filter:blur(6px);box-shadow:0 8px 40px rgba(0,0,0,0.4),0 0 0 4px rgba(255,255,255,0.06);'}display:flex;align-items:center;justify-content:center;overflow:hidden">
      ${p.logoImage
        ? `<img src="${p.logoImage}" style="width:100%;height:100%;object-fit:contain" alt="logo"/>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" style="width:34px;height:34px"><circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`}
    </div>
  </div>` : '<div style="height:28px;position:relative;z-index:3"></div>'}

  <div style="position:relative;z-index:3;text-align:${p.alignment || 'center'};max-width:540px;width:100%">
    ${(p.siteName || cfg.name) ? `<h1 style="margin:0 0 10px;font-size:clamp(24px,5vw,40px);font-weight:800;color:#ffffff;line-height:1.1;letter-spacing:-0.8px;font-family:'${t.fontDisplay}','${t.font}',sans-serif;text-shadow:0 2px 16px rgba(0,0,0,0.4)">${p.siteName || cfg.name}</h1>` : ''}
    ${p.tagline ? `<p style="margin:0;font-size:clamp(13px,2.2vw,16px);color:rgba(255,255,255,0.68);font-weight:400;line-height:1.6;letter-spacing:0.1px">${p.tagline}</p>` : ''}
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
  const align = p.alignment || 'left';
  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'About This Event', t, p.alignment)}
  <p style="margin:0;font-size:clamp(14px,2.2vw,16px);color:${t.sub};line-height:1.8;text-align:${align};white-space:pre-wrap">${p.content || ''}</p>
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
  ${msb_title(p.title || 'Announcements', t, p.alignment)}
  <div style="display:flex;flex-direction:column;gap:10px">
    ${items.length ? items.map(item => `
    <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-radius:12px;background:rgba(${t.accentRgb},0.07);border:1px solid rgba(${t.accentRgb},0.18);position:relative;overflow:hidden">
      <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${t.accent};border-radius:0 3px 3px 0"></div>
      <div style="width:8px;height:8px;border-radius:50%;background:${t.accent};flex-shrink:0;margin-top:5px;box-shadow:0 0 8px rgba(${t.accentRgb},0.6)"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14.5px;color:${t.text};line-height:1.55;font-weight:500">${item.text || ''}</div>
        ${item.date ? `<div style="font-size:11.5px;color:${t.muted};margin-top:4px">${item.date}</div>` : ''}
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
      ? `<a href="${link}" target="_blank" style="font-size:clamp(13px,2vw,15px);font-weight:700;color:${t.accent};line-height:1.3;text-decoration:none;word-break:break-word">${value || '—'}</a>`
      : `<div style="font-size:clamp(13px,2vw,15px);font-weight:700;color:${t.text};line-height:1.3;word-break:break-word">${value || '—'}</div>`}
    <div style="font-size:11.5px;color:${t.muted};text-transform:uppercase;letter-spacing:0.6px;font-weight:600">${label}</div>
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
  const isList = p.layout === 'list';
  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'Speakers', t, p.alignment)}
  <div style="display:${isList ? 'flex flex-direction:column' : 'grid'};${isList ? 'gap:14px' : 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px'}">
    ${items.length ? items.map(sp => isList ? `
    <div style="display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:12px;background:${t.bgCard};border:1px solid ${t.border}">
      <div style="width:52px;height:52px;border-radius:50%;background:${sp.photo ? 'transparent' : 'rgba(' + t.accentRgb + ',0.12)'};border:2px solid rgba(${t.accentRgb},0.2);overflow:hidden;flex-shrink:0">
        ${sp.photo ? `<img src="${sp.photo}" style="width:100%;height:100%;object-fit:cover" alt="${sp.name || ''}"/>` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${t.accent}">${(sp.name || '?')[0]}</div>`}
      </div>
      <div>
        <div style="font-size:15px;font-weight:700;color:${t.text}">${sp.name || 'Speaker'}</div>
        ${sp.role ? `<div style="font-size:13px;color:${t.muted};margin-top:2px">${sp.role}</div>` : ''}
        ${sp.bio ? `<div style="font-size:12.5px;color:${t.sub};margin-top:6px;line-height:1.5">${sp.bio}</div>` : ''}
      </div>
    </div>` : `
    <div style="text-align:center;padding:20px 14px;border-radius:14px;background:${t.bgCard};border:1px solid ${t.border}">
      <div style="width:64px;height:64px;border-radius:50%;background:${sp.photo ? 'transparent' : 'rgba(' + t.accentRgb + ',0.12)'};border:2px solid rgba(${t.accentRgb},0.2);overflow:hidden;margin:0 auto 12px">
        ${sp.photo ? `<img src="${sp.photo}" style="width:100%;height:100%;object-fit:cover" alt="${sp.name || ''}"/>` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:${t.accent}">${(sp.name || '?')[0]}</div>`}
      </div>
      <div style="font-size:14px;font-weight:700;color:${t.text};margin-bottom:4px">${sp.name || 'Speaker'}</div>
      ${sp.role ? `<div style="font-size:12px;color:${t.muted}">${sp.role}</div>` : ''}
      ${sp.bio ? `<div style="font-size:12px;color:${t.sub};margin-top:8px;line-height:1.5">${sp.bio}</div>` : ''}
    </div>`).join('') :
      `<div style="color:${t.muted};font-size:14px;padding:8px 0">Add speakers in the properties panel.</div>`}
  </div>
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
  ${msb_title(p.title || 'Frequently Asked Questions', t, p.alignment)}
  <div style="display:flex;flex-direction:column;gap:4px">
    ${items.map((q, i) => `
    <details style="border:1px solid ${t.border};border-radius:12px;overflow:hidden;background:${t.bgCard}" ${i === 0 ? 'open' : ''}>
      <summary style="list-style:none;padding:16px 18px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;user-select:none">
        <span style="font-size:15px;font-weight:600;color:${t.text};line-height:1.4;flex:1">${q.question || ''}</span>
        <div style="width:22px;height:22px;border-radius:6px;background:rgba(${t.accentRgb},0.1);border:1px solid rgba(${t.accentRgb},0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="${t.accent}" stroke-width="2.5" style="width:12px;height:12px"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </summary>
      <div style="padding:4px 18px 16px;border-top:1px solid ${t.border}">
        <p style="margin:12px 0 0;font-size:14.5px;color:${t.sub};line-height:1.75">${q.answer || ''}</p>
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
  ${msb_title(p.title || 'Our Sponsors', t, p.alignment)}
  ${tiers.map((tier, ti) => `
  <div style="margin-bottom:28px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${t.muted};margin-bottom:12px;text-align:${p.alignment === 'center' ? 'center' : p.alignment === 'right' ? 'right' : 'left'}">${tier.name}</div>
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
  const p = block.props, t = msb_theme(cfg);
  const bg = p.bgColor || t.bgAlt;
  const btnBg = p.buttonColor || t.accent;
  const [br, bg_, bb] = msb_hexRgb(btnBg);
  const isOpen = cfg.registrationOpen !== false;
  const fields = p.fields || [];

  const fieldHtml = (f) => {
    const inputStyle = `width:100%;padding:11px 14px;background:${t.bgInput};border:1.5px solid ${t.border};border-radius:9px;color:${t.text};font-size:14px;font-family:'${t.font}',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.15s`;
    switch (f.type) {
      case 'textarea': return `<textarea name="${f.id}" placeholder="${f.placeholder || ''}" rows="3" style="${inputStyle};resize:vertical;line-height:1.55" ${f.required ? 'required' : ''}></textarea>`;
      case 'select': return `
<div style="display:flex;flex-direction:column;gap:8px">
  ${(f.options || []).map((o, oi) => `
  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 14px;border-radius:9px;border:1.5px solid ${t.border2};background:${t.bgInput};transition:border-color 0.15s">
    <span style="width:18px;height:18px;border-radius:50%;border:2px solid ${t.border2};flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${t.bg}">
      <span style="width:8px;height:8px;border-radius:50%;background:${t.accent};opacity:0;transition:opacity 0.15s" class="ms-radio-dot-${f.id}"></span>
    </span>
    <input type="radio" name="${f.id}" value="${o}" style="display:none" ${f.required && oi === 0 ? 'required' : ''} onchange="this.closest('[data-ms-form]')?.querySelectorAll('.ms-radio-dot-${f.id}').forEach(d=>d.style.opacity='0');this.closest('label').querySelector('.ms-radio-dot-${f.id}').style.opacity='1';this.closest('label').style.borderColor='${t.accent}'"/>
    <span style="font-size:14px;color:${t.sub}">${o}</span>
  </label>`).join('')}
</div>`;
      case 'checkbox': return `
<div style="display:flex;flex-direction:column;gap:8px">
  ${(f.options && f.options.length ? f.options : ['Yes']).map((o, oi) => `
  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 14px;border-radius:9px;border:1.5px solid ${t.border2};background:${t.bgInput};transition:border-color 0.15s">
    <span style="width:18px;height:18px;border-radius:5px;border:2px solid ${t.border2};flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${t.bg};transition:all 0.15s" id="ms-chk-box-${f.id}-${oi}">
      <svg viewBox="0 0 24 24" fill="none" stroke="${t.accent}" stroke-width="3" style="width:11px;height:11px;opacity:0;transition:opacity 0.15s" id="ms-chk-ico-${f.id}-${oi}"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
    <input type="checkbox" name="${f.id}" value="${o}" style="display:none" onchange="const b=document.getElementById('ms-chk-box-${f.id}-${oi}');const i=document.getElementById('ms-chk-ico-${f.id}-${oi}');if(this.checked){b.style.background='rgba(${t.accentRgb},0.15)';b.style.borderColor='${t.accent}';i.style.opacity='1';this.closest('label').style.borderColor='${t.accent}'}else{b.style.background='';b.style.borderColor='';i.style.opacity='0';this.closest('label').style.borderColor=''}"/>
    <span style="font-size:14px;color:${t.sub}">${o}</span>
  </label>`).join('')}
</div>`;
      case 'file': return `
<div>
  <label style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:12px 16px;border-radius:9px;border:1.5px dashed ${t.border2};background:${t.bgInput};transition:border-color 0.15s" onmouseenter="this.style.borderColor='${t.accent}'" onmouseleave="this.style.borderColor=''">
    <div style="width:38px;height:38px;border-radius:9px;background:rgba(${t.accentRgb},0.10);border:1px solid rgba(${t.accentRgb},0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <svg viewBox="0 0 24 24" fill="none" stroke="${t.accent}" stroke-width="2" style="width:18px;height:18px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:600;color:${t.text}">Click to choose file</div>
      <div style="font-size:12px;color:${t.muted}" id="ms-file-label-${f.id}">${f.placeholder || 'No file chosen'}</div>
    </div>
    <input type="file" name="${f.id}" style="display:none" ${f.required ? 'required' : ''}
      onchange="document.getElementById('ms-file-label-${f.id}').textContent=this.files[0]?this.files[0].name+' ('+Math.round(this.files[0].size/1024)+'KB)':'No file chosen';this.closest('label').style.borderColor='${t.accent}'"/>
  </label>
  <div style="font-size:11px;color:${t.muted};margin-top:4px">Max recommended size: 5MB</div>
</div>`;
      default: return `<input type="${f.type || 'text'}" name="${f.id}" placeholder="${f.placeholder || ''}" style="${inputStyle}" ${f.required ? 'required' : ''}/>`;
    }
  };

  return msb_wrap(`
<div style="padding:40px clamp(20px,5%,48px);font-family:'${t.font}',sans-serif">
  ${msb_title(p.title || 'Register Now', t, p.alignment)}
  ${p.subtitle ? `<p style="margin:-8px 0 20px;font-size:14.5px;color:${t.sub};line-height:1.6">${p.subtitle}</p>` : ''}
  ${isOpen ? `
  <form data-ms-form="${p.sheetId || ''}" data-ms-success-msg="${(p.successMessage || '').replace(/"/g, '&quot;')}" style="max-width:520px;display:flex;flex-direction:column;gap:16px;${p.alignment === 'center' ? 'margin:0 auto;text-align:center' : p.alignment === 'right' ? 'margin-left:auto' : ''};" onsubmit="return false">
    ${fields.map(f => `
    <div style="display:flex;flex-direction:column;gap:6px">
      <label style="font-size:12.5px;font-weight:600;color:${t.sub};text-transform:uppercase;letter-spacing:0.5px">${f.label || ''}${f.required ? '<span style="color:#f43f5e;margin-left:3px">*</span>' : ''}</label>
      ${fieldHtml(f)}
    </div>`).join('')}
    <button type="submit" style="margin-top:8px;padding:14px 28px;background:${btnBg};color:#fff;border:none;border-radius:11px;font-size:15px;font-weight:700;cursor:pointer;font-family:'${t.font}',sans-serif;box-shadow:0 4px 24px rgba(${br},${bg_},${bb},0.3);transition:transform 0.15s,box-shadow 0.15s">${p.buttonText || 'Submit Registration'}</button>
  </form>` :
      `<div style="padding:24px;border-radius:12px;background:rgba(244,63,94,0.07);border:1px solid rgba(244,63,94,0.2);text-align:center">
    <div style="font-size:22px;margin-bottom:10px">🚫</div>
    <div style="font-size:15px;font-weight:600;color:#f43f5e;margin-bottom:6px">Registrations Closed</div>
    <div style="font-size:13.5px;color:${t.sub}">Registration for this event is currently closed.</div>
  </div>`}
</div>`, bg);
}

/* ═══════════════════════════════════════════════════════════════
   BLOCK 9 — DOCUMENT LINKS
═══════════════════════════════════════════════════════════════ */
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
  ${msb_title(p.title || 'Resources', t, p.alignment)}
  <div style="display:flex;flex-direction:column;gap:10px;max-width:520px">
    ${items.length ? items.map(doc => {
    const color = doc.iconColor || getColor(doc.url);
    const [cr, cg, cb] = msb_hexRgb(color);
    return `
    <a href="${doc.url || '#'}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;background:${t.bgCard};border:1px solid ${t.border};text-decoration:none;transition:border-color 0.15s">
      <div style="width:40px;height:40px;border-radius:9px;background:rgba(${cr},${cg},${cb},0.12);border:1px solid rgba(${cr},${cg},${cb},0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" style="width:18px;height:18px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14.5px;font-weight:600;color:${t.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${doc.label || 'Document'}</div>
        ${doc.desc ? `<div style="font-size:12px;color:${t.muted};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${doc.desc}</div>` : ''}
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
  <div style="width:100%;margin-bottom:16px">
    ${v.title ? `<div style="font-size:15px;font-weight:600;color:${t.text};margin-bottom:10px">${v.title}</div>` : ''}
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
  ${p.title ? msb_title(p.title, t, p.alignment) : ''}
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
  ${p.title ? `<h3 style="margin:0 0 20px;font-size:18px;font-weight:700;color:${t.text};font-family:'${t.fontDisplay}','${t.font}',sans-serif">${p.title}</h3>` : ''}
  <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px">
    ${links.length ? links.map(lk => {
    const ic = MSB_SOCIAL_ICONS[lk.platform] || MSB_SOCIAL_ICONS.website;
    const color = ic.color;
    const [cr, cg, cb] = msb_hexRgb(color);
    return `
    <a href="${lk.url || '#'}" target="_blank" rel="noopener" title="${lk.platform}" style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:13px;background:rgba(${cr},${cg},${cb},0.12);border:1.5px solid rgba(${cr},${cg},${cb},0.25);text-decoration:none;transition:transform 0.15s,box-shadow 0.15s">
      <svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px">${ic.path}</svg>
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
  const fontUrl = MSB_GOOGLE_FONT_URLS[siteConfig.fontFamily] || '';
  const body = (blocks || []).map(b => renderMSBlock(b, siteConfig)).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${siteConfig.name || 'Event'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  ${fontUrl ? `<link href="${fontUrl}" rel="stylesheet"/>` : ''}
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'${t.font}','Plus Jakarta Sans',sans-serif;background:${t.bg};color:${t.text};-webkit-font-smoothing:antialiased}
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

/* Google Fonts URL map (used by renderMSSite) */
const MSB_GOOGLE_FONT_URLS = {
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