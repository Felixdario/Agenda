import { Papel } from '@agenda/shared';
import { DateTime } from 'luxon';
import { agendar } from '../../application/agendar';
import { criarBloqueio } from '../../application/criar-bloqueio';
import { listarHorarios } from '../../application/listar-horarios';
import { cancelar, concluir, marcarNaoComparecimento } from '../../application/mudar-status';
import type { Relogio } from '../../application/portas';
import type { DependenciasApp, Hasher } from '../../application/portas-app';
import { criarDependencias } from '../composicao';
import type { PrismaClient } from '../prisma';

export const SLUG_DEMO = 'navalha-e-cafe';
export const SENHA_DEMO = 'demo1234';
export const CONTAS_DEMO = {
  dono: 'dono@agenda.dev',
  profissional: 'profissional@agenda.dev',
  cliente: 'cliente@agenda.dev',
} as const;
const FUSO = 'America/Sao_Paulo';
const DOMINIO_CLIENTES = 'clientes.navalha.dev';

/** PRNG determinístico (mulberry32): o seed gera sempre a mesma agenda para o mesmo "hoje". */
function aleatorio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const SERVICOS = [
  { nome: 'Corte masculino', duracaoMin: 30, precoCentavos: 5000, preparoMin: 0, limpezaMin: 5 },
  { nome: 'Barba completa', duracaoMin: 30, precoCentavos: 4000, preparoMin: 5, limpezaMin: 5 },
  { nome: 'Corte + barba', duracaoMin: 60, precoCentavos: 8000, preparoMin: 5, limpezaMin: 10 },
  { nome: 'Pezinho', duracaoMin: 15, precoCentavos: 2000, preparoMin: 0, limpezaMin: 0 },
  { nome: 'Coloração', duracaoMin: 90, precoCentavos: 15000, preparoMin: 15, limpezaMin: 15 },
  { nome: 'Hidratação', duracaoMin: 45, precoCentavos: 6000, preparoMin: 0, limpezaMin: 10 },
];

/** Jornadas diferentes, com almoço. Dia ISO → trechos. */
const JORNADAS: Record<number, { inicio: string; fim: string }[]>[] = [
  // Rafael: seg–sex 09–12 / 13–19, sáb 09–14
  {
    1: [
      { inicio: '09:00', fim: '12:00' },
      { inicio: '13:00', fim: '19:00' },
    ],
    2: [
      { inicio: '09:00', fim: '12:00' },
      { inicio: '13:00', fim: '19:00' },
    ],
    3: [
      { inicio: '09:00', fim: '12:00' },
      { inicio: '13:00', fim: '19:00' },
    ],
    4: [
      { inicio: '09:00', fim: '12:00' },
      { inicio: '13:00', fim: '19:00' },
    ],
    5: [
      { inicio: '09:00', fim: '12:00' },
      { inicio: '13:00', fim: '19:00' },
    ],
    6: [{ inicio: '09:00', fim: '14:00' }],
  },
  // Bruna: ter–sáb 10–14 / 15–20
  {
    2: [
      { inicio: '10:00', fim: '14:00' },
      { inicio: '15:00', fim: '20:00' },
    ],
    3: [
      { inicio: '10:00', fim: '14:00' },
      { inicio: '15:00', fim: '20:00' },
    ],
    4: [
      { inicio: '10:00', fim: '14:00' },
      { inicio: '15:00', fim: '20:00' },
    ],
    5: [
      { inicio: '10:00', fim: '14:00' },
      { inicio: '15:00', fim: '20:00' },
    ],
    6: [
      { inicio: '10:00', fim: '14:00' },
      { inicio: '15:00', fim: '18:00' },
    ],
  },
  // Caio: seg, qua, sex 08–12 / 13:30–17:30
  {
    1: [
      { inicio: '08:00', fim: '12:00' },
      { inicio: '13:30', fim: '17:30' },
    ],
    3: [
      { inicio: '08:00', fim: '12:00' },
      { inicio: '13:30', fim: '17:30' },
    ],
    5: [
      { inicio: '08:00', fim: '12:00' },
      { inicio: '13:30', fim: '17:30' },
    ],
  },
];
const PROFISSIONAIS = [
  { nome: 'Rafael Moura', servicos: [0, 1, 2, 3] },
  { nome: 'Bruna Teles', servicos: [0, 3, 4, 5] },
  { nome: 'Caio Prado', servicos: [0, 1, 2, 3, 5] },
];
const NOMES_CLIENTES = [
  'Ana Lima',
  'Bruno Alves',
  'Carla Dias',
  'Diego Ramos',
  'Elisa Costa',
  'Felipe Rocha',
  'Gabi Nunes',
  'Hugo Pires',
  'Isis Melo',
  'João Teixeira',
  'Karina Souza',
  'Lucas Freitas',
  'Marina Gomes',
  'Nelson Reis',
];

