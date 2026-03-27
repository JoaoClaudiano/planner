'use strict';
(function () {

// ═══════════════════════════════════════════════
// SUPABASE — CONFIGURAÇÃO
// Substitua pelos valores do seu projeto em https://app.supabase.com
// ═══════════════════════════════════════════════
const SUPABASE_URL = 'https://wpxfhdlrygvucbmyfqaa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Hk9OZq-sfye_BWxtHESWag_5XxSZbMl';
// Cliente Supabase (disponível via CDN incluído no index.html)
const sb = (typeof supabase !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ═══════════════════════════════════════════════
// DADOS
// ═══════════════════════════════════════════════
// dia: 0=dom,1=seg,2=ter,3=qua,4=qui,5=sex,6=sab (igual JS getDay())
const BASE_COURSES = [
  { id:'TC0610', nome:'Materiais Betuminosos',        turma:'01', local:'Bloco 708 – Sala 24',
    horarios:[{dia:3,ini:14,fim:17}],    // Quarta 14–17h (3h/aula)
    ini:new Date(2026,2,2), fim:new Date(2026,6,7), cls:'c1', cor:'#f59e0b' },
  { id:'TB0793', nome:'Resistência dos Materiais I',  turma:'02', local:'Bloco 708 – Sala 23',
    horarios:[{dia:2,ini:14,fim:16},{dia:4,ini:14,fim:16}], // Ter+Qui 14–16h (2h/aula)
    ini:new Date(2026,2,2), fim:new Date(2026,6,7), cls:'c2', cor:'#3b82f6' },
  { id:'TD0022', nome:'Instalações Hidrossanitárias', turma:'01', local:'Bloco 727 – Sala 21',
    horarios:[{dia:1,ini:10,fim:13}],    // Segunda 10–13h (3h/aula)
    ini:new Date(2026,2,2), fim:new Date(2026,6,7), cls:'c3', cor:'#8b5cf6' },
  { id:'TD0023', nome:'Sistemas de Abastecimento',    turma:'01', local:'Bloco 708 – Sala 22',
    horarios:[{dia:1,ini:8,fim:10}],     // Segunda 8–10h (2h/aula)
    ini:new Date(2026,2,2), fim:new Date(2026,6,7), cls:'c4', cor:'#10b981' },
];

// Gera todas as aulas do semestre para cada curso
function gerarAulas(c) {
  const out = [];
  c.horarios.forEach(h => {
    let d = new Date(c.ini);
    while (d.getDay() !== h.dia) d.setDate(d.getDate() + 1);
    while (d <= c.fim) {
      const horas = h.fim - h.ini;
      out.push({
        id: `${c.id}-${d.toISOString().slice(0,10)}-${h.ini}`,
        cursoId: c.id, date: new Date(d),
        ini: h.ini, fim: h.fim, horas,
      });
      d = new Date(d); d.setDate(d.getDate() + 7);
    }
  });
  return out.sort((a,b) => a.date - b.date || a.ini - b.ini);
}
BASE_COURSES.forEach(c => {
  c._aulas = gerarAulas(c);
  // carga horária total e máximo de faltas em horas
  c._totalH = c._aulas.reduce((s,a) => s + a.horas, 0);
  c._maxFaltasH = Math.floor(c._totalH * 0.25); // 25% da CH
});

// ── Cursos ativos (BASE + usuário, sem arquivados) ──
let COURSES = [...BASE_COURSES]; // reconstruído após load()
let AULA_MAP = {};               // reconstruído por rebuildAulaMap()

function rebuildAulaMap() {
  AULA_MAP = {};
  COURSES.forEach(c => c._aulas.forEach(a => { AULA_MAP[a.id] = { aula:a, curso:c }; }));
}

function rebuildCourses() {
  const archivedIds = new Set(archivedCourses.map(a => a.courseId));
  COURSES = [...BASE_COURSES, ...userCourses].filter(c => !archivedIds.has(c.id));
  rebuildAulaMap();
}

// Inicializa com apenas os cursos base (sem user courses ainda)
rebuildAulaMap();

// ═══════════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════════
const LS = { att:'v3_att', ev:'v3_ev', tasks:'v3_tasks', topics:'v3_topics', dark:'v3_dark',
             userCourses:'v3_userCourses', archived:'v3_archived', cancelled:'v3_cancelled' };
let att = {};           // { aulaId: bool }
let cancelled = new Set(); // aulaIds de aulas canceladas (feriado, professor etc.)
let customEvents = [];  // [{id,nome,date,ini,fim,type,cor,note}]
let tasks  = [];        // [{id,text,checked}]
let topics = [];        // [{id,text,checked}]
let userCourses    = []; // cursos adicionados pelo usuário
let archivedCourses = []; // snapshots de disciplinas arquivadas
let undoBuf = null, undoTm = null;
const listTm = {};
let supaUser = null; // usuário autenticado no Supabase
let _pendingSaves = 0;  // contador de gravações Supabase em andamento

function _onSaveStart() {
  _pendingSaves++;
  _setSyncBadge('saving');
}

function _onSaveEnd(err) {
  _pendingSaves = Math.max(0, _pendingSaves - 1);
  if (err) {
    _setSyncBadge('error');
  } else if (_pendingSaves === 0) {
    _setSyncBadge('saved');
  }
}

function _setSyncBadge(state) {
  const el = document.getElementById('syncBadge');
  if (!el || !supaUser) return;
  clearTimeout(_setSyncBadge._hideTimer);
  if (state === 'saving') {
    el.textContent = '⟳ salvando...';
    el.className = 'sync-badge saving';
    el.style.display = '';
  } else if (state === 'saved') {
    el.textContent = '☁ salvo';
    el.className = 'sync-badge saved';
    el.style.display = '';
    _setSyncBadge._hideTimer = setTimeout(() => {
      if (_pendingSaves === 0) el.style.display = 'none';
    }, 3000);
  } else if (state === 'error') {
    el.textContent = '⚠ erro ao salvar';
    el.className = 'sync-badge error';
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}
_setSyncBadge._hideTimer = null;

function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
// Valida que o valor é uma cor hexadecimal (#RRGGBB) para evitar injeção de CSS
function sanitizeCor(cor) { return /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#6366f1'; }

function load() {
  try { att = JSON.parse(localStorage.getItem(LS.att) || '{}'); } catch { att = {}; }
  try { cancelled = new Set(JSON.parse(localStorage.getItem(LS.cancelled) || '[]')); } catch { cancelled = new Set(); }
  try { customEvents = JSON.parse(localStorage.getItem(LS.ev) || '[]'); } catch { customEvents = []; }
  // Restaurar datas como Date objects
  customEvents.forEach(e => { e.date = new Date(e.date); });

  // Carregar disciplinas do usuário
  try {
    userCourses = JSON.parse(localStorage.getItem(LS.userCourses) || '[]');
    userCourses.forEach(c => {
      c.ini = new Date(c.ini);
      c.fim = new Date(c.fim);
      c._aulas = gerarAulas(c);
      c._totalH = c._aulas.reduce((s,a) => s + a.horas, 0);
      c._maxFaltasH = Math.floor(c._totalH * 0.25);
    });
  } catch { userCourses = []; }

  // Carregar disciplinas arquivadas
  try {
    archivedCourses = JSON.parse(localStorage.getItem(LS.archived) || '[]');
  } catch { archivedCourses = []; }

  // Reconstruir lista de cursos ativos e mapa de aulas
  rebuildCourses();

  function mig(raw, defs) {
    if (!raw) return defs.map(t => ({id:uid(),text:t,checked:false}));
    try {
      const p = JSON.parse(raw);
      if (!Array.isArray(p)) return defs.map(t => ({id:uid(),text:t,checked:false}));
      if (p.length && typeof p[0] === 'string') return p.map(t => ({id:uid(),text:t,checked:false}));
      return p;
    } catch { return defs.map(t => ({id:uid(),text:t,checked:false})); }
  }
  tasks  = mig(localStorage.getItem(LS.tasks),  ['Revisar Materiais Betuminosos cap.2','Exercícios Resistência dos Materiais','Resumo Instalações Hidrossanitárias']);
  topics = mig(localStorage.getItem(LS.topics), ['TC0610 – ligantes betuminosos','TC0610 – ensaio de penetração','TB0793 – lei de Hooke','TD0022 – ramais e colunas']);

  const sd = localStorage.getItem(LS.dark);
  // Default: dark ON (only override if user explicitly chose light)
  const isDark = sd !== null ? sd === 'true' : true;
  if (isDark) {
    document.body.classList.add('dark');
    document.getElementById('btnDark').textContent = '☀ claro';
  }
}

function save(quiet=false) {
  localStorage.setItem(LS.att, JSON.stringify(att));
  localStorage.setItem(LS.cancelled, JSON.stringify([...cancelled]));
  // Serializar eventos com data ISO
  const evSerial = customEvents.map(e => ({...e, date: e.date instanceof Date ? e.date.toISOString() : e.date}));
  localStorage.setItem(LS.ev, JSON.stringify(evSerial));
  localStorage.setItem(LS.tasks, JSON.stringify(tasks));
  localStorage.setItem(LS.topics, JSON.stringify(topics));
  // Serializar disciplinas do usuário (sem _aulas, regeneradas no load)
  const userCoursesSerial = userCourses.map(c => ({
    id: c.id, nome: c.nome, turma: c.turma, local: c.local,
    horarios: c.horarios, cor: c.cor, cls: c.cls||'',
    ini: c.ini instanceof Date ? c.ini.toISOString() : c.ini,
    fim: c.fim instanceof Date ? c.fim.toISOString() : c.fim
  }));
  localStorage.setItem(LS.userCourses, JSON.stringify(userCoursesSerial));
  localStorage.setItem(LS.archived, JSON.stringify(archivedCourses));
  if (!quiet) showToast('salvo');
  updateFooter();
}

// ═══════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════
let toastTm = null;
function showToast(msg, undo=false) {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  const old = el.querySelector('.tundo'); if (old) old.remove();
  if (undo) {
    const b = document.createElement('button'); b.className = 'tundo'; b.textContent = 'desfazer';
    b.onclick = () => { doUndo(); el.classList.remove('show'); };
    el.appendChild(b);
  }
  el.classList.add('show');
  if (toastTm) clearTimeout(toastTm);
  toastTm = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 1800);
}
function doUndo() {
  if (!undoBuf) return;
  const {type, item, index} = undoBuf;
  const arr = type === 'task' ? tasks : topics;
  arr.splice(index, 0, item);
  // Recalcula sort_order de todos os itens após re-inserção para garantir consistência no Supabase
  arr.forEach((t, i) => sbSaveItem(type, t, i));
  save(true); renderList(type); undoBuf = null;
}

// ═══════════════════════════════════════════════
// AUTENTICAÇÃO E SUPABASE
// ═══════════════════════════════════════════════
function showLoginOverlay()  { window.location.href = 'login.html'; }
function showLoadOverlay()   { document.getElementById('loadOverlay').classList.add('show'); }
function hideLoadOverlay()   { document.getElementById('loadOverlay').classList.remove('show'); }

async function checkSession() {
  if (!sb) return false;
  const { data: { session } } = await sb.auth.getSession();
  if (session) { supaUser = session.user; return true; }
  return false;
}

async function signIn(email, pass) {
  if (!sb) { return 'Supabase não configurado. Substitua SUPABASE_URL e SUPABASE_KEY em app.js.'; }
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { return error.message; } // retorna mensagem de erro
  supaUser = data.user;
  return null; // sem erro
}

async function doSignOut() {
  if (sb && supaUser) {
    showLoadOverlay();
    try {
      await sbFullSync();
    } catch (e) {
      console.error('Erro ao sincronizar antes de sair:', e);
    } finally {
      hideLoadOverlay();
    }
  }
  if (sb) await sb.auth.signOut();
  supaUser = null;
  att = {}; customEvents = []; tasks = []; topics = [];
  sessionStorage.removeItem('fs-guest');
  window.location.href = 'login.html';
}

// ── Leitura completa do Supabase ──
async function sbLoad() {
  if (!sb || !supaUser) return false;
  try {
    const uid = supaUser.id;
    const [pRes, eRes, tRes, toRes] = await Promise.all([
      sb.from('presencas').select('*').eq('user_id', uid),
      sb.from('eventos').select('*').eq('user_id', uid),
      sb.from('tarefas').select('*').eq('user_id', uid).order('sort_order'),
      sb.from('topicos').select('*').eq('user_id', uid).order('sort_order'),
    ]);

    if (pRes.error) {
      console.error('Erro ao carregar presenças:', pRes.error);
      return false;
    }
    if (eRes.error) {
      console.error('Erro ao carregar eventos:', eRes.error);
      return false;
    }
    if (tRes.error) {
      console.error('Erro ao carregar tarefas:', tRes.error);
      return false;
    }
    if (toRes.error) {
      console.error('Erro ao carregar tópicos:', toRes.error);
      return false;
    }

    if (pRes.data) {
      att = {};
      pRes.data.forEach(p => { att[p.aula_id] = p.presente; });
    }

    if (eRes.data) {
      customEvents = eRes.data.map(e => ({
        id: e.id, nome: e.nome,
        date: parseDateLocal(e.date),
        ini: e.ini, fim: e.fim,
        type: e.type, cor: e.cor, note: e.note || ''
      }));
    }

    if (tRes.data && tRes.data.length > 0) {
      tasks = tRes.data.map(t => ({ id: t.id, text: t.text, checked: t.checked }));
    }

    if (toRes.data && toRes.data.length > 0) {
      topics = toRes.data.map(t => ({ id: t.id, text: t.text, checked: t.checked }));
    }

    // Persiste no cache local para uso offline
    save(true);
    return true;
  } catch (err) {
    console.error('Erro ao carregar do Supabase:', err);
    return false;
  }
}

// ── Escrita granular (com rastreamento de saves pendentes) ──
// Helper: rastreia início/fim da operação e exibe badge de sincronização
function _sbExec(label, promise) {
  _onSaveStart();
  promise
    .then(({ error }) => { if (error) console.error(label, error); _onSaveEnd(error); })
    .catch(e => { console.error(label, e); _onSaveEnd(e); });
}

function sbSaveAtt(aulaId, presente) {
  if (!sb || !supaUser) return;
  // Se offline, enfileira a operação para sincronizar depois (deduplicação por aulaId)
  if (!navigator.onLine) {
    offlineUpsertOp({ type: 'sbSaveAtt', aulaId, presente })
      .then(() => updateOfflineBadge())
      .catch(e => console.error('Erro ao enfileirar sbSaveAtt:', e));
    return;
  }
  _sbExec('sbSaveAtt', sb.from('presencas')
    .upsert({ user_id: supaUser.id, aula_id: aulaId, presente },
            { onConflict: 'user_id,aula_id' }));
}

function sbSaveEvent(ev) {
  if (!sb || !supaUser) return;
  const dateStr = fmtDateLocal(ev.date);
  _sbExec('sbSaveEvent', sb.from('eventos')
    .upsert({ id: ev.id, user_id: supaUser.id, nome: ev.nome,
              date: dateStr, ini: ev.ini, fim: ev.fim,
              type: ev.type, cor: ev.cor, note: ev.note || '' }));
}

function sbDeleteEvent(id) {
  if (!sb || !supaUser) return;
  _sbExec('sbDeleteEvent', sb.from('eventos').delete()
    .eq('id', id).eq('user_id', supaUser.id));
}

function sbSaveItem(type, item, order) {
  if (!sb || !supaUser) return;
  const table = type === 'task' ? 'tarefas' : 'topicos';
  _sbExec('sbSaveItem', sb.from(table)
    .upsert({ id: item.id, user_id: supaUser.id,
              text: item.text, checked: item.checked,
              sort_order: order || 0 }));
}

function sbDeleteItem(type, id) {
  if (!sb || !supaUser) return;
  const table = type === 'task' ? 'tarefas' : 'topicos';
  _sbExec('sbDeleteItem', sb.from(table).delete()
    .eq('id', id).eq('user_id', supaUser.id));
}

// Sincronização completa (usado após importação)
async function sbFullSync() {
  if (!sb || !supaUser) return;
  const uid = supaUser.id;
  try {
    // Eventos: apagar todos e reinserir
    await sb.from('eventos').delete().eq('user_id', uid);
    if (customEvents.length) {
      await sb.from('eventos').insert(customEvents.map(e => ({
        id: e.id, user_id: uid, nome: e.nome,
        date: fmtDateLocal(e.date),
        ini: e.ini, fim: e.fim, type: e.type, cor: e.cor, note: e.note || ''
      })));
    }
    // Tarefas
    await sb.from('tarefas').delete().eq('user_id', uid);
    if (tasks.length) {
      await sb.from('tarefas').insert(
        tasks.map((t, i) => ({ id: t.id, user_id: uid, text: t.text, checked: t.checked, sort_order: i }))
      );
    }
    // Tópicos
    await sb.from('topicos').delete().eq('user_id', uid);
    if (topics.length) {
      await sb.from('topicos').insert(
        topics.map((t, i) => ({ id: t.id, user_id: uid, text: t.text, checked: t.checked, sort_order: i }))
      );
    }
    // Presenças
    const attEntries = Object.entries(att);
    if (attEntries.length) {
      await sb.from('presencas').delete().eq('user_id', uid);
      await sb.from('presencas').insert(
        attEntries.map(([aula_id, presente]) => ({ user_id: uid, aula_id, presente }))
      );
    }
  } catch (e) { console.error('sbFullSync:', e); }
}

// ═══════════════════════════════════════════════
// RELÓGIO
// ═══════════════════════════════════════════════
function tick() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(tick, 1000); tick();

// ═══════════════════════════════════════════════
// SEMANA
// ═══════════════════════════════════════════════
  
let wkOff = 0;
const DNAMES = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
// code2py: JS getDay() → índice col (0=Seg…6=Dom)
// getDay(): 0=dom,1=seg,2=ter,3=qua,4=qui,5=sex,6=sab
// col index: 0=seg,1=ter,2=qua,3=qui,4=sex,5=sab,6=dom
function getWeekDates(off=0) {
  const now = new Date(); now.setHours(0,0,0,0);
  const dow = (now.getDay() + 6) % 7; // 0=seg
  const mon = new Date(now); mon.setDate(now.getDate() - dow + off * 7);
  return Array.from({length:7}, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d; });
}

function fmt(d) { return d.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'}); }

function renderSemProg() {
  const ini = new Date(2026,2,2), fim = new Date(2026,6,7), now = new Date();
  const total = fim - ini, elapsed = Math.min(Math.max(now - ini, 0), total);
  const pct = total > 0 ? elapsed / total * 100 : 0;
  const semTot = Math.ceil(total / (7*86400000));
  const semAt  = Math.ceil((now - ini) / (7*86400000));
  document.getElementById('semLabel').textContent =
    now < ini ? 'antes do início' : now > fim ? 'encerrado' : `semana ${Math.max(1,semAt)}/${semTot}`;
  document.getElementById('semFill').style.width = pct.toFixed(1) + '%';
  document.getElementById('semPct').textContent = pct.toFixed(0) + '%';
}

// ═══════════════════════════════════════════════
// POPUP DE EVENTO
// ═══════════════════════════════════════════════
const popup = document.getElementById('evPopup');

function closePopup() { popup.classList.remove('open'); }

document.getElementById('evPopupClose').onclick = closePopup;
document.addEventListener('mousedown', e => {
  if (popup.classList.contains('open') && !popup.contains(e.target)) closePopup();
});

function openAulaPopup(aulaId, rect) {
  const entry = AULA_MAP[aulaId]; if (!entry) return;
  const aula = entry.aula, curso = entry.curso;
  // patch aula with curso ref for inline use
  const aulaFull = {...aula, curso};
  if (!aulaFull) return;

  document.getElementById('evPopupTitle').textContent = curso.nome;
  document.getElementById('evPopupMeta').innerHTML = `
    <span>📅 ${aula.date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</span>
    <span>🕐 ${aula.ini}h – ${aula.fim}h (${aula.horas}h)</span>
    <span>📍 ${esc(curso.local)}</span>
    <span>🔖 ${esc(curso.id)} · turma ${esc(curso.turma)}</span>
  `;

  const isCancelled = cancelled.has(aulaId);
  const attDiv = document.getElementById('evPopupAtt');
  const cb = document.getElementById('evPopupCb');
  const cancelBtn = document.getElementById('evPopupCancelBtn');
  attDiv.style.display = 'block';
  cb.checked = !isCancelled && (att[aulaId] || false);
  cb.disabled = isCancelled;
  cb.onchange = () => {
    att[aulaId] = cb.checked;
    sbSaveAtt(aulaId, cb.checked);
    save(true); renderCalendar(); renderAttendance();
    showToast(cb.checked ? '✓ presença marcada' : 'presença desmarcada');
  };

  cancelBtn.textContent = isCancelled ? '↩ desfazer cancelamento' : '⊘ cancelar aula';
  cancelBtn.onclick = () => {
    if (cancelled.has(aulaId)) {
      cancelled.delete(aulaId);
      showToast('↩ cancelamento desfeito');
    } else {
      cancelled.add(aulaId);
      att[aulaId] = false;
      sbSaveAtt(aulaId, false);
      showToast('⊘ aula cancelada');
    }
    save(true); renderCalendar(); renderAttendance();
    openAulaPopup(aulaId, rect);
  };

  document.getElementById('evPopupActions').innerHTML = '';
  positionPopup(rect);
}

function openCustomPopup(evId, rect) {
  const ev = customEvents.find(e => e.id === evId); if (!ev) return;
  const typeLabel = {lembrete:'📌 Lembrete',prova:'📝 Prova',entrega:'📋 Entrega',outro:'📎 Outro'}[ev.type] || '📎';
  const titleEl = document.getElementById('evPopupTitle');
  titleEl.innerHTML = '';
  const titleSpan = document.createElement('span');
  titleSpan.style.color = sanitizeCor(ev.cor);
  titleSpan.textContent = ev.nome;
  titleEl.appendChild(titleSpan);
  document.getElementById('evPopupMeta').innerHTML = `
    <span>${typeLabel}</span>
    <span>📅 ${ev.date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</span>
    <span>🕐 ${ev.ini} – ${ev.fim}</span>
    ${ev.note ? `<span>📝 ${esc(ev.note)}</span>` : ''}
  `;
  document.getElementById('evPopupAtt').style.display = 'none';

  const acts = document.getElementById('evPopupActions');
  acts.innerHTML = '';
  const editBtn = document.createElement('button');
  editBtn.className = 'ep-btn'; editBtn.textContent = '✎ editar';
  editBtn.onclick = () => { closePopup(); openNewEvModal(ev); };

  const delBtn = document.createElement('button');
  delBtn.className = 'ep-btn danger'; delBtn.textContent = '✕ remover';
  delBtn.onclick = () => {
    customEvents = customEvents.filter(e => e.id !== evId);
    sbDeleteEvent(evId);
    save(true); renderCalendar(); closePopup(); showToast('removido');
  };

  acts.appendChild(editBtn); acts.appendChild(delBtn);
  positionPopup(rect);
}

function positionPopup(rect) {
  popup.classList.add('open');
  // posicionar próximo ao elemento clicado
  const pw = 270, ph = 200;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = rect.right + 8;
  let top  = rect.top;
  if (left + pw > vw) left = rect.left - pw - 8;
  if (top + ph > vh)  top  = vh - ph - 12;
  if (left < 8) left = 8;
  if (top < 8)  top  = 8;
  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';
}

// ═══════════════════════════════════════════════
// MODAL NOVO EVENTO
// ═══════════════════════════════════════════════
const COLORS = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#14b8a6'];
let editingEvId = null; // null = novo, string = editar

function initColorRow() {
  const row = document.getElementById('evColorRow');
  row.innerHTML = '';
  COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'color-swatch'; s.style.background = c; s.dataset.color = c;
    s.onclick = () => {
      row.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('sel'));
      s.classList.add('sel');
    };
    row.appendChild(s);
  });
  row.querySelector('.color-swatch').classList.add('sel');
}

function getSelectedColor() {
  const sel = document.querySelector('.color-swatch.sel');
  return sel ? sel.dataset.color : COLORS[0];
}

function setSelectedColor(c) {
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('sel', s.dataset.color === c);
  });
}

