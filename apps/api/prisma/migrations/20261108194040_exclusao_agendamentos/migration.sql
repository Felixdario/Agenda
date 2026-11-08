-- Migration SQL manual (D-13): o Prisma não modela EXCLUDE nem CHECK.
-- RN-21: para o mesmo profissional, blocos [inicioBloco, fimBloco) de agendamentos não cancelados
-- não podem se sobrepor. Violação = SQLSTATE 23P01, traduzida para HORARIO_INDISPONIVEL.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Agendamento"
  ADD CONSTRAINT agendamento_sem_sobreposicao
  EXCLUDE USING gist (
    "profissionalId" WITH =,
    tstzrange("inicioBloco", "fimBloco", '[)') WITH &&
  ) WHERE (status <> 'CANCELADO');

-- D-02: o bloco contém o atendimento e não é vazio.
ALTER TABLE "Agendamento"
  ADD CONSTRAINT bloco_valido CHECK (
    "inicioBloco" < "fimBloco" AND "inicioBloco" <= "inicio" AND "inicio" < "fim" AND "fim" <= "fimBloco"
  );

-- Bloqueio não vazio (RN-01).
ALTER TABLE "Bloqueio" ADD CONSTRAINT bloqueio_valido CHECK ("inicio" < "fim");
