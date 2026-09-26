# Security Review — March 28, 2026

Combined findings from Codex (4 focused reviews) and Claude reviewer agent.

---

## CRITICAL

### 1. TOCTOU race in first-user super_admin assignment
**File:** `apps/api/src/modules/auth/routes.ts:105-123`

The provision flow does `SELECT COUNT(*) → if 0, insert with role super_admin`. Two concurrent first-sign-in requests (distinct emails) can both read `count = 0` and both get inserted as `super_admin`. The `onConflictDoUpdate` only protects duplicate-email races, not distinct-email races.

**Fix:** Use an advisory lock or atomic conditional: `INSERT ... SET role = CASE WHEN (SELECT COUNT(*) FROM users) = 1 THEN 'super_admin' ELSE 'employee' END`.

### 2. Decrypted integration secrets returned in API responses
**Files:** `apps/api/src/modules/org/routes.ts:370-376, 398-401, 427-430`

`GET /admin/integrations`, `PATCH /admin/integrations/:id`, and `POST /admin/integrations/:id/connect` all decrypt `config._encrypted` and send plaintext back. Slack bot tokens, GChat service account JSON, Teams app passwords, and Google OAuth secrets are exposed to the browser on every page load. Leakable via dev tools, logs, proxies.

**Fix:** Never return config to client. Return `{ hasConfig: true }` instead. The frontend has no need to redisplay stored secrets.

### 3. Unsafe encryption key fallback
**File:** `apps/api/src/lib/encryption.ts:6-13`

When `ENCRYPTION_KEY` is absent, code derives AES key from `SHA-256(INTERNAL_API_SECRET)` or the hardcoded string `"dev-fallback-key"`. This is deterministic, unsalted, single-iteration, and couples encryption to another secret. The hardcoded fallback means encryption silently proceeds with a universally known key if both env vars are missing.

**Fix:** Require `ENCRYPTION_KEY` in production with a hard throw. Validate it's exactly 32 bytes (64 hex chars). In dev, derive from `INTERNAL_API_SECRET` but warn loudly and refuse to start without at least that.

---

## HIGH

### 4. Server actions missing Zod validation
**Files:** `apps/web/src/app/(admin)/settings/actions.ts`

- `addPerson` (line ~188): No Zod schema. Email, name, role, teamId forwarded as raw strings. Role accepts any value including `super_admin` (API blocks it, but action should validate first).
- `importPeople` (line ~209): Accepts client-constructed array with no server-side validation. Email format, role enum, size limits all unchecked.
- `importValues` (line ~104): Same pattern — no Zod, no length/format checks.
- `changeUserRole` (line ~323): Takes role from FormData without enum validation.
- `connectPlatform` (line ~226): Integration ID not UUID-validated. Config parsed with bare `JSON.parse`, no schema.
- `updateOrg` (line ~269): Domain strings not format-validated. Arbitrary strings stored in allowed_domains.
- `disconnectPlatform`, `deactivateUserAction`, `reactivateUserAction`: IDs only checked for truthiness, not UUID format.

**Fix:** Add Zod schemas to all actions at the action boundary. Don't rely on API-level validation as the only defense.

### 5. No unique constraint on integrations.platform
**Files:** `packages/db/src/schema/tenant.ts`, `apps/api/src/modules/org/routes.ts:359-369`

The lazy-seed in `GET /admin/integrations` checks `rows.length === 0` then inserts 4 rows. Under concurrent requests, both can see empty and insert, creating duplicates. No unique constraint prevents this.

**Fix:** Add `unique("uq_integrations_platform").on(table.platform)` to schema, update migration, use `.onConflictDoNothing()` in the seed insert.

---

## MEDIUM

### 6. Silent decryption failure hides tampering
**File:** `apps/api/src/lib/encryption.ts:42-48`

`decryptConfig()` catches all errors (including auth-tag failures and key mismatches) and returns `{}`. This hides tampering, corruption, and key misconfiguration. System behaves as if secrets were simply unset.

**Fix:** Let decryption errors propagate. Log them. Return 500 to the caller rather than silently degrading.

### 7. Domain restrictions don't block existing users
**Files:** `apps/api/src/modules/auth/routes.ts:72-103`, `apps/web/src/lib/auth.ts:169`

