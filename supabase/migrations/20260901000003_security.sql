-- =============================================================================
-- Afirmative Pill · Migración 3: Seguridad (Zero-REST a nivel de Supabase)
-- -----------------------------------------------------------------------------
-- Supabase publica automáticamente una API REST (PostgREST) sobre los esquemas
-- expuestos (por defecto "public"). Nuestras tablas viven en write_model y
-- read_model, que NO están expuestos; además:
--   1. Se habilita RLS en todas las tablas sin definir políticas => los roles
--      anon / authenticated no pueden leer ni escribir nada.
--   2. Se revocan privilegios a anon / authenticated sobre ambos esquemas.
-- El backend GraphQL se conecta con el rol "postgres" (dueño de las tablas),
-- que no está sujeto a RLS. El navegador jamás habla con Supabase directamente.
-- =============================================================================

do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename
    from pg_tables
    where schemaname in ('write_model', 'read_model')
  loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema write_model, read_model from anon';
    execute 'revoke usage on schema write_model, read_model from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema write_model, read_model from authenticated';
    execute 'revoke usage on schema write_model, read_model from authenticated';
  end if;
end
$$;
