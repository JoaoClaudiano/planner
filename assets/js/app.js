// ═══════════════════════════════════════════════
// APP — Ponto de entrada: inicialização e startup
// ═══════════════════════════════════════════════
import { load, registerSaveHook, setUndoFn, showToast } from './modules/storage.js';
import {
  sb, supaUser, setSupaUser, checkSession, sbLoad,
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

// ── Registra hooks inter-módulo ──
registerSaveHook(updateFooter);
setUndoFn(doUndo);
setInitCallback(init);

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
    const loaded = await sbLoad();
    if (!loaded) console.warn('Falha ao carregar Supabase, usando localStorage');
    document.getElementById('btnLogout').style.display = '';
    init();
    hideLoadOverlay();
    showCriticalAttendanceAlerts();
    updateOnlineStatus();
    updateOfflineBadge();
    initGeoAtt();
  } else if (isGuest) {
    document.getElementById('btnLogout').style.display = '';
    init();
    hideLoadOverlay();
    showCriticalAttendanceAlerts();
    updateOnlineStatus();
    updateOfflineBadge();
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
