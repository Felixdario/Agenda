# Decisões

Registro curto de decisões não bloqueantes (o quê, por quê, alternativa descartada).

## D-01 — Postgres via Docker Compose (2026-11-05)
O projeto exige PostgreSQL real (`btree_gist` + constraint de exclusão); SQLite não serve. O usuário
escolheu instalar o Docker Desktop. `docker-compose.yml` sobe Postgres 17 e Mailpit. No CI, o
GitHub Actions usa um `services: postgres`.

## D-02 — O bloco ocupado inclui o preparo (2026-11-05)
O pedido fala em `tstzrange(início, fim_com_limpeza)`. Como o serviço também tem preparo **antes**,
o agendamento grava `inicio_bloco = início − preparo` e `fim_bloco = fim + limpeza`, e a constraint usa
`tstzrange(inicio_bloco, fim_bloco, '[)')`. O cliente continua vendo só `[início, fim)`.
Alternativa descartada: ignorar o preparo na constraint (deixaria o banco aceitar sobreposição que o
domínio recusa).

## D-03 — Preparo e limpeza precisam caber no expediente (2026-11-05)
São tempo de trabalho do profissional. Um serviço com 10 min de preparo não começa às 09:00 se o
expediente começa às 09:00. (RN-07)

## D-04 — "Ocupa agenda" ≠ "ativo" (2026-11-05)
Ocupam agenda todos os status exceto `CANCELADO` (RN-06, constraint com `WHERE status <> 'CANCELADO'`).
"Ativo" para o limite do cliente (RN-17) é `PENDENTE`/`CONFIRMADO` com início futuro.

## D-05 — Bloqueio × agendamento na mesma transação (2026-11-05)
Uma constraint de exclusão não atravessa tabelas. Criar agendamento e criar bloqueio pegam
`pg_advisory_xact_lock(hash(profissional_id))` antes de checar conflitos, e o domínio recusa bloqueio
sobre agendamento existente. A constraint continua sendo a garantia final entre agendamentos.

## D-06 — Grade alinhada à meia-noite local (2026-11-05)
Inícios oferecidos são múltiplos de `granularidadeMin` desde 00:00 local, não desde o início de cada
trecho livre. Fica previsível para o cliente (09:00, 09:15…), e o arrastar do painel encaixa na
mesma grade.

## D-07 — Horizonte em dias de calendário (2026-11-05)
`data local do início <= hoje local + horizonteDias`, para o dia aberto mais distante aparecer
inteiro, e não cortado no meio pelo relógio.

## D-08 — Skills (2026-11-05)
Disponíveis: impeccable, design-taste-frontend, emil-design-eng, animate, break-ui, dupla-agentes.
`review-animations` e `pick-ui-library` existem em `~/.claude/skills`, mas com
`disable-model-invocation: true`. O agente lê o `SKILL.md` delas e segue as instruções manualmente.

## D-09 — Bibliotecas de UI (pick-ui-library, 2026-11-05)
Pela lista curada da skill:
- **Toasts:** Sonner, que tem a promise toast, combina com "Agendando…" → sucesso/409.
- **Primitivas** (dialog, popover, select, menu): base-ui. A11y e foco prontos.
- **Arrastar para remarcar:** dnd kit. Tem sensores de teclado (acessível), e o `onDragEnd` permite
  chamar o servidor e reverter.
- **Animação:** motion, para springs e para o undo animado quando o servidor recusa. O resto é CSS.
- **Estilo:** Tailwind + clsx + cva.
- **Listas longas** (histórico, 40 agendamentos por dia): Virtuoso, só se a medição pedir.

Fora da lista da skill, por escolha própria:
- **Calendário/agenda:** grade própria (colunas por profissional, linhas pela granularidade), sem
  FullCalendar nem schedule-x. Motivo: a grade precisa usar o fuso do estabelecimento, a mesma
  granularidade do domínio (RN-07), as faixas de preparo e limpeza e o arrastar com validação no
  servidor. Uma lib genérica traria um modelo de eventos próprio e CSS difícil de alinhar ao DESIGN.md.
  O seletor de dia da página pública também é próprio: uma faixa de dias com indicação de vagas.
