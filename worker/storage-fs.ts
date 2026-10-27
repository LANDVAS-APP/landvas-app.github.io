// Filesystem BlobStore for development and integration tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BlobStore } from '../src/server/pipeline';

export function fsStore(root: string): BlobStore & { root: string } {
  const safe = (bucket: string, p: string) => {
    const full = path.resolve(root, bucket, p);
    if (!full.startsWith(path.resolve(root, bucket) + path.sep)) throw new Error('path_escape');
    return full;
  };
  return {
    root,
    async get(bucket, p) {
      try {
        return new Uint8Array(await fs.readFile(safe(bucket, p)));
      } catch {
        return null;
      }
    },
    async put(bucket, p, bytes) {
      const full = safe(bucket, p);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
    },
  };
}
