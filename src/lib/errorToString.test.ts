import { describe, expect, it } from 'vitest';
import { errorToString } from './errorToString';

describe('errorToString', () => {
  describe('Error instances', () => {
    it('returns message from Error instance', () => {
      const error = new Error('Something went wrong');
      expect(errorToString(error)).toBe('Something went wrong');
    });

    it('returns message from TypeError', () => {
      const error = new TypeError('Invalid type');
      expect(errorToString(error)).toBe('Invalid type');
    });

    it('returns message from custom Error subclass', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('Custom error message');
      expect(errorToString(error)).toBe('Custom error message');
    });

    it('returns empty string for Error with empty message', () => {
      const error = new Error('');
      expect(errorToString(error)).toBe('');
    });
  });

  describe('non-Error values', () => {
    it('converts string to string', () => {
      expect(errorToString('simple string error')).toBe('simple string error');
    });

    it('converts number to string', () => {
      expect(errorToString(404)).toBe('404');
      expect(errorToString(-1)).toBe('-1');
      expect(errorToString(0)).toBe('0');
    });

    it('converts boolean to string', () => {
      expect(errorToString(true)).toBe('true');
      expect(errorToString(false)).toBe('false');
    });

    it('converts null to string', () => {
      expect(errorToString(null)).toBe('null');
    });

    it('converts undefined to string', () => {
      expect(errorToString(undefined)).toBe('undefined');
    });

    it('converts object to string representation', () => {
      const obj = { code: 'ERROR', details: 'info' };
      expect(errorToString(obj)).toBe('[object Object]');
    });

    it('converts array to string', () => {
      expect(errorToString(['a', 'b', 'c'])).toBe('a,b,c');
    });

    it('converts symbol to string', () => {
      const sym = Symbol('test');
      expect(errorToString(sym)).toBe('Symbol(test)');
    });
  });
});
