/* ================================================================
   Honourix — Mini Site  |  mini-site-form.js
   Multi-section form engine with conditional routing.
   Runs only in site.html (public visitor page).
================================================================ */
(function () {
  'use strict';

  const API_BASE    = 'https://certiflow-backend-73xk.onrender.com';
  const SUBMIT_PATH = '/api/minisite/submit';
  const STORAGE_KEY = 'hx_ms_submitted';
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1200;

  /* ─── Per-form state ────────────────────────────────────────── */
  const formStates = new WeakMap();

  /* ─── Utilities ─────────────────────────────────────────────── */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function alreadySubmitted(fp) {
    try { return !!JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')[fp]; }
    catch { return false; }
  }
  function markSubmitted(fp) {
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      d[fp] = Date.now();
      const keys = Object.keys(d); if (keys.length > 20) delete d[keys[0]];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch {}
  }
  function buildFingerprint(siteId, data) {
    const str = siteId + '::' + (data['Email Address'] || data.email || '') + '::' + (data['Phone Number'] || '');
    try { return btoa(unescape(encodeURIComponent(str))).slice(0, 32); } catch { return str.slice(0, 32); }
  }

  async function postWithRetry(payload, attempt = 0) {
    const res = await fetch(`${API_BASE}${SUBMIT_PATH}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY * (attempt + 1)); return postWithRetry(payload, attempt + 1); }
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  /* ─── File → base64 ─────────────────────────────────────────── */
  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('File read failed'));
      r.readAsDataURL(file);
    });
  }

  /* ─── Global style injection ─────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('msf-styles')) return;
    const s = document.createElement('style');
    s.id = 'msf-styles';
    s.textContent = `
@keyframes msf-spin { to { transform:rotate(360deg); } }
@keyframes msf-slide-in-right  { from { transform:translateX(60px);  opacity:0; } to { transform:translateX(0); opacity:1; } }
@keyframes msf-slide-in-left   { from { transform:translateX(-60px); opacity:0; } to { transform:translateX(0); opacity:1; } }
@keyframes msf-slide-out-left  { from { transform:translateX(0); opacity:1; } to { transform:translateX(-60px); opacity:0; } }
@keyframes msf-slide-out-right { from { transform:translateX(0); opacity:1; } to { transform:translateX(60px);  opacity:0; } }
.msf-section-anim-in-right  { animation: msf-slide-in-right  0.28s ease both; }
.msf-section-anim-in-left   { animation: msf-slide-in-left   0.28s ease both; }
.msf-field-error { font-size:12px; color:#f43f5e; margin-top:4px; font-weight:500; }
[aria-invalid="true"] { border-color:#f43f5e !important; box-shadow:0 0 0 3px rgba(244,63,94,0.12) !important; }
.msf-rating { display:flex; gap:6px; }
.msf-rating-star { width:32px; height:32px; cursor:pointer; color:rgba(255,255,255,0.2); transition:color 0.15s; font-size:24px; }
.msf-rating-star.active { color:#f59e0b; }
.msf-scale-row { display:flex; gap:6px; flex-wrap:wrap; }
.msf-scale-btn { min-width:38px; height:38px; border-radius:8px; border:1.5px solid; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.15s; background:transparent; }
.msf-scale-btn.selected { color:#fff !important; }
`;
    document.head.appendChild(s);
  }

  /* ─── VALIDATORS ─────────────────────────────────────────────── */
  const VALIDATORS = {
    email(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Please enter a valid email address.'; },
    tel(v) { if (!v) return null; return /^[+\d\s\-().]{7,20}$/.test(v) ? null : 'Please enter a valid phone number.'; },
    url(v) { if (!v) return null; try { new URL(v); return null; } catch { return 'Please enter a valid URL (https://...).'; } },
    number(v) { return isNaN(Number(v)) ? 'Please enter a valid number.' : null; },
    'checkbox-group'(v, f) {
      const sel = Array.isArray(v) ? v.filter(Boolean) : [];
      if (f.minSelect && sel.length < f.minSelect) return `Select at least ${f.minSelect} option(s).`;
      if (f.maxSelect && sel.length > f.maxSelect) return `Select at most ${f.maxSelect} option(s).`;
      return null;
    },
    'linear-scale'(v, f) {
      const n = Number(v); if (isNaN(n)) return 'Please select a value.';
      if (n < (f.min||1) || n > (f.max||5)) return `Select between ${f.min||1} and ${f.max||5}.`;
      return null;
    },
    file(v, f) {
      if (!v) return null;
      const maxB = (f.maxSizeMB || 5) * 1024 * 1024;
      if (v.size > maxB) return `File must be under ${f.maxSizeMB || 5}MB.`;
      return null;
    },
    rating(v) { if (!v || v < 1) return 'Please select a rating.'; return null; },
  };

  /* ─── VALIDATE SECTION ───────────────────────────────────────── */
  function validateSection(sectionEl, section) {
    const errors = {};
    // Clear previous
    sectionEl.querySelectorAll('.msf-field-error').forEach(e => e.remove());
    sectionEl.querySelectorAll('[aria-invalid]').forEach(e => { e.removeAttribute('aria-invalid'); e.style.borderColor = ''; });

    for (const f of section.fields) {
      if (f.type === 'section-text' || f.type === 'divider') continue;
      const fieldWrap = sectionEl.querySelector(`[data-field-id="${f.id}"]`);
      if (!fieldWrap) continue;

      let value = null;
      if (f.type === 'checkbox-group') {
        value = [...fieldWrap.querySelectorAll(`input[name="${f.id}"]:checked`)].map(i => i.value).filter(Boolean);
        if (f.required && value.length === 0) { errors[f.id] = 'This field is required.'; continue; }
      } else if (f.type === 'file') {
        const inp = fieldWrap.querySelector(`input[type="file"][name="${f.id}"]`);
        value = inp?.files?.[0] || null;
        if (f.required && !value) { errors[f.id] = 'This field is required.'; continue; }
      } else if (f.type === 'rating') {
        const inp = fieldWrap.querySelector(`input[name="${f.id}"][type="hidden"]`);
        value = inp?.value || '';
        if (f.required && !value) { errors[f.id] = 'Please select a rating.'; continue; }
      } else if (f.type === 'linear-scale') {
        const sel = fieldWrap.querySelector('.msf-scale-btn.selected');
        value = sel?.dataset.val || '';
        if (f.required && !value) { errors[f.id] = 'Please select a value.'; continue; }
      } else if (f.type === 'radio') {
        const checked = fieldWrap.querySelector(`input[name="${f.id}"]:checked`);
        value = checked?.value || '';
        if (f.required && !value) { errors[f.id] = 'Please select an option.'; continue; }
      } else if (f.type === 'ranking') {
        const inp = fieldWrap.querySelector(`input[name="${f.id}"][type="hidden"]`);
        value = inp?.value || '';
        if (f.required && !value) { errors[f.id] = 'This field is required.'; continue; }
      } else {
        const inp = fieldWrap.querySelector(`[name="${f.id}"]`);
        value = inp?.value?.trim() || '';
        if (f.required && !value) { errors[f.id] = 'This field is required.'; continue; }
      }

      // Type validation
      const validator = VALIDATORS[f.type];
      if (value && validator) {
        const msg = validator(value, f);
        if (msg) errors[f.id] = msg;
      }
    }

    // Render errors
    for (const [fid, msg] of Object.entries(errors)) {
      const fieldWrap = sectionEl.querySelector(`[data-field-id="${fid}"]`);
      if (!fieldWrap) continue;
      const firstInput = fieldWrap.querySelector('input,select,textarea');
      if (firstInput) { firstInput.setAttribute('aria-invalid', 'true'); firstInput.style.borderColor = '#f43f5e'; }
      const errEl = document.createElement('div');
      errEl.className = 'msf-field-error'; errEl.textContent = msg;
      errEl.setAttribute('role', 'alert');
      fieldWrap.appendChild(errEl);
    }

    if (Object.keys(errors).length) {
      const firstErr = sectionEl.querySelector('[aria-invalid="true"]');
      firstErr?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return Object.keys(errors).length === 0;
  }

  /* ─── COLLECT SECTION ANSWERS ────────────────────────────────── */
  async function collectSectionAnswers(sectionEl, section) {
    const answers = {};
    for (const f of section.fields) {
      if (f.type === 'section-text' || f.type === 'divider') continue;
      const key = f.label || f.id;

      if (f.type === 'checkbox-group') {
        const checked = [...sectionEl.querySelectorAll(`input[name="${f.id}"]:checked`)].map(i => i.value);
        answers[key] = checked.join(', ');
      } else if (f.type === 'file') {
        const inp = sectionEl.querySelector(`input[type="file"][name="${f.id}"]`);
        const file = inp?.files?.[0];
        if (file) {
          try {
            const b64 = await fileToBase64(file);
            answers[key] = { _type: 'file', fileName: file.name, mimeType: file.type, size: file.size, base64: b64 };
          } catch { answers[key] = `${file.name} (${Math.round(file.size/1024)}KB)`; }
        } else { answers[key] = ''; }
      } else if (f.type === 'rating') {
        const inp = sectionEl.querySelector(`input[name="${f.id}"][type="hidden"]`);
        answers[key] = inp?.value || '';
      } else if (f.type === 'linear-scale') {
        const sel = sectionEl.querySelector('.msf-scale-btn.selected');
        answers[key] = sel?.dataset.val || '';
      } else if (f.type === 'ranking') {
        const inp = sectionEl.querySelector(`input[name="${f.id}"][type="hidden"]`);
        answers[key] = inp?.value || '';
      } else if (f.type === 'radio') {
        const checked = sectionEl.querySelector(`input[name="${f.id}"]:checked`);
        answers[key] = checked?.value || '';
      } else {
        const inp = sectionEl.querySelector(`[name="${f.id}"]`);
        answers[key] = inp?.value?.trim() || '';
      }
    }
    return answers;
  }

  /* ─── GET NEXT SECTION INDEX ─────────────────────────────────── */
  function getNextIdx(sections, currentIdx, sectionAnswers) {
    const sec = sections[currentIdx];
    if (!sec?.routing) return currentIdx + 1;

    const { type, conditionFieldId, rules, defaultGoTo } = sec.routing;

    if (type === 'submit') return sections.length; // trigger submit
    if (type !== 'conditional') return currentIdx + 1;

    // Find the answer for the condition field
    const condField = sec.fields.find(f => f.id === conditionFieldId);
    if (!condField) return currentIdx + 1;
    const answerValue = sectionAnswers[condField.label || condField.id] || '';

    const match = (rules || []).find(r => r.value === answerValue);
    const goTo = match?.goTo || defaultGoTo || 'next';

    if (goTo === 'next') return currentIdx + 1;
    if (goTo === 'submit') return sections.length;
    // goTo is a section id
    const targetIdx = sections.findIndex(s => s.id === goTo);
    return targetIdx >= 0 ? targetIdx : currentIdx + 1;
  }

  /* ─── RENDER SECTION ─────────────────────────────────────────── */
  function showSection(form, state, idx, dir) {
    const sections = state.sections;
    const total    = sections.length;
    const sectEls  = form.querySelectorAll('.ms-form-section');

    // Hide all
    sectEls.forEach(el => { el.style.display = 'none'; el.className = 'ms-form-section'; });

    // Show target
    const target = form.querySelector(`.ms-form-section[data-section-idx="${idx}"]`);
    if (!target) return;
    target.style.display = 'block';
    target.className = `ms-form-section ${dir === 'forward' ? 'msf-section-anim-in-right' : dir === 'back' ? 'msf-section-anim-in-left' : ''}`;

    // Update progress bar
    const progWrap = form.querySelector('.ms-form-progress');
    const progFill = form.querySelector('.ms-form-progress-fill');
    const progLabel = form.querySelector('.ms-form-section-label');
    const progText  = form.querySelector('.ms-form-progress-text');
    if (progWrap) {
      progWrap.style.display = 'block';
      const pct = Math.round(((idx + 1) / total) * 100);
      if (progFill) progFill.style.width = pct + '%';
      if (progLabel) progLabel.textContent = sections[idx]?.title || `Section ${idx + 1}`;
      if (progText)  progText.textContent  = `${idx + 1} of ${total}`;
    }

    // Update back button
    const backBtn = target.querySelector('.ms-form-btn-back');
    if (backBtn) backBtn.style.display = idx === 0 ? 'none' : '';

    // Update next/submit button
    const nextBtn = target.querySelector('.ms-form-btn-next');
    if (nextBtn) {
      const isLast = idx === total - 1 || sections[idx]?.routing?.type === 'submit';
      nextBtn.dataset.isSubmit = isLast ? '1' : '';
      if (isLast) {
        nextBtn.textContent = form.dataset.msButtonText || 'Submit Registration';
      } else {
        nextBtn.textContent = 'Next →';
      }
    }

    // Wire real-time validation clear
    target.querySelectorAll('[name]').forEach(el => {
      el.addEventListener('input', () => {
        el.removeAttribute('aria-invalid'); el.style.borderColor = '';
        const err = el.closest('[data-field-id]')?.querySelector('.msf-field-error');
        if (err) err.remove();
      }, { once: false });
    });

    state.currentIdx = idx;
  }

  /* ─── SHOW SUCCESS CARD ──────────────────────────────────────── */
  function showSuccessCard(form) {
    const accent = window.__MS_ACCENT || '#00d4ff';
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(accent);
    const rgb = r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '0,212,255';
    const msg  = form.dataset.msSuccessMsg || 'Your registration has been received. We will be in touch!';
    const shareUrl = window.__MS_SHARE_URL || '';

    form.style.transition = 'opacity 0.3s,transform 0.3s';
    form.style.opacity = '0'; form.style.transform = 'translateY(8px)';
    setTimeout(() => {
      form.innerHTML = `
<div style="text-align:center;padding:40px 24px">
  <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,${accent},rgba(${rgb},0.5));display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 0 40px rgba(${rgb},0.3)">
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" style="width:28px;height:28px"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
  <h3 style="margin:0 0 10px;font-size:20px;font-weight:700">You're registered! 🎉</h3>
  <p style="margin:0 auto;font-size:15px;opacity:0.65;line-height:1.65;max-width:360px">${msg}</p>
  ${shareUrl ? `<div style="margin-top:20px"><button onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>this.textContent='Copied!')" style="padding:7px 16px;border-radius:7px;background:rgba(${rgb},0.12);border:1px solid rgba(${rgb},0.25);color:${accent};font-size:13px;font-weight:600;cursor:pointer">Share this event</button></div>` : ''}
</div>`;
      form.style.opacity = '1'; form.style.transform = 'translateY(0)';
    }, 300);
  }

  /* ─── SUBMIT FORM ────────────────────────────────────────────── */
  async function submitForm(form, state) {
    const nextBtn = form.querySelector(`.ms-form-section[data-section-idx="${state.currentIdx}"] .ms-form-btn-next`);
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px"><span style="width:15px;height:15px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:msf-spin 0.7s linear infinite;display:inline-block"></span>Submitting…</span>`;
    }

    try {
      // Collect all section answers
      const flatData = {};
      const visitedIds = [...state.visitedIds];

      for (const idx of state.visitedIdxs) {
        const sec = state.sections[idx];
        if (!sec) continue;
        const secEl = form.querySelector(`.ms-form-section[data-section-idx="${idx}"]`);
        if (secEl) {
          const ans = await collectSectionAnswers(secEl, sec);
          Object.assign(flatData, ans);
        } else {
          // Skipped section — blank values
          for (const f of sec.fields || []) {
            if (f.type !== 'section-text' && f.type !== 'divider') {
              flatData[f.label || f.id] = '';
            }
          }
        }
      }

      // Dedup check
      const siteId = form.dataset.msSite || window.__MS_SITE_ID || '';
      const fp = buildFingerprint(siteId, flatData);
      if (alreadySubmitted(fp)) {
        if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Already Registered'; }
        return;
      }

      // Handle file fields — extract base64 payloads
      const fileUploads = {};
      for (const [key, val] of Object.entries(flatData)) {
        if (val && typeof val === 'object' && val._type === 'file') {
          fileUploads[key] = val;
          flatData[key] = `__FILE__:${val.fileName}`; // placeholder
        }
      }

      const payload = {
        siteId,
        sheetId:     form.dataset.msForm   || '',
        slug:        window.__MS_SLUG       || '',
        data:        flatData,
        files:       Object.keys(fileUploads).length ? fileUploads : undefined,
        meta: {
          sections:    visitedIds,
          submittedAt: new Date().toISOString(),
        },
        userAgent: navigator.userAgent.slice(0, 120),
      };

      await postWithRetry(payload);
      markSubmitted(fp);
      showSuccessCard(form);

    } catch (err) {
      console.error('[MSForm] submit failed:', err.message);
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.style.background = '#f43f5e';
        nextBtn.textContent = 'Error — Try Again';
        setTimeout(() => { nextBtn.style.background = ''; nextBtn.textContent = form.dataset.msButtonText || 'Submit Registration'; }, 3500);
      }
    }
  }

  /* ─── BIND ONE FORM ──────────────────────────────────────────── */
  function bindForm(form) {
    if (form.dataset.msBound) return;
    form.dataset.msBound = '1';

    // Parse sections from data attribute
    let sections = [];
    try {
      const raw = form.dataset.msSections;
      if (raw) sections = JSON.parse(raw);
    } catch (e) { console.warn('[MSForm] Could not parse sections', e); }

    // Backward compat: old flat fields[]
    if (!sections.length) {
      sections = [{ id: 'sec_1', title: '', description: '', fields: [], routing: { type: 'auto' } }];
    }

    const isSingle = sections.length === 1;
    const state = { sections, currentIdx: 0, history: [], visitedIdxs: [0], visitedIds: [sections[0]?.id || 'sec_1'] };
    formStates.set(form, state);

    // Hide progress bar for single-section forms
    if (isSingle) {
      const p = form.querySelector('.ms-form-progress');
      if (p) p.style.display = 'none';
    }

    // Inject honeypot
    const hp = document.createElement('input');
    hp.type = 'text'; hp.name = 'hp_field'; hp.tabIndex = -1; hp.autocomplete = 'off';
    hp.style.cssText = 'position:absolute;left:-9999px;opacity:0;pointer-events:none;height:0;width:0';
    hp.setAttribute('aria-hidden', 'true');
    form.appendChild(hp);

    // Show first section
    showSection(form, state, 0, 'none');

    // Wire rating stars
    wireRatingInputs(form);

    // Wire linear scale buttons
    wireScaleButtons(form);

    // Wire ranking drag handles
    wireRankingInputs(form);

    // Event delegation on form
    form.addEventListener('click', async (e) => {
      const st = formStates.get(form);
      if (!st) return;

      const nextBtn = e.target.closest('.ms-form-btn-next');
      const backBtn = e.target.closest('.ms-form-btn-back');

      if (nextBtn) {
        e.preventDefault();

        // Honeypot
        if (form.querySelector('[name="hp_field"]')?.value) { showSuccessCard(form); return; }

        const sec    = st.sections[st.currentIdx];
        const secEl  = form.querySelector(`.ms-form-section[data-section-idx="${st.currentIdx}"]`);
        const isSubmit = nextBtn.dataset.isSubmit === '1';

        const valid = validateSection(secEl, sec);
        if (!valid) return;

        // Collect answers for routing
        const secAnswers = await collectSectionAnswers(secEl, sec);

        if (isSubmit) {
          await submitForm(form, st);
          return;
        }

        // Compute next
        const nextIdx = getNextIdx(st.sections, st.currentIdx, secAnswers);

        if (nextIdx >= st.sections.length) {
          await submitForm(form, st);
          return;
        }

        // Navigate forward
        st.history.push(st.currentIdx);
        if (!st.visitedIdxs.includes(nextIdx)) {
          st.visitedIdxs.push(nextIdx);
          st.visitedIds.push(st.sections[nextIdx]?.id || `sec_${nextIdx}`);
        }
        showSection(form, st, nextIdx, 'forward');
      }

      if (backBtn) {
        e.preventDefault();
        const st = formStates.get(form);
        const prevIdx = st.history.pop();
        if (prevIdx !== undefined) showSection(form, st, prevIdx, 'back');
      }
    });
  }

  /* ─── RATING STARS ───────────────────────────────────────────── */
  function wireRatingInputs(form) {
    form.querySelectorAll('.msf-rating').forEach(wrap => {
      const name = wrap.dataset.name;
      const hidden = wrap.querySelector(`input[name="${name}"]`);
      const stars  = wrap.querySelectorAll('.msf-rating-star');
      stars.forEach((star, i) => {
        star.addEventListener('click', () => {
          const val = i + 1;
          if (hidden) hidden.value = val;
          stars.forEach((s, j) => s.classList.toggle('active', j < val));
        });
        star.addEventListener('mouseenter', () => stars.forEach((s, j) => s.classList.toggle('active', j <= i)));
        star.addEventListener('mouseleave', () => {
          const cur = parseInt(hidden?.value || '0');
          stars.forEach((s, j) => s.classList.toggle('active', j < cur));
        });
      });
    });
  }

  /* ─── SCALE BUTTONS ──────────────────────────────────────────── */
  function wireScaleButtons(form) {
    form.querySelectorAll('.msf-scale-row').forEach(row => {
      const name = row.dataset.name;
      const color = row.dataset.color || '#00d4ff';
      row.querySelectorAll('.msf-scale-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.msf-scale-btn').forEach(b => { b.classList.remove('selected'); b.style.background = 'transparent'; b.style.color = ''; });
          btn.classList.add('selected'); btn.style.background = color; btn.style.color = '#fff';
          const hidden = form.querySelector(`input[name="${name}"][type="hidden"]`);
          if (hidden) hidden.value = btn.dataset.val;
        });
      });
    });
  }

  /* ─── RANKING ────────────────────────────────────────────────── */
  function wireRankingInputs(form) {
    form.querySelectorAll('.msf-ranking-list').forEach(list => {
      const name = list.dataset.name;
      // Simple up/down buttons fallback
      list.querySelectorAll('.msf-rank-up,.msf-rank-down').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = btn.closest('.msf-rank-item');
          if (btn.classList.contains('msf-rank-up') && item.previousElementSibling) {
            list.insertBefore(item, item.previousElementSibling);
          } else if (btn.classList.contains('msf-rank-down') && item.nextElementSibling) {
            list.insertBefore(item.nextElementSibling, item);
          }
          updateRankingHidden(list, name, form);
        });
      });
      updateRankingHidden(list, name, form);
    });
  }
  function updateRankingHidden(list, name, form) {
    const items = [...list.querySelectorAll('.msf-rank-item')].map(i => i.dataset.value).filter(Boolean);
    const hidden = form.querySelector(`input[name="${name}"][type="hidden"]`);
    if (hidden) hidden.value = items.join(', ');
  }

  /* ─── BOOT ───────────────────────────────────────────────────── */
  function boot() {
    injectStyles();
    document.querySelectorAll('[data-ms-form]').forEach(bindForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.MSForm = { bind: bindForm, boot };
})();

