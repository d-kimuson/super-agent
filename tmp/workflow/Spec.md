# 3. 構文仕様（MVP）

## 3.1 ルート

- id: string (required)
- name: string (optional)
- description: string (optional)
- inputs: map<string, InputDef> (optional)
- steps: Step[] (required)

## 3.2 InputDef

- type: "boolean" | "string" | "number" | "integer" | "object" | "array" # MVPで厳密型変換は最小
- default: any (optional)
- required: boolean (optional, default=false)

入力参照：${{ inputs.<key> }}

## 3.3 Step 共通フィールド

- id: string (required, unique)
- name: string (optional)
- needs: string[] (optional)
- if: string-expr (optional)
- timeoutSeconds: integer (optional)
- onError: OnErrorDef (optional, default={type:"fail"})
  - { type: "fail" }
  - { type: "skip" }
  - { type: "retry", max: integer(>=1), strategy?: "fixed"|"backoff", seconds?: integer, final?: "fail"|"skip" }
    - final: リトライ尽きた後の挙動（default="fail"）
- retry: (optional, legacy) # loader で onError.type="retry" に正規化される
- execute: ExecuteDef (required)

legacy:

- repeat: { max: integer, until?: string-expr, steps?: Step[] } (optional, legacy) # loader で execute.type="loop" に正規化される（非推奨）
- steps: Step[] (optional, legacy) # repeat とセットでのみ使用（repeat.steps があればこちらは不可）（非推奨）
- execute と repeat の同居はエラー

ステップ状態（Engineが持つ）：

- status: pending | running | success | failed | skipped
- outputs: step typeに応じて後述

## 3.4 ExecuteDef

### shell

execute:

- type: shell
- run: string (required)

outputs:

- steps.<id>.stdout : string
- steps.<id>.stderr : string
- steps.<id>.exitCode : integer

### agent

execute:

- type: agent
- sdkType: string (required) # 例: "claude", "codex"
- model: string (required)
- prompt: string (required)

structured（任意）：

- structured が宣言されている場合、agentの output を JSON として parse して steps.<id>.structured に格納
- JSON parse に失敗したら step は failed（onErrorに従う）
- MVPでは schema 検証はしない（structured は期待値メタとして扱う）

outputs:

- steps.<id>.output : string
- steps.<id>.structured : object | null

### slack

execute:

- type: slack
- channel: string
- message:
  - text: string

outputs（MVP最小）：

- steps.<id>.output : string（送信したtextをそのまま入れてもいい）

## 3.5 loop（ループ）

execute:

- type: loop
- max: integer (required) # 最大反復回数
- until: string-expr # true で終了（省略時は max 回やる）
- steps: Step[] (required) # ブロック内ステップ（ネストは execute.steps）

ルール（MVP）：

- ブロック内ステップは 毎イテレーション上書き（履歴は保持しない）
- until は そのイテレーションで実行された出力 を参照できる
- 反復終了時、ブロック外からは「最後のイテレーションの出力」が見える
- 例：ブロック外から steps.review.structured.approved を参照できる（“最後のreview”）

legacy repeat（互換・非推奨）：

- 入力としては従来の `repeat:` 形式も受け付ける（非推奨）
  - `repeat.steps:` がある場合: それをループブロックの steps として扱う
  - `repeat.steps:` がない場合: 従来どおりトップレベルの `steps:` をループブロックの steps として扱う
  - `repeat.steps:` とトップレベル `steps:` の同居はエラー（曖昧さ回避）
- loader が `execute.type="loop"` へ正規化してから engine に渡す（内部表現は常に loop）
- 新規定義は `execute.type="loop"` 形式を使用する（repeat は互換のための入力専用）

## 3.6 needs の評価（あなた案を仕様化）

基本

- step S は needs が全て “実行可能” になってから評価される
- “実行可能” = 必要な依存が success である（原則）

skipped 親継承ルール（MVPの特徴）

- 依存 step D が skipped の場合、S は D を “無視” するのではなく、D の needs を代わりに必要条件として取り込む
- つまり、S の実効依存は「skippedステップを展開して消した依存グラフ」と等価

擬似コード（仕様コメント向け）：

- EffectiveNeeds(S) = Flatten(needs(S))
- Flatten(list) は各要素 d について
  - if status(d) != skipped: keep d
  - else: replace d with Flatten(needs(d))

実行条件: EffectiveNeeds(S) の全ステップが success（failed があればSは実行不可）

※この仕様の意図：if で前処理が飛んでも、前処理のさらに前（祖先）が揃っていれば後続を動かせる。

## 3.7 if（条件）

- if は step 実行前に評価
- false の場合、その step は skipped
- if がない場合は true 扱い

## 3.8 onError / retry / timeout

- timeoutSeconds を超えたら step は失敗扱い（failed）

onError:

- {type:"fail"}: workflow全体を failed で終了（MVPは即停止でOK）
- {type:"skip"}: その step を skipped として扱い、後続は needs 規則に従う
- {type:"retry", ...}: 失敗時に max 回までリトライ。尽きたら final（default="fail"）
  - final="skip": リトライ尽きたら skipped（旧 onError:"skip" + retry と互換）

retry.strategy:

- fixed: 常に seconds 待つ
- backoff: seconds \* 2^(attempt-1) 待つ（attemptは1始まり）

## 3.9 Expression language（最小仕様）

if や ${{ }} は同じ評価器。

