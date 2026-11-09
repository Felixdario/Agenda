import type { Papel, StatusAgendamento } from '@agenda/shared';
import type { Excecao, Intervalo, Politicas } from '../domain';
import type { Dependencias } from './portas';

/** Ator autenticado, como o guard HTTP o resolve (RN-23). */
export interface AtorHttp {
  readonly usuarioId: string;
  readonly papel: Papel;
  /** DONO e PROFISSIONAL: o estabelecimento ao qual pertencem. */
  readonly estabelecimentoId: string | null;
  /** PROFISSIONAL: o profissional vinculado. */
  readonly profissionalId: string | null;
}

export interface UsuarioDados {
  readonly id: string;
  readonly email: string;
  readonly nome: string;
  readonly senhaHash: string | null;
  readonly papel: Papel;
  readonly estabelecimentoId: string | null;
  readonly profissionalId: string | null;
}

export interface EstabelecimentoCompleto {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
  readonly politicas: Politicas;
}

export interface ServicoCadastro {
  readonly id: string;
  readonly estabelecimentoId: string;
  readonly nome: string;
  readonly duracaoMin: number;
  readonly precoCentavos: number;
  readonly preparoMin: number;
  readonly limpezaMin: number;
  readonly ativo: boolean;
}

export interface ProfissionalCadastro {
  readonly id: string;
  readonly estabelecimentoId: string;
  readonly nome: string;
  readonly ativo: boolean;
  readonly criadoEm: number;
  readonly servicoIds: readonly string[];
}

/** Agendamento com os nomes, para listagens e e-mails. */
export interface AgendamentoDetalhado {
  readonly id: string;
  readonly estabelecimentoId: string;
  readonly estabelecimentoNome: string;
  readonly estabelecimentoSlug: string;
  readonly fuso: string;
  readonly profissionalId: string;
  readonly profissionalNome: string;
  readonly clienteId: string;
  readonly clienteUsuarioId: string;
  readonly clienteNome: string;
  readonly clienteEmail: string;
  readonly servicoId: string;
  readonly servicoNome: string;
  readonly duracaoMin: number;
  readonly precoCentavos: number;
  readonly preparoMin: number;
  readonly limpezaMin: number;
  readonly inicio: number;
  readonly fim: number;
  readonly inicioBloco: number;
  readonly fimBloco: number;
  readonly status: StatusAgendamento;
  readonly versao: number;
}

export interface HistoricoDados {
  readonly tipo: 'STATUS' | 'REMARCACAO';
  readonly de: StatusAgendamento | null;
  readonly para: StatusAgendamento;
  readonly autorUsuarioId: string;
  readonly em: number;
  readonly motivo: string | null;
  readonly inicioAnterior: number | null;
  readonly inicioNovo: number | null;
}

export interface ClienteResumo {
  readonly id: string;
  readonly usuarioId: string;
  readonly estabelecimentoId: string;
  readonly nome: string;
  readonly email: string;
  readonly desbloqueadoEm: number | null;
  readonly agendamentos: readonly { readonly inicio: number; readonly status: StatusAgendamento }[];
}

export interface BloqueioDados {
  readonly id: string;
  readonly profissionalId: string;
  readonly estabelecimentoId: string;
  readonly inicio: number;
  readonly fim: number;
  readonly motivo: string | null;
}

export interface ExcecaoDados {
  readonly id: string;
  readonly estabelecimentoId: string;
  readonly profissionalId: string | null;
}

export type DadosServico = Omit<ServicoCadastro, 'id' | 'estabelecimentoId'>;
export type DadosProfissional = { nome: string; ativo: boolean; servicoIds: readonly string[] };

/** Cadastros, sessões, consultas e lembretes. As regras de agenda continuam em RepositorioAgenda. */
export interface RepositorioCadastro {
  /** D-05: mesma trava de agendar/remarcar (`profissional:<id>`), para escritas que mudam disponibilidade. */
  travar(chaves: readonly string[]): Promise<void>;
  // usuários e sessões
  usuarioPorEmail(email: string): Promise<UsuarioDados | null>;
  usuarioPorId(id: string): Promise<UsuarioDados | null>;
  /** `null` se o e-mail já existe. */
  criarUsuario(u: Omit<UsuarioDados, 'id'>): Promise<UsuarioDados | null>;
  criarSessao(s: {
    usuarioId: string;
    tokenHash: string;
    criadaEm: number;
    expiraEm: number;
  }): Promise<void>;
  sessaoPorTokenHash(tokenHash: string): Promise<{
    readonly usuario: UsuarioDados;
    readonly expiraEm: number;
    readonly revogadaEm: number | null;
  } | null>;
  revogarSessao(tokenHash: string, em: number): Promise<void>;

