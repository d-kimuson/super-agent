# Engine Spec (抜粋)

## onError（新形式）

Step の `onError` は object の discriminated union:

- `{ type: "fail" }`
- `{ type: "skip" }`
- `{ type: "retry", max: integer(>=1), strategy?: "fixed"|"backoff", seconds?: integer, final?: "fail"|"skip" }`
  - `final`: リトライ尽きた後の挙動（default="fail"）

## 互換（loader 正規化）

YAML での旧形式は loader (`src/workflow/loader.ts`) で新形式へ正規化する。

- 旧 `onError: "fail" | "skip" | "retry"` は `onError: { type: ... }` に変換
- 旧 `retry:` がある場合は `onError.type="retry"` に寄せる
  - 旧 `onError: "skip"` + `retry:` => `onError: { type:"retry", final:"skip", ... }`
- 新 `onError` object と旧 `retry:` の同時指定はエラー（曖昧防止）
