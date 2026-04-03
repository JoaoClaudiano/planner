// ═══════════════════════════════════════════════
// DAY SUMMARY — Modal de resumo diário do estudante
// ═══════════════════════════════════════════════
import { COURSES, AULA_MAP, att, cancelled, customEvents, tasks, calcStats, calcTrend } from './state.js';
import { getDynamicGreeting } from './greeting.js';
import { supaUser } from './supabase.js';

const MODAL_ID   = 'daySummaryModal';
const CONTENT_ID = 'daySummaryContent';

// ── Abre o modal e renderiza o conteúdo ──────────────────────────────────────
export function openDaySummaryModal() {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  renderDaySummary();
  modal.classList.add('open');
}

// ── Fecha o modal ────────────────────────────────────────────────────────────
export function closeDaySummaryModal() {
  document.getElementById(MODAL_ID)?.classList.remove('open');
}

// ── Inicializa: fecha ao clicar no overlay ou botão × ────────────────────────
export function initDaySummary() {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;

  // Fechar ao clicar no backdrop
  modal.addEventListener('click', e => { if (e.target === modal) closeDaySummaryModal(); });

  // Botão ×
  document.getElementById('daySummaryClose')?.addEventListener('click', closeDaySummaryModal);

  // Tecla ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeDaySummaryModal();
  });
}

