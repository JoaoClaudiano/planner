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
alter table tarefas  add column if not exists sort_order integer default 0;
alter table topicos  add column if not exists sort_order integer default 0;

-- Adiciona a coluna aula_id em bancos criados antes dela existir no schema.
-- O CREATE TABLE IF NOT EXISTS não adiciona colunas retroativamente.
alter table presencas add column if not exists aula_id text;

-- Adiciona a coluna presente em bancos criados antes dela existir no schema.
alter table presencas add column if not exists presente boolean default false;

-- Adiciona updated_at em tabelas criadas antes desta coluna ser incluída no schema.
alter table presencas add column if not exists updated_at timestamp with time zone default now();
alter table eventos   add column if not exists updated_at timestamp with time zone default now();
alter table tarefas   add column if not exists updated_at timestamp with time zone default now();
alter table topicos   add column if not exists updated_at timestamp with time zone default now();

-- Garante que o índice único em presencas(user_id, aula_id) existe.
-- Necessário para o upsert com on_conflict funcionar (PostgREST).
-- Em bancos criados antes desta restrição ser adicionada ao CREATE TABLE,
-- o CREATE TABLE IF NOT EXISTS não aplica a cláusula UNIQUE retroativamente.
create unique index if not exists presencas_user_id_aula_id_key
  on presencas (user_id, aula_id);

-- Remove a coluna evento_id caso tenha sido criada manualmente — ela não faz
-- parte do schema e sua restrição NOT NULL causa erro 400 em todo upsert de presença.
alter table presencas drop column if exists evento_id;

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- Cada usuário só acessa seus próprios dados
-- =============================================
alter table presencas enable row level security;
alter table eventos   enable row level security;
alter table tarefas   enable row level security;
alter table topicos   enable row level security;

-- Políticas para presencas
drop policy if exists "Usuário gerencia suas presenças" on presencas;
create policy "Usuário gerencia suas presenças"
  on presencas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas para eventos
drop policy if exists "Usuário gerencia seus eventos" on eventos;
create policy "Usuário gerencia seus eventos"
  on eventos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas para tarefas
drop policy if exists "Usuário gerencia suas tarefas" on tarefas;
create policy "Usuário gerencia suas tarefas"
  on tarefas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Políticas para tópicos
drop policy if exists "Usuário gerencia seus tópicos" on topicos;
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

drop trigger if exists tg_presencas_updated on presencas;
create trigger tg_presencas_updated
  before update on presencas
  for each row execute function update_updated_at();

drop trigger if exists tg_eventos_updated on eventos;
create trigger tg_eventos_updated
  before update on eventos
  for each row execute function update_updated_at();

drop trigger if exists tg_tarefas_updated on tarefas;
create trigger tg_tarefas_updated
  before update on tarefas
  for each row execute function update_updated_at();

drop trigger if exists tg_topicos_updated on topicos;
create trigger tg_topicos_updated
  before update on topicos
  for each row execute function update_updated_at();

-- =============================================
-- RPC: delete_my_account
-- Permite que o usuário autenticado exclua sua própria conta.
-- Deve ser criada com SECURITY DEFINER para ter permissão
-- de deletar o registro em auth.users.
-- =============================================
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;
