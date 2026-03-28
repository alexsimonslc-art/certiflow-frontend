// @ts-nocheck
/* ================================================================
   CertiFlow — Shared Dashboard JS
   dashboard.js | Include on every dashboard page
   ================================================================ */

const API = 'https://certiflow-backend-73xk.onrender.com';

/* ── Auth ─────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem('certiflow_token'); }

function getUser() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('certiflow_token');
      return null;
    }
    return payload;
  } catch { return null; }
}

function requireAuth() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    localStorage.setItem('certiflow_token', urlToken);
    window.history.replaceState({}, '', window.location.pathname);
  }
  const user = getUser();
  if (!user) { window.location.href = '/login.html'; return null; }
  return user;
}

function logout() {
  localStorage.removeItem('certiflow_token');
  window.location.href = '/index.html';
}

/* ── API Helper ───────────────────────────────────────────────── */
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) { logout(); return null; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

/* ── Render Sidebar ───────────────────────────────────────────── */
function renderSidebar(activePage) {
  const navItems = [
    { page: 'dashboard.html',     icon: 'layout-dashboard', label: 'Dashboard',         section: 'Workspace' },
    { page: 'cert-tool.html',     icon: 'file-badge',        label: 'Certificates',      section: null },
    { page: 'mail-tool.html',     icon: 'mail',              label: 'Bulk Mail',         section: null },
    { page: 'combined-tool.html', icon: 'zap',               label: 'Combined Pipeline', section: null },
    { page: 'campaigns.html',     icon: 'folder-open',       label: 'Campaigns',         section: 'Manage' },
    { page: 'settings.html',      icon: 'settings',          label: 'Settings',          section: null },
  ];

  let navHtml = '';
  navItems.forEach(item => {
    if (item.section) navHtml += '<span class="nav-section-label">' + item.section + '</span>';
    navHtml += '<a class="nav-item' + (item.page === activePage ? ' active' : '') + '" href="' + item.page + '" data-page="' + item.page + '">' +
      '<i data-lucide="' + item.icon + '"></i>' + item.label + '</a>';
  });

  return '<aside class="sidebar" id="appSidebar">' +
    '<div class="sidebar-logo">' +
      '<div class="logo-mark"><i data-lucide="zap"></i></div>' +
      '<span class="logo-name">Certi<span>Flow</span></span>' +
    '</div>' +
    '<nav class="sidebar-nav">' + navHtml + '</nav>' +
    '<div class="sidebar-footer">' +
      '<div class="user-row" id="userRow">' +
        '<div class="user-avatar" id="sidebarAvatar">U</div>' +
        '<div class="user-info">' +
          '<div class="user-name" id="sidebarUserName">Loading…</div>' +
          '<div class="user-plan" id="sidebarUserPlan">Personal</div>' +
        '</div>' +
        '<i data-lucide="chevrons-up-down" style="width:14px;height:14px;color:var(--text-3);flex-shrink:0"></i>' +
      '</div>' +
      '<div class="account-dropdown" id="accountDropdown">' +
        '<a class="acct-item" href="settings.html"><i data-lucide="user-circle"></i> Account Settings</a>' +
        '<a class="acct-item" href="settings.html#quota"><i data-lucide="bar-chart-2"></i> Usage & Quota</a>' +
        '<a class="acct-item" href="campaigns.html"><i data-lucide="folder-open"></i> My Campaigns</a>' +
        '<div class="acct-divider"></div>' +
        '<button class="acct-item acct-logout" onclick="logout()"><i data-lucide="log-out"></i> Sign Out</button>' +
      '</div>' +
    '</div>' +
  '</aside>';
}

/* ── Init Sidebar ─────────────────────────────────────────────── */
function initSidebar() {
  const user = getUser();
  if (!user) return;

  const nameEl   = document.getElementById('sidebarUserName');
  const avatarEl = document.getElementById('sidebarAvatar');
  const planEl   = document.getElementById('sidebarUserPlan');

  if (nameEl)   nameEl.textContent   = user.name || user.email.split('@')[0];
  if (planEl)   planEl.textContent   = user.hd ? 'Workspace' : 'Personal Gmail';
  if (avatarEl) {
    if (user.picture) {
      avatarEl.innerHTML = '<img src="' + user.picture + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
    }
  }

  // ── Account dropdown toggle (NOT logout on click) ──
  const userRow  = document.getElementById('userRow');
  const dropdown = document.getElementById('accountDropdown');
  if (userRow && dropdown) {
    userRow.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      dropdown.classList.toggle('open', !isOpen);
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
    dropdown.addEventListener('click', e => e.stopPropagation());
  }

  // Mobile sidebar toggle
  const toggle  = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('appSidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !toggle.contains(e.target)) sidebar.classList.remove('open');
    });
  }
}

/* ── Live Quota (dashboard widget) ───────────────────────────── */
async function loadQuota() {
  const sentEl  = document.getElementById('quotaSent');
  const limitEl = document.getElementById('quotaLimit');
  const barEl   = document.getElementById('quotaBar');
  const certEl  = document.getElementById('quotaCerts');
  if (!sentEl) return;

  try {
    const data = await apiFetch('/api/quota');
    if (!data) return;

    const limit = data.dailyLimit || 500;
    const sent  = data.sentToday  || 0;
    const certs = data.certsToday || 0;
    const pct   = Math.min(Math.round(sent / limit * 100), 100);

    sentEl.textContent  = sent;
    limitEl.textContent = limit;
    if (certEl) certEl.textContent = certs;
    if (barEl)  {
      barEl.style.width = pct + '%';
      barEl.className   = 'progress-fill' + (pct > 80 ? ' gold' : '');
    }
  } catch (e) {
    if (sentEl) sentEl.textContent = '—';
  }
}

