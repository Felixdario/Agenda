import { Papel } from '@agenda/shared';
import { DateTime } from 'luxon';
import { agendar } from '../../application/agendar';
import type { Relogio } from '../../application/portas';
import { criarDependencias } from '../composicao';
import type { PrismaClient } from '../prisma';
import { CONTAS_DEMO, SLUG_DEMO } from './demo';

/**
 * Pior caso no banco (fase 6, break-ui): um dia futuro do estabelecimento demo com a agenda
 * lotada. Cada profissional ganha um horário extra no almoço e a grade inteira é preenchida com
 * atendimentos de 15 min: Rafael tem 40 (09:00–19:00), Bruna 40 (10:00–20:00) e Caio 38
 * (08:00–17:30). Os clientes têm os nomes e e-mails mais difíceis do CATALOG do break-ui.
 *
 * Idempotente: mexe só nesse dia (apaga e refaz os atendimentos, horários extras e bloqueios dele).
 * Os atendimentos passam pelo caso de uso `agendar`, com a constraint e as travas de sempre.
 */

const FUSO = 'America/Sao_Paulo';
const DOMINIO = 'pior-caso.example.com';

/** Nomes reais de gente difícil de exibir (break-ui CATALOG.md), um e-mail para cada. */
export const CLIENTES_PIOR_CASO = [
  { nome: 'Aleksandra Wiśniewska-Kowalczyk', local: 'aleksandra.wisniewska-kowalczyk' },
  { nome: 'Christopher Alexander Montgomery III', local: 'christopher.alexander.montgomery.iii' },
  { nome: 'Jo', local: 'jo' },
  { nome: 'J', local: 'j' },
  { nome: 'Đặng Thị Ngọc Hân', local: 'dang.thi.ngoc.han' },
  { nome: '🦊 Fox', local: 'fox' },
  { nome: '王秀英', local: 'wang.xiuying' },
  { nome: 'María José de la Cruz y Fernández', local: 'maria.jose.de.la.cruz.y.fernandez' },
  { nome: "Seán O'Brien-Ó Súilleabháin", local: 'sean.obrien' },
  { nome: 'dana', local: 'dana' },
  {
    nome: 'Bartholomew Fitzgerald',
    local: 'bartholomew.fitzgerald.northwind-industries-holdings',
  },
] as const;

/** Almoço de cada profissional do seed demo, numa quarta-feira (vira horário extra). */
const ALMOCO: Record<string, { inicio: string; fim: string }> = {
  'Rafael Moura': { inicio: '12:00', fim: '13:00' },
  'Bruna Teles': { inicio: '14:00', fim: '15:00' },
  'Caio Prado': { inicio: '12:00', fim: '13:30' },
};

/** A primeira quarta-feira depois de 15 dias (fora das duas semanas do seed demo). */
export function diaDoPiorCaso(agora: number): DateTime {
  const base = DateTime.fromMillis(agora, { zone: FUSO }).startOf('day').plus({ days: 15 });
  return base.plus({ days: (3 - base.weekday + 7) % 7 });
}

export interface ResumoPiorCaso {
  data: string;
  porProfissional: Record<string, number>;
}

export async function semearPiorCaso(
  prisma: PrismaClient,
  opcoes: { readonly agora: number; readonly log?: (m: string) => void },
): Promise<ResumoPiorCaso> {
  const log = opcoes.log ?? (() => undefined);
  const estab = await prisma.estabelecimento.findUnique({ where: { slug: SLUG_DEMO } });
  if (estab === null) throw new Error('Rode `db:seed` antes: o estabelecimento demo não existe.');
  const dono = await prisma.usuario.findUniqueOrThrow({ where: { email: CONTAS_DEMO.dono } });
  const profissionais = await prisma.profissional.findMany({
    where: { estabelecimentoId: estab.id },
    orderBy: { criadoEm: 'asc' },
  });
  const pezinho = await prisma.servico.findFirstOrThrow({
    where: { estabelecimentoId: estab.id, nome: 'Pezinho' },
  });

  const dia = diaDoPiorCaso(opcoes.agora);
  const data = dia.toISODate()!;
  const inicioDia = dia.toJSDate();
  const fimDia = dia.plus({ days: 1 }).toJSDate();
  const colunaData = new Date(`${data}T00:00:00.000Z`);

  // ── limpar só este dia
  await prisma.$transaction(async (tx) => {
    const doDia = { estabelecimentoId: estab.id, inicio: { gte: inicioDia, lt: fimDia } };
    await tx.chaveIdempotencia.deleteMany({ where: { agendamento: doDia } });
    await tx.historicoStatus.deleteMany({ where: { agendamento: doDia } });
    await tx.agendamento.deleteMany({ where: doDia });
    await tx.bloqueio.deleteMany({
      where: {
        profissional: { estabelecimentoId: estab.id },
        inicio: { gte: inicioDia, lt: fimDia },
      },
    });
    await tx.excecao.deleteMany({
      where: { estabelecimentoId: estab.id, data: colunaData, tipo: 'HORARIO_EXTRA' },
    });
  });

  // ── o almoço vira horário extra: o expediente fica contínuo
  await prisma.excecao.createMany({
    data: profissionais.flatMap((p) => {
      const almoco = ALMOCO[p.nome];
      return almoco === undefined
        ? []
        : [
            {
              estabelecimentoId: estab.id,
              profissionalId: p.id,
              tipo: 'HORARIO_EXTRA' as const,
              data: colunaData,
              inicio: almoco.inicio,
              fim: almoco.fim,
            },
          ];
    }),
  });

  // ── clientes difíceis (sem senha, como no balcão)
  const clientes = [];
  for (const c of CLIENTES_PIOR_CASO) {
    const email = `${c.local}@${DOMINIO}`;
    clientes.push(
      await prisma.usuario.upsert({
        where: { email },
        create: { email, nome: c.nome, papel: Papel.CLIENTE, senhaHash: null },
        update: { nome: c.nome },
      }),
    );
  }

  // ── lotar a grade, pelo caso de uso (balcão: RN-20)
  const relogio: Relogio = { agora: () => opcoes.agora };
  const deps = criarDependencias(prisma, { relogio });
  const porProfissional: Record<string, number> = {};
  let k = 0;
  for (const p of profissionais) {
    let feitos = 0;
    for (let t = dia.toMillis(); t < dia.plus({ days: 1 }).toMillis(); t += 15 * 60_000) {
      const resultado = await agendar(deps, {
        estabelecimentoId: estab.id,
        servicoId: pezinho.id,
        profissionalId: p.id,
        clienteUsuarioId: clientes[k % clientes.length]!.id,
        inicio: t,
        ator: { usuarioId: dono.id, papel: Papel.DONO },
      });
      if (resultado.ok) {
        feitos += 1;
        k += 1;
      }
    }
    porProfissional[p.nome] = feitos;
  }
  log(
    `Pior caso em ${data}: ${Object.entries(porProfissional)
      .map(([n, q]) => `${n} ${q}`)
      .join(', ')} atendimentos de 15 min.`,
  );
  return { data, porProfissional };
}