- **Formulários:** react-hook-form + `@hookform/resolvers/zod`, reutilizando os schemas de
  `@agenda/shared`, para a mesma validação valer no front e na API.

## D-10 — Versões e esqueleto (2026-11-05)
- **NestJS 11** (já existe a 12.3): o pedido fala em Nest 11 e o ecossistema de plugins está estável
  nessa versão. Subir para a 12 é uma mudança isolada.
- **TypeScript ~6.0**: o typescript-eslint 8.72 exige `<6.1` (o TS 7 já existe).
- **Next 16 + React 19 + Tailwind 4.** `next lint` não existe mais; o lint usa `eslint .`.
- **API em dev com SWC** (`@swc-node/register`) e Vitest com `unplugin-swc`: o esbuild/tsx não emite
  `emitDecoratorMetadata`, e sem isso a injeção de dependência do Nest por tipo quebra.
- **`@agenda/shared` exporta o código-fonte TS direto**, sem etapa de build. O Next transpila via
  `transpilePackages`, e o SWC transpila na API.
- O build de produção da API (`nest build -b swc`) fica para a fase 7.

## D-11 — Ambiguidades resolvidas na fase 1 (2026-11-05)
Aceitas pelo Planejador a partir da proposta do Executor:
1. **Grade em relógio local** (`hora×60+min` múltiplo da granularidade), refinando D-06. Só difere
   do "minutos desde 00:00" em dia de DST com granularidade que não divide 60.
2. **Hora repetida na volta do DST:** só a 1ª ocorrência está na grade. A 2ª é
   `HORARIO_FORA_DA_GRADE`. Trecho que termina dentro da hora repetida termina na 1ª ocorrência.
3. **Borda de trecho em horário inexistente** vai para o fim do salto (02:30–05:00 em NY no dia do
   salto vira 03:00–05:00).
4. **"24:00"** é aceito como fim de trecho.
5. **Preparo e limpeza podem usar o expediente contínuo do dia vizinho** (dom 22–24 + seg 00–02).
6. **Cancelar ou remarcar** agendamento fora de PENDENTE/CONFIRMADO → `TRANSICAO_DE_STATUS_INVALIDA`.
7. **Cliente marcando CONCLUIDO/NAO_COMPARECEU** → `ACESSO_NEGADO`. Já PENDENTE→CONFIRMADO só é
   permitido ao estabelecimento: a restrição de papel é aplicada na camada de aplicação (fase 3).
8. **Ordem na remarcação pelo cliente:** status → RN-18 → prazo (RN-15) → RN-11 → horário.
9. **RN-18:** a falta conta se `inicio >= desbloqueadoEm`.
10. **RN-17:** "início futuro" é `inicio > agora`, estrito.
11. **Bloqueio fora do expediente** → `FORA_DO_EXPEDIENTE` (o expediente é checado antes do conflito).
12. **RN-12:** quem chama calcula `livre` e `agendamentosNoDia`; o domínio só ordena.

Desvios aceitos do contrato:
- `Resultado<T>` tem um único genérico.
- `podeCriar`/`podeRemarcar` recebem `profissional` e `cliente`.
- Calendário aritmético próprio, com o deslocamento de fuso vindo do Luxon (`IANAZone.offset`), por
  desempenho. Os testes cruzam os resultados com `DateTime`.

## D-12 — Ambiguidades levantadas pelo Validador (2026-11-05)
1. **Atendimento atravessando a meia-noite** é permitido quando o expediente é contínuo. Ele
   pertence à data local do início, para o horizonte (RN-10) e para a contagem do RN-12.
2. **Balcão com `inicio == agora`** não é passado: `HORARIO_NO_PASSADO` só vale para `inicio < agora`.
3. **Horário extra encostado na jornada** forma um trecho contínuo, e um serviço pode atravessar a
   emenda (fórmula do expediente efetivo, RN-04).
