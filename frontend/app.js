/* ─────────────────────────────────────────
   Honourix — app.js
   Frontend behavior for Landing + Login
───────────────────────────────────────── */

// ── Initialize Lucide icons
lucide.createIcons();

// ── State
const state = {
  accountType: 'personal', // 'personal' | 'organization'
  orgType: null,           // 'university' | 'college' | 'ngo' | 'company' | 'startup' | 'other'
};

/* ─────────────────────────────
   HEADER: Scroll behavior
───────────────────────────── */
const header = document.getElementById('header');
if (header) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 24) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });
}

/* ─────────────────────────────
   HAMBURGER MENU
───────────────────────────── */
const hamburger = document.getElementById('hamburger');
const nav = document.getElementById('nav');

if (hamburger && nav) {
  hamburger.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    hamburger.innerHTML = isOpen
      ? '<i data-lucide="x"></i>'
      : '<i data-lucide="menu"></i>';
    lucide.createIcons();
  });

  // Close nav when clicking nav links
  nav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      hamburger.innerHTML = '<i data-lucide="menu"></i>';
      lucide.createIcons();
    });
  });
}

/* ─────────────────────────────
   SMOOTH SCROLL for anchor links
───────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* ─────────────────────────────
   LOGIN MODAL (on landing page)
───────────────────────────── */
function requireLogin(e) {
  // Only trigger if clicking the card itself (not the CTA link)
  if (e && e.target && e.target.closest('.tool-cta')) return;
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.remove('active');
}

// Close modal on overlay click
const loginModal = document.getElementById('loginModal');
if (loginModal) {
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) closeModal();
  });
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ─────────────────────────────
   LOGIN PAGE: Step Management
───────────────────────────── */
function showStep(stepNumber) {
  document.querySelectorAll('.login-step').forEach(step => {
    step.classList.remove('active');
  });
  const target = document.getElementById(`step${stepNumber}`);
  if (target) {
    target.classList.add('active');
    lucide.createIcons();
  }
}

function goBack(stepNumber) {
  showStep(stepNumber);
}

/* ─────────────────────────────
   ACCOUNT TYPE SELECTION
───────────────────────────── */
function selectType(type) {
  state.accountType = type;

  const personalBtn = document.getElementById('typePersonal');
  const orgBtn = document.getElementById('typeOrg');

  if (personalBtn && orgBtn) {
    personalBtn.classList.toggle('active', type === 'personal');
    orgBtn.classList.toggle('active', type === 'organization');
  }
}

function continueLogin() {
  if (state.accountType === 'personal') {
    showStep(4); // Go straight to permissions for personal
  } else {
    showStep(2); // Go to org type selection
  }
}

/* ─────────────────────────────
   ORGANIZATION TYPE SELECTION
───────────────────────────── */
function selectOrg(type) {
  state.orgType = type;

  // Update all org cards
  document.querySelectorAll('.org-card').forEach(card => {
    card.classList.remove('active');
  });
  event.currentTarget.classList.add('active');

  // Update the label in step 3
  const labels = {
    university: 'University',
    college: 'College',
    ngo: 'NGO',
    company: 'Company',
    startup: 'Startup',
    other: 'Organization',
  };
  const orgTypeLabel = document.getElementById('orgTypeLabel');
  if (orgTypeLabel) orgTypeLabel.textContent = labels[type] || 'Organization';

  // Brief delay then advance to step 3
  setTimeout(() => showStep(3), 180);
}

/* ─────────────────────────────
   ORG FORM SUBMISSION
───────────────────────────── */
function completeOrgSetup() {
  const orgName = document.getElementById('orgName');
  const orgSize = document.getElementById('orgSize');

  if (!orgName || !orgName.value.trim()) {
    shakeInput(orgName);
    return;
  }
  if (!orgSize || !orgSize.value) {
    shakeInput(orgSize?.parentElement);
    return;
  }

  // Store org details in sessionStorage for post-OAuth use
  sessionStorage.setItem('Honourix_org', JSON.stringify({
    type: state.orgType,
    name: orgName.value.trim(),
    website: document.getElementById('orgWebsite')?.value.trim() || '',
    size: orgSize.value,
  }));

  showStep(4);
}

function shakeInput(el) {
  if (!el) return;
  el.style.animation = 'shake 0.4s ease';
  setTimeout(() => { el.style.animation = ''; }, 400);
}

/* ─────────────────────────────
   PERMISSIONS BACK BUTTON
───────────────────────────── */
function goBackFromPermissions() {
  if (state.accountType === 'organization') {
    showStep(3);
  } else {
    showStep(1);
  }
}

/* ─────────────────────────────
   GOOGLE OAUTH TRIGGER
   (Placeholder — connect to backend)
───────────────────────────── */
function handleGoogleLogin() {
  // Store account type before redirect
  sessionStorage.setItem('Honourix_account_type', state.accountType);

  // In production: redirect to your backend's /auth/google endpoint
  // window.location.href = '/auth/google';
  
  // For now, simulate with an overlay
  showOAuthLoader();
}

function triggerGoogleOAuth() {
  sessionStorage.setItem('Honourix_account_type', state.accountType);
  window.location.href = `https://certiflow-backend-73xk.onrender.com/auth/google?type=${state.accountType}`;
}

function showOAuthLoader() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(6,10,18,0.92);
    backdrop-filter: blur(12px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 999;
    gap: 20px;
    font-family: 'DM Sans', sans-serif;
    color: #94a3b8;
    font-size: 0.95rem;
  `;

  overlay.innerHTML = `
    <div style="width:48px;height:48px;border:3px solid rgba(0,212,255,0.2);border-top-color:#00d4ff;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
    <p>Redirecting to Google Sign-In...</p>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;

  document.body.appendChild(overlay);

  // In a real app, you'd redirect here. For demo, navigate to a mock dashboard after 2 seconds.
  setTimeout(() => {
    overlay.innerHTML = `
      <div style="text-align:center;padding:32px;">
        <div style="width:64px;height:64px;background:linear-gradient(135deg,#00d4ff,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <h3 style="font-family:Syne,sans-serif;font-size:1.3rem;font-weight:800;color:#eef2ff;margin-bottom:8px;">Connected Successfully</h3>
        <p style="color:#64748b;font-size:0.88rem;">Redirecting to your dashboard...</p>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;

    // Redirect to dashboard (to be built as dashboard.html)
    setTimeout(() => {
      document.body.removeChild(overlay);
      // window.location.href = '/dashboard';
    }, 1500);
  }, 2000);
}

/* ─────────────────────────────
   INTERSECTION OBSERVER
   Fade-in on scroll
───────────────────────────── */
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -40px 0px',
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, observerOptions);

// Observe all cards and sections
document.querySelectorAll(
  '.tool-card, .feature-card, .use-case-card, .step, .pricing-card, .acard'
).forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// Add visible class style
const style = document.createElement('style');
style.textContent = `
  .visible {
    opacity: 1 !important;
    transform: translateY(0) !important;
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
`;
document.head.appendChild(style);

// Add stagger delay to grid children
document.querySelectorAll('.tools-grid, .features-grid, .use-cases-grid').forEach(grid => {
  grid.querySelectorAll(':scope > *').forEach((child, i) => {
    child.style.transitionDelay = `${i * 80}ms`;
  });
});