The sign-in flow calls `lookupUserByEmail` first. If the user exists, sign-in succeeds without checking `allowedDomains`. Domain restrictions only apply to new provisioning. Removing a domain from the allowlist doesn't block existing users from signing in.

**Fix:** Add domain check to the lookup flow, or document this as intentional behavior. Consider a separate "blocked domains" list for revocation.

### 8. GET /users/:id returns full profile to any authenticated user (IDOR)
**File:** `apps/api/src/modules/users/routes.ts:102-111`

The route has `requireAuth` but no role check. Any employee can call `GET /users/<any-uuid>` and retrieve name, email, role, teamId, managerId, timezone, preferences, and isActive for any user.

**Fix:** Return scoped projection for non-admin callers (e.g., only name/email/role for same-team members), or restrict to self + direct reports + admins.

### 9. Integration config stored as opaque JSONB with no key validation
**File:** `apps/api/src/lib/validation.ts:347`

`connectIntegrationSchema` uses `z.record(z.unknown())` which accepts arbitrary objects including prototype-pollution-style keys. No platform-specific config schemas.

**Fix:** Define per-platform config schemas (e.g., Slack requires `botToken` + `signingSecret`). Reject unknown keys.

### 10. Lazy-seed race on integrations (duplicate of #5)
**File:** `apps/api/src/modules/org/routes.ts:359-369`

Concurrent requests to `GET /admin/integrations` on an empty table will both insert, creating duplicate rows.

**Fix:** Use `.onConflictDoNothing()` on the insert + add unique constraint.

### 11. Calendar tokens stored in plaintext
**File:** `packages/db/src/schema/tenant.ts:608-630`

`calendarTokens.access_token` and `calendarTokens.refresh_token` are plaintext text columns. These can contain long-lived Google OAuth refresh tokens. The same `encryptConfig`/`decryptConfig` treatment applied to integrations should be applied here.

### 12. Auth OAuth tokens stored in plaintext
**File:** `packages/db/src/schema/tenant.ts:934-956`

`auth_account.access_token`, `refresh_token`, `id_token` are plaintext. Set by NextAuth's DrizzleAdapter. A DB backup leak exposes Google access tokens.

---

## LOW

### 13. CSV parser doesn't validate role enum
**File:** `apps/web/src/app/(admin)/settings/people/people-actions.tsx:46`

CSV parser accepts any string in role column. Invalid roles pass through to preview without flagging. API will reject them, but error is generic "Failed to import" instead of row-specific.

**Fix:** Validate role in parser, highlight invalid rows in preview before submission.

### 14. AddPerson dialog shows admin option to non-super-admin
**File:** `apps/web/src/app/(admin)/settings/people/people-actions.tsx:173-180`

The `<select>` includes `admin` for all callers. API rejects it for non-super-admin, but UX is misleading.

**Fix:** Conditionally render role options based on current user's role (like `ChangeRoleDialog` does).

### 15. Misconfigured INTERNAL_API_SECRET in non-production allows header spoofing
**File:** `apps/api/src/lib/tenant-context.ts:76`

If `INTERNAL_API_SECRET` is unset and `NODE_ENV !== "production"`, requests are accepted without secret validation. An attacker who can reach the API directly could spoof `x-user-id` headers.

**Fix:** Always require the secret, even in development. Remove the non-production bypass.

### 16. No encryption key rotation support
**File:** `apps/api/src/lib/encryption.ts`

No key version metadata stored with ciphertext. Rotating `ENCRYPTION_KEY` makes all previously encrypted data unreadable with no migration path.

**Fix:** Store a `keyVersion` alongside `_encrypted`. Support decrypting with previous keys during rotation.

---

## Status

| # | Severity | Status |
|---|----------|--------|
| 1 | CRITICAL | Fixed |
| 2 | CRITICAL | Fixed |
| 3 | CRITICAL | Fixed |
| 4 | HIGH | Fixed |
| 5 | HIGH | Fixed |
| 6 | MEDIUM | Fixed |
| 7 | MEDIUM | Documented |
| 8 | MEDIUM | Fixed |
| 9 | MEDIUM | Fixed |
| 10 | MEDIUM | Fixed (same as #5) |
| 11 | MEDIUM | Tracked |
| 12 | MEDIUM | Tracked |
| 13 | LOW | Fixed |
| 14 | LOW | Fixed |
| 15 | LOW | Fixed |
| 16 | LOW | Tracked |
