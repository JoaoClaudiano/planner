// ═══════════════════════════════════════════════
// APP — Ponto de entrada: inicialização e startup
// ═══════════════════════════════════════════════
import { load, registerSaveHook, setUndoFn, showToast } from './modules/storage.js';
import {
  sb, supaUser, setSupaUser, checkSession, sbLoad, sbFullSync,
  showLoadOverlay, hideLoadOverlay, doSignOut,
  updateOnlineStatus, updateOfflineBadge, hasPendingSaves, processOfflineQueue,
}                                                        from './modules/supabase.js';
import {
  renderCalendar, renderSemProg, scrollToNow, initColorRow,
}                                                        from './modules/calendar.js';
import {
  renderAttendance, renderArchivedSection, setInitCallback,
}                                                        from './modules/attendance.js';
import {
  renderList, updateFooter, doUndo, initGeoAtt,
}                                                        from './modules/ui.js';
import { COURSES, calcStats }                            from './modules/state.js';
import { LS }                                            from './modules/config.js';
import { initTour }                                      from './modules/tour.js';
import { initLocationModal, updateGeoBanner }            from './modules/location.js';
import { initAccountModal, autoImportHolidays, registerProfileUpdateHook } from './modules/account.js';
import { getDynamicGreeting, typewriterGreeting }        from './modules/greeting.js';
import { showSplash, hideSplash, cacheAvatarFromUser }   from './modules/splash.js';
import { initDaySummary, openDaySummaryModal }           from './modules/daySummary.js';

// ── Registra hooks inter-módulo ──
registerSaveHook(updateFooter);
setUndoFn(doUndo);
setInitCallback(init);
registerProfileUpdateHook(updateGreeting);

const GUEST_UPGRADE_BANNER_DELAY_MS = 8000;

// ─────────────────────────────────────────────────────
// SAUDAÇÃO DINÂMICA
// ─────────────────────────────────────────────────────
function updateGreeting() {
  const el = document.getElementById('greeting');
  if (!el) return;
  let name = '';
  if (supaUser) {
    const meta = supaUser.user_metadata;
    const full  = (meta && (meta.full_name || meta.name)) || '';
    name = full ? full.split(' ')[0] : supaUser.email.split('@')[0];
  } else {
    // Guest: read name from localStorage if set
    const guestName = localStorage.getItem(LS.guestName);
    if (guestName) name = guestName.split(' ')[0];
  }
  const text = getDynamicGreeting(name || undefined);
  typewriterGreeting(el, text);
  el.onclick = () => openDaySummaryModal();
  el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDaySummaryModal(); } };
}

// ─────────────────────────────────────────────────────
// INIT — renderiza toda a UI
// ─────────────────────────────────────────────────────
export function init() {
  renderCalendar();
  renderSemProg();
  renderAttendance();
  renderList('task');
  renderList('topic');
  renderArchivedSection();
  updateFooter();
  initColorRow();
  updateGreeting();
  setTimeout(scrollToNow, 100);
}

// ─────────────────────────────────────────────────────
// AGENDA ACCORDION
// ─────────────────────────────────────────────────────
const LS_AGENDA_COLLAPSED = 'v3_agendaCollapsed';

function initAgendaToggle() {
  const header = document.getElementById('agendaHeader');
  const btn    = document.getElementById('agendaToggle');
  const body   = document.getElementById('agendaBody');
  if (!btn || !body) return;

  const collapsed = localStorage.getItem(LS_AGENDA_COLLAPSED) === '1';
  if (collapsed) {
    body.classList.add('collapsed');
    btn.classList.add('collapsed');
    btn.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    const isNowCollapsed = body.classList.toggle('collapsed');
    btn.classList.toggle('collapsed', isNowCollapsed);
    btn.setAttribute('aria-expanded', String(!isNowCollapsed));
    localStorage.setItem(LS_AGENDA_COLLAPSED, isNowCollapsed ? '1' : '0');
  }

  if (header) {
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    header.setAttribute('tabindex', '0');
    header.setAttribute('role', 'button');
  } else {
    btn.addEventListener('click', toggle);
  }
}

initAgendaToggle();

