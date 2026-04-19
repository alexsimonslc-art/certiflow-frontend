// @ts-nocheck
/* ================================================================
   Honourix — Shared Dashboard JS (v2.2 — Clean)
================================================================ */

const API = 'https://certiflow-backend-73xk.onrender.com';

/* ── Auth ─────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem('Honourix_token'); }

function getUser() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('Honourix_token');
      return null;
    }
    return payload;
  } catch { return null; }
}

function requireAuth() {
  const params   = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    localStorage.setItem('Honourix_token', urlToken);
    window.history.replaceState({}, '', window.location.pathname);
  }
  const user = getUser();
  if (!user) { window.location.href = '/login.html'; return null; }
  return user;
}

function logout() {
  localStorage.removeItem('Honourix_token');
  window.location.href = '/index.html';
}

/* ── API Helper ───────────────────────────────────────────────── */
async function apiFetch(path, options = {}) {
  const token = getToken();
  try {
    const res = await fetch(API + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        ...(options.headers || {}),
      },
    });

    // Only force-logout on 401 if it's a critical/required call
    if (res.status === 401 && !options.silent) {
      localStorage.removeItem('Honourix_token');
      window.location.href = '/login.html';
      return null;
    }

    // For silent calls just return null
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (options.silent) return null;
      throw new Error(data.error || 'API error');
    }

    return await res.json();
  } catch (err) {
    if (options.silent) return null;
    throw err;
  }
}

/* ── Local Stats ─────────────────────────────────────────────── */
function getLocalStats() {
  const campaigns    = JSON.parse(localStorage.getItem('hx_campaigns') || '[]');
  const totalCerts   = campaigns.filter(c => c.type==='cert'||c.type==='combined').reduce((s,c)=>s+(c.success||0),0);
  const totalMails   = campaigns.filter(c => c.type==='mail'||c.type==='combined').reduce((s,c)=>s+(c.success||0),0);
  const totalSuccess = campaigns.reduce((s,c)=>s+(c.success||0),0);
  const totalItems   = campaigns.reduce((s,c)=>s+(c.total||0),0);
  const successRate  = totalItems > 0 ? Math.round(totalSuccess/totalItems*100) : 0;
  const now          = new Date();
  const thisMonth    = campaigns.filter(c => {
    const d = new Date(c.date);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  });
  return {
    totalCerts, totalMails, successRate,
    totalCampaigns: campaigns.length,
    monthCerts: thisMonth.filter(c=>c.type==='cert'||c.type==='combined').reduce((s,c)=>s+(c.success||0),0),
    monthMails: thisMonth.filter(c=>c.type==='mail'||c.type==='combined').reduce((s,c)=>s+(c.success||0),0),
  };
}

/* ── Render Sidebar ──────────────────────────────────────────── */
function renderSidebar(activePage) {
  const navItems = [
    { page: 'dashboard.html', icon: 'layout-dashboard', label: 'Overview', section: null },
    { page: 'cert-tool.html',     icon: 'file-badge',        label: 'Certificates',      section: 'Tools' },
    { page: 'mail-tool.html',     icon: 'mail',              label: 'Bulk Mail',         section: null },
    { page: 'combined-tool.html', icon: 'zap',               label: 'Combined Pipeline', section: null },
    { page: 'mini-site.html',     icon: 'layout-template',   label: 'Mini Sites',        section: null },
    { page: 'hx-forms.html',      icon: 'file-text',         label: 'HX Forms',          section: null },
    { page: 'campaigns.html',     icon: 'folder-open',       label: 'Campaigns',         section: 'Manage' },
    { page: 'settings.html',      icon: 'settings',          label: 'Settings',          section: null },
  ];

  let navHtml = '';
  navItems.forEach(item => {
    if (item.section) {
      if (item.section === 'Workspace') {
        navHtml += `
          <div class="nav-section-label nav-section-with-toggle">
            <span>${item.section}</span>
            <button class="sidebar-toggle-btn" id="sidebarCollapseBtn" title="Collapse sidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>`;
      } else {
        navHtml += `<div class="nav-section-label">${item.section}</div>`;
      }
    }
    const badge = item.badge ? `<span class="nav-badge">${item.badge}</span>` : '';
    navHtml += `
      <a class="nav-item${item.page === activePage ? ' active' : ''}"
         href="${item.page}" data-page="${item.page}">
        <i data-lucide="${item.icon}"></i>
        <span class="nav-label">${item.label}</span>
        ${badge}
      </a>`;
  });

    return `
  <aside class="sidebar" id="appSidebar">
    <div class="sidebar-logo">
      <div class="logo-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      </div>
      <span class="logo-name">Honou<span>rix</span></span>
    </div>
    <nav class="sidebar-nav">

      <!-- ☰ Workspace row — hamburger always stays here -->
      <div class="nav-section-label nav-section-with-toggle">
        <span class="section-text">Workspace</span>
        <button class="sidebar-toggle-btn" id="sidebarCollapseBtn" title="Toggle sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
            <line x1="3" y1="5" x2="21" y2="5"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="19" x2="21" y2="19"/>
          </svg>
        </button>
      </div>

      ${navHtml}
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <a class="user-row-info" id="sidebarUserInfo" href="settings.html" title="Account Settings">
          <div class="user-avatar" id="sidebarAvatar">U</div>
          <div class="user-info">
            <div class="user-name" id="sidebarUserName">Loading…</div>
            <div class="user-plan" id="sidebarUserPlan">Personal</div>
          </div>
        </a>
        <button class="sidebar-logout-btn" id="sidebarLogoutBtn" title="Sign out" aria-label="Sign out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  </aside>`;
}

