# Regras de negócio

> Rascunho da fase 0. Cada regra tem um ID estável (RN-xx), usado no nome dos testes que a cobrem
> (ex.: `it("RN-05: preparo e limpeza ocupam a agenda", ...)`). A matriz de rastreabilidade no fim
> do documento liga cada regra aos testes; ela é preenchida nas fases 1–3.

## Glossário

| Termo | Significado |
| --- | --- |
| Estabelecimento | Barbearia, salão ou clínica. Tem um fuso horário IANA (ex. `America/Sao_Paulo`) e políticas. |
| Profissional | Quem atende. Tem jornada própria e executa um subconjunto dos serviços. |
| Serviço | Duração, preço, preparo (antes) e limpeza (depois), em minutos. |
| Atendimento | Intervalo `[início, fim)` que o cliente vê. `fim = início + duração`. |
| Bloco ocupado | Intervalo `[início − preparo, fim + limpeza)` que o profissional fica indisponível. |
| Expediente efetivo | Jornada do dia + horários extras − folgas − feriados, no fuso do estabelecimento. |
| Agora | Instante recebido como parâmetro pelo domínio. O domínio nunca lê o relógio. |

## Políticas configuráveis por estabelecimento

| Política | Padrão no seed | Regra |
| --- | --- | --- |
| `granularidadeMin` | 15 | RN-07 |
| `antecedenciaMinimaMin` | 120 | RN-09 |
| `horizonteDias` | 60 | RN-10 |
| `prazoCancelamentoHoras` | 4 | RN-15, RN-16 |
| `limiteAgendamentosAtivos` | 3 | RN-17 |
| `limiteFaltas` | 3 | RN-18 |
| `confirmacaoAutomatica` | true | RN-19 |

## Tempo e intervalos

**RN-01 — Intervalos semiabertos.** Todo intervalo de tempo é `[início, fim)`. Dois intervalos se
sobrepõem se, e somente se, `a.início < b.fim && b.início < a.fim`. Um atendimento que termina às
10:00 não conflita com outro que começa às 10:00. Intervalos vazios (`início >= fim`) são inválidos.

**RN-02 — Fuso horário e armazenamento.** Instantes são gravados em UTC (`timestamptz`). Jornada,
exceções, granularidade, "dia" e horizonte são calculados no fuso do estabelecimento. Em dias com
mudança de horário de verão:
- horários locais que não existem (salto para frente) são descartados;
- horários locais que se repetem (volta) usam a primeira ocorrência;
- a duração de um atendimento é sempre em minutos reais (UTC), nunca em "relógio de parede".

## Expediente

**RN-03 — Jornada semanal.** Cada profissional tem, por dia da semana, zero ou mais intervalos em
hora local (ex. seg 09:00–12:00 e 13:00–18:00). Os intervalos de um mesmo dia não podem se sobrepor
nem ser vazios. Um dia sem intervalos é dia sem expediente. Intervalos não atravessam a meia-noite.

**RN-04 — Exceções por data.** Para uma data local específica:
- `FOLGA` de um profissional: o dia inteiro, ou só um intervalo, sai do expediente;
- `FERIADO` do estabelecimento: o dia inteiro sai do expediente de todos os profissionais;
- `HORARIO_EXTRA` de um profissional: um intervalo é somado ao expediente daquele dia.

Ordem de aplicação: `(jornada ∪ horários extras) − feriados − folgas`. Folga e feriado vencem horário
extra no mesmo dia.

**RN-05 — Bloqueios pontuais.** Um bloqueio é um intervalo UTC de um profissional (ex. "médico
11:00–11:40"). Ele não muda o expediente, mas torna o horário indisponível (erro
`HORARIO_INDISPONIVEL`, não `FORA_DO_EXPEDIENTE`).

## Disponibilidade

**RN-06 — Ocupação de um agendamento.** Um agendamento ocupa o **bloco**
`[início − preparo, fim + limpeza)` do seu profissional, usando os valores copiados no agendamento
(RN-14). Ocupam agenda todos os status exceto `CANCELADO`. Um cancelamento libera o horário na hora.

**RN-07 — Horários livres e granularidade.** Para um serviço, um profissional e uma data local:

```
livre = expediente efetivo − bloqueios − blocos ocupados
```

Um início `t` é oferecido se:
1. `t` está na grade: minutos desde a meia-noite local são múltiplos de `granularidadeMin`;
2. o bloco inteiro `[t − preparo, t + duração + limpeza)` cabe dentro de um único trecho livre
   (preparo e limpeza também são tempo de trabalho e precisam estar dentro do expediente);
3. RN-09 e RN-10 são respeitadas.

Pedidos com início fora da grade são recusados com `HORARIO_FORA_DA_GRADE`.