  // estabelecimento
  estabelecimentoPorSlug(slug: string): Promise<EstabelecimentoCompleto | null>;
  estabelecimentoPorId(id: string): Promise<EstabelecimentoCompleto | null>;
  atualizarPoliticas(
    id: string,
    politicas: Partial<Omit<Politicas, 'fuso'>>,
  ): Promise<EstabelecimentoCompleto>;

  // serviços e profissionais
  listarServicos(estabelecimentoId: string): Promise<ServicoCadastro[]>;
  servicoPorId(id: string): Promise<ServicoCadastro | null>;
  criarServico(estabelecimentoId: string, dados: DadosServico): Promise<ServicoCadastro>;
  atualizarServico(id: string, dados: Partial<DadosServico>): Promise<ServicoCadastro>;
  listarProfissionais(estabelecimentoId: string): Promise<ProfissionalCadastro[]>;
  profissionalPorId(id: string): Promise<ProfissionalCadastro | null>;
  criarProfissional(
    estabelecimentoId: string,
    dados: DadosProfissional,
    criadoEm: number,
  ): Promise<ProfissionalCadastro>;
  atualizarProfissional(
    id: string,
    dados: Partial<DadosProfissional>,
  ): Promise<ProfissionalCadastro>;
  definirJornada(
    profissionalId: string,
    trechos: readonly { diaSemana: number; inicio: string; fim: string }[],
  ): Promise<void>;

  // exceções e bloqueios
  criarExcecao(
    estabelecimentoId: string,
    e: Excecao & { profissionalId: string | null },
  ): Promise<{ id: string }>;
  excecaoPorId(id: string): Promise<ExcecaoDados | null>;
  removerExcecao(id: string): Promise<void>;
  bloqueioPorId(id: string): Promise<BloqueioDados | null>;
  removerBloqueio(id: string): Promise<void>;
  bloqueiosNoIntervalo(
    profissionalIds: readonly string[],
    intervalo: Intervalo,
  ): Promise<BloqueioDados[]>;

  // clientes
  listarClientes(estabelecimentoId: string): Promise<ClienteResumo[]>;
  clientePorId(id: string): Promise<ClienteResumo | null>;
  clienteDoUsuario(usuarioId: string, estabelecimentoId: string): Promise<ClienteResumo | null>;
  desbloquearCliente(id: string, em: number): Promise<void>;

  // agendamentos (leitura)
  agendamentoDetalhado(id: string): Promise<AgendamentoDetalhado | null>;
  agendamentosDoUsuario(
    usuarioId: string,
    filtro: { readonly futuros: boolean; readonly agora: number },
  ): Promise<AgendamentoDetalhado[]>;
  agendamentosNoIntervalo(
    profissionalIds: readonly string[],
    intervalo: Intervalo,
  ): Promise<AgendamentoDetalhado[]>;
  historico(agendamentoId: string): Promise<HistoricoDados[]>;

  // lembretes (RN-24)
  /**
   * Marca de forma atômica (`UPDATE … WHERE "lembreteEnviadoEm" IS NULL RETURNING`) os agendamentos
   * ativos com início em `(agora, ate]` e devolve os ids marcados. Duas instâncias nunca pegam o
   * mesmo agendamento.
   */
  reservarLembretes(agora: number, ate: number): Promise<string[]>;
}

export interface UnidadeCadastro {
  transacao<T>(fn: (repo: RepositorioCadastro) => Promise<T>): Promise<T>;
  leitura<T>(fn: (repo: RepositorioCadastro) => Promise<T>): Promise<T>;
}

/** Hash de senha (argon2id em infra). */
export interface Hasher {
  hash(senha: string): Promise<string>;
  verificar(hash: string, senha: string): Promise<boolean>;
}

export interface Email {
  readonly para: string;
  readonly assunto: string;
  readonly texto: string;
}

/** RN-24: envio de e-mail (SMTP/Mailpit, console ou memória). */
export interface Notificador {
  enviar(email: Email): Promise<void>;
}

/** Registro de erros fora do fluxo (ex. e-mail que falhou depois do commit). */
export interface Registro {
  erro(mensagem: string, erro?: unknown): void;
}

export interface DependenciasApp extends Dependencias {
  readonly cadastro: UnidadeCadastro;
  readonly hasher: Hasher;
  readonly notificador: Notificador;
  readonly registro: Registro;
}
