-- ============================================================================
-- WOP SH — T3a: feed do hub para o app "inventario"
-- Rodar no SQL Editor do projeto WOP (dehuvsqbuatoobycpjst). Idempotente. Não apaga dados.
-- O que faz:
--  1) libera o app 'inventario' no hub (hub_issue_key, hub_key_check e CHECKs de coluna app, se houver)
--  2) hub_user_json: só para 'inventario' acrescenta telefone, foto_url, nivel_formativo e grupo
--     (os outros apps recebem exatamente o mesmo JSON de antes)
--  3) membros do Wop (sem login) no feed do inventario: snapshot completo + alterações recentes
--  4) wop_inventario_changes / wop_inventario_snapshot_full (mesmo molde do Adoração)
-- Depois de rodar: wop_02_testes.sql (deve terminar em TESTES_OK) e emitir a chave (ver fim deste arquivo).
-- Rollback: wop_99_rollback_inventario.sql
-- ============================================================================
begin;

-- 1a) CHECKs que listam os apps conhecidos: acrescenta 'inventario' (só amplia; ignora se não houver)
do $$
declare c record; v_def text; v_new text;
begin
  for c in
    select con.conrelid::regclass as tbl, con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
     where con.contype = 'c'
       and con.conrelid::regclass::text in ('hub_keys','hub_app_cursor','hub_audit','hub_user_links','wop_entity_links','wop_user_links',
                                            'public.hub_keys','public.hub_app_cursor','public.hub_audit','public.hub_user_links','public.wop_entity_links','public.wop_user_links')
       and pg_get_constraintdef(con.oid) like '%adoracao%'
       and pg_get_constraintdef(con.oid) not like '%inventario%'
  loop
    v_new := replace(c.def, '''adoracao''::text', '''adoracao''::text, ''inventario''::text');
    if v_new = c.def then
      raise notice 'CHECK % em % não foi ajustado (formato inesperado): %', c.conname, c.tbl, c.def;
    else
      execute format('alter table %s drop constraint %I', c.tbl, c.conname);
      execute format('alter table %s add constraint %I %s', c.tbl, c.conname, v_new);
    end if;
  end loop;
end $$;

-- 1b) hub_key_check e hub_issue_key com 'inventario' na lista
create or replace function public.hub_key_check(p_app text, p_key text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare k public.hub_keys; v_hash text; v_n int; v_bucket timestamptz := date_trunc('minute', now());
begin
  if p_app is null or p_app not in ('pa','po','benfeitor','portal','evansh','adoracao','inventario') then
    raise exception 'parâmetro inválido' using errcode = '22023';
  end if;
  if p_key is null or length(p_key) < 32 or length(p_key) > 200 then
    raise exception 'chave inválida' using errcode = '42501';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  select * into k from public.hub_keys
   where key_hash = v_hash and active and revoked_at is null and app = p_app
     and direction = 'outbound' and scopes @> array['sync:read']::text[];
  if not found then raise exception 'chave inválida' using errcode = '42501'; end if;

  delete from public.hub_key_usage where key_id = k.id and bucket < v_bucket - interval '1 hour';
  insert into public.hub_key_usage(key_id, bucket, n) values (k.id, v_bucket, 1)
    on conflict (key_id, bucket) do update set n = public.hub_key_usage.n + 1
    returning n into v_n;
  if v_n > k.usage_limit then raise exception 'limite de uso excedido' using errcode = '54000'; end if;

  update public.hub_keys set last_used_at = now() where id = k.id;
  return k.id;
end $$;

create or replace function public.hub_issue_key(p_app text, p_name text, p_usage_limit integer default 60)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_raw text; v_id uuid;
begin
  perform public.hub_assert_admin();
  if p_app is null or p_app not in ('pa','po','benfeitor','portal','evansh','adoracao','inventario')
     or p_name is null or btrim(p_name) = '' or p_usage_limit is null or p_usage_limit not between 1 and 600 then
    raise exception 'parâmetro inválido' using errcode = '22023';
  end if;
  v_raw := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.hub_keys(app, name, key_hash, usage_limit, created_by)
  values (p_app, left(btrim(p_name), 80), encode(sha256(convert_to(v_raw, 'UTF8')), 'hex'), p_usage_limit, auth.uid())
  returning id into v_id;
  insert into public.hub_audit(key_id, app, action, detail) values (v_id, p_app, 'key_issued', 'limite=' || p_usage_limit);
  return jsonb_build_object('id', v_id, 'app', p_app, 'key', v_raw,
                            'aviso', 'Guarde agora direto no Cloudflare Secrets do app. Não será exibida de novo.');
end $$;

-- 2) hub_user_json: igual ao atual; só 'inventario' recebe contatos e dados formativos
create or replace function public.hub_user_json(p_id uuid, p_app text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare u public.profiles; v_mis uuid; v_reg uuid; v_ext text; v_extra jsonb := '{}'::jsonb;
begin
  select * into u from public.profiles where id = p_id;

  select l.external_user_id into v_ext from public.wop_user_links l
   where l.app = p_app and l.profile_id = p_id and l.status = 'approved' limit 1;
  if v_ext is null then
    select l.external_user_id into v_ext from public.hub_user_links l
     where l.app = p_app and l.wop_user_id = p_id and l.approved limit 1;
  end if;

  if u.id is null or not u.ativo then
    return jsonb_build_object('type','user','op','deactivate','external_user_id',v_ext,'wop_user_id',p_id,
      'email', case when u.id is null then null else lower(u.email) end,
      'nivel','user','funcao',null,'area',null,'ativo',false,
      'regional_id',null,'mission_id',null,'allowed_sectors','[]'::jsonb);
  end if;
  if u.nivel = 'admin' then return null; end if;

  select m.id, m.regional_id into v_mis, v_reg from public.missions m where m.id = u.mission_id;
  v_reg := coalesce(v_reg, u.regional_id);

  if p_app = 'inventario' then
    v_extra := jsonb_build_object(
      'telefone', nullif(btrim(coalesce(u.phone, '')), ''),
      'foto_url', case when u.photo_url like 'http%' then u.photo_url end,
      'nivel_formativo', nullif(btrim(coalesce(u.formative_level, '')), ''),
      'grupo', (select g.name from public.groups g where g.id = u.group_id));
  end if;

  return jsonb_build_object('type','user','op','upsert','external_user_id',v_ext,'wop_user_id',u.id,
    'email',lower(u.email),'nivel',u.nivel,
    'funcao',(select f.slug from public.wop_funcoes f where f.id = u.funcao_id),
    'area',public.wop_po_norm_area(u.area),'ativo',true,
    'regional_id',v_reg,'mission_id',v_mis,
    'allowed_sectors','[]'::jsonb) || v_extra;
end $$;

-- 3) Membros do Wop para o inventario
-- 3a) marca de tempo (só servidor)
create table if not exists public.wop_inventario_member_wm (
  id int primary key default 1 check (id = 1),
  at timestamptz
);
insert into public.wop_inventario_member_wm(id) values (1) on conflict (id) do nothing;
alter table public.wop_inventario_member_wm enable row level security;
revoke all on public.wop_inventario_member_wm from anon, authenticated;

