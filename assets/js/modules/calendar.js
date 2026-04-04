// ═══════════════════════════════════════════════
// CALENDAR — Calendário, popup, modal de evento e semestre
// ═══════════════════════════════════════════════
import { COLORS, CAL_INI, CAL_FIM, SLOT, CALENDAR_DRAG_THRESHOLD, DNAMES, LS } from './config.js';
import { esc, sanitizeCor, parseDateLocal, fmt, uid }                            from './utils.js';
import {
  COURSES, AULA_MAP, att, cancelled, customEvents, setCustomEvents,
  archivedCourses, semConfig, setSemConfig, calcTrend,
} from './state.js';
import { save, showToast }                           from './storage.js';
import { sbSaveAtt, sbSaveEvent, sbDeleteEvent }     from './supabase.js';
// Circular com attendance.js — seguro: chamadas só ocorrem em handlers
import {
  renderAttendance, openAddCourseModal, closeAddCourseModal,
  archiveCourse, closeArchivedModal,
} from './attendance.js';

// ── Estado local ──
let wkOff       = 0;   // offset de semanas (0 = atual)
let _prevWkOff  = null; // rastreia mudança de semana para animação
let editingEvId = null; // null = novo, string = editar

// ─────────────────────────────────────────────────────
// RELÓGIO
// ─────────────────────────────────────────────────────
function tick() {
  const el = document.getElementById('clock');
  if (el) el.textContent =
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(tick, 1000); tick();

// ─────────────────────────────────────────────────────
// NAVEGAÇÃO DE SEMANA
// ─────────────────────────────────────────────────────
function getWeekDates(off = 0) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dow = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setDate(now.getDate() - dow + off * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
  });
}

document.getElementById('wkPrev').onclick   = () => { wkOff--; renderCalendar(); };
document.getElementById('wkNext').onclick   = () => { wkOff++; renderCalendar(); };
document.getElementById('btnToday').onclick = () => { wkOff = 0; renderCalendar(); scrollToNow(); };

export function scrollToNow() {
  const calScroll = document.querySelector('.cal-scroll');
  if (!calScroll) return;
  const targetHour = wkOff === 0
    ? Math.max(CAL_INI, new Date().getHours() - 1)
    : CAL_INI;
  calScroll.scrollTo({ top: (targetHour - CAL_INI) * SLOT, behavior: 'smooth' });
}

document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  if (document.querySelector('.modal-bg.open')) return;
  if (e.key === 'ArrowLeft')             { wkOff--; renderCalendar(); }
  if (e.key === 'ArrowRight')            { wkOff++; renderCalendar(); }
  if (e.key === 'Home' || e.key === 't') { wkOff = 0; renderCalendar(); scrollToNow(); }
  if (e.key === 'Escape') {
    closePopup(); closeNewEvModal(); closeAddCourseModal(); closeArchivedModal();
  }
});

// ─────────────────────────────────────────────────────
// SEMESTRE
// ─────────────────────────────────────────────────────
export function getSemDates() {
  if (semConfig && semConfig.ini && semConfig.fim) {
    return { ini: new Date(semConfig.ini), fim: new Date(semConfig.fim) };
  }
  return { ini: new Date(2026, 2, 2), fim: new Date(2026, 6, 7) };
}

export function renderSemProg() {
  const { ini, fim } = getSemDates();
  const now     = new Date();
  const total   = fim - ini;
  const elapsed = Math.min(Math.max(now - ini, 0), total);
  const pct     = total > 0 ? elapsed / total * 100 : 0;
  const semTot  = Math.ceil(total / (7 * 86400000));
  const semAt   = Math.ceil((now - ini) / (7 * 86400000));
  document.getElementById('semLabel').textContent =
    now < ini ? 'antes do início' : now > fim ? 'encerrado' : `semana ${Math.max(1, semAt)}/${semTot}`;
  document.getElementById('semFill').style.width  = pct.toFixed(1) + '%';
  document.getElementById('semPct').textContent   = pct.toFixed(0) + '%';
  if (now > fim) {
    const toArchive = [...COURSES];
    let any = false;
    toArchive.forEach(c => {
      if (!archivedCourses.some(a => a.courseId === c.id)) { archiveCourse(c); any = true; }
    });
    if (any) showToast('Semestre encerrado — disciplinas arquivadas automaticamente');
  }
}

