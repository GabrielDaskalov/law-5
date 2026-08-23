/**
 * Cache Service - In-memory caching with TTL
 * Optimizes frequently accessed data (analytics, reports, search results)
 * Can be extended to use Redis for distributed caching
 */

export interface CacheEntry<T> {
  value: T;
  expiry: number;
}

export class CacheService {
  private static cache = new Map<string, CacheEntry<any>>();

  /**
   * Default TTL in seconds
   */
  static readonly DEFAULT_TTL = 300; // 5 minutes
  static readonly ANALYTICS_TTL = 600; // 10 minutes
  static readonly REPORT_TTL = 900; // 15 minutes
  static readonly SEARCH_TTL = 180; // 3 minutes

  /**
   * Get value from cache
   */
  static get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set value in cache with TTL
   */
  static set<T>(key: string, value: T, ttl: number = this.DEFAULT_TTL): void {
    const expiry = Date.now() + ttl * 1000;

    this.cache.set(key, { value, expiry });
  }

  /**
   * Check if key exists and is valid
   */
  static has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete cache entry
   */
  static delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Delete multiple cache entries by pattern
   */
  static deletePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all cache
   */
  static clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  static getStats(): { size: number; keys: string[] } {
    // Remove expired entries
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }

    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Get or set - execute function if cache miss
   */
  static async getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    this.set(key, result, ttl);

    return result;
  }

  /**
   * Cache keys for different entities
   */
  static keys = {
    // Analytics
    userAnalytics: (userId: string) => `analytics:user:${userId}`,
    platformAnalytics: () => 'analytics:platform',
    subjectAnalytics: (subjectId: string) => `analytics:subject:${subjectId}`,
    userTrends: (userId: string, days: number) => `analytics:trends:${userId}:${days}`,
    recommendations: (userId: string) => `analytics:recommendations:${userId}`,

    // Reports
    userReport: (userId: string) => `report:user:${userId}`,
    subjectReport: (subjectId: string) => `report:subject:${subjectId}`,
    cohortReport: () => 'report:cohort',

    // Search
    searchResults: (query: string, type?: string) => `search:${type || 'global'}:${query}`,
    searchSuggestions: (query: string) => `search:suggestions:${query}`,

    // Progress
    userProgress: (userId: string) => `progress:user:${userId}`,
    studyPlan: (userId: string) => `studyplan:${userId}`,
    todayFocus: (userId: string) => `studyplan:today:${userId}`,

    // Content
    flashcard: (id: string) => `content:flashcard:${id}`,
    quiz: (id: string) => `content:quiz:${id}`,
    subject: (id: string) => `content:subject:${id}`,
  };

  /**
   * Invalidate all caches related to a user
   */
  static invalidateUserCaches(userId: string): number {
    return this.deletePattern(`.*:${userId}.*`);
  }

  /**
   * Invalidate all caches related to a subject
   */
  static invalidateSubjectCaches(subjectId: string): number {
    return this.deletePattern(`.*:${subjectId}.*`);
  }

  /**
   * Invalidate analytics caches
   */
  static invalidateAnalytics(): number {
    return this.deletePattern('analytics:.*');
  }

  /**
   * Invalidate report caches
   */
  static invalidateReports(): number {
    return this.deletePattern('report:.*');
  }

  /**
   * Invalidate search caches
   */
  static invalidateSearch(): number {
    return this.deletePattern('search:.*');
  }
}
