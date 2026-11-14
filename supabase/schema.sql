-- ============================================================
-- Petal-PH — Supabase schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- ============================================================

-- 1. Tables ---------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  nickname text,
  status text,
  anniversary date,
  phone text,
  location text,
  avatar text default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  season text,
  stock integer not null default 0,
  image text,
  description text default '',
  available boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.couriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  user_email text,
  user_name text,
  product_id uuid,
  product_name text,
  season text,
  qty integer not null default 1,
  total numeric not null default 0,
  payment text,
  address text,
  notes text,
  status text default 'Pending',
  delivery_personnel text default '',
  delivery_fee numeric default 0,
  delivery_status text default 'Preparing',
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  body text not null,
  read_by_user boolean not null default false,
  read_by_admin boolean not null default false,
  created_at timestamptz default now()
);

-- 2. Helper functions ----------------------------------------

create or replace function public.my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 3. Sign-up trigger: create the profile row ------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nickname, status, anniversary, phone, location)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nickname', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'status',
    nullif(new.raw_user_meta_data ->> 'anniversary', ''),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'location'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Row Level Security --------------------------------------

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.couriers enable row level security;
alter table public.orders enable row level security;
alter table public.messages enable row level security;

-- profiles: read/update own row (role cannot change), admin reads all and deletes
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles update own or admin" on public.profiles;
drop policy if exists "profiles delete admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles update own or admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check ((id = auth.uid() and role = public.my_role()) or public.is_admin());
create policy "profiles delete admin" on public.profiles
  for delete using (public.is_admin());

-- products: everyone reads, only admin writes
drop policy if exists "products read all" on public.products;
drop policy if exists "products insert admin" on public.products;
drop policy if exists "products update admin" on public.products;
drop policy if exists "products delete admin" on public.products;
create policy "products read all" on public.products
  for select using (true);
create policy "products insert admin" on public.products
  for insert with check (public.is_admin());
create policy "products update admin" on public.products
  for update using (public.is_admin()) with check (public.is_admin());
create policy "products delete admin" on public.products
  for delete using (public.is_admin());

-- couriers: admin only
drop policy if exists "couriers read admin" on public.couriers;
drop policy if exists "couriers insert admin" on public.couriers;
drop policy if exists "couriers update admin" on public.couriers;
drop policy if exists "couriers delete admin" on public.couriers;
create policy "couriers read admin" on public.couriers
  for select using (public.is_admin());
create policy "couriers insert admin" on public.couriers
  for insert with check (public.is_admin());
create policy "couriers update admin" on public.couriers
  for update using (public.is_admin()) with check (public.is_admin());
create policy "couriers delete admin" on public.couriers
  for delete using (public.is_admin());

-- orders: read own (admin all), admin updates/deletes, no direct customer writes
drop policy if exists "orders read own or admin" on public.orders;
drop policy if exists "orders update admin" on public.orders;
drop policy if exists "orders delete admin" on public.orders;
create policy "orders read own or admin" on public.orders
  for select using (user_id = auth.uid() or public.is_admin());
create policy "orders update admin" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());
create policy "orders delete admin" on public.orders
  for delete using (public.is_admin());

-- messages: own conversation read/insert, admin reads all, limited updates
drop policy if exists "messages read own or admin" on public.messages;
drop policy if exists "messages insert user or admin" on public.messages;
drop policy if exists "messages update own or admin" on public.messages;
drop policy if exists "messages delete admin" on public.messages;
create policy "messages read own or admin" on public.messages
  for select using (user_id = auth.uid() or public.is_admin());
create policy "messages insert user or admin" on public.messages
  for insert with check (
    (sender = 'user' and user_id = auth.uid())
    or (sender = 'admin' and public.is_admin())
  );
create policy "messages update own or admin" on public.messages
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "messages delete admin" on public.messages
  for delete using (public.is_admin());

-- customers may only flip read_by_user on their own messages
create or replace function public.messages_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.sender <> old.sender or new.body <> old.body or new.user_id <> old.user_id then
      raise exception 'You can only update read_by_user on your own messages';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_update_guard on public.messages;
create trigger messages_update_guard
  before update on public.messages
  for each row execute function public.messages_update_guard();

-- 5. Order functions (security definer) ----------------------

