-- Extensions the migrations need (pgvector; pgcrypto for 0043).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
