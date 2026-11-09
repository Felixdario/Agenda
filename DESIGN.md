---
name: Pontual
description: Agendamento online sem conflito de horário, com a regra visível na tela.
colors:
  ground: '#f7f8fa'
  surface: '#ffffff'
  raised: '#f1f3f6'
  border: '#e6e8ec'
  rule: '#f0f1f4'
  control: '#cfd4dc'
  ink: '#111418'
  muted: '#5b6270'
  faint: '#6b7280'
  primary: '#15181d'
  on-primary: '#ffffff'
  accent: '#2453d6'
  accent-soft: '#e9efff'
  positive: '#1f7a4d'
  positive-bg: '#e3f6eb'
  warning: '#8a4b0a'
  warning-bg: '#fff6e0'
  warning-line: '#f3d48a'
  negative: '#b4232b'
  negative-bg: '#fdecec'
  hatch: '#e7eaf0'
  hatch-line: '#7f8898'
  serie-1: '#2453d6'
  serie-2: '#c2410c'
  serie-3: '#0f766e'
  serie-4: '#a21caf'
  dark-ground: '#0e0f11'
  dark-surface: '#16181b'
  dark-raised: '#1f2226'
  dark-border: '#26292e'
  dark-ink: '#f3f4f6'
  dark-muted: '#b3b8c0'
  dark-accent: '#7c9cff'
  dark-accent-soft: '#1a2342'
  dark-hatch: '#2b2f35'
  dark-hatch-line: '#7a8290'
typography:
  title:
    fontFamily: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '28px'
    fontWeight: 700
    lineHeight: '34px'
    letterSpacing: '-0.01em'
  headline:
    fontFamily: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '20px'
    fontWeight: 600
    lineHeight: '28px'
  body-lg:
    fontFamily: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: '24px'
  body:
    fontFamily: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: '20px'
  label:
    fontFamily: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: '16px'
    fontFeature: 'tnum'
rounded:
  pill: '999px'
  card: '16px'
  sheet: '20px'
  field: '12px'
  block: '10px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  card: '20px'
  gutter: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.pill}'
    height: '48px'
    padding: '0 24px'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    height: '40px'
    padding: '0 16px'
  button-danger:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.negative}'
    rounded: '{rounded.pill}'
    height: '40px'
  slot-pill:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    height: '48px'
  slot-pill-selected:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent}'
    rounded: '{rounded.pill}'
    height: '48px'
  day-chip:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    size: '76px'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
    padding: '20px'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    height: '40px'
  status-confirmed:
    backgroundColor: '{colors.positive-bg}'
    textColor: '{colors.positive}'
    rounded: '{rounded.pill}'
    height: '24px'
  status-pending:
    backgroundColor: '{colors.warning-bg}'
    textColor: '{colors.warning}'
    rounded: '{rounded.pill}'
    height: '24px'
  agenda-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.block}'
---

# Design System: Pontual

> **Direção:** o padrão da categoria, escolhido de propósito e executado com capricho, com o Booksy
> como régua de acabamento (D-16). Este documento foi reescrito na fase 6 a partir da interface
> construída (`apps/web`), com `impeccable document` em modo refresh. Onde ele e o código divergirem,
> vale o código, e este arquivo deve ser atualizado. Os tokens do front-matter são os de
> `apps/web/src/app/globals.css`; o sidecar `apps/web/.impeccable/design.json` traz movimento,
> sombras e os componentes em HTML/CSS.

## Overview

**Creative North Star: "O balcão bem organizado"**

O Pontual parece com o que o cliente já conhece de agendamento online, e de propósito. A página de
um estabelecimento é uma lista de serviços com preço; escolher um abre uma folha com profissional,
dia, horário e revisão. O painel é uma ferramenta de agenda: barra lateral clara, colunas por
profissional e um detalhe à direita. Quem chega sabe onde está tudo antes de notar o estilo.

