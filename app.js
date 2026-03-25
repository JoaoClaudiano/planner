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
const COURSES = [
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
COURSES.forEach(c => {
  c._aulas = gerarAulas(c);
  // carga horária total e máximo de faltas em horas
  c._totalH = c._aulas.reduce((s,a) => s + a.horas, 0);
  c._maxFaltasH = Math.floor(c._totalH * 0.25); // 25% da CH
});

// ═══════════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════════
const LS = { att:'v3_att', ev:'v3_ev', tasks:'v3_tasks', topics:'v3_topics', dark:'v3_dark' };
let att = {};           // { aulaId: bool }
let customEvents = [];  // [{id,nome,date,ini,fim,type,cor,note}]
let tasks  = [];        // [{id,text,checked}]
let topics = [];        // [{id,text,checked}]
let undoBuf = null, undoTm = null;
const listTm = {};
let supaUser = null; // usuário autenticado no Supabase

function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function load() {
  try { att = JSON.parse(localStorage.getItem(LS.att) || '{}'); } catch { att = {}; }
  try { customEvents = JSON.parse(localStorage.getItem(LS.ev) || '[]'); } catch { customEvents = []; }
  // Restaurar datas como Date objects
  customEvents.forEach(e => { e.date = new Date(e.date); });

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
  // Serializar eventos com data ISO
  const evSerial = customEvents.map(e => ({...e, date: e.date instanceof Date ? e.date.toISOString() : e.date}));
  localStorage.setItem(LS.ev, JSON.stringify(evSerial));
  localStorage.setItem(LS.tasks, JSON.stringify(tasks));
  localStorage.setItem(LS.topics, JSON.stringify(topics));
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
function showLoginOverlay()  { document.getElementById('loginOverlay').classList.add('show'); }
function hideLoginOverlay()  { document.getElementById('loginOverlay').classList.remove('show'); }
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
  if (sb) await sb.auth.signOut();
  supaUser = null;
  att = {}; customEvents = []; tasks = []; topics = [];
  document.getElementById('btnLogout').style.display = 'none';
  init(); // re-render com estado vazio antes de exibir o login
  showLoginOverlay();
  showToast('saiu');
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

    return true;
  } catch (err) {
    console.error('Erro ao carregar do Supabase:', err);
    return false;
  }
}

// ── Escrita granular (fire-and-forget) ──
function sbSaveAtt(aulaId, presente) {
  if (!sb || !supaUser) return;
  sb.from('presencas')
    .upsert({ user_id: supaUser.id, aula_id: aulaId, presente },
            { onConflict: 'user_id,aula_id' })
    .catch(e => console.error('sbSaveAtt:', e));
}

function sbSaveEvent(ev) {
  if (!sb || !supaUser) return;
  const dateStr = ev.date instanceof Date ? ev.date.toISOString().slice(0, 10) : ev.date;
  sb.from('eventos')
    .upsert({ id: ev.id, user_id: supaUser.id, nome: ev.nome,
              date: dateStr, ini: ev.ini, fim: ev.fim,
              type: ev.type, cor: ev.cor, note: ev.note || '' })
    .catch(e => console.error('sbSaveEvent:', e));
}

function sbDeleteEvent(id) {
  if (!sb || !supaUser) return;
  sb.from('eventos').delete()
    .eq('id', id).eq('user_id', supaUser.id)
    .catch(e => console.error('sbDeleteEvent:', e));
}

function sbSaveItem(type, item, order) {
  if (!sb || !supaUser) return;
  const table = type === 'task' ? 'tarefas' : 'topicos';
  sb.from(table)
    .upsert({ id: item.id, user_id: supaUser.id,
              text: item.text, checked: item.checked,
              sort_order: order || 0 })
    .catch(e => console.error('sbSaveItem:', e));
}