function openNewEvModal(prefill=null) {
  const modal = document.getElementById('newEvModal');
  editingEvId = prefill ? prefill.id : null;
  document.getElementById('newEvTitle').textContent = editingEvId ? 'Editar evento' : 'Novo evento';
  document.getElementById('evName').value = prefill ? prefill.nome : '';
  document.getElementById('evType').value = prefill ? prefill.type : 'lembrete';
  document.getElementById('evNote').value = prefill ? (prefill.note||'') : '';

  // date
  const d = prefill ? new Date(prefill.date) : new Date();
  document.getElementById('evDate').value = d.toISOString().slice(0,10);
  document.getElementById('evStart').value = prefill ? prefill.ini : '08:00';
  document.getElementById('evEnd').value   = prefill ? prefill.fim : '09:00';

  initColorRow();
  if (prefill) setSelectedColor(prefill.cor);
  modal.classList.add('open');
  document.getElementById('evName').focus();
}

function closeNewEvModal() {
  document.getElementById('newEvModal').classList.remove('open');
  editingEvId = null;
}

document.getElementById('newEvClose').onclick   = closeNewEvModal;
document.getElementById('newEvCancel').onclick  = closeNewEvModal;
document.getElementById('newEvModal').addEventListener('mousedown', e => {
  if (e.target === document.getElementById('newEvModal')) closeNewEvModal();
});

