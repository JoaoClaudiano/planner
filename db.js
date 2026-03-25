'use strict';
// ═══════════════════════════════════════════════
// DB.JS — Fila offline com IndexedDB
// Armazena operações que falharam por falta de conexão
// para sincronizá-las quando a rede for restaurada.
// ═══════════════════════════════════════════════

const OFFLINE_DB_NAME    = 'rotina-offline-v1';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE      = 'pending_ops';

// Abre (ou cria) o banco IndexedDB
function _openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        // id auto-incremental; cada op tem { type, ...dados, ts }
        db.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// Adiciona uma operação pendente à fila
async function offlineAddOp(op) {
  const db = await _openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OFFLINE_STORE, 'readwrite');
    const req = tx.objectStore(OFFLINE_STORE).add({ ...op, ts: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// Retorna todas as operações pendentes (ordenadas por id/ts)
async function offlineGetOps() {
  const db = await _openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OFFLINE_STORE, 'readonly');
    const req = tx.objectStore(OFFLINE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// Remove uma operação pelo id (após sincronização bem-sucedida)
async function offlineDeleteOp(id) {
  const db = await _openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OFFLINE_STORE, 'readwrite');
    const req = tx.objectStore(OFFLINE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// Conta quantas operações ainda estão pendentes
async function offlineCountOps() {
  const db = await _openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OFFLINE_STORE, 'readonly');
    const req = tx.objectStore(OFFLINE_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
