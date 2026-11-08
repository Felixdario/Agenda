import type { PrismaClient } from '../../src/infra/prisma';
import { em } from '../integracao/apoio';

export type R = { ok: boolean; codigo?: string; valor?: unknown };

export const codigos = (rs: readonly R[]) =>
  rs.reduce<Record<string, number>>((acc, r) => {
    const k = r.ok ? 'OK' : (r.codigo ?? '?');
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

export const cliente = (usuarioId: string) => ({ usuarioId, papel: 'CLIENTE' as const });
export const dono = (usuarioId: string) => ({ usuarioId, papel: 'DONO' as const });

export const H = (hhmm: string) => em(`2026-03-02T${hhmm}`);

/** Pares de agendamentos não cancelados do mesmo profissional com blocos sobrepostos. */
export async function sobreposicoes(prisma: PrismaClient): Promise<number> {
  const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
    SELECT count(*) AS n FROM "Agendamento" a JOIN "Agendamento" b
      ON a.id < b.id AND a."profissionalId" = b."profissionalId"
     AND a.status <> 'CANCELADO' AND b.status <> 'CANCELADO'
     AND a."inicioBloco" < b."fimBloco" AND b."inicioBloco" < a."fimBloco"`);
  return Number(r[0]!.n);
}

/** Pares (bloqueio, agendamento não cancelado) sobrepostos no mesmo profissional. */
export async function bloqueioSobreposto(prisma: PrismaClient): Promise<number> {
  const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
    SELECT count(*) AS n FROM "Bloqueio" k JOIN "Agendamento" a
      ON a."profissionalId" = k."profissionalId" AND a.status <> 'CANCELADO'
     AND a."inicioBloco" < k.fim AND k.inicio < a."fimBloco"`);
  return Number(r[0]!.n);
}

/** Embaralha a ordem de disparo para variar quem chega primeiro. */
export function embaralhar<T>(xs: T[], semente: number): T[] {
  const a = [...xs];
  let s = semente * 9301 + 49297;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