4. **Bordas de trecho ou folga dentro da hora repetida** usam a 1ª ocorrência, como em D-11.2.
5. **O texto da RN-07** foi alinhado a D-11.1 (grade em relógio local).
6. **A ordem de checagem da remarcação** foi escrita na própria RN-16.
7. **RN-13:** `proximosHorariosLivres` procura até `horizonteDias` a partir do dia pedido. Para o
   cliente, o horizonte ainda filtra o resultado; o balcão pode ver além dele (RN-20).

## D-13 — Constraint de exclusão em migration SQL manual (2026-11-08)
O Prisma não modela `EXCLUDE USING gist` nem `CHECK`. Por isso a garantia do RN-21 fica numa
migration escrita à mão, `apps/api/prisma/migrations/*_exclusao_agendamentos/migration.sql`, logo
depois da migration gerada (`*_inicial`). Ela tem `CREATE EXTENSION IF NOT EXISTS btree_gist`, a
constraint `agendamento_sem_sobreposicao` (`"profissionalId" WITH =`,
`tstzrange("inicioBloco","fimBloco",'[)') WITH &&`, `WHERE status <> 'CANCELADO'`) e os CHECKs
`bloco_valido` e `bloqueio_valido`.

Verificado com o banco migrado: `prisma migrate diff --from-config-datasource --to-schema` e
`prisma migrate dev --create-only` geram migration vazia. O Prisma ignora a constraint e não tenta
removê-la. Os testes de integração rodam `migrate deploy` num banco limpo (`agenda_test`), e um
deles confere que a constraint existe.

Alternativa descartada: só checar no código. Uma escrita fora da aplicação, ou um bug, passaria; o
teste C3 mostra o banco recusando um INSERT cru (23P01).

Junto vêm estas decisões da camada de aplicação:
- A trava `pg_advisory_xact_lock(hashtextextended(chave, 0))` é tomada em ordem estável e vale até
  o fim da transação. "Qualquer profissional" trava todos os candidatos. O cliente também é travado
  ao agendar, para o limite do RN-17 não ser furado por pedidos paralelos.
- A 23P01 é tratada com SAVEPOINT. A transação continua viva, e o próximo profissional da ordem do
  RN-12 é tentado na mesma requisição.
- Idempotência (RN-22): a chave é reservada com `INSERT … ON CONFLICT DO UPDATE … WHERE expirada`,
  na mesma transação do agendamento e antes de qualquer trava. Um pedido paralelo com a mesma chave
  espera no índice da PK e depois lê a resposta gravada. A resposta gravada é o resultado final,
  sucesso ou recusa de regra.

Revisão da fase 2 (Validador independente):
- **Trava antes da leitura.** Todo caso de uso de escrita toma as travas antes de ler qualquer
  dado que será validado. `agendar` trava `cliente:<id>` e os profissionais candidatos (antes disso
  só descobre os ids). `remarcar` trava a linha (`FOR UPDATE`) e depois `cliente`, o profissional
  novo e o antigo. `criarBloqueio` trava o profissional. `mudarStatus` trava a linha e, em
  NAO_COMPARECEU, o cliente (a contagem do RN-18). As advisory locks são tomadas em ordem
  alfabética de chave. A linha travada vem sempre antes delas, e nenhum caso trava uma linha
  depois de uma advisory lock, então não há ciclo.
- **Bloqueio × agendamento** é protegido só pela advisory lock do profissional: não existe
  constraint entre as duas tabelas. Todo caminho que escreve `Agendamento` ou `Bloqueio` precisa
  passar pelos casos de uso, com `travar`. Escrita direta no banco só tem a garantia da constraint
  entre agendamentos.
- **Validade da chave:** ela expira exatamente em `criadaEm + 24 h`. Com `expiraEm <= agora`, a
  chave pode ser reutilizada como nova.
- **Erro lançado** (deadlock, timeout, falha de conexão) desfaz a transação inteira, inclusive a
  reserva da chave. O próximo pedido com a mesma chave reexecuta. Só os resultados de regra
  (sucesso ou recusa com `CodigoErro`) ficam gravados.
