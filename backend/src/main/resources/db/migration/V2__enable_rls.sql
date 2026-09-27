-- Row Level Security on every table, with no policies (TASK-15, DECISIONS D-044).
--
-- Supabase exposes the public schema through its Data API (PostgREST) to the anon/authenticated roles,
-- and the anon key is public by design. With RLS enabled and no policies, those roles can read or change
-- nothing. The application connects as the table owner, which bypasses RLS (no FORCE), so it is unaffected.
-- Plain PostgreSQL syntax: harmless on Neon or any other PostgreSQL.
--
-- Every future table needs the same statement in its migration. Flyway's own history table is handled by
-- afterMigrate__rls_history.sql (altering it inside a migration deadlocks against Flyway's lock on it).

alter table users enable row level security;
alter table user_roles enable row level security;
alter table posts enable row level security;
alter table schedules enable row level security;
alter table schedule_rewards enable row level security;
