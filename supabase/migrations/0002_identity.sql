-- 0002 — Identity & access tables (docs/05_Schema.md §3)

create table public.admins (
  id              uuid primary key default gen_random_uuid(),
  email           extensions.citext not null unique,
  display_name    text not null check (char_length(display_name) between 1 and 80),
  password_hash   text not null,
  is_active       boolean not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.students (
  id                   uuid primary key default gen_random_uuid(),
  mobile               text not null unique check (mobile ~ '^01[3-9][0-9]{8}$'),
  email                extensions.citext not null check (char_length(email) <= 254),
  pin_hash             text not null,
  must_change_pin      boolean not null default true,
  pin_updated_at       timestamptz not null default now(),
  status               public.student_status not null default 'active',
  access_starts_at     timestamptz not null,
  access_expires_at    timestamptz not null,
  plan_id              uuid,                                            -- FK to plans added in 0003
  credentials_status   public.credentials_status not null default 'pending',
  credentials_sent_at  timestamptz,
  display_name         text check (char_length(display_name) <= 40),    -- R2 (no UI in R1)
  admin_label          text check (char_length(admin_label) <= 40),
  admin_note           text check (char_length(admin_note) <= 2000),
  status_reason        text check (char_length(status_reason) <= 500),
  status_changed_at    timestamptz,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint students_access_range check (access_expires_at > access_starts_at)
);
create index students_email_idx       on public.students (email);
create index students_status_exp_idx  on public.students (status, access_expires_at);
create index students_label_idx       on public.students (admin_label) where admin_label is not null;
create index students_mobile_trgm_idx on public.students using gin (mobile extensions.gin_trgm_ops);

create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  token_hash     bytea not null unique,                 -- sha256(token)
  student_id     uuid references public.students(id) on delete cascade,
  admin_id       uuid references public.admins(id)   on delete cascade,
  remember       boolean not null default false,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  revoke_reason  text check (revoke_reason in ('logout', 'new_login', 'pin_changed', 'admin_force_logout',
                                               'admin_cancel', 'admin_suspend', 'admin_pin_reset')),
  ip             inet,
  user_agent     text check (char_length(user_agent) <= 400),
  constraint sessions_one_principal check ((student_id is null) <> (admin_id is null))
);
create index sessions_student_active_idx on public.sessions (student_id, created_at desc) where revoked_at is null;
create index sessions_admin_active_idx   on public.sessions (admin_id) where revoked_at is null;
create index sessions_expires_idx        on public.sessions (expires_at);

create table public.rate_limit_events (
  id          bigint generated always as identity primary key,
  bucket      text not null check (bucket in ('login_fail_mobile', 'login_ip', 'admin_login_fail',
                                              'admin_login_ip', 'enroll_ip', 'sample_ip')),
  subject     text not null,
  created_at  timestamptz not null default now()
);
create index rate_limit_lookup_idx on public.rate_limit_events (bucket, subject, created_at desc);

create trigger admins_updated_at   before update on public.admins   for each row execute function public.set_updated_at();
create trigger students_updated_at before update on public.students for each row execute function public.set_updated_at();
