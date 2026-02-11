# anthropic-multi-auth — Multi-Account Claude Auth Plugin for OpenCode

## TL;DR

> **Quick Summary**: Build an OpenCode plugin that allows users to log into multiple Claude Pro/Max accounts and automatically distributes load between them. On session start, the plugin checks real quota usage via Anthropic's OAuth usage API and picks the account with lowest utilization. During a session the account stays sticky, but on 429 rate-limit errors it auto-switches to the next available account.
>
> **Deliverables**:
> - `anthropic-multi-auth` npm package (TypeScript, builds to .mjs)
> - Multi-account OAuth login flow via `opencode auth login`
> - Quota-aware account selection on session start
> - Mid-session auto-failover on 429 errors
> - Account storage at `~/.config/opencode/anthropic-accounts.json`
> - Comprehensive vitest test suite
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7

---

## Context

### Original Request
User wants an OpenCode plugin for multi-account Claude authentication with load balancing. Accounts should be session-sticky but auto-switch on quota exhaustion. New sessions should automatically pick the least-used account. Inspired by `opencode-antigravity-auth`'s multi-account patterns.

### Interview Summary
**Key Discussions**:
- **Override vs separate ID**: Plugin overrides the builtin `opencode-anthropic-auth` by registering the same `auth.provider = "anthropic"`. BUILTIN plugins load first, user plugins load after — last wins.
- **Quota detection**: Anthropic has an OAuth usage API (`api.anthropic.com/api/oauth/usage`) that returns utilization percentages per time window. This is the primary signal for account selection.
- **Selection strategy**: Quota-aware sticky — pick lowest-usage account on session start, stay sticky during session, failover on 429.
- **Login UX**: Re-use `opencode auth login` → Anthropic option. Loop "Add another account?" after first login.
- **Storage**: Own JSON file at `~/.config/opencode/anthropic-accounts.json` — not in OpenCode's `auth.json`.
- **Tech**: TypeScript with vitest, package name `anthropic-multi-auth`.
- **Account types**: OAuth (Claude Pro/Max) only.
- **Maintenance**: User wants minimal maintenance — avoid tracking model changes. The request transformation logic from the original plugin (~100 lines) must be replicated but rarely changes.

**Research Findings**:
- **OpenCode plugin interface** (`@opencode-ai/plugin`): Plugin exports async function returning Hooks with `auth` hook for provider registration. Auth hook has `loader(getAuth, provider)` that returns custom `fetch()` and `methods` array for login flows.
- **Original plugin** (`opencode-anthropic-auth` v0.0.13): ~250 lines of JS. OAuth PKCE flow, token refresh, tool name prefixing (`mcp_`), system prompt sanitization ("OpenCode" → "Claude Code"), beta headers injection.
- **Antigravity-auth patterns**: `AccountManager` class, `AccountSelectionStrategy` (sticky/round-robin/hybrid), `HealthScoreTracker`, `TokenBucketTracker`, `selectHybridAccount()`, PID-based offset, accounts stored with rateLimitResetTimes/lastUsed/enabled.
- **Claude usage API**: `GET api.anthropic.com/api/oauth/usage` with `Authorization: Bearer ${token}` + `anthropic-beta: oauth-2025-04-20`. Returns `{five_hour: {utilization: N, resets_at: "..."}, seven_day: {utilization: N, ...}}` where utilization is 0-100%.
- **Auth storage**: OpenCode stores one cred per provider in `auth.json`. Multi-account requires own storage.

### Metis Review
**Identified Gaps** (addressed via plan amendments):
- **Login loop inside callback()**: OpenCode's auth flow is single-shot. The "Add another account?" loop MUST run inside `callback()`, using `readline` for prompts and generating fresh PKCE per additional account. → Amended Task 6 with explicit callback loop design.
- **auth.json sync after token refresh**: Provider loader only calls `loader()` when `Auth.get("anthropic")` returns truthy. If auth.json creds go stale, the loader never activates. → Amended Task 3: token refresh syncs auth.json for active account.
- **Stale rateLimitedUntil on load**: Expired rate limits from previous sessions could block accounts. → Amended Task 2: `loadAccounts()` clears stale values.
- **Empty accounts fallback**: With 0 accounts, loader must return `{}` so builtin plugin works. → Amended Task 6 with explicit early-return.
- **All accounts exhausted error**: Need descriptive error with shortest wait time. → Added to Task 6 acceptance criteria.
- **Both plugins' loaders execute**: Confirmed harmless — builtin runs first, ours overwrites via mergeProvider().

**Validated**: "Last One Wins" override strategy confirmed across all three OpenCode code paths (`findLast()` in auth CLI, `fromEntries()` in auth methods, `mergeProvider()` in provider loading).

### Gap Analysis (Self-Performed)
**Identified Gaps** (addressed):
- **Token refresh for inactive accounts**: Tokens expire ~1hr. Only the active account gets refreshed via the fetch interceptor. Inactive accounts need proactive refresh before quota check. → Addressed: quota check refreshes tokens first.
- **Concurrent session access**: Multiple OpenCode sessions may read/write the accounts file simultaneously. → Addressed: use atomic file writes and read-before-write pattern.
- **First-time migration**: Users switching from builtin opencode-anthropic-auth already have one credential in `auth.json`. → Addressed: on first load, check `auth.json` for existing Anthropic OAuth creds and offer to import.
- **Usage API failure**: The quota endpoint may be down or return errors. → Addressed: fallback to round-robin if quota check fails.
- **All accounts exhausted**: All accounts hit 429. → Addressed: wait for shortest retry-after, or show user error.
- **Account removal**: User needs a way to remove accounts. → Addressed: provide "manage accounts" auth method.

