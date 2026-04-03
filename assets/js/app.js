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

// ── Registra hooks inter-módulo ──
registerSaveHook(updateFooter);
setUndoFn(doUndo);
setInitCallback(init);

const GUEST_UPGRADE_BANNER_DELAY_MS = 8000;

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
  setTimeout(scrollToNow, 100);
}

// ─────────────────────────────────────────────────────
// STARTUP ASSÍNCRONO
// ─────────────────────────────────────────────────────
async function startApp() {
  load();

  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      if (session)                     setSupaUser(session.user);
      else if (event === 'SIGNED_OUT') setSupaUser(null);
    });
  }

  showLoadOverlay();
  const isGuest    = sessionStorage.getItem('fs-guest') === '1';
  const hasSession = !isGuest && await checkSession();

  if (hasSession) {
    // Se chegou do fluxo de migração de conta convidada, sincroniza dados locais primeiro
    if (localStorage.getItem('fs-migrate-pending') === '1') {
      localStorage.removeItem('fs-migrate-pending');
      try { await sbFullSync(); } catch (e) { console.warn('Migração:', e); }
    } else {
      const loaded = await sbLoad();
      if (!loaded) console.warn('Falha ao carregar Supabase, usando localStorage');
    }
    document.getElementById('btnLogout').style.display = '';
    init();
    hideLoadOverlay();
    showCriticalAttendanceAlerts();
    updateOnlineStatus();
    updateOfflineBadge();
    initGeoAtt();
    initLocationModal();
    updateGeoBanner();
    setTimeout(initTour, 400);
  } else if (isGuest) {
    document.getElementById('btnLogout').style.display = '';
    init();
    hideLoadOverlay();
    showCriticalAttendanceAlerts();
    updateOnlineStatus();
    updateOfflineBadge();
    initGeoAtt();
    initLocationModal();
    updateGeoBanner();
    setTimeout(initTour, 400);
    // Exibe banner de upgrade de conta após delay se houver dados
    setTimeout(showGuestUpgradeBanner, GUEST_UPGRADE_BANNER_DELAY_MS);
  } else {
    hideLoadOverlay();
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
  navigator.serviceWorker.register('../sw.js')
    .then(() => {
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'SYNC_QUEUE') processOfflineQueue();
      });
    })
    .catch(() => {});
}

startApp();
