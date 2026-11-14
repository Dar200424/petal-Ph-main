-- ============================================================
-- Petal-PH — Security & Fixes Migration (2026-11-14)
-- Run this ONCE in the Supabase SQL Editor on your existing database.
-- It is idempotent: safe to run multiple times.
-- ============================================================

begin;

-- ─────────────────────────────────────────────────────────────
-- 1. Avatar safety: reject non-data:image/ values
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_check
      check (avatar is null or avatar = '' or (avatar like 'data:image/%' and length(avatar) <= 200000));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Profile self-update: block non-admins from changing
--    email, role, created_at, id
-- ─────────────────────────────────────────────────────────────
create or replace function public.profiles_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.email <> old.email then
      raise exception 'You cannot change your email';
    end if;
    if new.role <> old.role then
      raise exception 'You cannot change your role';
    end if;
    if new.created_at <> old.created_at then
      raise exception 'You cannot change your registration date';
    end if;
    if new.id <> old.id then
      raise exception 'You cannot change your account id';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_update_guard on public.profiles;
create trigger profiles_update_guard
  before update on public.profiles
  for each row execute function public.profiles_update_guard();

-- ─────────────────────────────────────────────────────────────
-- 3. Check constraints: data integrity
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_price_check' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_price_check check (price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_stock_check' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_stock_check check (stock >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_body_check' and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint messages_body_check check (length(body) between 1 and 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_status_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_status_check check (status in ('Pending','Accepted','Rejected','Completed','Cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_status_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_delivery_status_check check (delivery_status in ('Preparing','In transit','Delivered','Failed'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. set_order_status: enforce valid transitions only,
--    restore stock exactly once
-- ─────────────────────────────────────────────────────────────
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

  -- Terminal states cannot change
  if v_order.status in ('Rejected', 'Cancelled', 'Completed') then
    raise exception 'Order is already in a terminal state (%)', v_order.status;
  end if;

  -- Enforce valid transitions
  if v_order.status = 'Pending' and p_status not in ('Accepted', 'Rejected', 'Cancelled') then
    raise exception 'Invalid transition: Pending -> %', p_status;
  elsif v_order.status = 'Accepted' and p_status not in ('Completed', 'Cancelled') then
    raise exception 'Invalid transition: Accepted -> %', p_status;
  end if;

  -- Restore stock exactly once when leaving active states
  if p_status in ('Rejected', 'Cancelled') and v_order.status in ('Pending', 'Accepted') then
    update public.products set stock = stock + v_order.qty where id = v_order.product_id;
  end if;

  update public.orders set status = p_status where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Soft-delete columns for customers
-- ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists disabled boolean not null default false;

-- ─────────────────────────────────────────────────────────────
-- 6. place_order: block soft-deleted accounts
-- ─────────────────────────────────────────────────────────────
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
  if v_profile.deleted_at is not null or v_profile.disabled then
    raise exception 'Account disabled';
  end if;

  if p_qty is null or p_qty < 1 then
    raise exception 'Invalid quantity';
  end if;

  if p_address is null or length(btrim(p_address)) = 0 then
    raise exception 'Delivery address is required';
  end if;
  if length(p_address) > 300 then
    raise exception 'Delivery address must be 300 characters or fewer';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'Delivery notes must be 500 characters or fewer';
  end if;
  if p_payment not in ('Cash on Delivery', 'GCash', 'Maya', 'Bank Transfer (BDO/BPI/Metrobank)') then
    raise exception 'Invalid payment method';
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
    p_qty, v_product.price * p_qty, p_payment, btrim(p_address), coalesce(p_notes, ''),
    'Pending', 'Preparing'
  )
  returning * into v_order;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. delivery_date column for orders
-- ─────────────────────────────────────────────────────────────
alter table public.orders add column if not exists delivery_date date;

-- ─────────────────────────────────────────────────────────────
-- 8. best_sellers RPC (security definer, granted to authenticated)
-- ─────────────────────────────────────────────────────────────
create or replace function public.best_sellers(p_period text)
returns table(product_name text, units bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
begin
  if p_period = 'daily' then
    v_start := date_trunc('day', now());
  elsif p_period = 'weekly' then
    v_start := date_trunc('day', now() - interval '6 days');
  elsif p_period = 'monthly' then
    v_start := date_trunc('month', now());
  elsif p_period = 'yearly' then
    v_start := date_trunc('year', now());
  else
    raise exception 'Invalid period: %', p_period;
  end if;

  return query
    select o.product_name, sum(o.qty)::bigint as units
    from public.orders o
    where o.status not in ('Rejected', 'Cancelled')
      and o.created_at >= v_start
    group by o.product_name
    order by units desc
    limit 5;
end;
$$;

revoke all on function public.best_sellers(text) from public;
grant execute on function public.best_sellers(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9. Fold hardening.sql content (guard + insert policy)
-- ─────────────────────────────────────────────────────────────
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
    if new.read_by_admin <> old.read_by_admin then
      raise exception 'You cannot change read_by_admin';
    end if;
    if new.read_by_user <> old.read_by_user and new.user_id <> auth.uid() then
      raise exception 'You can only update read_by_user on your own messages';
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists "messages insert user or admin" on public.messages;
create policy "messages insert user or admin" on public.messages
  for insert with check (
    (sender = 'user' and user_id = auth.uid() and read_by_user = true and read_by_admin = false)
    or (sender = 'admin' and public.is_admin() and read_by_admin = true and read_by_user = false)
  );

-- ─────────────────────────────────────────────────────────────
-- 10. Fold fix-handle-new-user.sql (date cast)
-- ─────────────────────────────────────────────────────────────
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
    nullif(new.raw_user_meta_data ->> 'anniversary', '')::date,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'location'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;

-- Done. All security fixes and new columns/functions applied.