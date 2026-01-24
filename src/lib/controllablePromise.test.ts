import { describe, expect, it } from 'vitest';
import { createControllablePromise } from './controllablePromise';

describe('createControllablePromise', () => {
  describe('initial state', () => {
    it('creates promise in pending state', () => {
      const cp = createControllablePromise<string>();

      expect(cp.value.status).toBe('pending');
      expect(cp.promise).toBeInstanceOf(Promise);
      expect(typeof cp.resolve).toBe('function');
      expect(typeof cp.reject).toBe('function');
    });
  });

  describe('resolve', () => {
    it('resolves promise with value', async () => {
      const cp = createControllablePromise<string>();

      cp.resolve('success');
      const result = await cp.promise;

      expect(result).toBe('success');
    });

    it('updates value to fulfilled state', () => {
      const cp = createControllablePromise<number>();

      cp.resolve(42);

      expect(cp.value.status).toBe('fulfilled');
      if (cp.value.status === 'fulfilled') {
        expect(cp.value.value).toBe(42);
      }
    });

    it('handles complex object values', async () => {
      const cp = createControllablePromise<{ id: number; name: string }>();
      const obj = { id: 1, name: 'test' };

      cp.resolve(obj);
      const result = await cp.promise;

      expect(result).toEqual(obj);
    });
  });

  describe('reject', () => {
    it('rejects promise with reason', async () => {
      const cp = createControllablePromise<string>();
      const error = new Error('test error');

      cp.reject(error);

      await expect(cp.promise).rejects.toThrow('test error');
    });

    it('updates value to rejected state', async () => {
      const cp = createControllablePromise<string>();
      const reason = 'rejection reason';

      cp.reject(reason);

      // Catch the rejection to avoid unhandled rejection
      await expect(cp.promise).rejects.toBe(reason);

      expect(cp.value.status).toBe('rejected');
      if (cp.value.status === 'rejected') {
        expect(cp.value.reason).toBe(reason);
      }
    });

    it('handles undefined rejection reason', async () => {
      const cp = createControllablePromise<string>();

      cp.reject();

      // Catch the rejection to avoid unhandled rejection
      await expect(cp.promise).rejects.toBe(undefined);

      expect(cp.value.status).toBe('rejected');
      if (cp.value.status === 'rejected') {
        expect(cp.value.reason).toBe(undefined);
      }
    });
  });

  describe('async usage patterns', () => {
    it('can be awaited before resolution', async () => {
      const cp = createControllablePromise<string>();

      const resultPromise = cp.promise.then((v) => `got: ${v}`);

      // Resolve after setting up the await
      setTimeout(() => cp.resolve('delayed'), 0);

      const result = await resultPromise;
      expect(result).toBe('got: delayed');
    });

    it('maintains state after resolution', () => {
      const cp = createControllablePromise<string>();

      cp.resolve('first');
      expect(cp.value.status).toBe('fulfilled');

      // Note: calling resolve again doesn't change Promise behavior
      // but does update value (implementation detail)
      cp.resolve('second');
      if (cp.value.status === 'fulfilled') {
        expect(cp.value.value).toBe('second');
      }
    });
  });
});
