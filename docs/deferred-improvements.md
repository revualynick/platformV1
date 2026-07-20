# Deferred Improvements — March 28, 2026

Items identified during performance and architecture work that are deferred for now.

---

## Database Access

### Read-only DB credentials for Next.js
- Give `apps/web` a separate Postgres role with SELECT-only permissions
- **Why deferred:** Adds operational complexity (separate credentials per service) for minimal security gain in per-tenant isolated deployments where each customer has their own DB
- **When to do:** Before onboarding enterprise customers or if compliance requires it

### Parity tests for migrated endpoints
- Automated tests comparing old API response vs new read service response
- Auth matrix tests: employee/manager/admin/self/direct-report/out-of-scope
- **Why deferred:** Pre-launch demo product, no real users yet
- **When to do:** Before migrating the last batch of endpoints, or when adding CI

---

## Caching

### Service-layer caching (unstable_cache / use cache)
- Currently cache lives at the page/component level via `fetch` revalidation tiers
- Could move caching into the read service layer for finer-grained control
- **Why deferred:** Simpler to reason about, fewer invalidation bugs at page level
- **When to do:** When direct DB reads replace apiFetch — page-level fetch caching won't apply to direct queries, so service-level caching with `unstable_cache` or `use cache` will be needed

---

## Security (from earlier reviews)

### Interaction scheduler timezone handling
- Needs `date-fns-tz` dependency for proper timezone-aware scheduling
- **When to do:** Before enabling scheduled interactions for non-UTC customers

### Encryption format unification
- Two incompatible AES-256-GCM formats: `@revualy/shared` (binary base64) vs `apps/api` (colon-delimited base64)
- **When to do:** Next time encryption code is touched, or before adding more encrypted fields

### Dialog UX polish
- Escape-to-close, backdrop-click-to-close for modal dialogs
- **When to do:** Next UI polish pass

### COMMON_TIMEZONES duplication
- Same timezone list defined in multiple components
- **When to do:** Next DRY cleanup pass