A distinção mora em três lugares, e só neles: o **bloco ocupado** (preparo, atendimento e limpeza
como uma barra só, com as horas nas pontas), a **recusa com saída** (o horário perdido riscado e os
próximos livres na mesma folha) e os **números no lugar** (toda hora, duração e valor alinhados em
algarismos de largura fixa). O resto é contido: fundo neutro, tinta quase preta e um único acento
cobalto.

A densidade muda com a cena. O cliente, no celular e com uma mão, faz poucas escolhas grandes
(alvos de 48 px). O dono, no balcão, lê uma grade densa (alvos de 24 px ou mais, cartão de 15 min
com 24,4 px de altura).

**Key Characteristics:**

- Claro por padrão; o escuro acompanha o sistema e é um tema completo, com os mesmos papéis.
- Um acento só, cobalto, para o horário escolhido, o foco e o dado principal (o atendimento no
  bloco ocupado, a linha do agora).
- Superfícies com borda de 1 px em repouso; sombra só no que flutua.
- Pílulas para horários, chips, botões e status; cartões e folhas com cantos suaves.
- Status sempre com texto e com uma marca de forma, nunca só com cor.
- Toda data e hora no fuso do estabelecimento, em pt-BR ou inglês.

## Colors

Neutros frios, tinta quase preta e um cobalto que aparece pouco, por isso se lê.

### Primary

- **Cobalto de agenda** (accent): o horário escolhido (fundo `accent-soft` com borda e texto
  cobalto), o anel de foco, o trecho de atendimento no bloco ocupado, a linha e o selo do "agora" no
  painel e os links de texto. No escuro vira um cobalto claro (dark-accent) com texto escuro por
  cima.
- **Tinta de balcão** (primary): o botão primário, quase preto com rótulo branco. No escuro, é
  invertido (fundo claro, rótulo escuro). Um primário por folha ou por tela.

### Neutral

- **Fundo de sala** (ground): o fundo da página, a barra lateral do painel e as horas fora do
  expediente na grade.
- **Papel** (surface): cartões, folhas, diálogos, tabelas e o expediente na grade.
- **Elevado** (raised): hover, item ativo da navegação, skeleton e o disco das iniciais.
- **Borda** (border) e **fio** (rule): borda de cartão e divisória entre linhas.
- **Controle** (control): borda de campo e de botão secundário, um passo mais forte.
- **Tinta**, **suave** e **apagada** (ink, muted, faint): texto principal, secundário (6,1:1) e
  placeholder ou dia sem vaga (4,5:1 ou mais).

### Semânticas

- **Positivo** (positive / positive-bg): status confirmado e situação "ativo".
- **Aviso** (warning / warning-bg / warning-line): status pendente, chips de exceção (folga,
  horário extra, feriado) e o aviso de sem conexão.
- **Negativo** (negative / negative-bg): falta, cliente bloqueado, botão de perigo e o bloco de erro
  de regra.

### Hachura e séries

- **Hachura** (hatch / hatch-line): preparo e limpeza. As linhas têm 3,5:1 contra a superfície no
  claro e 4,6:1 no escuro, porque carregam significado.
- **Séries** (serie-1 a serie-4): uma cor fixa por profissional, só em dados: o filete no topo da
  coluna da agenda e o ponto da legenda. Todas passam de 4,8:1 contra o fundo nos dois temas.

### Named Rules

**The One Voice Rule.** O cobalto é o único acento. Ele marca o que o usuário escolheu, onde está o
foco e o dado principal; nunca a casca, nunca um botão inteiro.

**The Never-Only-Color Rule.** Status tem rótulo e forma: confirmado é um círculo cheio, pendente é
um círculo vazado, cancelado é texto riscado, concluído e falta têm rótulo próprio.

## Typography

**Display Font:** Hanken Grotesk (com ui-sans-serif e system-ui)
**Body Font:** Hanken Grotesk

