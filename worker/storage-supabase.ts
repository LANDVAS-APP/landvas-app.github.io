// Supabase Storage BlobStore (service role). Public tiles are immutable, so
// they are uploaded with a one-year cache lifetime for the CDN.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlobStore } from '../src/server/pipeline';

export function supabaseStore(client: SupabaseClient): BlobStore {
  return {
    async get(bucket, path) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async put(bucket, path, bytes, contentType) {
      const immutable = bucket === 'public-art';
      const { error } = await client.storage.from(bucket).upload(path, bytes, {
        contentType,
        upsert: true,
        cacheControl: immutable ? '31536000' : '3600',
      });
      if (error) throw new Error(`storage upload failed for ${bucket}/${path}: ${error.message}`);
    },
  };
}