// ─────────────────────────────────────────────────────
// STARTUP ASSÍNCRONO
// ─────────────────────────────────────────────────────
async function startApp() {
  load();
  showSplash();

  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      if (session)                     setSupaUser(session.user);
      else if (event === 'SIGNED_OUT') setSupaUser(null);
    });
  }

  const isGuest    = sessionStorage.getItem('fs-guest') === '1';
  const hasSession = !isGuest && await checkSession();

  if (hasSession) {
    // Se chegou do fluxo de migração de conta convidada, sincroniza dados locais primeiro
    if (localStorage.getItem('fs-migrate-pending') === '1') {
      localStorage.removeItem('fs-migrate-pending');
      try { await sbFullSync(); } catch { /* ignora erros de migração */ }
    } else {
      const loaded = await sbLoad();
    }
    cacheAvatarFromUser(supaUser);
    document.getElementById('btnAccount').style.display = '';
    initAccountModal();
    init();
    initDaySummary();
    await hideSplash();
    showCriticalAttendanceAlerts();
    updateOnlineStatus();
    updateOfflineBadge();
    initGeoAtt();
    initLocationModal();
    updateGeoBanner();
    setTimeout(initTour, 400);
    // Auto-import national holidays and cancel classes on those dates (once per year)
    setTimeout(() => autoImportHolidays({ silent: true }).then(() => {
      renderCalendar(); renderAttendance();
    }), 2000);
  } else if (isGuest) {
    document.getElementById('btnAccount').style.display = '';
    document.getElementById('btnLogout').style.display = '';
    initAccountModal();
    init();
    initDaySummary();
    await hideSplash();
    showCriticalAttendanceAlerts();
    updateOnlineStatus();
    updateOfflineBadge();
    initGeoAtt();
    initLocationModal();
    updateGeoBanner();
    setTimeout(initTour, 400);
    // Exibe banner de upgrade de conta após delay se houver dados
    setTimeout(showGuestUpgradeBanner, GUEST_UPGRADE_BANNER_DELAY_MS);
    // Auto-import national holidays (once per year) — available also for guests
    setTimeout(() => autoImportHolidays({ silent: true }).then(() => {
      renderCalendar(); renderAttendance();
    }), 2000);
  } else {
    await hideSplash();
    window.location.href = 'login.html';
  }
}

function showCriticalAttendanceAlerts() {
  COURSES.forEach(c => {
    const s = calcStats(c);
    if (s.hRestantes <= 1 && !s.reprovado) {
      setTimeout(() => showToast(`🚨 ${c.nome}: apenas ${Math.max(0, s.hRestantes)}h restante!`), 1500);
    }
  });
}

// ── Banner de upgrade de conta (convidados) ──────────
function showGuestUpgradeBanner() {
  // Só exibe se houver ao menos uma disciplina ou tarefa
  const hasTasks   = (JSON.parse(localStorage.getItem(LS.tasks)  || '[]')).length > 0;
  const hasTopics  = (JSON.parse(localStorage.getItem(LS.topics) || '[]')).length > 0;
  const hasAttData = Object.keys(JSON.parse(localStorage.getItem(LS.att) || '{}')).length > 0;
  if (!hasTasks && !hasTopics && !hasAttData) return;

  const banner = document.getElementById('guestUpgradeBanner');
  if (!banner || banner.dataset.dismissed) return;
  banner.classList.add('show');

  document.getElementById('guestUpgradeCreate')?.addEventListener('click', () => {
    localStorage.setItem('fs-migrate-pending', '1');
    window.location.href = 'login.html?migrate=1';
  });
  document.getElementById('guestUpgradeDismiss')?.addEventListener('click', () => {
    banner.classList.remove('show');
    banner.dataset.dismissed = '1';
  });
}

// ── Logout ──
document.getElementById('btnLogout').addEventListener('click', () => doSignOut());

// ── Re-render a cada minuto ──
setInterval(() => {
  renderCalendar();
  renderSemProg();
  renderAttendance();
  renderArchivedSection();
  updateFooter();
}, 60000);

// ── Sincronização automática a cada 30 s ──
let _syncing = false;
setInterval(async () => {
  if (!sb || !supaUser || _syncing || hasPendingSaves()) return;
  _syncing = true;
  try {
    const ok = await sbLoad();
    if (ok) {
      renderCalendar(); renderSemProg(); renderAttendance();
      renderList('task'); renderList('topic');
      renderArchivedSection(); updateFooter();
    }
  } finally { _syncing = false; }
}, 30000);

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => {
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'SYNC_QUEUE') processOfflineQueue();
      });
    })
    .catch(() => {});
}

startApp();