export interface ResumoSeed {
  estabelecimentoId: string;
  agendamentosFuturos: number;
  historico: number;
  bloqueios: number;
}

/** Apaga só os dados do estabelecimento demo (as contas são reaproveitadas com upsert). */
async function limparEstabelecimentoDemo(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const e = await tx.estabelecimento.findUnique({
      where: { slug: SLUG_DEMO },
      select: { id: true },
    });
    if (e === null) return;
    const doEstab = { estabelecimentoId: e.id };
    await tx.usuario.updateMany({
      where: doEstab,
      data: { estabelecimentoId: null, profissionalId: null },
    });
    await tx.chaveIdempotencia.deleteMany({ where: { agendamento: doEstab } });
    await tx.historicoStatus.deleteMany({ where: { agendamento: doEstab } });
    await tx.agendamento.deleteMany({ where: doEstab });
    await tx.bloqueio.deleteMany({ where: { profissional: doEstab } });
    await tx.excecao.deleteMany({ where: doEstab });
    await tx.jornadaIntervalo.deleteMany({ where: { profissional: doEstab } });
    await tx.profissionalServico.deleteMany({ where: { profissional: doEstab } });
    await tx.cliente.deleteMany({ where: doEstab });
    await tx.servico.deleteMany({ where: doEstab });
    await tx.profissional.deleteMany({ where: doEstab });
    await tx.estabelecimento.delete({ where: { id: e.id } });
  });
}

async function upsertUsuario(
  prisma: PrismaClient,
  dados: {
    email: string;
    nome: string;
    papel: Papel;
    senhaHash: string;
    estabelecimentoId?: string;
    profissionalId?: string;
  },
) {
  const campos = {
    nome: dados.nome,
    papel: dados.papel,
    senhaHash: dados.senhaHash,
    estabelecimentoId: dados.estabelecimentoId ?? null,
    profissionalId: dados.profissionalId ?? null,
  };
  return prisma.usuario.upsert({
    where: { email: dados.email },
    create: { email: dados.email, ...campos },
    update: campos,
  });
}

/**
 * Seed demo ("Navalha & Café"), idempotente. Todos os agendamentos passam pelos casos de uso, com
 * o expediente, a constraint e as travas de sempre. O histórico passado é criado com um relógio
 * "voltado no tempo" e depois concluído/marcado com o relógio adiante.
 */
