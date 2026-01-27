export const errorToString = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error === null) {
    return 'null';
  }
  if (error === undefined) {
    return 'undefined';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error);
  }
  if (typeof error === 'symbol' || typeof error === 'function') {
    return error.toString();
  }
  if (Array.isArray(error)) {
    return error.toString();
  }
  if (typeof error === 'object') {
    return Object.prototype.toString.call(error);
  }
  return '';
};