document.getElementById('newEvSave').addEventListener('click', () => {
  const nome  = document.getElementById('evName').value.trim();
  const date  = document.getElementById('evDate').value;
  const ini   = document.getElementById('evStart').value;
  const fim   = document.getElementById('evEnd').value;
  const type  = document.getElementById('evType').value;
  const note  = document.getElementById('evNote').value.trim();
  const cor   = getSelectedColor();

  if (!nome || !date || !ini || !fim) { showToast('preencha título, data e horário'); return; }
  if (nome.length > 100) { showToast('título deve ter no máximo 100 caracteres'); return; }
  if (note.length > 500) { showToast('observação deve ter no máximo 500 caracteres'); return; }
  const TIPOS_VALIDOS = ['lembrete','prova','entrega','outro'];
  if (!TIPOS_VALIDOS.includes(type)) { showToast('tipo de evento inválido'); return; }

  const evDate = parseDateLocal(date);
  if (editingEvId) {
    const ev = customEvents.find(e => e.id === editingEvId);
    if (ev) { ev.nome=nome; ev.date=evDate; ev.ini=ini; ev.fim=fim; ev.type=type; ev.note=note; ev.cor=cor; sbSaveEvent(ev); }
  } else {
    const newEv = { id:uid(), nome, date:evDate, ini, fim, type, note, cor };
    customEvents.push(newEv);
    sbSaveEvent(newEv);
  }

  // Navegar para a semana do evento criado/editado
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.floor((evDate - today) / 86400000);
  const diffWeeks = Math.floor(diffDays / 7 + (diffDays >= 0 ? 0 : -1));
  // Calcular offset da semana do evento
  const evDow = (evDate.getDay() + 6) % 7;
  const evMon = new Date(evDate); evMon.setDate(evDate.getDate() - evDow);
  const todDow = (today.getDay() + 6) % 7;
  const todMon = new Date(today); todMon.setDate(today.getDate() - todDow);
  wkOff = Math.round((evMon - todMon) / (7 * 86400000));

  save(true); renderCalendar(); closeNewEvModal();
  showToast(editingEvId ? 'evento atualizado' : 'evento criado');
});

// ═══════════════════════════════════════════════
// CALENDÁRIO VERTICAL
// ═══════════════════════════════════════════════
const CAL_INI = 7, CAL_FIM = 21, SLOT = 48; // px/hora
const CALENDAR_DRAG_THRESHOLD = 5; // px mínimos de movimento para iniciar drag

// Fix fuso horário: 'YYYY-MM-DD' → Date local (não UTC)
function parseDateLocal(str) {
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}

