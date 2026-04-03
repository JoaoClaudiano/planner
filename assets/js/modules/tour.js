// ═══════════════════════════════════════════════
// TOUR — Guia de boas-vindas para novos usuários
// ═══════════════════════════════════════════════
import { LS } from './config.js';

const SLIDES = [
  {
    icon:  '🪼',
    title: 'Bem-vindo ao flow.planner!',
    text:  'Seu sistema pessoal de frequência acadêmica. Controle presenças, visualize sua agenda semanal e nunca perca o prazo de faltas — tudo no seu dispositivo.',
  },
  {
    icon:  '📅',
    title: 'Agenda Semanal',
    text:  'Todas as suas aulas organizadas por semana. Clique em uma aula para marcar presença, ou em um horário vazio para criar lembretes, provas e entregas.',
  },
  {
    icon:  '📊',
    title: 'Controle de Frequência',
    text:  'Acompanhe a frequência de cada disciplina em tempo real. O app calcula quantas horas você ainda pode faltar e avisa quando estiver em risco de reprovação.',
  },
  {
    icon:  '📍',
    title: 'Presença Automática',
    text:  'Configure a localização da sua escola e o app detecta quando você está lá durante uma aula — marcando presença automaticamente, sem você precisar fazer nada!',
  },
  {
    icon:  '📝',
    title: 'Listas e Anotações',
    text:  'Gerencie tarefas e tópicos de estudo com listas inteligentes. Crie uma conta gratuita para sincronizar seus dados entre dispositivos via nuvem.',
  },
];

export function initTour() {
  if (localStorage.getItem(LS.tourDone)) return;

  const overlay  = document.getElementById('tourOverlay');
  if (!overlay) return;

  const slidesEl = document.getElementById('tourSlides');
  const dotsEl   = document.getElementById('tourDots');
  const prevBtn  = document.getElementById('tourPrev');
  const nextBtn  = document.getElementById('tourNext');
  const skipBtn  = document.getElementById('tourSkip');

  let current = 0;

  // Build slide elements
  SLIDES.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'tour-slide' + (i === 0 ? ' active' : '');
    div.innerHTML = `
      <div class="tour-icon">${s.icon}</div>
      <h3 class="tour-title">${s.title}</h3>
      <p class="tour-text">${s.text}</p>`;
    slidesEl.appendChild(div);

    const dot = document.createElement('button');
    dot.className = 'tour-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Ir para slide ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsEl.appendChild(dot);
  });

  function goTo(idx) {
    const allSlides = slidesEl.querySelectorAll('.tour-slide');
    const allDots   = dotsEl.querySelectorAll('.tour-dot');
    allSlides[current].classList.remove('active');
    allDots[current].classList.remove('active');
    current = idx;
    allSlides[current].classList.add('active');
    allDots[current].classList.add('active');
    prevBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = current === SLIDES.length - 1 ? 'Começar ✓' : 'próximo ›';
  }

  prevBtn.addEventListener('click', () => { if (current > 0) goTo(current - 1); });
  nextBtn.addEventListener('click', () => {
    if (current < SLIDES.length - 1) goTo(current + 1);
    else closeTour();
  });
  skipBtn.addEventListener('click', closeTour);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeTour(); });

  function closeTour() {
    localStorage.setItem(LS.tourDone, '1');
    overlay.classList.remove('open');
    // Nudge user to set up campus location if not yet configured
    if (!localStorage.getItem(LS.campusLat)) {
      setTimeout(() => {
        const banner = document.getElementById('geoSetupBanner');
        if (banner) banner.classList.add('show');
      }, 600);
    }
  }

  // Initial state
  prevBtn.style.visibility = 'hidden';
  overlay.classList.add('open');
}
