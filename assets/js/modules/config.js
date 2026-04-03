// ═══════════════════════════════════════════════
// CONFIG — Constantes e configurações globais
// ═══════════════════════════════════════════════

// ── Supabase ──────────────────────────────────────────────────────────────────
// Para rodar sua própria instância:
//   1. Crie um projeto em https://supabase.com
//   2. Vá em Project Settings → API e copie "Project URL" e "anon public key"
//   3. Substitua os valores abaixo (ou injete via variáveis de ambiente do
//      Netlify / Vercel usando um step de build que gere este arquivo)
// ─────────────────────────────────────────────────────────────────────────────
export const SUPABASE_URL = 'https://wpxfhdlrygvucbmyfqaa.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweGZoZGxyeWd2dWNibXlmcWFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTY2NjgsImV4cCI6MjA4OTg5MjY2OH0.Zvayhj5vnxJ09fMElZ_rCJF_2jKBM74g3VZuDxvxYME';

// Chaves do localStorage
export const LS = {
  att:          'v3_att',
  ev:           'v3_ev',
  tasks:        'v3_tasks',
  topics:       'v3_topics',
  dark:         'v3_dark',
  userCourses:  'v3_userCourses',
  archived:     'v3_archived',
  cancelled:    'v3_cancelled',
  semConfig:    'v3_semConfig',
  campusLat:    'fs-campus-lat',
  campusLng:    'fs-campus-lng',
  campusName:   'fs-campus-name',
  tourDone:     'fs-tour-done',
  lastSync:     'fs-last-sync',
  guestName:    'fs-guest-name',
  guestAvatar:  'fs-guest-avatar',
};

// Cores para eventos custom
export const COLORS = [
  '#6366f1','#3b82f6','#10b981','#f59e0b',
  '#ef4444','#ec4899','#8b5cf6','#14b8a6',
];

// Cores para disciplinas adicionadas pelo usuário
export const COURSE_COLORS = [
  '#f59e0b','#3b82f6','#8b5cf6','#10b981',
  '#ef4444','#ec4899','#6366f1','#14b8a6',
  '#f97316','#06b6d4',
];

// Calendário vertical
export const CAL_INI                = 7;   // hora de início da grade
export const CAL_FIM                = 21;  // hora de fim da grade
export const SLOT                   = 48;  // px por hora
export const CALENDAR_DRAG_THRESHOLD = 5;  // px mínimos para iniciar drag

// Nomes dos dias (índice 0 = Segunda)
export const DNAMES = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

// Geofencing — Campus do Pici (UFC, Fortaleza)
export const CAMPUS_LAT             = -3.7423;
export const CAMPUS_LNG             = -38.5777;
export const CAMPUS_RADIUS_M        = 1000;
export const GEO_LEAD_H             = 5 / 60;         // 5 min antes do início
export const GEO_TIMEOUT_MS         = 10000;
export const GEO_MAX_AGE_MS         = 60000;
export const GEO_CHECK_INTERVAL_MS  = 2 * 60 * 1000;  // verificação a cada 2 min

// Fila offline
export const OFFLINE_MAX_RETRIES     = 5;
export const OFFLINE_BACKOFF_BASE_MS = 2000;

// Coordenadas dinâmicas do campus (lê do localStorage, cai no padrão UFC Pici)
export function getCampusCoords() {
  const lat = parseFloat(localStorage.getItem('fs-campus-lat'));
  const lng = parseFloat(localStorage.getItem('fs-campus-lng'));
  return {
    lat:    isFinite(lat) ? lat  : CAMPUS_LAT,
    lng:    isFinite(lng) ? lng  : CAMPUS_LNG,
    name:   localStorage.getItem('fs-campus-name') || null,
    custom: isFinite(lat) && isFinite(lng),
  };
}

export function saveCampusCoords(lat, lng, name) {
  localStorage.setItem('fs-campus-lat',  String(lat));
  localStorage.setItem('fs-campus-lng',  String(lng));
  localStorage.setItem('fs-campus-name', name || '');
}