- **Sessão do Postgres em UTC (RN-02).** O `@prisma/adapter-pg` 7.10.1 envia `Date` como texto sem
  offset e, na leitura, troca o offset devolvido por `+00:00`. Gravação e leitura só ficam certas
  com a sessão em UTC. `criarPrisma` cria o `pg.Pool` e roda `SET TIME ZONE 'UTC'` em cada conexão
  nova, antes de qualquer consulta. Isso vence o default do servidor, o
  `ALTER DATABASE … SET timezone` e o `options=-c TimeZone=…` da URL.

## D-14 — Fechamento da fase 2 (trio) (2026-11-08)
- O Validador independente achou 2 falhas reais, já corrigidas:
  - **RN-17/RN-18:** o cliente era lido antes da trava, e o limite era furado sob concorrência.
  - **RN-02:** os instantes dependiam do TimeZone da sessão Postgres.
- Os 43 testes do Validador ficam como regressão em `apps/api/test/validacao/`. Entre eles há uma
  carga mista de 15 × 40 operações paralelas, sem sobreposição e sem deadlock.
- **Regra operacional:** todo acesso ao banco pela aplicação usa `criarPrisma`, que fixa a sessão em
  UTC. Um script ou pool externo que não passe por ele perde essa garantia.
- **Riscos aceitos, conservadores:**
  - A lista de candidatos de "qualquer profissional" é lida antes da trava. Quem passar a executar o
    serviço durante a requisição fica de fora, e quem foi desativado é filtrado depois.
  - Cancelar não trava o cliente. Um pedido concorrente pode ser recusado a mais, mas a regra nunca é
    violada.

## D-15 — API HTTP, sessão e e-mails (fase 3) (2026-11-08)
Tomadas pelo Planejador no brief da fase 3 (.dupla/fase-3-api.md):
1. **`NAO_AUTENTICADO` → 401** para quem não tem sessão, ou tem sessão inválida ou expirada. Fica
   em `packages/shared/src/erros.ts` e na tabela de erros, conferida 1:1 por
   `packages/shared/src/erros-tabela.test.ts`.
2. **Sessão opaca em cookie httpOnly.**
   - Tabela `Sessao` (o token aleatório de 32 bytes fica só no cliente; o banco guarda o SHA-256),
     válida por 7 dias. Migration `*_sessao_e_nome`, criada com `migrate dev --create-only` e
     aplicada com `migrate deploy`.
   - Cookie `agenda_sessao`: httpOnly, SameSite=Lax, Path=/, Secure só em produção. O token também
     vai no corpo do login, e a API aceita `Authorization: Bearer`. Logout revoga a sessão.
   - **CSRF:** CORS só para `WEB_ORIGIN`, com credentials. Toda requisição que muda estado e traz o
     cookie precisa de `Content-Type: application/json`; senão, 400 `DADOS_INVALIDOS`
     (`detalhes.motivo = CONTENT_TYPE_JSON_OBRIGATORIO`).
3. **argon2id com o pacote `argon2`.** O binário pré-compilado instalou e rodou no Windows, então
   não foi preciso o `@node-rs/argon2`. Perfil 19 MiB / 2 iterações; em teste (`NODE_ENV=test`),
   1 MiB / 1 iteração.
4. **Registro de cliente:** `POST /auth/registro` cria um `Usuario` CLIENTE (`Usuario.nome` foi
   acrescentado). A linha `Cliente` nasce sob demanda, com upsert por (usuário, estabelecimento):
   dentro da transação de `agendar` (`clienteUsuarioId`) ou em `GET /auth/eu?estabelecimento=slug`.
5. **Instantes em ISO UTC (`…Z`)** nas respostas, e `fuso` na resposta do estabelecimento.

Escolhas desta fase:
- **`ERRO_INTERNO` (500) entrou no enum `CodigoErro`**, com uma linha na tabela de erros. Assim o
  corpo 500 também segue `corpoErroSchema`. A mensagem é genérica e não traz stack.
- **`Usuario.senhaHash` passou a ser opcional.** O cliente criado no balcão por e-mail fica sem
  senha utilizável, e o login recusa com a mesma resposta de senha errada.