**RN-08 — O serviço inteiro precisa caber.** Não existe atendimento parcial: se faltam 30 min para
o fim do expediente (ou do trecho antes do almoço), um serviço de 45 min não é oferecido nesse trecho.

**RN-09 — Antecedência mínima.** O início deve ser `>= agora + antecedenciaMinimaMin`. Horários no
passado nunca são oferecidos nem aceitos para o cliente (`ANTECEDENCIA_MINIMA`).

**RN-10 — Horizonte máximo.** A data local do início deve ser `<= data local de hoje + horizonteDias`
(`ALEM_DO_HORIZONTE`). O horizonte é contado em dias de calendário do estabelecimento, para o
cliente ver dias inteiros abertos ou fechados.

**RN-11 — Profissional executa o serviço.** Só é possível agendar com um profissional ativo que
executa o serviço (`PROFISSIONAL_NAO_EXECUTA_SERVICO`).

**RN-12 — "Qualquer profissional".** Os horários oferecidos são a união dos horários de todos os
profissionais que executam o serviço. Ao confirmar, o servidor escolhe entre os que têm aquele
horário livre:
1. o que tem menos agendamentos não cancelados naquela data local;
2. empate: o cadastrado primeiro (`criadoEm`, depois `id`).

Se outro pedido ocupar o escolhido nesse meio-tempo, o servidor tenta o próximo da ordem dentro da
mesma requisição. Só responde `HORARIO_INDISPONIVEL` quando nenhum serve.

**RN-13 — O servidor sempre revalida.** A lista de horários do front é só sugestão. Criar e
remarcar revalidam todas as regras no servidor, dentro da transação. Na recusa por
`HORARIO_INDISPONIVEL`, a resposta traz até 5 próximos horários livres do mesmo serviço e
profissional (ou de qualquer profissional, se o pedido era "qualquer um").

## Agendamento

**RN-14 — Cópia dos dados do serviço.** O agendamento guarda cópia de nome, duração, preço, preparo e
limpeza do serviço. Editar o serviço depois não altera agendamentos já feitos, nem o bloco que eles
ocupam.

**RN-15 — Cancelamento.** O cliente cancela o próprio agendamento enquanto
`agora <= início − prazoCancelamentoHoras`. Depois disso, só o estabelecimento (dono ou o
profissional do agendamento) cancela (`PRAZO_DE_CANCELAMENTO_ENCERRADO`). Só agendamentos
`PENDENTE` ou `CONFIRMADO` podem ser cancelados.

**RN-16 — Remarcação atômica.** Remarcar troca o horário (e opcionalmente o profissional) numa única
transação. O horário antigo só é liberado se o novo for aceito; se o novo for recusado, nada muda.
Na checagem de conflito, o próprio agendamento é ignorado: remarcar para o mesmo horário, ou para um
horário que se sobrepõe ao antigo, é permitido se não houver outro conflito. O cliente remarca no
mesmo prazo de RN-15. O novo horário passa por todas as regras de criação, exceto RN-17. A cópia do
serviço (RN-14) é mantida.

**RN-17 — Limite de agendamentos ativos.** Um cliente pode ter no máximo `limiteAgendamentosAtivos`
agendamentos `PENDENTE` ou `CONFIRMADO` com início futuro no estabelecimento
(`LIMITE_DE_AGENDAMENTOS`).

**RN-18 — Não comparecimento.** Quando um cliente acumula `limiteFaltas` agendamentos
`NAO_COMPARECEU` no estabelecimento, ele não agenda mais online (`CLIENTE_BLOQUEADO`). O dono pode
desbloquear: faltas anteriores à data do desbloqueio deixam de contar.

**RN-19 — Ciclo de vida e histórico.** Status e transições permitidas:

```
PENDENTE   → CONFIRMADO | CANCELADO
CONFIRMADO → CONCLUIDO | NAO_COMPARECEU | CANCELADO
CONCLUIDO, NAO_COMPARECEU, CANCELADO → (final)
```

- O agendamento nasce `CONFIRMADO` se `confirmacaoAutomatica`, senão `PENDENTE`.
- `CONCLUIDO` e `NAO_COMPARECEU` só podem ser marcados depois do início (`agora >= início`) e só
  pelo estabelecimento.
- Toda mudança de status (e toda remarcação) grava uma linha de histórico: status anterior, novo
  status, autor, instante e motivo opcional.
- Transição inválida: `TRANSICAO_DE_STATUS_INVALIDA`.

**RN-20 — Estabelecimento no balcão.** Dono e profissional, ao criar ou remarcar pelo painel, não
estão sujeitos a RN-09 (exceto horário no passado: `HORARIO_NO_PASSADO`), RN-10, RN-15, RN-17 e
RN-18. Continuam sujeitos ao expediente (RN-03/04), a conflitos (RN-05/06) e a RN-11. Para atender
fora do expediente, cadastra-se um horário extra.