// Formata Date como 'YYYY-MM-DD' usando hora local (evita desvio de UTC)
function fmtDateLocal(d) {
  if (!(d instanceof Date)) return d;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


function renderCalendar() {
  const days    = getWeekDates(wkOff);
  const today   = new Date(); today.setHours(0,0,0,0);
  const now     = new Date();
  const hours   = CAL_FIM - CAL_INI;
  const gridCols = '52px repeat(7,1fr)';

  let h = '';

  // ── HEADER ──
  h += `<div style="display:grid;grid-template-columns:${gridCols};border-bottom:2px solid var(--border);">`;
  h += `<div class="cal-gutter"></div>`;
  days.forEach((d, i) => {
    const isT = d.getTime() === today.getTime();
    const isP = d < today;
    // Ping pulsante só no dia de hoje, na semana atual
    const showPing = isT && wkOff === 0;
    h += `<div class="cal-dh${isT?' is-today':''}${isP&&!isT?' is-past':''}">
      <div class="dname">${DNAMES[i]}</div>
      <div class="dnum${showPing?' today-ping':''}">${d.getDate()}</div>
    </div>`;
  });
  h += '</div>';

  // ── BODY ──
  h += `<div style="display:grid;grid-template-columns:${gridCols};position:relative;">`;

  // Coluna de horas
  h += `<div>`;
  for (let hh = CAL_INI; hh <= CAL_FIM; hh++) {
    h += `<div class="cal-ts"><span class="cal-tl">${hh < 10 ? '0'+hh : hh}:00</span></div>`;
  }
  h += '</div>';

  // Colunas dos dias
  days.forEach((d, di) => {
    const dStr    = d.toISOString().slice(0,10);
    const dIso    = dStr;
    const isT     = d.getTime() === today.getTime();
    const isP     = d < today;

    // Aulas do dia
    const aulasDia = COURSES.flatMap(c =>
      c._aulas.filter(a => a.date.toISOString().slice(0,10) === dStr).map(a => ({...a, curso:c, _type:'aula'}))
    );

    // Eventos custom do dia
    const evsDia = customEvents.filter(e => {
      const ed = new Date(e.date); ed.setHours(0,0,0,0);
      return ed.getTime() === d.getTime();
    }).map(e => {
      const [sh, sm] = e.ini.split(':').map(Number);
      const [eh, em] = e.fim.split(':').map(Number);
      return {...e, _type:'custom', _ini: sh + sm/60, _fim: eh + em/60};
    });

    h += `<div class="cal-dcol${isT?' is-today-col':''}" data-col="${di}" data-date="${dIso}">`;

    // Linhas de hora
    for (let hh = CAL_INI; hh < CAL_FIM; hh++) {
      h += `<div class="cal-hl" data-hour="${hh}" data-date="${dIso}"></div>`;
    }

    // Linha "agora"
    if (isT && wkOff === 0) {
      const mins = (now.getHours() - CAL_INI) * 60 + now.getMinutes();
      const top  = Math.max(0, Math.min(mins / 60 * SLOT, hours * SLOT));
      h += `<div class="now-line" id="nowLine" style="top:${top}px"></div>`;
    }

    // Aulas
    aulasDia.forEach(a => {
      const topPx = (a.ini - CAL_INI) * SLOT;
      const durPx = (a.fim - a.ini)   * SLOT;
      const past  = isP || (isT && a.fim <= now.getHours());
      const chk   = att[a.id] || false;
      const isCancelled = cancelled.has(a.id);
      const hasBuiltinCls = ['c1','c2','c3','c4'].includes(a.curso.cls);
      const safeCor    = sanitizeCor(a.curso.cor);
      const colorStyle = hasBuiltinCls ? '' : `background:${safeCor}1a;border-color:${safeCor};`;
      const nameStyle  = hasBuiltinCls ? '' : `color:${safeCor}`;
      h += `<div class="cal-ev ${a.curso.cls||''}${past?' ev-past':''}${isCancelled?' ev-cancelled':''}"
        style="top:${topPx}px;height:${durPx}px;${colorStyle}"
        data-aula="${a.id}">
        <div class="ev-name"${nameStyle?` style="${nameStyle}"`:''}>${esc(a.curso.nome)}</div>
        <div class="ev-time">${a.ini}h–${a.fim}h · ${a.horas}h</div>
        ${isCancelled ? `<div class="ev-cancelled-label">⊘ cancelada</div>` : chk ? `<div class="ev-check">✓ presente</div>` : ''}
      </div>`;
    });

    // Eventos custom
    evsDia.forEach(e => {
      const topPx = (e._ini - CAL_INI) * SLOT;
      const durPx = Math.max((e._fim - e._ini) * SLOT, 20);
      const typeIcon = {lembrete:'📌',prova:'📝',entrega:'📋',outro:'📎'}[e.type] || '📎';
      const safeCor  = sanitizeCor(e.cor);
      h += `<div class="cal-ev ev-custom${isP?' ev-past':''}"
        style="top:${topPx}px;height:${durPx}px;border-color:${safeCor};background:${safeCor}18"
        data-custom="${e.id}">
        <div class="ev-name" style="color:${safeCor}">${typeIcon} ${esc(e.nome)}</div>
        <div class="ev-time">${e.ini}–${e.fim}</div>
      </div>`;
    });

    h += '</div>';
  });

  h += '</div>';
  document.getElementById('calInner').innerHTML = h;
  document.getElementById('wkLabel').textContent = `${fmt(days[0])} – ${fmt(days[6])}`;

  // ── CLICK em aulas ──
  document.querySelectorAll('.cal-ev[data-aula]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      openAulaPopup(el.dataset.aula, el.getBoundingClientRect());
    });
  });

  // ── CLICK em eventos custom — tratado pelo initCalendarDrag (inclui click) ──

  // ── CLICK em espaço vazio → novo evento ──
  document.querySelectorAll('.cal-hl').forEach(hl => {
    hl.addEventListener('click', e => {
      if (e.target !== hl) return;
      closePopup();
      const hour = parseInt(hl.dataset.hour);
      const dateStr = hl.dataset.date || hl.closest('.cal-dcol').dataset.date;
      document.getElementById('evDate').value = dateStr || new Date().toISOString().slice(0,10);
      const hStr = hour < 10 ? '0'+hour : ''+hour;
      const h1 = (hour+1) < 10 ? '0'+(hour+1) : ''+(hour+1);
      document.getElementById('evStart').value = hStr + ':00';
      document.getElementById('evEnd').value   = (hour < CAL_FIM - 1) ? h1 + ':00' : hStr + ':50';
      openNewEvModal();
    });
  });

  // ── DRAG para mover eventos custom ──
  initCalendarDrag();
}

// Atualiza linha "agora"
setInterval(() => {
  if (wkOff !== 0) return;
  const line = document.getElementById('nowLine'); if (!line) return;
  const now = new Date();
  const mins = (now.getHours() - CAL_INI) * 60 + now.getMinutes();
  line.style.top = Math.max(0, Math.min(mins / 60 * SLOT, (CAL_FIM-CAL_INI)*SLOT)) + 'px';
}, 60000);

// ── DRAG & DROP para eventos custom no calendário ──────────────────────────
function initCalendarDrag() {
  const calScroll = document.querySelector('.cal-scroll');
  if (!calScroll) return;

  document.querySelectorAll('.cal-ev[data-custom]').forEach(el => {
    let ghost = null;

    el.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      let dragging = false;

      const evId   = el.dataset.custom;
      const ev     = customEvents.find(x => x.id === evId);
      if (!ev) return;

      const rect   = el.getBoundingClientRect();
      const offsetY = e.clientY - rect.top; // posição do clique dentro do evento

      function startDrag() {
        dragging = true;
        closePopup();
        el.setPointerCapture(e.pointerId);

        // cria elemento fantasma
        const safeCor = sanitizeCor(ev.cor);
        ghost = document.createElement('div');
        ghost.className = el.className + ' cal-ev-drag-ghost';
        ghost.style.cssText = `
          position:fixed;
          width:${rect.width}px;
          height:${rect.height}px;
          top:${rect.top}px;
          left:${rect.left}px;
          opacity:0.75;
          pointer-events:none;
          z-index:9999;
          border-color:${safeCor};
          background:${safeCor}28;
          border-left:3px solid ${safeCor};
          border-radius:6px;
          padding:3px 6px;
          font-size:11px;
          box-shadow:0 4px 16px rgba(0,0,0,.18);
          transition:none;
          transform:scale(1.03);
        `;
        ghost.innerHTML = el.innerHTML;
        document.body.appendChild(ghost);

        el.style.opacity = '0.3';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
      }

      function onMove(e2) {
        if (!dragging) {
          if (Math.abs(e2.clientX - startX) > CALENDAR_DRAG_THRESHOLD ||
              Math.abs(e2.clientY - startY) > CALENDAR_DRAG_THRESHOLD) {
            startDrag();
          }
          return;
        }
        // move ghost
        ghost.style.top  = (e2.clientY - offsetY) + 'px';
        ghost.style.left = (e2.clientX - rect.width / 2) + 'px';

        // highlight column below cursor
        document.querySelectorAll('.cal-dcol.drag-over').forEach(c => c.classList.remove('drag-over'));
        const col = document.elementFromPoint(e2.clientX, e2.clientY);
        const dcol = col && col.closest('.cal-dcol');
        if (dcol) dcol.classList.add('drag-over');
      }

      function onUp(e2) {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup',   onUp);
        el.removeEventListener('pointercancel', onUp);

        document.querySelectorAll('.cal-dcol.drag-over').forEach(c => c.classList.remove('drag-over'));
        document.body.style.userSelect = '';
        document.body.style.cursor     = '';
        el.style.opacity = '';

        if (ghost) { ghost.remove(); ghost = null; }

        if (!dragging) {
          // foi apenas clique — abre popup normalmente
          openCustomPopup(evId, el.getBoundingClientRect());
          return;
        }

        // determina coluna (dia) e hora de destino
        const dropTarget = document.elementFromPoint(e2.clientX, e2.clientY);
        const dcol = dropTarget && dropTarget.closest('.cal-dcol[data-date]');
        if (!dcol) return; // fora do calendário — cancela

        const newDateStr = dcol.dataset.date;
        const colRect    = dcol.getBoundingClientRect();
        const scrollEl   = calScroll;
        const scrollOff  = scrollEl.scrollTop;

        // posição relativa ao topo da coluna
        const relY    = (e2.clientY - colRect.top) + scrollOff - offsetY;
        const hours   = relY / SLOT; // horas desde CAL_INI
        const rawHour = CAL_INI + hours;

        // arredonda para o quarto de hora mais próximo (0, 15, 30, 45)
        const totalMins = Math.round((rawHour * 60) / 15) * 15;
        const newIniH   = Math.max(CAL_INI, Math.min(CAL_FIM - 1, Math.floor(totalMins / 60)));
        const newIniM   = totalMins % 60;

        // calcula duração original e aplica
        const [origIniH, origIniM] = ev.ini.split(':').map(Number);
        const [origFimH, origFimM] = ev.fim.split(':').map(Number);
        const durMins = (origFimH * 60 + origFimM) - (origIniH * 60 + origIniM);

        let fimTotalMins = newIniH * 60 + newIniM + durMins;
        if (fimTotalMins > CAL_FIM * 60) fimTotalMins = CAL_FIM * 60;

        const newFimH = Math.floor(fimTotalMins / 60);
        const newFimM = fimTotalMins % 60;

        const pad = n => (n < 10 ? '0' : '') + n;
        ev.date = new Date(newDateStr + 'T00:00:00');
        ev.ini  = pad(newIniH) + ':' + pad(newIniM);
        ev.fim  = pad(newFimH) + ':' + pad(newFimM);

        save(true);
        renderCalendar();
        showToast('evento movido');
      }

      el.addEventListener('pointermove',   onMove);
      el.addEventListener('pointerup',     onUp);
      el.addEventListener('pointercancel', onUp);
    });
  });
}

document.getElementById('wkPrev').onclick  = () => { wkOff--; renderCalendar(); };
document.getElementById('wkNext').onclick  = () => { wkOff++; renderCalendar(); };
document.getElementById('btnToday').onclick = () => { wkOff = 0; renderCalendar(); scrollToNow(); };

// Scroll automático para hora atual (ou primeira aula do dia)
function scrollToNow() {
  const calScroll = document.querySelector('.cal-scroll');
  if (!calScroll) return;
  const now = new Date();
  // Alvo: hora atual menos 1h de margem visual, ou 7h como mínimo
  const targetHour = wkOff === 0
    ? Math.max(CAL_INI, now.getHours() - 1)
    : CAL_INI;
  const scrollTop = (targetHour - CAL_INI) * SLOT;
  calScroll.scrollTo({ top: scrollTop, behavior: 'smooth' });
}

