-- =====================================================================
-- Class Planner — initial schema (Supabase / Postgres)
-- Reference tables: readable by everyone, written only by the importer
--   (service role key, which bypasses RLS).
-- User tables: each user can only see and change their own rows.
-- =====================================================================

-- ---------- Reference data ----------

create table districts (
  id   text primary key,              -- 'fhda' | 'smccd' | 'ccsf'
  name text not null
);

create table colleges (
  id              text primary key,   -- 'deanza', 'skyline', 'csm', 'canada', 'ccsf'
  district_id     text not null references districts(id),
  name            text not null,
  term_system     text not null check (term_system in ('quarter', 'semester')),
  rmp_school_name text
);

create table terms (
  id                 text primary key, -- 'deanza-2027-winter'
  college_id         text not null references colleges(id),
  season             text not null check (season in ('fall', 'winter', 'spring', 'summer')),
  year               int  not null,
  start_date         date not null,
  end_date           date not null,
  registration_opens date,
  unique (college_id, season, year)
);

create table courses (
  college_id        text not null references colleges(id),
  code              text not null,     -- canonical, e.g. 'MATH 1A'
  title             text not null,
  units             numeric(4,2) not null, -- in the college's term system
  prerequisite_text text,
  prerequisites     jsonb,             -- ReqExpr
  primary key (college_id, code)
);

create table sections (
  id              text primary key,    -- '<term_id>:<crn>'
  term_id         text not null references terms(id) on delete cascade,
  course_code     text not null,
  crn             text not null,
  instructor_name text,                -- null = Staff/TBA (still shown)
  modality        text not null check (modality in ('in_person', 'online_sync', 'online_async', 'hybrid')),
  meetings        jsonb not null default '[]', -- Meeting[]
  seat_capacity   int,
  seat_enrolled   int,
  seat_waitlisted int,
  seat_status     text check (seat_status in ('open', 'waitlist', 'full', 'cancelled')),
  last_seen_at    timestamptz not null default now(),
  unique (term_id, crn)
);
create index sections_term_course_idx on sections (term_id, course_code);

create table transfer_agreements (
  id              text primary key,
  from_college_id text not null references colleges(id),
  to_institution  text not null,
  major           text not null,
  academic_year   text not null,       -- '2026-2027'
  data            jsonb not null,      -- full TransferAgreement
  unique (from_college_id, to_institution, major, academic_year)
);

create table import_runs (
  id             uuid primary key default gen_random_uuid(),
  district_id    text not null references districts(id),
  term_id        text not null references terms(id),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null check (status in ('running', 'ok', 'failed', 'empty')),
  sections_found int not null default 0,
  error          text
);

-- ---------- User data ----------

create table profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  college_id         text not null references colleges(id),
  major              text not null,
  goal               jsonb not null,   -- Goal
  max_units_per_term numeric(4,1),
  updated_at         timestamptz not null default now()
);

-- Parsed audit only. Never the raw PDF, name, student ID, or GPA.
create table audit_snapshots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  district_id  text not null references districts(id),
  audit_date   date,
  catalog_year text,
  degree       text,
  courses      jsonb not null,         -- CourseRecord[]
  requirements jsonb not null,         -- AuditRequirement[]
  created_at   timestamptz not null default now()
);
create index audit_snapshots_user_idx on audit_snapshots (user_id, created_at desc);

create table availability (
  user_id                uuid not null references auth.users(id) on delete cascade,
  term_id                text not null references terms(id),
  blocks                 jsonb not null default '[]', -- TimeBlock[]
  commute_buffer_minutes int  not null default 0 check (commute_buffer_minutes between 0 and 180),
  allow_online_async     boolean not null default true,
  updated_at             timestamptz not null default now(),
  primary key (user_id, term_id)
);

create table saved_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  term_id     text not null references terms(id),
  name        text not null,
  section_ids text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------- Row level security ----------

alter table districts           enable row level security;
alter table colleges            enable row level security;
alter table terms               enable row level security;
alter table courses             enable row level security;
alter table sections            enable row level security;
alter table transfer_agreements enable row level security;
alter table import_runs         enable row level security; -- no policies: service role only

create policy "public read" on districts           for select using (true);
create policy "public read" on colleges            for select using (true);
create policy "public read" on terms               for select using (true);
create policy "public read" on courses             for select using (true);
create policy "public read" on sections            for select using (true);
create policy "public read" on transfer_agreements for select using (true);

alter table profiles        enable row level security;
alter table audit_snapshots enable row level security;
alter table availability    enable row level security;
alter table saved_plans     enable row level security;

create policy "own rows" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on audit_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on availability
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on saved_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Seed ----------

insert into districts (id, name) values
  ('fhda',  'Foothill-De Anza CCD'),
  ('smccd', 'San Mateo County CCD'),
  ('ccsf',  'City College of San Francisco');

insert into colleges (id, district_id, name, term_system, rmp_school_name) values
  ('deanza',  'fhda',  'De Anza College',                'quarter',  'De Anza College'),
  ('skyline', 'smccd', 'Skyline College',                'semester', 'Skyline College'),
  ('csm',     'smccd', 'College of San Mateo',           'semester', 'College of San Mateo'),
  ('canada',  'smccd', 'Cañada College',                 'semester', 'Canada College'),
  ('ccsf',    'ccsf',  'City College of San Francisco',  'semester', 'City College of San Francisco');