create or replace function public.place_order(
  p_product_id uuid,
  p_qty integer,
  p_payment text,
  p_address text,
  p_notes text default ''
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_profile public.profiles;
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'Profile not found';
  end if;

  if p_qty is null or p_qty < 1 then
    raise exception 'Invalid quantity';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if v_product.id is null then
    raise exception 'Product not found';
  end if;
  if not v_product.available then
    raise exception 'Product is not available';
  end if;
  if v_product.stock < p_qty then
    raise exception 'Not enough stock';
  end if;

  update public.products set stock = stock - p_qty where id = p_product_id;

  insert into public.orders (
    user_id, user_email, user_name, product_id, product_name, season,
    qty, total, payment, address, notes, status, delivery_status
  ) values (
    auth.uid(), v_profile.email, v_profile.nickname, v_product.id, v_product.name, v_product.season,
    p_qty, v_product.price * p_qty, p_payment, p_address, coalesce(p_notes, ''),
    'Pending', 'Preparing'
  )
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_status not in ('Pending', 'Accepted', 'Rejected', 'Completed', 'Cancelled') then
    raise exception 'Invalid status';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if p_status in ('Cancelled', 'Rejected') and v_order.status in ('Pending', 'Accepted') then
    update public.products set stock = stock + v_order.qty where id = v_order.product_id;
  end if;

  update public.orders set status = p_status where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.cancel_my_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and user_id = auth.uid() for update;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;
  if v_order.status <> 'Pending' then
    raise exception 'Only pending orders can be cancelled';
  end if;

  update public.products set stock = stock + v_order.qty where id = v_order.product_id;
  update public.orders set status = 'Cancelled' where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.place_order(uuid, integer, text, text, text) from public;
revoke all on function public.set_order_status(uuid, text) from public;
revoke all on function public.cancel_my_order(uuid) from public;
grant execute on function public.place_order(uuid, integer, text, text, text) to authenticated;
grant execute on function public.set_order_status(uuid, text) to authenticated;
grant execute on function public.cancel_my_order(uuid) to authenticated;

-- 6. Grants ---------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.couriers to authenticated;

-- 7. Seed data -----------------------------------------------

do $$
begin
  if (select count(*) from public.products) = 0 then
    insert into public.products (name, price, season, stock, image, description) values
      ('White Tulips', 499, 'Spring', 12, 'White Tulips.jpg', 'Fresh white tulips for gentle spring moments.'),
      ('White Lisianthus', 549, 'Spring', 10, 'White Lisianthus.jpg', 'Elegant lisianthus with soft ruffled petals.'),
      ('Pink Garden Roses', 599, 'Spring', 9, 'Pink Garden Roses.jpg', 'Romantic garden roses in soft pink.'),
      ('Oriental Lily Buds', 525, 'Spring', 11, 'Oriental Lily Buds.jpg', 'Fragrant oriental lilies ready to bloom.'),
      ('Sunflower', 399, 'Summer', 15, 'Sunflower.jpg', 'Bright sunflowers to light up summer days.'),
      ('White Gerbera Daisy', 379, 'Summer', 14, 'White Gerbera Daisy.jpg', 'Cheerful daisies with clean white petals.'),
      ('White Ping Pong Mum', 429, 'Summer', 8, 'White Ping Pong Mum.jpg', 'Playful round blooms for summer decor.'),
      ('Pink Chrysanthemums', 450, 'Autumn', 10, 'Pink Chrysanthemums.jpg', 'Warm pink mums for cozy autumn vibes.'),
      ('White Carnations', 389, 'Autumn', 13, 'White carnations.jpg', 'Classic carnations with lasting beauty.'),
      ('Green Carnations', 469, 'Autumn', 7, 'Green Carnations.jpg', 'Unique green carnations for standout gifts.'),
      ('Carnations', 350, 'Winter', 16, 'Carnations.jpg', 'Soft ruffled carnations for winter warmth.'),
      ('Rose Flower', 599, 'Winter', 8, 'Rose Flower.jpg', 'Timeless roses for heartfelt celebrations.'),
      ('Pink Phalaenopsis Orchid', 899, 'Winter', 6, 'Pink Phalaenopsis Orchid.jpg', 'Elegant orchid for special occasions.'),
      ('Peonies', 649, 'All Season', 9, 'Peonies.jpg', 'Lush peonies loved in every season.'),
      ('Preserved Rose', 750, 'All Season', 12, 'Preserved Rose.jpg', 'Long-lasting preserved rose keepsake.');
  end if;

  if (select count(*) from public.couriers) = 0 then
    insert into public.couriers (name) values
      ('Jun Marquez'),
      ('Ana Reyes'),
      ('Carlo Dizon'),
      ('Rosa Lim');
  end if;
end $$;

-- Done. Continue with README-SETUP.md.