参照できる値：

- inputs.<key>
- steps.<id>.stdout | stderr | exitCode | output | structured
- true/false/null

演算（MVP）：

- 比較: ==, !=
- 論理: &&, ||, !
- 括弧 ()
- dotted access: steps.review.structured.approved
- オプショナル: a || b でフォールバック（例: titleがないとき output を使う）
- 関数呼び出し: functionName(expr)

組み込み関数：

- trim(value): 両端の空白・改行を除去（String.prototype.trim 相当）
- trimEnd(value): 末尾の空白・改行を除去（String.prototype.trimEnd 相当）
- stripNewline(value): 末尾の改行（\n または \r\n）を1回だけ除去

例: `trimEnd(steps.counter.stdout) == "3"` — echo 3 の stdout "3\n" を比較可能にする

テンプレート展開：

- prompt/run/message.text の文字列中に ${{ expr }} があれば置換
- 置換値が object の場合は JSON stringify（MVP）

---

## 3.10 実装状況一覧（2026-01-26）

凡例：

- 実装: ✅=完了 / ⚠️=部分実装 / ❌=未実装
- テスト: ✅=自動テストあり / ⚠️=部分のみ / ❌=未実施

### 3.1 ルート

- 実装: ✅ `src/workflow/loader.ts`（id/name/description/inputs/steps をパース）
- テスト: ⚠️（直接テストなし。E2E未実施）

### 3.2 InputDef

- 実装: ✅ `src/workflow/loader.ts`（type/default/required） + `src/workflow/inputs.ts`（型変換）
- テスト: ✅ `src/workflow/inputs.test.ts`

### 3.3 Step 共通フィールド

- 実装: ✅ `src/workflow/engine.ts`（needs/if/timeout/onError/retry）
- テスト: ⚠️ `src/workflow/engine.test.ts`（needs/if/retry の一部）

### 3.4 ExecuteDef

shell:

- 実装: ✅ `src/workflow/executors.ts` / `src/workflow/engine.ts`
- テスト: ⚠️（engine で間接テストのみ）

agent:

- 実装: ✅ `src/workflow/executors.ts` / `src/workflow/engine.ts`
- JSON parse: ✅ `src/workflow/engine.ts`
- テスト: ⚠️（engine の一部のみ）

slack:

- 実装: ⚠️ `src/workflow/engine.ts`（runner はスタブ）
- テスト: ❌

### 3.5 loop（ループ）

- 実装: ✅ `src/workflow/engine.ts`（上書き/until/max）
- テスト: ✅ `src/workflow/engine.test.ts`

### 3.6 needs の評価（skipped 親継承）

- 実装: ✅ `src/workflow/engine.ts`
- テスト: ✅ `src/workflow/engine.test.ts`

### 3.7 if（条件）

- 実装: ✅ `src/workflow/engine.ts`
- テスト: ⚠️（エンジン内で間接）

### 3.8 onError / retry / timeout

onError/retry:

- 実装: ✅ `src/workflow/engine.ts`
- テスト: ✅ `src/workflow/engine.test.ts`（retry/skip）

timeout:

- 実装: ⚠️ shell は kill、agent/slack は race で中断のみ
- テスト: ❌

### 3.9 Expression language

- 実装: ✅ `src/workflow/expression.ts` / `src/workflow/template.ts`
- テスト: ✅ `src/workflow/expression.test.ts` / `src/workflow/template.test.ts`

### 補足（仕様外の追加）

- `agentType` フィールド（agent step の実行先エージェント指定）を追加
  - 実装: ✅ `src/workflow/loader.ts` / `src/workflow/types.ts`
  - テスト: ❌

---

## QA Notes

Session 1 (2026-01-27):

### Build & Basic Workflow Execution

- [x] pnpm build completes successfully
- [x] CLI workflow-run command works with --workflow-dir option
- [x] minimal-shell-agent workflow runs with shell-only steps (run-agent=false)
- [x] minimal-shell-agent workflow runs with agent steps (run-agent=true, Claude SDK)

### Loop (execute.type=loop) Testing

- [x] Loop executes up to max iterations correctly
- [x] until condition terminates loop early（unit test: `src/workflow/engine.test.ts`）

### needs-skip Inheritance

- [x] Skipped steps (via if: false) are handled correctly
- [x] Steps depending on skipped steps run when their ancestors are satisfied

### Expression Evaluation (if conditions)

- [x] Boolean input comparison works: inputs.flag equals true/false
- [x] String equality works: inputs.value equals 'literal'
- [x] Numeric equality works: inputs.number equals 42
- [x] Negation works: inputs.flag not-equals false
- [ ] **Comparison operators (greater-than, less-than) NOT supported**
  - Workflow: test-expressions.yaml
  - Expression: inputs.number greater-than 40
  - Error: "Unexpected character: >"
- [ ] **stdout comparison fails due to trailing newline**
  - Workflow: test-expressions-v2.yaml
  - Expected: steps.producer.stdout equals 'expected_value' should match
  - Actual: Comparison fails because stdout is "expected_value\n" (includes newline)
  - Note: This may be expected behavior, but users should be aware stdout includes trailing newline

### Template Interpolation

- [x] Input values interpolated in shell run scripts
- [x] Step outputs interpolated in subsequent step prompts/scripts

### Error Handling

- [x] onError: fail stops workflow on step failure
- [x] gh command failure (exitCode=1) correctly marks step as failed
