abstract class Flag {
  constructor(private kind: string) {}
}

export class SkipFlag extends Flag {
  constructor() {
    super('skip');
  }
}

export class ContinueFlag extends Flag {
  constructor() {
    super('continue');
  }
}

export class BreakFlag extends Flag {
  constructor() {
    super('break');
  }
}

export const flags = {
  skip: new SkipFlag(),
  continue: new ContinueFlag(),
  break: new BreakFlag(),
} as const;

export type Flags = typeof flags;
