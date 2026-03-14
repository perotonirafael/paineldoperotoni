/**
 * Hook para cache de dados processados no IndexedDB.
 * Salva o resultado do processamento (workerResult) para recarregar
 * automaticamente ao reabrir a página, sem precisar fazer upload novamente.
 */

const DB_NAME = 'pipeline-analytics-cache';
const DB_VERSION = 1;
const STORE_NAME = 'processed-data';
const CACHE_KEY = 'last-upload';

interface CacheEntry {
  key: string;
  result: any;
  timestamp: number;
  oppFileName: string;
  actFileName: string;
  oppCount: number;
  actCount: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveToCache(
  result: any,
  oppFileName: string,
  actFileName: string,
  oppCount: number,
  actCount: number
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const entry: CacheEntry = {
      key: CACHE_KEY,
      result,
      timestamp: Date.now(),
      oppFileName,
      actFileName,
      oppCount,
      actCount,
    };
    store.put(entry);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('Erro ao salvar cache:', err);
  }
}

export async function loadFromCache(): Promise<CacheEntry | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(CACHE_KEY);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('Erro ao carregar cache:', err);
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(CACHE_KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('Erro ao limpar cache:', err);
  }
}

export async function getCacheInfo(): Promise<{
  exists: boolean;
  timestamp?: number;
  oppFileName?: string;
  actFileName?: string;
  oppCount?: number;
  actCount?: number;
} | null> {
  try {
    const entry = await loadFromCache();
    if (!entry) return { exists: false };
    return {
      exists: true,
      timestamp: entry.timestamp,
      oppFileName: entry.oppFileName,
      actFileName: entry.actFileName,
      oppCount: entry.oppCount,
      actCount: entry.actCount,
    };
  } catch {
    return { exists: false };
  }
}