// ── Renderiza o conteúdo do modal com dados atuais ───────────────────────────
export function renderDaySummary() {
  const el = document.getElementById(CONTENT_ID);
  if (!el) return;

  const now   = new Date();
  const hoje  = new Date(now); hoje.setHours(0, 0, 0, 0);
  const hojeFim = new Date(hoje); hojeFim.setHours(23, 59, 59, 999);

  // ── Nome do usuário ──────────────────────────────────────────────────────
  let userName = '';
  if (supaUser) {
    const meta = supaUser.user_metadata;
    const full = (meta && (meta.full_name || meta.name)) || '';
    userName = full ? full.split(' ')[0] : supaUser.email.split('@')[0];
  }

  // ── Saudação e data ──────────────────────────────────────────────────────
  const greeting = getDynamicGreeting(userName || undefined);
  const dateStr  = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  // ── Aulas de hoje ────────────────────────────────────────────────────────
  const aulasHoje = Object.values(AULA_MAP)
    .filter(({ aula }) => {
      const d = new Date(aula.date); d.setHours(0, 0, 0, 0);
      return d.getTime() === hoje.getTime() && !cancelled.has(aula.id);
    })
    .sort((a, b) => a.aula.ini - b.aula.ini);

  // ── Próxima aula (futura, considerando horário exato) ────────────────────
  const proximaAula = (() => {
    const nowMins = now.getHours() * 60 + now.getMinutes();
    // Primeiro tenta aula de hoje que ainda não começou
    const restanteHoje = aulasHoje.find(({ aula }) => aula.ini * 60 > nowMins);
    if (restanteHoje) return restanteHoje;
    // Se não, próxima aula em dias futuros
    const futura = Object.values(AULA_MAP)
      .filter(({ aula }) => {
        const d = new Date(aula.date); d.setHours(0, 0, 0, 0);
        return d.getTime() > hoje.getTime() && !cancelled.has(aula.id);
      })
      .sort((a, b) => a.aula.date - b.aula.date || a.aula.ini - b.aula.ini);
    return futura[0] || null;
  })();

  // ── Eventos próximos (7 dias) ─────────────────────────────────────────────
  const em7Dias = new Date(hoje); em7Dias.setDate(em7Dias.getDate() + 7);
  const eventosProximos = customEvents
    .filter(ev => {
      const d = new Date(ev.date); d.setHours(0, 0, 0, 0);
      return d.getTime() >= hoje.getTime() && d <= em7Dias;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // ── Tarefas pendentes ─────────────────────────────────────────────────────
  const tarefasPendentes = tasks.filter(t => !t.checked);

  // ── Métricas do semestre ──────────────────────────────────────────────────
  const statsAll = COURSES.map(c => ({ c, s: calcStats(c) }));
  const totalHPresente = statsAll.reduce((sum, { s }) => sum + s.horasPresente, 0);
  const totalHTodos    = statsAll.reduce((sum, { s }) => sum + s.totalH, 0);
  const mediaPresenca  = statsAll.length
    ? statsAll.reduce((sum, { s }) => sum + s.pctPresenca, 0) / statsAll.length
    : 0;
  const melhor = statsAll.length
    ? statsAll.reduce((best, cur) => cur.s.pctPresenca > best.s.pctPresenca ? cur : best)
    : null;
  const pior = statsAll.length
    ? statsAll.reduce((worst, cur) => cur.s.pctPresenca < worst.s.pctPresenca ? cur : worst)
    : null;

  // ── Monta HTML ─────────────────────────────────────────────────────────────
  let html = '';

  // Cabeçalho
  html += `
    <div class="ds-header">
      <div class="ds-greeting">${greeting}</div>
      <div class="ds-date">${dateStr}</div>
    </div>`;

  // Aulas de hoje
  html += `<div class="ds-section"><div class="ds-section-title">🏫 aulas de hoje</div>`;
  if (aulasHoje.length === 0) {
    html += `<div class="ds-empty">Nenhuma aula hoje.</div>`;
  } else {
    aulasHoje.forEach(({ aula, curso }) => {
      const inicio = `${String(aula.ini).padStart(2,'0')}:00`;
      const fim    = `${String(aula.fim).padStart(2,'0')}:00`;
      const marcada  = att[aula.id];
      const nowMins  = now.getHours() * 60 + now.getMinutes();
      const aulaFim  = aula.fim * 60;
      const aulaIni  = aula.ini * 60;
      let badge = '';
      if (marcada) {
        badge = `<span class="ds-att-badge ok">✔ presente</span>`;
      } else if (nowMins >= aulaFim) {
        badge = `<span class="ds-att-badge miss">✕ falta</span>`;
      } else if (nowMins >= aulaIni) {
        badge = `<span class="ds-att-badge now">● em andamento</span>`;
      } else {
        badge = `<span class="ds-att-badge soon">🔵 agendada</span>`;
      }
      html += `
        <div class="ds-row">
          <span class="ds-dot" style="background:${curso.cor}"></span>
          <div class="ds-row-info">
            <span class="ds-row-title">${curso.nome}</span>
            <span class="ds-row-meta">${inicio}–${fim} · ${curso.local || '—'}</span>
          </div>
          ${badge}
        </div>`;
    });
  }
  html += `</div>`;

  // Próxima aula (somente se não está dentro de aulas de hoje ou se hoje não tem mais aulas)
  const aulaEmAndamento = aulasHoje.find(({ aula }) => {
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return nowMins >= aula.ini * 60 && nowMins < aula.fim * 60;
  });
  if (!aulaEmAndamento && proximaAula) {
    const { aula, curso } = proximaAula;
    const d = new Date(aula.date);
    const isAmanha = (() => { const a = new Date(hoje); a.setDate(a.getDate()+1); return d.getTime() === a.getTime(); })();
    const dLabel = isAmanha ? 'amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    html += `
      <div class="ds-section">
        <div class="ds-section-title">⏭ próxima aula</div>
        <div class="ds-row">
          <span class="ds-dot" style="background:${curso.cor}"></span>
          <div class="ds-row-info">
            <span class="ds-row-title">${curso.nome}</span>
            <span class="ds-row-meta">${dLabel} · ${String(aula.ini).padStart(2,'0')}:00–${String(aula.fim).padStart(2,'0')}:00 · ${curso.local || '—'}</span>
          </div>
        </div>
      </div>`;
  }

  // Frequência + tendência por disciplina
  if (COURSES.length > 0) {
    html += `<div class="ds-section"><div class="ds-section-title">📊 frequência por disciplina</div>`;
    COURSES.forEach(c => {
      const s = calcStats(c);
      const trend = calcTrend(c);
      const statusCls = s.reprovado ? 'miss' : s.emRisco ? 'warn' : 'ok';
      const pct = Math.round(s.pctPresenca);
      const trendIcon = trend === 'bad' ? '⚠ crítico' : trend === 'down' ? '↓ caindo' : trend === 'up' ? '↑ subindo' : null;
      html += `
        <div class="ds-row">
          <span class="ds-dot" style="background:${c.cor}"></span>
          <div class="ds-row-info">
            <span class="ds-row-title">${c.nome}</span>
            <span class="ds-row-meta">${s.horasPresente}h presentes · ${s.horasFalta}h faltas · restam ${Math.max(0, s.hRestantes)}h</span>
          </div>
          <div class="ds-row-badges">
            <span class="ds-att-badge ${statusCls}">${pct}%</span>
            ${trendIcon ? `<span class="ds-trend ${statusCls === 'miss' || statusCls === 'warn' ? statusCls : ''}">${trendIcon}</span>` : ''}
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  // Eventos próximos
  html += `<div class="ds-section"><div class="ds-section-title">📅 próximos 7 dias</div>`;
  if (eventosProximos.length === 0) {
    html += `<div class="ds-empty">Nenhum evento nos próximos 7 dias.</div>`;
  } else {
    const typeIcon = { lembrete: '📌', prova: '📝', entrega: '📋', outro: '📎' };
    eventosProximos.forEach(ev => {
      const d = new Date(ev.date);
      const dLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
      const icon = typeIcon[ev.type] || '📎';
      html += `
        <div class="ds-row">
          <span class="ds-ev-icon">${icon}</span>
          <div class="ds-row-info">
            <span class="ds-row-title">${ev.nome}</span>
            <span class="ds-row-meta">${dLabel} · ${ev.ini}–${ev.fim}</span>
          </div>
        </div>`;
    });
  }
  html += `</div>`;

  // Tarefas pendentes
  html += `<div class="ds-section"><div class="ds-section-title">⏱ tarefas pendentes</div>`;
  if (tarefasPendentes.length === 0) {
    html += `<div class="ds-empty">Nenhuma tarefa pendente. 🎉</div>`;
  } else {
    tarefasPendentes.slice(0, 5).forEach(t => {
      html += `<div class="ds-task-row">· ${_escHtml(t.text)}</div>`;
    });
    if (tarefasPendentes.length > 5) {
      html += `<div class="ds-empty">e mais ${tarefasPendentes.length - 5} tarefa${tarefasPendentes.length - 5 > 1 ? 's' : ''}…</div>`;
    }
  }
  html += `</div>`;

  // Métricas do semestre
  if (COURSES.length > 0) {
    html += `
      <div class="ds-section">
        <div class="ds-section-title">🏆 métricas do semestre</div>
        <div class="ds-metrics-grid">
          <div class="ds-metric">
            <span class="ds-metric-val">${totalHPresente}h</span>
            <span class="ds-metric-lbl">de ${totalHTodos}h frequentadas</span>
          </div>
          <div class="ds-metric">
            <span class="ds-metric-val">${Math.round(mediaPresenca)}%</span>
            <span class="ds-metric-lbl">média de presença</span>
          </div>
          ${melhor && melhor !== pior ? `
          <div class="ds-metric">
            <span class="ds-metric-val ok-text">${Math.round(melhor.s.pctPresenca)}%</span>
            <span class="ds-metric-lbl">melhor: ${melhor.c.nome.split(' ')[0]}</span>
          </div>
          <div class="ds-metric">
            <span class="ds-metric-val ${pior.s.reprovado ? 'miss-text' : pior.s.emRisco ? 'warn-text' : ''}">${Math.round(pior.s.pctPresenca)}%</span>
            <span class="ds-metric-lbl">pior: ${pior.c.nome.split(' ')[0]}</span>
          </div>` : ''}
        </div>
      </div>`;
  }

  el.innerHTML = html;
}

// ── Utilitário: escapa HTML básico ───────────────────────────────────────────
function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
