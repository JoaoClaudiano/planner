'use strict';
// ═══════════════════════════════════════════════
// DB.JS — Fila offline com IndexedDB
// Armazena operações que falharam por falta de conexão
// para sincronizá-las quando a rede for restaurada.
// ═══════════════════════════════════════════════

const OFFLINE_DB_NAME    = 'rotina-offline-v1';
const OFFLINE_DB_VERSION = 2;           // v2: índice por aulaId para deduplicação
const OFFLINE_STORE      = 'pending_ops';

// Abre (ou cria) o banco IndexedDB
function _openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      let store;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        store = db.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
      } else {
        store = e.target.transaction.objectStore(OFFLINE_STORE);
      }
      // Índice por aulaId para consulta rápida de deduplicação
      if (!store.indexNames.contains('aulaId')) {
        store.createIndex('aulaId', 'aulaId', { unique: false });
      }
      // Migração v1→v2: popula created_at a partir de ts nos registros existentes
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = ev => {
        const cursor = ev.target.result;
        if (!cursor) return;
        if (!cursor.value.created_at && cursor.value.ts) {
          cursor.update({ ...cursor.value, created_at: cursor.value.ts });
        }
        cursor.continue();
      };
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// Insere ou atualiza uma operação pendente (deduplicação por aulaId + type)
// Se já existir op do mesmo tipo para o mesmo aulaId, atualiza o valor e reseta o retry.
async function offlineUpsertOp(op) {
  const db = await _openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(OFFLINE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_STORE);
    const req   = store.index('aulaId').getAll(op.aulaId);
    req.onsuccess = () => {
      const existing = req.result.find(r => r.type === op.type);
      if (existing) {
        // Atualiza op existente com novos valores de op, preservando id e created_at; reseta retry
        const putReq = store.put({
          ...existing,
          ...op,
          id:          existing.id,
          created_at:  existing.created_at,
          status:      'pending',
          retryCount:  0,
          lastAttempt: null,
        });
        putReq.onsuccess = () => resolve(existing.id);
        putReq.onerror   = () => reject(putReq.error);
      } else {
        const addReq = store.add({
          ...op,
          status:      'pending',
          retryCount:  0,
          lastAttempt: null,
          created_at:  Date.now(),
        });
        addReq.onsuccess = () => resolve(addReq.result);
        addReq.onerror   = () => reject(addReq.error);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// Retorna todas as operações pendentes ordenadas por created_at (FIFO)
async function offlineGetOps() {
  const db = await _openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OFFLINE_STORE, 'readonly');
    const req = tx.objectStore(OFFLINE_STORE).getAll();
    req.onsuccess = () => {
      const ops = req.result.sort(
        (a, b) => (a.created_at || a.ts || 0) - (b.created_at || b.ts || 0)
      );
      resolve(ops);
    };
    req.onerror = () => reject(req.error);
  });
}

// Atualiza campos de uma operação (status, retryCount, lastAttempt)
async function offlineUpdateOp(id, updates) {
  const db = await _openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(OFFLINE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      if (!getReq.result) { resolve(); return; }
      const putReq = store.put({ ...getReq.result, ...updates });
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
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

// Conta operações com status 'pending' (exclui as permanentemente falhas)
async function offlineCountPendingOps() {
  const ops = await offlineGetOps();
  return ops.filter(op => (op.status || 'pending') !== 'failed').length;
}
