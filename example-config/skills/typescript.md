---
name: typescript
description: TypeScript best practices and patterns for writing type-safe code
---

Write TypeScript code following these principles:

## Type Safety

- Prefer discriminated unions for state representation
- Use `as const satisfies` for configuration objects
- Avoid `any` - use `unknown` with proper type narrowing
- Use Zod or similar for runtime validation of external data

## Code Style

- Use arrow functions over function declarations
- Prefer immutable data structures
- Use strict TypeScript compiler options

## Patterns

```typescript
// Discriminated union for state
type Result<T, E> = { success: true; data: T } | { success: false; error: E };

// Configuration with literal types preserved
const config = {
  mode: 'production',
  port: 3000,
} as const satisfies Config;
```
