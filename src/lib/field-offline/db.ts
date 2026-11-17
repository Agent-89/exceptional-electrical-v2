import {
  FIELD_OFFLINE_DB,
  FIELD_OFFLINE_VERSION,
  FIELD_STORE_OUTBOX,
  FIELD_STORE_TODAY,
  FIELD_STORE_VISITS,
  type FieldOutboxItem,
  type FieldTodaySnapshot,
  type FieldVisitSnapshot,
} from './types';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(FIELD_OFFLINE_DB, FIELD_OFFLINE_VERSION);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FIELD_STORE_TODAY)) {
        db.createObjectStore(FIELD_STORE_TODAY, { keyPath: 'staffId' });
      }
      if (!db.objectStoreNames.contains(FIELD_STORE_VISITS)) {
        db.createObjectStore(FIELD_STORE_VISITS, { keyPath: 'appointmentId' });
      }
      if (!db.objectStoreNames.contains(FIELD_STORE_OUTBOX)) {
        const outbox = db.createObjectStore(FIELD_STORE_OUTBOX, { keyPath: 'id' });
        outbox.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
    };
  });
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

export async function saveTodaySnapshot(snapshot: FieldTodaySnapshot): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(FIELD_STORE_TODAY, 'readwrite').objectStore(FIELD_STORE_TODAY).put(snapshot));
  } finally {
    db.close();
  }
}

export async function loadTodaySnapshot(staffId: string): Promise<FieldTodaySnapshot | null> {
  const db = await openDb();
  try {
    const row = await idbReq(
      db.transaction(FIELD_STORE_TODAY, 'readonly').objectStore(FIELD_STORE_TODAY).get(staffId),
    );
    return (row as FieldTodaySnapshot | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function saveVisitSnapshot(snapshot: FieldVisitSnapshot): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(FIELD_STORE_VISITS, 'readwrite').objectStore(FIELD_STORE_VISITS).put(snapshot));
  } finally {
    db.close();
  }
}

export async function loadVisitSnapshot(appointmentId: string): Promise<FieldVisitSnapshot | null> {
  const db = await openDb();
  try {
    const row = await idbReq(
      db.transaction(FIELD_STORE_VISITS, 'readonly').objectStore(FIELD_STORE_VISITS).get(appointmentId),
    );
    return (row as FieldVisitSnapshot | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function enqueueOutboxItem(item: FieldOutboxItem): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(FIELD_STORE_OUTBOX, 'readwrite').objectStore(FIELD_STORE_OUTBOX).put(item));
  } finally {
    db.close();
  }
}

export async function listOutboxItems(): Promise<FieldOutboxItem[]> {
  const db = await openDb();
  try {
    const rows = await idbReq(
      db.transaction(FIELD_STORE_OUTBOX, 'readonly').objectStore(FIELD_STORE_OUTBOX).getAll(),
    );
    return ((rows as FieldOutboxItem[]) || []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally {
    db.close();
  }
}

export async function removeOutboxItem(id: string): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(FIELD_STORE_OUTBOX, 'readwrite').objectStore(FIELD_STORE_OUTBOX).delete(id));
  } finally {
    db.close();
  }
}

export async function updateOutboxItem(item: FieldOutboxItem): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(FIELD_STORE_OUTBOX, 'readwrite').objectStore(FIELD_STORE_OUTBOX).put(item));
  } finally {
    db.close();
  }
}

export async function countOutboxItems(): Promise<number> {
  const db = await openDb();
  try {
    return await idbReq(db.transaction(FIELD_STORE_OUTBOX, 'readonly').objectStore(FIELD_STORE_OUTBOX).count());
  } finally {
    db.close();
  }
}
