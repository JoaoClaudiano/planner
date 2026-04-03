// ═══════════════════════════════════════════════
// GREETING — Saudação dinâmica com efeito typewriter
// ═══════════════════════════════════════════════

const GREETINGS = {
  madrugada: [
    'Boa madrugada',
    'Ainda acordado? Boa madrugada',
    'A noite é funda, boa madrugada',
    'Madrugada produtiva',
  ],
  manha: [
    'Bom dia',
    'Olá, bom dia',
    'Que seu dia seja produtivo',
    'Bom dia! Hora de começar',
  ],
  tarde: [
    'Boa tarde',
    'Olá, boa tarde',
    'Boa tarde! Bora focar',
    'Uma ótima tarde pra você',
  ],
  noite: [
    'Boa noite',
    'Olá, boa noite',
    'Boa noite! Quase lá',
    'Noite produtiva pra você',
  ],
};

const PERIOD_ICONS = {
  madrugada: '🌃',
  manha:     '☀️',
  tarde:     '🌤️',
  noite:     '🌙',
};

/**
 * Retorna a saudação dinâmica para o período atual.
 * @param {string} [userName] - Nome opcional para personalizar a frase.
 * @returns {string} String final da saudação.
 */
export function getDynamicGreeting(userName) {
  const h = new Date().getHours();
  const period =
    h >= 0 && h < 5  ? 'madrugada' :
    h >= 5 && h < 12 ? 'manha'     :
    h >= 12 && h < 18 ? 'tarde'    : 'noite';

  const options = GREETINGS[period];
  const text    = options[Math.floor(Math.random() * options.length)];
  const icon    = PERIOD_ICONS[period];
  const suffix  = userName ? `, ${userName}!` : '!';

  return `${icon} ${text}${suffix}`;
}

/**
 * Aplica o efeito typewriter num elemento DOM.
 * @param {HTMLElement} el    - Elemento alvo.
 * @param {string}      text  - Texto a digitar.
 * @param {number}      [baseDelay=45] - Delay base por caractere (ms).
 */
export function typewriterGreeting(el, text, baseDelay = 45) {
  el.textContent = '';
  let i = 0;
  function typeNext() {
    if (i >= text.length) return;
    el.textContent += text[i++];
    // Leve variação para efeito mais natural
    const jitter = Math.random() * 30 - 10;
    setTimeout(typeNext, baseDelay + jitter);
  }
  typeNext();
}