- **Login sem enumeração:** e-mail inexistente, senha errada e conta sem senha recebem a mesma
  mensagem ("E-mail ou senha incorretos.") e o mesmo custo de argon2, contra um hash fictício.
- **Mensagens:** as de erro em português ficam em `MENSAGEM_POR_CODIGO`, em @agenda/shared. As
  mensagens do Zod usam `z.locales.ptBR()`, configurado em `packages/shared/src/api/comum.ts`, e
  valem também para o front.
- **Autorização** (RN-23) é feita por funções puras em `application/autorizacao.ts`. A composição
  "autoriza → caso de uso → e-mail depois do commit" fica em `application/operacoes.ts`. Os
  controllers só validam com os schemas de `packages/shared/src/api` e chamam essas operações;
  nenhum importa Prisma. `:id` que não é UUID → 404.
- **E-mail depois do commit:** `agendarDetalhado` diz se a resposta é a repetição de uma
  Idempotency-Key, e a repetição não reenvia o e-mail. A falha de envio só é registrada.
- **Lembrete:** `UPDATE … SET "lembreteEnviadoEm" = agora WHERE "lembreteEnviadoEm" IS NULL AND
  status ativo AND inicio ∈ (agora, agora + 24 h] RETURNING id`, antes de enviar. Se o envio falhar
  depois da marcação, o lembrete daquele agendamento se perde: preferimos isso a duplicar.
  Remarcar zera a marca. Job em `infra/jobs` a cada minuto; `LEMBRETES_ATIVOS=false` desliga.
- **Cadastros que mudam a disponibilidade** tomam a mesma trava `profissional:<id>` de agendar:
  jornada, exceções (feriado trava todos os profissionais) e edição de profissional. Desbloquear
  cliente toma `cliente:<id>`.
- **Seed** (`db:seed` → `apps/api/src/infra/seed/demo.ts`): todos os agendamentos passam pelos
  casos de uso. O histórico passado é criado com um relógio voltado 7 dias e concluído, faltado ou
  cancelado com o relógio adiante. É idempotente: apaga só o estabelecimento demo e faz upsert das
  contas. O PRNG tem semente na data de hoje.
- **Autorização sem TOCTOU (RN-23) — resolvido.** Antes, a autorização de agendamento lia
  estabelecimento e profissional fora da transação: um PROFISSIONAL podia cancelar, marcar falta
  ou remarcar um agendamento que o dono acabara de mover para outro profissional. Agora
  `remarcar` e `mudarStatus` (cancelar, confirmar, concluir, não compareceu) recebem um
  `autorizar(agendamentoTravado)`. Ele roda logo depois do `SELECT … FOR UPDATE` e antes de
  qualquer outra regra, sobre o estado atual da linha. Se negar, devolve 404/403 sem gravar nada.
  A checagem de fora continua como atalho barato.
  - O cliente do agendamento é imutável (`clienteId`); a regra confere que a linha travada tem o
    mesmo `clienteId` lido fora.
  - As demais autorizações do painel dependem só de dados imutáveis: o `profissionalId` de bloqueio
    e de exceção, e o `estabelecimentoId` de profissional, serviço e cliente. As escritas de
    cadastro ainda conferem o estabelecimento dentro da transação.
  - Teste determinístico em `apps/api/test/integracao/http-toctou.test.ts`. Uma transação manual
    trava a linha, o pedido de A fica esperando (confirmado no `pg_stat_activity`), a linha vai
    para B, a trava é liberada, e o pedido termina em 403 sem mudar nada. Sem a correção, os 3
    testes de corrida falham.

## D-16 — Direção de design e nome do produto (fase 4) (2026-11-09)
- **PRODUCT.md** foi feito com `impeccable init`, a partir de uma entrevista com o usuário. A
  vitrine são as duas superfícies por igual: a reserva do cliente e o painel do estabelecimento. A
  identidade é neutra, servindo a vários segmentos.
- **Idiomas: pt-BR e inglês desde o início** (decisão do usuário). Toda string passa por i18n, e os
  códigos de erro são traduzidos no front.
