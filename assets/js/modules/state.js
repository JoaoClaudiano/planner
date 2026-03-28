// ═══════════════════════════════════════════════
// STATE — Estado mutável global + geração de dados
// ═══════════════════════════════════════════════

// ── Dados base das disciplinas ──
// dia: 0=dom,1=seg,2=ter,3=qua,4=qui,5=sex,6=sab (igual JS getDay())
export const BASE_COURSES = [
  { id:'TC0610', nome:'Materiais Betuminosos',        turma:'01', local:'Bloco 708 – Sala 24',
    horarios:[{dia:3,ini:14,fim:17}],
    ini:new Date(2026,2,2), fim:new Date(2026,6,7), cls:'c1', cor:'#f59e0b' },
  { id:'TB0793', nome:'Resistência dos Materiais I',  turma:'02', local:'Bloco 708 – Sala 23',
    horarios:[{dia:2,ini:14,fim:16},{dia:4,ini:14,fim:16}],
    ini:new Date(2026,2,2), fim:new Date(2026,6,7), cls:'c2', cor:'#3b82f6' },
  { id:'TD0022', nome:'Instalações Hidrossanitárias', turma:'01', local:'Bloco 727 – Sala 21',
    horarios:[{dia:1,ini:10,fim:13}],
    ini:new Date(2026,2,2), fim:new Date(2026,6,7), cls:'c3', cor:'#8b5cf6' },
  { id:'TD0023', nome:'Sistemas de Abastecimento',    turma:'01', local:'Bloco 708 – Sala 22',
    horarios:[{dia:1,ini:8,fim:10}],
    ini:new Date(2026,2,2), fim:new Date(2026,6,7), cls:'c4', cor:'#10b981' },
];

// Gera todas as aulas do semestre para um curso
export function gerarAulas(c) {
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
  return out.sort((a, b) => a.date - b.date || a.ini - b.ini);
}

// Inicializa aulas e carga horária dos cursos base
BASE_COURSES.forEach(c => {
  c._aulas     = gerarAulas(c);
  c._totalH    = c._aulas.reduce((s, a) => s + a.horas, 0);
  c._maxFaltasH = Math.floor(c._totalH * 0.25);
});

// ── Variáveis de estado mutável ──
export let att             = {};
export let cancelled       = new Set();
export let customEvents    = [];
export let tasks           = [];
export let topics          = [];
export let userCourses     = [];
export let archivedCourses = [];
export let COURSES         = [...BASE_COURSES];
export let AULA_MAP        = {};
export let semConfig       = null; // { nome, ini, fim } strings ISO

// ── Setters (para reatribuição de variáveis exportadas de outros módulos) ──
export function setAtt(v)              { att = v; }
export function setCancelled(v)        { cancelled = v; }
export function setCustomEvents(v)     { customEvents = v; }
export function setTasks(v)            { tasks = v; }
export function setTopics(v)           { topics = v; }
export function setUserCourses(v)      { userCourses = v; }
export function setArchivedCourses(v)  { archivedCourses = v; }
export function setSemConfig(v)        { semConfig = v; }

// ── Rebuild de cursos ativos e mapa de aulas ──
export function rebuildAulaMap() {
  AULA_MAP = {};
  COURSES.forEach(c => c._aulas.forEach(a => { AULA_MAP[a.id] = { aula: a, curso: c }; }));
}

export function rebuildCourses() {
  const archivedIds = new Set(archivedCourses.map(a => a.courseId));
  COURSES = [...BASE_COURSES, ...userCourses].filter(c => !archivedIds.has(c.id));
  rebuildAulaMap();
}

// Inicializa o mapa com cursos base
rebuildAulaMap();

// ── Estatísticas de frequência ──
export function calcTrend(c) {
  const hoje     = new Date(); hoje.setHours(0,0,0,0);
  const passadas = c._aulas.filter(a => !cancelled.has(a.id) && a.date <= hoje);
  if (passadas.length < 1) return null;
  const ultima      = passadas[passadas.length - 1];
  const penultima   = passadas.length >= 2 ? passadas[passadas.length - 2] : null;
  const ultimaChk   = att[ultima.id] || false;
  const penultimaChk = penultima ? (att[penultima.id] || false) : null;
  if (!ultimaChk && penultimaChk === false) return 'bad';
  if (!ultimaChk) return 'down';
  if (ultimaChk && penultimaChk === false) return 'up';
  return null;
}

export function calcStats(c) {
  const hoje        = new Date(); hoje.setHours(0,0,0,0);
  const aulasValidas = c._aulas.filter(a => !cancelled.has(a.id));
  const aulasPast    = aulasValidas.filter(a => a.date <= hoje);
  const aulasFuture  = aulasValidas.filter(a => a.date >  hoje);

  const horasPresente = aulasPast.filter(a =>  att[a.id]).reduce((s, a) => s + a.horas, 0);
  const horasFalta    = aulasPast.filter(a => !att[a.id]).reduce((s, a) => s + a.horas, 0);
  const totalH        = aulasValidas.reduce((s, a) => s + a.horas, 0);
  const maxFaltasH    = Math.floor(totalH * 0.25);
  const aulasFaltou   = aulasPast.filter(a => !att[a.id]).length;

  const emRisco    = horasFalta > 0 && horasFalta >= maxFaltasH * 0.75;
  const reprovado  = horasFalta > maxFaltasH;
  const pctPresenca = totalH > 0 ? ((totalH - horasFalta) / totalH * 100) : 100;
  const hRestantes  = maxFaltasH - horasFalta;

  return {
    totalH, maxFaltasH, horasPresente, horasFalta, aulasFaltou,
    aulasPast, aulasFuture, emRisco, reprovado, pctPresenca, hRestantes,
  };
}
