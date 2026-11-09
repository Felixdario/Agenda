'use client';

import type { AgendamentoLista, EstabelecimentoPublico } from '@agenda/shared';
import { Tabs } from '@base-ui/react/tabs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { PilulaDeStatus } from '@/components/comum/status';
import type { EstadoFluxo } from '@/components/reserva/estado';
import { FluxoReserva } from '@/components/reserva/fluxo-reserva';
import { Botao, estiloBotao } from '@/components/ui/botao';
import { AreaDeTexto, Campo } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Carregando, EstadoErro, EstadoVazio, Esqueleto } from '@/components/ui/estados';
import { useAgora } from '@/lib/agora';
import { cn } from '@/lib/cn';
import { useEstabelecimentos, useMeusAgendamentos, useMudarStatus } from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';
import { useRedirecionarSeSemSessao } from '@/lib/sessao';

const SLUG_DEMO = process.env.NEXT_PUBLIC_SLUG_DEMO ?? 'navalha-e-cafe';
type Aba = 'futuros' | 'passados';

export function PaginaMeusAgendamentos() {
  const t = useTranslations('meus');
  const [aba, setAba] = useState<Aba>('futuros');
  const futuros = useMeusAgendamentos('futuros');
  const passados = useMeusAgendamentos('passados', aba === 'passados');
  useRedirecionarSeSemSessao(futuros.error, passados.error);

  const slugs = [
    ...new Set(
      [...(futuros.data ?? []), ...(passados.data ?? [])].map((a) => a.estabelecimento.slug),
    ),
  ];
  const estabs = useEstabelecimentos(slugs);
  const porSlug = new Map(
    estabs.flatMap((c) => (c.data === undefined ? [] : [[c.data.slug, c.data] as const])),
  );

  const aba_ = (valor: Aba, rotulo: string) => (
    <Tabs.Tab
      value={valor}
      className="texto-14 relative h-11 px-1 font-medium text-muted outline-none hover:text-text focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-accent data-active:text-text"
    >
      {rotulo}
    </Tabs.Tab>
  );

  return (
    <div className="flex flex-col gap-5 pt-2">
      <h1 className="texto-28 font-bold">{t('titulo')}</h1>
      <Tabs.Root value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <Tabs.List className="relative flex gap-6 border-b border-border">
          {aba_('futuros', t('abas.proximos'))}
          {aba_('passados', t('abas.anteriores'))}
          <Tabs.Indicator className="absolute bottom-[-1px] left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-text transition-[translate,width] duration-200 ease-out motion-reduce:transition-none" />
        </Tabs.List>
        <Tabs.Panel value="futuros" className="pt-5 outline-none">
          <ListaDeAgendamentos consulta={futuros} estabs={porSlug} proximos />
        </Tabs.Panel>
        <Tabs.Panel value="passados" className="pt-5 outline-none">
          <ListaDeAgendamentos consulta={passados} estabs={porSlug} proximos={false} />
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}

function ListaDeAgendamentos({
  consulta,
  estabs,
  proximos,
}: {
  consulta: ReturnType<typeof useMeusAgendamentos>;
  estabs: Map<string, EstabelecimentoPublico>;
  proximos: boolean;
}) {
  const t = useTranslations('meus');
  const [remarcando, setRemarcando] = useState<{
    ag: AgendamentoLista;
    estado: EstadoFluxo;
  } | null>(null);
  const [cancelando, setCancelando] = useState<AgendamentoLista | null>(null);

  if (consulta.isPending) {
    return (
      <Carregando className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
          >
            <Esqueleto className="h-6 w-56" />
            <Esqueleto className="h-5 w-40" />
            <Esqueleto className="h-10 w-48 rounded-full" />
          </div>
        ))}
      </Carregando>
    );
  }
  if (consulta.data === undefined) {
    return <EstadoErro erro={consulta.error} aoTentar={() => void consulta.refetch()} />;
  }
  const lista = proximos
    ? [...consulta.data].sort((a, b) => a.inicio.localeCompare(b.inicio))
    : [...consulta.data].sort((a, b) => b.inicio.localeCompare(a.inicio));

  const estabDoRemarcar =
    remarcando === null ? undefined : estabs.get(remarcando.ag.estabelecimento.slug);

  return (
    <>
      {consulta.isError ? (
        <EstadoErro
          erro={consulta.error}
          temDados
          aoTentar={() => void consulta.refetch()}
          className="mb-3"
        />
      ) : null}
      {lista.length === 0 ? (
        <EstadoVazio
          acao={
            proximos ? (
              <Link
                href={`/b/${SLUG_DEMO}`}
                className={estiloBotao({ variante: 'primario', tamanho: 'lg' })}
              >
                {t('agendarDemo')}
              </Link>
            ) : undefined
          }
        >
          {proximos ? t('vazioProximos') : t('vazioAnteriores')}
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((a) => (
            <li key={a.id}>
              <CartaoAgendamento
                ag={a}
                estab={estabs.get(a.estabelecimento.slug)}
                acoes={proximos}
                aoRemarcar={() =>
                  setRemarcando({
                    ag: a,
                    estado: {
                      servicoId: a.servico.id,
                      profissional: a.profissional.id,
                      passo: 'horario',
                    },
                  })
                }
                aoCancelar={() => setCancelando(a)}
              />
            </li>
          ))}
        </ul>
      )}
      {remarcando !== null && estabDoRemarcar !== undefined ? (
        <FluxoReserva
          estab={estabDoRemarcar}
          estado={remarcando.estado}
          aoMudar={(estado) =>
            setRemarcando(estado === null ? null : { ag: remarcando.ag, estado })
          }
          modo={{ tipo: 'remarcar', agendamento: remarcando.ag }}
        />
      ) : null}
      <DialogoCancelar ag={cancelando} aoFechar={() => setCancelando(null)} />
    </>
  );
}

