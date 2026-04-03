// ═══════════════════════════════════════════════
// ATTENDANCE — Presença, disciplinas e arquivados
// ═══════════════════════════════════════════════
import { COURSE_COLORS, LS }             from './config.js';
import { esc, sanitizeCor, uid }         from './utils.js';
import {
  COURSES, att, cancelled, userCourses, archivedCourses,
  BASE_COURSES, gerarAulas, rebuildCourses,
  calcStats, calcTrend,
} from './state.js';
import { save, showToast }               from './storage.js';
import { sbSaveAtt, sbSaveItem, sbDeleteItem, sbFullSync } from './supabase.js';
// Circular com calendar.js — seguro: chamadas só em handlers
import { renderCalendar }                from './calendar.js';

// ── Callback para init() após importação xlsx ──
let _initCallback = null;
export function setInitCallback(fn) { _initCallback = fn; }

// ─────────────────────────────────────────────────────
// RENDER PRESENÇA
// ─────────────────────────────────────────────────────
export function renderAttendance() {
  const container = document.getElementById('attGrid');
  const openSet = new Set([...container.querySelectorAll('.att-card.open')].map(e => e.dataset.c));
  container.innerHTML = '';

  COURSES.forEach((c, cardIdx) => {
    const s     = calcStats(c);
    const hoje  = new Date(); hoje.setHours(0,0,0,0);
    const isUserCourse = userCourses.some(uc => uc.id === c.id);
    const safeCor = sanitizeCor(c.cor);

    let pillTxt, pillCls = '';
    if (s.reprovado)    { pillTxt=`✕ reprovado · ${s.horasFalta}h/${s.maxFaltasH}h falta`; pillCls='danger'; }
    else if (s.emRisco) { pillTxt=`⚠ ${s.horasFalta}h/${s.maxFaltasH}h · ${s.hRestantes.toFixed(0)}h restam`; pillCls='warn'; }
    else                { pillTxt=`${s.horasFalta}h falta · ${s.aulasFaltou} aula${s.aulasFaltou!==1?'s':''}`; pillCls=s.pctPresenca>=75?'safe':''; }

    const fillColor = s.reprovado||s.emRisco ? 'var(--warn)' : safeCor;
    const pctFill   = Math.max(0,Math.min(s.pctPresenca,100));
    const trend = calcTrend(c);
    const trendBadge = trend==='up'  ?'<span class="trend-up"   title="Frequência melhorando ↑">↑</span>':
                       trend==='down'?'<span class="trend-down" title="Faltou na última aula ↓">↓</span>':
                       trend==='bad' ?'<span class="trend-bad"  title="Múltiplas faltas seguidas ↓↓">↓↓</span>':'';

    // ── Swipe wrapper ──
    const wrap = document.createElement('div');
    wrap.className = 'att-swipe-wrap stagger-item';
    wrap.style.setProperty('--si-delay', `${cardIdx * 60}ms`);

    const delAction  = document.createElement('div');
    delAction.className = 'att-swipe-action att-swipe-del';
    delAction.innerHTML = '<span>✕</span>excluir';

    const archAction = document.createElement('div');
    archAction.className = 'att-swipe-action att-swipe-arch';
    archAction.innerHTML = '<span>📦</span>arquivar';

    const card = document.createElement('div');
    card.className = 'att-card'+(openSet.has(c.id)?' open':'');
    card.dataset.c = c.id;
    card.innerHTML = `
      <div class="att-head">
        <div class="att-dot" style="background:${safeCor}"></div>
        <span class="att-name">${esc(c.nome)}</span>
        <span class="att-code">${esc(c.id)}</span>
        ${trendBadge}
        <span class="att-hbadge">${c._totalH}h</span>
        <span class="att-pill ${pillCls}">${pillTxt}</span>
        <button class="att-arch-btn" data-c="${esc(c.id)}" title="arquivar disciplina">📦</button>
        ${isUserCourse?`<button class="att-del-btn" data-c="${esc(c.id)}" title="remover disciplina">✕</button>`:''}
        <span class="att-chev">▾</span>
      </div>
      <div class="att-prog">
        <div class="att-prog-fill" style="width:${pctFill.toFixed(1)}%;background:${fillColor}"></div>
      </div>
      <div class="att-body">
        <div class="att-summary-bar">
          <div class="att-stat"><span class="att-stat-label">C. Horária</span><span class="att-stat-val">${s.totalH}h</span></div>
          <div class="att-stat"><span class="att-stat-label">Limite faltas</span><span class="att-stat-val">≤ ${s.maxFaltasH}h (25%)</span></div>
          <div class="att-stat"><span class="att-stat-label">Horas faltadas</span><span class="att-stat-val ${s.reprovado||s.emRisco?'danger':s.horasFalta>0?'':'ok'}">${s.horasFalta}h</span></div>
          <div class="att-stat"><span class="att-stat-label">Horas p/ reprovar</span><span class="att-stat-val ${s.hRestantes<=0?'danger':s.hRestantes<=s.maxFaltasH*0.3?'danger':''}">${Math.max(0,s.hRestantes)}h</span></div>
          <div class="att-stat"><span class="att-stat-label">Presença</span><span class="att-stat-val ${s.pctPresenca>=75?'ok':s.pctPresenca>=60?'':'danger'}">${s.pctPresenca.toFixed(0)}%</span></div>
        </div>
        <div class="att-list"></div>
        <div class="att-footer">
          <div>
            ${s.hRestantes<=1&&!s.reprovado?`<div class="att-warn-1h">🚨 Alerta: apenas ${Math.max(0,s.hRestantes)}h restante para reprovação!</div>`:
              s.emRisco&&!s.reprovado?`<div class="att-warn-txt">⚠ Você pode faltar mais ${Math.max(0,s.hRestantes)}h sem reprovar</div>`:''}
            ${s.reprovado?`<div class="att-warn-txt">✕ Limite de ${s.maxFaltasH}h ultrapassado em ${(s.horasFalta-s.maxFaltasH)}h</div>`:''}
            ${!s.emRisco&&!s.reprovado&&s.pctPresenca>=75?`<div style="font-size:11px;color:var(--ok)">✓ Presença em dia (${s.pctPresenca.toFixed(0)}%)</div>`:''}
          </div>
          <button class="att-mark-btn" data-c="${esc(c.id)}">✓ marcar todas passadas</button>
        </div>
      </div>`;

    wrap.appendChild(delAction);
    wrap.appendChild(archAction);
    wrap.appendChild(card);
    container.appendChild(wrap);

    const listEl = card.querySelector('.att-list');
    c._aulas.forEach(aula => {
      const isPast   = aula.date < hoje, isToday = aula.date.getTime()===hoje.getTime();
      const isCan    = cancelled.has(aula.id), checked = !isCan&&(att[aula.id]||false);
      const row = document.createElement('div');
      row.className = 'att-row'+(isCan?' att-row-cancelled':'');
      let badge='';
      if(isCan)         badge='<span class="abadge cancelled">cancelada</span>';
      else if(isToday)  badge='<span class="abadge today">hoje</span>';
      else if(!isPast)  badge='<span class="abadge future">futuro</span>';
      else if(!checked) badge='<span class="abadge falta">falta</span>';
      const WDAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
      row.innerHTML=`
        <input type="checkbox" class="att-cb" data-id="${aula.id}" ${checked?'checked':''} ${isCan?'disabled':''}>
        <span class="att-row-date">${aula.date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
        <span class="att-row-day">${WDAYS[aula.date.getDay()]}</span>
        <span class="att-row-h">${aula.ini}h–${aula.fim}h</span>
        <span class="att-row-hval">${aula.horas}h</span>
        ${badge}
        <button class="att-cancel-btn" data-id="${aula.id}" title="${isCan?'desfazer cancelamento':'cancelar aula'}">${isCan?'↩':'⊘'}</button>`;
      listEl.appendChild(row);
      row.querySelector('.att-cb').addEventListener('change', e => {
        if (cancelled.has(aula.id)) return;
        att[aula.id]=e.target.checked; sbSaveAtt(aula.id,e.target.checked);
        save(true); renderAttendance(); renderCalendar();
      });
      row.querySelector('.att-cancel-btn').addEventListener('click', e => {
        e.stopPropagation();
        if(cancelled.has(aula.id)){cancelled.delete(aula.id);showToast('↩ cancelamento desfeito');}
        else{cancelled.add(aula.id);att[aula.id]=false;sbSaveAtt(aula.id,false);showToast('⊘ aula cancelada');}
        save(true); renderAttendance(); renderCalendar();
      });
    });

    card.querySelector('.att-head').addEventListener('click',()=>card.classList.toggle('open'));
    card.querySelector('.att-arch-btn').addEventListener('click',e=>{
      e.stopPropagation();
      if(confirm(`Arquivar "${c.nome}"?\nOs dados de frequência serão preservados.`)) archiveCourse(c);
    });
    const delBtn=card.querySelector('.att-del-btn');
    if(delBtn) delBtn.addEventListener('click',e=>{
      e.stopPropagation();
      if(confirm(`Remover disciplina "${c.nome}"?\nEsta ação não pode ser desfeita.`)) deleteCourse(c.id);
    });
    card.querySelector('.att-mark-btn').addEventListener('click',e=>{
      e.stopPropagation();
      const hoje2=new Date();hoje2.setHours(0,0,0,0);
      c._aulas.filter(a=>a.date<=hoje2&&!cancelled.has(a.id)).forEach(a=>{att[a.id]=true;sbSaveAtt(a.id,true);});
      save(); renderAttendance(); renderCalendar();
    });

    // ── Swipe to reveal actions ──
    initSwipe(wrap, card, c, isUserCourse);
  });
}