// Teclado: ← → para navegar semanas
document.addEventListener('keydown', e => {
  // Só quando não está dentro de um input/textarea/modal
  if (e.target.matches('input,textarea,select')) return;
  if (document.querySelector('.modal-bg.open')) return;
  if (e.key === 'ArrowLeft')  { wkOff--; renderCalendar(); }
  if (e.key === 'ArrowRight') { wkOff++; renderCalendar(); }
  if (e.key === 'Home' || e.key === 't') { wkOff = 0; renderCalendar(); scrollToNow(); }
  if (e.key === 'Escape') { closePopup(); closeNewEvModal(); closeAddCourseModal(); closeArchivedModal(); }
});

// ═══════════════════════════════════════════════
// PRESENÇA — BASEADA EM HORAS
// ═══════════════════════════════════════════════
function calcStats(c) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  const aulasValidas = c._aulas.filter(a => !cancelled.has(a.id));
  const aulasPast   = aulasValidas.filter(a => a.date <= hoje);
  const aulasFuture = aulasValidas.filter(a => a.date >  hoje);

  // horas presentes e horas de falta (só nas aulas já ocorridas e não canceladas)
  const horasPresente = aulasPast.filter(a =>  att[a.id]).reduce((s,a) => s+a.horas, 0);
  const horasFalta    = aulasPast.filter(a => !att[a.id]).reduce((s,a) => s+a.horas, 0);

  const totalH     = aulasValidas.reduce((s,a) => s+a.horas, 0);
  const maxFaltasH = Math.floor(totalH * 0.25);

  // Para exibir em "aulas": quantas aulas faltou
  const aulasFaltou = aulasPast.filter(a => !att[a.id]).length;

  const emRisco   = horasFalta > 0 && horasFalta >= maxFaltasH * 0.75;
  const reprovado = horasFalta > maxFaltasH;
  const pctPresenca = totalH > 0 ? ((totalH - horasFalta) / totalH * 100) : 100;
  const hRestantes = maxFaltasH - horasFalta;

  return { totalH, maxFaltasH, horasPresente, horasFalta, aulasFaltou,
           aulasPast, aulasFuture, emRisco, reprovado, pctPresenca, hRestantes };
}

function renderAttendance() {
  const container = document.getElementById('attGrid');
  const openSet = new Set([...container.querySelectorAll('.att-card.open')].map(e => e.dataset.c));
  container.innerHTML = '';

  COURSES.forEach(c => {
    const s = calcStats(c);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const isUserCourse = userCourses.some(uc => uc.id === c.id);

    let pillTxt, pillCls = '';
    if (s.reprovado) {
      pillTxt = `✕ reprovado · ${s.horasFalta}h/${s.maxFaltasH}h falta`;
      pillCls = 'danger';
    } else if (s.emRisco) {
      pillTxt = `⚠ ${s.horasFalta}h/${s.maxFaltasH}h · ${s.hRestantes.toFixed(0)}h restam`;
      pillCls = 'warn';
    } else {
      pillTxt = `${s.horasFalta}h falta · ${s.aulasFaltou} aula${s.aulasFaltou !== 1 ? 's' : ''}`;
      pillCls = s.pctPresenca >= 75 ? 'safe' : '';
    }

    const safeCor   = sanitizeCor(c.cor);
    const fillColor = s.reprovado || s.emRisco ? 'var(--warn)' : safeCor;
    const pctFill   = Math.max(0, Math.min(s.pctPresenca, 100));

    const card = document.createElement('div');
    card.className = 'att-card' + (openSet.has(c.id) ? ' open' : '');
    card.dataset.c = c.id;

    card.innerHTML = `
      <div class="att-head">
        <div class="att-dot" style="background:${safeCor}"></div>
        <span class="att-name">${esc(c.nome)}</span>
        <span class="att-code">${esc(c.id)}</span>
        <span class="att-hbadge">${c._totalH}h</span>
        <span class="att-pill ${pillCls}">${pillTxt}</span>
        <button class="att-arch-btn" data-c="${esc(c.id)}" title="arquivar disciplina">📦</button>
        ${isUserCourse ? `<button class="att-del-btn" data-c="${esc(c.id)}" title="remover disciplina">✕</button>` : ''}
        <span class="att-chev">▾</span>
      </div>
      <div class="att-prog">
        <div class="att-prog-fill" style="width:${pctFill.toFixed(1)}%;background:${fillColor}"></div>
      </div>
      <div class="att-body">
        <!-- Resumo de horas -->
        <div class="att-summary-bar">
          <div class="att-stat">
            <span class="att-stat-label">C. Horária</span>
            <span class="att-stat-val">${s.totalH}h</span>
          </div>
          <div class="att-stat">
            <span class="att-stat-label">Limite faltas</span>
            <span class="att-stat-val">≤ ${s.maxFaltasH}h (25%)</span>
          </div>
          <div class="att-stat">
            <span class="att-stat-label">Horas faltadas</span>
            <span class="att-stat-val ${s.reprovado?'danger':s.emRisco?'danger':s.horasFalta>0?'':'ok'}">${s.horasFalta}h</span>
          </div>
          <div class="att-stat">
            <span class="att-stat-label">Horas p/ reprovar</span>
            <span class="att-stat-val ${s.hRestantes<=0?'danger':s.hRestantes<=s.maxFaltasH*0.3?'danger':''}">${Math.max(0,s.hRestantes)}h</span>
          </div>
          <div class="att-stat">
            <span class="att-stat-label">Presença</span>
            <span class="att-stat-val ${s.pctPresenca>=75?'ok':s.pctPresenca>=60?'':'danger'}">${s.pctPresenca.toFixed(0)}%</span>
          </div>
        </div>

        <!-- Lista de aulas -->
        <div class="att-list"></div>

        <div class="att-footer">
          <div>
            ${s.hRestantes <= 1 && !s.reprovado ? `<div class="att-warn-1h">🚨 Alerta: apenas ${Math.max(0,s.hRestantes)}h restante para reprovação!</div>` :
              s.emRisco && !s.reprovado ? `<div class="att-warn-txt">⚠ Você pode faltar mais ${Math.max(0,s.hRestantes)}h sem reprovar</div>` : ''}
            ${s.reprovado ? `<div class="att-warn-txt">✕ Limite de ${s.maxFaltasH}h ultrapassado em ${(s.horasFalta-s.maxFaltasH)}h</div>` : ''}
            ${!s.emRisco && !s.reprovado && s.pctPresenca >= 75 ? `<div style="font-size:11px;color:var(--ok)">✓ Presença em dia (${s.pctPresenca.toFixed(0)}%)</div>` : ''}
          </div>
          <button class="att-mark-btn" data-c="${esc(c.id)}">✓ marcar todas passadas</button>
        </div>
      </div>`;

    container.appendChild(card);

    // ── Lista de aulas ──
    const listEl = card.querySelector('.att-list');
    c._aulas.forEach(aula => {
      const isPast   = aula.date <  hoje;
      const isToday  = aula.date.getTime() === hoje.getTime();
      const isCancelled = cancelled.has(aula.id);
      const checked  = !isCancelled && (att[aula.id] || false);

      const row = document.createElement('div');
      row.className = 'att-row' + (isCancelled ? ' att-row-cancelled' : '');

      let badge = '';
      if      (isCancelled)              badge = `<span class="abadge cancelled">cancelada</span>`;
      else if (isToday)                  badge = `<span class="abadge today">hoje</span>`;
      else if (!isPast)                  badge = `<span class="abadge future">futuro</span>`;
      else if (!checked)                 badge = `<span class="abadge falta">falta</span>`;

      const WDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
      row.innerHTML = `
        <input type="checkbox" class="att-cb" data-id="${aula.id}" ${checked?'checked':''} ${isCancelled?'disabled':''}>
        <span class="att-row-date">${aula.date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
        <span class="att-row-day">${WDAYS[aula.date.getDay()]}</span>
        <span class="att-row-h">${aula.ini}h–${aula.fim}h</span>
        <span class="att-row-hval">${aula.horas}h</span>
        ${badge}
        <button class="att-cancel-btn" data-id="${aula.id}" title="${isCancelled?'desfazer cancelamento':'cancelar aula'}">${isCancelled?'↩':'⊘'}</button>`;
      listEl.appendChild(row);

      row.querySelector('.att-cb').addEventListener('change', e => {
        if (cancelled.has(aula.id)) return;
        att[aula.id] = e.target.checked;
        sbSaveAtt(aula.id, e.target.checked);
        save(true); renderAttendance(); renderCalendar();
      });

      row.querySelector('.att-cancel-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (cancelled.has(aula.id)) {
          cancelled.delete(aula.id);
          showToast('↩ cancelamento desfeito');
        } else {
          cancelled.add(aula.id);
          att[aula.id] = false;
          sbSaveAtt(aula.id, false);
          showToast('⊘ aula cancelada');
        }
        save(true); renderAttendance(); renderCalendar();
      });
    });

    card.querySelector('.att-head').addEventListener('click', () => card.classList.toggle('open'));
    card.querySelector('.att-arch-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Arquivar "${c.nome}"?\nOs dados de frequência serão preservados.`)) archiveCourse(c);
    });
    const delBtn = card.querySelector('.att-del-btn');
    if (delBtn) {
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`Remover disciplina "${c.nome}"?\nEsta ação não pode ser desfeita.`)) deleteCourse(c.id);
      });
    }
    card.querySelector('.att-mark-btn').addEventListener('click', e => {
      e.stopPropagation();
      c._aulas.filter(a => a.date <= hoje && !cancelled.has(a.id)).forEach(a => {
        att[a.id] = true;
        sbSaveAtt(a.id, true);
      });
      save(); renderAttendance(); renderCalendar();
    });
  });
}

