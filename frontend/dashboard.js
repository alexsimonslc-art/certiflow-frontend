// @ts-nocheck
/* ================================================================
   CertiFlow — Shared Dashboard JS  (v2.1 — Fixed)
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

/* ── Logout with confirmation ─────────────────────────────────── */
function logout() {
  showConfirm(
    '🚪 Sign out of CertiFlow?',
    'You will be returned to the home page. Your campaign history and template will be preserved locally.',
    () => {
      localStorage.removeItem('certiflow_token');
      window.location.href = '/index.html';
    }
  );
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
  if (res.status === 401) {
    localStorage.removeItem('certiflow_token');
    window.location.href = '/login.html';
    return null;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

/* ── Local Stats (from campaign history) ─────────────────────── */
function getLocalStats() {
  const campaigns = JSON.parse(localStorage.getItem('cf_campaigns') || '[]');
  const totalCampaigns = campaigns.length;

  const totalCerts = campaigns
    .filter(c => c.type === 'cert' || c.type === 'combined')
    .reduce((s, c) => s + (c.success || 0), 0);

  const totalMails = campaigns
    .filter(c => c.type === 'mail' || c.type === 'combined')
    .reduce((s, c) => s + (c.success || 0), 0);

  const totalSuccess = campaigns.reduce((s, c) => s + (c.success || 0), 0);
  const totalItems   = campaigns.reduce((s, c) => s + (c.total   || 0), 0);
  const successRate  = totalItems > 0 ? Math.round(totalSuccess / totalItems * 100) : 0;

  const now = new Date();
  const monthCampaigns = campaigns.filter(c => {
    const d = new Date(c.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthCerts = monthCampaigns
    .filter(c => c.type === 'cert' || c.type === 'combined')
    .reduce((s, c) => s + (c.success || 0), 0);
  const monthMails = monthCampaigns
    .filter(c => c.type === 'mail' || c.type === 'combined')
    .reduce((s, c) => s + (c.success || 0), 0);

  return { totalCerts, totalMails, successRate, totalCampaigns, monthCerts, monthMails };
}

/* ── Sidebar HTML ─────────────────────────────────────────────── */
function renderSidebar(activePage) {
  const navItems = [
    { page: 'dashboard.html',     icon: 'layout-dashboard', label: 'Overview',          section: 'Workspace' },
    { page: 'cert-tool.html',     icon: 'file-badge',        label: 'Certificates',      section: 'Tools' },
    { page: 'mail-tool.html',     icon: 'mail',              label: 'Bulk Mail',         section: null },
    { page: 'combined-tool.html', icon: 'zap',               label: 'Combined Pipeline', section: null },
    { page: 'campaigns.html',     icon: 'folder-open',       label: 'Campaigns',         section: 'Manage' },
    { page: 'settings.html',      icon: 'settings',          label: 'Settings',          section: null },
  ];

  let navHtml = '';
  navItems.forEach(item => {
    if (item.section) navHtml += '<div class="nav-section-label">' + item.section + '</div>';
    navHtml +=
      '<a class="nav-item' + (item.page === activePage ? ' active' : '') +
      '" href="' + item.page + '" data-tip="' + item.label + '">' +
        '<i data-lucide="' + item.icon + '"></i>' +
        '<span class="nav-label">' + item.label + '</span>' +
      '</a>';
  });

  return `
  <aside class="sidebar" id="appSidebar">
    <div class="sidebar-logo">
      <div class="logo-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <span class="logo-name">Certi<span>Flow</span></span>
    </div>
    <button class="sidebar-collapse-btn" id="sidebarCollapseBtn" title="Collapse sidebar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <nav class="sidebar-nav">${navHtml}</nav>
    <div class="sidebar-footer">
      <a class="user-row" id="userRow" href="settings.html" title="Account Settings">
        <div class="user-avatar" id="sidebarAvatar">U</div>
        <div class="user-info">
          <div class="user-name" id="sidebarUserName">Loading…</div>
          <div class="user-plan" id="sidebarUserPlan">Personal</div>
        </div>
        <button class="sidebar-logout-btn" id="sidebarLogoutBtn" title="Sign out" onclick="event.preventDefault();event.stopPropagation();logout();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </a>
    </div>
  </aside>`;
}

/* ── Init Sidebar ─────────────────────────────────────────────── */
function initSidebar() {
  const user = getUser();
  if (!user) return;

  const nameEl   = document.getElementById('sidebarUserName');
  const avatarEl = document.getElementById('sidebarAvatar');
  const planEl   = document.getElementById('sidebarUserPlan');

  if (nameEl)   nameEl.textContent = user.name || (user.email || '').split('@')[0];
  if (planEl)   planEl.textContent = user.hd ? 'Workspace' : 'Personal Gmail';
  if (avatarEl) {
    if (user.picture) {
      avatarEl.innerHTML = '<img src="' + user.picture + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
    }
  }

  // ── Sidebar collapse/expand ──────────────────────────────────
  const sidebar    = document.getElementById('appSidebar');
  const mainArea   = document.querySelector('.main-area');
  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  const headerToggle = document.getElementById('sidebarToggle');

  function setSidebarCollapsed(collapsed) {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed', collapsed);
    if (mainArea) mainArea.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem('cf_sidebar_collapsed', collapsed ? '1' : '0');
    // Flip the arrow icon
    if (collapseBtn) {
      collapseBtn.innerHTML = collapsed
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>';
    }
  }

  // Restore saved state
  const savedCollapsed = localStorage.getItem('cf_sidebar_collapsed') === '1';
  setSidebarCollapsed(savedCollapsed);

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
    });
  }

  // Header toggle button — repurposed as sidebar collapse on desktop, open on mobile
  if (headerToggle && sidebar) {
    headerToggle.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        sidebar.classList.toggle('mobile-open');
      } else {
        setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
      }
    });
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !headerToggle.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
      }
    });
  }
}