- **Direção visual:**
  - Duas rodadas no impeccable (`concept-seed`, modo Operate, `seed:2b07773378b285d7`):
    - 1ª: Via do Cupom, Agenda de Balcão e Linhas do Dia;
    - 2ª, mais ousada: Painel de Partidas, Console Grafite e Horário de Bolso.
  - O usuário escolheu **o padrão da categoria, de propósito**, com o Booksy como régua de
    acabamento. A convenção é executada por inteiro. A distinção fica em três elementos próprios: o
    bloco ocupado (preparo, serviço e limpeza), a recusa 409 com os próximos horários e os números
    tabulares.
- **Nome: Pontual.** Os candidatos eram Pontual, Encaixe e Hora Marcada; o usuário escolheu
  Pontual.
- **DESIGN.md v0 antes da construção.** O fluxo do impeccable escreve o DESIGN.md só no fim, a partir
  da interface pronta. O pedido do usuário exige o DESIGN.md na fase 4. Por isso o arquivo é um
  contrato v0 e será reescrito na fase 6 pelo `impeccable document`; onde divergir, vale a interface
  construída.
- **design-taste-frontend:** usei as regras de telas de app (`references/app-screens.md`):
  - uma família grotesca, títulos entre 18 e 32 px e números tabulares;
  - primário quase preto e acento só no dado e no foco;
  - borda ou sombra, nunca as duas;
  - nada de violeta, gradiente ou ícone em círculo.

  Com isso, o violeta do rascunho padrão foi trocado por cobalto.
- **Contrato de direção** em `apps/web/.impeccable/surfaces/app.md`. Os rascunhos de decisão ficam
  em `.impeccable/mocks/`, ignorados pelo git.

## D-17 — Front do Pontual (fase 5) (2026-11-09)
Tomadas pelo Planejador no brief da fase 5 (.dupla/fase-5-front.md):
1. **Proxy same-origin.** `next.config.ts` faz rewrite de `/api/:path*` para `${API_URL}/:path*`. O
   navegador só fala com `/api/...`, o cookie httpOnly `agenda_sessao` fica first-party e toda
   mutação manda `Content-Type: application/json`, inclusive o `DELETE` (`src/lib/api.ts`).
2. **i18n com `next-intl`, sem prefixo de rota.** O locale vem do cookie `NEXT_LOCALE` (pt-BR
   padrão, en). Dicionários em `apps/web/messages/{pt-BR,en}.json`, com as chaves tipadas
   (`src/i18n/tipos.d.ts`: `t('chave.inexistente')` não compila). Um teste confere a paridade das
   chaves e dos argumentos ICU, e outro confere `erros.<CODIGO>.{mensagem,acao}` para todo
   `CodigoErro`. As mensagens do Zod seguem o idioma da interface (`z.config` no `Providers`).
3. **Fuso.** Toda data e hora sai de `src/lib/tempo.ts`, com `Intl.DateTimeFormat` + `timeZone` do
   estabelecimento. O teste troca o `TZ` do processo e o resultado não muda; o E2E 6 roda o
   navegador em Tóquio.
4. **Dados.** TanStack Query com as chaves em `src/lib/consultas.ts`. As respostas são validadas no
   cliente com schemas Zod novos em `packages/shared/src/api/respostas.ts`. O erro HTTP vira
   `ErroApi {codigo, mensagem, detalhes, status}`. Agendar, remarcar e cancelar invalidam horários,
   "meus agendamentos", agendas do painel e o histórico.
5. **Idempotency-Key** por tentativa (`src/lib/idempotencia.ts`): a mesma escolha reusa a chave
   (clique repetido ou falha de rede); uma escolha nova, inclusive uma pílula da recusa 409, gera
   outra; o sucesso encerra a chave.
