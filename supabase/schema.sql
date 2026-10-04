-- Public, read-only tournament document (single row)
create table public.tournament (
  id text primary key,
  data jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.tournament enable row level security;
create policy "tournament is publicly readable"
  on public.tournament for select
  to anon, authenticated
  using (true);
-- No insert/update/delete policies: only the edge function (service role) can write.
insert into public.tournament (id, data, version) values ('main', null, 0);

-- Organizer secret (salted SHA-256). RLS on, no policies: unreadable via the API.
create table public.organizer_secret (
  id integer primary key,
  salt text not null,
  hash text not null
);
alter table public.organizer_secret enable row level security;
-- The real salt/hash were inserted separately and are intentionally not stored in this file:
-- insert into public.organizer_secret (id, salt, hash) values (1, '<salt>', sha256(salt || passcode) as hex);
