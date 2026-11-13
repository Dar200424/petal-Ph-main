-- Petal-PH database schema for Supabase
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).

create table if not exists public.users (
  id text primary key,
  email text not null,
  nickname text not null,
  status text,
  anniversary date,
  phone text,
  location text,
  password text not null,
  avatar text default '',
  created_at timestamptz
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  price numeric not null default 0,
  season text,
  stock integer not null default 0,
  image text,
  description text default '',
  available boolean not null default true
);

create table if not exists public.orders (
  id text primary key,
  user_id text,
  user_email text,
  user_name text,
  product_id text,
  product_name text,
  season text,
  qty integer not null default 1,
  total numeric not null default 0,
  payment text,
  address text default '',
  notes text default '',
  status text default 'Pending',
  delivery_personnel text default '',
  delivery_fee numeric default 0,
  delivery_status text default 'Preparing',
  created_at timestamptz
);

create table if not exists public.messages (
  id text primary key,
  user_id text,
  sender text not null,
  body text not null,
  read_by_user boolean default false,
  read_by_admin boolean default false,
  created_at timestamptz
);

create table if not exists public.couriers (
  id text primary key,
  name text not null
);

-- Row Level Security: public read/write for this student project.
-- Tighten these policies before any real deployment.
drop policy if exists "petal users read" on public.users;
drop policy if exists "petal users insert" on public.users;
drop policy if exists "petal users update" on public.users;
drop policy if exists "petal users delete" on public.users;
create policy "petal users read" on public.users for select using (true);
create policy "petal users insert" on public.users for insert with check (true);
create policy "petal users update" on public.users for update using (true);
create policy "petal users delete" on public.users for delete using (true);

drop policy if exists "petal products read" on public.products;
drop policy if exists "petal products insert" on public.products;
drop policy if exists "petal products update" on public.products;
drop policy if exists "petal products delete" on public.products;
create policy "petal products read" on public.products for select using (true);
create policy "petal products insert" on public.products for insert with check (true);
create policy "petal products update" on public.products for update using (true);
create policy "petal products delete" on public.products for delete using (true);

drop policy if exists "petal orders read" on public.orders;
drop policy if exists "petal orders insert" on public.orders;
drop policy if exists "petal orders update" on public.orders;
drop policy if exists "petal orders delete" on public.orders;
create policy "petal orders read" on public.orders for select using (true);
create policy "petal orders insert" on public.orders for insert with check (true);
create policy "petal orders update" on public.orders for update using (true);
create policy "petal orders delete" on public.orders for delete using (true);

drop policy if exists "petal messages read" on public.messages;
drop policy if exists "petal messages insert" on public.messages;
drop policy if exists "petal messages update" on public.messages;
drop policy if exists "petal messages delete" on public.messages;
create policy "petal messages read" on public.messages for select using (true);
create policy "petal messages insert" on public.messages for insert with check (true);
create policy "petal messages update" on public.messages for update using (true);
create policy "petal messages delete" on public.messages for delete using (true);

drop policy if exists "petal couriers read" on public.couriers;
drop policy if exists "petal couriers insert" on public.couriers;
drop policy if exists "petal couriers update" on public.couriers;
drop policy if exists "petal couriers delete" on public.couriers;
create policy "petal couriers read" on public.couriers for select using (true);
create policy "petal couriers insert" on public.couriers for insert with check (true);
create policy "petal couriers update" on public.couriers for update using (true);
create policy "petal couriers delete" on public.couriers for delete using (true);