// ═══════════════════════════════════════════════
// STORAGE — localStorage, toast e hooks de ciclo de vida
// ═══════════════════════════════════════════════
import { LS }                          from './config.js';
import { uid }                         from './utils.js';
import {
  att, setAtt, cancelled, setCancelled,
  customEvents, setCustomEvents,
  tasks, setTasks, topics, setTopics,
  userCourses, setUserCourses,
  archivedCourses, setArchivedCourses,
  gerarAulas, rebuildCourses, setSemConfig,
} from './state.js';

// ── Toast ──
let toastTm = null;

// Callback de desfazer — registrado externamente (ui.js) para evitar dep circular
let _undoFn = null;
export function setUndoFn(fn) { _undoFn = fn; }

export let undoBuf = null;
export let undoTm  = null;
export function setUndoBuf(v) { undoBuf = v; }
export function setUndoTm(v)  { undoTm  = v; }

export const listTm = {};

export function showToast(msg, undo = false) {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  const old = el.querySelector('.tundo'); if (old) old.remove();
  if (undo && _undoFn) {
    const b = document.createElement('button');
    b.className = 'tundo'; b.textContent = 'desfazer';
    b.onclick = () => { _undoFn(); el.classList.remove('show'); };
    el.appendChild(b);
  }
  el.classList.add('show');
  if (toastTm) clearTimeout(toastTm);
  toastTm = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 1800);
}

// ── Hook pós-save (registrado pelo app.js para chamar updateFooter sem circular) ──
let _onSaveHook = null;
export function registerSaveHook(fn) { _onSaveHook = fn; }

// ── Persistência no localStorage ──
export function save(quiet = false) {
  localStorage.setItem(LS.att, JSON.stringify(att));
  localStorage.setItem(LS.cancelled, JSON.stringify([...cancelled]));
  const evSerial = customEvents.map(e => ({
    ...e, date: e.date instanceof Date ? e.date.toISOString() : e.date,
  }));
  localStorage.setItem(LS.ev, JSON.stringify(evSerial));
  localStorage.setItem(LS.tasks,  JSON.stringify(tasks));
  localStorage.setItem(LS.topics, JSON.stringify(topics));
  const userCoursesSerial = userCourses.map(c => ({
    id: c.id, nome: c.nome, turma: c.turma, local: c.local,
    horarios: c.horarios, cor: c.cor, cls: c.cls || '',
    ini: c.ini instanceof Date ? c.ini.toISOString() : c.ini,
    fim: c.fim instanceof Date ? c.fim.toISOString() : c.fim,
  }));
  localStorage.setItem(LS.userCourses, JSON.stringify(userCoursesSerial));
  localStorage.setItem(LS.archived, JSON.stringify(archivedCourses));
  if (!quiet) showToast('salvo');
  if (_onSaveHook) _onSaveHook();
}

// ── Leitura do semConfig ──
export function loadSemConfig() {
  try { setSemConfig(JSON.parse(localStorage.getItem(LS.semConfig) || 'null')); }
  catch { setSemConfig(null); }
}

// ── Leitura completa do localStorage ──
export function load() {
  try { setAtt(JSON.parse(localStorage.getItem(LS.att) || '{}')); }
  catch { setAtt({}); }

  try { setCancelled(new Set(JSON.parse(localStorage.getItem(LS.cancelled) || '[]'))); }
  catch { setCancelled(new Set()); }

  try {
    const raw = JSON.parse(localStorage.getItem(LS.ev) || '[]');
    raw.forEach(e => { e.date = new Date(e.date); });
    setCustomEvents(raw);
  } catch { setCustomEvents([]); }

  try {
    const raw = JSON.parse(localStorage.getItem(LS.userCourses) || '[]');
    raw.forEach(c => {
      c.ini = new Date(c.ini);
      c.fim = new Date(c.fim);
      c._aulas      = gerarAulas(c);
      c._totalH     = c._aulas.reduce((s, a) => s + a.horas, 0);
      c._maxFaltasH = Math.floor(c._totalH * 0.25);
    });
    setUserCourses(raw);
  } catch { setUserCourses([]); }

  try { setArchivedCourses(JSON.parse(localStorage.getItem(LS.archived) || '[]')); }
  catch { setArchivedCourses([]); }

  rebuildCourses();

  function mig(raw, defs) {
    if (!raw) return defs.map(t => ({ id: uid(), text: t, checked: false }));
    try {
      const p = JSON.parse(raw);
      if (!Array.isArray(p)) return defs.map(t => ({ id: uid(), text: t, checked: false }));
      if (p.length && typeof p[0] === 'string') return p.map(t => ({ id: uid(), text: t, checked: false }));
      return p;
    } catch { return defs.map(t => ({ id: uid(), text: t, checked: false })); }
  }
  setTasks(mig(localStorage.getItem(LS.tasks), []));
  setTopics(mig(localStorage.getItem(LS.topics), []));

  const sd     = localStorage.getItem(LS.dark);
  const isDark = sd !== null ? sd === 'true' : true;
  if (isDark) {
  document.documentElement.classList.add('dark');
  document.body.classList.add('dark');
    const iconEl  = document.querySelector('#btnDark .hbtn-icon');
    const labelEl = document.querySelector('#btnDark .hbtn-label');
    if (iconEl)  iconEl.textContent  = '☀';
    if (labelEl) labelEl.textContent = ' claro';
  }

  loadSemConfig();
}
