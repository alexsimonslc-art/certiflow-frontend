/* ================================================================
   Honourix — Mini Site Builder  |  mini-site-form.js
   Batch 5 — Client-side form handler for the PUBLIC site page.
   Loaded only in site.html, not in the editor.

   Features:
   · Per-field validation with inline error messages
   · Honeypot anti-spam field (invisible to humans)
   · Loading → success / error states on the submit button
   · Retry on network failure (up to 2 retries)
   · Duplicate submission guard (localStorage fingerprint)
   · Fully accessible (aria-invalid, aria-describedby)
   · Works with data-ms-form + data-ms-site attributes
================================================================ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────────────────────────── */
  const API_BASE = 'https://certiflow-backend-73xk.onrender.com';
  const SUBMIT_PATH = '/api/minisite/submit';
  const STORAGE_KEY = 'hx_ms_submitted';   // localStorage key for dedup
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1200;                 // ms

  /* ─────────────────────────────────────────────────────────────
     UTILS
  ───────────────────────────────────────────────────────────── */

  /** Read siteId + sheetId from data attributes on the form. */
  function getMeta(form) {
    return {
      siteId: form.dataset.msSite || window.__MS_SITE_ID || '',
      sheetId: form.dataset.msForm || '',
      slug: window.__MS_SLUG || '',
    };
  }

  /** Build a submission fingerprint to prevent duplicates. */
  function buildFingerprint(siteId, data) {
    const str = siteId + '::' + (data.email || data.Email || '') + '::' + (data.phone || data.Phone || '');
    return btoa(unescape(encodeURIComponent(str))).slice(0, 32);
  }

  /** Check if this device already submitted for this site. */
  function alreadySubmitted(fp) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return !!stored[fp];
    } catch { return false; }
  }

  /** Mark a fingerprint as submitted. */
  function markSubmitted(fp) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      stored[fp] = Date.now();
      // Keep storage clean — only last 20 entries
      const keys = Object.keys(stored);
      if (keys.length > 20) delete stored[keys[0]];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch { }
  }

  /** Sleep helper for retry delay. */
  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  /* ─────────────────────────────────────────────────────────────
     FIELD VALIDATION
  ───────────────────────────────────────────────────────────── */
  const VALIDATORS = {
    email(val) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
        ? null : 'Please enter a valid email address.';
    },
    tel(val) {
      if (!val) return null;
      return /^[+\d\s\-().]{7,15}$/.test(val)
        ? null : 'Please enter a valid phone number.';
    },
    url(val) {
      if (!val) return null;
      try { new URL(val); return null; }
      catch { return 'Please enter a valid URL (https://…).'; }
    },
    number(val) {
      return isNaN(Number(val)) ? 'Please enter a valid number.' : null;
    },
  };

  /**
   * Validate all fields in the form.
   * Returns { valid: bool, errors: { fieldId: message } }
   */
  function validateForm(form) {
    const errors = {};
    const inputs = form.querySelectorAll('[name]:not([name="hp_field"])');
    inputs.forEach(el => {
      const name = el.name;
      const val = el.value.trim();
      const type = el.type || el.tagName.toLowerCase();

      // Required check
      if (el.required || el.dataset.required === 'true') {
        if (type === 'checkbox' && !el.checked) {
          errors[name] = 'This field is required.';
          return;
        }
        if (type !== 'checkbox' && !val) {
          errors[name] = 'This field is required.';
          return;
        }
      }

      // Type-specific validation (only if value is non-empty)
      if (val && VALIDATORS[type]) {
        const msg = VALIDATORS[type](val);
        if (msg) errors[name] = msg;
      }
    });

    return { valid: Object.keys(errors).length === 0, errors };
  }

  /** Show / clear inline error messages on fields. */
  function renderErrors(form, errors) {
    // Clear previous errors
    form.querySelectorAll('.ms-field-error').forEach(el => el.remove());
    form.querySelectorAll('[aria-invalid]').forEach(el => {
      el.removeAttribute('aria-invalid');
      el.style.borderColor = '';
    });

    Object.entries(errors).forEach(([name, msg]) => {
      const field = form.querySelector(`[name="${name}"]`);
      if (!field) return;

      field.setAttribute('aria-invalid', 'true');
      field.style.borderColor = '#f43f5e';
      field.style.boxShadow = '0 0 0 3px rgba(244,63,94,0.12)';

      const errEl = document.createElement('div');
      errEl.className = 'ms-field-error';
      errEl.textContent = msg;
      errEl.style.cssText = 'font-size:12px;color:#f43f5e;margin-top:4px;font-weight:500';
      errEl.setAttribute('role', 'alert');

      const id = 'err_' + name;
      errEl.id = id;
      field.setAttribute('aria-describedby', id);

      // Insert after the field (or its parent label for checkboxes)
      const target = field.closest('label') || field;
      target.parentNode?.insertBefore(errEl, target.nextSibling);
    });

    // Scroll first error into view
    const firstError = form.querySelector('[aria-invalid="true"]');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstError.focus();
    }
  }

  /* ─────────────────────────────────────────────────────────────
     BUTTON STATE MACHINE
  ───────────────────────────────────────────────────────────── */
  function setButtonState(btn, state, config = {}) {
    const accent = config.accent || '#00d4ff';
    const [ar, ag, ab] = hexRgb(accent);

    switch (state) {
      case 'idle':
        btn.disabled = false;
        btn.innerHTML = config.label || 'Submit Registration';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.background = accent;
        break;

      case 'loading':
        btn.disabled = true;
        btn.style.opacity = '0.85';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:9px">
          <span style="width:16px;height:16px;border:2.5px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:msfSpin 0.7s linear infinite;display:inline-block"></span>
          Submitting…
        </span>`;
        break;

      case 'success':
        btn.disabled = true;
        btn.style.background = '#10b981';
        btn.style.boxShadow = '0 4px 24px rgba(16,185,129,0.35)';
        btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" style="width:16px;height:16px"><polyline points="20 6 9 17 4 12"/></svg>
          Registered!
        </span>`;
        break;

      case 'error':
        btn.disabled = false;
        btn.style.background = '#f43f5e';
        btn.style.boxShadow = '0 4px 24px rgba(244,63,94,0.3)';
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';
        btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" style="width:15px;height:15px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ${config.errorLabel || 'Try Again'}
        </span>`;
        setTimeout(() => setButtonState(btn, 'idle', config), 3500);
        break;

      case 'duplicate':
        btn.disabled = true;
        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.color = 'rgba(255,255,255,0.4)';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = 'Already Registered';
        break;
    }
  }

  function hexRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#00d4ff');
    return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [0, 212, 255];
  }

  /* ─────────────────────────────────────────────────────────────
     SUCCESS STATE — replace form with a thank-you card
  ───────────────────────────────────────────────────────────── */
  function showSuccessCard(form, config = {}) {
    const accent = config.accent || '#00d4ff';
    const [ar, ag, ab] = hexRgb(accent);
    const message = config.successMessage ||
      'Your registration has been received. We\'ll be in touch soon!';

    form.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    form.style.opacity = '0';
    form.style.transform = 'translateY(8px)';

    setTimeout(() => {
      form.innerHTML = `
<div style="text-align:center;padding:40px 24px;animation:msfFadeUp 0.4s ease both">
  <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,${accent},rgba(${ar},${ag},${ab},0.5));display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 0 40px rgba(${ar},${ag},${ab},0.3)">
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" style="width:28px;height:28px"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
  <h3 style="margin:0 0 10px;font-size:20px;font-weight:700;color:inherit;font-family:inherit">You're registered! 🎉</h3>
  <p style="margin:0;font-size:15px;opacity:0.65;line-height:1.65;max-width:360px;margin:0 auto">${message}</p>
  ${config.shareUrl ? `
  <div style="margin-top:24px;display:flex;align-items:center;justify-content:center;gap:10px">
    <span style="font-size:13px;opacity:0.5">Share this event:</span>
    <button onclick="navigator.clipboard.writeText('${config.shareUrl}').then(()=>this.textContent='Copied!')" style="padding:7px 14px;border-radius:7px;background:rgba(${ar},${ag},${ab},0.12);border:1px solid rgba(${ar},${ag},${ab},0.25);color:${accent};font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Copy Link</button>
  </div>` : ''}
</div>`;
      form.style.opacity = '1';
      form.style.transform = 'translateY(0)';
    }, 300);
  }

  /* ─────────────────────────────────────────────────────────────
     NETWORK SUBMIT WITH RETRY
  ───────────────────────────────────────────────────────────── */
  async function submitWithRetry(payload, attempt = 0) {
    try {
      const res = await fetch(`${API_BASE}${SUBMIT_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY * (attempt + 1));
        return submitWithRetry(payload, attempt + 1);
      }
      throw err;
    }
  }

  /* ─────────────────────────────────────────────────────────────
     INJECT GLOBAL STYLES
  ───────────────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('ms-form-styles')) return;
    const style = document.createElement('style');
    style.id = 'ms-form-styles';
    style.textContent = `
@keyframes msfSpin   { to { transform: rotate(360deg); } }
@keyframes msfFadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
.ms-form-banner {
  padding: 14px 18px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.55;
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.ms-form-banner.error   { background: rgba(244,63,94,0.09);  border: 1px solid rgba(244,63,94,0.25);  color: #fca5a5; }
.ms-form-banner.success { background: rgba(16,185,129,0.09); border: 1px solid rgba(16,185,129,0.25); color: #6ee7b7; }
.ms-form-banner.info    { background: rgba(0,212,255,0.07);  border: 1px solid rgba(0,212,255,0.2);   color: #a5f3fc; }
[aria-invalid="true"] { border-color: #f43f5e !important; box-shadow: 0 0 0 3px rgba(244,63,94,0.12) !important; }
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--ms-accent, #00d4ff) !important;
  box-shadow: 0 0 0 3px rgba(var(--ms-accent-rgb, 0,212,255), 0.12) !important;
}
`;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER BANNER (top of form)
  ───────────────────────────────────────────────────────────── */
  function showBanner(form, type, message) {
    let banner = form.querySelector('.ms-form-banner');
    if (!banner) {
      banner = document.createElement('div');
      form.insertBefore(banner, form.firstChild);
    }
    const icons = {
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;margin-top:1px"><polyline points="20 6 9 17 4 12"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };
    banner.className = `ms-form-banner ${type}`;
    banner.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
  }

  function removeBanner(form) {
    form.querySelector('.ms-form-banner')?.remove();
  }

  /* ─────────────────────────────────────────────────────────────
     MAIN: bindForm — wire a single form element
  ───────────────────────────────────────────────────────────── */
  function bindForm(form) {
    if (form.dataset.msBound) return;
    form.dataset.msBound = '1';

    const meta = getMeta(form);
    const btn = form.querySelector('[type="submit"]');
    const accent = window.__MS_ACCENT || '#00d4ff';
    const btnConfig = {
      accent,
      label: btn?.textContent?.trim() || 'Submit Registration',
      successMessage: form.dataset.msSuccessMsg || window.__MS_SUCCESS_MSG || '',
      shareUrl: window.__MS_SHARE_URL || '',
    };

    // Inject honeypot (hidden anti-spam field)
    const hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'hp_field';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.style.cssText = 'position:absolute;left:-9999px;opacity:0;pointer-events:none;height:0;width:0';
    hp.setAttribute('aria-hidden', 'true');
    form.appendChild(hp);

    // Real-time validation: clear error on field change
    form.querySelectorAll('[name]:not([name="hp_field"])').forEach(el => {
      el.addEventListener('input', () => {
        el.removeAttribute('aria-invalid');
        el.style.borderColor = '';
        el.style.boxShadow = '';
        const errEl = document.getElementById(`err_${el.name}`);
        if (errEl) errEl.remove();
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!btn) return;

      removeBanner(form);

      // ── Honeypot check
      if (form.querySelector('[name="hp_field"]')?.value) {
        // Silently do nothing — bot filled the honeypot
        setButtonState(btn, 'success', btnConfig);
        return;
      }

      // ── Client-side validation
      const { valid, errors } = validateForm(form);
      if (!valid) {
        renderErrors(form, errors);
        showBanner(form, 'error', 'Please fix the highlighted fields above.');
        return;
      }

      // ── Collect data
      const formData = new FormData(form);
      const data = {};
      formData.forEach((val, key) => {
        if (key === 'hp_field') return;
        // Merge multiple checkboxes with same name
        if (data[key]) {
          data[key] = Array.isArray(data[key]) ? [...data[key], val] : [data[key], val];
        } else {
          data[key] = val;
        }
      });

      // ── Duplicate check
      const fp = buildFingerprint(meta.siteId, data);
      if (alreadySubmitted(fp)) {
        setButtonState(btn, 'duplicate', btnConfig);
        showBanner(form, 'info', 'It looks like you\'ve already registered from this device.');
        return;
      }

      // ── Submit
      setButtonState(btn, 'loading', btnConfig);

      const payload = {
        siteId: meta.siteId,
        sheetId: meta.sheetId,
        slug: meta.slug,
        data,
        submittedAt: new Date().toISOString(),
        userAgent: navigator.userAgent.slice(0, 120),
      };

      try {
        await submitWithRetry(payload);
        markSubmitted(fp);
        setButtonState(btn, 'success', btnConfig);
        showSuccessCard(form, btnConfig);
      } catch (err) {
        console.error('[Honourix Form] Submit failed:', err.message);
        setButtonState(btn, 'error', {
          ...btnConfig,
          errorLabel: 'Network error — retry',
        });
        showBanner(form, 'error',
          'Submission failed. Please check your connection and try again.');
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     BOOT: bind all forms on the page
  ───────────────────────────────────────────────────────────── */
  function boot() {
    injectStyles();
    document.querySelectorAll('[data-ms-form]').forEach(bindForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose for manual use in site.html if needed
  window.MSForm = { bind: bindForm, boot };

})();