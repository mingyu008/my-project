-- Hangul nickname, the login name in test mode (app.auth.test-mode). Nullable: existing accounts have none.
-- A unique constraint allows any number of NULLs in PostgreSQL.

alter table users add column nickname varchar(20);
alter table users add constraint uk_users_nickname unique (nickname);
