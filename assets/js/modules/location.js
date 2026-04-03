// ═══════════════════════════════════════════════
// LOCATION — Modal de configuração da escola
// ═══════════════════════════════════════════════
import { getCampusCoords, saveCampusCoords, LS } from './config.js';
import { showToast } from './storage.js';

const MAX_DISPLAY_NAME_PARTS = 3;

export { getCampusCoords, saveCampusCoords };

export function updateGeoBanner() {
  const banner = document.getElementById('geoSetupBanner');
  if (!banner) return;
  const cfg = getCampusCoords();
  banner.classList.toggle('show', !cfg.custom);
}

export function initLocationModal() {
  const modal    = document.getElementById('locationModal');
  const openBtn  = document.getElementById('geoSetupBtn');
  const closeBtn = document.getElementById('locationModalClose');
  if (!modal) return;

  updateGeoBanner();

  if (openBtn)  openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  // Tab switching
  modal.querySelectorAll('.loc-tab').forEach((tab, i) => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.loc-tab').forEach(t => t.classList.remove('active'));
      modal.querySelectorAll('.loc-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      modal.querySelectorAll('.loc-panel')[i].classList.add('active');
    });
  });

  // ── GPS tab ──────────────────────────────────────────────
  const gpsBtn    = document.getElementById('locGpsBtn');
  const gpsStatus = document.getElementById('locGpsStatus');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        if (gpsStatus) gpsStatus.textContent = 'Geolocalização não suportada neste navegador.';
        return;
      }
      gpsBtn.disabled = true;
      gpsBtn.textContent = 'Obtendo localização…';
      if (gpsStatus) { gpsStatus.textContent = ''; gpsStatus.style.color = ''; }
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng } = pos.coords;
          saveCampusCoords(lat, lng, 'Minha Escola');
          if (gpsStatus) {
            gpsStatus.textContent = `✓ Localização salva: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            gpsStatus.style.color = 'var(--ok)';
          }
          gpsBtn.disabled = false;
          gpsBtn.textContent = 'Usar minha localização atual';
          updateGeoBanner();
          showToast('📍 Localização da escola salva!');
          setTimeout(closeModal, 1200);
        },
        err => {
          if (gpsStatus) {
            gpsStatus.textContent = 'Não foi possível obter a localização. Verifique as permissões do navegador.';
            gpsStatus.style.color = 'var(--warn)';
          }
          gpsBtn.disabled = false;
          gpsBtn.textContent = 'Usar minha localização atual';
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }

  // ── Search tab (Nominatim / OpenStreetMap) ────────────────
  const searchInp     = document.getElementById('locSearchInp');
  const searchBtn     = document.getElementById('locSearchBtn');
  const searchResults = document.getElementById('locSearchResults');
  if (searchBtn && searchInp) {
    searchBtn.addEventListener('click', () => doSearch(searchInp.value.trim()));
    searchInp.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch(searchInp.value.trim());
    });
  }

  async function doSearch(q) {
    if (!q || !searchResults) return;
    searchBtn.disabled = true;
    searchResults.innerHTML = '<p class="loc-search-hint">Buscando…</p>';
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
      const data = await res.json();
      searchResults.innerHTML = '';
      if (!data.length) {
        searchResults.innerHTML = '<p class="loc-search-hint">Nenhum resultado encontrado.</p>';
      } else {
        data.forEach(item => {
          const btn = document.createElement('button');
          btn.className = 'loc-result-btn';
          const shortName = item.display_name.split(',').slice(0, MAX_DISPLAY_NAME_PARTS).join(', ');
          btn.textContent = shortName;
          btn.title = item.display_name;
          btn.addEventListener('click', () => {
            const name = item.display_name.split(',')[0].trim();
            saveCampusCoords(parseFloat(item.lat), parseFloat(item.lon), name);
            updateGeoBanner();
            showToast(`📍 "${name}" salvo como escola!`);
            setTimeout(closeModal, 800);
          });
          searchResults.appendChild(btn);
        });
      }
    } catch {
      searchResults.innerHTML = '<p class="loc-search-hint" style="color:var(--warn)">Erro ao buscar. Verifique sua conexão.</p>';
    }
    searchBtn.disabled = false;
  }

  // ── Manual tab ───────────────────────────────────────────
  const manualSave = document.getElementById('locManualSave');
  if (manualSave) {
    manualSave.addEventListener('click', () => {
      const latV  = parseFloat(document.getElementById('locManualLat').value);
      const lngV  = parseFloat(document.getElementById('locManualLng').value);
      const nameV = document.getElementById('locManualName').value.trim();
      const errEl = document.getElementById('locManualErr');
      if (!isFinite(latV) || latV < -90  || latV > 90)  { errEl.textContent = 'Latitude inválida (entre -90 e 90).';    return; }
      if (!isFinite(lngV) || lngV < -180 || lngV > 180) { errEl.textContent = 'Longitude inválida (entre -180 e 180).'; return; }
      errEl.textContent = '';
      saveCampusCoords(latV, lngV, nameV || 'Escola personalizada');
      updateGeoBanner();
      showToast('📍 Localização da escola salva!');
      setTimeout(closeModal, 800);
    });
  }

  function openModal() {
    modal.classList.add('open');
    // Pre-fill manual fields with current values if configured
    const cfg = getCampusCoords();
    if (cfg.custom) {
      const latEl  = document.getElementById('locManualLat');
      const lngEl  = document.getElementById('locManualLng');
      const nameEl = document.getElementById('locManualName');
      if (latEl)  latEl.value  = cfg.lat;
      if (lngEl)  lngEl.value  = cfg.lng;
      if (nameEl) nameEl.value = cfg.name || '';
    }
  }

  function closeModal() {
    modal.classList.remove('open');
  }
}
