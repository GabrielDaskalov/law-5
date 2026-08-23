/**
 * Search Service Tests
 */

import { SearchService } from '../../services/searchService';
import { db } from '../../db';

// Mock database
jest.mock('../../db', () => ({
  db: {
    manyOrNone: jest.fn(),
    one: jest.fn(),
  },
}));

describe('SearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('globalSearch', () => {
    it('should return empty array for short query', async () => {
      const results = await SearchService.globalSearch('a', 20, 0);
      expect(results).toEqual([]);
    });

    it('should return search results', async () => {
      const mockResults = [
        {
          id: '123',
          type: 'flashcard',
          title: 'Question',
          snippet: 'Answer',
          subject_id: 'subj-123',
          relevance_score: 3,
          created_at: new Date(),
        },
      ];

      (db.manyOrNone as jest.Mock).mockResolvedValue(mockResults);

      const results = await SearchService.globalSearch('contract', 20, 0);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should sort by relevance score', async () => {
      const mockResults = [
        {
          id: '1',
          relevance_score: 1,
          created_at: new Date(),
        },
        {
          id: '2',
          relevance_score: 3,
          created_at: new Date(),
        },
        {
          id: '3',
          relevance_score: 2,
          created_at: new Date(),
        },
      ];

      (db.manyOrNone as jest.Mock).mockResolvedValue(mockResults);

      const results = await SearchService.globalSearch('test query', 20, 0);
      // Results should be sorted by relevance
      expect(results[0].relevance_score).toBeGreaterThanOrEqual(results[1].relevance_score);
    });
  });

  describe('searchFlashcards', () => {
    it('should return empty array for short query', async () => {
      const results = await SearchService.searchFlashcards('a', undefined, undefined, 20, 0);
      expect(results).toEqual([]);
    });

    it('should search with subject filter', async () => {
      const mockResults = [
        {
          id: '123',
          subject_id: 'subj-123',
          question: 'What is...',
          answer: 'It is...',
          difficulty: 'medium',
        },
      ];

      (db.manyOrNone as jest.Mock).mockResolvedValue(mockResults);

      const results = await SearchService.searchFlashcards(
        'contract',
        'subj-123',
        'medium',
        20,
        0
      );

      expect(results).toEqual(mockResults);
      expect(db.manyOrNone).toHaveBeenCalled();
    });
  });

  describe('searchCases', () => {
    it('should return empty array for short query', async () => {
      const results = await SearchService.searchCases('a', undefined, undefined, 20, 0);
      expect(results).toEqual([]);
    });

    it('should search with filters', async () => {
      const mockResults = [
        {
          id: '123',
          subject_id: 'subj-123',
          title: 'Case Title',
          facts: 'Facts...',
          court: 'Supreme Court',
          year: 2020,
        },
      ];

      (db.manyOrNone as jest.Mock).mockResolvedValue(mockResults);

      const results = await SearchService.searchCases(
        'liability',
        'subj-123',
        'Supreme Court',
        20,
        0
      );

      expect(results).toEqual(mockResults);
    });
  });

  describe('getSearchSuggestions', () => {
    it('should return empty array for short query', async () => {
      const suggestions = await SearchService.getSearchSuggestions('a', 10);
      expect(suggestions).toEqual([]);
    });

    it('should return suggestions', async () => {
      const mockSuggestions = [
        { suggestion: 'contract law' },
        { suggestion: 'contract formation' },
      ];

      (db.manyOrNone as jest.Mock).mockResolvedValue(mockSuggestions);

      const suggestions = await SearchService.getSearchSuggestions('contract', 10);

      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('advancedSearch', () => {
    it('should return empty array for no query', async () => {
      const results = await SearchService.advancedSearch({
        query: '',
        type: 'all',
        limit: 20,
        offset: 0,
      });

      expect(results).toEqual([]);
    });

    it('should handle different search types', async () => {
      (db.manyOrNone as jest.Mock).mockResolvedValue([]);

      const results = await SearchService.advancedSearch({
        query: 'test',
        type: 'flashcard',
        limit: 20,
        offset: 0,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should apply year filter for cases', async () => {
      (db.manyOrNone as jest.Mock).mockResolvedValue([]);

      const results = await SearchService.advancedSearch({
        query: 'liability',
        type: 'case',
        year_from: 2000,
        year_to: 2020,
        limit: 20,
        offset: 0,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(db.manyOrNone).toHaveBeenCalled();
    });
  });
});
