export type ControllablePromise<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  value:
    | {
        status: 'pending';
      }
    | {
        status: 'fulfilled';
        value: T;
      }
    | {
        status: 'rejected';
        reason: unknown;
      };
};

export const createControllablePromise = <T>(): ControllablePromise<T> => {
  const controllablePromise: Partial<ControllablePromise<T>> = {
    value: {
      status: 'pending',
    },
  };

  controllablePromise.promise = new Promise<T>((resolve, reject) => {
    controllablePromise.resolve = (value: T) => {
      resolve(value);
      controllablePromise.value = {
        status: 'fulfilled',
        value,
      };
    };
    controllablePromise.reject = (reason?: unknown) => {
      reject(reason);
      controllablePromise.value = {
        status: 'rejected',
        reason,
      };
    };
  });

  // eslint-disable-next-line no-unsafe-type-assertion
  return controllablePromise as ControllablePromise<T>;
};
