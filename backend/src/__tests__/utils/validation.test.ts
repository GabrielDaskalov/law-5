/**
 * Validation Utility Tests
 */

import { InputValidator } from '../../utils/validation';
import { ValidationError } from '../../types';

describe('InputValidator', () => {
  describe('validateEmail', () => {
    it('should accept valid email', () => {
      expect(() => InputValidator.validateEmail('test@example.com')).not.toThrow();
    });

    it('should reject invalid email format', () => {
      expect(() => InputValidator.validateEmail('invalid-email')).toThrow(ValidationError);
    });

    it('should reject email longer than 255 chars', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(() => InputValidator.validateEmail(longEmail)).toThrow(ValidationError);
    });

    it('should reject empty email', () => {
      expect(() => InputValidator.validateEmail('')).toThrow(ValidationError);
    });
  });

  describe('validatePassword', () => {
    it('should accept strong password', () => {
      expect(() => InputValidator.validatePassword('Password123')).not.toThrow();
    });

    it('should reject password shorter than 8 chars', () => {
      expect(() => InputValidator.validatePassword('Pass1')).toThrow(ValidationError);
    });

    it('should reject password without letters', () => {
      expect(() => InputValidator.validatePassword('12345678')).toThrow(ValidationError);
    });

    it('should reject password without numbers', () => {
      expect(() => InputValidator.validatePassword('Password')).toThrow(ValidationError);
    });
  });

  describe('validateName', () => {
    it('should accept valid name', () => {
      expect(() => InputValidator.validateName('John Doe')).not.toThrow();
    });

    it('should reject name shorter than 2 chars', () => {
      expect(() => InputValidator.validateName('J')).toThrow(ValidationError);
    });

    it('should reject name longer than 100 chars', () => {
      const longName = 'a'.repeat(101);
      expect(() => InputValidator.validateName(longName)).toThrow(ValidationError);
    });
  });

  describe('validateUUID', () => {
    it('should accept valid UUID', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      expect(() => InputValidator.validateUUID(validUUID, 'id')).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      expect(() => InputValidator.validateUUID('not-a-uuid', 'id')).toThrow(ValidationError);
    });

    it('should reject empty string', () => {
      expect(() => InputValidator.validateUUID('', 'id')).toThrow(ValidationError);
    });
  });

  describe('validateString', () => {
    it('should accept string within bounds', () => {
      expect(() => InputValidator.validateString('hello', 'text', 1, 10)).not.toThrow();
    });

    it('should reject string too short', () => {
      expect(() => InputValidator.validateString('hi', 'text', 5, 10)).toThrow(ValidationError);
    });

    it('should reject string too long', () => {
      expect(() => InputValidator.validateString('hello world', 'text', 1, 5)).toThrow(ValidationError);
    });
  });

  describe('validateNumber', () => {
    it('should accept number within range', () => {
      expect(() => InputValidator.validateNumber(50, 'age', 0, 100)).not.toThrow();
    });

    it('should reject number below minimum', () => {
      expect(() => InputValidator.validateNumber(-5, 'age', 0, 100)).toThrow(ValidationError);
    });

    it('should reject number above maximum', () => {
      expect(() => InputValidator.validateNumber(150, 'age', 0, 100)).toThrow(ValidationError);
    });
  });

  describe('validateEnum', () => {
    it('should accept valid enum value', () => {
      expect(() =>
        InputValidator.validateEnum('easy', ['easy', 'medium', 'hard'], 'difficulty')
      ).not.toThrow();
    });

    it('should reject invalid enum value', () => {
      expect(() =>
        InputValidator.validateEnum('invalid', ['easy', 'medium', 'hard'], 'difficulty')
      ).toThrow(ValidationError);
    });
  });

  describe('validateArray', () => {
    it('should accept non-empty array', () => {
      expect(() =>
        InputValidator.validateArray([1, 2, 3], 'items', 1)
      ).not.toThrow();
    });

    it('should reject empty array when min is 1', () => {
      expect(() =>
        InputValidator.validateArray([], 'items', 1)
      ).toThrow(ValidationError);
    });

    it('should accept empty array when min is 0', () => {
      expect(() =>
        InputValidator.validateArray([], 'items', 0)
      ).not.toThrow();
    });
  });

  describe('validateDate', () => {
    it('should accept valid date string', () => {
      const validDate = new Date().toISOString();
      expect(() => InputValidator.validateDate(validDate, 'date')).not.toThrow();
    });

    it('should reject invalid date string', () => {
      expect(() => InputValidator.validateDate('not-a-date', 'date')).toThrow(ValidationError);
    });
  });

  describe('validateFutureDate', () => {
    it('should accept future date', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // 1 day from now
      expect(() => InputValidator.validateFutureDate(futureDate, 'date')).not.toThrow();
    });

    it('should reject past date', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
      expect(() => InputValidator.validateFutureDate(pastDate, 'date')).toThrow(ValidationError);
    });
  });

  describe('validatePagination', () => {
    it('should accept valid pagination', () => {
      expect(() => InputValidator.validatePagination(20, 0)).not.toThrow();
    });

    it('should reject limit over 100', () => {
      expect(() => InputValidator.validatePagination(150, 0)).toThrow(ValidationError);
    });

    it('should reject negative offset', () => {
      expect(() => InputValidator.validatePagination(20, -1)).toThrow(ValidationError);
    });
  });
});
