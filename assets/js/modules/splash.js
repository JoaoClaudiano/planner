// ═══════════════════════════════════════════════
// SPLASH — PS5-style immersive loading screen
// ═══════════════════════════════════════════════

const AVATAR_COLORS = [
  '#7c3aed','#2563eb','#059669','#d97706',
  '#dc2626','#db2777','#0891b2','#65a30d',
];

const CACHE_KEY             = 'fs-avatar-cache';
const EXIT_ANIMATION_MS     = 900;  // fallback safety timeout matching sp-zoom-out duration
const MIN_SHOW_MS           = 950;  // minimum splash visibility before exit starts
const PARTICLES             = 15;

let _showTs = 0;

// ── Avatar helpers (mirrors account.js logic) ──────────────

function _getInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

function _avatarColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── Cache ───────────────────────────────────────────────────

/**
 * Call after successful auth to prime the cache for the next launch.
 * @param {object} user  supaUser object
 */
export function cacheAvatarFromUser(user) {
  if (!user) return;
  const meta      = user.user_metadata || {};
  const fullName  = meta.full_name || meta.name || '';
  const email     = user.email || '';
  const seed      = fullName || email;
  // avatar_url is a user-uploaded image data URL — not a credential or token.
  const avatarUrl = String(meta.avatar_url || '');
  // Build a non-sensitive display-only cache object (no auth tokens).
  const data = avatarUrl
    ? { type: 'photo', url: avatarUrl }
    : { type: 'initials', initials: _getInitials(seed || '?'), color: _avatarColor(seed || '?') };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full */ }
}

function _readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

// ── DOM builders ────────────────────────────────────────────

function _buildAvatar(cache) {
  const el = document.createElement('div');
  el.className = 'sp-avatar';

  if (cache?.type === 'photo' && cache.url) {
    const img = new Image();
    img.alt  = '';
    img.src  = cache.url;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
    el.appendChild(img);
  } else {
    el.style.background = (cache?.type === 'initials' && cache.color) ? cache.color : '#7c3aed';
    el.textContent      = (cache?.type === 'initials' && cache.initials) ? cache.initials : '?';
  }

  return el;
}

function _spawnParticles(container) {
  for (let i = 0; i < PARTICLES; i++) {
    const p   = document.createElement('span');
    p.className = 'sp-particle';

    // Random polar position in a ring around center (90–220 px radius)
    const angle  = Math.random() * 2 * Math.PI;
    const radius = 90 + Math.random() * 130;
    const x      = Math.cos(angle) * radius;
    const y      = Math.sin(angle) * radius;
    const size   = 2 + Math.random() * 3;
    const op     = (0.12 + Math.random() * 0.45).toFixed(3);
    const dur    = (3.5 + Math.random() * 3.5).toFixed(2);
    const delay  = (Math.random() * 4).toFixed(2);

    p.style.cssText = `
      left:${(50 + x / window.innerWidth  * 100).toFixed(2)}%;
      top: ${(50 + y / window.innerHeight * 100).toFixed(2)}%;
      width:${size.toFixed(1)}px;
      height:${size.toFixed(1)}px;
      --sp-op:${op};
      animation-duration:${dur}s;
      animation-delay:${delay}s;
    `;
    container.appendChild(p);
  }
}

// ── Public API ───────────────────────────────────────────────

export function showSplash() {
  _showTs = Date.now();

  const cache  = _readCache();
  const splash = document.createElement('div');
  splash.id    = 'splashScreen';
  splash.className = 'sp-screen';

  // Nebula accent layer
  const nebula = document.createElement('div');
  nebula.className = 'sp-nebula';
  splash.appendChild(nebula);

  // Avatar
  splash.appendChild(_buildAvatar(cache));

  // Particles (behind avatar via z-index in CSS)
  _spawnParticles(splash);

  document.body.appendChild(splash);

  // Next frame so the browser registers initial state before animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => splash.classList.add('sp-in'));
  });
}

export function hideSplash() {
  return new Promise(resolve => {
    const elapsed = Date.now() - _showTs;
    const wait    = Math.max(0, MIN_SHOW_MS - elapsed);

    setTimeout(() => {
      const splash = document.getElementById('splashScreen');
      if (!splash) { resolve(); return; }

      splash.classList.add('sp-out');

      const done = () => { splash.remove(); resolve(); };
      splash.addEventListener('animationend', done, { once: true });
      // Safety fallback if animationend doesn't fire
      setTimeout(done, EXIT_ANIMATION_MS);
    }, wait);
  });
}
