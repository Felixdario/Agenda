'use client';

import {
  type AgendamentoBalcao,
  agendaPainelSchema,
  agendamentoDtoSchema,
  agendamentosListaSchema,
  bloqueioRespostaSchema,
  clientesPainelSchema,
  estabelecimentoPainelSchema,
  estabelecimentoPublicoSchema,
  euSchema,
  type ExcecaoEntrada,
  historicoSchema,
  horariosSchema,
  idRespostaSchema,
  jornadaRespostaSchema,
  loginRespostaSchema,
  profissionaisPainelSchema,
  profissionalPainelSchema,
  servicoPainelSchema,
  servicosPainelSchema,
  usuarioSessaoSchema,
} from '@agenda/shared';
import {
  type QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { consulta, requisitar } from './api';
import { ehErroApi } from './erros';
import type { EscolhaDeHorario } from './idempotencia';

/** Chaves do TanStack Query, todas aqui (D-17). Os prefixos permitem invalidar por grupo. */
export const chaves = {
  eu: (slug?: string) => ['eu', slug ?? null] as const,
  estabelecimento: (slug: string) => ['estabelecimento', slug] as const,
  horariosDe: (slug: string) => ['horarios', slug] as const,
  horarios: (slug: string, servicoId: string, profissionalId: string | null, data: string) =>
    ['horarios', slug, servicoId, profissionalId ?? 'qualquer', data] as const,
  meus: (escopo?: 'futuros' | 'passados') =>
    (escopo === undefined ? ['meus'] : ['meus', escopo]) as readonly string[],
  historico: (id: string) => ['historico', id] as const,
  painel: {
    tudo: ['painel'] as const,
    estabelecimento: ['painel', 'estabelecimento'] as const,
    agendas: ['painel', 'agenda'] as const,
    agenda: (data: string) => ['painel', 'agenda', data] as const,
    servicos: ['painel', 'servicos'] as const,
    profissionais: ['painel', 'profissionais'] as const,
    jornada: (id: string) => ['painel', 'jornada', id] as const,
    clientes: ['painel', 'clientes'] as const,
  },
};

/** Sem sessão não é falha da tela: a consulta da conta não tenta de novo um 401. */
const naoRepetir401 = (tentativas: number, e: unknown) =>
  !(ehErroApi(e) && (e.status === 401 || e.status === 403 || e.status === 404)) && tentativas < 2;

// ───────────────────────── conta ─────────────────────────

export function useEu(slug?: string) {
  return useQuery({
    queryKey: chaves.eu(slug),
    queryFn: ({ signal }) =>
      requisitar(`/auth/eu${consulta({ estabelecimento: slug })}`, euSchema, { sinal: signal }),
    retry: naoRepetir401,
    staleTime: 60_000,
  });
}

/** Depois de entrar, sair ou agendar: tudo que depende da sessão é refeito. */
export function invalidarSessao(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['eu'] }),
    qc.invalidateQueries({ queryKey: chaves.meus() }),
    qc.removeQueries({ queryKey: chaves.painel.tudo }),
  ]);
}

export function useEntrar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { email: string; senha: string }) =>
      requisitar('/auth/login', loginRespostaSchema, { metodo: 'POST', corpo: dados }),
    onSuccess: () => invalidarSessao(qc),
  });
}

export function useCriarConta() {
  return useMutation({
    mutationFn: (dados: { nome: string; email: string; senha: string }) =>
      requisitar('/auth/registro', usuarioSessaoSchema, { metodo: 'POST', corpo: dados }),
  });
}

export function useSair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requisitar('/auth/logout', idRespostaSchema.partial().loose(), { metodo: 'POST' }),
    onSettled: async () => {
      qc.removeQueries({ queryKey: ['eu'] });
      qc.removeQueries({ queryKey: chaves.meus() });
      qc.removeQueries({ queryKey: chaves.painel.tudo });
    },
  });
}

// ───────────────────────── página pública ─────────────────────────

export function useEstabelecimento(slug: string | undefined) {
  return useQuery({
    queryKey: chaves.estabelecimento(slug ?? ''),
    queryFn: ({ signal }) =>
      requisitar(
        `/estabelecimentos/${encodeURIComponent(slug ?? '')}`,
        estabelecimentoPublicoSchema,
        {
          sinal: signal,
        },
      ),
    enabled: slug !== undefined && slug !== '',
    retry: naoRepetir401,
    staleTime: 5 * 60_000,
  });
}

/** Vários estabelecimentos (para as políticas de cada item de "meus agendamentos"). */
export function useEstabelecimentos(slugs: readonly string[]) {
  return useQueries({
    queries: slugs.map((slug) => ({
      queryKey: chaves.estabelecimento(slug),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        requisitar(`/estabelecimentos/${encodeURIComponent(slug)}`, estabelecimentoPublicoSchema, {
          sinal: signal,
        }),
      staleTime: 5 * 60_000,
    })),
  });
}

const buscarHorarios = (
  slug: string,
  servicoId: string,
  profissionalId: string | null,
  data: string,
  sinal: AbortSignal,
) =>
  requisitar(
    `/estabelecimentos/${encodeURIComponent(slug)}/horarios${consulta({ servicoId, profissionalId, data })}`,
    horariosSchema,
    { sinal },
  );

