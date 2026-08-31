create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  language text not null default 'en',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  reminder_preferences jsonb not null default '{}'::jsonb,
  default_activity_difficulty text not null default 'medium',
  voice_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_preferences_difficulty_check check (default_activity_difficulty in ('easy', 'medium', 'hard'))
);

create table public.context_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  is_enabled boolean not null default true,
  priority integer not null default 0 check (priority between -10000 and 10000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.context_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.context_modules(id) on delete cascade,
  item_type text not null default 'text',
  content text not null check (char_length(trim(content)) between 1 and 10000),
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (module_id, id)
);

create table public.context_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid references public.context_modules(id) on delete set null,
  item_id uuid references public.context_items(id) on delete set null,
  version integer not null,
  change_type text not null check (change_type in ('insert', 'update', 'delete')),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index context_modules_user_priority_idx on public.context_modules (user_id, priority desc, updated_at desc);
create index context_modules_user_updated_idx on public.context_modules (user_id, updated_at desc);
create index context_items_module_order_idx on public.context_items (module_id, sort_order, created_at);
create index context_items_user_idx on public.context_items (user_id);
create index context_revisions_user_created_idx on public.context_revisions (user_id, created_at desc);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
drop trigger if exists context_modules_updated_at on public.context_modules;
create trigger context_modules_updated_at before update on public.context_modules for each row execute function public.set_updated_at();
drop trigger if exists context_items_updated_at on public.context_items;
create trigger context_items_updated_at before update on public.context_items for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))) on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.bump_context_version()
returns trigger
language plpgsql
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

create trigger context_modules_bump_version before update on public.context_modules for each row execute function public.bump_context_version();
create trigger context_items_bump_version before update on public.context_items for each row execute function public.bump_context_version();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.record_context_revision()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_table_name = 'context_modules' then
    insert into public.context_revisions (user_id, module_id, version, change_type, snapshot)
    values (
      case when tg_op = 'DELETE' then old.user_id else new.user_id end,
      case when tg_op = 'DELETE' then old.id else new.id end,
      case when tg_op = 'DELETE' then old.version else new.version end,
      lower(tg_op),
      case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
    );
  else
    insert into public.context_revisions (user_id, module_id, item_id, version, change_type, snapshot)
    values (
      case when tg_op = 'DELETE' then old.user_id else new.user_id end,
      case when tg_op = 'DELETE' then old.module_id else new.module_id end,
      case when tg_op = 'DELETE' then old.id else new.id end,
      case when tg_op = 'DELETE' then old.version else new.version end,
      lower(tg_op),
      case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger context_modules_revision after insert or update or delete on public.context_modules for each row execute function public.record_context_revision();
create trigger context_items_revision after insert or update or delete on public.context_items for each row execute function public.record_context_revision();

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.context_modules enable row level security;
alter table public.context_items enable row level security;
alter table public.context_revisions enable row level security;

create policy profiles_owner_all on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy preferences_owner_all on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy modules_owner_all on public.context_modules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy items_owner_all on public.context_items for all using (user_id = auth.uid() and exists (select 1 from public.context_modules m where m.id = module_id and m.user_id = auth.uid())) with check (user_id = auth.uid() and exists (select 1 from public.context_modules m where m.id = module_id and m.user_id = auth.uid()));
create policy revisions_owner_select on public.context_revisions for select using (user_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.user_preferences, public.context_modules, public.context_items to authenticated;
grant select on public.context_revisions to authenticated;