// ═══════════════════════════════════════════════
// LISTAS
// ═══════════════════════════════════════════════
function renderList(type) {
  const items  = type === 'task' ? tasks  : topics;
  const listEl = document.getElementById(type === 'task' ? 'taskList' : 'topicList');
  const cntEl  = document.getElementById(type === 'task' ? 'taskCnt'  : 'topicCnt');
  const sorted = [...items].sort((a,b) => (a.checked?1:0) - (b.checked?1:0));
  listEl.innerHTML = '';

  sorted.forEach(item => {
    const li = document.createElement('li');
    li.className = 'litem' + (item.checked ? ' done' : '');
    li.dataset.id = item.id;
    li.innerHTML = `
      <input type="checkbox" class="lcb" ${item.checked?'checked':''}>
      <span class="ltxt">${esc(item.text)}</span>
      <button class="ldel" title="remover">✕</button>`;

    li.querySelector('.lcb').addEventListener('change', e => {
      item.checked = e.target.checked;
      sbSaveItem(type, item);
      save(true);
      if (item.checked) {
        if (listTm[item.id]) clearTimeout(listTm[item.id]);
        listTm[item.id] = setTimeout(() => { delete listTm[item.id]; renderList(type); }, 2500);
      } else {
        if (listTm[item.id]) { clearTimeout(listTm[item.id]); delete listTm[item.id]; }
        renderList(type);
      }
    });

    li.querySelector('.ltxt').addEventListener('dblclick', () => {
      const span = li.querySelector('.ltxt');
      const inp  = document.createElement('input');
      inp.type = 'text'; inp.value = item.text; inp.className = 'linput';
      inp.style.cssText = 'flex:1;margin:0;font-size:13px;';
      span.replaceWith(inp); inp.focus(); inp.select();
      const done = () => { const v = inp.value.trim(); if (v) { item.text = v; sbSaveItem(type, item); } save(true); renderList(type); };
      inp.addEventListener('blur', done);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    });

    li.querySelector('.ldel').addEventListener('click', () => {
      const arr = type === 'task' ? tasks : topics;
      const idx = arr.findIndex(t => t.id === item.id); if (idx === -1) return;
      const [removed] = arr.splice(idx, 1);
      sbDeleteItem(type, removed.id);
      undoBuf = {type, item: removed, index: idx};
      if (undoTm) clearTimeout(undoTm);
      undoTm = setTimeout(() => undoBuf = null, 5000);
      save(true); showToast('removido', true); renderList(type);
    });

    listEl.appendChild(li);
  });

  const pend = items.filter(t => !t.checked).length;
  cntEl.textContent = pend > 0 ? `${pend} pendente${pend!==1?'s':''}` : (items.length > 0 ? 'tudo feito ✓' : '0');
}

function addItem(type, text) {
  if (!text.trim()) return;
  if (text.trim().length > 200) { showToast('texto deve ter no máximo 200 caracteres'); return; }
  const arr = type === 'task' ? tasks : topics;
  const item = {id: uid(), text: text.trim(), checked: false};
  arr.push(item);
  sbSaveItem(type, item, arr.length - 1);
  save(true); renderList(type);
}

['task','topic'].forEach(t => {
  document.getElementById(t+'Add').onclick = () => {
    const i = document.getElementById(t+'Inp'); addItem(t, i.value); i.value = '';
  };
  document.getElementById(t+'Inp').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const i = e.target; addItem(t, i.value); i.value = ''; }
  });
});

// ═══════════════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════════════
document.getElementById('btnDark').addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  document.getElementById('btnDark').textContent = dark ? '☀ claro' : '🌙 escuro';
  localStorage.setItem(LS.dark, dark);
});

// ═══════════════════════════════════════════════
// DISCIPLINAS — ADICIONAR / EDITAR / ARQUIVAR
// ═══════════════════════════════════════════════
const COURSE_COLORS = ['#f59e0b','#3b82f6','#8b5cf6','#10b981','#ef4444','#ec4899','#6366f1','#14b8a6','#f97316','#06b6d4'];
let editingCourseId = null;

function addHorarioRow(dia=1, ini=8, fim=10) {
  const row = document.createElement('div');
  row.className = 'horario-row';
  const DAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  row.innerHTML = `
    <select class="form-select horario-dia">
      ${DAYS.map((d,i) => `<option value="${i}"${i===dia?' selected':''}>${d}</option>`).join('')}
    </select>
    <input type="number" class="form-input horario-ini" min="6" max="22" value="${ini}">
    <span class="horario-sep">h –</span>
    <input type="number" class="form-input horario-fim" min="7" max="23" value="${fim}">
    <span class="horario-sep">h</span>
    <button type="button" class="btn-rem-horario" title="remover">✕</button>`;
  row.querySelector('.btn-rem-horario').onclick = () => row.remove();
  return row;
}

function initCourseColorRow() {
  const row = document.getElementById('cColorRow');
  row.innerHTML = '';
  COURSE_COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'color-swatch'; s.style.background = c; s.dataset.color = c;
    s.onclick = () => {
      row.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('sel'));
      s.classList.add('sel');
    };
    row.appendChild(s);
  });
  row.querySelector('.color-swatch').classList.add('sel');
}

function getSelectedCourseColor() {
  const sel = document.querySelector('#cColorRow .color-swatch.sel');
  return sel ? sel.dataset.color : COURSE_COLORS[0];
}

function setSelectedCourseColor(c) {
  document.querySelectorAll('#cColorRow .color-swatch').forEach(s => {
    s.classList.toggle('sel', s.dataset.color === c);
  });
}

function openAddCourseModal(prefill=null) {
  editingCourseId = prefill ? prefill.id : null;
  document.getElementById('addCourseTitle').textContent = editingCourseId ? 'Editar disciplina' : 'Nova disciplina';
  document.getElementById('cNome').value  = prefill ? prefill.nome : '';
  document.getElementById('cId').value    = prefill ? prefill.id   : '';
  document.getElementById('cId').disabled = !!editingCourseId;
  document.getElementById('cTurma').value = prefill ? (prefill.turma||'') : '';
  document.getElementById('cLocal').value = prefill ? (prefill.local||'') : '';

  const today = new Date();
  const fim3  = new Date(today); fim3.setMonth(today.getMonth() + 4);
  if (prefill) {
    const ini = prefill.ini instanceof Date ? prefill.ini : new Date(prefill.ini);
    const fim = prefill.fim instanceof Date ? prefill.fim : new Date(prefill.fim);
    document.getElementById('cIni').value = ini.toISOString().slice(0,10);
    document.getElementById('cFim').value = fim.toISOString().slice(0,10);
  } else {
    document.getElementById('cIni').value = today.toISOString().slice(0,10);
    document.getElementById('cFim').value = fim3.toISOString().slice(0,10);
  }

  const horariosDiv = document.getElementById('cHorarios');
  horariosDiv.innerHTML = '';
  if (prefill && prefill.horarios && prefill.horarios.length) {
    prefill.horarios.forEach(h => horariosDiv.appendChild(addHorarioRow(h.dia, h.ini, h.fim)));
  } else {
    horariosDiv.appendChild(addHorarioRow(1, 8, 10));
  }

  initCourseColorRow();
  if (prefill) setSelectedCourseColor(prefill.cor);
  document.getElementById('addCourseModal').classList.add('open');
  document.getElementById('cNome').focus();
}

function closeAddCourseModal() {
  document.getElementById('addCourseModal').classList.remove('open');
  editingCourseId = null;
}

document.getElementById('addCourseClose').onclick  = closeAddCourseModal;
document.getElementById('addCourseCancel').onclick = closeAddCourseModal;
document.getElementById('addCourseModal').addEventListener('mousedown', e => {
  if (e.target === document.getElementById('addCourseModal')) closeAddCourseModal();
});
document.getElementById('addHorario').onclick = () => {
  document.getElementById('cHorarios').appendChild(addHorarioRow());
};
document.getElementById('btnAddCourse').onclick = () => openAddCourseModal();

document.getElementById('addCourseSave').addEventListener('click', () => {
  const nome   = document.getElementById('cNome').value.trim();
  const cid    = editingCourseId || document.getElementById('cId').value.trim().toUpperCase();
  const turma  = document.getElementById('cTurma').value.trim();
  const local  = document.getElementById('cLocal').value.trim();
  const iniStr = document.getElementById('cIni').value;
  const fimStr = document.getElementById('cFim').value;
  const cor    = getSelectedCourseColor();

  if (!nome || !cid || !iniStr || !fimStr) { showToast('preencha nome, código e datas'); return; }
  if (nome.length > 100) { showToast('nome deve ter no máximo 100 caracteres'); return; }
  if (cid.length > 20)   { showToast('código deve ter no máximo 20 caracteres'); return; }
  if (turma.length > 20) { showToast('turma deve ter no máximo 20 caracteres'); return; }
  if (local.length > 100){ showToast('local deve ter no máximo 100 caracteres'); return; }

  const horarioRows = document.querySelectorAll('#cHorarios .horario-row');
  if (!horarioRows.length) { showToast('adicione pelo menos um horário'); return; }
  const horarios = [];
  for (const row of horarioRows) {
    const dia = parseInt(row.querySelector('.horario-dia').value);
    const ini = parseInt(row.querySelector('.horario-ini').value);
    const fim = parseInt(row.querySelector('.horario-fim').value);
    if (isNaN(dia) || isNaN(ini) || isNaN(fim) || fim <= ini) {
      showToast('horário inválido: fim deve ser maior que início'); return;
    }
    horarios.push({dia, ini, fim});
  }

  const [iy,im,id2] = iniStr.split('-').map(Number);
  const [fy,fm,fd]  = fimStr.split('-').map(Number);
  const iniDate = new Date(iy, im-1, id2);
  const fimDate = new Date(fy, fm-1, fd);
  if (fimDate <= iniDate) { showToast('data de fim deve ser após o início'); return; }

  if (editingCourseId) {
    const idx = userCourses.findIndex(c => c.id === editingCourseId);
    if (idx !== -1) {
      const c = userCourses[idx];
      c.nome = nome; c.turma = turma; c.local = local;
      c.horarios = horarios; c.ini = iniDate; c.fim = fimDate; c.cor = cor;
      c._aulas = gerarAulas(c);
      c._totalH = c._aulas.reduce((s,a) => s+a.horas, 0);
      c._maxFaltasH = Math.floor(c._totalH * 0.25);
    }
  } else {
    if ([...BASE_COURSES, ...userCourses].some(c => c.id === cid)) {
      showToast('código já existe'); return;
    }
    const newCourse = { id: cid, nome, turma, local, horarios, cor, cls: '', ini: iniDate, fim: fimDate };
    newCourse._aulas = gerarAulas(newCourse);
    newCourse._totalH = newCourse._aulas.reduce((s,a) => s+a.horas, 0);
    newCourse._maxFaltasH = Math.floor(newCourse._totalH * 0.25);
    userCourses.push(newCourse);
  }

  rebuildCourses();
  save(true);
  renderCalendar();
  renderAttendance();
  closeAddCourseModal();
  showToast(editingCourseId ? 'disciplina atualizada' : 'disciplina adicionada');
});