## Concorrência e integridade

**RN-21 — Garantia no banco.** Uma constraint de exclusão no PostgreSQL (`btree_gist`) impede, para o
mesmo profissional, sobreposição de `tstzrange(inicio_bloco, fim_bloco, '[)')` entre agendamentos
não cancelados. A violação (SQLSTATE `23P01`) vira `409 HORARIO_INDISPONIVEL`. Bloqueios também são
checados na transação de escrita (ver docs/decisoes.md). Com 20 requisições simultâneas para o mesmo
horário, exatamente 1 tem sucesso e 19 recebem 409.

**RN-22 — Idempotência.** A criação de agendamento aceita o header `Idempotency-Key`. A mesma chave,
do mesmo cliente e com o mesmo corpo, devolve a resposta original sem criar outro agendamento. A
mesma chave com corpo diferente devolve `422 CHAVE_IDEMPOTENCIA_REUTILIZADA`. As chaves valem por
24 h.

## Acesso

**RN-23 — Papéis.**
- `DONO`: tudo do próprio estabelecimento.
- `PROFISSIONAL`: lê e altera só a própria agenda (agendamentos, bloqueios, folgas).
- `CLIENTE`: lê, cria, cancela e remarca só os próprios agendamentos.

Acesso a um recurso de outro estabelecimento, ou de outro cliente, responde `404` (não vaza a
existência). Ação proibida para o papel em um recurso visível responde `403 ACESSO_NEGADO`.

## Notificações

**RN-24 — E-mails.** Ao criar ou remarcar, o cliente recebe confirmação. Um job envia lembrete 24 h
antes do início, uma única vez por agendamento ativo. Remarcar rearma o lembrete; cancelar o anula.
Em dev, os e-mails vão para o Mailpit (ou para o console, sem Docker).

## Códigos de erro

Ordem de checagem na criação, quando mais de uma regra falha: autenticação/autorização → RN-18 → RN-17
→ RN-11 → RN-07 (grade) → RN-09 → RN-10 → expediente → conflito.

| Código | HTTP | Regra |
| --- | --- | --- |
| `HORARIO_INDISPONIVEL` | 409 | RN-05, RN-06, RN-12, RN-13, RN-21 |
| `FORA_DO_EXPEDIENTE` | 422 | RN-03, RN-04, RN-07 |
| `HORARIO_FORA_DA_GRADE` | 422 | RN-07 |
| `ANTECEDENCIA_MINIMA` | 422 | RN-09 |
| `HORARIO_NO_PASSADO` | 422 | RN-20 |
| `ALEM_DO_HORIZONTE` | 422 | RN-10 |
| `PROFISSIONAL_NAO_EXECUTA_SERVICO` | 422 | RN-11 |
| `PRAZO_DE_CANCELAMENTO_ENCERRADO` | 422 | RN-15, RN-16 |
| `LIMITE_DE_AGENDAMENTOS` | 422 | RN-17 |
| `CLIENTE_BLOQUEADO` | 403 | RN-18 |
| `TRANSICAO_DE_STATUS_INVALIDA` | 422 | RN-19 |
| `CHAVE_IDEMPOTENCIA_REUTILIZADA` | 422 | RN-22 |
| `ACESSO_NEGADO` | 403 | RN-23 |
| `NAO_ENCONTRADO` | 404 | RN-23 |
| `DADOS_INVALIDOS` | 400 | validação Zod |

Corpo de erro: `{ "codigo": "...", "mensagem": "...", "detalhes"?: {...} }`.

## Matriz de rastreabilidade

Preenchida a partir da fase 1. Coluna "Testes": arquivo e nome do teste.

| Regra | Unitário (domínio) | Propriedade (fast-check) | Integração / E2E |
| --- | --- | --- | --- |
| RN-01 | — | — | — |
| RN-02 | — | — | — |
| RN-03 | — | — | — |
| RN-04 | — | — | — |
| RN-05 | — | — | — |
| RN-06 | — | — | — |
| RN-07 | — | — | — |
| RN-08 | — | — | — |
| RN-09 | — | — | — |
| RN-10 | — | — | — |
| RN-11 | — | — | — |
| RN-12 | — | — | — |
| RN-13 | — | — | — |
| RN-14 | — | — | — |
| RN-15 | — | — | — |
| RN-16 | — | — | — |
| RN-17 | — | — | — |
| RN-18 | — | — | — |
| RN-19 | — | — | — |
| RN-20 | — | — | — |
| RN-21 | — | — | — |
| RN-22 | — | — | — |
| RN-23 | — | — | — |
| RN-24 | — | — | — |
