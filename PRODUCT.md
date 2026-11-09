# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Cliente final**: pessoa que quer marcar um horário num estabelecimento (barbearia, salão,
  clínica). Em geral está no celular, com pressa, entre outras coisas. O trabalho dela: escolher o
  serviço, achar um horário livre, garantir a vaga e, depois, remarcar ou cancelar sem ter que
  telefonar.
- **Dono do estabelecimento**: no desktop do balcão, no notebook ou no celular. Configura serviços,
  profissionais, jornadas e políticas. Acompanha a agenda do dia, encaixa clientes no balcão e trata
  faltas.
- **Profissional**: vê e organiza a própria agenda. Bloqueia horários, registra folgas e marca o
  atendimento como concluído ou como falta.
- **Avaliador do portfólio** (recrutador ou pessoa técnica): abre o demo com as contas prontas e quer
  ver, em minutos, que as regras de negócio são sérias. Se não houver conflito de horário, a
  disponibilidade estiver correta e os erros forem claros, ele percebe.

## Product Purpose

Agendamento online para negócios que vivem de horário marcado. O cliente reserva sozinho, a qualquer
hora, e o estabelecimento nunca tem dois atendimentos no mesmo horário. O sucesso é o cliente marcar
em poucos toques, sem surpresa, e o dono confiar na agenda sem precisar conferir nada à mão.

O projeto é o 2º de 4 de um portfólio. O destaque é a modelagem de regras de negócio (agenda,
conflitos, disponibilidade), e a interface tem que estar à altura dessa modelagem.

## Positioning

A agenda que não erra. A garantia de horário único está no banco de dados, com uma constraint de
exclusão no PostgreSQL. Ela foi provada sob concorrência: 20 pedidos simultâneos dão 1 reserva e 19
recusas claras. Quando um horário some, o produto já sugere os próximos horários livres. Tempo de
preparo e de limpeza, antecedência mínima, horizonte, prazo de cancelamento, limite de agendamentos
ativos e bloqueio por faltas são regras explícitas, e a interface as explica em vez de esconder.

## Operating Context

- **Fluxo do cliente:** página pública do estabelecimento (`/b/:slug`) → serviço → profissional ou
  "qualquer um" → dia → horário → confirmar. Depois, "meus agendamentos", com remarcar e cancelar.
- **Fluxo do estabelecimento:** painel com a agenda do dia por profissional, encaixe no balcão
  (RN-20), bloqueios, folgas e horários extras, cadastro de serviços e profissionais, jornadas,
  clientes bloqueados e políticas.
- **Fuso:** os horários são exibidos no fuso do estabelecimento (IANA), não no do navegador.
- **E-mails:** confirmação e lembrete 24 h antes (Mailpit em dev).
- **Demo:** "Navalha & Café" (`navalha-e-cafe`, America/Sao_Paulo), com 3 profissionais,
  6 serviços e duas semanas parcialmente ocupadas. As contas são `dono@agenda.dev`,
  `profissional@agenda.dev` e `cliente@agenda.dev`, todas com a senha `demo1234`.

## Capabilities and Constraints

- As regras RN-01..RN-24 estão em `docs/regras-de-negocio.md`, e os códigos de erro, com o status
  HTTP de cada um, em `packages/shared/src/erros.ts`. A interface mostra cada código com uma mensagem
  e uma ação possível (por exemplo, a 409 vem com os próximos horários).
- A API é real (NestJS, `/docs`). A sessão fica em cookie httpOnly, e mutações exigem
  `Content-Type: application/json`.
- **Stack do front:** Next.js App Router, TypeScript, TanStack Query e Tailwind 4. Bibliotecas
  escolhidas (D-09): base-ui, Sonner, motion, dnd kit, clsx e cva, Virtuoso se precisar, e
  react-hook-form com zod. A grade do calendário é própria.
- **Idiomas:** pt-BR (padrão) e inglês, desde o início. Toda string da interface passa por i18n. As
  mensagens dos códigos de erro também são traduzidas no front a partir do `codigo`.
- **Identidade neutra multi-segmento:** o produto serve barbearias, salões e clínicas. Cada
  estabelecimento aparece com o próprio nome e o próprio conteúdo, e o produto não assume o universo
  de barbearia.
- **Ainda não decidido:** se haverá logo e imagem do estabelecimento (o seed não tem fotos; sem
  foto, o estabelecimento aparece pelo nome e pelas iniciais, nunca com foto de banco de imagens).

## Brand Commitments

- **Nome do produto: Pontual.** Escolhido na fase 4 entre Pontual, Encaixe e Hora Marcada. Funciona
  em pt-BR e é entendido em inglês ("punctual"). O nome aparece no shell e no README; na página
  pública de um estabelecimento, quem aparece em primeiro plano é o estabelecimento, e o Pontual fica
  como assinatura discreta.
- **Direção visual: o padrão da categoria, executado com capricho.** O usuário escolheu essa direção
  de propósito, depois de duas rodadas de mundos alternativos (D-16). A régua de acabamento é o
  Booksy: o produto deve poder ficar ao lado dele sem perder. Convenção assumida por inteiro, sem
  ironia nem excentricidade contrabandeada; a distinção vem do acabamento e dos elementos que só este
  produto tem (o bloco ocupado com preparo e limpeza, a recusa com os próximos horários).
- **Voz:** direta, calma e precisa, sem jargão técnico para o cliente final. O erro diz o que
  aconteceu e o que fazer a seguir.

## Evidence on Hand

- Seed demo com dados realistas: `apps/api/src/infra/seed/demo.ts`.
- Provas técnicas que podem aparecer no README: os testes de concorrência e a matriz de
  rastreabilidade em `docs/regras-de-negocio.md`.
- Não existem fotos, depoimentos, clientes reais nem métricas de uso. Nada disso deve ser inventado.

## Product Principles

1. **A regra é visível.** Se algo não pode, a interface diz por quê (código → mensagem → próxima
   ação), nunca um "erro" genérico.
2. **O horário mostrado é o horário real.** Disponibilidade vem da API e sempre no fuso do
   estabelecimento; nada de disponibilidade "otimista" que depois falha sem explicação.
3. **Recusa com saída.** Toda recusa oferece um caminho: próximos horários, outro profissional,
   outro dia.
4. **Rápido no celular, denso no balcão.** O cliente faz poucas escolhas grandes; o painel mostra
   muita informação escaneável.
5. **Nada de mentira no demo.** Dados plausíveis e marcados como demo; nenhuma prova social
   inventada.

## Accessibility & Inclusion

WCAG 2.2 AA. A seleção de horário precisa funcionar só com teclado e com leitor de tela, e cada
horário tem um rótulo completo com dia, hora e profissional. O status de um agendamento nunca é
indicado só por cor. Respeita `prefers-reduced-motion`.