function deleteCourse(id) {
  const idx = userCourses.findIndex(c => c.id === id);
  if (idx === -1) return;
  const c = userCourses[idx];
  if (c._aulas) c._aulas.forEach(a => delete att[a.id]);
  userCourses.splice(idx, 1);
  rebuildCourses();
  save(true);
  renderCalendar();
  renderAttendance();
  showToast('disciplina removida');
}

function archiveCourse(c) {
  const attSnapshot = {};
  if (c._aulas) c._aulas.forEach(a => { if (att[a.id] !== undefined) attSnapshot[a.id] = att[a.id]; });
  const archived = {
    courseId: c.id,
    course: {
      id: c.id, nome: c.nome, turma: c.turma||'', local: c.local||'',
      horarios: c.horarios, cor: c.cor, cls: c.cls||'',
      ini: c.ini instanceof Date ? c.ini.toISOString() : c.ini,
      fim: c.fim instanceof Date ? c.fim.toISOString() : c.fim
    },
    attSnapshot,
    archivedAt: new Date().toISOString()
  };
  archivedCourses.push(archived);
  const uidx = userCourses.findIndex(uc => uc.id === c.id);
  if (uidx !== -1) userCourses.splice(uidx, 1);
  if (c._aulas) c._aulas.forEach(a => delete att[a.id]);
  rebuildCourses();
  save(true);
  renderCalendar();
  renderAttendance();
  renderArchivedSection();
  showToast(`${c.nome} arquivada`);
}

// ═══════════════════════════════════════════════
// SEÇÃO ARQUIVADOS
// ═══════════════════════════════════════════════
let currentArchivedItem = null;

function renderArchivedSection() {
  const section = document.getElementById('archivedSection');
  const grid    = document.getElementById('archivedGrid');
  if (!section || !grid) return;

  if (!archivedCourses.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  grid.innerHTML = '';

  archivedCourses.forEach(archived => {
    const c   = archived.course;
    const ini = new Date(c.ini);
    const fim = new Date(c.fim);
    const tempC = {...c, ini, fim};
    tempC._aulas = gerarAulas(tempC);
    const totalH     = tempC._aulas.reduce((s,a) => s+a.horas, 0);
    const attendedH  = tempC._aulas.filter(a => archived.attSnapshot[a.id]).reduce((s,a) => s+a.horas, 0);
    const pct        = totalH > 0 ? (attendedH / totalH * 100) : 100;

    const card = document.createElement('div');
    card.className = 'archived-card';
    card.innerHTML = `
      <div class="archived-dot" style="background:${sanitizeCor(c.cor)}"></div>
      <div class="archived-info">
        <div class="archived-name">${esc(c.nome)}</div>
        <div class="archived-meta">${esc(c.id)} · ${ini.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})} – ${fim.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}</div>
      </div>
      <div class="archived-pct ${pct>=75?'ok':'danger'}">${pct.toFixed(0)}%</div>`;
    card.onclick = () => openArchivedModal(archived);
    grid.appendChild(card);
  });
}

function openArchivedModal(archived) {
  currentArchivedItem = archived;
  const c = {...archived.course};
  c.ini = new Date(c.ini);
  c.fim = new Date(c.fim);
  c._aulas = gerarAulas(c);
  c._totalH    = c._aulas.reduce((s,a) => s+a.horas, 0);
  c._maxFaltasH = Math.floor(c._totalH * 0.25);
  const attSnap    = archived.attSnapshot;
  const attendedH  = c._aulas.filter(a => attSnap[a.id]).reduce((s,a) => s+a.horas, 0);
  const missedH    = c._totalH - attendedH;
  const pct        = c._totalH > 0 ? (attendedH / c._totalH * 100) : 100;
  const archivedAt = new Date(archived.archivedAt);
  const WDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  document.getElementById('archivedModalContent').innerHTML = `
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem">
      <div style="width:10px;height:10px;border-radius:50%;background:${sanitizeCor(c.cor)};flex-shrink:0"></div>
      <div>
        <div style="font-weight:600;font-size:15px">${esc(c.nome)}</div>
        <div style="font-size:11px;color:var(--text3)">${esc(c.id)}${c.turma?' · turma '+esc(c.turma):''}${c.local?' · '+esc(c.local):''}</div>
      </div>
    </div>
    <div class="att-summary-bar" style="border:1px solid var(--border);border-radius:8px;margin-bottom:.75rem">
      <div class="att-stat"><span class="att-stat-label">Período</span>
        <span class="att-stat-val">${c.ini.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})} – ${c.fim.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span></div>
      <div class="att-stat"><span class="att-stat-label">C. Horária</span>
        <span class="att-stat-val">${c._totalH}h</span></div>
      <div class="att-stat"><span class="att-stat-label">Frequência</span>
        <span class="att-stat-val ${pct>=75?'ok':'danger'}">${pct.toFixed(0)}%</span></div>
      <div class="att-stat"><span class="att-stat-label">Faltas</span>
        <span class="att-stat-val ${missedH>c._maxFaltasH?'danger':''}">${missedH}h / ${c._maxFaltasH}h</span></div>
      <div class="att-stat"><span class="att-stat-label">Arquivado</span>
        <span class="att-stat-val">${archivedAt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span></div>
    </div>
    <div class="att-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:.4rem .6rem">
      ${c._aulas.map(a => {
        const chk = attSnap[a.id] || false;
        return `<div class="att-row">
          <span style="font-size:12px;font-weight:600;color:${chk?'var(--ok)':'var(--warn)'};">${chk?'✓':'✕'}</span>
          <span class="att-row-date">${a.date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
          <span class="att-row-day">${WDAYS[a.date.getDay()]}</span>
          <span class="att-row-h">${a.ini}h–${a.fim}h</span>
          <span class="att-row-hval">${a.horas}h</span>
          ${chk ? '<span class="abadge" style="background:var(--okb);color:var(--ok)">presente</span>' : '<span class="abadge falta">falta</span>'}
        </div>`;
      }).join('')}
    </div>`;

  document.getElementById('archivedModal').classList.add('open');
}

function closeArchivedModal() {
  document.getElementById('archivedModal').classList.remove('open');
  currentArchivedItem = null;
}

document.getElementById('archivedModalClose').onclick = closeArchivedModal;
document.getElementById('archivedModal').addEventListener('mousedown', e => {
  if (e.target === document.getElementById('archivedModal')) closeArchivedModal();
});

document.getElementById('archivedUnarchive').addEventListener('click', () => {
  if (!currentArchivedItem) return;
  const archived = currentArchivedItem;
  const c = {...archived.course};
  c.ini = new Date(c.ini);
  c.fim = new Date(c.fim);
  c._aulas = gerarAulas(c);
  c._totalH    = c._aulas.reduce((s,a) => s+a.horas, 0);
  c._maxFaltasH = Math.floor(c._totalH * 0.25);

  const isBase = BASE_COURSES.some(bc => bc.id === c.id);
  if (!isBase) userCourses.push(c);
  Object.assign(att, archived.attSnapshot);
  const idx = archivedCourses.findIndex(a => a.courseId === archived.courseId);
  if (idx !== -1) archivedCourses.splice(idx, 1);

  rebuildCourses();
  save(true);
  renderCalendar();
  renderAttendance();
  renderArchivedSection();
  closeArchivedModal();
  showToast(`${c.nome} desarquivada`);
});

document.getElementById('archivedDelete').addEventListener('click', () => {
  if (!currentArchivedItem) return;
  const nome = currentArchivedItem.course.nome;
  if (!confirm(`Remover permanentemente "${nome}" dos arquivados?\nOs dados de frequência serão perdidos.`)) return;
  const idx = archivedCourses.findIndex(a => a.courseId === currentArchivedItem.courseId);
  if (idx !== -1) archivedCourses.splice(idx, 1);
  save(true);
  renderArchivedSection();
  closeArchivedModal();
  showToast('removido dos arquivados');
});

// ═══════════════════════════════════════════════
// EXPORT / IMPORT
// ═══════════════════════════════════════════════
function doExport() {
  const evSerial = customEvents.map(e => ({...e, date: e.date instanceof Date ? e.date.toISOString() : e.date}));
  const data = JSON.stringify({v:4, att, ev: evSerial, tasks, topics}, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], {type:'application/json'}));
  a.download = 'rotina-estudos.json'; a.click(); URL.revokeObjectURL(a.href);
  showToast('exportado');
}
['btnExport','btnExport2'].forEach(id => document.getElementById(id).onclick = doExport);
['btnImport','btnImport2'].forEach(id => document.getElementById(id).onclick = () => document.getElementById('importFile').click());

document.getElementById('importFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (d.att || d.attendance) att = d.att || d.attendance;
      if (d.ev) { customEvents = d.ev; customEvents.forEach(e => e.date = new Date(e.date)); }
      if (d.tasks)  tasks  = d.tasks;
      if (d.topics) topics = d.topics;
      save(false); init();
      sbFullSync().then(() => showToast('importado e sincronizado')).catch(() => showToast('importado'));
    } catch { alert('arquivo inválido'); }
  };
  r.readAsText(f); e.target.value = '';
});