---

## Work Objectives

### Core Objective
Build a drop-in replacement for `opencode-anthropic-auth` that supports multiple Claude Pro/Max OAuth accounts with automatic quota-aware load balancing.

### Concrete Deliverables
- `anthropic-multi-auth` npm package published and installable
- TypeScript source with full type coverage
- Multi-account OAuth login flow
- Account storage manager
- Quota-checking account selector
- Mid-session failover on 429
- Request transformation layer (matching original plugin)
- Vitest test suite with >80% coverage
- README with installation and usage instructions

### Definition of Done
- [x] `bun test` passes with 0 failures
- [x] `bun run build` produces valid `index.mjs`
- [x] Plugin installs in OpenCode via `"plugin": ["anthropic-multi-auth"]`
- [x] Can login with 2+ accounts via `opencode auth login`
- [x] On new session, automatically selects lowest-usage account
- [x] On 429 error, automatically switches to different account
- [x] All original plugin transformations work (tool prefixing, system prompt, beta headers)

### Must Have
- OAuth PKCE login flow identical to original plugin
- Multi-account storage with add/remove capability
- Quota-aware selection on session start via usage API
- Session-sticky behavior (don't switch unless forced)
- Auto-failover on 429 with seamless switch
- Token refresh for active account
- All request transformations from original plugin
- Backward-compatible: works with single account too

### Must NOT Have (Guardrails)
- **No API key support** — OAuth only
- **No model list management** — the plugin should NOT maintain a list of Anthropic models. Models are managed by OpenCode's provider system. The plugin only provides auth.
- **No usage dashboard/UI** — just account selection logic
- **No prompt caching optimization** — that's a future concern
- **No "smart" model routing** — all Anthropic models use whatever account is selected
- **No encryption at rest** — tokens are stored as-is in JSON (like the original). File permissions (0o600) provide basic protection.
- **No automatic npm publishing** — manual publish
- **Do NOT modify the original opencode-anthropic-auth** — this is a separate package
- **Never read from `getAuth()` in custom fetch** — use own storage exclusively. `getAuth()` reads auth.json which may be stale.
- **No per-model rate limiting in v1** — track per-account only. Per-model is a v2 enhancement.
- **No `@clack/prompts` for login loop** — use `readline` from `node:readline` (compatible with raw terminal inside OpenCode)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: NO (new project)
- **Automated tests**: YES (TDD with vitest)
- **Framework**: vitest (matching antigravity-auth's choice)

### Test Infrastructure Setup (Task 1)
- Install vitest as dev dependency
- Configure vitest in `vitest.config.ts`
- Verify with `bun test` → example test passes

### TDD Workflow Per Task
Each implementation task follows RED-GREEN-REFACTOR:
1. **RED**: Write failing test
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

### Agent-Executed QA Scenarios

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Build output | Bash | `bun run build` → check index.mjs exists |
| Tests | Bash | `bun test` → all pass |
| Plugin loading | Bash | Verify exports match Plugin type |
| OAuth flow | Bash (unit test) | Mock fetch, verify PKCE flow |
| Account storage | Bash (unit test) | Write/read/delete accounts |
| Quota checking | Bash (unit test) | Mock usage API, verify selection |
| Failover | Bash (unit test) | Simulate 429, verify switch |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Project scaffold + test infra
└── (sequential from here — each task builds on previous)

Wave 2 (After Task 3):
├── Task 4: Quota checker (independent of Task 5)
└── Task 5: Request transformation layer (independent of Task 4)

All other tasks: Sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4, 5 | None (foundation) |
| 2 | 1 | 3, 6 | None |
| 3 | 1, 2 | 4, 5 | None |
| 4 | 1, 3 | 6 | 5 |
| 5 | 1 | 6 | 4 |
| 6 | 2, 3, 4, 5 | 7 | None |
| 7 | 6 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | task(category="quick", load_skills=[], run_in_background=false) |
| 2 | 2 | task(category="medium", load_skills=[], run_in_background=false) |
| 3 | 3 | task(category="medium", load_skills=[], run_in_background=false) |
| 4 | 4, 5 | dispatch parallel: task(category="medium") each |
| 5 | 6 | task(category="unspecified-high", load_skills=[], run_in_background=false) |
| 6 | 7 | task(category="quick", load_skills=[], run_in_background=false) |

---

## TODOs

- [x] 1. Project Scaffold & Test Infrastructure

  **What to do**:
  - Initialize npm package with `bun init`
  - Set package name to `anthropic-multi-auth`
  - Configure `package.json`:
    - `"main": "./dist/index.mjs"`
    - `"types": "./dist/index.d.ts"`
    - `"devDependencies"`: `@opencode-ai/plugin`, `vitest`, `typescript`, `@openauthjs/openauth`
    - `"scripts"`: `"build": "bun build ./src/index.ts --outfile dist/index.mjs --format esm"`, `"test": "vitest run"`, `"test:watch": "vitest"`
  - Create `tsconfig.json` with `"strict": true`, `"moduleResolution": "bundler"`, `"target": "esnext"`
  - Create `vitest.config.ts`
  - Create directory structure:
    ```
    src/
    ├── index.ts          (plugin entry point, exports Plugin function)
    ├── storage.ts         (account storage manager)
    ├── accounts.ts        (account manager with selection logic)
    ├── quota.ts           (quota checking via usage API)
    ├── oauth.ts           (PKCE OAuth flow — authorize + exchange)
    ├── transform.ts       (request transformation: tool prefix, system prompt, headers)
    ├── types.ts           (shared TypeScript types)
    └── __tests__/
        ├── storage.test.ts
        ├── accounts.test.ts
        ├── quota.test.ts
        ├── oauth.test.ts
        └── transform.test.ts
    ```
  - Create a simple smoke test in `src/__tests__/smoke.test.ts` that verifies the module structure
  - Verify: `bun test` → 1 test passes

  **Must NOT do**:
  - Do not implement any business logic yet — just structure and smoke test
  - Do not install runtime dependencies beyond what's needed for types

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - No specialized skills needed — standard project setup

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (alone)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `https://github.com/anomalyco/opencode-anthropic-auth/blob/master/package.json` — Package structure reference (name, main, devDependencies)
  - `https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/package.json` — TypeScript plugin package.json with build/test scripts

  **API/Type References**:
  - `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/plugin/src/index.ts` — Full Plugin type definition including AuthHook, Hooks, PluginInput types

  **External References**:
  - vitest docs: https://vitest.dev/guide/

  **Acceptance Criteria**:

  - [x] `package.json` exists with name "anthropic-multi-auth"
  - [x] `tsconfig.json` exists with strict mode
  - [x] `vitest.config.ts` exists
  - [x] Directory structure matches spec above
  - [x] `bun install` completes without errors
  - [x] `bun test` → PASS (1 smoke test)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Project builds and tests pass
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: bun install
      2. Assert: exit code 0, node_modules/ exists
      3. Run: bun test
      4. Assert: exit code 0, output contains "1 passed"
      5. Run: ls src/__tests__/
      6. Assert: smoke.test.ts exists
    Expected Result: Clean project setup with passing smoke test
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(scaffold): initialize anthropic-multi-auth project with TypeScript and vitest`
  - Files: `package.json, tsconfig.json, vitest.config.ts, src/**`

---

- [x] 2. Account Storage Manager

  **What to do**:
  - **RED**: Write tests in `src/__tests__/storage.test.ts`:
    - `loadAccounts()` returns empty array when file doesn't exist
    - `saveAccounts()` writes accounts to disk and `loadAccounts()` reads them back
    - `addAccount()` appends an account to existing list
    - `removeAccount(index)` removes account by index
    - `getAccount(index)` returns specific account
    - File is written with mode 0o600 (owner read/write only)
    - `importFromAuthJson()` reads existing Anthropic OAuth creds from OpenCode's auth.json and converts to account format
  - **GREEN**: Implement `src/storage.ts`:
    - Storage path: `~/.config/opencode/anthropic-accounts.json`
    - Use `os.homedir()` + `path.join()` for cross-platform path
    - Create config directory if it doesn't exist
    - Account storage format:
      ```typescript
      interface AccountStorage {
        version: 1;
        accounts: StoredAccount[];
        activeIndex: number;
      }
      interface StoredAccount {
        email?: string;
        refresh: string;
        access?: string;
        expires?: number;
        addedAt: number;
        lastUsed?: number;
        label?: string;
        rateLimitedUntil?: number;
        enabled: boolean;
      }
      ```
    - Atomic writes: write to temp file then rename
    - Handle concurrent access: read-modify-write with file locking or retry
    - **METIS AMENDMENT**: `loadAccounts()` MUST clear stale `rateLimitedUntil` values (where `rateLimitedUntil < Date.now()`) during load. This prevents leftover rate limits from previous sessions blocking accounts.
  - **GREEN**: Implement `src/types.ts` with shared type definitions
  - **REFACTOR**: Extract common utilities

  **Must NOT do**:
  - Do not implement token refresh logic (that's in the OAuth module)
  - Do not implement quota checking (that's Task 4)
  - Do not encrypt tokens — use file permissions like the original plugin

  **Recommended Agent Profile**:
  - **Category**: `medium`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2)
  - **Blocks**: Tasks 3, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/src/plugin/storage.ts` — AccountStorageV3 type, loadAccounts/saveAccounts pattern, file locking approach
  - `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/auth/index.ts` — OpenCode's auth.json format for import migration (`Auth.Oauth` schema: type, refresh, access, expires, accountId)

  **API/Type References**:
  - Storage path in OpenCode: `path.join(Global.Path.data, "auth.json")` — this is where existing single-account creds live
  - File permissions: `{ mode: 0o600 }` used by OpenCode's auth.set

  **Acceptance Criteria**:

  - [x] Tests pass: `bun test src/__tests__/storage.test.ts` → PASS (9+ tests)
  - [x] loadAccounts returns `{ version: 1, accounts: [], activeIndex: 0 }` for missing file
  - [x] addAccount correctly appends to existing accounts
  - [x] removeAccount correctly removes by index
  - [x] File written with 0o600 permissions
  - [x] importFromAuthJson reads existing creds from auth.json
  - [x] loadAccounts clears stale rateLimitedUntil values (where < Date.now())
  - [x] loadAccounts preserves future rateLimitedUntil values

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Storage CRUD operations work correctly
    Tool: Bash
    Preconditions: Task 1 complete, project builds
    Steps:
      1. Run: bun test src/__tests__/storage.test.ts
      2. Assert: All tests pass, 0 failures
      3. Assert: Output shows tests for load, save, add, remove, import
    Expected Result: All storage operations work correctly
    Evidence: Test output captured

  Scenario: Storage handles missing config directory
    Tool: Bash
    Preconditions: Test creates temp dir without config subdir
    Steps:
      1. Run: bun test src/__tests__/storage.test.ts --reporter=verbose
      2. Assert: "creates directory if not exists" test passes
    Expected Result: Auto-creates ~/.config/opencode/ if missing
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `feat(storage): add multi-account storage manager with import migration`
  - Files: `src/storage.ts, src/types.ts, src/__tests__/storage.test.ts`

---

- [x] 3. OAuth Flow & Token Refresh

  **What to do**:
  - **RED**: Write tests in `src/__tests__/oauth.test.ts`:
    - `authorize("max")` generates correct PKCE URL with claude.ai domain
    - `authorize("console")` generates correct URL with console.anthropic.com domain
    - `exchange(code, verifier)` calls token endpoint with correct body
    - `exchange()` returns `{ type: "success", refresh, access, expires }` on success
    - `exchange()` returns `{ type: "failed" }` on failure
    - `refreshToken(refreshToken)` calls refresh endpoint correctly
    - `refreshToken()` returns new access + refresh tokens
    - `refreshToken()` throws on failure
    - `refreshAllAccounts(accounts)` refreshes expired tokens for all accounts
  - **GREEN**: Implement `src/oauth.ts`:
    - Port the `authorize()` and `exchange()` functions from original plugin
    - CLIENT_ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
    - OAuth URL: `https://claude.ai/oauth/authorize` (Pro/Max) or `https://console.anthropic.com/oauth/authorize` (Console)
    - Token endpoint: `https://console.anthropic.com/v1/oauth/token`
    - Scopes: `org:create_api_key user:profile user:inference`
    - PKCE via `@openauthjs/openauth/pkce` (`generatePKCE()`)
    - Add `refreshToken(refreshToken: string)` function for token refresh
    - Add `refreshAllAccounts()` that iterates all accounts and refreshes expired tokens
    - Update storage with new tokens after refresh
    - **METIS AMENDMENT**: `refreshToken()` must accept an optional `client` parameter. When the refreshed account is the ACTIVE account, also call `client.auth.set({ path: { id: "anthropic" }, body: { type: "oauth", refresh, access, expires } })` to keep `auth.json` in sync. This is critical because OpenCode's provider loader only calls `loader()` when `Auth.get("anthropic")` returns truthy — if `auth.json` creds become stale/invalid, the loader won't be called on next startup.

  **Must NOT do**:
  - Do not implement the login CLI loop (that's in the plugin entry point)
  - Do not handle account selection (that's Task 6)

  **Recommended Agent Profile**:
  - **Category**: `medium`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `https://raw.githubusercontent.com/anomalyco/opencode-anthropic-auth/master/index.mjs` — EXACT OAuth flow to replicate: `authorize()` (lines 8-33), `exchange()` (lines 39-64), token refresh in `fetch()` (lines 96-121). Copy the CLIENT_ID, URLs, scopes, PKCE parameters verbatim.
  - `https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/src/plugin/token.ts` — `refreshAccessToken()` pattern for token refresh with error handling

  **API/Type References**:
  - PKCE: `import { generatePKCE } from "@openauthjs/openauth/pkce"` → returns `{ challenge, verifier }`
  - Token endpoint request body: `{ code, state, grant_type: "authorization_code", client_id, redirect_uri, code_verifier }`
  - Token refresh body: `{ grant_type: "refresh_token", refresh_token, client_id }`
  - Token response: `{ refresh_token, access_token, expires_in }` (expires_in in seconds)

  **Acceptance Criteria**:

  - [x] Tests pass: `bun test src/__tests__/oauth.test.ts` → PASS (10+ tests)
  - [x] authorize("max") URL starts with `https://claude.ai/oauth/authorize`
  - [x] authorize("console") URL starts with `https://console.anthropic.com/oauth/authorize`
  - [x] exchange correctly parses code#state format
  - [x] refreshToken calls correct endpoint with refresh_token grant type
  - [x] refreshAllAccounts only refreshes accounts with expired tokens
  - [x] refreshToken syncs auth.json via client.auth.set when refreshing active account
  - [x] refreshToken does NOT sync auth.json when refreshing non-active account

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: OAuth authorize generates valid PKCE URLs
    Tool: Bash
    Preconditions: Task 1-2 complete
    Steps:
      1. Run: bun test src/__tests__/oauth.test.ts --reporter=verbose
      2. Assert: authorize("max") test passes with claude.ai URL
      3. Assert: authorize("console") test passes with console.anthropic.com URL
      4. Assert: PKCE challenge and verifier are present in URL
    Expected Result: All OAuth tests pass
    Evidence: Test output captured

  Scenario: Token refresh handles failure gracefully
    Tool: Bash
    Preconditions: Mock fetch to return 401
    Steps:
      1. Run: bun test src/__tests__/oauth.test.ts -t "refresh.*fail"
      2. Assert: Test passes, error is thrown with descriptive message
    Expected Result: Graceful error handling on refresh failure
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `feat(oauth): add PKCE OAuth flow and token refresh for multi-account`
  - Files: `src/oauth.ts, src/__tests__/oauth.test.ts`

---

- [x] 4. Quota Checker & Account Selector

  **What to do**:
  - **RED**: Write tests in `src/__tests__/quota.test.ts`:
    - `fetchQuota(accessToken)` calls usage API with correct headers
    - `fetchQuota()` returns parsed utilization data on success
    - `fetchQuota()` returns null on failure (API down, 403, etc.)
    - `selectAccount(accounts)` picks account with lowest `five_hour.utilization`
    - `selectAccount()` falls back to `seven_day.utilization` if five_hour missing
    - `selectAccount()` skips accounts that are rate-limited (rateLimitedUntil > now)
    - `selectAccount()` falls back to round-robin if all quota checks fail
    - `selectAccount()` returns the single account when only 1 exists
  - **GREEN**: Implement `src/quota.ts`:
    - `fetchQuota(accessToken: string): Promise<QuotaResponse | null>`
      - Endpoint: `https://api.anthropic.com/api/oauth/usage`
      - Headers: `Authorization: Bearer ${token}`, `anthropic-version: 2023-06-01`, `anthropic-beta: oauth-2025-04-20`, `Accept: application/json`
      - Parse response: `{ five_hour: { utilization, resets_at }, seven_day: { utilization, resets_at } }`
      - Timeout: 10 seconds
      - Return null on any error
    - `selectBestAccount(accounts: StoredAccount[]): Promise<number>`
      - Refresh expired tokens first (call refreshAllAccounts)
      - Fetch quota for all accounts in parallel (Promise.allSettled)
      - Filter out rate-limited accounts (rateLimitedUntil > Date.now())
      - Sort by lowest five_hour utilization
      - If all quota checks fail, use round-robin (pick account with oldest lastUsed)
      - Return index of selected account

  - **RED**: Write tests in `src/__tests__/accounts.test.ts`:
    - `AccountManager.init()` loads accounts and selects best
    - `AccountManager.getActive()` returns current active account
    - `AccountManager.handleRateLimit(retryAfter)` marks current account as rate-limited and switches
    - `AccountManager.handleRateLimit()` returns null when all accounts exhausted
    - `AccountManager.markUsed()` updates lastUsed timestamp
  - **GREEN**: Implement `src/accounts.ts`:
    - `AccountManager` class (singleton per plugin load):
      - `init(accounts)`: Load accounts, call `selectBestAccount()`, set activeIndex
      - `getActive()`: Return current active account
      - `handleRateLimit(retryAfterMs)`: Mark current account rateLimitedUntil, select next best, update storage
      - `markUsed()`: Update lastUsed timestamp on active account
      - `switchAccount()`: Force switch to next best account
      - Properties: `activeAccount`, `activeIndex`, `allAccounts`

  **Must NOT do**:
  - Do not implement the fetch interceptor (that's Task 6)
  - Do not implement health scores or token buckets — keep it simple with direct quota API
  - Do not poll quota periodically — only check on session start

  **Recommended Agent Profile**:
  - **Category**: `medium`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `https://raw.githubusercontent.com/openclaw/openclaw/main/src/infra/provider-usage.fetch.claude.ts` — `fetchClaudeUsage()` function: exact API endpoint, headers, response parsing. This is the authoritative reference for the usage API. Key: uses Bearer token auth, anthropic-beta header, returns `five_hour`/`seven_day` objects with `utilization` (0-100) and `resets_at`.
  - `https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/src/plugin/accounts.ts` — `AccountManager.getCurrentOrNextForFamily()` method: account selection logic, rate limit tracking, lastUsed timestamps. Adapt the simpler parts (skip health scores, token buckets).
  - `https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/src/plugin/rotation.ts` — `selectHybridAccount()`: reference for scoring/ranking accounts. We'll simplify to just utilization-based.

  **API/Type References**:
  - Usage API: `GET https://api.anthropic.com/api/oauth/usage`
  - Request headers: `{ Authorization: "Bearer ${token}", "anthropic-version": "2023-06-01", "anthropic-beta": "oauth-2025-04-20", Accept: "application/json" }`
  - Response shape (from openclaw tests):
    ```typescript
    interface QuotaResponse {
      five_hour?: { utilization: number; resets_at?: string };
      seven_day?: { utilization: number; resets_at?: string };
      seven_day_opus?: { utilization: number };
      seven_day_sonnet?: { utilization: number };
    }
    ```

  **Acceptance Criteria**:

  - [x] Tests pass: `bun test src/__tests__/quota.test.ts` → PASS (8+ tests)
  - [x] Tests pass: `bun test src/__tests__/accounts.test.ts` → PASS (5+ tests)
  - [x] fetchQuota calls correct endpoint with Bearer token
  - [x] selectBestAccount picks lowest utilization account
  - [x] Rate-limited accounts are skipped
  - [x] Graceful fallback to round-robin when API fails
  - [x] AccountManager.handleRateLimit correctly switches accounts

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Account selection picks lowest usage
    Tool: Bash
    Preconditions: Tests mock 3 accounts with utilizations 80%, 20%, 60%
    Steps:
      1. Run: bun test src/__tests__/quota.test.ts -t "lowest"
      2. Assert: Account with 20% utilization is selected (index 1)
    Expected Result: Lowest-usage account selected
    Evidence: Test output captured

  Scenario: Failover skips rate-limited accounts
    Tool: Bash
    Preconditions: Tests mock account 0 as rate-limited, accounts 1,2 available
    Steps:
      1. Run: bun test src/__tests__/accounts.test.ts -t "rate.limit"
      2. Assert: Account 0 is skipped, account 1 or 2 selected
    Expected Result: Rate-limited accounts properly excluded
    Evidence: Test output captured

  Scenario: All accounts exhausted returns null
    Tool: Bash
    Preconditions: All accounts rate-limited
    Steps:
      1. Run: bun test src/__tests__/accounts.test.ts -t "exhausted"
      2. Assert: handleRateLimit returns null
    Expected Result: Clear signal when no accounts available
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `feat(quota): add quota-aware account selection with failover logic`
  - Files: `src/quota.ts, src/accounts.ts, src/__tests__/quota.test.ts, src/__tests__/accounts.test.ts`

---

- [x] 5. Request Transformation Layer

  **What to do**:
  - **RED**: Write tests in `src/__tests__/transform.test.ts`:
    - `transformRequest(body)` adds `mcp_` prefix to tool names in `tools` array
    - `transformRequest(body)` adds `mcp_` prefix to `tool_use` blocks in messages
    - `transformRequest(body)` sanitizes system prompt: "OpenCode" → "Claude Code", "opencode" → "Claude" (preserving paths like `/path/to/opencode-foo`)
    - `transformRequest(body)` handles null/undefined body gracefully
    - `transformStreamResponse(text)` strips `mcp_` prefix from tool names in streaming response
    - `buildAuthHeaders(accessToken, existingHeaders)` sets correct headers:
      - `authorization: Bearer ${token}`
      - `anthropic-beta` merges required betas with existing
      - `user-agent: claude-cli/2.1.2 (external, cli)`
      - Removes `x-api-key`
    - `addBetaParam(url)` appends `?beta=true` to `/v1/messages` URL
  - **GREEN**: Implement `src/transform.ts`:
    - Port the request body transformation from original plugin's `fetch()` function
    - `TOOL_PREFIX = "mcp_"`
    - `transformRequestBody(bodyString: string): string` — parse JSON, prefix tools, sanitize system prompt, re-stringify
    - `transformStreamChunk(text: string): string` — regex replace `"name": "mcp_X"` → `"name": "X"` in streaming response
    - `buildRequestHeaders(accessToken: string, originalHeaders: Headers): Headers` — build auth headers
    - `transformRequestUrl(input: RequestInfo): RequestInfo` — add `?beta=true` to messages endpoint
    - `createSystemTransformHook()` — returns the `experimental.chat.system.transform` hook function

  **Must NOT do**:
  - Do not create the full fetch interceptor — that's assembled in Task 6
  - Do not add any new transformations beyond what the original plugin does
  - Do not handle token refresh here — that's in oauth.ts

  **Recommended Agent Profile**:
  - **Category**: `medium`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `https://raw.githubusercontent.com/anomalyco/opencode-anthropic-auth/master/index.mjs` — The EXACT transformation logic to replicate. Key sections:
    - Lines 145-177: System prompt sanitization (regex `(?<!\/)opencode` to preserve paths)
    - Lines 179-189: Tool name prefixing in `tools` array
    - Lines 190-204: Tool name prefixing in `tool_use` message blocks
    - Lines 134-143: Header construction (authorization, anthropic-beta merge, user-agent, x-api-key removal)
    - Lines 208-220: URL beta parameter
    - Lines 230-248: Streaming response tool name un-prefixing (regex `/"name"\s*:\s*"mcp_([^"]+)"/g`)
    - Lines 73-80: System transform hook
  - IMPORTANT: Copy these transformations EXACTLY. Do not deviate. The server enforces specific patterns.

  **Acceptance Criteria**:

  - [x] Tests pass: `bun test src/__tests__/transform.test.ts` → PASS (7+ tests)
  - [x] Tool names correctly prefixed with `mcp_` in both definitions and usage blocks
  - [x] System prompt "OpenCode" → "Claude Code" (preserving paths)
  - [x] Streaming response strips `mcp_` prefix
  - [x] Headers correctly set (Bearer, beta merge, user-agent, no x-api-key)
  - [x] Beta query param added to /v1/messages URL

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Request body transformation matches original
    Tool: Bash
    Preconditions: Test fixtures with tool definitions and tool_use blocks
    Steps:
      1. Run: bun test src/__tests__/transform.test.ts --reporter=verbose
      2. Assert: All transformation tests pass
      3. Assert: Regex preserves paths like /path/to/opencode-foo
    Expected Result: Byte-identical transformations to original plugin
    Evidence: Test output captured

  Scenario: Stream response un-prefixing works
    Tool: Bash
    Preconditions: Test with SSE chunks containing "name": "mcp_bash"
    Steps:
      1. Run: bun test src/__tests__/transform.test.ts -t "stream"
      2. Assert: "mcp_bash" becomes "bash" in output
    Expected Result: Clean tool names in streaming responses
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `feat(transform): add request/response transformation layer matching original plugin`
  - Files: `src/transform.ts, src/__tests__/transform.test.ts`

---

- [x] 6. Plugin Entry Point — Assemble Everything

  **What to do**:
  - Implement `src/index.ts` — the main plugin export that wires everything together:
    1. **Plugin function**: `export async function AnthropicMultiAuthPlugin({ client }: PluginInput): Promise<Hooks>`
    2. **System transform hook**: `"experimental.chat.system.transform"` — inject "You are Claude Code" prefix (from transform.ts)
    3. **Auth hook**:
       - `provider: "anthropic"` — same as builtin, overrides it
       - `loader(getAuth, provider)`:
         - Load accounts from storage
         - If no accounts exist, return `{}` (fall through to builtin or API key)
         - Initialize AccountManager with loaded accounts
         - Call `selectBestAccount()` — fetches quota, picks lowest usage
         - Set active account
         - Zero out model costs (Pro/Max plan)
         - Return custom `fetch()` function:
           - Get active account from AccountManager
           - Refresh token if expired (via oauth.ts)
           - Transform request body (via transform.ts)
           - Build auth headers (via transform.ts)
           - Make the actual API call
           - On 429 response: call `AccountManager.handleRateLimit(retryAfterMs)`, retry with new account
           - On success: transform streaming response (un-prefix tool names)
           - On all accounts exhausted: throw descriptive error
       - `methods`:
         - Method 1: "Claude Pro/Max" OAuth login
           - On authorize: generate PKCE URL via oauth.ts
           - **METIS CRITICAL**: The multi-account login loop MUST happen INSIDE the `callback(code)` function body. OpenCode's auth flow is single-shot: authorize() → user pastes code → callback(code) → done. The callback must:
             1. Exchange the code for tokens (via oauth.ts exchange())
             2. Store the account in anthropic-accounts.json (via storage.ts addAccount())
             3. Use `readline` from `node:readline` (NOT @clack/prompts) to prompt "Add another account? (N added) (y/n)"
             4. If yes: generate new PKCE URL via authorize(), print URL to stdout, use readline to wait for the new code, exchange it, store it, repeat step 3
             5. When user says no: return the LAST/active account's creds as `{ type: "success", refresh, access, expires }`
           - This pattern matches antigravity-auth's `promptAddAnotherAccount()` in `src/plugin/cli.ts`
           - Each PKCE flow in the loop must use a FRESH verifier (generate new PKCE per account)
         - Method 2: "Manage Accounts" (list/remove)
           - Show numbered list of accounts with labels/emails
           - Allow removal by index
    4. **Handle first-time migration**: If storage file doesn't exist but auth.json has Anthropic OAuth creds, import them as the first account.
    5. **METIS AMENDMENT — Empty accounts fallback**: If `anthropic-accounts.json` has 0 accounts (or doesn't exist), `loader()` MUST return `{}` (empty object). This allows the builtin opencode-anthropic-auth's fetch to work as fallback, so users who haven't added accounts yet can still use the standard single-account flow.
    6. **METIS AMENDMENT — Auth.json sync on refresh**: When the active account's token is refreshed in the custom `fetch()`, also call `client.auth.set()` to keep auth.json in sync (ensures loader activation on next startup).
    5. **On 429 retry logic**:
       - Parse `retry-after` header from response
       - Mark current account as rateLimitedUntil = now + retryAfterMs
       - Switch to next account via AccountManager
       - If no accounts available, find shortest wait time and inform user (or retry after shortest wait)
       - Retry the SAME request with the new account's credentials

  **Must NOT do**:
  - Do not add new API features beyond what the original plugin provides
  - Do not add a usage dashboard
  - Do not add periodic background quota polling
  - Do not add health scores — keep selection simple (quota API + 429 fallback)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - This is the integration task — highest complexity, wires all modules together

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `https://raw.githubusercontent.com/anomalyco/opencode-anthropic-auth/master/index.mjs` — The COMPLETE original plugin. The entry point structure, auth hook shape, fetch interceptor pattern, and system transform hook should match this closely. Key: the entire `AnthropicAuthPlugin` function (lines 66-264) is the template.
  - `https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/src/plugin.ts` — Multi-account plugin entry point reference. Key patterns: AccountManager initialization, account selection on load, 429 handling with account rotation, "Add another account?" prompt loop (search for `promptAddAnotherAccount`).
  - `https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/src/plugin/cli.ts` — `promptAddAnotherAccount()` function: readline-based prompt for "Add another account? (N added) (y/n)"

  **API/Type References**:
  - Plugin type: `export type Plugin = (input: PluginInput) => Promise<Hooks>`
  - PluginInput: `{ client, project, directory, worktree, serverUrl, $ }`
  - AuthHook: `{ provider: string, loader?: (getAuth, provider) => Promise<Record>, methods: [...] }`
  - Auth methods OAuth type: `{ type: "oauth", label: string, authorize: () => Promise<{ url, instructions, method: "code", callback }> }`
  - OAuth callback result: `{ type: "success", refresh, access, expires, accountId? }` or `{ type: "failed" }`
  - `client.auth.set({ path: { id: "anthropic" }, body: { type: "oauth", refresh, access, expires } })` — must still set auth.json for OpenCode's internal use (use active account's creds)

  **Acceptance Criteria**:

  - [x] `bun run build` → produces `dist/index.mjs` without errors
  - [x] Plugin exports function matching `Plugin` type signature
  - [x] Auth hook registers with `provider: "anthropic"`
  - [x] Loader initializes AccountManager and selects best account on load
  - [x] Loader returns `{}` when no accounts configured (empty-accounts fallback)
  - [x] Custom fetch uses active account's Bearer token
  - [x] Custom fetch syncs auth.json via client.auth.set after active account token refresh
  - [x] Custom fetch does NOT read from getAuth() — uses own storage exclusively
  - [x] 429 response triggers account switch and request retry
  - [x] All-accounts-exhausted throws descriptive error with shortest wait time
  - [x] Login callback() contains the multi-account loop (readline-based, NOT after callback returns)
  - [x] Login flow supports adding multiple accounts with fresh PKCE per account
  - [x] First-time migration imports from auth.json
  - [x] "Manage Accounts" method shows and allows removal
  - [x] `bun test` → ALL tests pass (including new integration tests)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Plugin builds to valid ESM module
    Tool: Bash
    Preconditions: All source files complete
    Steps:
      1. Run: bun run build
      2. Assert: dist/index.mjs exists
      3. Run: node -e "import('./dist/index.mjs').then(m => console.log(typeof m.AnthropicMultiAuthPlugin))"
      4. Assert: Output is "function"
    Expected Result: Valid ESM module with exported plugin function
    Evidence: Terminal output captured

  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All modules implemented
    Steps:
      1. Run: bun test --reporter=verbose
      2. Assert: exit code 0
      3. Assert: All test files pass
      4. Assert: 0 failures
    Expected Result: Complete test suite green
    Evidence: Test output captured

  Scenario: 429 failover works in integration test
    Tool: Bash
    Preconditions: Integration test mocking fetch to return 429 then 200
    Steps:
      1. Run: bun test src/__tests__/integration.test.ts -t "failover"
      2. Assert: First request hits 429, account switches, retry succeeds
      3. Assert: rateLimitedUntil is set on first account
    Expected Result: Seamless failover on rate limit
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `feat(plugin): wire up multi-account auth plugin with quota selection and failover`
  - Files: `src/index.ts, src/__tests__/integration.test.ts`

---

- [x] 7. README, Build Verification & Final Polish

  **What to do**:
  - Create `README.md` with:
    - Project title and description
    - Installation: `Add "anthropic-multi-auth" to your opencode.json plugin array`
    - Configuration example (opencode.json)
    - Usage: How to add accounts, how selection works, how failover works
    - How it works (brief architecture)
    - Comparison with builtin `opencode-anthropic-auth`
    - Troubleshooting (common issues)
  - Final build verification:
    - `bun run build` → clean output
    - `bun test` → all pass
    - Verify package.json has correct `main`, `types`, `files` fields
    - Verify `.npmignore` or `files` field excludes test files from publish
  - Add `.gitignore` with node_modules, dist, .DS_Store
  - Polish package.json: add description, keywords, repository, license fields

  **Must NOT do**:
  - Do not publish to npm (manual step)
  - Do not add CI/CD configuration
  - Do not add contributing guidelines

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 6 — final)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/README.md` — Reference for plugin README structure

  **Acceptance Criteria**:

  - [x] README.md exists with installation, usage, and troubleshooting sections
  - [x] `bun run build` → exit code 0, dist/index.mjs exists
  - [x] `bun test` → exit code 0, all tests pass
  - [x] package.json has description, keywords, license, main, files fields
  - [x] .gitignore exists and excludes node_modules/dist

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Clean build and test from scratch
    Tool: Bash
    Preconditions: Final state of all files
    Steps:
      1. Run: rm -rf node_modules dist
      2. Run: bun install
      3. Assert: exit code 0
      4. Run: bun test
      5. Assert: exit code 0, all tests pass
      6. Run: bun run build
      7. Assert: exit code 0, dist/index.mjs exists
      8. Run: cat README.md | head -5
      9. Assert: Contains project name and description
    Expected Result: Clean install, test, build cycle works
    Evidence: Terminal output captured

  Scenario: Package is publish-ready
    Tool: Bash
    Preconditions: Build complete
    Steps:
      1. Run: bun pm pack --dry-run (or npm pack --dry-run)
      2. Assert: Package includes dist/index.mjs, README.md, package.json
      3. Assert: Package does NOT include src/__tests__/, node_modules/
    Expected Result: Clean publish package
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `docs: add README and finalize package for publishing`
  - Files: `README.md, .gitignore, package.json`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(scaffold): initialize anthropic-multi-auth project with TypeScript and vitest` | package.json, tsconfig.json, vitest.config.ts, src/** | `bun test` |
| 2 | `feat(storage): add multi-account storage manager with import migration` | src/storage.ts, src/types.ts, src/__tests__/storage.test.ts | `bun test` |
| 3 | `feat(oauth): add PKCE OAuth flow and token refresh for multi-account` | src/oauth.ts, src/__tests__/oauth.test.ts | `bun test` |
| 4 | `feat(quota): add quota-aware account selection with failover logic` | src/quota.ts, src/accounts.ts, src/__tests__/quota.test.ts, src/__tests__/accounts.test.ts | `bun test` |
| 5 | `feat(transform): add request/response transformation layer matching original plugin` | src/transform.ts, src/__tests__/transform.test.ts | `bun test` |
| 6 | `feat(plugin): wire up multi-account auth plugin with quota selection and failover` | src/index.ts, src/__tests__/integration.test.ts | `bun test && bun run build` |
| 7 | `docs: add README and finalize package for publishing` | README.md, .gitignore, package.json | `bun test && bun run build` |

---

## Success Criteria

### Verification Commands
```bash
bun install          # Expected: clean install, no errors
bun test             # Expected: all tests pass, 0 failures
bun run build        # Expected: dist/index.mjs created
```

### Final Checklist
- [x] All "Must Have" features present
- [x] All "Must NOT Have" exclusions respected
- [x] All tests pass (`bun test`)
- [x] Build succeeds (`bun run build`)
- [x] Plugin exports valid function matching Plugin type
- [x] Can add multiple accounts via login flow
- [x] Quota API correctly selects lowest-usage account
- [x] 429 failover switches accounts and retries
- [x] All original plugin transformations work identically
- [x] README documents usage clearly
