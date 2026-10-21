'use strict';

/**
 * Unit tests for src/federationCache.js.
 */

jest.mock('../src/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

const { logger } = require('../src/logger');
const {
  buildFederationCacheKey,
  getCachedFederationResult,
  invalidateFederationCache,
  FEDERATION_CACHE_PREFIX,
  FEDERATION_CACHE_TTL,
} = require('../src/federationCache');

describe('buildFederationCacheKey', () => {
  it('prefixes and lowercases the value', () => {
    expect(buildFederationCacheKey('id', 'GABC')).toBe('federation:id:gabc');
    expect(buildFederationCacheKey('name', 'Alice*')).toBe('federation:name:alice*');
  });
});

describe('getCachedFederationResult', () => {
  const fetchFn = jest.fn().mockResolvedValue({ address: 'G123' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a cached JSON result when the client is ready', async () => {
    const redis = {
      isReady: true,
      get: jest.fn().mockResolvedValue(JSON.stringify({ address: 'G123' })),
      setEx: jest.fn().mockResolvedValue('OK'),
    };

    const result = await getCachedFederationResult(redis, 'key', fetchFn);

    expect(result).toEqual({ address: 'G123' });
    expect(redis.get).toHaveBeenCalledWith('key');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches and caches on a miss', async () => {
    const redis = {
      isReady: true,
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK'),
    };

    const result = await getCachedFederationResult(redis, 'key', fetchFn);

    expect(result).toEqual({ address: 'G123' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(redis.setEx).toHaveBeenCalledWith('key', FEDERATION_CACHE_TTL, JSON.stringify({ address: 'G123' }));
  });

  it('falls through to fetchFn when Redis is unavailable', async () => {
    const result = await getCachedFederationResult(null, 'key', fetchFn);
    expect(result).toEqual({ address: 'G123' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not cache null results', async () => {
    const redis = { isReady: true, get: jest.fn().mockResolvedValue(null), setEx: jest.fn() };
    const nullFn = jest.fn().mockResolvedValue(null);
    const result = await getCachedFederationResult(redis, 'key', nullFn);
    expect(result).toBeNull();
    expect(redis.setEx).not.toHaveBeenCalled();
  });

  it('logs and falls through when the Redis read throws', async () => {
    const redis = {
      isReady: true,
      get: jest.fn().mockRejectedValue(new Error('connection reset')),
      setEx: jest.fn().mockResolvedValue('OK'),
    };

    const result = await getCachedFederationResult(redis, 'key', fetchFn);

    expect(result).toEqual({ address: 'G123' });
    expect(logger.error).toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('logs a write failure without rejecting the caller', async () => {
    const redis = {
      isReady: true,
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockRejectedValue(new Error('write failed')),
    };

    const result = await getCachedFederationResult(redis, 'key', fetchFn);

    expect(result).toEqual({ address: 'G123' });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('invalidateFederationCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes keys for address and username when the client is ready', async () => {
    const redis = { isReady: true, del: jest.fn().mockResolvedValue(2) };
    await invalidateFederationCache(redis, 'GABC', 'Alice');
    expect(redis.del).toHaveBeenCalledWith(['federation:id:gabc', 'federation:name:alice']);
  });

  it('only deletes the provided key parts', async () => {
    const redis = { isReady: true, del: jest.fn().mockResolvedValue(1) };
    await invalidateFederationCache(redis, 'GABC');
    expect(redis.del).toHaveBeenCalledWith(['federation:id:gabc']);
  });

  it('is a no-op when the client is not ready or missing', async () => {
    await invalidateFederationCache(null, 'GABC', 'Alice');
    await invalidateFederationCache({ isReady: false, del: jest.fn() }, 'GABC', 'Alice');
  });

  it('logs and swallows deletion errors', async () => {
    const redis = {
      isReady: true,
      del: jest.fn().mockRejectedValue(new Error('gone')),
    };
    await invalidateFederationCache(redis, 'GABC', 'Alice');
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('constants', () => {
  it('exposes the cache prefix', () => {
    expect(FEDERATION_CACHE_PREFIX).toBe('federation');
  });
});
describe('federation cache invalidation on deregistration (src/cache.js)', () => {
  const {
    cache,
    federationNameKey,
    federationLookupCached,
    invalidateFederationCache: invalidateLocalFederationCache,
  } = require('../src/cache');

  afterEach(() => cache.flushAll());

  it('serves from the DB, not the cache, after a username is deregistered', async () => {
    const db = { 'alice': { stellar_address: 'alice*localhost', account_id: 'GALICE' } };
    const fetchFn = jest.fn(async () => db.alice || null);
    const key = federationNameKey('alice');

    // Create + cache
    expect(await federationLookupCached(key, fetchFn)).toEqual(db.alice);
    expect(await federationLookupCached(key, fetchFn)).toEqual(db.alice);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Deregister
    delete db.alice;
    invalidateLocalFederationCache('alice', 'GALICE');

    // Re-query hits the DB and sees the deregistration
    expect(await federationLookupCached(key, fetchFn)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('still serves fresh registrations from cache within the TTL', async () => {
    const db = { 'bob': { stellar_address: 'bob*localhost', account_id: 'GBOB' } };
    const fetchFn = jest.fn(async () => db.bob || null);
    const key = federationNameKey('bob');

    expect(await federationLookupCached(key, fetchFn)).toEqual(db.bob);
    expect(await federationLookupCached(key, fetchFn)).toEqual(db.bob);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to TTL eviction when the explicit delete fails', async () => {
    const db = { 'carol': { stellar_address: 'carol*localhost', account_id: 'GCAROL' } };
    const fetchFn = jest.fn(async () => db.carol || null);
    const key = federationNameKey('carol');

    expect(await federationLookupCached(key, fetchFn)).toEqual(db.carol);
    expect(await federationLookupCached(key, fetchFn)).toEqual(db.carol);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Simulate a failed explicit invalidation: the entry stays cached.
    const delSpy = jest.spyOn(cache, 'del').mockImplementation(() => {
      throw new Error('delete failed');
    });
    try {
      invalidateLocalFederationCache('carol', 'GCAROL');
    } catch (err) {
      // swallow: caller may propagate, but cache must remain consistent
    }
    delSpy.mockRestore();

    // Stale value is still served until TTL eviction.
    expect(await federationLookupCached(key, fetchFn)).toEqual(db.carol);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Once the TTL elapses, the entry is evicted and the DB is consulted again.
    const ttl = cache.getTtl(key);
    expect(typeof ttl).toBe('number');
    jest.spyOn(Date, 'now').mockReturnValue(ttl + 1);
    try {
      delete db.carol;
      expect(await federationLookupCached(key, fetchFn)).toBeNull();
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      Date.now.mockRestore();
    }
  });
});

describe('GET /federation after unregistration', () => {
  const {
    cache,
    federationNameKey,
    federationLookupCached,
    invalidateFederationCache: invalidateLocalFederationCache,
  } = require('../src/cache');

  afterEach(() => cache.flushAll());

  /**
   * Minimal stand-in for the federation route handler: resolves a
   * `name*domain` query against the DB through the cache and maps a miss
   * to a 404 response.
   */
  async function handleFederationGet(query, db) {
    const name = query.replace(/\*.*$/, '').toLowerCase();
    const key = federationNameKey(name);
    const result = await federationLookupCached(key, async () => db[name] || null);
    if (!result) {
      return { status: 404, body: { error: 'not found' } };
    }
    return { status: 200, body: result };
  }

  it('returns 404 immediately after unregistration (no stale cache hit)', async () => {
    const db = { 'alice': { stellar_address: 'alice*localhost', account_id: 'GALICE' } };

    // Register + warm the cache.
    const first = await handleFederationGet('alice*localhost', db);
    expect(first.status).toBe(200);
    expect(first.body).toEqual(db.alice);
    const second = await handleFederationGet('alice*localhost', db);
    expect(second.status).toBe(200);

    // Unregister and invalidate.
    delete db.alice;
    invalidateLocalFederationCache('alice', 'GALICE');

    // Immediately after unregistration the endpoint must miss the cache.
    const after = await handleFederationGet('alice*localhost', db);
    expect(after.status).toBe(404);
  });
});
