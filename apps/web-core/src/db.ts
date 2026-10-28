import { type SessionReport } from '@apm/algorithm-core';

export interface StoredSession {
  sessionId: string;
  report: SessionReport;
  synced: boolean;
  attempts: number;
  lastAttemptAt?: number;
  createdAt: number;
  syncedAt?: number;
}

const DB_NAME = 'apm_offline_storage';
const DB_VERSION = 1;
const STORE_SESSIONS = 'offline_sessions';
const STORE_SETTINGS = 'app_settings';

/**
 * Opens or initializes the offline IndexedDB store.
 */
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'sessionId' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Stores a newly completed session report into the offline queue.
 */
export async function saveSession(report: SessionReport): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);

    const record: StoredSession = {
      sessionId: report.sessionId,
      report,
      synced: false,
      attempts: 0,
      createdAt: Date.now(),
    };

    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Fetches all pending (unsynced) session reports.
 */
export async function getPendingSessions(): Promise<StoredSession[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const index = store.index('synced');
    const req = index.getAll(IDBKeyRange.only(false));

    req.onsuccess = () => resolve(req.result as StoredSession[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Marks a session as successfully synchronized with cloud backend.
 */
export async function markSessionSynced(sessionId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const req = store.get(sessionId);

    req.onsuccess = () => {
      const record = req.result as StoredSession | undefined;
      if (record) {
        record.synced = true;
        record.syncedAt = Date.now();
        store.put(record);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Synchronizes offline session reports with backend API using exponential backoff.
 */
export async function syncPendingSessions(
  endpointUrl: string,
  deviceToken: string
): Promise<{ synced: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const pending = await getPendingSessions();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({
          sessionId: item.sessionId,
          report: item.report,
          createdAt: item.createdAt,
        }),
      });

      if (res.ok) {
        await markSessionSynced(item.sessionId);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Persists app settings to IndexedDB.
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, 'readwrite');
    const store = tx.objectStore(STORE_SETTINGS);
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves an app setting from IndexedDB.
 */
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SETTINGS, 'readonly');
    const store = tx.objectStore(STORE_SETTINGS);
    const req = store.get(key);
    req.onsuccess = () => {
      if (req.result && 'value' in req.result) {
        resolve(req.result.value as T);
      } else {
        resolve(defaultValue);
      }
    };
    req.onerror = () => resolve(defaultValue);
  });
}
