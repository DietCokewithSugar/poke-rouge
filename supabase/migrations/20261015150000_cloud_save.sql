-- 宝可肉鸽：云存档与对战数据。
-- 在 Supabase 后台的 SQL Editor 里整段执行一次即可（重复执行也不会出错）。

-- ---------------------------------------------------------------- 云存档
-- 每个账号一份进度（不含画面设置，那些每台设备各自保存）。
-- rev 每保存一次加 1：拿着过期 rev 的设备保存时会被拒绝，不会覆盖别的设备上更新的进度。
create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  rev integer not null default 1 check (rev > 0),
  device text,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

-- 游戏服务器用 service role 读写；就算有人直接用公开密钥访问数据库，也只能碰自己那一行
drop policy if exists saves_select_own on public.saves;
create policy saves_select_own on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists saves_insert_own on public.saves;
create policy saves_insert_own on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists saves_update_own on public.saves;
create policy saves_update_own on public.saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.saves from anon;
grant select, insert, update on public.saves to authenticated;
grant all on public.saves to service_role;

-- ---------------------------------------------------------------- 对战
-- 训练家的积分、战绩、冒险榜与道馆榜成绩。身份是浏览器里生成的 pid + 密钥（这里只存密钥的哈希），
-- 登录后它跟着云存档同步，所以换设备积分也还在。只有游戏服务器（service role）能读写。
create table if not exists public.pvp_players (
  pid text primary key,
  hash text not null,
  name text not null,
  created timestamptz not null default now(),
  last timestamptz not null default now(),
  modes jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  run jsonb,
  gym jsonb
);

-- AI 训练家补位时用的队伍（其他玩家排过队的构筑），服务器最多保留 400 个
create table if not exists public.pvp_ghosts (
  id text primary key,
  pid text not null,
  name text not null,
  team jsonb not null,
  meta jsonb not null default '{}'::jsonb,
  trainer text,
  rating double precision not null,
  power double precision not null,
  at timestamptz not null default now()
);

alter table public.pvp_players enable row level security;
alter table public.pvp_ghosts enable row level security;
revoke all on public.pvp_players, public.pvp_ghosts from anon, authenticated;
grant all on public.pvp_players, public.pvp_ghosts to service_role;