/** Horários livres de cada dia da faixa (uma consulta por dia, a disponibilidade vem da API). */
export function useHorariosDosDias(
  slug: string,
  servicoId: string,
  profissionalId: string | null,
  datas: readonly string[],
  habilitado = true,
) {
  return useQueries({
    queries: datas.map((data) => ({
      enabled: habilitado,
      queryKey: chaves.horarios(slug, servicoId, profissionalId, data),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        buscarHorarios(slug, servicoId, profissionalId, data, signal),
      staleTime: 30_000,
    })),
  });
}

export function useHorarios(
  slug: string | undefined,
  servicoId: string | undefined,
  profissionalId: string | null,
  data: string | undefined,
) {
  return useQuery({
    queryKey: chaves.horarios(slug ?? '', servicoId ?? '', profissionalId, data ?? ''),
    queryFn: ({ signal }) => buscarHorarios(slug!, servicoId!, profissionalId, data!, signal),
    enabled: Boolean(slug && servicoId && data),
    staleTime: 15_000,
  });
}

/** Depois de agendar, remarcar ou cancelar: horários e agendas afetados são refeitos (D-17). */
export function invalidarAgenda(qc: QueryClient, slug?: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: slug === undefined ? ['horarios'] : chaves.horariosDe(slug) }),
    qc.invalidateQueries({ queryKey: chaves.meus() }),
    qc.invalidateQueries({ queryKey: chaves.painel.agendas }),
    qc.invalidateQueries({ queryKey: ['eu'] }),
    qc.invalidateQueries({ queryKey: ['historico'] }),
  ]);
}

export function useAgendar(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ escolha, chave }: { escolha: EscolhaDeHorario; chave: string }) =>
      requisitar(
        `/estabelecimentos/${encodeURIComponent(slug)}/agendamentos`,
        agendamentoDtoSchema,
        {
          metodo: 'POST',
          corpo: {
            servicoId: escolha.servicoId,
            profissionalId: escolha.profissionalId,
            inicio: escolha.inicio,
          },
          cabecalhos: { 'Idempotency-Key': chave },
        },
      ),
    // Sucesso ou recusa: a grade daquele dia mudou (ou estava velha). Refaz.
    onSettled: () => invalidarAgenda(qc, slug),
  });
}

// ───────────────────────── agendamentos ─────────────────────────

export function useMeusAgendamentos(escopo: 'futuros' | 'passados', habilitado = true) {
  return useQuery({
    queryKey: chaves.meus(escopo),
    queryFn: ({ signal }) =>
      requisitar(`/eu/agendamentos${consulta({ escopo })}`, agendamentosListaSchema, {
        sinal: signal,
      }),
    enabled: habilitado,
    retry: naoRepetir401,
  });
}

export function useRemarcar(slug?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; inicio: string; profissionalId?: string }) =>
      requisitar(`/agendamentos/${v.id}/remarcar`, agendamentoDtoSchema, {
        metodo: 'POST',
        corpo: {
          inicio: v.inicio,
          ...(v.profissionalId === undefined ? {} : { profissionalId: v.profissionalId }),
        },
      }),
    onSettled: () => invalidarAgenda(qc, slug),
  });
}

export type AcaoDeStatus = 'cancelar' | 'confirmar' | 'concluir' | 'nao-compareceu';

export function useMudarStatus(slug?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; acao: AcaoDeStatus; motivo?: string }) =>
      requisitar(`/agendamentos/${v.id}/${v.acao}`, agendamentoDtoSchema, {
        metodo: 'POST',
        corpo: v.motivo === undefined || v.motivo.trim() === '' ? {} : { motivo: v.motivo.trim() },
      }),
    onSettled: () => invalidarAgenda(qc, slug),
  });
}

export function useHistorico(id: string | undefined) {
  return useQuery({
    queryKey: chaves.historico(id ?? ''),
    queryFn: ({ signal }) =>
      requisitar(`/agendamentos/${id}/historico`, historicoSchema, { sinal: signal }),
    enabled: id !== undefined,
  });
}

// ───────────────────────── painel ─────────────────────────

export function useEstabelecimentoPainel(habilitado = true) {
  return useQuery({
    queryKey: chaves.painel.estabelecimento,
    queryFn: ({ signal }) =>
      requisitar('/painel/estabelecimento', estabelecimentoPainelSchema, { sinal: signal }),
    enabled: habilitado,
    retry: naoRepetir401,
    staleTime: 5 * 60_000,
  });
}

export function useAgendaDoDia(data: string) {
  return useQuery({
    queryKey: chaves.painel.agenda(data),
    queryFn: ({ signal }) =>
      requisitar(`/painel/agenda${consulta({ data })}`, agendaPainelSchema, { sinal: signal }),
    retry: naoRepetir401,
    // A agenda de outro dia continua na tela até a nova chegar (troca de dia sem piscar).
    placeholderData: (anterior) => anterior,
    refetchInterval: 60_000,
  });
}

