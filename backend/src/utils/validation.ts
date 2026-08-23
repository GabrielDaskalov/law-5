/**
 * Input Validation Utilities
 * Provides reusable validation functions for common fields
 */

import { ValidationError } from '../types';
import validator from 'validator';

export class InputValidator {
  /**
   * Validate email
   */
  static validateEmail(email: string): void {
    if (!email) {
      throw new ValidationError('Email is required');
    }

    if (!validator.isEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    if (email.length > 255) {
      throw new ValidationError('Email is too long (max 255 characters)');
    }
  }

  /**
   * Validate password
   */
  static validatePassword(password: string): void {
    if (!password) {
      throw new ValidationError('Password is required');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    if (password.length > 255) {
      throw new ValidationError('Password is too long (max 255 characters)');
    }

    // Check for complexity (at least one letter and one number)
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new ValidationError('Password must contain at least one letter and one number');
    }
  }

  /**
   * Validate name
   */
  static validateName(name: string): void {
    if (!name) {
      throw new ValidationError('Name is required');
    }

    if (name.length < 2) {
      throw new ValidationError('Name must be at least 2 characters long');
    }

    if (name.length > 100) {
      throw new ValidationError('Name is too long (max 100 characters)');
    }
  }

  /**
   * Validate UUID
   */
  static validateUUID(id: string, fieldName: string = 'ID'): void {
    if (!id) {
      throw new ValidationError(`${fieldName} is required`);
    }

    if (!validator.isUUID(id)) {
      throw new ValidationError(`Invalid ${fieldName} format`);
    }
  }

  /**
   * Validate required string field
   */
  static validateString(value: string, fieldName: string, minLength: number = 1, maxLength: number = 500): void {
    if (!value) {
      throw new ValidationError(`${fieldName} is required`);
    }

    if (value.length < minLength) {
      throw new ValidationError(`${fieldName} must be at least ${minLength} characters long`);
    }

    if (value.length > maxLength) {
      throw new ValidationError(`${fieldName} is too long (max ${maxLength} characters)`);
    }
  }

  /**
   * Validate number field
   */
  static validateNumber(value: any, fieldName: string, min?: number, max?: number): number {
    const num = parseInt(value);

    if (isNaN(num)) {
      throw new ValidationError(`${fieldName} must be a valid number`);
    }

    if (min !== undefined && num < min) {
      throw new ValidationError(`${fieldName} must be at least ${min}`);
    }

    if (max !== undefined && num > max) {
      throw new ValidationError(`${fieldName} must be at most ${max}`);
    }

    return num;
  }

  /**
   * Validate URL
   */
  static validateURL(url: string, fieldName: string = 'URL'): void {
    if (!url) {
      throw new ValidationError(`${fieldName} is required`);
    }

    if (!validator.isURL(url)) {
      throw new ValidationError(`Invalid ${fieldName} format`);
    }
  }

  /**
   * Validate one of multiple values (enum)
   */
  static validateEnum(value: string, allowedValues: string[], fieldName: string): void {
    if (!value) {
      throw new ValidationError(`${fieldName} is required`);
    }

    if (!allowedValues.includes(value)) {
      throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
    }
  }

  /**
   * Validate array
   */
  static validateArray(value: any, fieldName: string, minLength: number = 1): any[] {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${fieldName} must be an array`);
    }

    if (value.length < minLength) {
      throw new ValidationError(`${fieldName} must contain at least ${minLength} item(s)`);
    }

    return value;
  }

  /**
   * Validate object
   */
  static validateObject(value: any, fieldName: string): object {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ValidationError(`${fieldName} must be an object`);
    }

    if (Object.keys(value).length === 0) {
      throw new ValidationError(`${fieldName} cannot be empty`);
    }

    return value;
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(limit?: string | number, offset?: string | number): { limit: number; offset: number } {
    let parsedLimit = 20;
    let parsedOffset = 0;

    if (limit) {
      parsedLimit = this.validateNumber(limit, 'limit', 1, 100);
    }

    if (offset) {
      parsedOffset = this.validateNumber(offset, 'offset', 0);
    }

    return { limit: parsedLimit, offset: parsedOffset };
  }

  /**
   * Validate date
   */
  static validateDate(date: string, fieldName: string = 'Date'): Date {
    if (!date) {
      throw new ValidationError(`${fieldName} is required`);
    }

    const parsed = new Date(date);

    if (isNaN(parsed.getTime())) {
      throw new ValidationError(`Invalid ${fieldName} format`);
    }

    return parsed;
  }

  /**
   * Validate future date
   */
  static validateFutureDate(date: string, fieldName: string = 'Date'): Date {
    const parsed = this.validateDate(date, fieldName);

    if (parsed < new Date()) {
      throw new ValidationError(`${fieldName} must be in the future`);
    }

    return parsed;
  }
}

/**
 * Middleware to validate incoming request data
 */
export function validateRequestBody(schema: any) {
  return (req: any, res: any, next: any) => {
    // Simple schema validation
    // This is a placeholder - in production use a library like Joi or Yup
    try {
      // Validate required fields
      for (const [field, rules] of Object.entries(schema)) {
        const value = req.body[field];
        const ruleObj = rules as any;

        if (ruleObj.required && !value) {
          throw new ValidationError(`${field} is required`);
        }

        if (ruleObj.type && typeof value !== ruleObj.type && value !== undefined) {
          throw new ValidationError(`${field} must be of type ${ruleObj.type}`);
        }

        if (ruleObj.minLength && value && value.length < ruleObj.minLength) {
          throw new ValidationError(`${field} must be at least ${ruleObj.minLength} characters`);
        }

        if (ruleObj.maxLength && value && value.length > ruleObj.maxLength) {
          throw new ValidationError(`${field} must be at most ${ruleObj.maxLength} characters`);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
