// Tiny IndexedDB blob store used by local mode for drafts, submissions and map tiles.
const DB_NAME = 'landvas-blobs';
const STORE = 'blobs';

export class BlobDb {
  private db: IDBDatabase | null = null;
  private memory = new Map<string, Uint8Array>();
  ephemeral = false;

  async open() {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.ephemeral = true;
    }
  }

  private tx(mode: IDBTransactionMode) {
    return this.db!.transaction(STORE, mode).objectStore(STORE);
  }

  async get(key: string): Promise<Uint8Array | null> {
    if (!this.db) return this.memory.get(key) ?? null;
    return new Promise((resolve, reject) => {
      const req = this.tx('readonly').get(key);
      req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result as ArrayBuffer) : null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(key: string, bytes: Uint8Array) {
    if (!this.db) {
      this.memory.set(key, bytes);
      return;
    }
    const buf = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
    await new Promise<void>((resolve, reject) => {
      const req = this.tx('readwrite').put(buf, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async has(key: string) {
    if (!this.db) return this.memory.has(key);
    return new Promise<boolean>((resolve) => {
      const req = this.tx('readonly').count(key);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    });
  }

  static async destroy() {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
}
