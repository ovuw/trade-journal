-- Trade Journal — Sync Schema
-- Run this in your Supabase project SQL Editor to enable cross-computer sync.
-- Go to: supabase.com/dashboard → your project → SQL Editor → New query → paste & run

create table if not exists trades (
  id           text primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  ticker       text not null,
  direction    text not null,
  asset_class  text not null default 'stock',
  entry_price  numeric not null,
  exit_price   numeric not null,
  quantity     numeric not null,
  fees         numeric default 0,
  stop_price   numeric,
  target_price numeric,
  planned_rr   numeric,
  actual_r     numeric,
  entry_time   text not null,
  exit_time    text not null,
  setup_tag_id text,
  mistake_tag_ids  text[] default '{}',
  rules_broken_ids text[] default '{}',
  rules_followed_ids text[] default '{}',
  emotion_entry int,
  emotion_exit  int,
  confidence    int,
  notes         text,
  pnl           numeric,
  result_pct    numeric,
  screenshot_id text,
  session       text,
  created_at    text not null,
  updated_at    text not null
);

alter table trades enable row level security;

create policy "Users own their trades"
  on trades for all
  using (auth.uid() = user_id);
