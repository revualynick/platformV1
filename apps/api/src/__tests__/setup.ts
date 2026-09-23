// Set required env vars before any module imports
process.env.INTERNAL_API_SECRET = "test-internal-secret";
process.env.ORG_ID = "smoke-test-org";
process.env.WS_TOKEN_SECRET ??= "test-ws-token-secret-at-least-32-chars";
// Fixed test-only key (not a real secret) so encrypted columns work in tests.
process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
delete process.env.ENCRYPTION_KEYS;
process.env.DATABASE_URL ??= "postgres://revualy:revualy@localhost:5432/revualy_dev";
