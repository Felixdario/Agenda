# infra

Adaptadores: `prisma/` (persistência, fase 2), `http/` (controllers Nest), `email/` (SMTP/Mailpit),
`jobs/` (tarefas agendadas).

`prisma/`: schema em `apps/api/prisma/schema.prisma`; client gerado em `prisma/generated` (fora do
git, `db:generate`). A constraint de exclusão do RN-21 está numa migration SQL manual (D-13).
O único `Date.now()` do backend fica em `relogio.ts`.
