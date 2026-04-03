// ═══════════════════════════════════════════════
// SPLASH — PS5-style immersive loading screen
// ═══════════════════════════════════════════════

const AVATAR_COLORS = [
  '#7c3aed','#2563eb','#059669','#d97706',
  '#dc2626','#db2777','#0891b2','#65a30d',
];

// Particle colour palette: [centre colour, outer glow colour]
const PARTICLE_COLORS = [
  ['rgba(210,230,255,.95)', 'rgba(160,190,255,.25)'],   // cool blue-white
  ['rgba(235,210,255,.95)', 'rgba(190,140,255,.25)'],   // soft purple
  ['rgba(185,245,255,.92)', 'rgba(90,210,240,.22)'],    // cyan
  ['rgba(255,245,175,.90)', 'rgba(255,210,95,.20)'],    // warm gold
];

const CACHE_KEY             = 'fs-avatar-cache';
const EXIT_ANIMATION_MS     = 900;   // fallback safety timeout matching sp-zoom-out duration
const MIN_SHOW_MS           = 1950;  // minimum splash visibility before exit starts (+1 s)
const PARTICLES             = 80;

// Brownian / firefly motion constants
const BROWNIAN_FORCE     = 0.09;   // random nudge magnitude per frame
const DAMPING            = 0.93;   // velocity decay per frame
const BASE_MAX_SPEED     = 1.4;    // max px/frame at idle
const ACTIVE_SPEED_MUL   = 2.5;   // speed multiplier after avatar click

// Impulse burst constants (random dart motion like real fireflies)
const IMPULSE_INTERVAL_MIN = 60;   // minimum frames between bursts (~1 s at 60 fps)
const IMPULSE_INTERVAL_MAX = 300;  // maximum frames between bursts (~5 s at 60 fps)
const IMPULSE_STRENGTH_MIN = 1.5;  // min velocity kick (px/frame)
const IMPULSE_STRENGTH_MAX = 3.5;  // max velocity kick (px/frame)

// Convergence constants
const CONVERGENCE_LERP     = 0.025;  // fraction of distance closed per frame (~78% in 1 s at 60 fps)
const CONVERGENCE_ARRIVE_R = 32;     // px from avatar centre — particle starts fading out

// Depth-parallax constants
const PARALLAX_STRENGTH = 0.032;  // max parallax shift as fraction of half-screen per depth unit

let _showTs       = 0;
let _clickResolve = null;
let _clickPromise = null;
let _particles    = [];
let _rafId        = null;
let _speedMul     = 1;
let _converging   = false;
let _avatarCX     = 0;
let _avatarCY     = 0;
let _mouseX       = 0;   // cursor position for parallax (centre = 0)
let _mouseY       = 0;
let _offMouseMove = null; // references for cleanup
let _offTouchMove = null;

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
  _particles = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < PARTICLES; i++) {
    const p     = document.createElement('span');
    p.className = 'sp-particle';

    // depth: 0 = far background, 1 = close foreground
    const depth      = Math.random();
    const size       = 0.9  + depth * 4.6;                   // far=tiny speck, near=large orb
    const maxOp      = 0.18 + depth * 0.62;                  // far=visible, near=bright
    const rate       = 0.008 + depth * 0.040;                // far=slow flicker, near=fast
    const speedScale = 0.35  + depth * 1.1;                  // far=sluggish, near=lively

    const col = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    p.style.cssText = `width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;` +
      `background:radial-gradient(circle,${col[0]} 0%,${col[1]} 100%);`;
    frag.appendChild(p);
    _particles.push({
      el:           p,
      x:            Math.random() * window.innerWidth,
      y:            Math.random() * window.innerHeight,
      vx:           (Math.random() - 0.5) * 1.2,
      vy:           (Math.random() - 0.5) * 1.2,
      phase:        Math.random() * Math.PI * 2,
      impulseTimer: Math.floor(Math.random() * IMPULSE_INTERVAL_MAX),
      depth, rate, maxOp, speedScale,
    });
  }
  container.appendChild(frag);
}

