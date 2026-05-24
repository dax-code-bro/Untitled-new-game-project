-- Legend AI — Supabase Schema
-- Run this in your Supabase SQL editor after creating your project

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  username text unique not null,
  plan text not null default 'standard', -- standard | pro | hardcode | admin
  age_group text, -- '18+' | '17-'
  kids_mode boolean default false,
  accessibility jsonb default '{}',
  onboarded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────
create table if not exists projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  description text default '',
  is_private boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────
-- CHATS
-- ─────────────────────────────────────────
create table if not exists chats (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  project_id uuid references projects(id) on delete set null,
  title text default 'New Chat',
  mode text default 'conversation',
  model text default 'all_round',
  tier text default 'normal', -- normal | supersonic
  is_private boolean default false,
  token_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger chats_updated_at
  before update on chats
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────
-- MESSAGES
-- ─────────────────────────────────────────
create table if not exists messages (
  id uuid default uuid_generate_v4() primary key,
  chat_id uuid references chats(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  token_count integer default 0,
  created_at timestamptz default now()
);

-- Index for fast message loading
create index if not exists messages_chat_id_idx on messages(chat_id, created_at);

-- ─────────────────────────────────────────
-- CHAT BIBLE
-- Stores complete chat transcripts for cross-chat reference
-- ─────────────────────────────────────────
create table if not exists chat_bibles (
  id uuid default uuid_generate_v4() primary key,
  chat_id uuid references chats(id) on delete cascade unique not null,
  user_id uuid references profiles(id) on delete cascade not null,
  full_transcript text not null default '',
  token_count integer default 0,
  share_token text unique default encode(gen_random_bytes(16), 'hex'),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- PASSWORD VAULT
-- ─────────────────────────────────────────
create table if not exists vault_entries (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  service_name text not null,
  encrypted_password text not null, -- AES encrypted, never stored in plain text
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger vault_updated_at
  before update on vault_entries
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────
-- FEEDBACK
-- ─────────────────────────────────────────
create table if not exists feedback (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete set null,
  type text default 'general', -- general | bug | feature | checkin
  content text not null,
  rating integer check (rating between 1 and 5),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Users can only access their own data
-- ─────────────────────────────────────────
alter table profiles enable row level security;
alter table projects enable row level security;
alter table chats enable row level security;
alter table messages enable row level security;
alter table chat_bibles enable row level security;
alter table vault_entries enable row level security;
alter table feedback enable row level security;

-- Profiles: users see only their own
create policy "profiles_own" on profiles for all using (auth.uid() = id);

-- Projects
create policy "projects_own" on projects for all using (auth.uid() = user_id);

-- Chats
create policy "chats_own" on chats for all using (auth.uid() = user_id);

-- Messages
create policy "messages_own" on messages for all using (auth.uid() = user_id);

-- Chat Bibles: own access + public share token access
create policy "bible_own" on chat_bibles for all using (auth.uid() = user_id);

-- Vault: strict own-only
create policy "vault_own" on vault_entries for all using (auth.uid() = user_id);

-- Feedback
create policy "feedback_own" on feedback for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- ADMIN OVERRIDE
-- ─────────────────────────────────────────
-- To make yourself admin, run after signup:
-- update profiles set plan = 'admin' where email = 'your@email.com';