// ═══════════════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════════════
function updateFooter() {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const all  = COURSES.flatMap(c => c._aulas);
  const past = all.filter(a => a.date <= hoje);
  const marcadas = past.filter(a =>  att[a.id]).length;
  const faltas   = past.filter(a => !att[a.id]).length;
  const totalH   = past.reduce((s,a) => s + a.horas, 0);
  const presH    = past.filter(a => att[a.id]).reduce((s,a) => s + a.horas, 0);
  document.getElementById('footerInfo').textContent =
    `${marcadas}/${past.length} aulas passadas marcadas · ${presH}/${totalH}h de presença · ${customEvents.length} evento${customEvents.length!==1?'s':''}`;

  // Badge de faltas no header
  const badge = document.getElementById('hdrBadge');
  const totalFaltasH = COURSES.reduce((s,c) => {
    const p = c._aulas.filter(a => a.date <= hoje && !att[a.id]);
    return s + p.reduce((sh,a) => sh + a.horas, 0);
  }, 0);
  const emRisco = COURSES.some(c => {
    const fH = c._aulas.filter(a => a.date <= hoje && !att[a.id]).reduce((s,a)=>s+a.horas,0);
    return fH >= c._maxFaltasH * 0.75;
  });
  if (totalFaltasH > 0) {
    badge.textContent = `${totalFaltasH}h falta${totalFaltasH!==1?'s':''}`;
    badge.style.display = 'inline-block';
    badge.style.background = emRisco ? 'var(--warnb)' : 'var(--surface2)';
    badge.style.color = emRisco ? 'var(--warn)' : 'var(--text3)';
    badge.style.borderColor = emRisco ? 'color-mix(in srgb,var(--warn) 50%,transparent)' : 'var(--border)';
  } else {
    badge.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════
// OFFLINE — status, fila e sincronização
// ═══════════════════════════════════════════════

// Atualiza o badge de "pendentes" contando as ops no IndexedDB
async function updateOfflineBadge() {
  const pendingEl = document.getElementById('pendingBadge');
  if (!pendingEl) return;
  try {
    const count = await offlineCountPendingOps();
    if (count > 0) {
      pendingEl.textContent = `⏳ ${count} pendente${count !== 1 ? 's' : ''}`;
      pendingEl.style.display = '';
    } else {
      pendingEl.style.display = 'none';
    }
  } catch { pendingEl.style.display = 'none'; }
}

// Mostra/oculta o badge de offline e tenta sincronizar ao voltar online
function updateOnlineStatus() {
  const offlineEl = document.getElementById('offlineBadge');
  if (offlineEl) offlineEl.style.display = navigator.onLine ? 'none' : '';
  if (navigator.onLine) processOfflineQueue();
}

// Limite de tentativas e backoff exponencial (2s, 4s, 8s … máx 60s)
const OFFLINE_MAX_RETRIES    = 5;
const OFFLINE_BACKOFF_BASE_MS = 2000;

function _offlineBackoffMs(retryCount) {
  return Math.min(OFFLINE_BACKOFF_BASE_MS * 2 ** (retryCount - 1), 60000);
}

// Processa a fila de operações pendentes (chamado ao voltar online ou pelo SW)
async function processOfflineQueue() {
  if (!sb || !supaUser || !navigator.onLine) return;
  let ops;
  try { ops = await offlineGetOps(); } catch { return; }
  if (!ops.length) return;

  // Filtra apenas ops prontas: não-falhas e com backoff expirado
  const now = Date.now();
  const ready = ops.filter(op => {
    if ((op.status || 'pending') === 'failed') return false;
    const retries = op.retryCount || 0;
    if (retries > 0) {
      if (now - (op.lastAttempt || 0) < _offlineBackoffMs(retries)) return false;
    }
    return true;
  });
  if (!ready.length) return;

  for (const op of ready) {
    try {
      if (op.type === 'sbSaveAtt') {
        const { error } = await sb.from('presencas')
          .upsert(
            { user_id: supaUser.id, aula_id: op.aulaId, presente: op.presente },
            { onConflict: 'user_id,aula_id' }
          );
        if (!error) {
          await offlineDeleteOp(op.id);
        } else {
          const newCount = (op.retryCount || 0) + 1;
          await offlineUpdateOp(op.id, {
            retryCount:  newCount,
            status:      newCount >= OFFLINE_MAX_RETRIES ? 'failed' : 'pending',
            lastAttempt: Date.now(),
          });
          console.error('processOfflineQueue sbSaveAtt:', error);
        }
      }
    } catch (e) {
      const newCount = (op.retryCount || 0) + 1;
      await offlineUpdateOp(op.id, {
        retryCount:  newCount,
        status:      newCount >= OFFLINE_MAX_RETRIES ? 'failed' : 'pending',
        lastAttempt: Date.now(),
      });
      console.error('processOfflineQueue:', op, e);
    }
  }

  await updateOfflineBadge();
  renderCalendar(); renderAttendance();
}

window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ═══════════════════════════════════════════════
// GEOLOCALIZAÇÃO — presença automática
// ═══════════════════════════════════════════════

// Coordenadas do Campus do Pici (UFC, Fortaleza)
const CAMPUS_LAT        = -3.7423;
const CAMPUS_LNG        = -38.5777;
const CAMPUS_RADIUS_M   = 1000;        // raio de geofencing em metros
const GEO_LEAD_H        = 5 / 60;     // janela de 5 min (em horas) antes do início da aula
const GEO_TIMEOUT_MS    = 10000;       // timeout da requisição de geolocalização
const GEO_MAX_AGE_MS    = 60000;       // máxima idade de uma posição em cache
const GEO_CHECK_INTERVAL_MS = 2 * 60 * 1000; // intervalo de verificação (2 min)

let geoIntervalId = null; // ID do setInterval de verificação periódica

// Distância Haversine entre dois pontos geográficos (em metros)
function haversineDistM(lat1, lng1, lat2, lng2) {
  const R  = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Retorna a aula em andamento agora (ou até 5 min antes do início), ou null
function getAulaAtual() {
  const now  = new Date();
  const hoje = new Date(now); hoje.setHours(0, 0, 0, 0);
  const nowH = now.getHours() + now.getMinutes() / 60;
  for (const c of COURSES) {
    for (const aula of c._aulas) {
      if (aula.date.getTime() !== hoje.getTime()) continue;
      if (nowH >= (aula.ini - GEO_LEAD_H) && nowH < aula.fim)
        return { aula, curso: c };
    }
  }
  return null;
}

// Marca presença automaticamente se o usuário estiver dentro do campus
async function tryAutoMarkPresenca(lat, lng) {
  const dist = haversineDistM(lat, lng, CAMPUS_LAT, CAMPUS_LNG);
  if (dist > CAMPUS_RADIUS_M) return;

  const resultado = getAulaAtual();
  if (!resultado) return;

  const { aula, curso } = resultado;
  if (att[aula.id]) return; // já marcada, nada a fazer

  att[aula.id] = true;
  sbSaveAtt(aula.id, true); // offline-aware
  save(true);
  renderCalendar(); renderAttendance();
  showToast(`📍 presença automática: ${curso.nome}`);
}

// Dispara uma verificação de localização (apenas se houver aula no momento)
function geoCheckOnce() {
  if (!getAulaAtual()) return; // fora de período de aula — economiza bateria
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => tryAutoMarkPresenca(pos.coords.latitude, pos.coords.longitude),
    err => console.warn('Geolocalização:', err.message),
    { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: GEO_MAX_AGE_MS }
  );
}

// Inicia o monitoramento periódico de localização (automático, sempre ativo)
function initGeoAtt() {
  if (geoIntervalId) return; // já rodando
  if (!('geolocation' in navigator)) return;
  geoCheckOnce(); // verificação imediata
  geoIntervalId = setInterval(geoCheckOnce, GEO_CHECK_INTERVAL_MS);
}

// Verifica localização imediatamente ao retornar para a aba
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) geoCheckOnce();
});

// ═══════════════════════════════════════════════
// BTT
// ═══════════════════════════════════════════════
const btt = document.getElementById('btt');
window.addEventListener('scroll', () => btt.classList.toggle('show', scrollY > 300));
btt.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));

// Service Worker — registro e escuta de mensagens de Background Sync
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => {
      // Quando o SW notifica que a fila deve ser processada (Background Sync)
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'SYNC_QUEUE') processOfflineQueue();
      });
    })
    .catch(() => {});
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
function init() {
  renderCalendar();
  renderSemProg();
  renderAttendance();
  renderList('task');
  renderList('topic');
  renderArchivedSection();
  updateFooter();
  initColorRow();
  // Scroll para hora atual após render
  setTimeout(scrollToNow, 100);
}

// ═══════════════════════════════════════════════
// STARTUP ASSÍNCRONO (com Supabase)
// ═══════════════════════════════════════════════
async function startApp() {
  // Carrega preferências (dark mode) do localStorage imediatamente
  load();

  // Mantém supaUser atualizado quando o token é renovado automaticamente pelo Supabase.
  // startApp() é chamado uma única vez, portanto o listener persiste durante toda a sessão.
  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      if (session) {
        supaUser = session.user;
      } else if (event === 'SIGNED_OUT') {
        supaUser = null;
      }
    });
  }

  showLoadOverlay();
  const isGuest   = sessionStorage.getItem('fs-guest') === '1';
  const hasSession = !isGuest && await checkSession();

  if (hasSession) {
    // Tenta carregar dados do Supabase
    const loaded = await sbLoad();
    if (!loaded) {
      // Fallback para dados do localStorage se Supabase falhar
      console.warn('Falha ao carregar Supabase, usando localStorage');
    }
    document.getElementById('btnLogout').style.display = '';
    init();
    hideLoadOverlay();
    showCriticalAttendanceAlerts();
    // Inicializa status offline e inicia presença automática por geolocalização
    updateOnlineStatus();
    updateOfflineBadge();
    initGeoAtt();
  } else if (isGuest) {
    // Modo convidado: dados apenas no localStorage
    document.getElementById('btnLogout').style.display = '';
    init();
    hideLoadOverlay();
    showCriticalAttendanceAlerts();
    updateOnlineStatus();
    updateOfflineBadge();
  } else {
    // Sem sessão: redireciona para a página de login
    hideLoadOverlay();
    window.location.href = 'login.html';
  }
}

// Exibe alertas para disciplinas com ≤1h restante antes de reprovar
function showCriticalAttendanceAlerts() {
  COURSES.forEach(c => {
    const s = calcStats(c);
    if (s.hRestantes <= 1 && !s.reprovado) {
      setTimeout(() => showToast(`🚨 ${c.nome}: apenas ${Math.max(0, s.hRestantes)}h restante!`), 1500);
    }
  });
}

// ── Handler do botão de logout ──
document.getElementById('btnLogout').addEventListener('click', () => doSignOut());

// Re-render a cada minuto (linha de agora, badges "hoje/futuro")
setInterval(() => {
  renderCalendar();
  renderSemProg();
  renderAttendance();
  renderArchivedSection();
  updateFooter();
}, 60000);

// Sincronização automática com Supabase a cada 30 segundos
// Garante que alterações feitas em outros dispositivos apareçam rapidamente
// Não sincroniza se houver gravações locais pendentes (evita sobrescrever dados do usuário)
let _syncing = false;
setInterval(async () => {
  if (!sb || !supaUser || _syncing || _pendingSaves > 0) return;
  _syncing = true;
  try {
    const ok = await sbLoad();
    if (ok) {
      renderCalendar();
      renderSemProg();
      renderAttendance();
      renderList('task');
      renderList('topic');
      renderArchivedSection();
      updateFooter();
    }
  } finally {
    _syncing = false;
  }
}, 30000);

startApp();

})()
