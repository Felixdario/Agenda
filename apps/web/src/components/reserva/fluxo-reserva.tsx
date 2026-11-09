'use client';

import type { AgendamentoLista, EstabelecimentoPublico, StatusAgendamento } from '@agenda/shared';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { Iniciais } from '@/components/comum/iniciais';
import { Botao, estiloBotao } from '@/components/ui/botao';
import { Esqueleto } from '@/components/ui/estados';
import { Folha } from '@/components/ui/folha';
import { useAgora } from '@/lib/agora';
import { cn } from '@/lib/cn';
import { useAgendar, useEu, useHorariosDosDias, useRemarcar } from '@/lib/consultas';
import { type ErroApi, ehErroApi } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';
import { criarChavesDeIdempotencia } from '@/lib/idempotencia';
import { dataLocalDe, proximosDias } from '@/lib/tempo';
import { BlocoOcupado } from './bloco-ocupado';
import { type EstadoFluxo, PASSOS, type Passo, QUALQUER } from './estado';
import { FaixaDias } from './faixa-dias';
import { GradeHorarios } from './grade-horarios';
import { Recusa } from './recusa';

const DIAS_NA_FAIXA = 14;

export type ModoFluxo =
  | { tipo: 'novo'; enderecoDeVolta: (estado: EstadoFluxo) => string }
  | { tipo: 'remarcar'; agendamento: AgendamentoLista };

/**
 * Fluxo de reserva numa folha: profissional → dia e horário → revisão → confirmar. Também serve
 * para remarcar, com o serviço travado e o profissional atual escolhido (pode trocar).
 */
export function FluxoReserva({
  estab,
  estado,
  aoMudar,
  modo,
}: {
  estab: EstabelecimentoPublico;
  estado: EstadoFluxo | null;
  aoMudar: (estado: EstadoFluxo | null) => void;
  modo: ModoFluxo;
}) {
  const t = useTranslations('fluxo');
  const servico = estab.servicos.find((s) => s.id === estado?.servicoId);
  const aberta = estado !== null && servico !== undefined;
  const titulo =
    servico === undefined
      ? ''
      : modo.tipo === 'remarcar'
        ? t('tituloRemarcar', { servico: servico.nome })
        : t('titulo', { servico: servico.nome });

  return (
    <Folha
      aberta={aberta}
      aoMudar={(v) => {
        if (!v) aoMudar(null);
      }}
      titulo={titulo}
      largura="md"
    >
      {aberta ? (
        <ConteudoDoFluxo estab={estab} estado={estado} aoMudar={aoMudar} modo={modo} />
      ) : null}
    </Folha>
  );
}

