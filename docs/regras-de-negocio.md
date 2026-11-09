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
1. `t` está na grade: o horário de relógio local (`hora × 60 + minuto`, com segundos e ms zerados)
   é múltiplo de `granularidadeMin`; na hora repetida da volta do horário de verão, só a 1ª ocorrência
   está na grade (D-11);
2. o bloco inteiro `[t − preparo, t + duração + limpeza)` cabe dentro de um único trecho livre
   (preparo e limpeza também são tempo de trabalho e precisam estar dentro do expediente). Trechos
   que encostam (jornada até 18:00 e horário extra 18:00–19:00, ou 22–24 de um dia e 00–02 do
   seguinte) formam um único trecho contínuo. Um atendimento pode atravessar a emenda e pertence à
   data local do seu início (D-12);
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
serviço (RN-14) é mantida. Ordem de checagem na remarcação: status (RN-19) → RN-18 → prazo (RN-15,
só cliente) → RN-11 → grade → RN-09 → RN-10 → expediente → conflito.

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
| `NAO_AUTENTICADO` | 401 | RN-23 (sem sessão, ou sessão inválida/expirada) |
| `ERRO_INTERNO` | 500 | erro inesperado (nunca regra de negócio) |

Corpo de erro: `{ "codigo": "...", "mensagem": "...", "detalhes"?: {...} }`.

## Matriz de rastreabilidade

Preenchida a partir da fase 1. Coluna "Testes": arquivo e nome do teste. Os arquivos ficam em
`apps/api/src/domain/`.

Além dos testes listados, a suíte do Validador independente (`domain/__validacao__/`) cobre de novo
RN-01..RN-20. São 93 testes de borda em `bordas.test.ts` e 6 propriedades em `oraculo.test.ts`, que
comparam o motor com um oráculo ingênuo minuto a minuto feito com Luxon `DateTime`, em 6 fusos com
datas de horário de verão.

