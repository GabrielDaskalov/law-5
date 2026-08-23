/**
 * Tests for Cache Service
 */

import { CacheService } from '../../services/cacheService';
import { v4 as uuidv4 } from 'uuid';

describe('CacheService', () => {
  beforeEach(() => {
    CacheService.clear();
  });

  describe('Basic Cache Operations', () => {
    it('should set and get cache values', () => {
      const key = 'test:key';
      const value = { data: 'test' };

      CacheService.set(key, value, 300);
      const retrieved = CacheService.get<typeof value>(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', () => {
      const retrieved = CacheService.get('non:existent');
      expect(retrieved).toBeNull();
    });

    it('should check if key exists', () => {
      const key = 'test:key';
      CacheService.set(key, { data: 'test' }, 300);

      expect(CacheService.has(key)).toBe(true);
      expect(CacheService.has('non:existent')).toBe(false);
    });

    it('should delete cache entries', () => {
      const key = 'test:key';
      CacheService.set(key, { data: 'test' }, 300);

      expect(CacheService.has(key)).toBe(true);
      CacheService.delete(key);
      expect(CacheService.has(key)).toBe(false);
    });

    it('should clear all cache', () => {
      CacheService.set('key1', { data: 1 }, 300);
      CacheService.set('key2', { data: 2 }, 300);

      const stats = CacheService.getStats();
      expect(stats.size).toBeGreaterThan(0);

      CacheService.clear();
      expect(CacheService.getStats().size).toBe(0);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', (done) => {
      const key = 'expiring:key';
      const value = { data: 'test' };

      CacheService.set(key, value, 1); // 1 second TTL
      expect(CacheService.has(key)).toBe(true);

      setTimeout(() => {
        expect(CacheService.has(key)).toBe(false);
        done();
      }, 1100);
    });

    it('should use different TTLs for different entries', () => {
      const key1 = 'short:ttl';
      const key2 = 'long:ttl';

      CacheService.set(key1, { data: 1 }, 1);
      CacheService.set(key2, { data: 2 }, 300);

      expect(CacheService.has(key1)).toBe(true);
      expect(CacheService.has(key2)).toBe(true);
    });

    it('should use default TTL when not specified', () => {
      const key = 'default:ttl';
      CacheService.set(key, { data: 'test' }); // Uses DEFAULT_TTL

      expect(CacheService.has(key)).toBe(true);
    });
  });

  describe('Pattern Matching', () => {
    it('should delete cache entries by pattern', () => {
      CacheService.set('analytics:user:123', { data: 1 }, 300);
      CacheService.set('analytics:user:456', { data: 2 }, 300);
      CacheService.set('search:query:test', { data: 3 }, 300);

      const deleted = CacheService.deletePattern('analytics:user:.*');

      expect(deleted).toBe(2);
      expect(CacheService.has('analytics:user:123')).toBe(false);
      expect(CacheService.has('search:query:test')).toBe(true);
    });

    it('should invalidate user caches by pattern', () => {
      const userId = uuidv4();
      CacheService.set(`analytics:user:${userId}`, { data: 1 }, 300);
      CacheService.set(`progress:user:${userId}`, { data: 2 }, 300);
      CacheService.set(`analytics:subject:123`, { data: 3 }, 300);

      const deleted = CacheService.invalidateUserCaches(userId);

      expect(deleted).toBe(2);
      expect(CacheService.has(`analytics:subject:123`)).toBe(true);
    });

    it('should invalidate subject caches', () => {
      const subjectId = uuidv4();
      CacheService.set(`analytics:subject:${subjectId}`, { data: 1 }, 300);
      CacheService.set(`content:subject:${subjectId}`, { data: 2 }, 300);
      CacheService.set(`analytics:user:123`, { data: 3 }, 300);

      const deleted = CacheService.invalidateSubjectCaches(subjectId);

      expect(deleted).toBe(2);
      expect(CacheService.has(`analytics:user:123`)).toBe(true);
    });

    it('should invalidate all analytics caches', () => {
      CacheService.set('analytics:user:123', { data: 1 }, 300);
      CacheService.set('analytics:platform', { data: 2 }, 300);
      CacheService.set('analytics:subject:456', { data: 3 }, 300);
      CacheService.set('search:query:test', { data: 4 }, 300);

      const deleted = CacheService.invalidateAnalytics();

      expect(deleted).toBe(3);
      expect(CacheService.has('search:query:test')).toBe(true);
    });
  });

  describe('Get or Set', () => {
    it('should return cached value if exists', async () => {
      const key = 'test:key';
      const cachedValue = { data: 'cached' };

      CacheService.set(key, cachedValue, 300);

      const fn = jest.fn(async () => ({ data: 'new' }));
      const result = await CacheService.getOrSet(key, fn, 300);

      expect(result).toEqual(cachedValue);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should execute function and cache result on cache miss', async () => {
      const key = 'test:key';
      const newValue = { data: 'new' };

      const fn = jest.fn(async () => newValue);
      const result = await CacheService.getOrSet(key, fn, 300);

      expect(result).toEqual(newValue);
      expect(fn).toHaveBeenCalled();
      expect(CacheService.has(key)).toBe(true);
    });
  });

  describe('Cache Statistics', () => {
    it('should return cache statistics', () => {
      CacheService.set('key1', { data: 1 }, 300);
      CacheService.set('key2', { data: 2 }, 300);
      CacheService.set('key3', { data: 3 }, 300);

      const stats = CacheService.getStats();

      expect(stats.size).toBe(3);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
      expect(stats.keys).toContain('key3');
    });

    it('should remove expired entries from statistics', (done) => {
      CacheService.set('expiring', { data: 1 }, 1);
      CacheService.set('persistent', { data: 2 }, 300);

      setTimeout(() => {
        const stats = CacheService.getStats();
        expect(stats.keys).not.toContain('expiring');
        expect(stats.keys).toContain('persistent');
        done();
      }, 1100);
    });
  });

  describe('Cache Key Management', () => {
    it('should generate analytics cache keys', () => {
      const userId = uuidv4();
      const key = CacheService.keys.userAnalytics(userId);

      expect(key).toContain('analytics:user:');
      expect(key).toContain(userId);
    });

    it('should generate platform analytics key', () => {
      const key = CacheService.keys.platformAnalytics();
      expect(key).toBe('analytics:platform');
    });

    it('should generate report cache keys', () => {
      const userId = uuidv4();
      const key = CacheService.keys.userReport(userId);

      expect(key).toContain('report:user:');
      expect(key).toContain(userId);
    });

    it('should generate search cache keys', () => {
      const key = CacheService.keys.searchResults('query', 'flashcard');
      expect(key).toContain('search:flashcard:');
    });
  });

  describe('TTL Constants', () => {
    it('should have appropriate TTL values', () => {
      expect(CacheService.DEFAULT_TTL).toBe(300);
      expect(CacheService.ANALYTICS_TTL).toBe(600);
      expect(CacheService.REPORT_TTL).toBe(900);
      expect(CacheService.SEARCH_TTL).toBe(180);
    });
  });
});