function ConteudoDoFluxo({
  estab,
  estado,
  aoMudar,
  modo,
}: {
  estab: EstabelecimentoPublico;
  estado: EstadoFluxo;
  aoMudar: (estado: EstadoFluxo | null) => void;
  modo: ModoFluxo;
}) {
  const t = useTranslations();
  const router = useRouter();
  const f = useFormatos(estab.fuso);
  const agora = useAgora();
  const servico = estab.servicos.find((s) => s.id === estado.servicoId)!;
  const executam = estab.profissionais.filter((p) => p.servicoIds.includes(servico.id));
  const remarcando = modo.tipo === 'remarcar' ? modo.agendamento : null;

  const profissionalId =
    estado.profissional === undefined || estado.profissional === QUALQUER
      ? null
      : estado.profissional;
  const nomeProfissional =
    profissionalId === null
      ? null
      : (estab.profissionais.find((p) => p.id === profissionalId)?.nome ?? null);

  // ── dias e horários (sempre da API)
  const hoje = agora === 0 ? null : dataLocalDe(agora, estab.fuso);
  const datas = hoje === null ? [] : proximosDias(hoje, DIAS_NA_FAIXA);
  const consultas = useHorariosDosDias(
    estab.slug,
    servico.id,
    profissionalId,
    datas,
    estado.passo !== 'profissional' && estado.profissional !== undefined,
  );
  const vagas = consultas.map((c) => (c.data === undefined ? undefined : c.data.length));
  // Primeiro dia com vaga, só quando todos os dias anteriores já responderam: a seleção não pula
  // de dia enquanto as consultas chegam fora de ordem.
  const indiceCarregando = vagas.findIndex((v) => v === undefined);
  const primeiroComVaga = datas.find(
    (_, i) => (indiceCarregando === -1 || i < indiceCarregando) && (vagas[i] ?? 0) > 0,
  );
  const aguardandoDia =
    estado.data === undefined && primeiroComVaga === undefined && indiceCarregando !== -1;
  const data = aguardandoDia ? undefined : (estado.data ?? primeiroComVaga ?? hoje ?? undefined);
  const indiceDoDia = data === undefined ? -1 : datas.indexOf(data);
  const consultaDoDia = indiceDoDia >= 0 ? consultas[indiceDoDia] : undefined;

  // ── conta e confirmação
  const eu = useEu(estab.slug);
  const deslogado = eu.isError && ehErroApi(eu.error) && eu.error.status === 401;
  const agendar = useAgendar(estab.slug);
  const remarcar = useRemarcar(estab.slug);
  const chaves = useRef(criarChavesDeIdempotencia());
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [recusa, setRecusa] = useState<{ perdido: string; proximos: string[] } | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const confirmando = agendar.isPending || remarcar.isPending;

  const ir = (mudanca: Partial<EstadoFluxo>) => {
    setErro(null);
    aoMudar({ ...estado, ...mudanca });
  };

  const sucesso = (r: { inicio: string; status: StatusAgendamento; servicoNome: string }) => {
    chaves.current.encerrar();
    setRecusa(null);
    setMarcando(null);
    const titulo =
      remarcando !== null
        ? t('fluxo.sucessoRemarcar')
        : r.status === 'PENDENTE'
          ? t('fluxo.sucessoPendente')
          : t('fluxo.sucesso');
    toast.success(titulo, {
      description: t('fluxo.sucessoDescricao', {
        data: f.dataCurta(r.inicio),
        hora: f.hora(r.inicio),
        servico: r.servicoNome,
      }),
      ...(remarcando === null
        ? {
            action: { label: t('fluxo.verMeus'), onClick: () => router.push('/meus-agendamentos') },
          }
        : {}),
    });
    aoMudar(null);
  };

  const falhou = (e: unknown, inicio: string) => {
    setMarcando(null);
    if (ehErroApi(e) && e.codigo === 'HORARIO_INDISPONIVEL') {
      setErro(null);
      setRecusa({ perdido: inicio, proximos: e.proximosHorarios.slice(0, 5) });
      return;
    }
    // Erro de rede: a mesma chave é reusada no próximo clique (RN-22).
    setErro(ehErroApi(e) ? e : null);
  };

  const confirmar = (inicio: string) => {
    if (remarcando !== null) {
      const trocouProfissional =
        profissionalId !== null && profissionalId !== remarcando.profissional.id;
      remarcar.mutate(
        { id: remarcando.id, inicio, ...(trocouProfissional ? { profissionalId } : {}) },
        { onSuccess: sucesso, onError: (e) => falhou(e, inicio) },
      );
      return;
    }
    const escolha = { servicoId: servico.id, profissionalId, inicio };
    agendar.mutate(
      { escolha, chave: chaves.current.chavePara(escolha) },
      { onSuccess: sucesso, onError: (e) => falhou(e, inicio) },
    );
  };

  const escolherProximo = (inicio: string) => {
    setMarcando(inicio);
    ir({ inicio, data: dataLocalDe(inicio, estab.fuso), passo: 'revisao' });
    confirmar(inicio);
  };

  const passos: readonly Passo[] = PASSOS;
  const numero = passos.indexOf(estado.passo) + 1;
  const anterior: Passo | null =
    estado.passo === 'revisao' ? 'horario' : estado.passo === 'horario' ? 'profissional' : null;

  let corpo: ReactNode;
  let rodape: ReactNode = null;

  if (recusa !== null) {
    corpo = (
      <Recusa
        perdido={recusa.perdido}
        proximos={recusa.proximos}
        fuso={estab.fuso}
        marcando={marcando}
        nomeProfissional={nomeProfissional}
        aoEscolher={escolherProximo}
        aoOutroDia={() => {
          setRecusa(null);
          ir({ passo: 'horario' });
        }}
      />
    );
  } else if (estado.passo === 'profissional') {
    corpo = (
      <PassoProfissional
        opcoes={executam}
        qualquer={remarcando === null}
        atual={remarcando?.profissional.id}
        escolhido={estado.profissional}
        aoEscolher={(id) => {
          const { data: _data, inicio: _inicio, ...resto } = estado;
          void _data;
          void _inicio;
          setErro(null);
          aoMudar({ ...resto, profissional: id, passo: 'horario' });
        }}
      />
    );
  } else if (estado.passo === 'horario') {
    const horarios = consultaDoDia?.data;
    const proximoComVaga =
      indiceDoDia < 0
        ? undefined
        : datas.slice(indiceDoDia + 1).find((d) => (vagas[datas.indexOf(d)] ?? 0) > 0);
    corpo = (
      <div className="flex flex-col gap-5">
        <ResumoEscolha
          rotulo={
            nomeProfissional === null
              ? t('fluxo.comQualquer')
              : t('fluxo.com', { nome: nomeProfissional })
          }
          acao={t('fluxo.trocarProfissional')}
          aoAgir={() => ir({ passo: 'profissional' })}
          nome={nomeProfissional}
        />
        {data === undefined ? (
          <Esqueleto className="h-[76px] w-full rounded-[16px]" />
        ) : (
          <FaixaDias
            dias={datas.map((d, i) => ({ data: d, vagas: vagas[i] }))}
            escolhido={data}
            aoEscolher={(d) => {
              const { inicio: _i, ...resto } = estado;
              void _i;
              setErro(null);
              aoMudar({ ...resto, data: d });
            }}
          />
        )}
        <div className="flex flex-col gap-3">
          {data === undefined ? null : (
            <h3 className="texto-16 font-semibold">{f.frase(f.dataLocalLonga(data))}</h3>
          )}
          {consultaDoDia === undefined || consultaDoDia.isPending ? (
            <GradeEsqueleto />
          ) : consultaDoDia.isError && horarios === undefined ? (
            <ErroDeRegra
              erro={consultaDoDia.error as ErroApi}
              contexto={{ estabelecimento: estab.nome, fuso: estab.fuso }}
              acao={
                <Botao
                  variante="link"
                  tamanho="sm"
                  className="texto-14 mt-1"
                  onClick={() => void consultaDoDia.refetch()}
                >
                  {t('comum.tentarDeNovo')}
                </Botao>
              }
            />
          ) : horarios !== undefined && horarios.length > 0 ? (
            <GradeHorarios
              horarios={horarios}
              escolhido={estado.inicio}
              aoEscolher={(inicio) => ir({ inicio, data: data! })}
              fuso={estab.fuso}
              nomeProfissional={nomeProfissional}
              rotulo={t('fluxo.horarios', { data: f.dataLocalLonga(data!) })}
            />
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-control px-4 py-5">
              <p className="texto-14 text-muted">
                {primeiroComVaga === undefined && vagas.every((v) => v !== undefined)
                  ? t('fluxo.nenhumDiaComVaga')
                  : t('fluxo.diaSemHorarios')}
              </p>
              {proximoComVaga !== undefined ? (
                <Botao variante="secundario" onClick={() => ir({ data: proximoComVaga })}>
                  {t('fluxo.proximoDiaComVaga', { data: f.dataLocalLonga(proximoComVaga) })}
                </Botao>
              ) : profissionalId !== null && remarcando === null ? (
                <Botao variante="secundario" onClick={() => ir({ profissional: QUALQUER })}>
                  {t('fluxo.tentarQualquer')}
                </Botao>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
    rodape = (
      <div className="flex flex-col gap-2">
        <Botao
          variante="primario"
          tamanho="lg"
          largura="total"
          aria-disabled={estado.inicio === undefined}
          onClick={() => {
            if (estado.inicio !== undefined) ir({ passo: 'revisao' });
          }}
          data-testid="continuar"
        >
          {estado.inicio === undefined
            ? t('fluxo.escolhaUmHorario')
            : t('fluxo.horarioEscolhido', {
                data: f.dataCurta(estado.inicio),
                hora: f.hora(estado.inicio),
              })}
          {estado.inicio === undefined ? null : <ChevronRight aria-hidden className="size-4" />}
        </Botao>
      </div>
    );
  } else {
    const inicio = estado.inicio!;
    const fim = Date.parse(inicio) + servico.duracaoMin * 60_000;
    const prazoH = estab.politicas.prazoCancelamentoHoras;
    const limite = Date.parse(inicio) - prazoH * 3_600_000;
    corpo = (
      <div className="flex flex-col gap-5">
        <dl className="divide-y divide-rule rounded-card border border-border">
          <LinhaResumo rotulo={t('fluxo.revisao.servico')}>
            <span className="font-semibold">{servico.nome}</span>
            <span className="num text-muted">{f.duracao(servico.duracaoMin)}</span>
          </LinhaResumo>
          <LinhaResumo rotulo={t('fluxo.revisao.quando')}>
            <span className="font-semibold">{f.frase(f.dataLonga(inicio))}</span>
            <span className="num text-muted">{f.intervalo(inicio, fim)}</span>
          </LinhaResumo>
          <LinhaResumo rotulo={t('fluxo.revisao.profissional')}>
            <span className="font-semibold">
              {nomeProfissional ?? t('fluxo.revisao.definidoAoConfirmar')}
            </span>
          </LinhaResumo>
          <LinhaResumo rotulo={t('fluxo.revisao.preco')}>
            <span className="num font-semibold">{f.preco(servico.precoCentavos)}</span>
          </LinhaResumo>
        </dl>

        <section aria-labelledby="titulo-bloco" className="flex flex-col gap-2">
          <h3 id="titulo-bloco" className="texto-16 font-semibold">
            {t('bloco.titulo')}
          </h3>
          <BlocoOcupado
            inicio={inicio}
            duracaoMin={servico.duracaoMin}
            preparoMin={servico.preparoMin}
            limpezaMin={servico.limpezaMin}
            fuso={estab.fuso}
          />
        </section>

        <section aria-labelledby="titulo-politicas" className="flex flex-col gap-1">
          <h3 id="titulo-politicas" className="texto-16 font-semibold">
            {t('fluxo.revisao.politicas')}
          </h3>
          <p className="texto-14 text-muted">
            {prazoH > 0
              ? t('fluxo.politicaCancelamento', {
                  data: f.dataCurta(limite),
                  hora: f.hora(limite),
                  horas: prazoH,
                })
              : t('fluxo.politicaSemPrazo')}
          </p>
        </section>

        {erro === null ? null : (
          <ErroDeRegra
            erro={erro}
            contexto={{
              estabelecimento: estab.nome,
              fuso: estab.fuso,
              antecedenciaMin: estab.politicas.antecedenciaMinimaMin,
              granularidadeMin: estab.politicas.granularidadeMin,
              ...(eu.data?.estabelecimento === undefined
                ? {}
                : { limiteAgendamentos: eu.data.estabelecimento.limiteAgendamentosAtivos }),
            }}
            {...(erro.codigo === 'LIMITE_DE_AGENDAMENTOS'
              ? {
                  acao: (
                    <Link
                      href="/meus-agendamentos"
                      className="texto-14 mt-1 inline-block font-medium text-accent underline"
                    >
                      {t('erros.LIMITE_DE_AGENDAMENTOS.acao')}
                    </Link>
                  ),
                }
              : {})}
          />
        )}
      </div>
    );
    rodape =
      modo.tipo === 'novo' && deslogado ? (
        <div className="flex flex-col gap-2">
          <p className="texto-12 text-muted">{t('fluxo.entrarExplica')}</p>
          <Link
            href={`/entrar?voltar=${encodeURIComponent(modo.enderecoDeVolta({ ...estado, passo: 'revisao' }))}`}
            className={estiloBotao({ variante: 'primario', tamanho: 'lg', largura: 'total' })}
          >
            {t('fluxo.entrarParaConfirmar')}
          </Link>
        </div>
      ) : (
        <Botao
          variante="primario"
          tamanho="lg"
          largura="total"
          carregando={confirmando}
          disabled={confirmando || eu.isPending}
          onClick={() => confirmar(inicio)}
          data-testid="confirmar"
        >
          {confirmando
            ? t('fluxo.confirmando')
            : remarcando !== null
              ? t('fluxo.confirmarRemarcacao')
              : t('fluxo.confirmar')}
        </Botao>
      );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-4 flex h-8 items-center justify-between">
        {anterior !== null && recusa === null ? (
          <button
            type="button"
            onClick={() => ir({ passo: anterior })}
            className="pressionavel texto-14 -ml-2 inline-flex h-8 items-center gap-1 rounded-full px-2 font-medium text-muted hover:bg-raised hover:text-text"
          >
            <ChevronLeft aria-hidden className="size-4" />
            {t('comum.voltar')}
          </button>
        ) : (
          <span />
        )}
        <span className="texto-12 num font-medium text-muted">
          {t('fluxo.passoDe', { atual: numero, total: passos.length })}
        </span>
      </div>
      {recusa === null ? (
        <h3 className="texto-16 mb-4 font-semibold">{t(`fluxo.passos.${estado.passo}`)}</h3>
      ) : null}
      <div key={recusa === null ? estado.passo : 'recusa'} className="passo-entra flex-1">
        {corpo}
      </div>
      {rodape === null ? (
        <div aria-hidden className="h-6 shrink-0" />
      ) : (
        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-border bg-surface px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:-mx-6 md:px-6 md:pb-6">
          {rodape}
        </div>
      )}
    </div>
  );
}

function LinhaResumo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="texto-14 w-28 shrink-0 text-muted">{rotulo}</dt>
      <dd className="texto-16 flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
        {children}
      </dd>
    </div>
  );
}

function ResumoEscolha({
  rotulo,
  acao,
  aoAgir,
  nome,
}: {
  rotulo: string;
  acao: string;
  aoAgir: () => void;
  nome: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-ground px-3 py-2">
      {nome === null ? (
        <span
          aria-hidden
          className="inline-flex size-8 items-center justify-center rounded-full bg-raised text-muted"
        >
          <Users className="size-4" />
        </span>
      ) : (
        <Iniciais nome={nome} tamanho="sm" />
      )}
      <span className="texto-14 min-w-0 flex-1 font-medium">{rotulo}</span>
      <Botao variante="link" tamanho="sm" className="texto-14" onClick={aoAgir}>
        {acao}
      </Botao>
    </div>
  );
}

function GradeEsqueleto() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      {[0, 1].map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <Esqueleto className="h-5 w-16" />
          <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Esqueleto key={i} className="h-12 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PassoProfissional({
  opcoes,
  qualquer,
  atual,
  escolhido,
  aoEscolher,
}: {
  opcoes: readonly { id: string; nome: string }[];
  qualquer: boolean;
  atual: string | undefined;
  escolhido: string | undefined;
  aoEscolher: (id: string) => void;
}) {
  const t = useTranslations('fluxo');
  const linhas = [
    ...(qualquer
      ? [{ id: QUALQUER, nome: t('qualquerProfissional'), descricao: t('qualquerDescricao') }]
      : []),
    ...opcoes.map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao:
        p.id === atual ? t('profissionalAtual') : t('profissionalDescricao', { nome: p.nome }),
    })),
  ];
  return (
    <ul className="flex flex-col gap-2">
      {linhas.map((l) => (
        <li key={l.id}>
          <button
            type="button"
            onClick={() => aoEscolher(l.id)}
            aria-current={l.id === escolhido ? 'true' : undefined}
            data-profissional={l.id}
            className={cn(
              'pressionavel flex min-h-16 w-full items-center gap-3 rounded-card border px-4 py-3 text-left',
              l.id === escolhido
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-surface hover:border-control',
            )}
          >
            {l.id === QUALQUER ? (
              <span
                aria-hidden
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-muted"
              >
                <Users className="size-5" />
              </span>
            ) : (
              <Iniciais nome={l.nome} />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="texto-16 font-semibold">{l.nome}</span>
              <span className="texto-14 text-muted">{l.descricao}</span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}