/* ── Init Sidebar ────────────────────────────────────────────── */
function initSidebar() {
  const user = getUser();
  if (!user) return;

  // Populate user info
  const nameEl   = document.getElementById('sidebarUserName');
  const avatarEl = document.getElementById('sidebarAvatar');
  const planEl   = document.getElementById('sidebarUserPlan');
  if (nameEl)   nameEl.textContent = user.name || user.email.split('@')[0];
  if (planEl)   planEl.textContent = user.accountType === 'organization' ? 'Organization' : 'Personal';
  if (avatarEl) {
    avatarEl.innerHTML = user.picture
      ? `<img src="${user.picture}" alt="avatar"/>`
      : (user.name || 'U').charAt(0).toUpperCase();
  }

  // Logout button → show confirm dialog
  const logoutBtn = document.getElementById('sidebarLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showConfirm(
        'Sign out of Honourix?',
        'You will be returned to the home page. Campaign history is preserved locally.',
        logout
      );
    });
  }

  // ── Sidebar collapse / expand ──
  const sidebar      = document.getElementById('appSidebar');
  const mainArea     = document.querySelector('.main-area');
  const collapseBtn  = document.getElementById('sidebarCollapseBtn');
 

  function setSidebarCollapsed(collapsed) {
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed', collapsed);
  if (mainArea) mainArea.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem('hx_sidebar_collapsed', collapsed ? '1' : '0');
  // ✅ Do NOT touch collapseBtn innerHTML — icon stays as ☰ always
  }


  // Restore saved state
  setSidebarCollapsed(localStorage.getItem('hx_sidebar_collapsed') === '1');

  // ✅ Wire up the hamburger button click
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
    });
  }



  // Mark active nav
  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === currentPage);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ── Confirm Dialog ─────────────────────────────────────────── */
