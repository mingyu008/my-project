-- Flyway callback, runs after every migrate (idempotent). Same reason as V2__enable_rls.sql: keep the
-- Supabase Data API roles away from Flyway's history table (they could otherwise edit it and break deploys).
alter table if exists flyway_schema_history enable row level security;