const SWIPE_THRESHOLD = 72;

function initSwipe(wrap, card, c, isUserCourse) {
  let startX = 0, startY = 0, curX = 0, dragging = false, locked = false;

  card.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    curX = 0; dragging = false; locked = false;
  }, { passive: false });

  card.addEventListener('touchmove', e => {
    if (locked) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) > Math.abs(dx)) { locked = true; return; }
      if (Math.abs(dx) > 4) dragging = true;
    }
    if (!dragging) return;
    e.preventDefault();
    curX = dx;
    card.classList.add('is-swiping');
    const clamped = Math.max(-SWIPE_THRESHOLD, Math.min(SWIPE_THRESHOLD, curX));
    card.style.transform = `translateX(${clamped}px)`;
  }, { passive: false });

  card.addEventListener('touchend', () => {
    if (!dragging) { card.classList.remove('is-swiping'); return; }
    card.classList.remove('is-swiping');
    if (curX > SWIPE_THRESHOLD * 0.8 && isUserCourse) {
      // Swipe right → confirm delete
      card.style.transform = '';
      if (confirm(`Remover disciplina "${c.nome}"?\nEsta ação não pode ser desfeita.`)) {
        deleteCourse(c.id);
      }
    } else if (curX < -SWIPE_THRESHOLD * 0.8) {
      // Swipe left → confirm archive
      card.style.transform = '';
      if (confirm(`Arquivar "${c.nome}"?\nOs dados de frequência serão preservados.`)) {
        archiveCourse(c);
      }
    } else {
      card.style.transform = '';
    }
  });
}