/* ── Toast ────────────────────────────────────────────────────── */
function toast(message, type = 'info', duration = 3500) {
  const existing = document.getElementById('cf-toast');
  if (existing) existing.remove();
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>',
  };
  const colors = { success: '#10b981', error: '#ef4444', info: '#00d4ff', warning: '#f59e0b' };
  const el = document.createElement('div');
  el.id = 'cf-toast';
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:10px;background:#0d1726;border:1px solid rgba(255,255,255,0.10);color:#dde6f5;font-size:13.5px;font-family:\'Plus Jakarta Sans\',sans-serif;box-shadow:0 16px 48px rgba(0,0,0,0.5);animation:cfSlideIn 0.3s ease both;max-width:340px;';
  el.innerHTML = '<span style="color:' + colors[type] + ';flex-shrink:0">' + (icons[type] || '') + '</span><span>' + message + '</span>';
  const style = document.createElement('style');
  style.textContent = '@keyframes cfSlideIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.transition = 'all 0.3s ease'; setTimeout(() => el.remove(), 300); }, duration);
}

/* ── Utilities ────────────────────────────────────────────────── */
function copyToClipboard(text, label = 'Copied') {
  navigator.clipboard.writeText(text)
    .then(() => toast(label + ' to clipboard', 'success', 2000))
    .catch(() => toast('Could not copy', 'error', 2000));
}

function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}

/* ── Copy to clipboard ───────────────────────────────────────────── */
function copyToClipboard(text, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => {
    toast(`${label} to clipboard`, 'success', 2000);
  }).catch(() => {
    toast('Could not copy', 'error', 2000);
  });
}

/* ── Confirm dialog ──────────────────────────────────────────────── */
function confirm(message, onYes) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);
    z-index:999;display:flex;align-items:center;justify-content:center;
    font-family:'DM Sans',sans-serif;
  `;
  overlay.innerHTML = `
    <div style="background:#0d1726;border:1px solid rgba(255,255,255,0.10);border-radius:14px;padding:28px;max-width:380px;width:90%;text-align:center;">
      <p style="font-size:14px;color:#dde6f5;margin-bottom:24px;line-height:1.6;">${message}</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button id="cfNo" style="padding:9px 20px;border-radius:8px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);color:#94a3b8;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;">Cancel</button>
        <button id="cfYes" style="padding:9px 20px;border-radius:8px;background:linear-gradient(135deg,#00d4ff,#0099cc);color:#020608;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('cfNo').onclick = () => overlay.remove();
  document.getElementById('cfYes').onclick = () => { overlay.remove(); onYes(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

/* ── Format date ─────────────────────────────────────────────────── */
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Format number ───────────────────────────────────────────────── */
function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

/* ── Download CSV ────────────────────────────────────────────────── */
function downloadCSV(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Sidebar HTML template ───────────────────────────────────────── */
function renderSidebar(activePage) {
  return `
  <aside class="sidebar" id="appSidebar">
    <div class="sidebar-logo">
      <div class="logo-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <span class="logo-name">Certi<span>Flow</span></span>
    </div>
    <nav class="sidebar-nav">
      <a href="dashboard.html" class="nav-item ${activePage==='dashboard'?'active':''}" data-page="dashboard.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        Overview
      </a>
      <div class="nav-section-label">Tools</div>
      <a href="cert-tool.html" class="nav-item ${activePage==='cert-tool.html'?'active':''}" data-page="cert-tool.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
        Certificate Generator
      </a>
      <a href="mail-tool.html" class="nav-item ${activePage==='mail-tool.html'?'active':''}" data-page="mail-tool.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        Bulk Mail Sender
      </a>
      <a href="combined-tool.html" class="nav-item ${activePage==='combined-tool.html'?'active':''}" data-page="combined-tool.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Combined Pipeline
      </a>
      <div class="nav-section-label">Workspace</div>
      <a href="campaigns.html" class="nav-item ${activePage==='campaigns.html'?'active':''}" data-page="campaigns.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Campaigns
      </a>
      <a href="settings.html" class="nav-item ${activePage==='settings.html'?'active':''}" data-page="settings.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Settings
      </a>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row" onclick="logout()">
        <div class="user-avatar" id="sidebarAvatar"></div>
        <div class="user-info">
          <div class="user-name" id="sidebarUserName">Loading...</div>
          <div class="user-plan" id="sidebarUserPlan">Personal</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </div>
    </div>
  </aside>`;
}

/* ── Init on DOMContentLoaded ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  initSidebar();
  lucide.createIcons();
});

/* ── Google Picker ───────────────────────────────────────────── */
async function openGooglePicker(type, callback) {
  // type: 'sheet' | 'presentation' | 'folder'
  const { clientId } = await apiFetch('/auth/config');
  const token = getToken();
  const user = getUser();

  await loadScript('https://apis.google.com/js/api.js');
  await loadScript('https://accounts.google.com/gsi/client');

  gapi.load('picker', () => {
    const mimeTypes = {
      sheet: 'application/vnd.google-apps.spreadsheet',
      presentation: 'application/vnd.google-apps.presentation',
      folder: 'application/vnd.google-apps.folder',
    };

    const view = type === 'folder'
      ? new google.picker.DocsView(google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true)
      : new google.picker.DocsView()
          .setMimeTypes(mimeTypes[type]);

    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(user.accessToken)
      .setDeveloperKey('') // leave empty — OAuth token is enough
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          callback({ id: doc.id, name: doc.name, url: doc.url });
        }
      })
      .build();

    picker.setVisible(true);
  });
}

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    document.head.appendChild(s);
  });
}