/* ── Confirm Dialog ───────────────────────────────────────────── */
function showConfirm(title, message, onYes) {
  const existing = document.getElementById('cf-confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cf-confirm-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;
    background:rgba(2,6,15,0.75);
    backdrop-filter:blur(12px);
    -webkit-backdrop-filter:blur(12px);
    z-index:9999;
    display:flex;align-items:center;justify-content:center;
    font-family:'Plus Jakarta Sans','DM Sans',sans-serif;
    animation:cfFadeIn 0.18s ease;
  `;
  overlay.innerHTML = `
    <style>@keyframes cfFadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}</style>
    <div style="
      background:rgba(8,14,28,0.96);
      border:1px solid rgba(255,255,255,0.12);
      border-radius:18px;
      padding:36px 32px 28px;
      max-width:400px;width:92%;
      text-align:center;
      box-shadow:0 32px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(0,212,255,0.08);
    ">
      <div style="
        width:52px;height:52px;
        border-radius:50%;
        background:rgba(244,63,94,0.12);
        border:1px solid rgba(244,63,94,0.25);
        display:flex;align-items:center;justify-content:center;
        margin:0 auto 18px;
      ">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </div>
      <h3 style="font-size:17px;font-weight:700;color:#eef2ff;margin-bottom:10px;letter-spacing:-0.3px;">${title}</h3>
      <p style="font-size:14px;color:#8aa0c0;line-height:1.6;margin-bottom:28px;">${message}</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button id="cfConfirmNo" style="
          padding:10px 24px;border-radius:10px;
          background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.1);
          color:#94a3b8;font-size:14px;font-weight:500;
          cursor:pointer;font-family:inherit;
          transition:background 0.15s;
        " onmouseover="this.style.background='rgba(255,255,255,0.1)'"
           onmouseout="this.style.background='rgba(255,255,255,0.06)'">
          Cancel
        </button>
        <button id="cfConfirmYes" style="
          padding:10px 24px;border-radius:10px;
          background:linear-gradient(135deg,#f43f5e,#c0304a);
          color:#fff;font-size:14px;font-weight:600;
          cursor:pointer;border:none;font-family:inherit;
          box-shadow:0 4px 20px rgba(244,63,94,0.3);
          transition:transform 0.15s,box-shadow 0.15s;
        " onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 8px 28px rgba(244,63,94,0.45)'"
           onmouseout="this.style.transform='';this.style.boxShadow='0 4px 20px rgba(244,63,94,0.3)'">
          Sign Out
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('cfConfirmNo').onclick  = () => overlay.remove();
  document.getElementById('cfConfirmYes').onclick = () => { overlay.remove(); onYes(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Legacy alias
function confirm(message, onYes) { showConfirm('Confirm', message, onYes); }

/* ── Toast ────────────────────────────────────────────────────── */
function toast(message, type = 'info', duration = 3500) {
  const existing = document.getElementById('cf-toast');
  if (existing) existing.remove();

  const colors = {
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '#10b981' },
    error:   { bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.3)',  icon: '#f43f5e' },
    info:    { bg: 'rgba(0,212,255,0.10)',  border: 'rgba(0,212,255,0.25)', icon: '#00d4ff' },
    warn:    { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '#f59e0b' },
  };
  const c = colors[type] || colors.info;

  const el = document.createElement('div');
  el.id = 'cf-toast';
  el.style.cssText = `
    position:fixed;bottom:28px;right:28px;z-index:9998;
    background:${c.bg};
    border:1px solid ${c.border};
    backdrop-filter:blur(20px);
    color:#dde6f5;font-size:14px;font-weight:500;
    padding:13px 20px;border-radius:12px;
    display:flex;align-items:center;gap:10px;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    font-family:'Plus Jakarta Sans','DM Sans',sans-serif;
    animation:toastIn 0.3s ease;max-width:340px;
  `;
  el.innerHTML = `<style>@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}</style>
    <span style="color:${c.icon};font-size:16px;flex-shrink:0">
      ${type==='success'?'✓':type==='error'?'✕':type==='warn'?'⚠':'ℹ'}
    </span>
    <span>${message}</span>`;

  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, duration);
}

/* ── Format Helpers ───────────────────────────────────────────── */
function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Download CSV ─────────────────────────────────────────────── */
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

/* ── Copy to Clipboard ────────────────────────────────────────── */
function copyToClipboard(text, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => {
    toast(`${label} to clipboard`, 'success', 2000);
  }).catch(() => {
    toast('Could not copy', 'error', 2000);
  });
}

/* ── Init on DOMContentLoaded ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  initSidebar();
  if (typeof lucide !== 'undefined') lucide.createIcons();
});

/* ── Google Picker ────────────────────────────────────────────── */
async function openGooglePicker(type, callback) {
  const { clientId } = await apiFetch('/auth/config');
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
      ? new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true)
      : new google.picker.DocsView().setMimeTypes(mimeTypes[type]);

    new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(user.accessToken)
      .setDeveloperKey('')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          callback({ id: doc.id, name: doc.name, url: doc.url });
        }
      })
      .build()
      .setVisible(true);
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