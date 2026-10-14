# PROMPT MESTRE — INVENTÁRIO SH
Versão: 03 (fim da Tarefa 3, aplicada e testada) — atualizado em 14/10/2026

Cole este prompt no início de cada sessão. Ao final de cada tarefa, entregue
este mesmo prompt atualizado (marcar a tarefa como feita, registrar o que foi
feito, decisões novas e pendências, e ajustar "PRÓXIMA TAREFA").

---

## 1. QUEM SOU E COMO TRABALHAMOS
- Sou o dono do app, não programo. Eu envio os arquivos pelo site do GitHub, sem terminal.
- Entregue SEMPRE arquivos completos (nunca diffs) e separados (sem ZIP), dizendo a pasta de cada um.
- Não consigo rodar npm. Se precisar de dependência nova, avise ANTES. Não gere package-lock.json: o Cloudflare roda npm install.
- Uma tarefa por vez. Ao fim de cada uma: lista do que foi feito, pendências, como testar e este prompt atualizado.
- Se tiver acesso ao conector do Supabase, aplique o SQL direto no projeto do Inventário Sh e me conte o que aplicou. Antes de qualquer SQL destrutivo, pergunte. Se o conector não tiver permissão no projeto, entregue o SQL em arquivos para eu colar no SQL Editor.
- Responda em português do Brasil, curto, pensando em tela de celular.

## 2. O APP
**Inventário Sh**: administra o inventário de objetos da comunidade local.
- Cada objeto tem foto, nome e QR code que eu imprimo.
- Atende VÁRIAS missões, com inventários SEPARADOS. Cada SETOR tem o seu próprio inventário (um item pertence a missão + setor).
- Registra entrada, saída e retorno, onde o item é guardado exatamente (local em níveis: sala > armário > prateleira), necessidade de reparo, observações à parte e valor (compra, ou valor médio estimado se doado).

### Movimentações
- **Entrada:** chegada de item novo (compra com valor pago, ou doação com valor médio estimado).
- **Saída:** motivo evento OU empréstimo a alguém. Leva data, responsável, condição na saída e data prevista de volta.
- **Retorno:** volta de uma saída em aberto (evento ou empréstimo), com condição na volta, observação e opção "precisa de reparo".
- Status do item é calculado: no acervo, fora em evento, emprestado, em reparo, baixado. Saída além da data prevista = atrasada.

### Responsável (em toda entrada, saída e retorno)
Uma de três opções:
1. Usuário do app: mostrar foto, nome, telefone, nível, nível formativo e célula de engajamento ou grupo de oração (dados vindos do hub).
2. Membro do Wop sem login (a tabela members do Wop tem telefone, nível formativo, grupo e foto).
3. Pessoa avulsa: só nome e telefone.
Gravar em cada movimentação uma cópia de nome e telefone do momento (histórico não se perde). Telefone e foto só aparecem para quem tem nível para ver.

### QR
Abre `/i/<id>`. Sem login mostra só foto e nome do item. Logado e com permissão mostra o resto. Dados públicos por função SQL SECURITY DEFINER. Reaproveitar o padrão do Gestão Pro (ProductQR.tsx, PublicProduct.tsx, BarcodeScanner.tsx com @zxing/browser e @zxing/library, helpers de leitura) e etiquetas em lote.

## 3. STACK E PADRÕES
- React 19 + Vite + TypeScript + Tailwind + Zustand + Supabase, hospedado no Cloudflare Pages (Functions em `functions/api/...`), repositório no GitHub.
- Visual IGUAL aos outros apps Shalom: copiar a pasta `src/kit` (idêntica nos 7 apps): LogoMenuButton (menu com logo), ThemeToggle com 4 modos (claro, escuro, automático, noturno 18h-6h), Modal, PageHeader, GoogleLogin, shalom-kit.css, theme.ts, useTheme.ts. Não alterar o kit.
- Logo: pássaro dentro de um círculo com prancheta, azul-petróleo, texto "Inventário SH". Gerar versões clara e escura, ícone redondo, favicon e ícones do PWA (192, 512, maskable, apple-touch). Cor de destaque = azul-petróleo da logo.
- PWA (manifest + sw.js), mobile primeiro: telas em cartões no celular, sem tabela cortada.
- Padrão de integração dos outros apps: Function no Cloudflare (`functions/api/integrations/_wopsync.ts`) que busca o feed do hub com chave em Secrets e aplica por RPCs service_role. O Inventário Sh é só mais um consumidor: não tem cadastro próprio de pessoas.

