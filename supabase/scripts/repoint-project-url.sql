-- DuelVerse: troca a URL do projeto Supabase antigo (Lovable Cloud) pela do novo
-- projeto em TODAS as funções SQL e jobs do pg_cron, depois de restaurar o dump.
--
-- Uso (no SQL Editor do novo projeto ou via psql):
--   psql "$DATABASE_URL" -v old_ref=xxttwzewtqxvpgefggah -v new_ref=NOVO_REF \
--        -f supabase/scripts/repoint-project-url.sql
--
-- É idempotente: rodar de novo não muda nada.
\set ON_ERROR_STOP on
select set_config('duelverse.old_url', 'https://' || :'old_ref' || '.supabase.co', false);
select set_config('duelverse.new_url', 'https://' || :'new_ref' || '.supabase.co', false);

do $$
declare
  old_url text := current_setting('duelverse.old_url');
  new_url text := current_setting('duelverse.new_url');
  r record;
  n int := 0;
begin
  -- 1) Funções/triggers (plpgsql e sql) que contêm a URL antiga
  for r in
    select p.oid, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname not in ('pg_catalog', 'information_schema')
      and p.prokind in ('f', 'p')
      and p.prosrc like '%' || old_url || '%'
  loop
    execute replace(r.def, old_url, new_url);
    n := n + 1;
  end loop;
  raise notice 'funções atualizadas: %', n;

  -- 2) Jobs do pg_cron
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    n := 0;
    for r in select jobid, command from cron.job where command like '%' || old_url || '%' loop
      perform cron.alter_job(job_id := r.jobid, command := replace(r.command, old_url, new_url));
      n := n + 1;
    end loop;
    raise notice 'jobs do cron atualizados: %', n;
  end if;

  -- 3) Views (ex.: URLs públicas do storage)
  n := 0;
  for r in
    select c.oid::regclass as v, pg_get_viewdef(c.oid) as def
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where c.relkind = 'v' and ns.nspname = 'public'
      and pg_get_viewdef(c.oid) like '%' || old_url || '%'
  loop
    execute format('create or replace view %s as %s', r.v, replace(r.def, old_url, new_url));
    n := n + 1;
  end loop;
  raise notice 'views atualizadas: %', n;
end $$;
