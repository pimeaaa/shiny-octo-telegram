import type { Job, JobCache } from "../types/job.js";

export function ensureJobCache(job: Job): JobCache {
  if (!job.cache) {
    job.cache = { version: 1, items: {} } as JobCache;
  }
  if (job.cache.version !== 1) {
    // Future-proofing: reset if version mismatches.
    job.cache = { version: 1, items: {} } as JobCache;
  }
  if (!job.cache.items) {
    job.cache.items = {};
  }
  return job.cache;
}

export function ensureItemCache(job: Job, itemId: string) {
  const cache = ensureJobCache(job);
  if (!cache.items[itemId]) {
    cache.items[itemId] = {};
  }
  return cache.items[itemId]!;
}
