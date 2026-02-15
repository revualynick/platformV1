-- Create the tenant dev database
CREATE DATABASE revualy_dev;

-- Enable pgvector on both databases
\c revualy_control
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c revualy_dev
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