6. **Bibliotecas:** base-ui (Dialog, Menu, Select, Tabs), Sonner, clsx + cva, lucide-react,
   react-hook-form + `@hookform/resolvers/zod`. O `motion` ficou de fora: todo movimento coube em
   CSS (transições, `@starting-style` do base-ui e `@keyframes` com os valores do DESIGN.md), e ele
   volta junto com o arrastar para remarcar. Hanken Grotesk
   via `next/font`. Conferido no Chrome: os dígitos da Hanken já são tabulares por padrão ("1111" e
   "0000" medem 89,6 px a 40 px, com `proportional-nums` ou com `tabular-nums`). A fonte não tem a
   variante proporcional, então `tabular-nums` não muda a largura porque não há o que mudar: os
   números já se alinham na coluna. A classe `.num` fica em todo número, para o caso de a fonte
   mudar. **Ponto para o Planejador:** a regra literal do DESIGN.md ("se não mudar, trocar pela
   Onest") levaria à Onest; mantive a Hanken porque o objetivo (algarismos de largura fixa) está
   cumprido.
7. **Autenticação no front.** `/entrar` e `/criar-conta`; o `src/proxy.ts` (o antigo middleware no
   Next 16) consulta `GET /auth/eu` só para redirecionar: `/painel/*` exige DONO ou PROFISSIONAL e
   `/meus-agendamentos` exige sessão. Um 401 no meio do uso leva a `/entrar?voltar=…`. A tela de
   entrar mostra as 3 contas demo; "Entrar como…" só preenche o formulário.

Escolhas desta fase (propostas ao Planejador):
- **Leituras novas na API (aditivas).** A interface precisava de dados que a API não expunha:
  - `GET /estabelecimentos/:slug` passa a trazer `preparoMin` e `limpezaMin` de cada serviço, para o
    cliente ver o bloco ocupado antes de confirmar;
  - `GET /painel/estabelecimento` (nome, slug, fuso e todas as políticas), para o shell e o
    formulário de políticas;
  - `GET /painel/profissionais/:id/jornada`, para o editor da jornada;
  - `excecoes` (com `id`) em cada profissional de `GET /painel/agenda`, para remover folgas.
  Tudo coberto por um teste novo em `http-painel.test.ts`. Nenhuma regra mudou.
- **Seed:** o atendimento passado mais recente fica em aberto (CONFIRMADO). É o caso real do dono
  que esqueceu de fechar o dia, e dá ao E2E 5 (e ao avaliador) um caminho limpo para "concluir",
  sem relógio falso.
- **Estado do fluxo de reserva na URL** (`servico`, `prof`, `data`, `inicio`, `passo`): sem login,
  "Entrar para confirmar" leva a `/entrar?voltar=` e volta para a revisão com a mesma escolha.
- **Recusa 409:** a pílula da recusa confirma direto, com chave nova; se perder de novo, a folha se
  atualiza com a nova lista.
- **Selects nativos nos formulários do painel** (encaixe, bloqueio, remarcar) e base-ui `Select`
  só no seletor de idioma: no celular, o seletor do sistema é o mais acessível.
- **"Sem horários"** no dia vazio: a API não informa o motivo (folga, lotado), e o front não
  adivinha.
- **CLIENTE_BLOQUEADO** mostra o nome do estabelecimento como contato: o cadastro não tem telefone
  nem e-mail de contato, e nada foi inventado.
- **Arrastar para remarcar (dnd kit) ficou de fora** (opcional no brief). Remarcar no painel é um
  diálogo com a grade do balcão (RN-20).
- **E2E:** Playwright no Chrome instalado (`channel: 'chrome'`, nada é baixado), banco
  `agenda_e2e` com `migrate deploy` + seed a cada execução (`e2e/preparar-banco.mjs`), API em
  :3334 e `next build && next start` em :3100 com `distDir` `.next-e2e`. Testes em série, cada um
  com clientes novos (o limite de 3 ativos do RN-17). No CI, um passo roda o `test:e2e` depois do
  seed.

## D-18 — Polimento (fase 6) (2026-11-09)
Pedidas pelo Planejador no brief da fase 6 (.dupla/fase-6-polimento.md); relatórios em
`.dupla/fase-6-break-ui.md`, `.dupla/fase-6-animacoes.md` e `.dupla/fase-6-auditoria.md`.
1. **Pior caso em duas camadas.**
   - Fixtures em `apps/web/src/dev/pior-caso/` e a página `/dev/pior-caso`, que renderiza as telas
     reais trocando só o `fetch` de `/api/...`. Cenários: demo (API real), pior, sem vaga e vazio,
     mais o modo offline. Em produção a página chama `notFound()` antes do `import()` dinâmico, que
     vira código morto: as fixtures não entram em bundle nenhum.
   - No banco, `db:seed:pior-caso` (idempotente, só a primeira quarta-feira depois de 15 dias): o
     almoço vira horário extra e a grade é lotada pelo caso de uso `agendar` (40 + 40 + 38
     atendimentos de 15 min) com clientes de nome difícil. O e2e roda o script depois do seed.
2. **Offline.**
   - Um aviso fixo no topo de toda tela.
   - As consultas pausam (modo `online` do TanStack) e o cache continua na tela; voltar a rede
     revalida tudo (`refetchOnReconnect: 'always'`).
   - Mutações em `networkMode: 'always'`: sem rede, falham na hora com REDE em vez de ficar na fila
     e disparar sozinhas ao reconectar. Os botões que gravam (`exigeRede`) ficam desabilitados
     offline.
   - Reenviar depois de uma falha de rede usa a mesma Idempotency-Key (e2e confere os dois headers
     e que só há um agendamento).
3. **Acessibilidade (WCAG 2.2 AA).**
   - `@axe-core/playwright` em `e2e/a11y.spec.ts`: 13 telas, claro e escuro, zero serious/critical.
   - E2E de teclado: do serviço à confirmação, com o foco no título ao abrir a folha e de volta no
     gatilho ao fechar.
   - Troca de passo anunciada numa live region; a recusa tem `role="alert"`.
   - O nome acessível começa pelo texto visível (2.5.3); o complemento (dia, profissional, status)
     vai em `sr-only`.
   - Hachura com 3,5:1 (claro) e 4,6:1 (escuro); pontos de série com 4,8:1 ou mais.
   - Alvos: 48 px no fluxo do cliente; no painel, 24 px ou mais (a grade passou a 1,76 px por
     minuto, e o cartão de 15 min tem 24,4 px).
4. **Movimento** (review-animations): saídas mais curtas que entradas, nada de `width` ou
   `box-shadow` animados, a pílula perdida só encolhe (sem perder contraste) e o reduced-motion vale
   também para o retorno de toque.
5. **`Botao` é componente de cliente** (lê o estado da rede); o estilo (`estiloBotao`) foi para
   `components/ui/botao-estilo.ts`, importável por páginas de servidor.
6. **DESIGN.md reescrito** a partir da interface (`impeccable document`, refresh aprovado na D-16):
   front-matter com os tokens, as oito seções canônicas e o sidecar
   `apps/web/.impeccable/design.json` (movimento, sombra, breakpoints e componentes).
7. **Exceção do detector:** a hachura (`repeating-linear-gradient`) gera um aviso consultivo de
   "listras decorativas". Fica, porque é o padrão do bloco ocupado e carrega significado.

## D-19 — README e o "rodar em 3 comandos" (fase 7) (2026-11-09)
- **`corepack pnpm demo`** (`scripts/demo.mjs`, só Node): cria o `.env` a partir do `.env.example`
  se faltar, roda `db:migrate` (deploy) e `db:seed`, sobe a API e o web com
  `pnpm -r --parallel … dev` e imprime as URLs e as contas quando os dois respondem.
- **Sem build empacotado da API.** O `shared` exporta TypeScript direto (D-10) e o Nest depende de
  `emitDecoratorMetadata`: o `tsc` geraria ESM sem extensão nos imports, que o Node não resolve, e
  o esbuild não emite os metadados. A API roda em produção com o SWC transpilando na carga
  (`start`). Um build de verdade pede um bundler com SWC (ou o `shared` compilado) e fica para
  quando houver deploy.
- **README em pt-BR e em inglês**, com o mesmo conteúdo, e 7 screenshots copiados de
  `apps/web/.impeccable/review/` para `docs/screenshots/`. Sem badge de CI (não há remote) e sem
  licença escolhida.