function sbDeleteItem(type, id) {
  if (!sb || !supaUser) return;
  const table = type === 'task' ? 'tarefas' : 'topicos';
  sb.from(table).delete()
    .eq('id', id).eq('user_id', supaUser.id)
    .catch(e => console.error('sbDeleteItem:', e));
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
        date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : e.date,
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
    <span>🔖 ${curso.id} · turma ${curso.turma}</span>
  `;

  const attDiv = document.getElementById('evPopupAtt');
  const cb = document.getElementById('evPopupCb');
  attDiv.style.display = 'block';
  cb.checked = att[aulaId] || false;
  cb.onchange = () => {
    att[aulaId] = cb.checked;
    sbSaveAtt(aulaId, cb.checked);
    save(true); renderCalendar(); renderAttendance();
    showToast(cb.checked ? '✓ presença marcada' : 'presença desmarcada');
  };

  document.getElementById('evPopupActions').innerHTML = '';
  positionPopup(rect);
}

function openCustomPopup(evId, rect) {
  const ev = customEvents.find(e => e.id === evId); if (!ev) return;
  const typeLabel = {lembrete:'📌 Lembrete',prova:'📝 Prova',entrega:'📋 Entrega',outro:'📎 Outro'}[ev.type] || '📎';
  document.getElementById('evPopupTitle').innerHTML = `<span style="color:${ev.cor}">${esc(ev.nome)}</span>`;
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

// Lookup rápido: aulaId → { aula, curso }
const AULA_MAP = {};
COURSES.forEach(c => c._aulas.forEach(a => { AULA_MAP[a.id] = { aula:a, curso:c }; }));

// Fix fuso horário: 'YYYY-MM-DD' → Date local (não UTC)
function parseDateLocal(str) {
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
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
      h += `<div class="cal-ev ${a.curso.cls}${past?' ev-past':''}"
        style="top:${topPx}px;height:${durPx}px"
        data-aula="${a.id}">
        <div class="ev-name">${esc(a.curso.nome)}</div>
        <div class="ev-time">${a.ini}h–${a.fim}h · ${a.horas}h</div>
        ${chk ? `<div class="ev-check">✓ presente</div>` : ''}
      </div>`;
    });

    // Eventos custom
    evsDia.forEach(e => {
      const topPx = (e._ini - CAL_INI) * SLOT;
      const durPx = Math.max((e._fim - e._ini) * SLOT, 20);
      const typeIcon = {lembrete:'📌',prova:'📝',entrega:'📋',outro:'📎'}[e.type] || '📎';
      h += `<div class="cal-ev ev-custom${isP?' ev-past':''}"
        style="top:${topPx}px;height:${durPx}px;border-color:${e.cor};background:${e.cor}18"
        data-custom="${e.id}">
        <div class="ev-name" style="color:${e.cor}">${typeIcon} ${esc(e.nome)}</div>
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

  // ── CLICK em eventos custom ──
  document.querySelectorAll('.cal-ev[data-custom]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      openCustomPopup(el.dataset.custom, el.getBoundingClientRect());
    });
  });

  // ── CLICK em espaço vazio → novo evento ──
  document.querySelectorAll('.cal-hl').forEach(hl => {
    hl.addEventListener('click', e => {
      if (e.target !== hl) return; // clicou num evento filho
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
}

// Atualiza linha "agora"
setInterval(() => {
  if (wkOff !== 0) return;
  const line = document.getElementById('nowLine'); if (!line) return;
  const now = new Date();
  const mins = (now.getHours() - CAL_INI) * 60 + now.getMinutes();
  line.style.top = Math.max(0, Math.min(mins / 60 * SLOT, (CAL_FIM-CAL_INI)*SLOT)) + 'px';
}, 60000);

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
  if (e.key === 'Escape') { closePopup(); closeNewEvModal(); }
});

// ═══════════════════════════════════════════════
// PRESENÇA — BASEADA EM HORAS
// ═══════════════════════════════════════════════
function calcStats(c) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  const aulasPast   = c._aulas.filter(a => a.date <= hoje);
  const aulasFuture = c._aulas.filter(a => a.date >  hoje);

  // horas presentes e horas de falta (só nas aulas já ocorridas)
  const horasPresente = aulasPast.filter(a =>  att[a.id]).reduce((s,a) => s+a.horas, 0);
  const horasFalta    = aulasPast.filter(a => !att[a.id]).reduce((s,a) => s+a.horas, 0);

  const totalH     = c._totalH;
  const maxFaltasH = c._maxFaltasH;

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

    const fillColor = s.reprovado || s.emRisco ? 'var(--warn)' : c.cor;
    const pctFill   = Math.max(0, Math.min(s.pctPresenca, 100));

    const card = document.createElement('div');
    card.className = 'att-card' + (openSet.has(c.id) ? ' open' : '');
    card.dataset.c = c.id;

    card.innerHTML = `
      <div class="att-head">
        <div class="att-dot" style="background:${c.cor}"></div>
        <span class="att-name">${esc(c.nome)}</span>
        <span class="att-code">${c.id}</span>
        <span class="att-hbadge">${c._totalH}h</span>
        <span class="att-pill ${pillCls}">${pillTxt}</span>
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
            <span class="att-stat-val">${c._totalH}h</span>
          </div>
          <div class="att-stat">
            <span class="att-stat-label">Limite faltas</span>
            <span class="att-stat-val">≤ ${c._maxFaltasH}h (25%)</span>
          </div>
          <div class="att-stat">
            <span class="att-stat-label">Horas faltadas</span>
            <span class="att-stat-val ${s.reprovado?'danger':s.emRisco?'danger':s.horasFalta>0?'':'ok'}">${s.horasFalta}h</span>
          </div>
          <div class="att-stat">
            <span class="att-stat-label">Horas p/ reprovar</span>
            <span class="att-stat-val ${s.hRestantes<=0?'danger':s.hRestantes<=c._maxFaltasH*0.3?'danger':''}">${Math.max(0,s.hRestantes)}h</span>
          </div>
          <div class="att-stat">
            <span class="att-stat-label">Presença</span>
            <span class="att-stat-val ${s.pctPresenca>=75?'ok':s.pctPresenca>=60?'':'danger'}">${s.pctPresenca.toFixed(0)}%</span>
          </div>
        </div>

        <!-- Lista de aulas -->
        <div class="att-list" id="al-${c.id}"></div>

        <div class="att-footer">
          <div>
            ${s.hRestantes <= 1 && !s.reprovado ? `<div class="att-warn-1h">🚨 Alerta: apenas ${Math.max(0,s.hRestantes)}h restante para reprovação!</div>` :
              s.emRisco && !s.reprovado ? `<div class="att-warn-txt">⚠ Você pode faltar mais ${Math.max(0,s.hRestantes)}h sem reprovar</div>` : ''}
            ${s.reprovado ? `<div class="att-warn-txt">✕ Limite de ${s.maxFaltasH}h ultrapassado em ${(s.horasFalta-s.maxFaltasH)}h</div>` : ''}
            ${!s.emRisco && !s.reprovado && s.pctPresenca >= 75 ? `<div style="font-size:11px;color:var(--ok)">✓ Presença em dia (${s.pctPresenca.toFixed(0)}%)</div>` : ''}
          </div>
          <button class="att-mark-btn" data-c="${c.id}">✓ marcar todas passadas</button>
        </div>
      </div>`;

    container.appendChild(card);

    // ── Lista de aulas ──
    const listEl = card.querySelector(`#al-${c.id}`);
    c._aulas.forEach(aula => {
      const isPast   = aula.date <  hoje;
      const isToday  = aula.date.getTime() === hoje.getTime();
      const checked  = att[aula.id] || false;

      const row = document.createElement('div');
      row.className = 'att-row';

      let badge = '';
      if      (isToday)            badge = `<span class="abadge today">hoje</span>`;
      else if (!isPast)            badge = `<span class="abadge future">futuro</span>`;
      else if (!checked)           badge = `<span class="abadge falta">falta</span>`;

      const WDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
      row.innerHTML = `
        <input type="checkbox" class="att-cb" data-id="${aula.id}" ${checked?'checked':''}>
        <span class="att-row-date">${aula.date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
        <span class="att-row-day">${WDAYS[aula.date.getDay()]}</span>
        <span class="att-row-h">${aula.ini}h–${aula.fim}h</span>
        <span class="att-row-hval">${aula.horas}h</span>
        ${badge}`;
      listEl.appendChild(row);

      row.querySelector('.att-cb').addEventListener('change', e => {
        att[aula.id] = e.target.checked;
        sbSaveAtt(aula.id, e.target.checked);
        save(true); renderAttendance(); renderCalendar();
      });
    });

    card.querySelector('.att-head').addEventListener('click', () => card.classList.toggle('open'));
    card.querySelector('.att-mark-btn').addEventListener('click', e => {
      e.stopPropagation();
      c._aulas.filter(a => a.date <= hoje).forEach(a => {
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
// BTT
// ═══════════════════════════════════════════════
const btt = document.getElementById('btt');
window.addEventListener('scroll', () => btt.classList.toggle('show', scrollY > 300));
btt.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));

// SW
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
function init() {
  renderCalendar();
  renderSemProg();
  renderAttendance();
  renderList('task');
  renderList('topic');
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

  showLoadOverlay();
  const hasSession = await checkSession();

  if (hasSession) {
    // Tenta carregar dados do Supabase
    const loaded = await sbLoad();
    if (!loaded) {
      // Fallback para dados do localStorage se Supabase falhar
      console.warn('Falha ao carregar Supabase, usando localStorage');
    }
    hideLoginOverlay();
    document.getElementById('btnLogout').style.display = '';
    init();
    hideLoadOverlay();
    showCriticalAttendanceAlerts();
  } else {
    // Sem sessão: exibe login (app já renderizado em background)
    init();
    hideLoadOverlay();
    showLoginOverlay();
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

// ── Handler do formulário de login ──
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const btn   = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginErr');

  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Entrando…';

  // Sem credenciais: entrada anônima — cria sessão Supabase anônima para sincronizar dados
  if (!email && !pass) {
    if (sb) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (!error && data.user) {
        supaUser = data.user;
      } else if (error) {
        console.warn('signInAnonymously falhou, modo local apenas:', error.message);
      }
    }
    hideLoginOverlay();
    document.getElementById('btnLogout').style.display = '';
    init();
    btn.disabled = false;
    btn.textContent = 'Entrar';
    showToast('bem-vindo, convidado!');
    showCriticalAttendanceAlerts();
    // Sincroniza dados locais com Supabase em background (prioridade Supabase)
    if (supaUser) sbFullSync().catch(e => console.error('sbFullSync (anônimo):', e));
    return;
  }

  const errMsg = await signIn(email, pass);
  if (!errMsg) {
    showLoadOverlay();
    await sbLoad();
    hideLoginOverlay();
    document.getElementById('btnLogout').style.display = '';
    init();
    hideLoadOverlay();
    showToast('bem-vindo!');
    showCriticalAttendanceAlerts();
  } else {
    errEl.textContent = errMsg;
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

// ── Handler do botão de logout ──
document.getElementById('btnLogout').addEventListener('click', () => doSignOut());

// Re-render a cada minuto (linha de agora, badges "hoje/futuro")
setInterval(() => {
  renderCalendar();
  renderSemProg();
  renderAttendance();
  updateFooter();
}, 60000);

startApp();

})()
