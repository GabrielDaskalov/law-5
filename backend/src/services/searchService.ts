/**
 * Search Service - Full-text search across learning materials
 * Supports searching flashcards, cases, conspects, and lectures
 */

import { db } from '../db';

export interface SearchResult {
  id: string;
  type: 'flashcard' | 'case' | 'conspect' | 'lecture';
  title: string;
  snippet: string;
  subject_id: string;
  relevance_score: number;
  created_at: Date;
}

export class SearchService {
  /**
   * Global search across all content types
   * Searches: flashcard questions, case titles/facts, conspect titles/content, lecture titles
   */
  static async globalSearch(query: string, limit: number = 20, offset: number = 0): Promise<SearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    // Sanitize search query
    const searchQuery = query.trim().toLowerCase();
    const searchPattern = `%${searchQuery}%`;

    // Search flashcards
    const flashcards = await db.manyOrNone(
      `SELECT
        id, 'flashcard'::text as type, question as title, answer as snippet, subject_id,
        CASE
          WHEN LOWER(question) LIKE $1 THEN 3
          WHEN LOWER(answer) LIKE $1 THEN 2
          ELSE 1
        END as relevance_score,
        created_at
       FROM flashcards
       WHERE LOWER(question) LIKE $1 OR LOWER(answer) LIKE $1`,
      [searchPattern]
    );

    // Search cases
    const cases = await db.manyOrNone(
      `SELECT
        id, 'case'::text as type, title,
        LEFT(facts, 100) || '...' as snippet,
        subject_id,
        CASE
          WHEN LOWER(title) LIKE $1 THEN 4
          WHEN LOWER(facts) LIKE $1 THEN 3
          WHEN LOWER(legal_question) LIKE $1 THEN 2
          ELSE 1
        END as relevance_score,
        created_at
       FROM cases
       WHERE LOWER(title) LIKE $1 OR LOWER(facts) LIKE $1 OR LOWER(legal_question) LIKE $1`,
      [searchPattern]
    );

    // Search conspects
    const conspects = await db.manyOrNone(
      `SELECT
        id, 'conspect'::text as type, title,
        LEFT(content, 100) || '...' as snippet,
        subject_id,
        CASE
          WHEN LOWER(title) LIKE $1 THEN 3
          WHEN LOWER(content) LIKE $1 THEN 2
          ELSE 1
        END as relevance_score,
        created_at
       FROM conspects
       WHERE LOWER(title) LIKE $1 OR LOWER(content) LIKE $1`,
      [searchPattern]
    );

    // Search lectures
    const lectures = await db.manyOrNone(
      `SELECT
        id, 'lecture'::text as type, title,
        LEFT(COALESCE(description, ''), 100) || '...' as snippet,
        subject_id,
        CASE
          WHEN LOWER(title) LIKE $1 THEN 3
          WHEN LOWER(description) LIKE $1 THEN 2
          ELSE 1
        END as relevance_score,
        created_at
       FROM lectures
       WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1`,
      [searchPattern]
    );

    // Combine and sort by relevance
    const results = [...flashcards, ...cases, ...conspects, ...lectures] as SearchResult[];
    results.sort((a, b) => {
      if (b.relevance_score !== a.relevance_score) {
        return b.relevance_score - a.relevance_score;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return results.slice(offset, offset + limit);
  }

  /**
   * Search flashcards by question or answer
   */
  static async searchFlashcards(
    query: string,
    subjectId?: string,
    difficulty?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query.toLowerCase()}%`;
    let sqlQuery = `
      SELECT id, subject_id, question, answer, difficulty, created_at
      FROM flashcards
      WHERE LOWER(question) LIKE $1 OR LOWER(answer) LIKE $1
    `;

    const params: any[] = [searchPattern];

    if (subjectId) {
      sqlQuery += ` AND subject_id = $${params.length + 1}`;
      params.push(subjectId);
    }

    if (difficulty) {
      sqlQuery += ` AND difficulty = $${params.length + 1}`;
      params.push(difficulty);
    }

    sqlQuery += ` ORDER BY
      CASE
        WHEN LOWER(question) LIKE $1 THEN 0
        ELSE 1
      END ASC,
      created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    return await db.manyOrNone(sqlQuery, params);
  }

  /**
   * Search cases by title, facts, or legal question
   */
  static async searchCases(
    query: string,
    subjectId?: string,
    court?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query.toLowerCase()}%`;
    let sqlQuery = `
      SELECT id, subject_id, title, facts, legal_question, decision, court, year, created_at
      FROM cases
      WHERE LOWER(title) LIKE $1 OR LOWER(facts) LIKE $1 OR LOWER(legal_question) LIKE $1
    `;

    const params: any[] = [searchPattern];

    if (subjectId) {
      sqlQuery += ` AND subject_id = $${params.length + 1}`;
      params.push(subjectId);
    }

    if (court) {
      sqlQuery += ` AND LOWER(court) LIKE $${params.length + 1}`;
      params.push(`%${court.toLowerCase()}%`);
    }

    sqlQuery += ` ORDER BY
      CASE
        WHEN LOWER(title) LIKE $1 THEN 0
        WHEN LOWER(facts) LIKE $1 THEN 1
        ELSE 2
      END ASC,
      year DESC,
      created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    return await db.manyOrNone(sqlQuery, params);
  }