function _tickParticles() {
  const mul = _speedMul;
  const ww  = window.innerWidth;
  const wh  = window.innerHeight;

  for (const pt of _particles) {
    const effMul = pt.speedScale * mul;

    if (_converging) {
      // ── Convergence mode: near particles close in faster ──
      const lerpF = CONVERGENCE_LERP * (0.4 + 0.6 * pt.depth);
      pt.x += (_avatarCX - pt.x) * lerpF + (Math.random() - 0.5) * 0.4;
      pt.y += (_avatarCY - pt.y) * lerpF + (Math.random() - 0.5) * 0.4;

      pt.phase += pt.rate;
      const d    = Math.hypot(_avatarCX - pt.x, _avatarCY - pt.y);
      const fade = d < CONVERGENCE_ARRIVE_R ? d / CONVERGENCE_ARRIVE_R : 1;
      const op   = pt.maxOp * (0.55 + 0.45 * Math.sin(pt.phase)) * fade;

      // parallax offset (near particles shift more)
      const px = pt.x + _mouseX * pt.depth * PARALLAX_STRENGTH;
      const py = pt.y + _mouseY * pt.depth * PARALLAX_STRENGTH;
      pt.el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
      pt.el.style.opacity   = op.toFixed(3);
    } else {
      // ── Normal mode: depth-scaled Brownian motion ──
      pt.vx += (Math.random() - 0.5) * BROWNIAN_FORCE * effMul;
      pt.vy += (Math.random() - 0.5) * BROWNIAN_FORCE * effMul;

      // Random impulse burst — makes particles dart like real fireflies
      pt.impulseTimer--;
      if (pt.impulseTimer <= 0) {
        const angle   = Math.random() * Math.PI * 2;
        const strength = (IMPULSE_STRENGTH_MIN + Math.random() * (IMPULSE_STRENGTH_MAX - IMPULSE_STRENGTH_MIN)) * pt.speedScale;
        pt.vx += Math.cos(angle) * strength;
        pt.vy += Math.sin(angle) * strength;
        pt.impulseTimer = IMPULSE_INTERVAL_MIN + Math.floor(Math.random() * (IMPULSE_INTERVAL_MAX - IMPULSE_INTERVAL_MIN));
      }

      pt.vx *= DAMPING;
      pt.vy *= DAMPING;

      const maxSpd = BASE_MAX_SPEED * effMul;
      const spd    = Math.hypot(pt.vx, pt.vy);
      if (spd > maxSpd) { const s = maxSpd / spd; pt.vx *= s; pt.vy *= s; }

      pt.x += pt.vx;
      pt.y += pt.vy;

      if (pt.x < 0)  pt.x += ww;
      if (pt.x > ww) pt.x -= ww;
      if (pt.y < 0)  pt.y += wh;
      if (pt.y > wh) pt.y -= wh;

      pt.phase += pt.rate * effMul;
      const op = pt.maxOp * (0.65 + 0.35 * Math.sin(pt.phase));

      // parallax offset (near particles shift more with cursor)
      const px = pt.x + _mouseX * pt.depth * PARALLAX_STRENGTH;
      const py = pt.y + _mouseY * pt.depth * PARALLAX_STRENGTH;
      pt.el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
      pt.el.style.opacity   = op.toFixed(3);
    }
  }

  _rafId = requestAnimationFrame(_tickParticles);
}

function _startParticles() {
  if (_rafId !== null) return;
  _tickParticles();
}

function _stopParticles() {
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
  _particles  = [];
  _converging = false;
  _mouseX     = 0;
  _mouseY     = 0;
  const splash = document.getElementById('splashScreen');
  if (splash && _offMouseMove) splash.removeEventListener('mousemove', _offMouseMove);
  if (splash && _offTouchMove) splash.removeEventListener('touchmove', _offTouchMove);
  _offMouseMove = null;
  _offTouchMove = null;
}

// ── Public API ───────────────────────────────────────────────

export function showSplash() {
  _showTs     = Date.now();
  _speedMul   = 1;
  _converging = false;
  _mouseX     = 0;
  _mouseY     = 0;

  // Lock scroll on the underlying page so it cannot bleed through the fixed overlay
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow            = 'hidden';

  // Gate that resolves only after the user clicks the avatar
  _clickPromise = new Promise(res => { _clickResolve = res; });

  const cache  = _readCache();
  const splash = document.createElement('div');
  splash.id    = 'splashScreen';
  splash.className = 'sp-screen';

  // Nebula accent layer (hidden until sp-active)
  const nebula = document.createElement('div');
  nebula.className = 'sp-nebula';
  splash.appendChild(nebula);

  // Avatar
  const avatar = _buildAvatar(cache);
  splash.appendChild(avatar);

  // Particles — Brownian firefly loop started after sp-idle is added
  _spawnParticles(splash);

  document.body.appendChild(splash);

  // Next frame so the browser registers initial state before animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      splash.classList.add('sp-idle');
      _startParticles();
    });
  });

  // Mouse/touch parallax — offset relative to screen centre
  _offMouseMove = e => {
    _mouseX = e.clientX - window.innerWidth  * 0.5;
    _mouseY = e.clientY - window.innerHeight * 0.5;
  };
  _offTouchMove = e => {
    const t = e.touches[0];
    _mouseX = t.clientX - window.innerWidth  * 0.5;
    _mouseY = t.clientY - window.innerHeight * 0.5;
  };
  splash.addEventListener('mousemove', _offMouseMove);
  splash.addEventListener('touchmove', _offTouchMove, { passive: true });

  // Clicking the avatar triggers the immersive transition
  avatar.addEventListener('click', () => {
    const rect = avatar.getBoundingClientRect();
    _avatarCX  = rect.left + rect.width  / 2;
    _avatarCY  = rect.top  + rect.height / 2;
    _converging = true;
    splash.classList.remove('sp-idle');
    splash.classList.add('sp-active');
    _speedMul = ACTIVE_SPEED_MUL;          // speed up fireflies on click
    _showTs = Date.now(); // MIN_SHOW_MS countdown begins from the click
    if (_clickResolve) { _clickResolve(); _clickResolve = null; }
  }, { once: true });
}

export function hideSplash() {
  return new Promise(resolve => {
    // Wait for the user to click the avatar before starting the exit
    const gate = _clickPromise || Promise.resolve();
    gate.then(() => {
      const elapsed = Date.now() - _showTs;
      const wait    = Math.max(0, MIN_SHOW_MS - elapsed);

      setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (!splash) {
          _stopParticles();
          document.documentElement.style.overflow = '';
          document.body.style.overflow            = '';
          resolve();
          return;
        }

        splash.classList.add('sp-out');
        _stopParticles();

        const done = () => {
          splash.remove();
          // Restore scroll now that the overlay is gone
          document.documentElement.style.overflow = '';
          document.body.style.overflow            = '';
          resolve();
        };
        splash.addEventListener('animationend', done, { once: true });
        // Safety fallback if animationend doesn't fire
        setTimeout(done, EXIT_ANIMATION_MS);
      }, wait);
    });
  });
}