function openSemConfigModal() {
  const { ini, fim } = getSemDates();
  document.getElementById('semNome').value = semConfig ? (semConfig.nome || '') : '2026.1 — 1º Semestre';
  document.getElementById('semIni').value  = ini.toISOString().slice(0, 10);
  document.getElementById('semFim').value  = fim.toISOString().slice(0, 10);
  document.getElementById('semConfigModal').classList.add('open');
  document.getElementById('semNome').focus();
}

function closeSemConfigModal() {
  document.getElementById('semConfigModal').classList.remove('open');
}

document.getElementById('btnSemConfig').addEventListener('click', openSemConfigModal);
document.getElementById('semConfigClose').addEventListener('click', closeSemConfigModal);
document.getElementById('semConfigCancel').addEventListener('click', closeSemConfigModal);
document.getElementById('semConfigModal').addEventListener('mousedown', e => {
  if (e.target === document.getElementById('semConfigModal')) closeSemConfigModal();
});
document.getElementById('semConfigSave').addEventListener('click', () => {
  const nome = document.getElementById('semNome').value.trim();
  const iniS = document.getElementById('semIni').value;
  const fimS = document.getElementById('semFim').value;
  if (!iniS || !fimS) { showToast('preencha as datas'); return; }
  const iniD = new Date(iniS + 'T00:00:00');
  const fimD = new Date(fimS + 'T00:00:00');
  if (fimD <= iniD) { showToast('a data de término deve ser após o início'); return; }
  setSemConfig({ nome, ini: iniS, fim: fimS });
  localStorage.setItem(LS.semConfig, JSON.stringify(semConfig));
  closeSemConfigModal();
  renderSemProg();
  showToast('semestre configurado');
});

// ─────────────────────────────────────────────────────
// POPUP DE EVENTO
// ─────────────────────────────────────────────────────
const popup = document.getElementById('evPopup');
export function closePopup() { popup.classList.remove('open'); }

document.getElementById('evPopupClose').onclick = closePopup;
document.addEventListener('mousedown', e => {
  if (popup.classList.contains('open') && !popup.contains(e.target)) closePopup();
});

function openAulaPopup(aulaId, rect) {
  const entry = AULA_MAP[aulaId]; if (!entry) return;
  const { aula, curso } = entry;
  document.getElementById('evPopupTitle').textContent = curso.nome;
  document.getElementById('evPopupMeta').innerHTML = `
    <span>📅 ${aula.date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</span>
    <span>🕐 ${aula.ini}h – ${aula.fim}h (${aula.horas}h)</span>
    <span>📍 ${esc(curso.local)}</span>
    <span>🔖 ${esc(curso.id)} · turma ${esc(curso.turma)}</span>
  `;
  const isCan    = cancelled.has(aulaId);
  const attDiv   = document.getElementById('evPopupAtt');
  const cb        = document.getElementById('evPopupCb');
  const cancelBtn = document.getElementById('evPopupCancelBtn');
  attDiv.style.display = 'block';
  cb.checked  = !isCan && (att[aulaId] || false);
  cb.disabled = isCan;
  cb.onchange = () => {
    att[aulaId] = cb.checked;
    sbSaveAtt(aulaId, cb.checked);
    save(true); renderCalendar(); renderAttendance();
    showToast(cb.checked ? '✓ presença marcada' : 'presença desmarcada');
  };
  cancelBtn.textContent = isCan ? '↩ desfazer cancelamento' : '⊘ cancelar aula';
  cancelBtn.onclick = () => {
    if (cancelled.has(aulaId)) { cancelled.delete(aulaId); showToast('↩ cancelamento desfeito'); }
    else { cancelled.add(aulaId); att[aulaId] = false; sbSaveAtt(aulaId, false); showToast('⊘ aula cancelada'); }
    save(true); renderCalendar(); renderAttendance();
    openAulaPopup(aulaId, rect);
  };
  document.getElementById('evPopupActions').innerHTML = '';
  positionPopup(rect);
}

