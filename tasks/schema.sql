-- Trade Journal — Supabase Schema
-- Run this in the Supabase SQL Editor after creating your project

-- ACCOUNTS
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  broker text,
  currency text default 'USD',
  starting_balance numeric(12, 2) default 0,
  created_at timestamptz default now()
);

-- TAGS (setup tags + mistake tags)
create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('setup', 'mistake')),
  color text default '#58a6ff',
  created_at timestamptz default now()
);

-- RULES (user-defined trading rules)
create table rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  category text default 'General',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- TRADES
create table trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  ticker text not null,
  direction text not null check (direction in ('long', 'short')),
  asset_class text not null default 'stock' check (asset_class in ('stock', 'option', 'futures', 'forex', 'crypto')),
  entry_price numeric(12, 4) not null,
  exit_price numeric(12, 4),
  quantity numeric(12, 4) not null,
  fees numeric(10, 2) default 0,
  stop_price numeric(12, 4),
  target_price numeric(12, 4),
  planned_rr numeric(6, 2),  -- (target - entry) / (entry - stop)
  actual_r numeric(6, 2),    -- actual pnl / initial risk $
  entry_time timestamptz not null,
  exit_time timestamptz,
  setup_tag_id uuid references tags(id),
  mistake_tag_ids uuid[] default '{}',
  rules_broken_ids uuid[] default '{}',
  rules_followed_ids uuid[] default '{}',
  emotion_entry smallint check (emotion_entry between 1 and 5),
  emotion_exit smallint check (emotion_exit between 1 and 5),
  confidence smallint check (confidence between 1 and 5),
  notes text,
  pnl numeric(12, 2),        -- calculated: (exit - entry) * qty - fees
  result_pct numeric(8, 4),  -- calculated: pnl / (entry * qty) * 100
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- EXECUTIONS (partial fills / scale-ins per trade)
create table executions (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references trades(id) on delete cascade,
  price numeric(12, 4) not null,
  quantity numeric(12, 4) not null,
  side text not null check (side in ('buy', 'sell')),
  executed_at timestamptz not null,
  fees numeric(10, 2) default 0,
  created_at timestamptz default now()
);

-- TRADE SCREENSHOTS
create table trade_screenshots (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references trades(id) on delete cascade,
  storage_path text not null,
  label text,
  created_at timestamptz default now()
);

-- JOURNAL ENTRIES (one per day per account)
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  date date not null,
  content text,  -- markdown
  mood smallint check (mood between 1 and 5),
  market_condition text check (market_condition in ('trending', 'choppy', 'volatile', 'ranging')),
  linked_trade_ids uuid[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (account_id, date)
);

-- CHECKLIST ITEMS (pre-market routine)
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  label text not null,
  order_index integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- DAILY CHECKLIST STATE (which items were checked each day)
create table daily_checklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  item_id uuid references checklist_items(id) on delete cascade,
  checked boolean default false,
  unique (user_id, date, item_id)
);

-- SETTINGS (one row per user)
create table settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_balance numeric(12, 2) default 10000,
  max_risk_pct numeric(5, 2) default 1.0,
  max_daily_loss_pct numeric(5, 2) default 3.0,
  max_daily_loss_dollar numeric(12, 2),
  preferred_account_id uuid references accounts(id),
  updated_at timestamptz default now()
);

-- RLS (Row Level Security) — each user only sees their own data
alter table accounts enable row level security;
alter table tags enable row level security;
alter table rules enable row level security;
alter table trades enable row level security;
alter table executions enable row level security;
alter table trade_screenshots enable row level security;
alter table journal_entries enable row level security;
alter table checklist_items enable row level security;
alter table daily_checklist enable row level security;
alter table settings enable row level security;

-- Policies (accounts example — replicate pattern for all tables)
create policy "Users own their accounts" on accounts
  for all using (auth.uid() = user_id);

create policy "Users own their tags" on tags
  for all using (auth.uid() = user_id);

create policy "Users own their rules" on rules
  for all using (auth.uid() = user_id);

create policy "Users own their trades" on trades
  for all using (
    account_id in (select id from accounts where user_id = auth.uid())
  );

create policy "Users own their executions" on executions
  for all using (
    trade_id in (
      select t.id from trades t
      join accounts a on t.account_id = a.id
      where a.user_id = auth.uid()
    )
  );

create policy "Users own their screenshots" on trade_screenshots
  for all using (
    trade_id in (
      select t.id from trades t
      join accounts a on t.account_id = a.id
      where a.user_id = auth.uid()
    )
  );

create policy "Users own their journal" on journal_entries
  for all using (
    account_id in (select id from accounts where user_id = auth.uid())
  );

create policy "Users own their checklist items" on checklist_items
  for all using (auth.uid() = user_id);

create policy "Users own their daily checklist" on daily_checklist
  for all using (auth.uid() = user_id);

create policy "Users own their settings" on settings
  for all using (auth.uid() = user_id);

-- DEFAULT DATA SEED (insert after user signs up)
-- Default setup tags
-- Default mistake tags
-- Default checklist items
-- (These will be inserted by the app on first launch)