// ─────────────────────────────────────────────────────
// CRUD DE DISCIPLINAS
// ─────────────────────────────────────────────────────
let editingCourseId = null;

function addHorarioRow(dia=1, ini=8, fim=10) {
  const row  = document.createElement('div');
  row.className = 'horario-row';
  const DAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  row.innerHTML = `
    <select class="form-select horario-dia">
      ${DAYS.map((d,i)=>`<option value="${i}"${i===dia?' selected':''}>${d}</option>`).join('')}
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
    s.className='color-swatch'; s.style.background=c; s.dataset.color=c;
    s.onclick=()=>{row.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('sel'));s.classList.add('sel');};
    row.appendChild(s);
  });
  row.querySelector('.color-swatch').classList.add('sel');
}

function getSelectedCourseColor() {
  const sel = document.querySelector('#cColorRow .color-swatch.sel');
  return sel ? sel.dataset.color : COURSE_COLORS[0];
}

function setSelectedCourseColor(c) {
  document.querySelectorAll('#cColorRow .color-swatch').forEach(s=>s.classList.toggle('sel',s.dataset.color===c));
}

export function openAddCourseModal(prefill=null) {
  editingCourseId = prefill ? prefill.id : null;
  document.getElementById('addCourseTitle').textContent = editingCourseId ? 'Editar disciplina' : 'Nova disciplina';
  document.getElementById('cNome').value   = prefill ? prefill.nome : '';
  document.getElementById('cId').value     = prefill ? prefill.id   : '';
  document.getElementById('cId').disabled  = !!editingCourseId;
  document.getElementById('cTurma').value  = prefill ? (prefill.turma||'') : '';
  document.getElementById('cLocal').value  = prefill ? (prefill.local||'') : '';
  const today=new Date(), fim3=new Date(today); fim3.setMonth(today.getMonth()+4);
  if(prefill){
    const ii=prefill.ini instanceof Date?prefill.ini:new Date(prefill.ini);
    const ff=prefill.fim instanceof Date?prefill.fim:new Date(prefill.fim);
    document.getElementById('cIni').value=ii.toISOString().slice(0,10);
    document.getElementById('cFim').value=ff.toISOString().slice(0,10);
  } else {
    document.getElementById('cIni').value=today.toISOString().slice(0,10);
    document.getElementById('cFim').value=fim3.toISOString().slice(0,10);
  }
  const horariosDiv=document.getElementById('cHorarios');
  horariosDiv.innerHTML='';
  if(prefill&&prefill.horarios&&prefill.horarios.length) prefill.horarios.forEach(h=>horariosDiv.appendChild(addHorarioRow(h.dia,h.ini,h.fim)));
  else horariosDiv.appendChild(addHorarioRow(1,8,10));
  initCourseColorRow();
  if(prefill) setSelectedCourseColor(prefill.cor);
  document.getElementById('addCourseModal').classList.add('open');
  document.getElementById('cNome').focus();
}

export function closeAddCourseModal() {
  document.getElementById('addCourseModal').classList.remove('open');
  editingCourseId=null;
}

document.getElementById('addCourseClose').onclick   = closeAddCourseModal;
document.getElementById('addCourseCancel').onclick  = closeAddCourseModal;
document.getElementById('addCourseModal').addEventListener('mousedown',e=>{
  if(e.target===document.getElementById('addCourseModal')) closeAddCourseModal();
});
document.getElementById('addHorario').onclick = ()=>document.getElementById('cHorarios').appendChild(addHorarioRow());
document.getElementById('btnAddCourse').onclick = ()=>openAddCourseModal();

document.getElementById('addCourseSave').addEventListener('click',()=>{
  const nome   = document.getElementById('cNome').value.trim();
  const cid    = editingCourseId||document.getElementById('cId').value.trim().toUpperCase();
  const turma  = document.getElementById('cTurma').value.trim();
  const local  = document.getElementById('cLocal').value.trim();
  const iniStr = document.getElementById('cIni').value;
  const fimStr = document.getElementById('cFim').value;
  const cor    = getSelectedCourseColor();
  if(!nome||!cid||!iniStr||!fimStr){showToast('preencha nome, código e datas');return;}
  if(nome.length>100){showToast('nome deve ter no máximo 100 caracteres');return;}
  if(cid.length>20){showToast('código deve ter no máximo 20 caracteres');return;}
  if(turma.length>20){showToast('turma deve ter no máximo 20 caracteres');return;}
  if(local.length>100){showToast('local deve ter no máximo 100 caracteres');return;}
  const horarioRows=document.querySelectorAll('#cHorarios .horario-row');
  if(!horarioRows.length){showToast('adicione pelo menos um horário');return;}
  const horarios=[];
  for(const row of horarioRows){
    const dia=parseInt(row.querySelector('.horario-dia').value);
    const ini=parseInt(row.querySelector('.horario-ini').value);
    const fim=parseInt(row.querySelector('.horario-fim').value);
    if(isNaN(dia)||isNaN(ini)||isNaN(fim)||fim<=ini){showToast('horário inválido: fim deve ser maior que início');return;}
    horarios.push({dia,ini,fim});
  }
  const [iy,im,id2]=iniStr.split('-').map(Number), [fy,fm,fd]=fimStr.split('-').map(Number);
  const iniDate=new Date(iy,im-1,id2), fimDate=new Date(fy,fm-1,fd);
  if(fimDate<=iniDate){showToast('data de fim deve ser após o início');return;}
  if(editingCourseId){
    const idx=userCourses.findIndex(c=>c.id===editingCourseId);
    if(idx!==-1){
      const c=userCourses[idx];
      c.nome=nome;c.turma=turma;c.local=local;c.horarios=horarios;c.ini=iniDate;c.fim=fimDate;c.cor=cor;
      c._aulas=gerarAulas(c); c._totalH=c._aulas.reduce((s,a)=>s+a.horas,0); c._maxFaltasH=Math.floor(c._totalH*0.25);
    }
  } else {
    if([...BASE_COURSES,...userCourses].some(c=>c.id===cid)){showToast('código já existe');return;}
    const nc={id:cid,nome,turma,local,horarios,cor,cls:'',ini:iniDate,fim:fimDate};
    nc._aulas=gerarAulas(nc); nc._totalH=nc._aulas.reduce((s,a)=>s+a.horas,0); nc._maxFaltasH=Math.floor(nc._totalH*0.25);
    userCourses.push(nc);
  }
  rebuildCourses(); save(true); renderCalendar(); renderAttendance(); closeAddCourseModal();
  showToast(editingCourseId?'disciplina atualizada':'disciplina adicionada');
});

export function deleteCourse(id) {
  const idx=userCourses.findIndex(c=>c.id===id); if(idx===-1) return;
  const c=userCourses[idx];
  if(c._aulas) c._aulas.forEach(a=>delete att[a.id]);
  userCourses.splice(idx,1);
  rebuildCourses(); save(true); renderCalendar(); renderAttendance(); showToast('disciplina removida');
}

export function archiveCourse(c) {
  const attSnapshot={};
  if(c._aulas) c._aulas.forEach(a=>{if(att[a.id]!==undefined) attSnapshot[a.id]=att[a.id];});
  const archived={
    courseId:c.id,
    course:{id:c.id,nome:c.nome,turma:c.turma||'',local:c.local||'',horarios:c.horarios,cor:c.cor,cls:c.cls||'',
            ini:c.ini instanceof Date?c.ini.toISOString():c.ini,fim:c.fim instanceof Date?c.fim.toISOString():c.fim},
    attSnapshot, archivedAt:new Date().toISOString()
  };
  archivedCourses.push(archived);
  const uidx=userCourses.findIndex(uc=>uc.id===c.id); if(uidx!==-1) userCourses.splice(uidx,1);
  if(c._aulas) c._aulas.forEach(a=>delete att[a.id]);
  rebuildCourses(); save(true); renderCalendar(); renderAttendance(); renderArchivedSection();
  showToast(`${c.nome} arquivada`);
}

// ─────────────────────────────────────────────────────
// SEÇÃO ARQUIVADOS
// ─────────────────────────────────────────────────────
let currentArchivedItem = null;

export function renderArchivedSection() {
  const section=document.getElementById('archivedSection');
  const grid   =document.getElementById('archivedGrid');
  if(!section||!grid) return;
  if(!archivedCourses.length){section.style.display='none';return;}
  section.style.display='';
  grid.innerHTML='';
  archivedCourses.forEach(archived=>{
    const c=archived.course;
    const ini=new Date(c.ini), fim=new Date(c.fim);
    const tempC={...c,ini,fim}; tempC._aulas=gerarAulas(tempC);
    const totalH=tempC._aulas.reduce((s,a)=>s+a.horas,0);
    const attendedH=tempC._aulas.filter(a=>archived.attSnapshot[a.id]).reduce((s,a)=>s+a.horas,0);
    const pct=totalH>0?(attendedH/totalH*100):100;
    const card=document.createElement('div');
    card.className='archived-card';
    card.innerHTML=`
      <div class="archived-dot" style="background:${sanitizeCor(c.cor)}"></div>
      <div class="archived-info">
        <div class="archived-name">${esc(c.nome)}</div>
        <div class="archived-meta">${esc(c.id)} · ${ini.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})} – ${fim.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}</div>
      </div>
      <div class="archived-pct ${pct>=75?'ok':'danger'}">${pct.toFixed(0)}%</div>`;
    card.onclick=()=>openArchivedModal(archived);
    grid.appendChild(card);
  });
}

function openArchivedModal(archived) {
  currentArchivedItem=archived;
  const c={...archived.course}; c.ini=new Date(c.ini); c.fim=new Date(c.fim);
  c._aulas=gerarAulas(c); c._totalH=c._aulas.reduce((s,a)=>s+a.horas,0); c._maxFaltasH=Math.floor(c._totalH*0.25);
  const attSnap=archived.attSnapshot;
  const attendedH=c._aulas.filter(a=>attSnap[a.id]).reduce((s,a)=>s+a.horas,0);
  const missedH=c._totalH-attendedH, pct=c._totalH>0?(attendedH/c._totalH*100):100;
  const archivedAt=new Date(archived.archivedAt);
  const WDAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  document.getElementById('archivedModalContent').innerHTML=`
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem">
      <div style="width:10px;height:10px;border-radius:50%;background:${sanitizeCor(c.cor)};flex-shrink:0"></div>
      <div><div style="font-weight:600;font-size:15px">${esc(c.nome)}</div>
        <div style="font-size:11px;color:var(--text3)">${esc(c.id)}${c.turma?' · turma '+esc(c.turma):''}${c.local?' · '+esc(c.local):''}</div></div>
    </div>
    <div class="att-summary-bar" style="border:1px solid var(--border);border-radius:8px;margin-bottom:.75rem">
      <div class="att-stat"><span class="att-stat-label">Período</span>
        <span class="att-stat-val">${c.ini.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})} – ${c.fim.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span></div>
      <div class="att-stat"><span class="att-stat-label">C. Horária</span><span class="att-stat-val">${c._totalH}h</span></div>
      <div class="att-stat"><span class="att-stat-label">Frequência</span><span class="att-stat-val ${pct>=75?'ok':'danger'}">${pct.toFixed(0)}%</span></div>
      <div class="att-stat"><span class="att-stat-label">Faltas</span><span class="att-stat-val ${missedH>c._maxFaltasH?'danger':''}">${missedH}h / ${c._maxFaltasH}h</span></div>
      <div class="att-stat"><span class="att-stat-label">Arquivado</span><span class="att-stat-val">${archivedAt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span></div>
    </div>
    <div class="att-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:.4rem .6rem">
      ${c._aulas.map(a=>{
        const chk=attSnap[a.id]||false;
        return `<div class="att-row">
          <span style="font-size:12px;font-weight:600;color:${chk?'var(--ok)':'var(--warn)'};">${chk?'✓':'✕'}</span>
          <span class="att-row-date">${a.date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
          <span class="att-row-day">${WDAYS[a.date.getDay()]}</span>
          <span class="att-row-h">${a.ini}h–${a.fim}h</span>
          <span class="att-row-hval">${a.horas}h</span>
          ${chk?'<span class="abadge" style="background:var(--okb);color:var(--ok)">presente</span>':'<span class="abadge falta">falta</span>'}
        </div>`;
      }).join('')}
    </div>`;
  document.getElementById('archivedModal').classList.add('open');
}

export function closeArchivedModal() {
  document.getElementById('archivedModal').classList.remove('open');
  currentArchivedItem=null;
}

document.getElementById('archivedModalClose').onclick=closeArchivedModal;
document.getElementById('archivedModal').addEventListener('mousedown',e=>{
  if(e.target===document.getElementById('archivedModal')) closeArchivedModal();
});
document.getElementById('archivedUnarchive').addEventListener('click',()=>{
  if(!currentArchivedItem) return;
  const archived=currentArchivedItem;
  const c={...archived.course}; c.ini=new Date(c.ini); c.fim=new Date(c.fim);
  c._aulas=gerarAulas(c); c._totalH=c._aulas.reduce((s,a)=>s+a.horas,0); c._maxFaltasH=Math.floor(c._totalH*0.25);
  const isBase=BASE_COURSES.some(bc=>bc.id===c.id);
  if(!isBase) userCourses.push(c);
  Object.assign(att,archived.attSnapshot);
  const idx=archivedCourses.findIndex(a=>a.courseId===archived.courseId);
  if(idx!==-1) archivedCourses.splice(idx,1);
  rebuildCourses(); save(true); renderCalendar(); renderAttendance(); renderArchivedSection();
  closeArchivedModal(); showToast(`${c.nome} desarquivada`);
});
document.getElementById('archivedDelete').addEventListener('click',()=>{
  if(!currentArchivedItem) return;
  const nome=currentArchivedItem.course.nome;
  if(!confirm(`Remover permanentemente "${nome}" dos arquivados?\nOs dados de frequência serão perdidos.`)) return;
  const idx=archivedCourses.findIndex(a=>a.courseId===currentArchivedItem.courseId);
  if(idx!==-1) archivedCourses.splice(idx,1);
  save(true); renderArchivedSection(); closeArchivedModal(); showToast('removido dos arquivados');
});

// ─────────────────────────────────────────────────────
// EXPORT / IMPORT (xlsx)
// ─────────────────────────────────────────────────────
function _doExportWithState() {
  // Importação dinâmica para ler o estado atual com live bindings
  import('./state.js').then(S => {
    if(typeof XLSX==='undefined'){showToast('biblioteca xlsx não carregada');return;}
    const wb=XLSX.utils.book_new();
    const attRows=[['aulaId','presente']];
    Object.entries(S.att).forEach(([id,v])=>attRows.push([id,v?'sim':'não']));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(attRows),'Presença');
    const evRows=[['id','nome','data','início','fim','tipo','cor','nota']];
    S.customEvents.forEach(e=>{
      const d=e.date instanceof Date?e.date.toISOString().slice(0,10):e.date;
      evRows.push([e.id,e.nome,d,e.ini,e.fim,e.type,e.cor,e.note||'']);
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(evRows),'Eventos');
    const taskRows=[['id','texto','concluída']];
    S.tasks.forEach(t=>taskRows.push([t.id,t.text,t.checked?'sim':'não']));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(taskRows),'Tarefas');
    const topicRows=[['id','texto','concluído']];
    S.topics.forEach(t=>topicRows.push([t.id,t.text,t.checked?'sim':'não']));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(topicRows),'Tópicos');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['versão','5'],['exportado em',new Date().toISOString()]]),'Info');
    XLSX.writeFile(wb,'rotina-estudos.xlsx');
    showToast('exportado');
  });
}

document.getElementById('btnExport2').onclick=_doExportWithState;
document.getElementById('btnImport2').onclick=()=>document.getElementById('importFile').click();

document.getElementById('importFile').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  if(typeof XLSX==='undefined'){showToast('biblioteca xlsx não carregada');return;}
  const r=new FileReader();
  r.onload=ev=>{
    try {
      const wb=XLSX.read(ev.target.result,{type:'array'});
      import('./state.js').then(S=>{
        const attSheet=wb.Sheets['Presença'];
        if(attSheet){const rows=XLSX.utils.sheet_to_json(attSheet,{header:1});const na={};for(let i=1;i<rows.length;i++){const[id,v]=rows[i];if(id)na[String(id)]=v==='sim'||v===true||v===1;}S.setAtt(na);}
        const evSheet=wb.Sheets['Eventos'];
        if(evSheet){const rows=XLSX.utils.sheet_to_json(evSheet,{header:1});const ne=[];for(let i=1;i<rows.length;i++){const[id,nome,data,ini,fim,type,cor,note]=rows[i];if(id)ne.push({id:String(id),nome:String(nome||''),date:new Date(data),ini:String(ini||''),fim:String(fim||''),type:String(type||'lembrete'),cor:String(cor||'#6366f1'),note:String(note||'')});}S.setCustomEvents(ne);}
        const taskSheet=wb.Sheets['Tarefas'];
        if(taskSheet){const rows=XLSX.utils.sheet_to_json(taskSheet,{header:1});const nt=[];for(let i=1;i<rows.length;i++){const[id,text,checked]=rows[i];if(id)nt.push({id:String(id),text:String(text||''),checked:checked==='sim'||checked===true});}S.setTasks(nt);}
        const topicSheet=wb.Sheets['Tópicos'];
        if(topicSheet){const rows=XLSX.utils.sheet_to_json(topicSheet,{header:1});const nt=[];for(let i=1;i<rows.length;i++){const[id,text,checked]=rows[i];if(id)nt.push({id:String(id),text:String(text||''),checked:checked==='sim'||checked===true});}S.setTopics(nt);}
        save(false);
        if(_initCallback) _initCallback();
        import('./supabase.js').then(({sbFullSync})=>sbFullSync().then(()=>showToast('importado e sincronizado')).catch(()=>showToast('importado')));
      });
    } catch(err){console.error('import error:',err);alert('arquivo inválido ou corrompido');}
  };
  r.readAsArrayBuffer(f); e.target.value='';
});
