# Pontual: sistema visual

> **Versão 0.** Este documento foi escrito na fase 4, antes de existir interface. Ele é o contrato da
> construção da fase 5. Na fase 6, o `impeccable document` o reescreve a partir da interface
> construída, e o que estiver na interface prevalece.
>
> **Direção:** o padrão da categoria, escolhido de propósito e executado com capricho, com o Booksy
> como régua de acabamento. Consulte o `PRODUCT.md` e a decisão D-16.

## Princípio

O visitante tem que saber onde está tudo antes de notar o estilo. A convenção vale sem ironia.
O produto se distingue em três lugares, e só neles:

1. **O bloco ocupado.** Uma barra que mostra preparo, serviço e limpeza como uma coisa só, com início
   e fim do bloco. Aparece na confirmação, no detalhe do atendimento e no painel. É a regra D-02 se
   explicando sozinha.
2. **A recusa com saída.** Quando o horário é tomado (409), a tela não mostra "erro". Ela marca o
   horário perdido e oferece os próximos horários livres na mesma folha.
3. **Os números no lugar.** Toda hora, duração e valor usa algarismos tabulares, alinhados na coluna.
   No painel, a agenda é uma grade densa e escaneável.

## Cena

O cliente marca o horário pelo celular, com uma mão, na rua ou no ônibus. O dono e o profissional
usam a tela do balcão ou o notebook, de dia, com o salão iluminado. Por isso o tema padrão é
**claro**. O tema escuro acompanha `prefers-color-scheme` e é um tema completo, não só a inversão das
cores.

## Cor

A estratégia é **contida**: um fundo neutro, tinta quase preta e um único acento. O acento aparece no
horário escolhido, no foco e no dado principal. O botão primário é quase preto. Não há gradiente,
brilho, vidro, violeta nem índigo.

```css
:root {
  --ground: #f7f8fa; /* fundo da página */
  --surface: #ffffff; /* cartões, folhas, tabela */
  --raised: #f1f3f6; /* hover, linha selecionada sem acento */
  --border: #e6e8ec; /* borda de cartão */
  --rule: #f0f1f4; /* fio entre linhas */
  --control: #cfd4dc; /* borda de controle */
  --text: #111418;
  --muted: #5b6270; /* 6.1:1 no branco */
  --faint: #6b7280; /* placeholder; 4.8:1 */
  --primary: #15181d; /* botão primário, rótulo branco */
  --accent: #2453d6; /* cobalto: horário escolhido, foco, dado principal; 6.3:1 no branco */
  --accent-soft: #e9efff; /* fundo do horário escolhido */
  --positive: #1f7a4d;
  --positive-bg: #e3f6eb;
  --warning: #8a4b0a;
  --warning-bg: #fff6e0;
  --warning-line: #f3d48a;
  --negative: #b4232b;
  --negative-bg: #fdecec;
  --hatch: #dfe3ea; /* hachura de preparo/limpeza */
}
:root[data-theme='dark'] {
  --ground: #0e0f11;
  --surface: #16181b;
  --raised: #1f2226;
  --border: #26292e;
  --rule: #1d2024;
  --control: #3a3f46;
  --text: #f3f4f6;
  --muted: #b3b8c0;
  --faint: #959ba5;
  --primary: #f3f4f6; /* invertido: fundo claro, rótulo escuro */
  --accent: #7c9cff;
  --accent-soft: #1a2342;
  --positive: #4cc38a;
  --positive-bg: #12261b;
  --warning: #f0b45a;
  --warning-bg: #2a1f0f;
  --warning-line: #5c4318;
  --negative: #f07178;
  --negative-bg: #2c1618;
  --hatch: #2b2f35;
}
```

O status nunca é indicado só por cor. Cada status tem rótulo em texto e, nas listas, uma marca de
forma diferente: confirmado é um círculo cheio, pendente é um círculo vazado, cancelado é um texto
riscado, e concluído e falta têm rótulo próprio.

**Cores dos profissionais.** Cada profissional tem uma cor de série fixa, usada só em dados (a borda
da coluna na agenda e o ponto da legenda), nunca na casca. A paleta de série tem no máximo quatro
matizes: cobalto, `#c2410c`, `#0f766e` e `#a21caf`. Na casca, as cores vêm dos tokens acima.

## Tipo

- **Uma família: Hanken Grotesk**, carregada com `next/font`, em subset latin, nos pesos 400, 500,
  600 e 700. Os dígitos da Hanken já são de largura fixa por padrão (medido na fase 5: "1111" e
  "0000" têm a mesma largura), então o objetivo dos números alinhados está cumprido.
  `tabular-nums` continua declarado como garantia.
