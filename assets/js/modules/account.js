// ═══════════════════════════════════════════════
// ACCOUNT — Painel de conta do usuário
// ═══════════════════════════════════════════════
import { sb, supaUser, setSupaUser, doSignOut, sbFullSync } from './supabase.js';
import { showToast }                            from './storage.js';
import { LS }                                   from './config.js';

const AVATAR_COLORS = [
  '#7c3aed','#2563eb','#059669','#d97706',
  '#dc2626','#db2777','#0891b2','#65a30d',
];

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
  if (!supaUser) return;

  const meta      = supaUser.user_metadata || {};
  const fullName  = meta.full_name || meta.name || '';
  const email     = supaUser.email || '';
  const provider  = supaUser.app_metadata?.provider || 'email';
  const avatarUrl = meta.avatar_url || '';
  const seed      = fullName || email;
  const initials  = _getInitials(seed || '?');
  const color     = _avatarColor(seed || '?');
  const createdAt = supaUser.created_at
    ? new Date(supaUser.created_at).toLocaleDateString('pt-BR')
    : '—';

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

  document.getElementById('accName').textContent      = fullName || email.split('@')[0];
  document.getElementById('accEmail').textContent     = email;
  document.getElementById('accProvider').textContent  = provider === 'google' ? '🔵 Entrou com Google' : '📧 e-mail e senha';
  document.getElementById('accSince').textContent     = `membro desde ${createdAt}`;

  // Reset name-edit form when modal re-opens
  const nameEditRow = document.getElementById('accNameEditRow');
  if (nameEditRow) nameEditRow.hidden = true;
  const nameErr = document.getElementById('accNameErr');
  if (nameErr) nameErr.textContent = '';

  // Sync dark mode button label
  const dark = document.body.classList.contains('dark');
  const accBtnDark = document.getElementById('accBtnDark');
  if (accBtnDark) accBtnDark.textContent = dark ? '☀ claro' : '🌙 escuro';

  // Security section: only relevant for e-mail / password accounts
  const secSection = document.getElementById('accSecuritySection');
  if (secSection) secSection.style.display = provider === 'google' ? 'none' : '';

  // Sync section: only for authenticated users (not guests)
  const dataSection = document.getElementById('accDataSection');
  if (dataSection) {
    const syncBtn = document.getElementById('accBtnSync');
    if (syncBtn) syncBtn.style.display = (sb && supaUser) ? '' : 'none';
  }
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
    const dark = document.body.classList.contains('dark');
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
    if (!sb) { showToast('sem conexão com o servidor'); return; }
    const { data, error } = await sb.auth.updateUser({ data: { avatar_url: dataUrl } });
    if (error) { showToast('erro ao salvar foto'); return; }
    if (data?.user) setSupaUser(data.user);
    _populateAccountInfo();
    showToast('✓ foto atualizada');
  });

  // ── Editar nome ──
  document.getElementById('accBtnEditName')?.addEventListener('click', () => {
    const meta     = supaUser?.user_metadata || {};
    const current  = meta.full_name || meta.name || supaUser?.email?.split('@')[0] || '';
    const input    = document.getElementById('accNameInput');
    const editRow  = document.getElementById('accNameEditRow');
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

  // ── Forçar sincronização ──
  document.getElementById('accBtnSync')?.addEventListener('click', async () => {
    if (!sb || !supaUser) { showToast('sem sessão ativa'); return; }
    const btn = document.getElementById('accBtnSync');
    if (btn) { btn.textContent = '⟳ sincronizando…'; btn.disabled = true; }
    try {
      await sbFullSync();
      showToast('✓ sincronização concluída');
    } catch (e) {
      showToast('erro na sincronização');
    } finally {
      if (btn) { btn.textContent = '⟳ forçar sincronização'; btn.disabled = false; }
    }
  });

  // ── Exportar dados ──
  document.getElementById('accBtnExport')?.addEventListener('click', () => {
    _closeModal('accountModal');
    document.getElementById('btnExport2')?.click();
  });

  // ── Limpar dados locais ──
  document.getElementById('accBtnClearLocal')?.addEventListener('click', () => {
    if (!confirm('Limpar todos os dados locais?\n\nDados salvos na nuvem não são afetados e serão recarregados no próximo acesso.')) return;
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    showToast('dados locais limpos — recarregando…');
    setTimeout(() => window.location.reload(), 1200);
  });

  // ── Sair (logout) ──
  document.getElementById('accBtnLogout')?.addEventListener('click', () => doSignOut());

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
}
