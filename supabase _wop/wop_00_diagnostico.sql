-- WOP SH — T3a, passo 0: DIAGNÓSTICO (somente leitura, não altera nada).
-- Cole no SQL Editor do projeto WOP (dehuvsqbuatoobycpjst) e clique Run.
-- Copie o resultado (uma única coluna JSON) e cole de volta no chat.
-- Não mostra chaves, e-mails nem dados de pessoas: só nomes de tabelas, colunas e código das funções.
select jsonb_pretty(jsonb_build_object(
  'colunas', (
    select jsonb_object_agg(table_name, cols) from (
      select table_name, jsonb_agg(column_name || ':' || data_type order by ordinal_position) cols
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('profiles','members','groups','missions','wop_regionals','wop_sectors','wop_funcoes')
      group by table_name) t),
  'tabelas_hub', (
    select coalesce(jsonb_agg(table_name order by table_name), '[]'::jsonb)
    from information_schema.tables
    where table_schema = 'public'
      and (table_name like 'wop\_%' escape '\' or table_name like 'hub\_%' escape '\')),
  'funcoes_feed', (
    select coalesce(jsonb_agg(jsonb_build_object('nome', p.proname, 'codigo', pg_get_functiondef(p.oid)) order by p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'wop\_adoracao\_%' escape '\'
        or p.proname like 'wop\_evansh\_%' escape '\'
        or p.proname like 'hub\_%' escape '\'
        or p.proname in ('wop_issue_key','wop_hub_issue_key'))),
  'tabelas_chaves', (
    select coalesce(jsonb_agg(jsonb_build_object('tabela', c.table_name, 'coluna', c.column_name)), '[]'::jsonb)
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name like '%key%')
)) as diagnostico;
