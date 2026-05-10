/* ================================================================
   GalSol — Mini Site Builder  |  mini-site-state.js
   Block registry · State management · Undo/Redo · Persistence
================================================================ */

/* ═══════════════════════════════════════════════════════════════
   BLOCK REGISTRY — 13 block types with full default props
═══════════════════════════════════════════════════════════════ */
const BLOCK_REG = {

  cover: {
    label: 'Cover / Hero', icon: 'image', cat: 'structure',
    desc: 'Full-width hero with cover image and logo',
    defaults: () => ({
      coverImage: '', coverOverlay: 'dark',
      logoImage: '', logoShape: 'circle', showLogo: true,
      siteName: '', tagline: '',
      bgColor: '',
      titleColor: '', taglineColor: '',
      titleFontSize: '',
    }),
  },

  about: {
    label: 'About', icon: 'file-text', cat: 'structure',
    desc: 'Event description and bio',
    defaults: () => ({
      title: 'About This Event',
      content: 'Write a description of your event here. Tell people what to expect, who should attend, and why they should register.',
      alignment: 'center', bgColor: '',
      titleColor: '', textColor: '',
      titleFontSize: '', textFontSize: '',
    }),
  },

  announcements: {
    label: 'Announcements', icon: 'megaphone', cat: 'structure',
    desc: 'Pinned updates and important notices',
    defaults: () => ({
      title: 'Announcements',
      items: [{ id: 'a1', text: 'Registration is now open!', date: '', pinned: true }],
      bgColor: '',
      titleColor: '', itemTextColor: '', itemDateColor: '',
      titleFontSize: '', textFontSize: '',
    }),
  },

  datetime: {
    label: 'Date & Venue', icon: 'calendar', cat: 'event',
    desc: 'Event date, time and location',
    defaults: () => ({
      date: '', time: '', endTime: '', timezone: 'IST',
      venueName: '', venueAddress: '', venueType: 'in-person',
      onlineLink: '', mapLink: '', bgColor: '',
      valueColor: '', labelColor: '',
    }),
  },

  speakers: {
    label: 'Speakers / Team', icon: 'users', cat: 'event',
    desc: 'Speaker cards with photo, name and bio',
    defaults: () => ({
      title: 'Speakers', layout: 'grid',
      items: [], bgColor: '',
      titleColor: '', nameColor: '', roleColor: '', bioColor: '',
      titleFontSize: '',
    }),
  },

  faq: {
    label: 'FAQ', icon: 'help-circle', cat: 'event',
    desc: 'Accordion-style frequently asked questions',
    defaults: () => ({
      title: 'Frequently Asked Questions',
      items: [
        { id: 'q1', question: 'Who can participate?', answer: 'Anyone with a passion for the subject is welcome to register.' },
        { id: 'q2', question: 'Is there a registration fee?', answer: 'Registration is completely free for all participants.' },
      ],
      bgColor: '',
      titleColor: '', questionColor: '', answerColor: '',
      titleFontSize: '', textFontSize: '',
    }),
  },

  sponsors: {
    label: 'Sponsors', icon: 'award', cat: 'event',
    desc: 'Sponsor and partner logos by tier',
    defaults: () => ({
      title: 'Our Sponsors',
      tiers: [
        { id: 't1', name: 'Title Sponsor', items: [] },
        { id: 't2', name: 'Co-Sponsor', items: [] },
      ],
      bgColor: '',
      titleColor: '', tierNameColor: '',
      titleFontSize: '',
    }),
  },

  form: {
    label: 'Registration Form', icon: 'clipboard-list', cat: 'engagement',
    desc: 'Link to any form — Google Forms, Typeform, or GS Forms',
    defaults: () => ({
      title: 'Register Now',
      subtitle: 'Secure your spot — it only takes a minute.',
      buttonText: 'Register Now',
      buttonColor: '',
      connectType: 'url',
      connectUrl: '',
      gsFormId: '',
      bgColor: '',
      titleColor: '', subtitleColor: '',
      titleFontSize: '',
    }),
  },

  documents: {
    label: 'Document Links', icon: 'file-down', cat: 'engagement',
    desc: 'Rule books, brochures, invitations',
    defaults: () => ({
      title: 'Resources',
      items: [], bgColor: '',
      titleColor: '', itemLabelColor: '', itemDescColor: '',
      titleFontSize: '',
    }),
  },

  video: {
    label: 'Video', icon: 'play-circle', cat: 'engagement',
    desc: 'YouTube or Drive videos (max 2)',
    defaults: () => ({
      title: '', items: [], bgColor: '',
      titleColor: '', videoTitleColor: '',
      titleFontSize: '',
    }),
  },

  socials: {
    label: 'Social Links', icon: 'share-2', cat: 'engagement',
    desc: 'Social media icons and follow links',
    defaults: () => ({
      title: 'Follow Us', links: [], bgColor: '',
      titleColor: '',
      titleFontSize: '',
    }),
  },

  divider: {
    label: 'Divider', icon: 'minus', cat: 'layout',
    desc: 'Visual section separator',
    defaults: () => ({
      style: 'line', thickness: 1, opacity: 30, bgColor: '',
    }),
  },

  spacer: {
    label: 'Spacer', icon: 'move-vertical', cat: 'layout',
    desc: 'Empty vertical space',
    defaults: () => ({
      height: 48, bgColor: '',
    }),
  },
};

