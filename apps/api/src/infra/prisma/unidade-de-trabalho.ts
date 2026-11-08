import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import type { RepositorioAgenda, UnidadeDeTrabalho } from '../../application/portas';
import { PrismaClient } from './generated/client';
import { RepositorioAgendaPrisma } from './repositorio-agenda';

export interface OpcoesBanco {
  readonly url: string;
  /** Tamanho do pool de conexões do `pg`. */
  readonly maxConexoes?: number;
}

/**
 * RN-02: o @prisma/adapter-pg envia `Date` como texto SEM offset ("2026-03-02 13:00:00") e, na
 * leitura, troca o offset devolvido pelo Postgres por "+00:00". Os dois lados só estão certos com a
 * sessão em UTC. Por isso toda conexão nova do pool roda `SET TIME ZONE 'UTC'` antes de qualquer
 * outra consulta. Isso não depende do default do servidor, do `ALTER DATABASE … SET timezone` nem
 * de um `options=-c TimeZone=…` na URL: o SET vem depois deles e vence.
 */
export function criarPool({ url, maxConexoes = 10 }: OpcoesBanco): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, max: maxConexoes });
  pool.on('connect', (cliente) => {
    // A fila do pg.Client é FIFO: este SET roda antes da 1ª consulta de quem recebe a conexão.
    cliente.query("SET TIME ZONE 'UTC'").catch((erro: unknown) => {
      cliente.emit('error', erro instanceof Error ? erro : new Error(String(erro)));
    });
  });
  return pool;
}

export function criarPrisma(opcoes: OpcoesBanco): PrismaClient {
  const adapter = new PrismaPg(criarPool(opcoes), { disposeExternalPool: true });
  return new PrismaClient({ adapter });
}

export class UnidadeDeTrabalhoPrisma implements UnidadeDeTrabalho {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly opcoes: { readonly maxWaitMs?: number; readonly timeoutMs?: number } = {},
  ) {}

  transacao<T>(fn: (repo: RepositorioAgenda) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(new RepositorioAgendaPrisma(tx)), {
      isolationLevel: 'ReadCommitted',
      maxWait: this.opcoes.maxWaitMs ?? 10_000,
      timeout: this.opcoes.timeoutMs ?? 20_000,
    });
  }

  leitura<T>(fn: (repo: RepositorioAgenda) => Promise<T>): Promise<T> {
    return fn(new RepositorioAgendaPrisma(this.prisma));
  }
}