export function useAgendarNoBalcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpo: AgendamentoBalcao) =>
      requisitar('/painel/agendamentos', agendamentoDtoSchema, { metodo: 'POST', corpo }),
    onSettled: () => invalidarAgenda(qc),
  });
}

export function useCriarBloqueio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpo: { profissionalId: string; inicio: string; fim: string; motivo?: string }) =>
      requisitar('/painel/bloqueios', bloqueioRespostaSchema, { metodo: 'POST', corpo }),
    onSettled: () => invalidarAgenda(qc),
  });
}

export function useRemoverBloqueio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requisitar(`/painel/bloqueios/${id}`, idRespostaSchema, { metodo: 'DELETE' }),
    onSettled: () => invalidarAgenda(qc),
  });
}

export function useCriarExcecao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpo: ExcecaoEntrada) =>
      requisitar('/painel/excecoes', idRespostaSchema, { metodo: 'POST', corpo }),
    onSettled: () => invalidarAgenda(qc),
  });
}

export function useRemoverExcecao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requisitar(`/painel/excecoes/${id}`, idRespostaSchema, { metodo: 'DELETE' }),
    onSettled: () => invalidarAgenda(qc),
  });
}

export function useServicosPainel(habilitado = true) {
  return useQuery({
    queryKey: chaves.painel.servicos,
    queryFn: ({ signal }) =>
      requisitar('/painel/servicos', servicosPainelSchema, { sinal: signal }),
    enabled: habilitado,
    retry: naoRepetir401,
  });
}

export interface DadosServicoForm {
  nome: string;
  duracaoMin: number;
  precoCentavos: number;
  preparoMin: number;
  limpezaMin: number;
  ativo: boolean;
}

export function useSalvarServico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id?: string; dados: DadosServicoForm }) =>
      requisitar(
        id === undefined ? '/painel/servicos' : `/painel/servicos/${id}`,
        servicoPainelSchema,
        {
          metodo: id === undefined ? 'POST' : 'PATCH',
          corpo: dados,
        },
      ),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: chaves.painel.servicos }),
        qc.invalidateQueries({ queryKey: ['estabelecimento'] }),
        qc.invalidateQueries({ queryKey: ['horarios'] }),
      ]),
  });
}

export function useProfissionaisPainel(habilitado = true) {
  return useQuery({
    queryKey: chaves.painel.profissionais,
    queryFn: ({ signal }) =>
      requisitar('/painel/profissionais', profissionaisPainelSchema, { sinal: signal }),
    enabled: habilitado,
    retry: naoRepetir401,
  });
}

export function useSalvarProfissional() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      dados,
    }: {
      id?: string;
      dados: { nome: string; ativo: boolean; servicoIds: string[] };
    }) =>
      requisitar(
        id === undefined ? '/painel/profissionais' : `/painel/profissionais/${id}`,
        profissionalPainelSchema,
        { metodo: id === undefined ? 'POST' : 'PATCH', corpo: dados },
      ),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: chaves.painel.profissionais }),
        qc.invalidateQueries({ queryKey: chaves.painel.agendas }),
        qc.invalidateQueries({ queryKey: ['estabelecimento'] }),
        qc.invalidateQueries({ queryKey: ['horarios'] }),
      ]),
  });
}

export function useJornada(profissionalId: string | undefined) {
  return useQuery({
    queryKey: chaves.painel.jornada(profissionalId ?? ''),
    queryFn: ({ signal }) =>
      requisitar(`/painel/profissionais/${profissionalId}/jornada`, jornadaRespostaSchema, {
        sinal: signal,
      }),
    enabled: profissionalId !== undefined,
  });
}

export function useSalvarJornada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      profissionalId: string;
      dias: Record<string, { inicio: string; fim: string }[]>;
    }) =>
      requisitar(`/painel/profissionais/${v.profissionalId}/jornada`, jornadaRespostaSchema, {
        metodo: 'PUT',
        corpo: { dias: v.dias },
      }),
    onSuccess: (_r, v) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: chaves.painel.jornada(v.profissionalId) }),
        qc.invalidateQueries({ queryKey: chaves.painel.agendas }),
        qc.invalidateQueries({ queryKey: ['horarios'] }),
      ]),
  });
}

export function useClientesPainel() {
  return useQuery({
    queryKey: chaves.painel.clientes,
    queryFn: ({ signal }) =>
      requisitar('/painel/clientes', clientesPainelSchema, { sinal: signal }),
    retry: naoRepetir401,
  });
}

export function useDesbloquearCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requisitar(`/painel/clientes/${id}/desbloquear`, idRespostaSchema.loose(), {
        metodo: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.painel.clientes }),
  });
}

export function useSalvarPoliticas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (politicas: Record<string, number | boolean>) =>
      requisitar('/painel/estabelecimento/politicas', estabelecimentoPainelSchema, {
        metodo: 'PATCH',
        corpo: politicas,
      }),
    onSuccess: (e) => {
      qc.setQueryData(chaves.painel.estabelecimento, e);
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['estabelecimento'] }),
        qc.invalidateQueries({ queryKey: ['horarios'] }),
      ]);
    },
  });
}
