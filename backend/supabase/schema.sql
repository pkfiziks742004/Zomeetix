-- Zomeetix (Supabase Postgres) schema
-- Run this file in Supabase SQL editor before starting the backend.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- Users (custom auth store)
-- =========================
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  token text,
  token_hash text,
  token_expires_at timestamptz,
  role text not null default 'user' check (role in ('user','host','admin')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_token_hash_idx on public.users (token_hash);
create index if not exists users_is_active_idx on public.users (is_active);
create index if not exists users_role_idx on public.users (role);
create index if not exists users_last_login_at_idx on public.users (last_login_at);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute procedure public.set_updated_at();

-- =========================
-- User profiles (optional)
-- =========================
create table if not exists public.user_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  display_name text not null default '',
  organization text not null default '',
  work_role text not null default '',
  phone text not null default '',
  bio text not null default '',
  location text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_updated_at_idx on public.user_profiles (updated_at desc);

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute procedure public.set_updated_at();

-- ======================
-- Email OTP (verification)
-- ======================
create table if not exists public.auth_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null default 'auth',
  code_hash text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  verified_at timestamptz,
  verification_token_hash text,
  verification_expires_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_otps_email_purpose_idx on public.auth_otps (email, purpose);
create index if not exists auth_otps_expires_at_idx on public.auth_otps (expires_at);
create index if not exists auth_otps_consumed_at_idx on public.auth_otps (consumed_at);

drop trigger if exists set_auth_otps_updated_at on public.auth_otps;
create trigger set_auth_otps_updated_at
before update on public.auth_otps
for each row execute procedure public.set_updated_at();

-- ==========================
-- Meeting rooms (scheduled)
-- ==========================
create table if not exists public.meeting_rooms (
  id uuid primary key default gen_random_uuid(),
  meeting_id text not null unique,
  password_hash text not null,
  host_user_id uuid not null references public.users (id) on delete cascade,
  host_email text not null,
  created_by_name text not null,
  scheduled_start_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes >= 1 and duration_minutes <= 720),
  scheduled_end_at timestamptz not null,
  reminder_at timestamptz not null,
  reminder_sent_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_rooms_host_user_id_idx on public.meeting_rooms (host_user_id);
create index if not exists meeting_rooms_is_active_idx on public.meeting_rooms (is_active);
create index if not exists meeting_rooms_start_at_idx on public.meeting_rooms (scheduled_start_at);
create index if not exists meeting_rooms_end_at_idx on public.meeting_rooms (scheduled_end_at);
create index if not exists meeting_rooms_reminder_at_idx on public.meeting_rooms (reminder_at);

drop trigger if exists set_meeting_rooms_updated_at on public.meeting_rooms;
create trigger set_meeting_rooms_updated_at
before update on public.meeting_rooms
for each row execute procedure public.set_updated_at();

-- ======================
-- Meetings history (per user)
-- ======================
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  meeting_code text not null,
  date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_user_email_date_idx on public.meetings (user_email, date desc);

drop trigger if exists set_meetings_updated_at on public.meetings;
create trigger set_meetings_updated_at
before update on public.meetings
for each row execute procedure public.set_updated_at();

-- ======================
-- Admin policy (singleton)
-- ======================
create table if not exists public.admin_policies (
  singleton_key text primary key default 'global',
  allow_guest_join boolean not null default true,
  enforce_waiting_room boolean not null default false,
  max_meeting_duration_minutes integer not null default 120 check (max_meeting_duration_minutes between 15 and 720),
  recording_retention_days integer not null default 30 check (recording_retention_days between 1 and 3650),
  require_strong_meeting_password boolean not null default true,
  updated_by_user_id uuid references public.users (id),
  updated_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_admin_policies_updated_at on public.admin_policies;
create trigger set_admin_policies_updated_at
before update on public.admin_policies
for each row execute procedure public.set_updated_at();

insert into public.admin_policies (singleton_key)
values ('global')
on conflict (singleton_key) do nothing;

-- ======================
-- Admin audit logs
-- ======================
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.users (id) on delete cascade,
  admin_email text not null,
  action text not null,
  target_type text not null,
  target_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  ip_address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs (action);
create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);

drop trigger if exists set_admin_audit_logs_updated_at on public.admin_audit_logs;
create trigger set_admin_audit_logs_updated_at
before update on public.admin_audit_logs
for each row execute procedure public.set_updated_at();

-- ======================
-- Password reset tokens
-- ======================
create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  ip_address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists password_reset_tokens_token_hash_idx on public.password_reset_tokens (token_hash);
create index if not exists password_reset_tokens_user_id_idx on public.password_reset_tokens (user_id);
create index if not exists password_reset_tokens_email_idx on public.password_reset_tokens (email);
create index if not exists password_reset_tokens_expires_at_idx on public.password_reset_tokens (expires_at);
create index if not exists password_reset_tokens_consumed_at_idx on public.password_reset_tokens (consumed_at);

drop trigger if exists set_password_reset_tokens_updated_at on public.password_reset_tokens;
create trigger set_password_reset_tokens_updated_at
before update on public.password_reset_tokens
for each row execute procedure public.set_updated_at();
