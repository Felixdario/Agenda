-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('DONO', 'PROFISSIONAL', 'CLIENTE');

-- CreateEnum
CREATE TYPE "StatusAgendamento" AS ENUM ('PENDENTE', 'CONFIRMADO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU');

-- CreateEnum
CREATE TYPE "TipoExcecao" AS ENUM ('FERIADO', 'FOLGA', 'HORARIO_EXTRA');

-- CreateEnum
CREATE TYPE "TipoHistorico" AS ENUM ('STATUS', 'REMARCACAO');

-- CreateEnum
CREATE TYPE "StatusChaveIdempotencia" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "Estabelecimento" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fuso" TEXT NOT NULL,
    "granularidadeMin" INTEGER NOT NULL DEFAULT 15,
    "antecedenciaMinimaMin" INTEGER NOT NULL DEFAULT 120,
    "horizonteDias" INTEGER NOT NULL DEFAULT 60,
    "prazoCancelamentoHoras" INTEGER NOT NULL DEFAULT 4,
    "limiteAgendamentosAtivos" INTEGER NOT NULL DEFAULT 3,
    "limiteFaltas" INTEGER NOT NULL DEFAULT 3,
    "confirmacaoAutomatica" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estabelecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "estabelecimentoId" UUID,
    "profissionalId" UUID,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profissional" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profissional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servico" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "precoCentavos" INTEGER NOT NULL,
    "preparoMin" INTEGER NOT NULL DEFAULT 0,
    "limpezaMin" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfissionalServico" (
    "profissionalId" UUID NOT NULL,
    "servicoId" UUID NOT NULL,

    CONSTRAINT "ProfissionalServico_pkey" PRIMARY KEY ("profissionalId","servicoId")
);

-- CreateTable
CREATE TABLE "JornadaIntervalo" (
    "id" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,

    CONSTRAINT "JornadaIntervalo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Excecao" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "profissionalId" UUID,
    "tipo" "TipoExcecao" NOT NULL,
    "data" DATE NOT NULL,
    "inicio" TEXT,
    "fim" TEXT,

    CONSTRAINT "Excecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bloqueio" (
    "id" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "desbloqueadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agendamento" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "servicoId" UUID NOT NULL,
    "servicoNome" TEXT NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "precoCentavos" INTEGER NOT NULL,
    "preparoMin" INTEGER NOT NULL,
    "limpezaMin" INTEGER NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "inicioBloco" TIMESTAMPTZ(3) NOT NULL,
    "fimBloco" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusAgendamento" NOT NULL,
    "lembreteEnviadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoStatus" (
    "id" UUID NOT NULL,
    "agendamentoId" UUID NOT NULL,
    "tipo" "TipoHistorico" NOT NULL,
    "de" "StatusAgendamento",
    "para" "StatusAgendamento" NOT NULL,
    "autorUsuarioId" UUID NOT NULL,
    "em" TIMESTAMPTZ(3) NOT NULL,
    "motivo" TEXT,
    "inicioAnterior" TIMESTAMPTZ(3),
    "inicioNovo" TIMESTAMPTZ(3),
    "profissionalAnteriorId" UUID,
    "profissionalNovoId" UUID,

    CONSTRAINT "HistoricoStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChaveIdempotencia" (
    "usuarioId" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "hashCorpo" TEXT NOT NULL,
    "status" "StatusChaveIdempotencia" NOT NULL,
    "respostaJson" JSONB,
    "agendamentoId" UUID,
    "criadaEm" TIMESTAMPTZ(3) NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChaveIdempotencia_pkey" PRIMARY KEY ("usuarioId","chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Estabelecimento_slug_key" ON "Estabelecimento"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_profissionalId_key" ON "Usuario"("profissionalId");

-- CreateIndex
CREATE INDEX "Profissional_estabelecimentoId_idx" ON "Profissional"("estabelecimentoId");

-- CreateIndex
CREATE INDEX "Servico_estabelecimentoId_idx" ON "Servico"("estabelecimentoId");

-- CreateIndex
CREATE INDEX "ProfissionalServico_servicoId_idx" ON "ProfissionalServico"("servicoId");

-- CreateIndex
CREATE INDEX "JornadaIntervalo_profissionalId_idx" ON "JornadaIntervalo"("profissionalId");

-- CreateIndex
CREATE INDEX "Excecao_estabelecimentoId_data_idx" ON "Excecao"("estabelecimentoId", "data");

-- CreateIndex
CREATE INDEX "Excecao_profissionalId_data_idx" ON "Excecao"("profissionalId", "data");

-- CreateIndex
CREATE INDEX "Bloqueio_profissionalId_inicio_idx" ON "Bloqueio"("profissionalId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_usuarioId_estabelecimentoId_key" ON "Cliente"("usuarioId", "estabelecimentoId");

-- CreateIndex
CREATE INDEX "Agendamento_profissionalId_inicioBloco_idx" ON "Agendamento"("profissionalId", "inicioBloco");

-- CreateIndex
CREATE INDEX "Agendamento_clienteId_status_idx" ON "Agendamento"("clienteId", "status");

-- CreateIndex
CREATE INDEX "HistoricoStatus_agendamentoId_em_idx" ON "HistoricoStatus"("agendamentoId", "em");

-- CreateIndex
CREATE INDEX "ChaveIdempotencia_expiraEm_idx" ON "ChaveIdempotencia"("expiraEm");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profissional" ADD CONSTRAINT "Profissional_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servico" ADD CONSTRAINT "Servico_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfissionalServico" ADD CONSTRAINT "ProfissionalServico_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfissionalServico" ADD CONSTRAINT "ProfissionalServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JornadaIntervalo" ADD CONSTRAINT "JornadaIntervalo_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Excecao" ADD CONSTRAINT "Excecao_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Excecao" ADD CONSTRAINT "Excecao_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_autorUsuarioId_fkey" FOREIGN KEY ("autorUsuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChaveIdempotencia" ADD CONSTRAINT "ChaveIdempotencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChaveIdempotencia" ADD CONSTRAINT "ChaveIdempotencia_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