**Character:** uma grotesca só, de desenho calmo, cujos dígitos já têm largura fixa: as horas e os
preços se alinham em coluna sem fonte mono.

### Hierarchy

- **Title** (700, 28 px, 34 px): título da página. É o único 700 da tela.
- **Headline** (600, 20 px, 28 px): título de folha, de diálogo e o nome no detalhe do atendimento.
- **Body large** (400 e 600, 16 px, 24 px): o fluxo do cliente, os nomes de serviço e os preços.
- **Body** (400 e 500, 14 px, 20 px): o painel, as células, a navegação e as descrições.
- **Label** (500, 12 px, 16 px): rótulos, meta, hora dentro do cartão da agenda e pílulas de status.
  Nada fica abaixo de 12 px.

### Named Rules

**The Sentence Case Rule.** Tudo em caixa de frase. Não há rótulo em caixa alta espaçada nem
"eyebrow" acima de título.

**The Tabular Rule.** Toda hora, duração, valor e contagem leva `.num` (`tabular-nums`) e, em
tabela, alinha à direita.

## Layout

- **Cliente:** coluna única de até 720 px, centrada, com 16 px de margem. A folha do fluxo sobe de
  baixo no celular (até 92% da altura) e entra pela direita no desktop (480 px de largura).
- **Painel:** barra lateral de 232 px na cor do fundo, com o produto, o estabelecimento, a navegação,
  o idioma e a pessoa. Abaixo de 1024 px vira um topo de 56 px com o menu numa folha. Conteúdo com
  24 px de margem no desktop e 16 px no celular.
- **Agenda:** grade própria com eixo de horas de 56 px e uma coluna por profissional (no mínimo
  176 px), 1,76 px por minuto. A grade rola dentro da própria moldura, com o cabeçalho e o eixo
  fixos. A partir de 1280 px, o detalhe do atendimento fica numa coluna de 360 px à direita; abaixo
  disso, numa folha.
- **Ritmo:** base de 4 px. Folga de 16 px entre cartões, 20 px de padding de cartão, 24 px entre
  seções.

## Elevation & Depth

Plano em repouso: cartões, tabelas e campos têm borda de 1 px e nenhuma sombra. A sombra existe só
no que flutua sobre a página.

### Shadow Vocabulary

- **Flutuante** (`box-shadow: 0 8px 24px rgb(0 0 0 / 0.08)`; no escuro, alfa 0.45): folha, diálogo,
  menu, seletor e toast.

### Named Rules

**The Border-Or-Shadow Rule.** Uma superfície tem borda ou sombra, nunca as duas.

## Shapes

- **Pílula** (999 px): botões, horários, chips de exceção e pílulas de status.
- **Cartão** (16 px): cartões, tabelas, faixa de dias e diálogos no desktop.
- **Folha** (20 px): cantos de cima da folha no celular e da esquerda no desktop.
- **Campo** (12 px): campos de texto, seleções e menus.
- **Bloco** (10 px): cartões de atendimento e bloqueios dentro da grade.
- Bloqueio é tracejado; atendimento tem borda sólida; o bloco ocupado tem os trechos de preparo e
  limpeza hachurados a 135°.

## Components

### Buttons

- **Shape:** pílula (999 px), com retorno de toque (escala 0,97 por 140 ms).
- **Primary:** tinta de balcão com rótulo branco, 48 px no fluxo do cliente e 40 px no painel.
- **Secondary:** papel com borda de controle; a borda escurece no hover.
- **Danger:** papel com contorno e texto negativos, isolado no fim do bloco.
- **Ação que grava:** fica desabilitada sem rede, com o motivo como dica.

### Horários e dias (assinatura do fluxo)

- **Pílula de horário:** 48 px, em grade de 3 colunas (4 a partir de 400 px), agrupada em manhã,
  tarde e noite. A escolhida tem fundo `accent-soft` e borda cobalto. Funciona só com teclado (um
  ponto de tabulação e setas) e o nome acessível começa pelo texto visível e completa com dia e
  profissional.