## 4. REGRAS DE SEGURANÇA E DADOS
- RLS ligado em todas as tabelas; políticas sem recursão (usar funções SECURITY DEFINER, como get_my_branch no Gestão Pro).
- Isolamento por missão e por setor. Quem tem acesso a um setor só vê o inventário dele. Níveis altos veem a missão; coordenador de setor edita o próprio setor; membros consultam e registram saída e retorno.
- Chaves (WOP_SYNC_KEY etc.) só em Cloudflare Secrets, nunca VITE_. Nunca usar a service role de um app em outro. Admin local nunca é alterado pelo feed. Todo SQL idempotente (IF NOT EXISTS, ON CONFLICT).
- Nível de acesso (role) é diferente de função (rótulo do cargo); a função nunca concede privilégio.
- Fotos comprimidas antes do upload (máx. 800 px, JPEG) e guardadas no Supabase Storage (não em base64 na tabela).
- Prefixo de tabelas do app: `inv_`.

## 5. INFRAESTRUTURA
- Supabase: projeto "Inventário Sh", ref `mugsecusakhgmjbhtwkq`, região sa-east-1 (São Paulo), organização barbosma7@gmail.com's Org.
- O conector do Supabase do chat está conectado a este projeto (T2 e T3 aplicadas por ele em 14/10/2026). Ele NÃO alcança o projeto do Wop: o SQL do Wop é entregue em arquivos para eu colar no SQL Editor. Usuário de teste/admin: barbosma1@gmail.com.
- GitHub: repositório "Invent-rio-SH-" com a T1 (base do projeto).
- Supabase URL: https://mugsecusakhgmjbhtwkq.supabase.co (a chave pública "publishable" está no .env.example do repositório; nunca colocar service role em VITE_).
- Cloudflare Pages: ligar ao repositório com build `npm run build`, saída `dist`, variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (confirmar com o dono se já foi feito).
- Cloudflare Pages do Inventário, variáveis da sincronização (T3): `SUPABASE_SERVICE_ROLE_KEY` (Secret, do próprio Inventário), `WOP_SUPABASE_URL`, `WOP_SUPABASE_ANON_KEY`, `WOP_SYNC_KEY` (Secret, chave do app `inventario` emitida no Wop com `hub_issue_key`), `INVENTARIO_SYNC_SOURCE=wop` (liga a aplicação; sem ela só a simulação funciona). Depois de criar, fazer novo deploy.
- Autenticação no Supabase: ainda sem Site URL do Cloudflare e sem provedor Google configurado (login por e-mail e senha funciona; usuário de teste criado manualmente em Authentication > Users).
- Outros apps (referência, só para a sincronização): Wop Sh (Supabase dehuvsqbuatoobycpjst, prefixo wop_), PO Shalom (oigarjaueqmlupczpdtv, prefixo po_), mais PA, Adoração Sh, Benfeitor da Paz, EvanSh e Portal.

## 6. DECISÕES JÁ TOMADAS
- Várias missões; inventário por setor.
- Responsável = usuário do app, membro do Wop ou pessoa avulsa (com cópia de nome e telefone na movimentação).
- Tipos de movimentação: entrada (item novo), saída (evento ou empréstimo), retorno (volta de empréstimo/evento).
- Valor: compra ou valor médio estimado se doado (campo marca qual).
- Local de guarda em níveis.
- Visual idêntico aos outros apps (kit compartilhado) + logo enviada.

