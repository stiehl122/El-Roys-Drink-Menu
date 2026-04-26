function normalizePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createRateLimiter({ limit, windowMs, now = () => Date.now() } = {}) {
  const maxAttempts = Math.floor(normalizePositiveNumber(limit, 1));
  const windowLengthMs = normalizePositiveNumber(windowMs, 60_000);
  const buckets = new Map();

  function readNow() {
    const value = Number(now());
    return Number.isFinite(value) ? value : Date.now();
  }

  function prune(at = readNow()) {
    let pruned = 0;
    for (const [key, bucket] of buckets.entries()) {
      if (!bucket || bucket.resetAt <= at) {
        buckets.delete(key);
        pruned += 1;
      }
    }
    return pruned;
  }

  function buildAllowed(bucket) {
    return {
      allowed: true,
      limit: maxAttempts,
      remaining: Math.max(0, maxAttempts - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  function buildBlocked(bucket, at) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - at) / 1000));
    return {
      allowed: false,
      status: 429,
      limit: maxAttempts,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds,
      retryAfter: String(retryAfterSeconds),
    };
  }

  function check(key) {
    const normalizedKey = String(key || '').trim() || '__anonymous__';
    const at = readNow();
    prune(at);

    let bucket = buckets.get(normalizedKey);
    if (!bucket) {
      bucket = {
        count: 0,
        resetAt: at + windowLengthMs,
      };
      buckets.set(normalizedKey, bucket);
    }

    if (bucket.count >= maxAttempts) return buildBlocked(bucket, at);

    bucket.count += 1;
    return buildAllowed(bucket);
  }

  function reset(key = null) {
    if (key == null) {
      buckets.clear();
      return;
    }
    buckets.delete(String(key || '').trim() || '__anonymous__');
  }

  return {
    check,
    prune,
    reset,
    size: () => buckets.size,
  };
}
