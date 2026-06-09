/**
 * IndexedDB — armazenamento offline (rascunhos, fotos, fila de sincronização).
 * Capacidade muito superior ao localStorage (~5MB).
 */

export const OFFLINE_DB_NAME = 'manusilva_offline';
export const OFFLINE_DB_VERSION = 1;
export const STORE_REPORT_DRAFTS = 'report_drafts';
export const STORE_PENDING_SUBMISSIONS = 'trabalhos_pendentes';

let dbPromise = null;

export function openOfflineDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB não disponível neste browser.'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

      request.onerror = () => {
        reject(request.error || new Error('Falha ao abrir IndexedDB.'));
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_REPORT_DRAFTS)) {
          db.createObjectStore(STORE_REPORT_DRAFTS, { keyPath: 'jobId' });
        }
        if (!db.objectStoreNames.contains(STORE_PENDING_SUBMISSIONS)) {
          db.createObjectStore(STORE_PENDING_SUBMISSIONS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
    });
  }

  return dbPromise;
}

function runTransaction(storeName, mode, fn) {
  return openOfflineDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let output;

        tx.oncomplete = () => resolve(output);
        tx.onerror = () => reject(tx.error || new Error('Transação IndexedDB falhou.'));
        tx.onabort = () => reject(tx.error || new Error('Transação IndexedDB abortada.'));

        try {
          const maybePromise = fn(store);
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then((value) => {
              output = value;
            }).catch(reject);
          } else {
            output = maybePromise;
          }
        } catch (err) {
          reject(err);
        }
      }),
  );
}

export function idbGet(storeName, key) {
  return runTransaction(storeName, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  });
}

export function idbPut(storeName, value) {
  return runTransaction(storeName, 'readwrite', (store) => {
    store.put(value);
  });
}

export function idbDelete(storeName, key) {
  return runTransaction(storeName, 'readwrite', (store) => {
    store.delete(key);
  });
}

export function idbGetAll(storeName) {
  return runTransaction(storeName, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

export function idbClear(storeName) {
  return runTransaction(storeName, 'readwrite', (store) => {
    store.clear();
  });
}