### Decisões novas da T2 (modelo do banco)
- **Acessos** (tabela `inv_access`): `gestor` (missão inteira), `coordenador` (um setor), `membro` (um setor). Mais a marca `is_admin` no perfil (admin global) e `is_local_admin` (o feed nunca altera). Acesso com `source='local'` também nunca é alterado pelo feed.
- **Permissões:** admin e gestor/coordenador editam (itens, locais, eventos, reparos, entrada). **Membro** consulta e registra saída e retorno. Entrada (item novo) exige quem edita o setor. (Premissa a confirmar com o dono.)
- **Histórico só de entrada:** `inv_movements` e `inv_movement_contacts` não têm update nem delete para o app. Cada saída aberta só pode ter um retorno; só uma entrada por item; não dá saída de item já fora, em reparo ou baixado.
- **Retorno com "precisa de reparo"** abre um reparo automaticamente (gatilho).
- **Baixa** do item = campo `baixa_at` (itens não são apagados; a FK impede apagar item com histórico).
- **Telefone e foto separados:** ficam em tabelas próprias (`inv_profile_contacts`, `inv_hub_member_contacts`, `inv_movement_contacts`) que só admin, gestor e coordenador leem. O nome fica na movimentação para todos com acesso ao setor.
- **Funções auxiliares** ficam no schema `inv_private` (fora da API). A única função pública é `inv_public_item(id)` para o QR sem login (devolve só id, nome e caminho da foto).
- **Status calculado** pela view `inv_item_status` (security_invoker): status, overdue, saída em aberto, previsão de volta, responsável.
- **Fotos:** bucket público `inv-fotos` (limite 1 MB, jpeg/png/webp), caminho `<mission_id>/<sector_id>/<item_id>.jpg`; só quem edita o setor grava.
- **Gatilho em auth.users:** todo usuário criado ganha perfil em `inv_profiles` sem nenhum acesso. O primeiro admin é definido pelo script `02_primeiro_admin.sql` (ninguém vira admin sozinho).
- Fuso para "atrasada" e datas de reparo: America/Sao_Paulo.

### Decisões novas da T3 (sincronização com o hub)
- **Hub = Wop** (tabelas `hub_*` do Wop). O Inventário é o app `inventario` do hub: funções `wop_inventario_snapshot_full(p_key)` e `wop_inventario_changes(p_key, p_since, p_limit)`, chave com escopo `sync:read`, limite de 60 chamadas/min.
- **Setores vêm do Wop** (`wop_sectors`, via `catalog.sectors`). Missões e regionais também são do catálogo do Wop; o id canônico do Wop vira `external_id` no Inventário.
- **Feed estendido só para o `inventario`:** usuários trazem telefone, foto_url, nivel_formativo e grupo; **membros do Wop sem login** vêm em `members` (snapshot) e como eventos `type=member` (últimas alterações, com sobreposição de 10 min). Os outros apps recebem o mesmo JSON de antes.
- **Acesso pelo feed:** gestor da missão (nível mission_coordinator) e gestor de todas as missões da regional (regional_coordinator) ganham acesso automático (`source='hub'`). **Coordenador e membro de setor NÃO recebem acesso pelo feed** (o Wop ainda não tem usuário↔setor, `allowed_sectors` vem vazio): dar esse acesso no Inventário (`source='local'`) até o Wop ter essa relação.
- Admin local e acessos `source='local'` nunca são alterados pelo feed. Nada é apagado: some do feed = desativado.
- **Function** `functions/api/integrations/wop/sync.ts` (+ `_wopsync.ts`): POST com Bearer do usuário. Qualquer logado dispara a sincronização normal (banco limita a 1/min). `?force=1`, `?full=1` e `?dry=1` só para admin. `me_changed` = acessos de quem chamou mudaram → recarrega a tela uma vez.
- **Sincroniza ao abrir o app e ao voltar à aba (a cada 5 min no máximo).** Não existe tarefa agendada: sem ninguém abrindo o app, nada sincroniza.
- **Tela:** cartão "Sincronização com o Wop" em Ajustes, só para admin (Simular, Sincronizar agora, Ressincronizar tudo, status e log).
- **Rollback:** apagar `INVENTARIO_SYNC_SOURCE` e publicar de novo (nada some). No Wop: `wop_99_rollback_inventario.sql` (revoga a chave e remove as funções novas).