export async function semearDemo(
  prisma: PrismaClient,
  opcoes: { readonly agora: number; readonly hasher: Hasher; readonly log?: (m: string) => void },
): Promise<ResumoSeed> {
  const log = opcoes.log ?? (() => undefined);
  await limparEstabelecimentoDemo(prisma);

  const hoje = DateTime.fromMillis(opcoes.agora, { zone: FUSO }).startOf('day');
  const sorte = aleatorio(Number(hoje.toFormat('yyyyMMdd')));
  const senhaHash = await opcoes.hasher.hash(SENHA_DEMO);

  const estab = await prisma.estabelecimento.create({
    data: { slug: SLUG_DEMO, nome: 'Navalha & Café', fuso: FUSO },
  });
  const servicos: { id: string }[] = [];
  for (const s of SERVICOS)
    servicos.push(await prisma.servico.create({ data: { ...s, estabelecimentoId: estab.id } }));
  const profissionais: { id: string }[] = [];
  for (const [i, p] of PROFISSIONAIS.entries()) {
    const jornada = JORNADAS[i] ?? {};
    profissionais.push(
      await prisma.profissional.create({
        data: {
          estabelecimentoId: estab.id,
          nome: p.nome,
          criadoEm: new Date(Date.UTC(2026, 0, 1 + i)),
          servicos: { create: p.servicos.map((k) => ({ servicoId: servicos[k]!.id })) },
          jornada: {
            create: Object.entries(jornada).flatMap(([dia, trechos]) =>
              trechos.map((t) => ({ diaSemana: Number(dia), inicio: t.inicio, fim: t.fim })),
            ),
          },
        },
      }),
    );
  }
  // Folga do 2º profissional numa data futura (dia inteiro) e uma folga parcial do 1º.
  await prisma.excecao.createMany({
    data: [
      {
        estabelecimentoId: estab.id,
        profissionalId: profissionais[1]!.id,
        tipo: 'FOLGA',
        data: new Date(`${hoje.plus({ days: 5 }).toISODate()}T00:00:00Z`),
      },
      {
        estabelecimentoId: estab.id,
        profissionalId: profissionais[0]!.id,
        tipo: 'FOLGA',
        data: new Date(`${hoje.plus({ days: 8 }).toISODate()}T00:00:00Z`),
        inicio: '15:00',
        fim: '19:00',
      },
    ],
  });

  const dono = await upsertUsuario(prisma, {
    email: CONTAS_DEMO.dono,
    nome: 'Dona Lúcia',
    papel: Papel.DONO,
    senhaHash,
    estabelecimentoId: estab.id,
  });
  await upsertUsuario(prisma, {
    email: CONTAS_DEMO.profissional,
    nome: PROFISSIONAIS[0]!.nome,
    papel: Papel.PROFISSIONAL,
    senhaHash,
    estabelecimentoId: estab.id,
    profissionalId: profissionais[0]!.id,
  });
  const clienteDemo = await upsertUsuario(prisma, {
    email: CONTAS_DEMO.cliente,
    nome: 'Cliente Demo',
    papel: Papel.CLIENTE,
    senhaHash,
  });
  const clientes = [];
  for (const [i, nome] of NOMES_CLIENTES.entries()) {
    clientes.push(
      await upsertUsuario(prisma, {
        email: `cliente${i + 1}@${DOMINIO_CLIENTES}`,
        nome,
        papel: Papel.CLIENTE,
        senhaHash,
      }),
    );
  }

  const relogio: Relogio & { instante: number } = {
    instante: opcoes.agora,
    agora() {
      return this.instante;
    },
  };
  const deps: DependenciasApp = criarDependencias(prisma, { relogio, hasher: opcoes.hasher });
  const balcao = { usuarioId: dono.id, papel: Papel.DONO };
  const aoAcaso = <T>(xs: readonly T[]) => xs[Math.floor(sorte() * xs.length)]!;

  /** Tenta agendar no balcão; devolve o id ou null (conflito, fora do expediente…). */
  async function tentar(
    profissionalIdx: number,
    inicio: number,
    clienteId: string,
    servicoIdx?: number,
  ) {
    const p = PROFISSIONAIS[profissionalIdx]!;
    const servico = servicos[servicoIdx ?? aoAcaso(p.servicos)]!;
    const r = await agendar(deps, {
      estabelecimentoId: estab.id,
      servicoId: servico.id,
      profissionalId: profissionais[profissionalIdx]!.id,
      clienteUsuarioId: clienteId,
      inicio,
      ator: balcao,
    });
    return r.ok ? r.valor : null;
  }

  async function grade(profissionalIdx: number, dia: DateTime) {
    const r = await listarHorarios(deps, {
      estabelecimentoId: estab.id,
      servicoId: servicos[3]!.id, // o mais curto (15 min), para enxergar a grade inteira
      profissionalId: profissionais[profissionalIdx]!.id,
      dataLocal: dia.toISODate()!,
      ator: balcao,
    });
    return r.ok ? r.valor.map((h) => Date.parse(h.inicio)) : [];
  }

  // ── histórico passado: relógio 7 dias atrás, agendar; depois avançar e concluir/faltar/cancelar
  let historico = 0;
  relogio.instante = hoje.minus({ days: 7 }).toMillis();
  const passados: { id: string; inicio: number }[] = [];
  for (let d = 6; d >= 1; d--) {
    const dia = hoje.minus({ days: d });
    for (let p = 0; p < profissionais.length; p++) {
      const slots = await grade(p, dia);
      for (let k = 0; k < 3 && slots.length > 0; k++) {
        const inicio = slots[Math.floor(sorte() * slots.length)]!;
        const cliente = k === 0 && d === 3 && p === 0 ? clienteDemo : aoAcaso(clientes);
        const ag = await tentar(p, inicio, cliente.id);
        if (ag !== null) passados.push({ id: ag.id, inicio });
      }
    }
  }
  // O atendimento mais recente fica em aberto (CONFIRMADO): no painel, o dono ainda pode marcar
  // "concluído" ou "falta" (RN-19 exige agora >= início), como num balcão de verdade.
  const emAberto = passados.at(-1);
  for (const [i, ag] of passados.entries()) {
    if (ag === emAberto) continue;
    relogio.instante = ag.inicio + 60 * 60_000;
    const cmd = { agendamentoId: ag.id, ator: balcao };
    const r =
      i % 7 === 3
        ? await marcarNaoComparecimento(deps, cmd)
        : i % 7 === 5
          ? await cancelar(deps, cmd)
          : await concluir(deps, cmd);
    if (r.ok) historico++;
  }

  // ── próximas duas semanas, ~40–60% da grade; um dia lotado para o 1º profissional
  relogio.instante = opcoes.agora;
  let futuros = 0;
  const diaLotado = hoje.plus({ days: hoje.weekday >= 5 ? 8 - hoje.weekday + 1 : 2 }); // um dia útil adiante
  for (let d = 0; d < 14; d++) {
    const dia = hoje.plus({ days: d });
    for (let p = 0; p < profissionais.length; p++) {
      const lotado = p === 0 && dia.hasSame(diaLotado, 'day');
      const ocupacao = lotado ? 1 : 0.45 + sorte() * 0.15;
      let livreDepois = 0;
      for (const inicio of await grade(p, dia)) {
        if (inicio < livreDepois || sorte() > ocupacao) continue;
        // No dia lotado, o que não couber com o serviço sorteado é preenchido com o mais curto.
        const ag =
          (await tentar(p, inicio, aoAcaso(clientes).id)) ??
          (lotado ? await tentar(p, inicio, aoAcaso(clientes).id, 3) : null);
        if (ag === null) continue;
        futuros++;
        livreDepois = Date.parse(ag.fim);
      }
    }
  }

  // ── bloqueios pontuais (só onde não há agendamento: o domínio recusa o resto)
  let bloqueios = 0;
  for (const [d, p, h] of [
    [1, 1, '16:00'],
    [3, 0, '11:00'],
    [4, 2, '09:00'],
    [6, 0, '17:00'],
    [9, 1, '11:00'],
  ] as const) {
    const inicio = hoje
      .plus({ days: d })
      .set({ hour: Number(h.slice(0, 2)), minute: 0 })
      .toMillis();
    const r = await criarBloqueio(deps, {
      profissionalId: profissionais[p]!.id,
      inicio,
      fim: inicio + 40 * 60_000,
      motivo: 'Compromisso pessoal',
      ator: balcao,
    });
    if (r.ok) bloqueios++;
  }

  // ── cliente demo: 2 agendamentos futuros feitos por ele mesmo (página pública)
  for (const d of [2, 6]) {
    const dia = hoje.plus({ days: d });
    let feito = false;
    for (const p of [1, 0, 2]) {
      for (const livre of (await grade(p, dia)).filter((t) => t > opcoes.agora + 3 * 3_600_000)) {
        const r = await agendar(deps, {
          estabelecimentoId: estab.id,
          servicoId: servicos[0]!.id,
          profissionalId: profissionais[p]!.id,
          clienteUsuarioId: clienteDemo.id,
          inicio: livre,
          ator: { usuarioId: clienteDemo.id, papel: Papel.CLIENTE },
        });
        if (r.ok) {
          futuros++;
          feito = true;
          break;
        }
      }
      if (feito) break;
    }
  }

  log(
    `Seed "${estab.nome}": ${futuros} agendamentos futuros, ${historico} no histórico, ${bloqueios} bloqueios.`,
  );
  return { estabelecimentoId: estab.id, agendamentosFuturos: futuros, historico, bloqueios };
}