  /**
   * Search conspects by title or content
   */
  static async searchConspects(
    query: string,
    subjectId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query.toLowerCase()}%`;
    let sqlQuery = `
      SELECT id, subject_id, title, LEFT(content, 200) as preview, created_at
      FROM conspects
      WHERE LOWER(title) LIKE $1 OR LOWER(content) LIKE $1
    `;

    const params: any[] = [searchPattern];

    if (subjectId) {
      sqlQuery += ` AND subject_id = $${params.length + 1}`;
      params.push(subjectId);
    }

    sqlQuery += ` ORDER BY
      CASE
        WHEN LOWER(title) LIKE $1 THEN 0
        ELSE 1
      END ASC,
      created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    return await db.manyOrNone(sqlQuery, params);
  }

  /**
   * Search lectures by title or description
   */
  static async searchLectures(
    query: string,
    subjectId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query.toLowerCase()}%`;
    let sqlQuery = `
      SELECT id, subject_id, title, description, duration, created_at
      FROM lectures
      WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1
    `;

    const params: any[] = [searchPattern];

    if (subjectId) {
      sqlQuery += ` AND subject_id = $${params.length + 1}`;
      params.push(subjectId);
    }

    sqlQuery += ` ORDER BY
      CASE
        WHEN LOWER(title) LIKE $1 THEN 0
        ELSE 1
      END ASC,
      created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    return await db.manyOrNone(sqlQuery, params);
  }

  /**
   * Get search suggestions based on partial query
   * Returns top suggestions for autocomplete
   */
  static async getSearchSuggestions(query: string, limit: number = 10): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `${query.toLowerCase()}%`;

    // Get popular search terms from flashcard questions
    const suggestions = await db.manyOrNone(
      `
      SELECT DISTINCT LOWER(SUBSTRING(question, 1, 50)) as suggestion
      FROM flashcards
      WHERE LOWER(question) LIKE $1
      LIMIT $2
      `,
      [searchPattern, limit]
    );

    return suggestions.map((s: any) => s.suggestion);
  }

  /**
   * Search with filters - comprehensive search with multiple filters
   */
  static async advancedSearch(filters: {
    query?: string;
    type?: 'flashcard' | 'case' | 'conspect' | 'lecture' | 'all';
    subject_id?: string;
    difficulty?: string;
    court?: string;
    year_from?: number;
    year_to?: number;
    limit?: number;
    offset?: number;
  }): Promise<SearchResult[]> {
    const {
      query = '',
      type = 'all',
      subject_id,
      difficulty,
      court,
      year_from,
      year_to,
      limit = 20,
      offset = 0,
    } = filters;

    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query.toLowerCase()}%`;
    const results: SearchResult[] = [];

    // Search flashcards
    if (type === 'all' || type === 'flashcard') {
      const flashcards = await this.searchFlashcards(query, subject_id, difficulty, limit, offset);
      results.push(
        ...flashcards.map((fc: any) => ({
          id: fc.id,
          type: 'flashcard' as const,
          title: fc.question,
          snippet: fc.answer.substring(0, 100),
          subject_id: fc.subject_id,
          relevance_score: 1,
          created_at: fc.created_at,
        }))
      );
    }

    // Search cases
    if (type === 'all' || type === 'case') {
      let caseQuery = `
        SELECT id, subject_id, title, facts, created_at
        FROM cases
        WHERE LOWER(title) LIKE $1 OR LOWER(facts) LIKE $1 OR LOWER(legal_question) LIKE $1
      `;

      const params: any[] = [searchPattern];

      if (subject_id) {
        caseQuery += ` AND subject_id = $${params.length + 1}`;
        params.push(subject_id);
      }

      if (court) {
        caseQuery += ` AND LOWER(court) LIKE $${params.length + 1}`;
        params.push(`%${court.toLowerCase()}%`);
      }

      if (year_from) {
        caseQuery += ` AND year >= $${params.length + 1}`;
        params.push(year_from);
      }

      if (year_to) {
        caseQuery += ` AND year <= $${params.length + 1}`;
        params.push(year_to);
      }

      caseQuery += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const cases = await db.manyOrNone(caseQuery, params);

      results.push(
        ...cases.map((c: any) => ({
          id: c.id,
          type: 'case' as const,
          title: c.title,
          snippet: c.facts.substring(0, 100),
          subject_id: c.subject_id,
          relevance_score: 1,
          created_at: c.created_at,
        }))
      );
    }

    // Search conspects
    if (type === 'all' || type === 'conspect') {
      const conspects = await this.searchConspects(query, subject_id, limit, offset);
      results.push(
        ...conspects.map((c: any) => ({
          id: c.id,
          type: 'conspect' as const,
          title: c.title,
          snippet: c.preview,
          subject_id: c.subject_id,
          relevance_score: 1,
          created_at: c.created_at,
        }))
      );
    }

    // Search lectures
    if (type === 'all' || type === 'lecture') {
      const lectures = await this.searchLectures(query, subject_id, limit, offset);
      results.push(
        ...lectures.map((l: any) => ({
          id: l.id,
          type: 'lecture' as const,
          title: l.title,
          snippet: l.description?.substring(0, 100) || '',
          subject_id: l.subject_id,
          relevance_score: 1,
          created_at: l.created_at,
        }))
      );
    }

    return results.slice(0, limit);
  }
}
