import {
  type StandardSchemaV1,
  type StandardTypedV1,
  type StandardJSONSchemaV1,
} from '@standard-schema/spec';

export type LogOutputAdapter = {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type LoggerType = 'console' | 'stderr';

export type OrPromise<T> = T | Promise<T>;

export type InferStandardSchema<T extends StandardSchemaV1> =
  NonNullable<T['~standard']['types']> extends StandardTypedV1.Types<infer I1, infer I2>
    ? { raw: I1; parsed: I2 }
    : { raw: never; parsed: never };

export type InferStandardJSONSchema<T extends StandardJSONSchemaV1> =
  NonNullable<T['~standard']['types']> extends StandardTypedV1.Types<infer I1, infer I2>
    ? { raw: I1; parsed: I2 }
    : { raw: never; parsed: never };
