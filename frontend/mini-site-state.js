/* ================================================================
   Honourix — Mini Site Builder  |  mini-site-state.js
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
      bgColor: '#0a0f1e',
    }),
  },

  about: {
    label: 'About', icon: 'file-text', cat: 'structure',
    desc: 'Event description and bio',
    defaults: () => ({
      title: 'About This Event',
      content: 'Write a description of your event here. Tell people what to expect, who should attend, and why they should register.',
      alignment: 'left', bgColor: '',
    }),
  },

  announcements: {
    label: 'Announcements', icon: 'megaphone', cat: 'structure',
    desc: 'Pinned updates and important notices',
    defaults: () => ({
      title: 'Announcements',
      items: [{ id: 'a1', text: 'Registration is now open!', date: '', pinned: true }],
      bgColor: '',
    }),
  },

  datetime: {
    label: 'Date & Venue', icon: 'calendar', cat: 'event',
    desc: 'Event date, time and location',
    defaults: () => ({
      date: '', time: '', endTime: '', timezone: 'IST',
      venueName: '', venueAddress: '', venueType: 'in-person',
      onlineLink: '', mapLink: '', bgColor: '',
    }),
  },

  speakers: {
    label: 'Speakers / Team', icon: 'users', cat: 'event',
    desc: 'Speaker cards with photo, name and bio',
    defaults: () => ({
      title: 'Speakers', layout: 'grid',
      items: [], bgColor: '',
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
    }),
  },

  form: {
    label: 'Registration Form', icon: 'clipboard-list', cat: 'engagement',
    desc: 'Multi-section form linked to Google Sheets',
    defaults: () => ({
      title: 'Register Now',
      subtitle: 'Fill in your details to secure your spot.',
      buttonText: 'Submit Registration',
      buttonColor: '',
      sheetId: '',
      bgColor: '',
      showProgressBar: true,
      successMessage: '',
      sections: [
        {
          id: 'sec_1',
          title: 'Section 1',
          description: '',
          fields: [
            { id: 'f1', type: 'text',  label: 'Full Name',     required: true,  placeholder: 'Enter your full name', description: '' },
            { id: 'f2', type: 'email', label: 'Email Address', required: true,  placeholder: 'you@example.com',      description: '' },
            { id: 'f3', type: 'tel',   label: 'Phone Number',  required: false, placeholder: '+91 XXXXX XXXXX',      description: '' },
          ],
          routing: { type: 'auto', conditionFieldId: null, rules: [], defaultGoTo: 'next' },
        }
      ],
    }),
  },

  documents: {
    label: 'Document Links', icon: 'file-down', cat: 'engagement',
    desc: 'Rule books, brochures, invitations',
    defaults: () => ({
      title: 'Resources',
      items: [], bgColor: '',
    }),
  },

  video: {
    label: 'Video', icon: 'play-circle', cat: 'engagement',
    desc: 'YouTube or Drive videos (max 2)',
    defaults: () => ({
      title: '', items: [], bgColor: '',
    }),
  },

  socials: {
    label: 'Social Links', icon: 'share-2', cat: 'engagement',
    desc: 'Social media icons and follow links',
    defaults: () => ({
      title: 'Follow Us', links: [], bgColor: '',
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
  _cb: null,

  /* ── Boot from URL ?id= ─── */
  init() {
    const params = new URLSearchParams(window.location.search);
    this.siteId = params.get('id');
    if (!this.siteId) { window.location.href = 'mini-site.html'; return false; }

    const sites = JSON.parse(localStorage.getItem('hx_minisites') || '[]');
    const site = sites.find(s => s.id === this.siteId);
    if (!site) { window.location.href = 'mini-site.html'; return false; }

    this.config = {
      name: site.name || 'Untitled Site',
      slug: site.slug || '',
      template: site.template || 'blank',
      theme: site.config?.theme || 'dark',
      accentColor: site.config?.accentColor || '#00d4ff',
      fontFamily: site.config?.fontFamily || 'Plus Jakarta Sans',
      logoShape: site.config?.logoShape || 'circle',
      registrationOpen: site.config?.registrationOpen !== false,
      status: site.status || 'draft',
    };
    this.blocks = (site.config?.blocks || []).map(b => JSON.parse(JSON.stringify(b)));
    this.histIdx = -1;
    this.history = [];
    this._pushHistory();
    return true;
  },

  /* ── Persist to localStorage ─── */
  save() {
    const sites = JSON.parse(localStorage.getItem('hx_minisites') || '[]');
    const idx = sites.findIndex(s => s.id === this.siteId);
    if (idx < 0) return false;
    sites[idx] = {
      ...sites[idx],
      name: this.config.name,
      slug: this.config.slug,
      status: this.config.status,
      updatedAt: new Date().toISOString(),
      config: {
        theme: this.config.theme,
        accentColor: this.config.accentColor,
        fontFamily: this.config.fontFamily,
        logoShape: this.config.logoShape,
        registrationOpen: this.config.registrationOpen,
        blocks: this.blocks.map(b => JSON.parse(JSON.stringify(b))),
      },
    };
    localStorage.setItem('hx_minisites', JSON.stringify(sites));
    this.dirty = false;
    return true;
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
      // Select adjacent block after deletion
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

  /* ── Form-specific deep update helpers ── */

  updateFormField(blockId, sectionId, fieldId, partialProps) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return;
    const sec = block.props.sections?.find(s => s.id === sectionId);
    if (!sec) return;
    const field = sec.fields?.find(f => f.id === fieldId);
    if (!field) return;
    Object.assign(field, partialProps);
    this.dirty = true;
    this._notify('field-update');
  },

  addFormField(blockId, sectionId, fieldType) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return null;
    const sec = block.props.sections?.find(s => s.id === sectionId);
    if (!sec) return null;
    const uid = Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const field = {
      id: `f_${uid}`, type: fieldType,
      label: fieldType === 'section-text' ? 'Instructions' : fieldType === 'divider' ? '' : 'New Question',
      required: false, placeholder: '', description: '',
      ...((['radio','checkbox-group','dropdown','ranking','checkbox','select'].includes(fieldType)) ? { options: ['Option 1', 'Option 2'] } : {}),
      ...(fieldType === 'linear-scale' ? { min: 1, max: 5, minLabel: '', maxLabel: '' } : {}),
      ...(fieldType === 'image-choice' ? { options: [{ label: 'Option 1', imageUrl: '' }] } : {}),
      ...(fieldType === 'file'         ? { accept: '.pdf,.jpg,.png', maxSizeMB: 5 } : {}),
      ...(fieldType === 'section-text' ? { heading: 'Instructions', body: '' } : {}),
      ...(fieldType === 'textarea'     ? { rows: 4 } : {}),
    };
    sec.fields.push(field);
    this._pushHistory();
    this._notify('update');
    return field;
  },

  addFormSection(blockId) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return null;
    const sections = block.props.sections || [];
    const sec = {
      id: `sec_${Date.now()}`,
      title: `Section ${sections.length + 1}`,
      description: '',
      fields: [],
      routing: { type: 'auto', conditionFieldId: null, rules: [], defaultGoTo: 'next' },
    };
    sections.push(sec);
    block.props.sections = sections;
    this._pushHistory();
    this._notify('update');
    return sec;
  },

  updateSectionRouting(blockId, sectionId, routingPartial) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return;
    const sec = block.props.sections?.find(s => s.id === sectionId);
    if (!sec) return;
    Object.assign(sec.routing, routingPartial);
    this.dirty = true;
    this._notify('update');
  },

  removeFormField(blockId, sectionId, fieldId) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return;
    const sec = block.props.sections?.find(s => s.id === sectionId);
    if (!sec) return;
    sec.fields = sec.fields.filter(f => f.id !== fieldId);
    this._pushHistory();
    this._notify('update');
  },

  removeFormSection(blockId, sectionId) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return;
    block.props.sections = (block.props.sections || []).filter(s => s.id !== sectionId);
    this._pushHistory();
    this._notify('update');
  },

  /**
   * updateBlockField — surgically updates a single field inside block.props.fields[].
   * Unlike updateBlock which shallow-merges at the props root level,
   * this targets a specific field object by its id.
   * Notifies 'field-update' so onChange can refresh BOTH canvas AND right panel
   * (needed so toggles like "Required" reflect the new state immediately).
   */
  updateBlockField(blockId, fieldId, partialFieldProps) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return;
    const field = block.props.fields?.find(f => f.id === fieldId);
    if (!field) return;
    Object.assign(field, partialFieldProps);
    this.dirty = true;
    this._notify('field-update'); // distinct type → editor rebuilds right panel
  },

  /**
   * publish() — saves to localStorage then POSTs to backend.
   * Returns { success, slug, publicUrl } from server.
   * Throws on network/server error so editor can show a toast.
   */
  async publish() {
    // 1. Persist to localStorage with live status
    this.config.status = 'published';
    this.save();

    // 2. POST to backend
    const payload = {
      siteId: this.siteId,
      slug: this.config.slug,
      name: this.config.name,
      status: 'published',
      registrationOpen: this.config.registrationOpen !== false,
      config: {
        theme: this.config.theme,
        accentColor: this.config.accentColor,
        fontFamily: this.config.fontFamily,
        logoShape: this.config.logoShape,
        registrationOpen: this.config.registrationOpen !== false,
        blocks: this.blocks.map(b => JSON.parse(JSON.stringify(b))),
      },
    };

    const token = localStorage.getItem('Honourix_token') || '';
    const res = await fetch(
      'https://certiflow-backend-73xk.onrender.com/api/minisite/publish',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error ${res.status}`);
    }

    return await res.json(); // { success, slug, publicUrl }
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

  getBlock(id) {
    return this.blocks.find(b => b.id === id) || null;
  },

  getSelected() {
    return this.selectedId ? this.getBlock(this.selectedId) : null;
  },

  /* ── History ─── */
  _pushHistory() {
    this.history = this.history.slice(0, this.histIdx + 1);
    this.history.push(JSON.stringify({ config: this.config, blocks: this.blocks }));
    if (this.history.length > this.MAX_HIST) this.history.shift();
    else this.histIdx++;
    this.dirty = true;
  },

  undo() {
    if (!this.canUndo()) return;
    this.histIdx--;
    this._applySnapshot();
  },

  redo() {
    if (!this.canRedo()) return;
    this.histIdx++;
    this._applySnapshot();
  },

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

  /* ── Event system ─── */
  onChange(fn) { this._cb = fn; },
  _notify(type) { if (this._cb) this._cb(type || 'change'); },
};