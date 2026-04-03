// ═══════════════════════════════════════════════
// UI — Listas, footer, dark mode, BTT, geolocalização
// ═══════════════════════════════════════════════
import { LS, CAMPUS_RADIUS_M, GEO_LEAD_H, GEO_TIMEOUT_MS, GEO_MAX_AGE_MS, GEO_CHECK_INTERVAL_MS, getCampusCoords } from './config.js';
import { esc, uid }                    from './utils.js';
import { COURSES, att, tasks, topics, customEvents } from './state.js';
import { save, showToast, undoBuf, setUndoBuf, undoTm, setUndoTm, listTm } from './storage.js';
import { sbSaveItem, sbDeleteItem, sbSaveAtt } from './supabase.js';
import { renderCalendar }              from './calendar.js';
import { renderAttendance }            from './attendance.js';

// ─────────────────────────────────────────────────────
// LISTAS (tarefas / tópicos)
// ─────────────────────────────────────────────────────
export function renderList(type) {
  const items  = type === 'task' ? tasks  : topics;
  const listEl = document.getElementById(type === 'task' ? 'taskList'  : 'topicList');
  const cntEl  = document.getElementById(type === 'task' ? 'taskCnt'   : 'topicCnt');
  const sorted = [...items].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
  listEl.innerHTML = '';

  sorted.forEach(item => {
    const li = document.createElement('li');
    li.className  = 'litem' + (item.checked ? ' done' : '');
    li.dataset.id = item.id;
    li.innerHTML  = `
      <input type="checkbox" class="lcb" ${item.checked ? 'checked' : ''}>
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
      const done = () => {
        const v = inp.value.trim();
        if (v) { item.text = v; sbSaveItem(type, item); }
        save(true); renderList(type);
      };
      inp.addEventListener('blur', done);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    });

    li.querySelector('.ldel').addEventListener('click', () => {
      const arr = type === 'task' ? tasks : topics;
      const idx = arr.findIndex(t => t.id === item.id); if (idx === -1) return;
      const [removed] = arr.splice(idx, 1);
      sbDeleteItem(type, removed.id);
      setUndoBuf({ type, item: removed, index: idx });
      if (undoTm) clearTimeout(undoTm);
      setUndoTm(setTimeout(() => setUndoBuf(null), 5000));
      save(true); showToast('removido', true); renderList(type);
    });

    listEl.appendChild(li);
  });

  const pend = items.filter(t => !t.checked).length;
  cntEl.textContent = pend > 0 ? `${pend} pendente${pend !== 1 ? 's' : ''}` : (items.length > 0 ? 'tudo feito ✓' : '0');
}

export function addItem(type, text) {
  if (!text.trim()) return;
  if (text.trim().length > 200) { showToast('texto deve ter no máximo 200 caracteres'); return; }
  const arr  = type === 'task' ? tasks : topics;
  const item = { id: uid(), text: text.trim(), checked: false };
  arr.push(item);
  sbSaveItem(type, item, arr.length - 1);
  save(true); renderList(type);
}

export function doUndo() {
  if (!undoBuf) return;
  const { type, item, index } = undoBuf;
  const arr = type === 'task' ? tasks : topics;
  arr.splice(index, 0, item);
  arr.forEach((t, i) => sbSaveItem(type, t, i));
  save(true); renderList(type); setUndoBuf(null);
}

['task', 'topic'].forEach(t => {
  document.getElementById(t + 'Add').onclick = () => {
    const i = document.getElementById(t + 'Inp'); addItem(t, i.value); i.value = '';
  };
  document.getElementById(t + 'Inp').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const i = e.target; addItem(t, i.value); i.value = ''; }
  });
});

// ─────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────
export function updateFooter() {
  const hoje  = new Date(); hoje.setHours(0, 0, 0, 0);
  const all   = COURSES.flatMap(c => c._aulas);
  const past  = all.filter(a => a.date <= hoje);
  const presH = past.filter(a => att[a.id]).reduce((s, a) => s + a.horas, 0);
  const totalH = past.reduce((s, a) => s + a.horas, 0);
  const marcadas = past.filter(a => att[a.id]).length;
  document.getElementById('footerInfo').textContent =
    `${marcadas}/${past.length} aulas passadas marcadas · ${presH}/${totalH}h de presença · ${customEvents.length} evento${customEvents.length !== 1 ? 's' : ''}`;

  const badge = document.getElementById('hdrBadge');
  const totalFaltasH = COURSES.reduce((s, c) => {
    const p = c._aulas.filter(a => a.date <= hoje && !att[a.id]);
    return s + p.reduce((sh, a) => sh + a.horas, 0);
  }, 0);
  const emRisco = COURSES.some(c => {
    const fH = c._aulas.filter(a => a.date <= hoje && !att[a.id]).reduce((s, a) => s + a.horas, 0);
    return fH >= c._maxFaltasH * 0.75;
  });
  if (totalFaltasH > 0) {
    badge.textContent = `${totalFaltasH}h falta${totalFaltasH !== 1 ? 's' : ''}`;
    badge.style.display    = 'inline-block';
    badge.style.background = emRisco ? 'var(--warnb)'   : 'var(--surface2)';
    badge.style.color      = emRisco ? 'var(--warn)'    : 'var(--text3)';
    badge.style.borderColor = emRisco ? 'color-mix(in srgb,var(--warn) 50%,transparent)' : 'var(--border)';
  } else {
    badge.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────
// DARK MODE
// ─────────────────────────────────────────────────────
document.getElementById('btnDark').addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  document.querySelector('#btnDark .hbtn-icon').textContent = dark ? '☀' : '🌙';
  document.querySelector('#btnDark .hbtn-label').textContent = dark ? ' claro' : ' escuro';
  localStorage.setItem(LS.dark, dark);
});

// ─────────────────────────────────────────────────────
// BTT (back-to-top)
// ─────────────────────────────────────────────────────
const btt = document.getElementById('btt');
window.addEventListener('scroll', () => btt.classList.toggle('show', scrollY > 300));
btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ─────────────────────────────────────────────────────
// GEOLOCALIZAÇÃO — presença automática
// ─────────────────────────────────────────────────────
let geoIntervalId = null;

function haversineDistM(lat1, lng1, lat2, lng2) {
  const R   = 6371000;
  const φ1  = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ  = (lat2 - lat1) * Math.PI / 180;
  const Δλ  = (lng2 - lng1) * Math.PI / 180;
  const a   = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAulaAtual() {
  const now  = new Date();
  const hoje = new Date(now); hoje.setHours(0, 0, 0, 0);
  const nowH = now.getHours() + now.getMinutes() / 60;
  for (const c of COURSES) {
    for (const aula of c._aulas) {
      if (aula.date.getTime() !== hoje.getTime()) continue;
      if (nowH >= (aula.ini - GEO_LEAD_H) && nowH < aula.fim) return { aula, curso: c };
    }
  }
  return null;
}

async function tryAutoMarkPresenca(lat, lng) {
  const campus = getCampusCoords();
  const dist = haversineDistM(lat, lng, campus.lat, campus.lng);
  if (dist > CAMPUS_RADIUS_M) return;
  const resultado = getAulaAtual(); if (!resultado) return;
  const { aula, curso } = resultado;
  if (att[aula.id]) return;
  att[aula.id] = true;
  sbSaveAtt(aula.id, true);
  save(true); renderCalendar(); renderAttendance();
  showToast(`📍 presença automática: ${curso.nome}`);
}

function geoCheckOnce() {
  if (!getAulaAtual()) return;
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => tryAutoMarkPresenca(pos.coords.latitude, pos.coords.longitude),
    err => { /* geolocalização indisponível */ },
    { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: GEO_MAX_AGE_MS }
  );
}

export function initGeoAtt() {
  if (geoIntervalId) return;
  if (!('geolocation' in navigator)) return;
  geoCheckOnce();
  geoIntervalId = setInterval(geoCheckOnce, GEO_CHECK_INTERVAL_MS);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) geoCheckOnce();
});