function CartaoAgendamento({
  ag,
  estab,
  acoes,
  aoRemarcar,
  aoCancelar,
}: {
  ag: AgendamentoLista;
  estab: EstabelecimentoPublico | undefined;
  acoes: boolean;
  aoRemarcar: () => void;
  aoCancelar: () => void;
}) {
  const t = useTranslations('meus');
  const tc = useTranslations('comum');
  const f = useFormatos(ag.estabelecimento.fuso);
  const agora = useAgora();
  const ativo = ag.status === 'PENDENTE' || ag.status === 'CONFIRMADO';
  // podeCancelar: derivado da política pública (prazo em horas). A API confere de novo (RN-15).
  const prazoH = estab?.politicas.prazoCancelamentoHoras;
  const limite = prazoH === undefined ? undefined : Date.parse(ag.inicio) - prazoH * 3_600_000;
  const podeCancelar = limite !== undefined && agora !== 0 && agora <= limite;

  return (
    <article
      data-agendamento={ag.id}
      className={cn(
        'flex flex-col gap-3 rounded-card border border-border bg-surface p-5',
        !ativo && 'bg-ground',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="texto-16 font-semibold">{f.frase(f.dataLonga(ag.inicio))}</h2>
          <p className="texto-16 num text-muted">{f.intervalo(ag.inicio, ag.fim)}</p>
        </div>
        <PilulaDeStatus status={ag.status} />
      </div>
      <p className="texto-14">
        <span className="font-medium">{ag.servico.nome}</span>
        <span className="text-muted">{` ${tc('separador')} ${ag.profissional.nome} ${tc('separador')} `}</span>
        <span className="num text-muted">{f.preco(ag.servico.precoCentavos)}</span>
      </p>
      <p className="texto-14 text-muted">
        <Link href={`/b/${ag.estabelecimento.slug}`} className="hover:text-text hover:underline">
          {t('em', { estabelecimento: ag.estabelecimento.nome })}
        </Link>
      </p>
      {acoes && ativo && limite !== undefined ? (
        podeCancelar ? (
          <div className="flex flex-col gap-3 border-t border-rule pt-3">
            <p className="texto-12 text-muted">
              {t('podeAte', { data: f.dataCurta(limite), hora: f.hora(limite) })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Botao
                variante="secundario"
                tamanho="lg"
                onClick={aoRemarcar}
                disabled={estab === undefined}
              >
                {t('remarcar')}
              </Botao>
              <Botao variante="perigo" tamanho="lg" onClick={aoCancelar}>
                {t('cancelar')}
              </Botao>
            </div>
          </div>
        ) : (
          <p className="texto-14 border-t border-rule pt-3 text-muted">
            {t('prazoEncerrado', {
              data: f.dataCurta(limite),
              hora: f.hora(limite),
              estabelecimento: ag.estabelecimento.nome,
            })}
          </p>
        )
      ) : null}
    </article>
  );
}

function DialogoCancelar({ ag, aoFechar }: { ag: AgendamentoLista | null; aoFechar: () => void }) {
  const t = useTranslations('meus.cancelarDialogo');
  const f = useFormatos(ag?.estabelecimento.fuso ?? 'UTC');
  const [motivo, setMotivo] = useState('');
  const mudar = useMudarStatus(ag?.estabelecimento.slug);
  const fechar = () => {
    setMotivo('');
    mudar.reset();
    aoFechar();
  };
  return (
    <Dialogo
      aberto={ag !== null}
      aoMudar={(v) => {
        if (!v) fechar();
      }}
      titulo={t('titulo')}
      largura="sm"
      descricao={
        ag === null
          ? undefined
          : t('descricao', {
              servico: ag.servico.nome,
              data: f.dataCurta(ag.inicio),
              hora: f.hora(ag.inicio),
            })
      }
      rodape={
        <>
          <Botao tamanho="lg" onClick={fechar}>
            {t('manter')}
          </Botao>
          <Botao
            variante="perigo"
            tamanho="lg"
            carregando={mudar.isPending}
            data-testid="confirmar-cancelamento"
            onClick={() => {
              if (ag === null) return;
              mudar.mutate(
                { id: ag.id, acao: 'cancelar', motivo },
                {
                  onSuccess: () => {
                    toast.success(t('sucesso'));
                    fechar();
                  },
                },
              );
            }}
          >
            {mudar.isPending ? t('cancelando') : t('confirmar')}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Campo id="motivo-cancelamento" rotulo={t('motivo')} dica={undefined}>
          <AreaDeTexto
            id="motivo-cancelamento"
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Campo>
        {ehErroApi(mudar.error) && ag !== null ? (
          <ErroDeRegra
            erro={mudar.error}
            contexto={{ estabelecimento: ag.estabelecimento.nome, fuso: ag.estabelecimento.fuso }}
          />
        ) : null}
      </div>
    </Dialogo>
  );
}