/* ── Category metadata ─────────────────────────────────────── */
const BLOCK_CATS = {
  structure: { label: 'Structure', color: '#00d4ff' },
  event: { label: 'Event Info', color: '#f59e0b' },
  engagement: { label: 'Engagement', color: '#a78bfa' },
  layout: { label: 'Layout', color: '#5a7394' },
};

/* ═══════════════════════════════════════════════════════════════
   USER SCOPING HELPERS
   Scope localStorage keys per-user so accounts never share data.
═══════════════════════════════════════════════════════════════ */

/** Extract the logged-in user's unique ID from their JWT. */
function mss_getUserId() {
  try {
    const token = localStorage.getItem('GalSol_token') || '';
    if (!token) return 'anon';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.googleId || payload.sub || payload.id || 'anon';
  } catch (e) {
    return 'anon';
  }
}

/** Per-user localStorage key — different for every Google account. */
function mss_storageKey() {
  return 'gs_minisites_' + mss_getUserId();
}

/** Backend base URL. */
const MSS_API = 'https://certiflow-backend-73xk.onrender.com/api/minisite';

/** Auth header helper. */
function mss_authHeader() {
  const token = localStorage.getItem('GalSol_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ── One-time migration: move old gs_minisites → user-scoped key ── */
(function mss_migrate() {
  try {
    const userId = mss_getUserId();
    if (userId === 'anon') return; // not logged in yet
    const newKey = 'gs_minisites_' + userId;
    // Already migrated if new key has data
    if (localStorage.getItem(newKey)) return;
    // Check old unscoped key
    const old = localStorage.getItem('gs_minisites');
    if (!old) return;
    const sites = JSON.parse(old);
    if (!Array.isArray(sites) || !sites.length) return;
    // Copy to new scoped key
    localStorage.setItem(newKey, old);
    console.log('[MSState] Migrated', sites.length, 'sites to scoped key:', newKey);
  } catch (e) { }
})();

/* ═══════════════════════════════════════════════════════════════
   MSSTATE — Central state manager
═══════════════════════════════════════════════════════════════ */
const MSState = {
  siteId: null,
  config: {},
  blocks: [],
  selectedId: null,
  history: [],
  histIdx: -1,
  MAX_HIST: 50,
  dirty: false,
  _backendDirty: false,
  _lastSaveTime: null,
  _lastBackendSave: null,
  _cb: null,

  /* ── Boot from URL ?id= ────────────────────────────────────
     1. Try to load from backend (latest data, user-scoped)
     2. Fall back to user-scoped localStorage (offline / fast load)
     3. If neither has it, redirect to site list
  ─────────────────────────────────────────────────────────── */
  init() {
    const params = new URLSearchParams(window.location.search);
    this.siteId = params.get('id');
    if (!this.siteId) { window.location.href = 'mini-site.html'; return false; }

    // Try localStorage first for instant load, then sync from backend
    const sites = JSON.parse(localStorage.getItem(mss_storageKey()) || '[]');
    const site = sites.find(s => s.id === this.siteId);

    if (site) {
      this._applySiteData(site);
      // Background sync from backend to pick up any changes from other devices
      this._fetchFromBackend().catch(() => {/* silently ignore if offline */ });
      return true;
    }

    // Not in localStorage — must fetch from backend (new device / cleared storage)
    // Return false here and do async init via initAsync() called from editor
    this._loadingFromBackend = true;
    return this._fetchFromBackend().then(ok => {
      if (!ok) window.location.href = 'mini-site.html';
      return ok;
    });
  },

  /** Fetch this site's config from backend and apply it. */
  async _fetchFromBackend() {
    try {
      const token = localStorage.getItem('GalSol_token') || '';
      if (!token) return false;

      // Fetch the full site list and find our site
      const res = await fetch(`${MSS_API}/list`, {
        headers: { 'Content-Type': 'application/json', ...mss_authHeader() },
      });
      if (!res.ok) return false;

      const data = await res.json();
      const sites = data.sites || [];

      // Merge into user-scoped localStorage
      const local = JSON.parse(localStorage.getItem(mss_storageKey()) || '[]');
      sites.forEach(backendSite => {
        const idx = local.findIndex(s => s.id === backendSite.id);
        const merged = {
          id: backendSite.id,
          name: backendSite.name,
          slug: backendSite.slug,
          status: backendSite.status,
          updatedAt: backendSite.updated_at,
          gaId: backendSite.ga_id || null,
          config: backendSite.config || {},
        };
        if (idx >= 0) local[idx] = merged;
        else local.push(merged);
      });
      localStorage.setItem(mss_storageKey(), JSON.stringify(local));

      // Apply this specific site
      const site = local.find(s => s.id === this.siteId);
      if (!site) return false;
      this._applySiteData(site);
      return true;
    } catch (e) {
      console.warn('[MSState] Backend fetch failed:', e.message);
      return false;
    }
  },

  /** Apply a site data object to this MSState instance. */
  _applySiteData(site) {
    this.config = {
      name: site.name || 'Untitled Site',
      slug: site.slug || '',
      template: site.template || 'blank',
      theme: site.config?.theme || 'dark',
      accentColor: site.config?.accentColor || '#00d4ff',
      fontFamily: site.config?.fontFamily || 'Plus Jakarta Sans',
      fontHeading: site.config?.fontHeading || '',
      titleFont: site.config?.titleFont || site.config?.fontHeading || 'Syne',
      contentFont: site.config?.contentFont || site.config?.fontFamily || 'Plus Jakarta Sans',
      titleColor: site.config?.titleColor || '',
      contentColor: site.config?.contentColor || '',
      titleFontSize: site.config?.titleFontSize || '',
      contentFontSize: site.config?.contentFontSize || '',
      logoShape: site.config?.logoShape || 'circle',
      registrationOpen: site.config?.registrationOpen !== false,
      activePalette: site.config?.activePalette || null,
      activeFontPair: site.config?.activeFontPair || null,
      bgOverride: site.config?.bgOverride || null,
      passConfig: site.config?.passConfig || null,
      gaId: site.gaId || site.ga_id || site.config?.gaId || null,
      status: site.status || 'draft',
    };
    this.blocks = (site.config?.blocks || []).map(b => JSON.parse(JSON.stringify(b)));
    this.histIdx = -1;
    this.history = [];
    this._pushHistory();
  },

  /* ── Persist: localStorage (instant) + backend (durable) ── */
  save() {
    // 1. Write to user-scoped localStorage
    const sites = JSON.parse(localStorage.getItem(mss_storageKey()) || '[]');
    const idx = sites.findIndex(s => s.id === this.siteId);
    if (idx < 0) return false;

    const configPayload = {
      theme: this.config.theme,
      accentColor: this.config.accentColor,
      fontFamily: this.config.fontFamily,
      fontHeading: this.config.fontHeading || '',
      titleFont: this.config.titleFont || '',
      contentFont: this.config.contentFont || '',
      titleColor: this.config.titleColor || '',
      contentColor: this.config.contentColor || '',
      titleFontSize: this.config.titleFontSize || '',
      contentFontSize: this.config.contentFontSize || '',
      logoShape: this.config.logoShape,
      registrationOpen: this.config.registrationOpen,
      activePalette: this.config.activePalette || null,
      activeFontPair: this.config.activeFontPair || null,
      bgOverride: this.config.bgOverride || null,
      passConfig: this.config.passConfig || null,
      blocks: this.blocks.map(b => JSON.parse(JSON.stringify(b))),
    };

    sites[idx] = {
      ...sites[idx],
      name: this.config.name,
      slug: this.config.slug,
      status: this.config.status,
      updatedAt: new Date().toISOString(),
      gaId: this.config.gaId || null,
      config: configPayload,
    };
    localStorage.setItem(mss_storageKey(), JSON.stringify(sites));
    this.dirty = false;

    // 2. Async save to backend (fire and forget — errors are non-fatal)
    // 2. Mark that backend needs updating — actual write happens on interval or publish
    this._backendDirty = true;
    this._lastSaveTime = Date.now();

    return true;
  },

  /** POST config to /api/minisite/save — keeps Supabase in sync. */
  async _saveToBackend(configPayload) {
    const token = localStorage.getItem('GalSol_token') || '';
    if (!token) return; // not logged in — skip silently

    const res = await fetch(`${MSS_API}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: this.siteId,
        name: this.config.name,
        slug: this.config.slug,
        status: this.config.status || 'draft',
        gaId: this.config.gaId || null,
        config: configPayload,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error ${res.status}`);
    }
  },

  /* ── Block CRUD ─── */
  addBlock(type, afterId) {
    const def = BLOCK_REG[type];
    if (!def) return null;
    const block = {
      id: 'bl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type,
      props: def.defaults(),
    };
    if (afterId) {
      const idx = this.blocks.findIndex(b => b.id === afterId);
      this.blocks.splice(idx >= 0 ? idx + 1 : this.blocks.length, 0, block);
    } else {
      this.blocks.push(block);
    }
    this.selectedId = block.id;
    this._pushHistory();
    this._notify('add');
    return block;
  },

  removeBlock(id) {
    const idx = this.blocks.findIndex(b => b.id === id);
    this.blocks = this.blocks.filter(b => b.id !== id);
    if (this.selectedId === id) {
      this.selectedId = this.blocks[Math.min(idx, this.blocks.length - 1)]?.id || null;
    }
    this._pushHistory();
    this._notify('remove');
  },

  moveBlock(id, dir) {
    const idx = this.blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const n = idx + dir;
    if (n < 0 || n >= this.blocks.length) return;
    [this.blocks[idx], this.blocks[n]] = [this.blocks[n], this.blocks[idx]];
    this._pushHistory();
    this._notify('move');
  },

  duplicateBlock(id) {
    const idx = this.blocks.findIndex(b => b.id === id);
    if (idx < 0) return null;
    const copy = JSON.parse(JSON.stringify(this.blocks[idx]));
    copy.id = 'bl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this.blocks.splice(idx + 1, 0, copy);
    this.selectedId = copy.id;
    this._pushHistory();
    this._notify('duplicate');
    return copy;
  },

  updateBlock(id, partialProps) {
    const block = this.blocks.find(b => b.id === id);
    if (!block) return;
    Object.assign(block.props, partialProps);
    this.dirty = true;
    this._notify('update');
  },

  updateBlockField(blockId, fieldId, partialFieldProps) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return;
    const field = block.props.fields?.find(f => f.id === fieldId);
    if (!field) return;
    Object.assign(field, partialFieldProps);
    this.dirty = true;
    this._notify('field-update');
  },

  /* ── publish() ─── */
  async publish() {
    this.config.status = 'published';
    this.save(); // also saves to backend via _saveToBackend

    const configPayload = {
      theme: this.config.theme,
      accentColor: this.config.accentColor,
      fontFamily: this.config.fontFamily,
      fontHeading: this.config.fontHeading || '',
      titleFont: this.config.titleFont || '',
      contentFont: this.config.contentFont || '',
      titleColor: this.config.titleColor || '',
      contentColor: this.config.contentColor || '',
      titleFontSize: this.config.titleFontSize || '',
      contentFontSize: this.config.contentFontSize || '',
      logoShape: this.config.logoShape,
      registrationOpen: this.config.registrationOpen !== false,
      activePalette: this.config.activePalette || null,
      activeFontPair: this.config.activeFontPair || null,
      bgOverride: this.config.bgOverride || null,
      passConfig: this.config.passConfig || null,
      blocks: this.blocks.map(b => JSON.parse(JSON.stringify(b))),
    };

    const token = localStorage.getItem('GalSol_token') || '';
    const res = await fetch(`${MSS_API}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        siteId: this.siteId,
        slug: this.config.slug,
        name: this.config.name,
        status: 'published',
        registrationOpen: this.config.registrationOpen !== false,
        gaId: this.config.gaId || null,
        config: configPayload,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error ${res.status}`);
    }

    return await res.json();
  },

  updateConfig(partial) {
    Object.assign(this.config, partial);
    this.dirty = true;
    this._notify('config');
  },

  selectBlock(id) {
    this.selectedId = id === this.selectedId ? this.selectedId : id;
    this._notify('select');
  },

  deselectAll() {
    this.selectedId = null;
    this._notify('select');
  },

  getBlock(id) { return this.blocks.find(b => b.id === id) || null; },
  getSelected() { return this.selectedId ? this.getBlock(this.selectedId) : null; },

  /* ── History ─── */
  _pushHistory() {
    this.history = this.history.slice(0, this.histIdx + 1);
    this.history.push(JSON.stringify({ config: this.config, blocks: this.blocks }));
    if (this.history.length > this.MAX_HIST) this.history.shift();
    else this.histIdx++;
    this.dirty = true;
  },

  undo() { if (!this.canUndo()) return; this.histIdx--; this._applySnapshot(); },
  redo() { if (!this.canRedo()) return; this.histIdx++; this._applySnapshot(); },

  _applySnapshot() {
    try {
      const snap = JSON.parse(this.history[this.histIdx]);
      this.config = snap.config;
      this.blocks = snap.blocks;
      this.dirty = true;
      this._notify('history');
    } catch { }
  },

  canUndo() { return this.histIdx > 0; },
  canRedo() { return this.histIdx < this.history.length - 1; },

  onChange(fn) { this._cb = fn; },
  _notify(type) { if (this._cb) this._cb(type || 'change'); },

  // ADD this method inside MSState, just before the closing };

  /** Force an immediate Supabase write. Called by publish + 5-min interval. */
  async saveToBackendNow() {
    const sites = JSON.parse(localStorage.getItem(mss_storageKey()) || '[]');
    const site = sites.find(s => s.id === this.siteId);
    if (!site) return false;
    try {
      await this._saveToBackend(site.config);
      this._backendDirty = false;
      this._lastBackendSave = Date.now();
      return true;
    } catch (e) {
      console.warn('[MSState] saveToBackendNow failed:', e.message);
      return false;
    }
  },

};

function toggleAiChat() {
  const chatbox = document.getElementById('mseAiChatbox');
  const trigger = document.getElementById('mseAiTrigger');

  if (chatbox.classList.contains('open')) {
    chatbox.classList.remove('open');
    trigger.innerHTML = `<img src="/Images/GalAI%20Logo.svg" alt="Gal AI" style="width:16px;height:16px;vertical-align:middle;"> Ask Gemini <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-left:4px;"><polyline points="18 15 12 9 6 15"/></svg>`;
  } else {
    chatbox.classList.add('open');
    trigger.innerHTML = `Close AI`;
  }
}
