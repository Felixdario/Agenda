# domain

Regras de negócio como funções puras. Proibido importar Nest, Prisma ou ler o relógio
(`Date.now`, `new Date()`, `DateTime.now()`): o "agora" chega por parâmetro. Datas com Luxon.
Testes unitários e de propriedade (fast-check) ficam ao lado do código (`*.test.ts`).