function openCustomPopup(evId, rect) {
  const ev = customEvents.find(e => e.id === evId); if (!ev) return;
  const typeLabel = { lembrete:'📌 Lembrete', prova:'📝 Prova', entrega:'📋 Entrega', outro:'📎 Outro' }[ev.type] || '📎';
  const titleEl = document.getElementById('evPopupTitle');
  titleEl.innerHTML = '';
  const span = document.createElement('span');
  span.style.color = sanitizeCor(ev.cor); span.textContent = ev.nome;
  titleEl.appendChild(span);
  document.getElementById('evPopupMeta').innerHTML = `
    <span>${typeLabel}</span>
    <span>📅 ${ev.date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</span>
    <span>🕐 ${esc(ev.ini)} – ${esc(ev.fim)}</span>
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
    setCustomEvents(customEvents.filter(e => e.id !== evId));
    sbDeleteEvent(evId);
    save(true); renderCalendar(); closePopup(); showToast('removido');
  };
  acts.appendChild(editBtn); acts.appendChild(delBtn);
  positionPopup(rect);
}

function positionPopup(rect) {
  popup.classList.add('open');
  const pw = 270, ph = 200, vw = window.innerWidth, vh = window.innerHeight;
  let left = rect.right + 8, top = rect.top;
  if (left + pw > vw) left = rect.left - pw - 8;
  if (top  + ph > vh) top  = vh - ph - 12;
  if (left < 8) left = 8;
  if (top  < 8) top  = 8;
  popup.style.left = left + 'px'; popup.style.top = top + 'px';
}

// ─────────────────────────────────────────────────────
// MODAL NOVO EVENTO
// ─────────────────────────────────────────────────────
export function initColorRow() {
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
  const sel = document.querySelector('#evColorRow .color-swatch.sel');
  return sel ? sel.dataset.color : COLORS[0];
}

function setSelectedColor(c) {
  document.querySelectorAll('#evColorRow .color-swatch').forEach(s => {
    s.classList.toggle('sel', s.dataset.color === c);
  });
}

export function openNewEvModal(prefill = null) {
  editingEvId = prefill ? prefill.id : null;
  document.getElementById('newEvTitle').textContent = editingEvId ? 'Editar evento' : 'Novo evento';
  document.getElementById('evName').value  = prefill ? prefill.nome : '';
  document.getElementById('evType').value  = prefill ? prefill.type : 'lembrete';
  document.getElementById('evNote').value  = prefill ? (prefill.note || '') : '';
  const d = prefill ? new Date(prefill.date) : new Date();
  document.getElementById('evDate').value  = d.toISOString().slice(0, 10);
  document.getElementById('evStart').value = prefill ? prefill.ini : '08:00';
  document.getElementById('evEnd').value   = prefill ? prefill.fim : '09:00';
  initColorRow();
  if (prefill) setSelectedColor(prefill.cor);
  document.getElementById('newEvModal').classList.add('open');
  document.getElementById('evName').focus();
}

export function closeNewEvModal() {
  document.getElementById('newEvModal').classList.remove('open');
  editingEvId = null;
}

document.getElementById('newEvClose').onclick  = closeNewEvModal;
document.getElementById('newEvCancel').onclick = closeNewEvModal;
document.getElementById('newEvModal').addEventListener('mousedown', e => {
  if (e.target === document.getElementById('newEvModal')) closeNewEvModal();
});
document.getElementById('newEvSave').addEventListener('click', () => {
  const nome = document.getElementById('evName').value.trim();
  const date = document.getElementById('evDate').value;
  const ini  = document.getElementById('evStart').value;
  const fim  = document.getElementById('evEnd').value;
  const type = document.getElementById('evType').value;
  const note = document.getElementById('evNote').value.trim();
  const cor  = getSelectedColor();
  if (!nome || !date || !ini || !fim) { showToast('preencha título, data e horário'); return; }
  if (nome.length > 100) { showToast('título deve ter no máximo 100 caracteres'); return; }
  if (note.length > 500) { showToast('observação deve ter no máximo 500 caracteres'); return; }
  if (!['lembrete','prova','entrega','outro'].includes(type)) { showToast('tipo inválido'); return; }
  const evDate = parseDateLocal(date);
  if (editingEvId) {
    const ev = customEvents.find(e => e.id === editingEvId);
    if (ev) { ev.nome=nome; ev.date=evDate; ev.ini=ini; ev.fim=fim; ev.type=type; ev.note=note; ev.cor=cor; sbSaveEvent(ev); }
  } else {
    const newEv = { id: uid(), nome, date: evDate, ini, fim, type, note, cor };
    customEvents.push(newEv); sbSaveEvent(newEv);
  }
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const evDow  = (evDate.getDay() + 6) % 7;
  const evMon  = new Date(evDate); evMon.setDate(evDate.getDate() - evDow);
  const todDow = (today.getDay() + 6) % 7;
  const todMon = new Date(today); todMon.setDate(today.getDate() - todDow);
  wkOff = Math.round((evMon - todMon) / (7 * 86400000));
  save(true); renderCalendar(); closeNewEvModal();
  showToast(editingEvId ? 'evento atualizado' : 'evento criado');
});

// ─────────────────────────────────────────────────────
// RENDER CALENDÁRIO
// ─────────────────────────────────────────────────────
export function renderCalendar() {
  const days     = getWeekDates(wkOff);
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const now      = new Date();
  const hours    = CAL_FIM - CAL_INI;
  const gridCols = '52px repeat(7,1fr)';
  let h = '';

  h += `<div style="display:grid;grid-template-columns:${gridCols};border-bottom:2px solid var(--border);">`;
  h += '<div class="cal-gutter"></div>';
  days.forEach((d, i) => {
    const isT = d.getTime() === today.getTime(), isP = d < today;
    h += `<div class="cal-dh${isT?' is-today':''}${isP&&!isT?' is-past':''}">
      <div class="dname">${DNAMES[i]}</div>
      <div class="dnum${isT&&wkOff===0?' today-ping':''}">${d.getDate()}</div>
    </div>`;
  });
  h += '</div>';
  h += `<div style="display:grid;grid-template-columns:${gridCols};position:relative;"><div>`;
  for (let hh = CAL_INI; hh <= CAL_FIM; hh++) {
    h += `<div class="cal-ts"><span class="cal-tl">${hh<10?'0'+hh:hh}:00</span></div>`;
  }
  h += '</div>';

  days.forEach((d, di) => {
    const dStr = d.toISOString().slice(0, 10);
    const isT  = d.getTime() === today.getTime(), isP = d < today;
    const aulasDia = COURSES.flatMap(c =>
      c._aulas.filter(a => a.date.toISOString().slice(0,10) === dStr).map(a => ({...a, curso:c}))
    );
    const evsDia = customEvents.filter(e => {
      const ed = new Date(e.date); ed.setHours(0,0,0,0); return ed.getTime() === d.getTime();
    }).map(e => {
      const [sh,sm] = e.ini.includes(':') ? e.ini.split(':').map(Number) : [Number(e.ini)||0, 0];
      const [eh,em] = e.fim.includes(':') ? e.fim.split(':').map(Number) : [Number(e.fim)||0, 0];
      return {...e, _ini: sh+sm/60, _fim: eh+em/60};
    });

    h += `<div class="cal-dcol${isT?' is-today-col':''}" data-col="${di}" data-date="${dStr}">`;
    for (let hh = CAL_INI; hh < CAL_FIM; hh++) {
      h += `<div class="cal-hl" data-hour="${hh}" data-date="${dStr}"></div>`;
    }
    if (isT && wkOff === 0) {
      const mins = (now.getHours()-CAL_INI)*60+now.getMinutes();
      h += `<div class="now-line" id="nowLine" style="top:${Math.max(0,Math.min(mins/60*SLOT,hours*SLOT))}px"></div>`;
    }
    aulasDia.forEach(a => {
      const topPx = (a.ini-CAL_INI)*SLOT, durPx=(a.fim-a.ini)*SLOT;
      const past  = isP||(isT&&a.fim<=now.getHours()), chk=att[a.id]||false, isCan=cancelled.has(a.id);
      const builtIn = ['c1','c2','c3','c4'].includes(a.curso.cls);
      const sc = sanitizeCor(a.curso.cor);
      const cs = builtIn?'':`background:${sc}1a;border-color:${sc};`, ns=builtIn?'':`color:${sc}`;
      const trend = calcTrend(a.curso);
      const ti = trend==='up'?'<span class="ev-trend trend-up">↑</span>':trend==='down'?'<span class="ev-trend trend-down">↓</span>':trend==='bad'?'<span class="ev-trend trend-bad">↓↓</span>':'';
      h += `<div class="cal-ev ${a.curso.cls||''}${past?' ev-past':''}${isCan?' ev-cancelled':''}" style="top:${topPx}px;height:${durPx}px;${cs}" data-aula="${a.id}">
        <div class="ev-name"${ns?` style="${ns}"`:''}>${esc(a.curso.nome)}</div>
        <div class="ev-time">${a.ini}h–${a.fim}h · ${a.horas}h</div>
        ${isCan?'<div class="ev-cancelled-label">⊘ cancelada</div>':chk?'<div class="ev-check">✓ presente</div>':''}${ti}
      </div>`;
    });
    evsDia.forEach(e => {
      const topPx=( e._ini-CAL_INI)*SLOT, durPx=Math.max((e._fim-e._ini)*SLOT,20);
      const ti2={lembrete:'📌',prova:'📝',entrega:'📋',outro:'📎'}[e.type]||'📎';
      const sc=sanitizeCor(e.cor);
      h += `<div class="cal-ev ev-custom${isP?' ev-past':''}" style="top:${topPx}px;height:${durPx}px;border-color:${sc};background:${sc}18" data-custom="${e.id}">
        <div class="ev-name" style="color:${sc}">${ti2} ${esc(e.nome)}</div>
        <div class="ev-time">${esc(e.ini)}–${esc(e.fim)}</div>
      </div>`;
    });
    h += '</div>';
  });
  h += '</div>';

  document.getElementById('calInner').innerHTML = h;
  document.getElementById('wkLabel').textContent = `${fmt(days[0])} – ${fmt(days[6])}`;

  // ── Animação de entrada ao mudar de semana ──
  const weekChanged = _prevWkOff !== null && _prevWkOff !== wkOff;
  _prevWkOff = wkOff;
  if (weekChanged) {
    document.querySelectorAll('.cal-ev').forEach((el, i) => {
      el.style.animation = 'none';
      el.style.opacity   = '0';
      el.style.transform = 'translateY(10px)';
      const col  = el.closest('.cal-dcol');
      const colI = col ? parseInt(col.dataset.col || 0) : 0;
      const delay = colI * 40 + (i % 4) * 18;
      requestAnimationFrame(() => {
        el.style.transition = `opacity .28s ease ${delay}ms, transform .28s ease ${delay}ms`;
        el.style.opacity   = '';
        el.style.transform = '';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
        }, { once: true });
      });
    });
  }

  document.querySelectorAll('.cal-ev[data-aula]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); openAulaPopup(el.dataset.aula, el.getBoundingClientRect()); });
  });

  document.querySelectorAll('.cal-hl').forEach(hl => {
    hl.addEventListener('click', e => {
      if (e.target !== hl) return;
      closePopup();
      const hour = parseInt(hl.dataset.hour);
      const dateStr = hl.dataset.date || hl.closest('.cal-dcol').dataset.date;
      const hStr = hour<10?'0'+hour:''+hour, h1=(hour+1)<10?'0'+(hour+1):''+(hour+1);
      const startVal=hStr+':00', endVal=(hour<CAL_FIM-1)?h1+':00':hStr+':50';
      const old = document.getElementById('slotChoice'); if(old) old.remove();
      const choice = document.createElement('div');
      choice.id='slotChoice'; choice.className='slot-choice';
      const vw=window.innerWidth, vh=window.innerHeight;
      let cx=e.clientX+8, cy=e.clientY;
      if(cx+180>vw) cx=e.clientX-180; if(cy+100>vh) cy=e.clientY-100;
      choice.style.cssText=`left:${cx}px;top:${cy}px;`;
      choice.innerHTML=`<button class="slot-choice-btn" id="slotChoiceEv">📌 Novo evento</button><button class="slot-choice-btn" id="slotChoiceDis">🎓 Adicionar disciplina</button>`;
      document.body.appendChild(choice);
      const rm=()=>choice.remove();
      document.addEventListener('mousedown',function r(e2){if(!choice.contains(e2.target)){rm();document.removeEventListener('mousedown',r);}});
      document.getElementById('slotChoiceEv').onclick=()=>{rm();document.getElementById('evDate').value=dateStr;document.getElementById('evStart').value=startVal;document.getElementById('evEnd').value=endVal;openNewEvModal();};
      document.getElementById('slotChoiceDis').onclick=()=>{rm();openAddCourseModal();};
    });
  });

  initCalendarDrag();
}

setInterval(() => {
  if (wkOff!==0) return;
  const line=document.getElementById('nowLine'); if(!line) return;
  const now=new Date(), mins=(now.getHours()-CAL_INI)*60+now.getMinutes();
  line.style.top=Math.max(0,Math.min(mins/60*SLOT,(CAL_FIM-CAL_INI)*SLOT))+'px';
},60000);

// ─────────────────────────────────────────────────────
// DRAG & DROP
// ─────────────────────────────────────────────────────
function initCalendarDrag() {
  const calScroll = document.querySelector('.cal-scroll');
  if (!calScroll) return;
  document.querySelectorAll('.cal-ev[data-custom]').forEach(el => {
    let ghost = null;
    el.addEventListener('pointerdown', function(e) {
      if (e.button && e.button!==0) return;
      e.stopPropagation();
      const startX=e.clientX, startY=e.clientY;
      let dragging=false;
      const evId=el.dataset.custom, ev=customEvents.find(x=>x.id===evId);
      if(!ev) return;
      const rect=el.getBoundingClientRect(), offsetY=e.clientY-rect.top;

      function startDrag(){
        dragging=true; closePopup(); el.setPointerCapture(e.pointerId);
        const sc=sanitizeCor(ev.cor);
        ghost=document.createElement('div');
        ghost.className=el.className+' cal-ev-drag-ghost';
        ghost.style.cssText=`position:fixed;width:${rect.width}px;height:${rect.height}px;top:${rect.top}px;left:${rect.left}px;opacity:0.75;pointer-events:none;z-index:9999;border-color:${sc};background:${sc}28;border-left:3px solid ${sc};border-radius:6px;padding:3px 6px;font-size:11px;box-shadow:0 4px 16px rgba(0,0,0,.18);transition:none;transform:scale(1.03);`;
        ghost.innerHTML=el.innerHTML; document.body.appendChild(ghost);
        el.style.opacity='0.3'; document.body.style.userSelect='none'; document.body.style.cursor='grabbing';
      }
      function onMove(e2){
        if(!dragging){if(Math.abs(e2.clientX-startX)>CALENDAR_DRAG_THRESHOLD||Math.abs(e2.clientY-startY)>CALENDAR_DRAG_THRESHOLD) startDrag(); return;}
        ghost.style.top=(e2.clientY-offsetY)+'px'; ghost.style.left=(e2.clientX-rect.width/2)+'px';
        document.querySelectorAll('.cal-dcol.drag-over').forEach(c=>c.classList.remove('drag-over'));
        const col=document.elementFromPoint(e2.clientX,e2.clientY), dcol=col&&col.closest('.cal-dcol');
        if(dcol) dcol.classList.add('drag-over');
      }
      function onUp(e2){
        el.removeEventListener('pointermove',onMove); el.removeEventListener('pointerup',onUp); el.removeEventListener('pointercancel',onUp);
        document.querySelectorAll('.cal-dcol.drag-over').forEach(c=>c.classList.remove('drag-over'));
        document.body.style.userSelect=''; document.body.style.cursor=''; el.style.opacity='';
        if(ghost){ghost.remove();ghost=null;}
        if(!dragging){openCustomPopup(evId,el.getBoundingClientRect());return;}
        const dropTarget=document.elementFromPoint(e2.clientX,e2.clientY);
        const dcol=dropTarget&&dropTarget.closest('.cal-dcol[data-date]');
        if(!dcol) return;
        const newDateStr=dcol.dataset.date, colRect=dcol.getBoundingClientRect();
        const relY=(e2.clientY-colRect.top)+calScroll.scrollTop-offsetY;
        const rawHour=CAL_INI+relY/SLOT, totalMins=Math.round((rawHour*60)/15)*15;
        const newIniH=Math.max(CAL_INI,Math.min(CAL_FIM-1,Math.floor(totalMins/60))), newIniM=totalMins%60;
        const [oih,oim]=ev.ini.includes(':') ? ev.ini.split(':').map(Number) : [Number(ev.ini)||0, 0];
        const [ofh,ofm]=ev.fim.includes(':') ? ev.fim.split(':').map(Number) : [Number(ev.fim)||0, 0];
        const dur=(ofh*60+ofm)-(oih*60+oim);
        let ftm=newIniH*60+newIniM+dur; if(ftm>CAL_FIM*60) ftm=CAL_FIM*60;
        const nfh=Math.floor(ftm/60), nfm=ftm%60, p=n=>(n<10?'0':'')+n;
        ev.date=new Date(newDateStr+'T00:00:00'); ev.ini=p(newIniH)+':'+p(newIniM); ev.fim=p(nfh)+':'+p(nfm);
        save(true); renderCalendar(); showToast('evento movido');
      }
      el.addEventListener('pointermove',onMove); el.addEventListener('pointerup',onUp); el.addEventListener('pointercancel',onUp);
    });
  });
}
