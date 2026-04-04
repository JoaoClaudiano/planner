// ═══════════════════════════════════════════════
// ACCOUNT — Painel de conta do usuário
// ═══════════════════════════════════════════════
import { sb, supaUser, setSupaUser, doSignOut, sbFullSync } from './supabase.js';
import { showToast }                            from './storage.js';
import { LS, getCampusCoords }                 from './config.js';
import { getSemDates }                         from './calendar.js';

// ── Auto-import de feriados nacionais ──────────────────────────────────────────
const LS_HOLIDAYS_YEAR = 'fs-holidays-year'; // ano do último import de feriados

export async function autoImportHolidays({ silent = true } = {}) {
  const year = new Date().getFullYear();
  // Só executa uma vez por ano
  if (localStorage.getItem(LS_HOLIDAYS_YEAR) === String(year)) return;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
    if (!res.ok) return;
    const holidays = await res.json();
    if (!Array.isArray(holidays)) return;

    const { customEvents, setCustomEvents, cancelled, COURSES } = await import('./state.js');
    const { save }                                               = await import('./storage.js');
    const { uid }                                                = await import('./utils.js');
    const { sbSaveEvent }                                        = await import('./supabase.js');

    const existing = new Set(customEvents.map(e => {
      const d = e.date instanceof Date ? e.date : new Date(e.date);
      return d.toISOString().slice(0, 10);
    }));

    const updated = [...customEvents];
    let added = 0;

    holidays.forEach(h => {
      if (!h.date || !h.name) return;

      // Criar evento de feriado se ainda não existe nessa data
      if (!existing.has(h.date)) {
        const ev = {
          id:   uid(),
          nome: h.name,
          date: new Date(h.date + 'T12:00:00'),
          ini:  '00:00',
          fim:  '00:00',
          type: 'lembrete',
          cor:  '#ef4444',
          note: 'feriado nacional',
        };
        updated.push(ev);
        sbSaveEvent(ev);
        added++;
      }

      // Cancelar automaticamente as aulas que caem nessa data de feriado
      const holidayDateStr = h.date; // 'YYYY-MM-DD'
      COURSES.forEach(c => {
        c._aulas.forEach(a => {
          const aulaDate = a.date instanceof Date
            ? a.date.toISOString().slice(0, 10)
            : String(a.date).slice(0, 10);
          if (aulaDate === holidayDateStr && !cancelled.has(a.id)) {
            cancelled.add(a.id);
          }
        });
      });
    });

    if (added > 0) {
      setCustomEvents(updated);
    }
    save(true);
    localStorage.setItem(LS_HOLIDAYS_YEAR, String(year));
    if (!silent && added > 0) {
      showToast(`🗓 ${added} feriado${added !== 1 ? 's' : ''} importado${added !== 1 ? 's' : ''} automaticamente`);
    }
  } catch { /* silencioso — não perturbar o usuário se falhar */ }
}

const AVATAR_COLORS = [
  '#7c3aed','#2563eb','#059669','#d97706',
  '#dc2626','#db2777','#0891b2','#65a30d',
];

// Hook called when profile (name/avatar) is updated, so the greeting can refresh
let _onProfileUpdateHook = null;
export function registerProfileUpdateHook(fn) { _onProfileUpdateHook = fn; }