/* Single unified function — no duplicates */
function showConfirm(title, message, onYes) {
  const existing = document.getElementById('cf-confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cf-confirm-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0;
    background:rgba(2,6,15,0.75);
    backdrop-filter:blur(12px);
    z-index:9999;
    display:flex; align-items:center; justify-content:center;
    font-family:'Plus Jakarta Sans','DM Sans',sans-serif;
    animation:cfFadeIn 0.18s ease;
  `;
  overlay.innerHTML = `
    <style>
      @keyframes cfFadeIn { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
    </style>
    <div style="
      background:rgba(8,14,28,0.96);
      border:1px solid rgba(255,255,255,0.12);
      border-radius:18px; padding:36px 32px 28px;
      max-width:400px; width:92%; text-align:center;
      box-shadow:0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.06);
    ">
      <div style="
        width:52px; height:52px; border-radius:50%;
        background:rgba(244,63,94,0.12);
        border:1px solid rgba(244,63,94,0.25);
        display:flex; align-items:center; justify-content:center;
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
        <button id="cfNo" style="
          padding:10px 28px; border-radius:10px;
          background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.1);
          color:#94a3b8; font-size:14px; font-weight:500;
          cursor:pointer; font-family:inherit; transition:background 0.15s;
        " onmouseover="this.style.background='rgba(255,255,255,0.1)'"
           onmouseout="this.style.background='rgba(255,255,255,0.06)'">
          Cancel
        </button>
        <button id="cfYes" style="
          padding:10px 28px; border-radius:10px;
          background:linear-gradient(135deg,#f43f5e,#c0304a);
          color:#fff; font-size:14px; font-weight:600;
          cursor:pointer; border:none; font-family:inherit;
          box-shadow:0 4px 20px rgba(244,63,94,0.3);
          transition:transform 0.15s, box-shadow 0.15s;
        " onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 8px 28px rgba(244,63,94,0.45)'"
           onmouseout="this.style.transform='';this.style.boxShadow='0 4px 20px rgba(244,63,94,0.3)'">
          Sign Out
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('cfNo').onclick  = () => overlay.remove();
  document.getElementById('cfYes').onclick = () => { overlay.remove(); onYes(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* ── Toast ───────────────────────────────────────────────────── */
function toast(message, type = 'info', duration = 3500) {
  const existing = document.getElementById('cf-toast');
  if (existing) existing.remove();

  const colors = {
    success: { bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.3)', icon:'#10b981', sym:'✓' },
    error:   { bg:'rgba(244,63,94,0.12)',  border:'rgba(244,63,94,0.3)',  icon:'#f43f5e', sym:'✕' },
    info:    { bg:'rgba(0,212,255,0.10)',  border:'rgba(0,212,255,0.25)', icon:'#00d4ff', sym:'ℹ' },
    warn:    { bg:'rgba(245,158,11,0.12)', border:'rgba(245,158,11,0.3)', icon:'#f59e0b', sym:'⚠' },
  };
  const c = colors[type] || colors.info;

  const el = document.createElement('div');
  el.id = 'cf-toast';
  el.style.cssText = `
    position:fixed; bottom:28px; right:28px; z-index:9998;
    background:${c.bg}; border:1px solid ${c.border};
    backdrop-filter:blur(20px); color:#dde6f5;
    font-size:14px; font-weight:500;
    padding:13px 20px; border-radius:12px;
    display:flex; align-items:center; gap:10px;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    font-family:'Plus Jakarta Sans','DM Sans',sans-serif;
    animation:toastIn 0.3s ease; max-width:340px;
  `;
  el.innerHTML = `
    <style>@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}</style>
    <span style="color:${c.icon};font-size:16px;flex-shrink:0;">${c.sym}</span>
    <span>${message}</span>`;

  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, duration);
}

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function downloadCSV(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const rows    = data.map(row =>
    headers.map(h => `"${(row[h]||'').toString().replace(/"/g,'""')}"`).join(',')
  );
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type:'text/csv' });
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}

function copyToClipboard(text, label = 'Copied') {
  navigator.clipboard.writeText(text)
    .then(() => toast(`${label} to clipboard`, 'success', 2000))
    .catch(() => toast('Could not copy', 'error', 2000));
}

/* ── DOMContentLoaded — runs on every page ───────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
});

/* ── Google Picker ───────────────────────────────────────────── */
async function openGooglePicker(type, callback) {
  const { clientId } = await apiFetch('/auth/config');
  const user = getUser();
  await loadScript('https://apis.google.com/js/api.js');
  await loadScript('https://accounts.google.com/gsi/client');

  gapi.load('picker', () => {
    const mimeTypes = {
      sheet:        'application/vnd.google-apps.spreadsheet',
      presentation: 'application/vnd.google-apps.presentation',
      folder:       'application/vnd.google-apps.folder',
    };
    const view = type === 'folder'
      ? new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true)
      : new google.picker.DocsView().setMimeTypes(mimeTypes[type]);

    new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(user.accessToken)
      .setDeveloperKey('')
      .setCallback(data => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          callback({ id: doc.id, name: doc.name, url: doc.url });
        }
      })
      .build().setVisible(true);
  });
}

function loadScript(src) {
  return new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    document.head.appendChild(s);
  });
}