## 7. ESTADO DO CÓDIGO (após T3)
Raiz do repositório: package.json (dependências já incluem qrcode, @zxing/browser e @zxing/library; sem package-lock), vite.config.ts, tsconfig.json, index.html, .gitignore, .env.example.
public/: manifest.json, sw.js, _redirects, favicon.png, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png, logo-black.png (logo para fundo claro), logo-white.png (para fundo escuro), logo-round.png (botão do menu), mark-black.png, mark-white.png.
src/: main.tsx, App.tsx (casca: topo e barra inferior no celular, menu lateral recolhível no computador, abas Início, Itens, Movimentos, Eventos, Ajustes; telas provisórias), Auth.tsx (login e-mail/senha + Google; sem cadastro próprio), store.ts (Zustand, só sessão), brand.ts, index.css (cor de destaque azul-petróleo #0b5769, no escuro #3aa7bf; classes inv-*), vite-env.d.ts, lib/supabase.ts, lib/utils.ts, components/Home.tsx, Settings.tsx, Placeholder.tsx, kit/ (cópia idêntica do kit Shalom).
**Novo na T3 (front/servidor):** `functions/api/integrations/_wopsync.ts`, `functions/api/integrations/wop/sync.ts`, `src/lib/wopSync.ts` (autoSync, callSync, summarize), `src/components/WopSyncCard.tsx`; `App.tsx` chama autoSync ao entrar e ao voltar à aba; `Settings.tsx` mostra o cartão para admin.
**Banco do Inventário na T3 (aplicado pelo conector, migration `inv_t3_wop_consumer`):** tabelas `inv_sync_state` e `inv_sync_log`; RPCs só service_role `inv_sync_claim`, `inv_sync_finish`, `inv_wop_apply_catalog|user|member|events|snapshot`, `inv_wop_dry_run`; `inv_sync_status()` só para admin.
**Banco do Wop na T3 (arquivos `wop_01_feed_inventario.sql`, `wop_02_testes.sql` = TESTES_OK, `wop_99_rollback_inventario.sql`):** app `inventario` no hub, `hub_user_json` com extras só para ele, `wop_inventario_members_json`, `wop_inventario_member_wm`, gatilho `wop_members_touch` (members.updated_at), funções do feed.
**Banco (T2, JÁ APLICADO no Supabase):** pasta `supabase/` com `01_inv_schema.sql`, `02_primeiro_admin.sql`, `03_testes.sql`.
Tabelas: inv_missions, inv_sectors, inv_profiles, inv_profile_contacts, inv_access, inv_hub_members, inv_hub_member_contacts, inv_locations, inv_items, inv_events, inv_movements, inv_movement_contacts, inv_repairs; view inv_item_status; função pública inv_public_item.

## 7B. PENDÊNCIAS
**Resolvidas na T3:** feed vigente = hub do Wop (app `inventario`); setores vêm do Wop (`wop_sectors`); registro do app no hub = chave emitida por `hub_issue_key('inventario', ...)`.
**Abertas:**
- Confirmar a premissa de permissões (membro registra saída e retorno; entrada só quem edita).
- Ligar a sincronização de verdade: emitir a chave no Wop, criar as variáveis no Cloudflare (seção 5), novo deploy, Simular e depois Sincronizar agora. (Confirmar se já foi feito.)
- Relação usuário↔setor no Wop (hoje `allowed_sectors` vem vazio): até existir, acesso de coordenador/membro de setor é dado localmente no Inventário.
- Se o mesmo usuário também existir como membro do Wop, ele pode aparecer duas vezes no seletor de responsável (o feed só esconde membros com `ext_email` igual ao e-mail de um usuário).
- Advisors de segurança: 3 avisos esperados (2 sobre `inv_public_item` executável por anon/logado, intencional para o QR; 1 sobre "leaked password protection", ligar em Authentication se o plano permitir).
- O build completo (npm install, tsc, vite build) da T3 não pôde ser rodado no ambiente do assistente (sem acesso ao registro npm): rodar o deploy no Cloudflare e avisar se der erro.

## 8. TAREFAS
Legenda: [x] feita, [~] entregue, falta validar, [ ] a fazer

- [x] **T0 — Discussão e infraestrutura.**
- [x] **T1 — Base do projeto.** Entregue e testada (tsc sem erros, vite build OK).
- [x] **T2 — Banco e RLS.** Aplicada direto no Supabase pelo conector (3 migrations: inv_t2_01_tabelas, inv_t2_02_funcoes_triggers_view, inv_t2_03_rls_storage_rpc). Testes SQL terminaram em TESTES_OK. Primeiro admin definido. Advisors rodados. SQL guardado em `supabase/`.
- [~] **T3 — Sincronização com o hub.** Banco do Inventário e do Wop aplicados e testados (TESTES_OK no Wop); Function, tela e autoSync entregues. Falta validar no ar (variáveis do Cloudflare, chave, simulação e sync real).
- [ ] **T4 — Itens.** Cadastro com foto, nome, categoria, setor, local de guarda, valor; lista em cartões no celular; QR por item, página pública `/i/<id>`, leitura pela câmera.
- [ ] **T5 — Entrada, saída e retorno.** Fluxo com seletor de responsável (usuário, membro do Wop ou avulso) e cartão do responsável; status calculado; atrasos.
- [ ] **T6 — Eventos.** Cadastro de eventos, lista de itens por evento, conferência na volta, pendências do que não voltou.
- [ ] **T7 — Reparos e valores.** Histórico de reparo (descrição, data, custo), observações à parte, valor de compra ou médio, totais por setor.
- [ ] **T8 — Etiquetas QR em lote.** Várias por folha, escolha de itens por setor, impressão.
- [ ] **T9 — Relatórios.** Itens por setor, fora do acervo, atrasados, em reparo, valor total, histórico por item.

## 9. HISTÓRICO
- 14/10/2026 — T3 entregue: consumidor no Inventário (migration `inv_t3_wop_consumer`), feed `inventario` no Wop (hub estendido com contatos e membros), Function de sync, cartão de admin em Ajustes e autoSync.
- 14/10/2026 — T2 concluída: 13 tabelas inv_, view de status, RLS por missão e setor, bucket de fotos, função pública do QR e gatilhos de validação, aplicados no Supabase e testados (TESTES_OK). barbosma1@gmail.com virou admin local.
- 14/10/2026 — T1 concluída: base do projeto entregue (kit Shalom, logo e ícones, PWA, login, casca com menu). Verificada com type-check e build.
- 14/10/2026 — T0 concluída: escopo fechado, projeto Supabase criado, repositório GitHub criado.

## 10. PRÓXIMA TAREFA
1. Perguntar se a T3 já está no ar: chave emitida, variáveis no Cloudflare, Simular e Sincronizar agora OK (missões, setores, acessos e membros aparecendo).
2. Fazer a **T4 — Itens**: cadastro com foto (comprimida, Storage `inv-fotos`), nome, categoria, setor, local de guarda em níveis, valor (compra ou estimado); lista em cartões no celular; QR por item, página pública `/i/<id>` (usa `inv_public_item`), leitura pela câmera. Reaproveitar o padrão do Gestão Pro (ProductQR, PublicProduct, BarcodeScanner). Seletor de missão/setor conforme `inv_access`.
