import type { Papel, StatusAgendamento } from '@agenda/shared';
import type { Excecao, Intervalo, Jornada, Ocupacao, Politicas, ServicoCopia } from '../domain';

/** Única fonte do "agora" no backend. Implementação real em infra/relogio.ts. */
export interface Relogio {
  agora(): number;
}

/** Quem executa o caso de uso (a autenticação/autorização RN-23 entra na fase 3). */
export interface AtorAplicacao {
  readonly usuarioId: string;
  readonly papel: Papel;
}

export interface EstabelecimentoDados {
  readonly id: string;
  readonly politicas: Politicas;
}

export interface ServicoDados {
  readonly id: string;
  readonly estabelecimentoId: string;
  readonly ativo: boolean;
  readonly copia: ServicoCopia;
}

export interface ProfissionalDados {
  readonly id: string;
  readonly estabelecimentoId: string;
  readonly ativo: boolean;
  readonly criadoEm: number;
  readonly servicoIds: readonly string[];
}

export interface ClienteDados {
  readonly id: string;
  readonly usuarioId: string;
  readonly estabelecimentoId: string;
  readonly desbloqueadoEm: number | null;
  /** Agendamentos do cliente no estabelecimento (para RN-17 e RN-18). */
  readonly agendamentos: readonly { readonly inicio: number; readonly status: StatusAgendamento }[];
}

export interface AgendamentoDados {
  readonly id: string;
  readonly estabelecimentoId: string;
  readonly profissionalId: string;
  readonly clienteId: string;
  readonly servicoId: string;
  /** RN-14: cópia gravada. */
  readonly servico: ServicoCopia;
  readonly inicio: number;
  readonly fim: number;
  readonly inicioBloco: number;
  readonly fimBloco: number;
  readonly status: StatusAgendamento;
  readonly versao: number;
  readonly criadoEm: number;
}

/** Agenda de um profissional numa janela: o que o domínio precisa em `ContextoAgenda`. */
export interface AgendaDoProfissional {
  readonly jornada: Jornada;
  /** Exceções do profissional + feriados do estabelecimento. */
  readonly excecoes: readonly Excecao[];
  readonly bloqueios: readonly Intervalo[];
  /** Blocos dos agendamentos não cancelados. */
  readonly ocupacoes: readonly Ocupacao[];
}

export interface NovoAgendamento {
  readonly estabelecimentoId: string;
  readonly profissionalId: string;
  readonly clienteId: string;
  readonly servicoId: string;
  readonly servico: ServicoCopia;
  readonly inicio: number;
  readonly fim: number;
  readonly inicioBloco: number;
  readonly fimBloco: number;
  readonly status: StatusAgendamento;
  readonly criadoEm: number;
}

export interface NovoHorario {
  readonly profissionalId: string;
  readonly inicio: number;
  readonly fim: number;
  readonly inicioBloco: number;
  readonly fimBloco: number;
  readonly atualizadoEm: number;
}

export interface EntradaHistoricoGravada {
  readonly agendamentoId: string;
  readonly tipo: 'STATUS' | 'REMARCACAO';
  readonly de: StatusAgendamento | null;
  readonly para: StatusAgendamento;
  readonly autorUsuarioId: string;
  readonly em: number;
  readonly motivo?: string;
  readonly inicioAnterior?: number;
  readonly inicioNovo?: number;
  readonly profissionalAnteriorId?: string;
  readonly profissionalNovoId?: string;
}

/** Resultado de uma escrita protegida pela constraint de exclusão (RN-21). */
export type Escrita<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly motivo: 'CONFLITO' | 'VERSAO' };

export type ReservaDeChave =
  | { readonly nova: true }
  | { readonly nova: false; readonly hashCorpo: string; readonly resposta: unknown };

/**
 * Repositório usado dentro de uma unidade de trabalho. Na transação de escrita, todos os métodos
 * rodam na mesma transação do banco.
 */
export interface RepositorioAgenda {
  estabelecimento(id: string): Promise<EstabelecimentoDados | null>;
  servico(id: string): Promise<ServicoDados | null>;
  profissional(id: string): Promise<ProfissionalDados | null>;
  /** Profissionais ativos do estabelecimento que executam o serviço (RN-11, RN-12). */
  profissionaisDoServico(
    estabelecimentoId: string,
    servicoId: string,
  ): Promise<ProfissionalDados[]>;
  cliente(id: string): Promise<ClienteDados | null>;
  /** `travar`: SELECT … FOR UPDATE da linha. */
  agendamento(id: string, opcoes?: { readonly travar?: boolean }): Promise<AgendamentoDados | null>;
  agendaDoProfissional(params: {
    readonly profissionalId: string;
    readonly estabelecimentoId: string;
    readonly janela: Intervalo;
    /** Datas locais "yyyy-MM-dd", inclusive. */
    readonly datas: { readonly de: string; readonly ate: string };
    readonly excetoAgendamentoId?: string;
  }): Promise<AgendaDoProfissional>;
  /** Agendamentos não cancelados do profissional com início em `[inicio, fim)` (RN-12). */
  contarAgendamentos(profissionalId: string, intervalo: Intervalo): Promise<number>;
  /** D-05: `pg_advisory_xact_lock` por chave, em ordem estável. */
  travar(chaves: readonly string[]): Promise<void>;
  /** D-15: linha Cliente de (usuário, estabelecimento), criada se não existir (upsert). */
  garantirCliente(usuarioId: string, estabelecimentoId: string): Promise<string>;
  inserirAgendamento(novo: NovoAgendamento): Promise<Escrita<AgendamentoDados>>;
  atualizarHorario(
    id: string,
    versao: number,
    novo: NovoHorario,
  ): Promise<Escrita<AgendamentoDados>>;
  atualizarStatus(
    id: string,
    versao: number,
    status: StatusAgendamento,
    atualizadoEm: number,
  ): Promise<Escrita<AgendamentoDados>>;
  registrarHistorico(entrada: EntradaHistoricoGravada): Promise<void>;
  inserirBloqueio(b: {
    readonly profissionalId: string;
    readonly inicio: number;
    readonly fim: number;
    readonly motivo: string | null;
  }): Promise<{ readonly id: string }>;
  /** RN-22: reserva (usuário, chave); se já existe e não expirou, devolve o que foi gravado. */
  reservarChave(params: {
    readonly usuarioId: string;
    readonly chave: string;
    readonly hashCorpo: string;
    readonly agora: number;
    readonly expiraEm: number;
  }): Promise<ReservaDeChave>;
  concluirChave(params: {
    readonly usuarioId: string;
    readonly chave: string;
    readonly resposta: unknown;
    readonly agendamentoId: string | null;
  }): Promise<void>;
}

export interface UnidadeDeTrabalho {
  /** Transação de escrita (READ COMMITTED). */
  transacao<T>(fn: (repo: RepositorioAgenda) => Promise<T>): Promise<T>;
  /** Leitura fora de transação. */
  leitura<T>(fn: (repo: RepositorioAgenda) => Promise<T>): Promise<T>;
}

export interface Dependencias {
  readonly uow: UnidadeDeTrabalho;
  readonly relogio: Relogio;
}
