export const errorToString = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
};
