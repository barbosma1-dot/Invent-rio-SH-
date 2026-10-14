-- WOP SH — testes do feed 'inventario'. Roda dentro de uma transação e DESFAZ tudo no final.
-- Deve devolver a linha: TESTES_OK
begin;
do $$
declare k jsonb; v_key text; s jsonb; c jsonb; v_n int;
begin
  k := public.hub_issue_key('inventario', 'teste-t3a', 60);
  v_key := k->>'key';
  assert length(v_key) = 64, 'chave deveria ter 64 caracteres';

  s := public.wop_inventario_snapshot_full(v_key);
  assert s ? 'users' and s ? 'catalog' and s ? 'members' and s ? 'cursor', 'snapshot sem users/catalog/members/cursor';
  assert jsonb_typeof(s->'members') = 'array', 'members deveria ser lista';
  assert jsonb_typeof(s#>'{catalog,missions}') = 'array', 'catalog.missions deveria ser lista';
  assert jsonb_typeof(s#>'{catalog,sectors}') = 'array', 'catalog.sectors deveria ser lista';
  select count(*) into v_n from jsonb_array_elements(s->'users') u where u ? 'telefone' and u ? 'nivel_formativo' and u ? 'grupo' and u ? 'foto_url';
  assert v_n = jsonb_array_length(s->'users') or jsonb_array_length(s->'users') = 0, 'usuarios sem os campos extras do inventario';

  c := public.wop_inventario_changes(v_key, (s->>'cursor')::bigint, 200);
  assert c ? 'events' and c ? 'next_cursor', 'changes sem events/next_cursor';

  -- outros apps não ganham os campos extras
  assert not exists (
    select 1 from public.profiles p
     where p.nivel <> 'admin' and p.ativo and (public.hub_user_json(p.id, 'adoracao') ? 'telefone')),
    'adoracao não deveria receber telefone';

  -- chave de outro app não abre o feed do inventario
  begin
    perform public.hub_feed_snapshot('adoracao', v_key);
    assert false, 'chave do inventario não deveria abrir o feed do adoracao';
  exception when sqlstate '42501' then null; end;

  -- chave errada
  begin
    perform public.wop_inventario_snapshot_full(repeat('x', 64));
    assert false, 'chave inválida deveria falhar';
  exception when sqlstate '42501' then null; end;

  -- anon não executa as funções internas
  assert not has_function_privilege('anon', 'public.wop_inventario_members_json(timestamptz, boolean)', 'execute'), 'members_json não pode ser público';
  assert has_function_privilege('anon', 'public.wop_inventario_snapshot_full(text)', 'execute'), 'snapshot precisa ser chamável pelo Function';
end $$;
select 'TESTES_OK' as resultado;
rollback;
