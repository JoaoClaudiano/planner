// ═══════════════════════════════════════════════
// SUPABASE — Cliente, autenticação, BD e fila offline
// ═══════════════════════════════════════════════
import { SUPABASE_URL, SUPABASE_KEY, OFFLINE_MAX_RETRIES, OFFLINE_BACKOFF_BASE_MS } from './config.js';
import { parseDateLocal, fmtDateLocal }                                              from './utils.js';
import {
  att, setAtt, customEvents, setCustomEvents,
  tasks, setTasks, topics, setTopics,
  COURSES,
} from './state.js';
import { save, showToast } from './storage.js';

// ── Cliente Supabase (via CDN carregado antes do módulo) ──
export const sb = (typeof supabase !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ── Usuário autenticado ──
export let supaUser = null;
export function setSupaUser(v) { supaUser = v; }

// ── Rastreamento de saves pendentes (sync badge) ──
let _pendingSaves = 0;
let _hideTimer    = null;

function _updateHeaderChips() {
  const header = document.querySelector('header');
  if (!header) return;
  const ids = ['offlineBadge', 'pendingBadge', 'syncBadge'];
  const hasVisible = ids.some(id => {
    const el = document.getElementById(id);
    return el && el.style.display !== 'none';
  });
  header.classList.toggle('has-chips', hasVisible);
}

function _setSyncBadge(state) {
  const el = document.getElementById('syncBadge');
  if (!el || !supaUser) return;
  clearTimeout(_hideTimer);
  if (state === 'saving') {
    el.textContent = '⟳ salvando...';
    el.className   = 'sync-badge saving';
    el.style.display = '';
  } else if (state === 'saved') {
    el.textContent = '☁ salvo';
    el.className   = 'sync-badge saved';
    el.style.display = '';
    _hideTimer = setTimeout(() => {
      if (_pendingSaves === 0) { el.style.display = 'none'; _updateHeaderChips(); }
    }, 3000);
  } else if (state === 'error') {
    el.textContent = '⚠ erro ao salvar';
    el.className   = 'sync-badge error';
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
  _updateHeaderChips();
}

export function _onSaveStart() {
  _pendingSaves++;
  _setSyncBadge('saving');
}

export function _onSaveEnd(err) {
  _pendingSaves = Math.max(0, _pendingSaves - 1);
  if (err)               { _setSyncBadge('error'); }
  else if (_pendingSaves === 0) { _setSyncBadge('saved'); }
}

// ── Overlays de carregamento ──
export function showLoadOverlay() {
  const el = document.getElementById('loadOverlay');
  if (!el) return;
  el.style.opacity      = '1';
  el.style.pointerEvents = 'all';
}

export function hideLoadOverlay() {
  const el = document.getElementById('loadOverlay');
  if (!el) return;
  el.style.opacity      = '0';
  el.style.pointerEvents = 'none';
}

// ── Helper: executa operação Supabase rastreando pendências ──
export function _sbExec(label, promise) {
  _onSaveStart();
  promise
    .then(({ error }) => { _onSaveEnd(error); })
    .catch(e => { _onSaveEnd(e); });
}

// ── Autenticação ──
export async function checkSession() {
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  if (data?.session) { supaUser = data.session.user; return true; }
  return false;
}

export async function signIn(email, pass) {
  if (!sb) return 'Supabase não configurado.';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) return error.message;
  supaUser = data.user;
  return null;
}

export async function doSignOut() {
  if (sb && supaUser) {
    showLoadOverlay();
    try   { await sbFullSync(); }
    catch { /* ignora erros de sync ao sair */ }
    finally { hideLoadOverlay(); }
  }
  if (sb) await sb.auth.signOut();
  supaUser = null;
  setAtt({});
  setCustomEvents([]);
  setTasks([]);
  setTopics([]);
  sessionStorage.removeItem('fs-guest');
  window.location.href = 'login.html';
}

// ── Leitura completa do Supabase ──
export async function sbLoad() {
  if (!sb || !supaUser) return false;
  try {
    const uid = supaUser.id;
    const [pRes, eRes, tRes, toRes] = await Promise.all([
      sb.from('presencas').select('*').eq('user_id', uid),
      sb.from('eventos').select('*').eq('user_id', uid),
      sb.from('tarefas').select('*').eq('user_id', uid).order('sort_order'),
      sb.from('topicos').select('*').eq('user_id', uid).order('sort_order'),
    ]);

    let loaded = false;

    if (pRes.error) {
      // falha silenciosa; dados locais permanecem
    } else if (pRes.data) {
      const newAtt = {};
      pRes.data.forEach(p => { newAtt[p.aula_id] = p.presente; });
      setAtt(newAtt);
      loaded = true;
    }

    if (eRes.error) {
      // falha silenciosa; dados locais permanecem
    } else if (eRes.data) {
      setCustomEvents(eRes.data.map(e => ({
        id: e.id, nome: e.nome,
        date: parseDateLocal(e.date),
        ini: e.ini, fim: e.fim,
        type: e.type, cor: e.cor, note: e.note || '',
      })));
      loaded = true;
    }

    if (tRes.error) {
      // falha silenciosa; dados locais permanecem
    } else if (tRes.data) {
      if (tRes.data.length > 0) setTasks(tRes.data.map(t => ({ id: t.id, text: t.text, checked: t.checked })));
      loaded = true;
    }

    if (toRes.error) {
      // falha silenciosa; dados locais permanecem
    } else if (toRes.data) {
      if (toRes.data.length > 0) setTopics(toRes.data.map(t => ({ id: t.id, text: t.text, checked: t.checked })));
      loaded = true;
    }

    if (loaded) save(true);
    return loaded;
  } catch {
    showToast('Erro ao carregar dados da nuvem');
    return false;
  }
}

// ── Escritas granulares ──
export function sbSaveAtt(aulaId, presente) {
  if (!sb || !supaUser) return;
  if (!navigator.onLine) {
    offlineUpsertOp({ type: 'sbSaveAtt', aulaId, presente })
      .then(() => updateOfflineBadge())
      .catch(() => {});
    return;
  }
  _sbExec('sbSaveAtt', sb.from('presencas')
    .upsert({ user_id: supaUser.id, aula_id: aulaId, presente },
            { onConflict: 'user_id,aula_id' }));
}

export function sbSaveEvent(ev) {
  if (!sb || !supaUser) return;
  if (!navigator.onLine) {
    offlineUpsertOp({ type: 'sbSaveEvent', entityId: ev.id, ev })
      .then(() => updateOfflineBadge())
      .catch(() => {});
    return;
  }
  _sbExec('sbSaveEvent', sb.from('eventos')
    .upsert({ id: ev.id, user_id: supaUser.id, nome: ev.nome,
              date: fmtDateLocal(ev.date), ini: ev.ini, fim: ev.fim,
              type: ev.type, cor: ev.cor, note: ev.note || '' }));
}

export function sbDeleteEvent(id) {
  if (!sb || !supaUser) return;
  if (!navigator.onLine) {
    offlineUpsertOp({ type: 'sbDeleteEvent', entityId: id, eventId: id })
      .then(() => updateOfflineBadge())
      .catch(() => {});
    return;
  }
  _sbExec('sbDeleteEvent', sb.from('eventos').delete()
    .eq('id', id).eq('user_id', supaUser.id));
}

export function sbSaveItem(type, item, order) {
  if (!sb || !supaUser) return;
  if (!navigator.onLine) {
    offlineUpsertOp({ type: 'sbSaveItem', entityId: item.id, itemType: type, item, order: order || 0 })
      .then(() => updateOfflineBadge())
      .catch(() => {});
    return;
  }
  const table = type === 'task' ? 'tarefas' : 'topicos';
  _sbExec('sbSaveItem', sb.from(table)
    .upsert({ id: item.id, user_id: supaUser.id,
              text: item.text, checked: item.checked,
              sort_order: order || 0 }));
}

export function sbDeleteItem(type, id) {
  if (!sb || !supaUser) return;
  if (!navigator.onLine) {
    offlineUpsertOp({ type: 'sbDeleteItem', entityId: id, itemType: type, itemId: id })
      .then(() => updateOfflineBadge())
      .catch(() => {});
    return;
  }
  const table = type === 'task' ? 'tarefas' : 'topicos';
  _sbExec('sbDeleteItem', sb.from(table).delete()
    .eq('id', id).eq('user_id', supaUser.id));
}

// Sincronização completa (após importação xlsx)
export async function sbFullSync() {
  if (!sb || !supaUser) return;
  const uid = supaUser.id;
  try {
    await sb.from('eventos').delete().eq('user_id', uid);
    if (customEvents.length) {
      await sb.from('eventos').insert(customEvents.map(e => ({
        id: e.id, user_id: uid, nome: e.nome,
        date: fmtDateLocal(e.date),
        ini: e.ini, fim: e.fim, type: e.type, cor: e.cor, note: e.note || '',
      })));
    }
    await sb.from('tarefas').delete().eq('user_id', uid);
    if (tasks.length) {
      await sb.from('tarefas').insert(
        tasks.map((t, i) => ({ id: t.id, user_id: uid, text: t.text, checked: t.checked, sort_order: i }))
      );
    }
    await sb.from('topicos').delete().eq('user_id', uid);
    if (topics.length) {
      await sb.from('topicos').insert(
        topics.map((t, i) => ({ id: t.id, user_id: uid, text: t.text, checked: t.checked, sort_order: i }))
      );
    }
    const attEntries = Object.entries(att);
    if (attEntries.length) {
      await sb.from('presencas').delete().eq('user_id', uid);
      await sb.from('presencas').insert(
        attEntries.map(([aula_id, presente]) => ({ user_id: uid, aula_id, presente }))
      );
    }
  } catch { /* ignora erros de sync completo */ }
}

// ── Fila offline ──
function _offlineBackoffMs(retryCount) {
  return Math.min(OFFLINE_BACKOFF_BASE_MS * 2 ** (retryCount - 1), 60000);
}

export async function updateOfflineBadge() {
  const el = document.getElementById('pendingBadge');
  if (!el) return;
  try {
    const count = await offlineCountPendingOps();
    if (count > 0) {
      el.textContent  = `⏳ ${count} pendente${count !== 1 ? 's' : ''}`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  } catch { el.style.display = 'none'; }
  _updateHeaderChips();
}

export function updateOnlineStatus() {
  const el = document.getElementById('offlineBadge');
  if (el) el.style.display = navigator.onLine ? 'none' : '';
  _updateHeaderChips();
  if (navigator.onLine) processOfflineQueue();
}

export async function processOfflineQueue() {
  if (!sb || !supaUser || !navigator.onLine) return;
  let ops;
  try { ops = await offlineGetOps(); } catch { return; }
  if (!ops.length) return;

  const now   = Date.now();
  const ready = ops.filter(op => {
    if ((op.status || 'pending') === 'failed') return false;
    const retries = op.retryCount || 0;
    if (retries > 0 && now - (op.lastAttempt || 0) < _offlineBackoffMs(retries)) return false;
    return true;
  });
  if (!ready.length) return;

  for (const op of ready) {
    try {
      let error = null;
      if (op.type === 'sbSaveAtt') {
        ({ error } = await sb.from('presencas')
          .upsert({ user_id: supaUser.id, aula_id: op.aulaId, presente: op.presente },
                  { onConflict: 'user_id,aula_id' }));
      } else if (op.type === 'sbSaveItem') {
        const table = op.itemType === 'task' ? 'tarefas' : 'topicos';
        ({ error } = await sb.from(table)
          .upsert({ id: op.item.id, user_id: supaUser.id,
                    text: op.item.text, checked: op.item.checked,
                    sort_order: op.order || 0 }));
      } else if (op.type === 'sbDeleteItem') {
        const table = op.itemType === 'task' ? 'tarefas' : 'topicos';
        ({ error } = await sb.from(table).delete()
          .eq('id', op.itemId).eq('user_id', supaUser.id));
      } else if (op.type === 'sbSaveEvent') {
        const ev = op.ev;
        ({ error } = await sb.from('eventos')
          .upsert({ id: ev.id, user_id: supaUser.id, nome: ev.nome,
                    date: fmtDateLocal(ev.date), ini: ev.ini, fim: ev.fim,
                    type: ev.type, cor: ev.cor, note: ev.note || '' }));
      } else if (op.type === 'sbDeleteEvent') {
        ({ error } = await sb.from('eventos').delete()
          .eq('id', op.eventId).eq('user_id', supaUser.id));
      }
      if (!error) {
        await offlineDeleteOp(op.id);
      } else {
        const newCount = (op.retryCount || 0) + 1;
        await offlineUpdateOp(op.id, {
          retryCount:  newCount,
          status:      newCount >= OFFLINE_MAX_RETRIES ? 'failed' : 'pending',
          lastAttempt: Date.now(),
        });
      }
    } catch {
      const newCount = (op.retryCount || 0) + 1;
      await offlineUpdateOp(op.id, {
        retryCount:  newCount,
        status:      newCount >= OFFLINE_MAX_RETRIES ? 'failed' : 'pending',
        lastAttempt: Date.now(),
      });
    }
  }

  await updateOfflineBadge();
  // Usa importação dinâmica para evitar circular (calendar/attendance importam supabase)
  const [calMod, attMod, uiMod] = await Promise.all([
    import('./calendar.js'),
    import('./attendance.js'),
    import('./ui.js'),
  ]);
  calMod.renderCalendar();
  attMod.renderAttendance();
  uiMod.renderList('task');
  uiMod.renderList('topic');
}

window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

export function hasPendingSaves() { return _pendingSaves > 0; }