| Regra | Unitário (domínio) | Propriedade (fast-check) | Integração / E2E |
| --- | --- | --- | --- |
| RN-01 | `intervalo.test.ts`: "terminar 10:00 e começar 10:00 não se sobrepõem", "intervalos vazios são inválidos", "unir…", "subtrair…", "agendamento até 10:00 não impede início às 10:00" | `intervalo.test.ts` P6; `propriedades.test.ts` P1 | — |
| RN-02 | `expediente.test.ts`: "horário inexistente … sem o empurrão do Luxon", "DST em NY (março)", "DST em NY (novembro)", "duração é em minutos reais", "Sao_Paulo não tem horário de verão", "calendário … viradas de mês e ano"; `disponibilidade.test.ts`: "preparo pode usar o expediente do dia anterior" | `propriedades.test.ts` P3, P4 (fusos SP/NY/Lisboa/Kolkata, dias de DST) | — |
| RN-03 | `expediente.test.ts`: "jornada padrão é válida…", "trechos sobrepostos, vazios, que atravessam a meia-noite…", "dia sem intervalos é dia sem expediente" | `propriedades.test.ts` P2 | — |
| RN-04 | `expediente.test.ts`: "folga no dia inteiro", "folga parcial", "feriado … vence horário extra", "folga vence horário extra", "horário extra soma ao expediente", "validação de exceções" | `propriedades.test.ts` P2 | — |
| RN-05 | `disponibilidade.test.ts`: "bloqueio deixa o horário indisponível (HORARIO_INDISPONIVEL…)", "bloqueio não muda o expediente" | `propriedades.test.ts` P1 | — |
| RN-06 | `disponibilidade.test.ts`: "preparo e limpeza ocupam a agenda", "cancelamento libera o horário na hora", "todos os status exceto CANCELADO ocupam agenda" | `propriedades.test.ts` P1 | `apps/api/test/integracao/ciclo.test.ts`: C6 "cancelar libera o horário e agendar de novo…"; `apps/api/test/integracao/garantia-banco.test.ts`: C3 "CANCELADO não ocupa" |
| RN-07 | `disponibilidade.test.ts`: "início fora da grade…", "grade alinhada à meia-noite local (D-06)", "grade no fuso local (Asia/Kolkata)", "atravessando o almoço", "preparo antes do início do expediente", "limpeza depois do fim" | `propriedades.test.ts` P2, P4, P5 | — |
| RN-08 | `disponibilidade.test.ts`: "serviço maior que o tempo restante do expediente", "serviço mais longo que o trecho inteiro" | `propriedades.test.ts` P2 | — |
| RN-09 | `disponibilidade.test.ts`: "exatamente no limite da antecedência", "um instante antes do limite", "horário no passado nunca é oferecido" | `propriedades.test.ts` P3 | — |
| RN-10 | `disponibilidade.test.ts`: "último dia do horizonte aberto e o dia seguinte fechado", "hoje é a data local", "virada de mês", "virada de ano", "horizonte zero" | `propriedades.test.ts` P3 | — |
| RN-11 | `alocacao.test.ts`: "só profissional ativo que executa o serviço", "qualquer profissional ignora quem não executa…"; `politicas.test.ts`: "ordem de checagem na criação" | — | — |
| RN-12 | `alocacao.test.ts`: "prefere quem tem menos agendamentos no dia", "empate por ordem de cadastro", "ordem não depende da entrada" | — | `apps/api/test/integracao/concorrencia.test.ts`: C2 "20 simultâneos em qualquer profissional → 3 ok e 17"; `apps/api/test/integracao/ciclo.test.ts`: "menos agendamentos no dia…", "23P01 no escolhido → tenta o próximo" |
| RN-13 | `disponibilidade.test.ts`: "até 5 próximos horários livres…", "respeita n e o limite de dias", "qualquer profissional une os próximos horários" | `propriedades.test.ts` P5 | `apps/api/test/integracao/ciclo.test.ts`: "recusa por HORARIO_INDISPONIVEL traz até 5 próximos"; `apps/api/test/integracao/concorrencia.test.ts`: C1 (próximos na recusa) |
| RN-14 | `disponibilidade.test.ts`: "serviço editado não altera o bloco"; `politicas.test.ts`: "remarcação usa a cópia do serviço" | — | — |
| RN-15 | `politicas.test.ts`: "cliente cancela até exatamente início − prazo", "depois do prazo só o estabelecimento", "só PENDENTE ou CONFIRMADO" | — | — |
| RN-16 | `politicas.test.ts`: "remarcar para o mesmo horário", "para horário sobreposto ao antigo", "conflito com outro", "mesmo prazo de RN-15", "regras de criação, exceto RN-17", "só agendamento ativo" | `propriedades.test.ts` P7 | `apps/api/test/integracao/concorrencia.test.ts`: C5 "remarcações concorrentes → só 1"; `apps/api/test/integracao/ciclo.test.ts`: "sobreposto ao próprio (UPDATE da mesma linha)", "recusada não muda nada" |
| RN-17 | `politicas.test.ts`: "cliente no limite não cria outro", "ativos = PENDENTE/CONFIRMADO com início futuro" | — | — |
| RN-18 | `politicas.test.ts`: "limiteFaltas faltas fica bloqueado (antes de RN-17)", "faltas anteriores ao desbloqueio deixam de contar" | — | — |
| RN-19 | `politicas.test.ts`: "nasce CONFIRMADO…", "transições (matriz completa)", "CONCLUIDO e NAO_COMPARECEU antes do início", "só o estabelecimento marca CONCLUIDO…" | — | `apps/api/test/integracao/ciclo.test.ts`: "PENDENTE → CONFIRMADO → CONCLUIDO, com histórico", "três NAO_COMPARECEU bloqueiam" |
| RN-20 | `disponibilidade.test.ts`: "sem antecedência mínima nem horizonte", "HORARIO_NO_PASSADO", "sujeito a expediente e conflitos"; `politicas.test.ts`: "ignora RN-09, RN-10, RN-17 e RN-18", "sujeito a passado, RN-11…" | `propriedades.test.ts` P3 (passado) | — |
| RN-21 | — | — | `apps/api/test/integracao/concorrencia.test.ts`: C1 "20 simultâneos → 1 sucesso e 19" (10 rodadas), C7 "bloqueio × agendamento"; `apps/api/test/integracao/garantia-banco.test.ts`: C3 "INSERT SQL cru sobreposto falha com 23P01" |
| RN-22 | — | — | `apps/api/test/integracao/idempotencia.test.ts`: C4 "mesma chave 10× em paralelo", "corpo diferente", "vale 24 h"; `apps/api/test/integracao/http-agendamentos.test.ts`: "Idempotency-Key pela API — replay idêntico e corpo diferente → 422" |
| RN-23 | `apps/api/src/application/autorizacao.test.ts`: "cliente vê, cancela e remarca o próprio…", "outro cliente → 404", "dono … outro estabelecimento → 404", "profissional … colega → 403", painel | — | `apps/api/test/integracao/http-autorizacao.test.ts`: matriz papel × rota (historico, confirmar, agenda, cadastros, bloqueios, jornada, exceções, balcão); `apps/api/test/integracao/http-auth.test.ts`: login, 401, logout, expiração, CSRF; `apps/api/test/integracao/http-agendamentos.test.ts`: "todo CodigoErro alcançável via HTTP…"; `apps/api/test/integracao/http-toctou.test.ts`: autorização na linha travada (cancelar, falta, remarcar) |
| RN-24 | — | — | `apps/api/test/integracao/http-agendamentos.test.ts`: "um e-mail de confirmação depois do commit; nenhum na recusa", "falha no envio não desfaz", "lembrete 24 h antes, uma vez; remarcar rearma; cancelado não recebe" |
