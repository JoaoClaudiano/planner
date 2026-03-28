// ═══════════════════════════════════════════════
// UTILS — Funções utilitárias puras (sem efeitos colaterais)
// ═══════════════════════════════════════════════

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Valida cor hexadecimal (#RRGGBB) para evitar injeção de CSS
export function sanitizeCor(cor) {
  return /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#6366f1';
}

// 'YYYY-MM-DD' → Date local (sem desvio de UTC)
export function parseDateLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Date → 'YYYY-MM-DD' usando hora local
export function fmtDateLocal(d) {
  if (!(d instanceof Date)) return d;
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Date → 'DD/MM' (exibição na semana)
export function fmt(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