-- 3b) members.updated_at passa a andar junto com a edição (a coluna já existe)
create or replace function public.wop_members_touch() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists wop_members_touch_trg on public.members;
create trigger wop_members_touch_trg before update on public.members
  for each row execute function public.wop_members_touch();

-- 3c) JSON dos membros (interno: só as funções do feed chamam)
create or replace function public.wop_inventario_members_json(p_since timestamptz, p_only_active boolean)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'type','member',
      'op', case when m.left_at is null and coalesce(m.status,'') <> 'desligado' then 'upsert' else 'deactivate' end,
      'id', m.id, 'mission_id', m.mission_id, 'name', m.name,
      'ativo', (m.left_at is null and coalesce(m.status,'') <> 'desligado'),
      'nivel_formativo', nullif(btrim(coalesce(m.formative_level,'')), ''),
      'grupo', g.name,
      'telefone', nullif(btrim(coalesce(m.phone,'')), ''),
      'foto_url', case when m.photo_url like 'http%' then m.photo_url end
    ) order by m.name, m.id), '[]'::jsonb)
  from public.members m
  left join public.groups g on g.id = m.group_id
  where m.mission_id is not null
    and btrim(coalesce(m.name,'')) <> ''
    and (p_since is null or m.updated_at > p_since)
    and (not p_only_active or (m.left_at is null and coalesce(m.status,'') <> 'desligado'))
    and not exists (select 1 from public.profiles p                 -- quem já é usuário não aparece como membro
                     where m.ext_email is not null and lower(p.email) = lower(m.ext_email));
$$;
revoke all on function public.wop_inventario_members_json(timestamptz, boolean) from public, anon, authenticated;

-- 4) Entradas do feed (mesmo molde do Adoração)
create or replace function public.wop_inventario_snapshot_full(p_key text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_now timestamptz := now(); r jsonb;
begin
  r := public.hub_feed_snapshot('inventario', p_key);      -- valida a chave
  update public.wop_inventario_member_wm set at = v_now where id = 1;
  return r || jsonb_build_object('members', public.wop_inventario_members_json(null, true));
end $$;

create or replace function public.wop_inventario_changes(p_key text, p_since bigint default 0, p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_now timestamptz := now(); v_wm timestamptz; r jsonb;
begin
  r := public.hub_feed_changes('inventario', p_key, p_since, p_limit);   -- valida a chave
  if coalesce((r->>'full_resync_required')::boolean, false) or coalesce((r->>'has_more')::boolean, false) then
    return r;                                                             -- membros vão na última página
  end if;
  select at into v_wm from public.wop_inventario_member_wm where id = 1;
  r := jsonb_set(r, '{events}',
        coalesce(r->'events', '[]'::jsonb)
        || public.wop_inventario_members_json(coalesce(v_wm - interval '10 minutes', '-infinity'::timestamptz), false));
  update public.wop_inventario_member_wm set at = v_now where id = 1;
  return r;
end $$;

revoke all on function public.wop_inventario_snapshot_full(text) from public;
revoke all on function public.wop_inventario_changes(text, bigint, integer) from public;
grant execute on function public.wop_inventario_snapshot_full(text) to anon, authenticated, service_role;
grant execute on function public.wop_inventario_changes(text, bigint, integer) to anon, authenticated, service_role;

commit;

-- ============================================================================
-- DEPOIS (rodar à parte, só uma vez; a chave aparece UMA vez — não cole no chat):
--   select public.hub_issue_key('inventario', 'Inventário Sh sync', 60);
-- Copie o valor de "key" direto para o Cloudflare Pages do Inventário (Secret WOP_SYNC_KEY).
-- ============================================================================
