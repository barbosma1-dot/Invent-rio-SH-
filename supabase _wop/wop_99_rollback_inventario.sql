-- WOP SH — rollback do feed 'inventario'. Revoga chaves do app e remove as funções novas.
-- hub_key_check / hub_issue_key / hub_user_json voltam ao texto anterior (sem 'inventario').
begin;
update public.hub_keys set active = false, revoked_at = now() where app = 'inventario' and revoked_at is null;
drop function if exists public.wop_inventario_changes(text, bigint, integer);
drop function if exists public.wop_inventario_snapshot_full(text);
drop function if exists public.wop_inventario_members_json(timestamptz, boolean);
drop trigger if exists wop_members_touch_trg on public.members;
drop function if exists public.wop_members_touch();
drop table if exists public.wop_inventario_member_wm;

create or replace function public.hub_key_check(p_app text, p_key text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare k public.hub_keys; v_hash text; v_n int; v_bucket timestamptz := date_trunc('minute', now());
begin
  if p_app is null or p_app not in ('pa','po','benfeitor','portal','evansh','adoracao') then
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
    on conflict (key_id, bucket) do update set n = public.hub_key_usage.n + 1 returning n into v_n;
  if v_n > k.usage_limit then raise exception 'limite de uso excedido' using errcode = '54000'; end if;
  update public.hub_keys set last_used_at = now() where id = k.id;
  return k.id;
end $$;

create or replace function public.hub_issue_key(p_app text, p_name text, p_usage_limit integer default 60)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_raw text; v_id uuid;
begin
  perform public.hub_assert_admin();
  if p_app is null or p_app not in ('pa','po','benfeitor','portal','evansh','adoracao')
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

create or replace function public.hub_user_json(p_id uuid, p_app text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare u public.profiles; v_mis uuid; v_reg uuid; v_ext text;
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
  return jsonb_build_object('type','user','op','upsert','external_user_id',v_ext,'wop_user_id',u.id,
    'email',lower(u.email),'nivel',u.nivel,
    'funcao',(select f.slug from public.wop_funcoes f where f.id = u.funcao_id),
    'area',public.wop_po_norm_area(u.area),'ativo',true,
    'regional_id',v_reg,'mission_id',v_mis,'allowed_sectors','[]'::jsonb);
end $$;
commit;