- **Faixa de dias:** 14 chips de 76 px; dia sem vaga fica no fundo, apagado, com "Sem horários". O
  dia escolhido sempre fica à vista.

### Bloco ocupado (assinatura)

Barra de 32 px em pílula: preparo hachurado, atendimento cheio em cobalto com o intervalo escrito,
limpeza hachurada. As horas do início e do fim do bloco ficam nas pontas, e a legenda lista só os
trechos que existem. Aparece na revisão, no detalhe do atendimento e, na grade, como faixas
hachuradas em cima e embaixo do cartão.

### Recusa 409 (assinatura)

Na mesma folha: título que diz o que aconteceu, o horário perdido riscado em borda tracejada (só
encolhe, continua legível) e até 5 pílulas cobalto dos próximos horários, que confirmam direto. Se a
pílula é de outro dia, a data curta vai em cima da hora.

### Cards / Containers

- **Corner Style:** 16 px.
- **Background:** papel sobre o fundo.
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).
- **Border:** 1 px de borda; divisórias internas no fio.
- **Internal Padding:** 20 px (16 px em listas no celular).

### Inputs / Fields

- **Style:** papel, borda de controle, 12 px de raio, 40 px de altura (48 px nos formulários do
  cliente). Rótulo acima, dica ou erro abaixo.
- **Focus:** borda e anel de 2 px cobalto.
- **Error:** borda negativa e mensagem em negativo com a saída.

### Status

Pílula pálida de 24 px: tinta do matiz sobre o fundo do mesmo matiz, com a marca de forma e o
rótulo. Cancelado é riscado.

### Navigation

Barra lateral na cor do fundo, itens de 40 px com ícone de contorno de 16 px. O ativo é uma pílula
cinza (raised) com o texto em tinta; os outros ficam em suave. O profissional vê só Agenda, Encaixe
e Minha jornada.

### Agenda do painel (assinatura)

Colunas por profissional com um filete de 2 px da cor de série no topo, o nome e o resumo do dia, e
os chips de exceção removíveis. O expediente é papel; fora dele, fundo. O cartão de atendimento
mostra hora e cliente (e serviço e status quando cabem), com o bloco hachurado; o selecionado ganha
borda cobalto. O bloqueio é tracejado. A linha do agora é cobalto, com a hora num selo no eixo.

### Aviso de sem conexão

Faixa de aviso fixa no topo, em warning-bg, que diz que a tela pode estar desatualizada e que as
ações que gravam ficam bloqueadas até a rede voltar.

## Do's and Don'ts

### Do:

- **Do** usar o cobalto só no escolhido, no foco e no dado principal (One Voice Rule).
- **Do** mostrar status com texto e forma (Never-Only-Color Rule).
- **Do** formatar data e hora com o fuso do estabelecimento, nunca o do navegador.
- **Do** levar toda recusa de regra para o lugar onde ela aconteceu, como mensagem e ação; toast só
  confirma uma ação que deu certo.
- **Do** manter 48 px de alvo no fluxo do cliente e pelo menos 24 px no painel.
- **Do** deixar o dado de usuário quebrar (`overflow-wrap`) em vez de vazar, e truncar só o que tem o
  valor completo à vista em outro lugar (rótulo, dica, detalhe).

### Don't:

- **Don't** usar violeta, índigo, gradiente decorativo, vidro, brilho ou ícone dentro de círculo
  colorido. A hachura do bloco ocupado é a única textura, e ela carrega significado.
- **Don't** usar sombra em superfície em repouso, nem borda e sombra juntas.
- **Don't** colocar rótulo em caixa alta espaçada ou "eyebrow" acima de título.
- **Don't** pôr texto na interface fora dos dicionários (`apps/web/messages`).
- **Don't** animar troca de dia, filtro ou ação de teclado; movimento só na folha, no passo do
  fluxo, na recusa e no retorno de toque.
