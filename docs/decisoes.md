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
