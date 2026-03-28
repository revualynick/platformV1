// Set required env vars before any module imports
process.env.INTERNAL_API_SECRET = "test-internal-secret";
process.env.ORG_ID = "smoke-test-org";
process.env.DATABASE_URL ??= "postgres://revualy:revualy@localhost:5432/revualy_dev";
