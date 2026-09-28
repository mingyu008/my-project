-- Rewards for a student's study day (TASK-TIMER-02). The reward table now covers two targets:
--   SCHEDULE: schedule_id set (existing rows)
--   STUDY:    study_date + study_sec (the day's study time when the reward was given), no schedule

alter table schedule_rewards alter column schedule_id drop not null;

alter table schedule_rewards add column source varchar(20) not null default 'SCHEDULE';
alter table schedule_rewards alter column source drop default;
alter table schedule_rewards add constraint ck_schedule_rewards_source check (source in ('SCHEDULE', 'STUDY'));

alter table schedule_rewards add column study_date date;
alter table schedule_rewards add column study_sec integer;

alter table schedule_rewards add constraint ck_schedule_rewards_target check (
    (source = 'SCHEDULE' and schedule_id is not null)
    or (source = 'STUDY' and schedule_id is null and study_date is not null and study_sec is not null)
);

create index idx_schedule_rewards_recipient_study_date on schedule_rewards (recipient_id, study_date);