function _relativeTime(isoString) {
  if (!isoString) return null;
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)  return 'há menos de 1 minuto';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `há ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  const d = Math.floor(diff / 86400);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

function _getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

function _avatarColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/** Resize an image File to a square JPEG data URL (default 128 px). */
function _resizeImage(file, size = 128) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      const sx  = (img.width  - min) / 2;
      const sy  = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Render avatar element: photo if available, otherwise initials + color. */
function _setAvatarEl(el, initials, color, avatarUrl) {
  if (!el) return;
  if (avatarUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    img.src = avatarUrl;
    el.textContent = '';
    el.style.background = 'transparent';
    el.appendChild(img);
  } else {
    el.textContent = initials;
    el.style.background = color;
  }
}

function _populateAccountInfo() {
  const isGuest = !supaUser;

  // ── Avatar + nome ──
  let fullName, email, provider, avatarUrl, createdAt;

  if (isGuest) {
    fullName  = localStorage.getItem(LS.guestName) || '';
    email     = '';
    provider  = 'guest';
    avatarUrl = localStorage.getItem(LS.guestAvatar) || '';
    createdAt = null;
  } else {
    const meta = supaUser.user_metadata || {};
    fullName   = meta.full_name || meta.name || '';
    email      = supaUser.email || '';
    provider   = supaUser.app_metadata?.provider || 'email';
    avatarUrl  = meta.avatar_url || '';
    createdAt  = supaUser.created_at
      ? new Date(supaUser.created_at).toLocaleDateString('pt-BR')
      : null;
  }

  const seed     = fullName || email || 'visitante';
  const initials = _getInitials(seed);
  const color    = _avatarColor(seed);

  // Small avatar in header button
  const smallAvatar = document.getElementById('accountAvatar');
  if (smallAvatar) {
    if (avatarUrl) {
      const img = document.createElement('img');
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
      img.src = avatarUrl;
      smallAvatar.textContent = '';
      smallAvatar.style.background = 'transparent';
      smallAvatar.appendChild(img);
    } else {
      smallAvatar.textContent = initials;
      smallAvatar.style.background = color;
    }
  }

  // Large avatar inside modal
  _setAvatarEl(document.getElementById('accAvatarLg'), initials, color, avatarUrl);

  document.getElementById('accName').textContent =
    fullName || (isGuest ? 'visitante' : email.split('@')[0]);
  document.getElementById('accEmail').textContent =
    isGuest ? '— modo visitante —' : email;

  const passUsernameEl = document.getElementById('accPassUsername');
  if (passUsernameEl) passUsernameEl.value = email;

  if (isGuest) {
    document.getElementById('accProvider').textContent = '👤 conta local (sem login)';
    document.getElementById('accSince').textContent    = 'dados salvos localmente';
  } else {
    document.getElementById('accProvider').textContent =
      provider === 'google' ? '🔵 Entrou com Google' : '📧 e-mail e senha';
    document.getElementById('accSince').textContent =
      createdAt ? `membro desde ${createdAt}` : '';
  }

  // Reset name-edit form when modal re-opens
  const nameEditRow = document.getElementById('accNameEditRow');
  if (nameEditRow) nameEditRow.hidden = true;
  const nameErr = document.getElementById('accNameErr');
  if (nameErr) nameErr.textContent = '';

  // Sync dark mode button label
  const dark = document.documentElement.classList.contains('dark');
  const accBtnDark = document.getElementById('accBtnDark');
  if (accBtnDark) accBtnDark.textContent = dark ? '☀ claro' : '🌙 escuro';

  // Campus name subtitle
  const campusSubEl = document.getElementById('accCampusName');
  if (campusSubEl) {
    const campus = getCampusCoords();
    if (campus.name) {
      campusSubEl.textContent = campus.name;
      campusSubEl.style.display = '';
    } else {
      campusSubEl.style.display = 'none';
    }
  }

  // Last sync meta text (only for authenticated)
  const syncMetaEl = document.getElementById('accSyncMeta');
  if (syncMetaEl) {
    if (isGuest) {
      syncMetaEl.style.display = 'none';
    } else {
      syncMetaEl.style.display = '';
      const lastSync = localStorage.getItem(LS.lastSync);
      const rel = _relativeTime(lastSync);
      if (lastSync) {
        syncMetaEl.textContent = `☁ ✔ sincronizado · ${rel}`;
        syncMetaEl.classList.remove('warn');
      } else {
        syncMetaEl.textContent = '☁ ⚠ dados não sincronizados com a nuvem';
        syncMetaEl.classList.add('warn');
      }
    }
  }

  // Semester status label + progress bar
  const semStatusEl = document.getElementById('accSemStatus');
  const semProgEl   = document.getElementById('accSemProg');
  const semFillEl   = document.getElementById('accSemFill');
  if (semStatusEl && semProgEl && semFillEl) {
    try {
      const { ini, fim } = getSemDates();
      const now     = new Date();
      const total   = fim - ini;
      const elapsed = Math.min(Math.max(now - ini, 0), total);
      const pct     = total > 0 ? elapsed / total * 100 : 0;
      const semTot  = Math.ceil(total / (7 * 86400000));
      const semAt   = Math.ceil((now - ini) / (7 * 86400000));
      let label;
      if (now < ini)      label = 'antes do início';
      else if (now > fim) label = 'semestre encerrado';
      else                label = `semana ${Math.max(1, semAt)} de ${semTot}`;
      semStatusEl.textContent   = label;
      semStatusEl.style.display = '';
      semFillEl.style.width     = pct.toFixed(1) + '%';
      semProgEl.style.display   = '';
    } catch {
      semStatusEl.style.display = 'none';
      semProgEl.style.display   = 'none';
    }
  }

  // Security section: only for email/password authenticated accounts
  const secSection = document.getElementById('accSecuritySection');
  if (secSection) secSection.style.display = (!isGuest && provider !== 'google') ? '' : 'none';

  // Danger zone: only for authenticated accounts
  const dangerSection = document.querySelector('.acc-danger-zone');
  if (dangerSection) dangerSection.style.display = isGuest ? 'none' : '';

  // Sync section: cloud buttons only for authenticated users
  const syncBtn = document.getElementById('accBtnSync');
  if (syncBtn) syncBtn.style.display = (!isGuest && sb && supaUser) ? '' : 'none';

  // Sync meta and logout label
  const logoutBtn = document.getElementById('accBtnLogout');
  if (logoutBtn) logoutBtn.textContent = isGuest ? '↩ sair do modo visitante' : '↩ sair da conta';
}

function _openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function _closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

export function initAccountModal() {
  const modal = document.getElementById('accountModal');
  if (!modal) return;

  // ── Open / close account modal ──────────────────
  document.getElementById('btnAccount')?.addEventListener('click', () => {
    _populateAccountInfo();
    _openModal('accountModal');
  });

  document.getElementById('accountModalClose')?.addEventListener('click', () =>
    _closeModal('accountModal'));

  modal.addEventListener('mousedown', e => {
    if (e.target === modal) _closeModal('accountModal');
  });

  // ── Dark mode (delegates to the existing header button) ──
  document.getElementById('accBtnDark')?.addEventListener('click', () => {
    document.getElementById('btnDark')?.click();
    const dark = document.documentElement.classList.contains('dark');
    const accBtnDark = document.getElementById('accBtnDark');
    if (accBtnDark) accBtnDark.textContent = dark ? '☀ claro' : '🌙 escuro';
  });

  // ── Foto de perfil ──
  document.getElementById('accAvatarFile')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('selecione uma imagem'); return; }
    const dataUrl = await _resizeImage(file);
    if (!dataUrl) { showToast('erro ao processar imagem'); return; }
    if (!supaUser) {
      // Guest: save avatar to localStorage
      localStorage.setItem(LS.guestAvatar, dataUrl);
      _populateAccountInfo();
      showToast('✓ foto atualizada');
      return;
    }
    if (!sb) { showToast('sem conexão com o servidor'); return; }
    const { data, error } = await sb.auth.updateUser({ data: { avatar_url: dataUrl } });
    if (error) { showToast('erro ao salvar foto'); return; }
    if (data?.user) setSupaUser(data.user);
    _populateAccountInfo();
    showToast('✓ foto atualizada');
  });

  // ── Editar nome ──
  document.getElementById('accBtnEditName')?.addEventListener('click', () => {
    const current = supaUser
      ? (supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || supaUser.email?.split('@')[0] || '')
      : (localStorage.getItem(LS.guestName) || '');
    const input   = document.getElementById('accNameInput');
    const editRow = document.getElementById('accNameEditRow');
    if (input)   { input.value = current; }
    if (editRow) { editRow.hidden = false; input?.focus(); }
    const nameErr = document.getElementById('accNameErr');
    if (nameErr) nameErr.textContent = '';
  });

  document.getElementById('accBtnCancelName')?.addEventListener('click', () => {
    const editRow = document.getElementById('accNameEditRow');
    if (editRow) editRow.hidden = true;
  });

  document.getElementById('accBtnSaveName')?.addEventListener('click', async () => {
    const input   = document.getElementById('accNameInput');
    const errEl   = document.getElementById('accNameErr');
    const newName = input?.value.trim();
    if (!newName) { errEl.textContent = 'O nome não pode estar vazio.'; return; }
    errEl.textContent = '';
    const btn = document.getElementById('accBtnSaveName');
    btn.disabled = true;
    try {
      if (!supaUser) {
        // Guest: save name to localStorage
        localStorage.setItem(LS.guestName, newName);
        _populateAccountInfo();
        if (_onProfileUpdateHook) _onProfileUpdateHook();
        showToast('✓ nome atualizado');
        return;
      }
      if (!sb) { errEl.textContent = 'sem conexão com o servidor.'; return; }
      const { data, error } = await sb.auth.updateUser({ data: { full_name: newName } });
      if (error) { errEl.textContent = error.message; return; }
      if (data?.user) setSupaUser(data.user);
      _populateAccountInfo();
      showToast('✓ nome atualizado');
    } finally { btn.disabled = false; }
  });

  // ── Campus / localização ──
  document.getElementById('accBtnCampus')?.addEventListener('click', () => {
    _closeModal('accountModal');
    _openModal('locationModal');
  });

  // ── Configurar semestre ──
  document.getElementById('accBtnSemester')?.addEventListener('click', () => {
    _closeModal('accountModal');
    document.getElementById('btnSemConfig')?.click();
  });

  // ── Sincronizar agora ──
  document.getElementById('accBtnSync')?.addEventListener('click', async () => {
    if (!sb || !supaUser) { showToast('sem sessão ativa'); return; }
    const btn = document.getElementById('accBtnSync');
    if (btn) { btn.textContent = '☁ sincronizando…'; btn.disabled = true; }
    try {
      await sbFullSync();
      localStorage.setItem(LS.lastSync, new Date().toISOString());
      const syncMetaEl = document.getElementById('accSyncMeta');
      if (syncMetaEl) {
        syncMetaEl.textContent = '☁ ✔ sincronizado · há menos de 1 minuto';
        syncMetaEl.classList.remove('warn');
      }
      showToast('✓ sincronização concluída');
    } catch (e) {
      showToast('erro na sincronização');
    } finally {
      if (btn) { btn.textContent = '☁ sincronizar agora'; btn.disabled = false; }
    }
  });

  // ── Exportar dados ──
  document.getElementById('accBtnExport')?.addEventListener('click', () => {
    _closeModal('accountModal');
    _openModal('exportFmtModal');
  });

  document.getElementById('exportFmtClose')?.addEventListener('click', () =>
    _closeModal('exportFmtModal'));

  document.getElementById('exportFmtModal')?.addEventListener('mousedown', e => {
    if (e.target === document.getElementById('exportFmtModal')) _closeModal('exportFmtModal');
  });

  document.getElementById('exportFmtXlsx')?.addEventListener('click', () => {
    _closeModal('exportFmtModal');
    document.getElementById('btnExport2')?.click();
  });

  document.getElementById('exportFmtJson')?.addEventListener('click', () => {
    _closeModal('exportFmtModal');
    import('./attendance.js').then(m => {
      if (typeof m.doExportJson === 'function') {
        m.doExportJson();
      } else {
        showToast('exportação JSON não disponível');
      }
    }).catch(() => showToast('erro ao exportar'));
  });

  // ── Importar dados ──
  document.getElementById('accBtnImport')?.addEventListener('click', () => {
    _closeModal('accountModal');
    document.getElementById('btnImport2')?.click();
  });

  // ── Limpar dados locais ──
  document.getElementById('accBtnClearLocal')?.addEventListener('click', () => {
    if (!confirm('Limpar todos os dados locais?\n\nDados salvos na nuvem não são afetados e serão recarregados no próximo acesso.')) return;
    // Preserve campus location (a setting, not study data) so the setup banner doesn't reappear
    const keepKeys = new Set([LS.campusLat, LS.campusLng, LS.campusName]);
    Object.values(LS).forEach(k => { if (!keepKeys.has(k)) localStorage.removeItem(k); });
    showToast('dados locais limpos — recarregando…');
    setTimeout(() => window.location.reload(), 1200);
  });

  // ── Sair (logout) ──
  document.getElementById('accBtnLogout')?.addEventListener('click', () => {
    if (!supaUser) {
      // Guest logout: just go back to login
      sessionStorage.removeItem('fs-guest');
      window.location.href = 'login.html';
    } else {
      doSignOut();
    }
  });

  // ── Alterar senha ──
  document.getElementById('accBtnChangePass')?.addEventListener('click', async () => {
    const errEl  = document.getElementById('accPassErr');
    const newPass = document.getElementById('accNewPass')?.value.trim();
    if (!newPass || newPass.length < 8) {
      errEl.textContent = 'A senha deve ter pelo menos 8 caracteres.';
      return;
    }
    errEl.textContent = '';
    const btn = document.getElementById('accBtnChangePass');
    btn.disabled = true;
    try {
      const { error } = await sb.auth.updateUser({ password: newPass });
      if (error) {
        errEl.textContent = error.message;
      } else {
        document.getElementById('accNewPass').value = '';
        showToast('✓ senha alterada com sucesso');
      }
    } finally { btn.disabled = false; }
  });

  // ── Alterar e-mail ──
  document.getElementById('accBtnChangeEmail')?.addEventListener('click', async () => {
    const errEl   = document.getElementById('accEmailErr');
    const newEmail = document.getElementById('accNewEmail')?.value.trim();
    if (!newEmail || !newEmail.includes('@')) {
      errEl.textContent = 'Digite um e-mail válido.';
      return;
    }
    errEl.textContent = '';
    const btn = document.getElementById('accBtnChangeEmail');
    btn.disabled = true;
    try {
      const { error } = await sb.auth.updateUser({ email: newEmail });
      if (error) {
        errEl.textContent = error.message;
      } else {
        document.getElementById('accNewEmail').value = '';
        showToast('✓ confirme a alteração no novo e-mail');
      }
    } finally { btn.disabled = false; }
  });

  // ── Excluir conta ────────────────────────────────
  document.getElementById('accBtnDelete')?.addEventListener('click', () => {
    _closeModal('accountModal');
    document.getElementById('deleteAccountEmail').value = '';
    document.getElementById('deleteAccountErr').textContent = '';
    const btn = document.getElementById('deleteAccountConfirm');
    btn.textContent = 'Excluir permanentemente';
    btn.disabled = false;
    _openModal('deleteAccountModal');
  });

  const delModal = document.getElementById('deleteAccountModal');

  document.getElementById('deleteAccountClose')?.addEventListener('click', () =>
    _closeModal('deleteAccountModal'));

  document.getElementById('deleteAccountCancel')?.addEventListener('click', () =>
    _closeModal('deleteAccountModal'));

  delModal?.addEventListener('mousedown', e => {
    if (e.target === delModal) _closeModal('deleteAccountModal');
  });

  document.getElementById('deleteAccountConfirm')?.addEventListener('click', async () => {
    const emailInput = document.getElementById('deleteAccountEmail').value.trim();
    const errEl      = document.getElementById('deleteAccountErr');
    const btn        = document.getElementById('deleteAccountConfirm');

    if (!supaUser) { errEl.textContent = 'Sem sessão ativa.'; return; }
    if (emailInput !== supaUser.email) {
      errEl.textContent = 'E-mail incorreto. Tente novamente.';
      return;
    }

    errEl.textContent = '';
    btn.textContent   = 'Excluindo…';
    btn.disabled      = true;

    try {
      const uid = supaUser.id;

      // Remove all user data from cloud tables
      await Promise.allSettled([
        sb.from('presencas').delete().eq('user_id', uid),
        sb.from('eventos').delete().eq('user_id', uid),
        sb.from('tarefas').delete().eq('user_id', uid),
        sb.from('topicos').delete().eq('user_id', uid),
      ]);

      // Call RPC to delete the auth user record
      // Requires the delete_my_account() function in Supabase (see database.sql)
      const { error: rpcErr } = await sb.rpc('delete_my_account');
      if (rpcErr) { /* ignora: conta auth pode já ter sido removida */ }

      // Wipe local data
      Object.values(LS).forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();

      await sb.auth.signOut();
      window.location.href = 'login.html';
    } catch {
      errEl.textContent = 'Erro ao excluir conta. Tente novamente.';
      btn.textContent   = 'Excluir permanentemente';
      btn.disabled      = false;
    }
  });

  // Populate header avatar immediately so it shows without waiting for the modal to open
  _populateAccountInfo();
}