- **Escala:** 12 / 14 / 16 / 20 / 28.
  - 28 / 700: título de página. É o único 700 da tela.
  - 20 / 600: título de folha e de seção.
  - 16 / 400 e 16 / 600: corpo do fluxo do cliente e preço.
  - 14 / 400 e 14 / 500: células, navegação, corpo do painel.
  - 12 / 500: rótulo e meta. Nada fica abaixo de 12.
- Tudo em caixa de frase. Não há rótulo em caixa alta espaçada nem "eyebrow".
- Entrelinha de 20 px para texto de 14 e de 24 px para texto de 16. Tracking -0.01em só no 28.
- `tabular-nums` em todo número de hora, duração, valor e contagem.

## Forma e espaço

- **Raio suave**, escolhido uma vez: cartões e folhas com 16, campos com 12, e pílulas com 999 nos
  horários, chips e botões.
- **Borda ou sombra, nunca as duas.** Superfícies em repouso têm borda de 1 px. Sombra só no que
  flutua (menu, popover, sheet, diálogo): `0 8px 24px rgb(0 0 0 / .08)` no tema claro.
- **Base de espaçamento de 4 px.** Folga de 16 entre cartões, 20 de padding de cartão, 24 de gutter
  no desktop e 16 no celular. Controles com 40 px de altura no painel e 48 no fluxo do cliente,
  porque é toque.
- **Ícones:** um único conjunto, em contorno (Lucide), com 16 a 20 px, cinza. Nunca dentro de círculo
  colorido.

## Componentes

| Componente             | Base                        | Regra                                                                                                                                                                           |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão                  | `button` + cva              | primário quase preto, secundário com contorno, perigo com contorno vermelho isolado por espaço; só um primário por folha                                                        |
| Horário (slot)         | botão do tipo pílula        | fica numa grade de 3 a 4 colunas no celular; o escolhido usa `--accent-soft` com borda `--accent`; rótulo acessível completo: "sábado, 14 de novembro, 10:00, com Rafael Moura" |
| Serviço                | linha de lista              | nome, duração e preço alinhados à direita em tabular; não vira card com ícone                                                                                                   |
| Profissional           | linha com iniciais          | iniciais num disco neutro e o nome; opção "Qualquer profissional" no topo                                                                                                       |
| Seletor de dia         | faixa horizontal de 14 dias | dia sem horário aparece esmaecido e com o motivo ("folga", "lotado", "fora do horizonte")                                                                                       |
| Bloco ocupado          | barra segmentada            | trecho hachurado para preparo, cheio para o serviço e hachurado para limpeza; horas nas pontas                                                                                  |
| Recusa 409             | folha (sheet)               | horário perdido riscado e até 5 próximos horários como pílulas, clicáveis direto                                                                                                |
| Agenda do painel       | grade própria               | colunas por profissional, eixo de horas em tabular, bloqueios com borda tracejada, linha do "agora" no acento                                                                   |
| Status                 | pílula pálida               | tinta escura do mesmo matiz mais a marca de forma                                                                                                                               |
| Toast                  | Sonner                      | só para confirmação de ação; erro de regra nunca vai para toast, vai para a folha ou para o campo                                                                               |
| Diálogo, menu, popover | base-ui                     | foco preso e Esc fecha                                                                                                                                                          |

## Movimento

O movimento serve à orientação e nunca à decoração. Detalhes ficam para a fase 5 (`emil-design-eng`
e `animate`).

- **Entrada de folha:** 240 ms, `cubic-bezier(.2,.8,.2,1)`.
- **Troca de passo no fluxo:** 180 ms de deslocamento curto (8 px) com fade.
- **Horário tomado:** a pílula perdida é riscada e encolhe, e as próximas entram em sequência a cada
  30 ms.
- **Ações frequentes:** teclado, filtros e troca de dia no painel não animam.
- **`prefers-reduced-motion`:** tudo vira troca instantânea com fade de 120 ms no máximo.

## Estados obrigatórios

Toda tela precisa ter estes estados: carregando (skeleton com a forma real), vazio (uma frase e uma
ação), erro de rede (offline com a última versão em cache e "tentar de novo"), erro de regra (código →
mensagem → ação) e sucesso.

Casos extremos que a fase 6 testa com `break-ui`:

- um dia com 40 agendamentos;
- nome de serviço enorme;
- um dia sem horário livre;
- a aplicação offline.

## Idioma e formatação

- **Idiomas:** pt-BR (padrão) e en.
- **Datas e horas:** `Intl.DateTimeFormat` no fuso do estabelecimento, nunca no do navegador.
- **Dinheiro:** `Intl.NumberFormat`, em BRL.
- **Códigos de erro:** cada `CodigoErro` tem mensagem e ação no dicionário dos dois idiomas.
