-- Audience-targeted announcement banners shown on /courses/.
-- One row per audience; the admin edits each message, and RLS controls who can
-- read each one so course-specific messages are only visible to paying students.
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
--   audience values:
--     'everyone'      -> shown to every signed-in user
--     'enrolled_any'  -> users who paid for at least one course
--     'ap' / 'fma' / 'usapho' -> users who paid for that specific course

create table if not exists public.announcements (
  audience text primary key,
  message text not null default '',
  updated_at timestamptz default now(),
  constraint announcements_audience_valid
    check (audience in ('everyone','enrolled_any','ap','fma','usapho'))
);

-- Ensure all five rows exist so the admin can always update them.
insert into public.announcements (audience, message) values
  ('everyone',''), ('enrolled_any',''), ('ap',''), ('fma',''), ('usapho','')
  on conflict (audience) do nothing;

alter table public.announcements enable row level security;

-- ---------------------------------------------------------------------------
-- Read: audience-gated. A user only receives the rows meant for them; the
-- admin receives all rows (so the editor can load every message).
-- ---------------------------------------------------------------------------
drop policy if exists "read announcements by audience" on public.announcements;
create policy "read announcements by audience"
  on public.announcements for select
  using (
    audience = 'everyone'
    or (auth.jwt() ->> 'email') = 'cambphys@gmail.com'
    or (audience in ('ap','fma','usapho') and exists (
          select 1 from public.enrollments e
          where e.user_id = auth.uid()
            and e.course_id = announcements.audience
            and e.upgraded = true))
    or (audience = 'enrolled_any' and exists (
          select 1 from public.enrollments e
          where e.user_id = auth.uid() and e.upgraded = true))
  );

-- ---------------------------------------------------------------------------
-- Write: admin only (cambphys@gmail.com). Enforced Postgres-side via the JWT,
-- so it cannot be spoofed from the browser.
-- ---------------------------------------------------------------------------
drop policy if exists "admin updates announcement" on public.announcements;
create policy "admin updates announcement"
  on public.announcements for update
  using ((auth.jwt() ->> 'email') = 'cambphys@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'cambphys@gmail.com');

drop policy if exists "admin inserts announcement" on public.announcements;
create policy "admin inserts announcement"
  on public.announcements for insert
  with check ((auth.jwt() ->> 'email') = 'cambphys@gmail.com');
