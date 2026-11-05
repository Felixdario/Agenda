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
