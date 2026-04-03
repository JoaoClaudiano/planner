-- =============================================
-- SCHEMA: rotina-estudos
-- Execute no SQL Editor do Supabase (https://app.supabase.com → SQL Editor)
-- Este script é idempotente: pode ser executado múltiplas vezes sem erros.
-- =============================================

-- Tabela de presenças (attendance)
create table if not exists presencas (
  id          bigint generated always as identity primary key,
  user_id     uuid    references auth.users not null,
  aula_id     text    not null,
  presente    boolean default false,
  updated_at  timestamp with time zone default now(),
  unique(user_id, aula_id)
);

-- Tabela de eventos customizados (reminders, provas, entregas)
create table if not exists eventos (
  id          text    primary key,
  user_id     uuid    references auth.users not null,
  nome        text    not null,
  date        date    not null,
  ini         text    not null,
  fim         text    not null,
  type        text    default 'lembrete',
  cor         text    default '#6366f1',
  note        text    default '',
  updated_at  timestamp with time zone default now()
);

-- Tabela de tarefas pendentes
create table if not exists tarefas (
  id          text    primary key,
  user_id     uuid    references auth.users not null,
  text        text    not null,
  checked     boolean default false,
  sort_order  integer default 0,
  updated_at  timestamp with time zone default now()
);

-- Tabela de tópicos de estudo
create table if not exists topicos (
  id          text    primary key,
  user_id     uuid    references auth.users not null,
  text        text    not null,
  checked     boolean default false,
  sort_order  integer default 0,
  updated_at  timestamp with time zone default now()
);

-- =============================================
-- MIGRAÇÕES — adiciona colunas ausentes em tabelas já existentes
-- =============================================
alter table tarefas add column if not exists sort_order integer default 0;
alter table topicos add column if not exists sort_order integer default 0;

-- Garante que o índice único em presencas(user_id, aula_id) existe.
-- Necessário para o upsert com on_conflict funcionar (PostgREST).
-- Em bancos criados antes desta restrição ser adicionada ao CREATE TABLE,
-- o CREATE TABLE IF NOT EXISTS não aplica a cláusula UNIQUE retroativamente.
create unique index if not exists presencas_user_id_aula_id_key
  on presencas (user_id, aula_id);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- Cada usuário só acessa seus próprios dados
-- =============================================
alter table presencas enable row level security;
alter table eventos   enable row level security;
alter table tarefas   enable row level security;
alter table topicos   enable row level security;

-- Políticas para presencas
create policy "Usuário gerencia suas presenças"
  on presencas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas para eventos
create policy "Usuário gerencia seus eventos"
  on eventos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas para tarefas
create policy "Usuário gerencia suas tarefas"
  on tarefas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas para tópicos
create policy "Usuário gerencia seus tópicos"
  on topicos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =============================================
-- ATUALIZAÇÃO AUTOMÁTICA DE updated_at
-- =============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tg_presencas_updated
  before update on presencas
  for each row execute function update_updated_at();

create trigger tg_eventos_updated
  before update on eventos
  for each row execute function update_updated_at();

create trigger tg_tarefas_updated
  before update on tarefas
  for each row execute function update_updated_at();

create trigger tg_topicos_updated
  before update on topicos
  for each row execute function update_updated_at();
