/* ================================================================
   Honourix — HX Forms  |  hx-form-state.js
   Form builder state · localStorage · Supabase sync
   Same save architecture as mini-site-state.js:
     · Every change → localStorage instantly  (undo/redo smooth)
     · Supabase      → every 5 minutes OR on publish
================================================================ */

const HXF_API = 'https://certiflow-backend-73xk.onrender.com/api/hxforms';

/* ── User identity (read JWT from localStorage) ─────────────────── */
function hxf_getUserId() {
  try {
    const token = localStorage.getItem('Honourix_token');
    if (!token) return 'anon';
    return JSON.parse(atob(token.split('.')[1])).googleId || 'anon';
  } catch { return 'anon'; }
}

function hxf_getToken() {
  return localStorage.getItem('Honourix_token') || '';
}

function hxf_storageKey() {
  return 'hx_forms_' + hxf_getUserId();
}

/* ── Default field templates ────────────────────────────────────── */
const HXF_FIELD_DEFAULTS = {
  text:          () => ({ label: 'Short Answer',    placeholder: 'Your answer',          required: false, validation: {} }),
  textarea:      () => ({ label: 'Paragraph',        placeholder: 'Write your answer…',   required: false, validation: {} }),
  email:         () => ({ label: 'Email Address',    placeholder: 'you@example.com',      required: true,  validation: {} }),
  phone:         () => ({ label: 'Phone Number',     placeholder: '+91 98765 43210',      required: false, validation: {} }),
  number:        () => ({ label: 'Number',           placeholder: '0',                    required: false, validation: { min: null, max: null } }),
  dropdown:      () => ({ label: 'Dropdown',         placeholder: 'Select an option',     required: false, options: ['Option 1', 'Option 2', 'Option 3'] }),
  radio:         () => ({ label: 'Multiple Choice',  placeholder: '',                     required: false, options: ['Option 1', 'Option 2', 'Option 3'] }),
  checkbox:      () => ({ label: 'Checkboxes',       placeholder: '',                     required: false, options: ['Option 1', 'Option 2'] }),
  date:          () => ({ label: 'Date',             placeholder: '',                     required: false, validation: {} }),
  time:          () => ({ label: 'Time',             placeholder: '',                     required: false, validation: {} }),
  file_upload:   () => ({ label: 'File Upload',      placeholder: 'Upload a file',        required: false, accept: '*', maxMB: 10 }),
  linear_scale:  () => ({ label: 'Rating',           placeholder: '',                     required: false, min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent', style: 'stars' }),
  section_break: () => ({ label: 'Section Title',    description: 'Add a description for this section.', required: false }),
};

/* ── Form config templates ──────────────────────────────────────── */
const HXF_TEMPLATES = {

  blank: {
    label: 'Blank Form', icon: 'file-plus', color: 'cyan',
    config: () => ({
      fields: [],
      settings: {
        title: 'Untitled Form', description: '',
        submitLabel: 'Submit', successMessage: 'Thank you for your response!',
        redirectUrl: '', closeDate: null, maxSubmissions: null, allowMultiple: false,
      },
      theme: { color: 'cyan', bg: 'dark', font: 'jakarta' },
    }),
  },

  event_registration: {
    label: 'Event Registration', icon: 'calendar', color: 'purple',
    config: () => ({
      fields: [
        { id: hxf_uid(), type: 'text',     ...HXF_FIELD_DEFAULTS.text(),     label: 'Full Name',         required: true },
        { id: hxf_uid(), type: 'email',    ...HXF_FIELD_DEFAULTS.email(),    label: 'Email Address',     required: true },
        { id: hxf_uid(), type: 'phone',    ...HXF_FIELD_DEFAULTS.phone(),    label: 'Phone Number',      required: false },
        { id: hxf_uid(), type: 'text',     ...HXF_FIELD_DEFAULTS.text(),     label: 'College / Organisation', placeholder: 'Enter your institution name', required: true },
        { id: hxf_uid(), type: 'dropdown', ...HXF_FIELD_DEFAULTS.dropdown(), label: 'Department / Stream', options: ['CSE', 'ECE', 'Mechanical', 'Civil', 'MBA', 'Other'], required: false },
        { id: hxf_uid(), type: 'number',   ...HXF_FIELD_DEFAULTS.number(),   label: 'Year of Study',     placeholder: '1', validation: { min: 1, max: 6 }, required: false },
      ],
      settings: {
        title: 'Event Registration', description: 'Fill in your details to register for the event.',
        submitLabel: 'Register Now', successMessage: "You're registered! We'll send a confirmation to your email.",
        redirectUrl: '', closeDate: null, maxSubmissions: null, allowMultiple: false,
      },
      theme: { color: 'cyan', bg: 'dark', font: 'jakarta' },
    }),
  },

  workshop: {
    label: 'Workshop Registration', icon: 'book-open', color: 'green',
    config: () => ({
      fields: [
        { id: hxf_uid(), type: 'text',     ...HXF_FIELD_DEFAULTS.text(),     label: 'Full Name',         required: true },
        { id: hxf_uid(), type: 'email',    ...HXF_FIELD_DEFAULTS.email(),    label: 'Email Address',     required: true },
        { id: hxf_uid(), type: 'phone',    ...HXF_FIELD_DEFAULTS.phone(),    label: 'Phone Number',      required: false },
        { id: hxf_uid(), type: 'text',     ...HXF_FIELD_DEFAULTS.text(),     label: 'College / Organisation', placeholder: 'Enter your institution name', required: true },
        { id: hxf_uid(), type: 'dropdown', ...HXF_FIELD_DEFAULTS.dropdown(), label: 'Department',        options: ['CSE', 'ECE', 'Mechanical', 'Civil', 'MBA', 'Other'], required: false },
        { id: hxf_uid(), type: 'textarea', ...HXF_FIELD_DEFAULTS.textarea(), label: 'Why do you want to attend?', placeholder: 'Tell us in a few words…', required: false },
        { id: hxf_uid(), type: 'radio',    ...HXF_FIELD_DEFAULTS.radio(),    label: 'Experience Level',  options: ['Beginner', 'Intermediate', 'Advanced'], required: true },
      ],
      settings: {
        title: 'Workshop Registration', description: 'Register your spot for the workshop.',
        submitLabel: 'Register', successMessage: 'Registered! Check your email for details.',
        redirectUrl: '', closeDate: null, maxSubmissions: null, allowMultiple: false,
      },
      theme: { color: 'green', bg: 'dark', font: 'jakarta' },
    }),
  },

  feedback: {
    label: 'Event Feedback', icon: 'message-square', color: 'gold',
    config: () => ({
      fields: [
        { id: hxf_uid(), type: 'linear_scale', ...HXF_FIELD_DEFAULTS.linear_scale(), label: 'Overall Experience',      min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent', style: 'stars', required: true },
        { id: hxf_uid(), type: 'linear_scale', ...HXF_FIELD_DEFAULTS.linear_scale(), label: 'Content Quality',          min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent', style: 'stars', required: true },
        { id: hxf_uid(), type: 'linear_scale', ...HXF_FIELD_DEFAULTS.linear_scale(), label: 'Speaker / Presenter',      min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent', style: 'stars', required: false },
        { id: hxf_uid(), type: 'textarea',     ...HXF_FIELD_DEFAULTS.textarea(),     label: 'What did you like most?', placeholder: 'Share your highlights…', required: false },
        { id: hxf_uid(), type: 'textarea',     ...HXF_FIELD_DEFAULTS.textarea(),     label: 'What could be improved?', placeholder: 'Your suggestions…', required: false },
        { id: hxf_uid(), type: 'radio',        ...HXF_FIELD_DEFAULTS.radio(),        label: 'Would you recommend this event?', options: ['Definitely yes', 'Probably yes', 'Not sure', 'No'], required: false },
        { id: hxf_uid(), type: 'email',        ...HXF_FIELD_DEFAULTS.email(),        label: 'Email (optional)',        required: false },
      ],
      settings: {
        title: 'Event Feedback', description: 'We value your feedback. This will only take 2 minutes.',
        submitLabel: 'Submit Feedback', successMessage: 'Thank you! Your feedback means a lot to us.',
        redirectUrl: '', closeDate: null, maxSubmissions: null, allowMultiple: true,
      },
      theme: { color: 'gold', bg: 'dark', font: 'jakarta' },
    }),
  },

  rsvp: {
    label: 'RSVP', icon: 'check-circle', color: 'green',
    config: () => ({
      fields: [
        { id: hxf_uid(), type: 'text',     ...HXF_FIELD_DEFAULTS.text(),     label: 'Full Name',       required: true },
        { id: hxf_uid(), type: 'email',    ...HXF_FIELD_DEFAULTS.email(),    label: 'Email Address',   required: true },
        { id: hxf_uid(), type: 'radio',    ...HXF_FIELD_DEFAULTS.radio(),    label: 'Will you attend?', options: ['Yes, I will attend', 'No, I cannot attend', 'Maybe'], required: true },
        { id: hxf_uid(), type: 'number',   ...HXF_FIELD_DEFAULTS.number(),   label: 'Number of guests (including yourself)', placeholder: '1', validation: { min: 1, max: 10 }, required: false },
        { id: hxf_uid(), type: 'textarea', ...HXF_FIELD_DEFAULTS.textarea(), label: 'Any message for us?', placeholder: 'Optional', required: false },
      ],
      settings: {
        title: 'RSVP', description: 'Let us know if you are coming.',
        submitLabel: 'Send RSVP', successMessage: 'Got it! We look forward to seeing you.',
        redirectUrl: '', closeDate: null, maxSubmissions: null, allowMultiple: false,
      },
      theme: { color: 'green', bg: 'dark', font: 'jakarta' },
    }),
  },

};

/* ── Tiny unique ID ─────────────────────────────────────────────── */
function hxf_uid() {
  return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ================================================================
   HXFState — per-form builder state object
   Usage:
     const state = Object.create(HXFState);
     await state.init(formId);   // null = new form
================================================================ */
const HXFState = {

  formId:          null,
  name:            'Untitled Form',
  slug:            '',
  status:          'draft',
  config:          null,   // { fields, settings, theme }
  dirty:           false,
  _backendDirty:   false,
  _lastSaveTime:   null,
  _lastBackendSave: null,
  _interval:       null,

  /* ── init ──────────────────────────────────────────────────── */
  async init(formId) {
    this.formId = formId || null;

    if (!formId) {
      // New form — start blank
      this.config = HXF_TEMPLATES.blank.config();
      this.name   = 'Untitled Form';
      this.status = 'draft';
      this._startInterval();
      return true;
    }

    // Load from localStorage first (instant)
    const forms = this._loadLocal();
    const local = forms.find(f => f.id === formId);
    if (local) {
      this._applyForm(local);
      this._startInterval();
      // Sync from backend in background
      this._fetchFromBackend(formId).catch(() => {});
      return true;
    }

    // Not in localStorage — fetch from backend (new device)
    try {
      const data = await this._fetchFromBackend(formId);
      if (data) {
        this._applyForm(data);
        this._startInterval();
        return true;
      }
    } catch (e) {
      console.warn('[HXFState] init fetch failed:', e.message);
    }

    return false; // form not found
  },

  /* ── _applyForm ─────────────────────────────────────────────── */
  _applyForm(form) {
    this.formId = form.id;
    this.name   = form.name;
    this.slug   = form.slug;
    this.status = form.status || 'draft';
    this.config = form.config || HXF_TEMPLATES.blank.config();
  },

  /* ── save (localStorage instant, Supabase flagged) ─────────── */
  save() {
    if (!this.config) return;
    const forms = this._loadLocal();
    const idx   = this.formId ? forms.findIndex(f => f.id === this.formId) : -1;
    const entry = {
      id:         this.formId,
      name:       this.name,
      slug:       this.slug,
      status:     this.status,
      config:     this.config,
      updated_at: new Date().toISOString(),
    };
    if (idx > -1) forms[idx] = entry;
    else forms.unshift(entry);
    localStorage.setItem(hxf_storageKey(), JSON.stringify(forms));
    this.dirty        = false;
    this._backendDirty = true;
    this._lastSaveTime = Date.now();
  },

  /* ── saveToBackendNow (called by interval + publish) ────────── */
  async saveToBackendNow() {
    if (!this.config) return false;
    try {
      const res = await fetch(`${HXF_API}/save`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + hxf_getToken() },
        body:    JSON.stringify({
          id:     this.formId,
          name:   this.name,
          slug:   this.slug,
          config: this.config,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.status);
      const data = await res.json();
      // If this was a new form, capture the generated ID and slug
      if (data.form?.id && !this.formId) {
        this.formId = data.form.id;
        this.slug   = data.form.slug;
        this.save(); // re-save locally with the real ID
      }
      this._backendDirty   = false;
      this._lastBackendSave = Date.now();
      return true;
    } catch (e) {
      console.warn('[HXFState] saveToBackendNow failed:', e.message);
      return false;
    }
  },

  /* ── publish ────────────────────────────────────────────────── */
  async publish() {
    if (!this.formId) {
      // Must save first to get a real ID
      const saved = await this.saveToBackendNow();
      if (!saved || !this.formId) throw new Error('Could not save form before publishing.');
    } else {
      await this.saveToBackendNow();
    }
    const res = await fetch(`${HXF_API}/publish/${this.formId}`, {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + hxf_getToken() },
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Publish failed');
    const data = await res.json();
    this.status = 'published';
    this.save(); // sync status to localStorage
    return data; // { ok, form, publicUrl }
  },

  /* ── close ──────────────────────────────────────────────────── */
  async close() {
    const res = await fetch(`${HXF_API}/close/${this.formId}`, {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + hxf_getToken() },
    });
    if (!res.ok) throw new Error('Close failed');
    this.status = 'closed';
    this.save();
  },

  /* ── reopen ─────────────────────────────────────────────────── */
  async reopen() {
    const res = await fetch(`${HXF_API}/reopen/${this.formId}`, {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + hxf_getToken() },
    });
    if (!res.ok) throw new Error('Reopen failed');
    this.status = 'published';
    this.save();
  },

  /* ── Field helpers ──────────────────────────────────────────── */
  addField(type) {
    const defaults = HXF_FIELD_DEFAULTS[type];
    if (!defaults) return null;
    const field = { id: hxf_uid(), type, ...defaults() };
    this.config.fields.push(field);
    this.dirty = true;
    this.save();
    return field;
  },

  updateField(fieldId, changes) {
    const idx = this.config.fields.findIndex(f => f.id === fieldId);
    if (idx === -1) return;
    this.config.fields[idx] = { ...this.config.fields[idx], ...changes };
    this.dirty = true;
    this.save();
  },

  deleteField(fieldId) {
    this.config.fields = this.config.fields.filter(f => f.id !== fieldId);
    // Also remove any conditional rules referencing this field
    this.config.fields.forEach(f => {
      if (f.conditions) {
        f.conditions = f.conditions.filter(c => c.fieldId !== fieldId);
      }
    });
    this.dirty = true;
    this.save();
  },

  moveField(fieldId, direction) {
    const idx = this.config.fields.findIndex(f => f.id === fieldId);
    if (idx === -1) return;
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= this.config.fields.length) return;
    [this.config.fields[idx], this.config.fields[swap]] =
    [this.config.fields[swap], this.config.fields[idx]];
    this.dirty = true;
    this.save();
  },

  duplicateField(fieldId) {
    const field = this.config.fields.find(f => f.id === fieldId);
    if (!field) return null;
    const copy = { ...JSON.parse(JSON.stringify(field)), id: hxf_uid() };
    const idx  = this.config.fields.findIndex(f => f.id === fieldId);
    this.config.fields.splice(idx + 1, 0, copy);
    this.dirty = true;
    this.save();
    return copy;
  },

  /* ── Settings helpers ───────────────────────────────────────── */
  updateSettings(changes) {
    this.config.settings = { ...this.config.settings, ...changes };
    this.dirty = true;
    this.save();
  },

  updateTheme(changes) {
    this.config.theme = { ...this.config.theme, ...changes };
    this.dirty = true;
    this.save();
  },

  /* ── Private: localStorage read ────────────────────────────── */
  _loadLocal() {
    try { return JSON.parse(localStorage.getItem(hxf_storageKey()) || '[]'); }
    catch { return []; }
  },

  /* ── Private: fetch from backend ───────────────────────────── */
  async _fetchFromBackend(formId) {
    const res = await fetch(`${HXF_API}/get/${formId}`, {
      headers: { 'Authorization': 'Bearer ' + hxf_getToken() },
    });
    if (!res.ok) return null;
    const data  = await res.json();
    const form  = data.form;
    if (!form) return null;
    // Merge into localStorage
    const forms = this._loadLocal();
    const idx   = forms.findIndex(f => f.id === form.id);
    if (idx > -1) forms[idx] = form; else forms.unshift(form);
    localStorage.setItem(hxf_storageKey(), JSON.stringify(forms));
    return form;
  },

  /* ── Private: 5-min backend sync interval ───────────────────── */
  _startInterval() {
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(async () => {
      if (this._backendDirty) await this.saveToBackendNow();
    }, 5 * 60 * 1000);
  },

  destroy() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  },
};