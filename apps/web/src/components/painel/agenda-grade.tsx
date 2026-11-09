'use client';

import type { AgendaPainel, AgendamentoLista } from '@agenda/shared';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type CSSProperties, type PointerEvent, useRef, useState } from 'react';
import { MarcaDoStatus } from '@/components/comum/status';
import { cn } from '@/lib/cn';
import { useFormatos } from '@/lib/formatos';
import { PX_POR_MINUTO, faixaDoDia, fimLocal, naGrade } from '@/lib/grade-agenda';
import { horaDeMinutos, minutosDoDia } from '@/lib/tempo';

const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)'];
export const corDaSerie = (i: number) => SERIES[i % SERIES.length]!;

type Profissional = AgendaPainel['profissionais'][number];
type Bloqueio = Profissional['bloqueios'][number];
type Excecao = Profissional['excecoes'][number];

export interface SelecaoDeIntervalo {
  profissionalId: string;
  inicio: string;
  fim: string;
}

/**
 * Agenda do dia em grade própria: colunas por profissional e eixo de horas em tabular.
 * Atendimentos mostram o bloco (preparo e limpeza hachurados), bloqueios são tracejados e a linha
 * do "agora" usa o acento. Arrastar numa área vazia seleciona um intervalo para bloquear.
 */
export function AgendaGrade({
  agenda,
  agora,
  granularidade,
  selecionado,
  aoAbrir,
  aoBloqueio,
  aoSelecionar,
  aoRemoverExcecao,
}: {
  agenda: AgendaPainel;
  /** Instante atual; a linha do agora só aparece no dia de hoje. */
  agora: number | null;
  granularidade: number;
  selecionado: string | null;
  aoAbrir: (a: AgendamentoLista) => void;
  aoBloqueio: (b: Bloqueio, profissional: Profissional) => void;
  aoSelecionar: (s: { profissional: Profissional; inicioMin: number; fimMin: number }) => void;
  aoRemoverExcecao: (e: Excecao, profissional: Profissional) => void;
}) {
  const t = useTranslations('painel.agenda');
  const f = useFormatos(agenda.fuso);
  const faixa = faixaDoDia(agenda);
  const altura = (faixa.fim - faixa.inicio) * PX_POR_MINUTO;
  const horas = Array.from(
    { length: (faixa.fim - faixa.inicio) / 60 + 1 },
    (_, i) => faixa.inicio + i * 60,
  );
  const y = (min: number) => (min - faixa.inicio) * PX_POR_MINUTO;
  const minutoAgora = agora === null ? null : minutosDoDia(agora, agenda.fuso);
  const mostraAgora =
    minutoAgora !== null && minutoAgora >= faixa.inicio && minutoAgora <= faixa.fim;
  const colunas = `56px repeat(${agenda.profissionais.length}, minmax(176px, 1fr))`;

  return (
    <div
      className="max-h-[calc(100dvh-210px)] min-h-[420px] overflow-auto rounded-card border border-border bg-surface"
      data-testid="agenda-grade"
    >
      <div className="grid min-w-max" style={{ gridTemplateColumns: colunas }}>
        {/* Cabeçalho fixo */}
        <div className="sticky top-0 left-0 z-30 border-b border-border bg-surface" />
        {agenda.profissionais.map((p, i) => (
          <CabecalhoColuna
            key={p.profissional.id}
            p={p}
            cor={corDaSerie(i)}
            aoRemoverExcecao={(e) => aoRemoverExcecao(e, p)}
          />
        ))}

        {/* Eixo de horas */}
        <div
          className="sticky left-0 z-20 border-r border-rule bg-surface"
          style={{ height: altura }}
        >
          <div className="relative h-full">
            {horas.map((h) => (
              <span
                key={h}
                className="texto-12 num absolute right-2 -translate-y-1/2 font-medium text-muted first:translate-y-0"
                style={{ top: y(h) }}
              >
                {h === 24 * 60 ? null : horaDeMinutos(h)}
              </span>
            ))}
            {mostraAgora ? (
              <span
                className="texto-12 num absolute right-1 z-10 -translate-y-1/2 rounded-full bg-accent px-1.5 font-semibold text-[var(--surface)]"
                style={{ top: y(minutoAgora) }}
                aria-label={t('agoraRotulo', { hora: horaDeMinutos(minutoAgora) })}
              >
                {horaDeMinutos(minutoAgora)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Colunas */}
        {agenda.profissionais.map((p) => (
          <Coluna
            key={p.profissional.id}
            p={p}
            altura={altura}
            horas={horas}
            y={y}
            faixa={faixa}
            fuso={agenda.fuso}
            granularidade={granularidade}
            minutoAgora={mostraAgora ? minutoAgora : null}
            selecionado={selecionado}
            aoAbrir={aoAbrir}
            aoBloqueio={(b) => aoBloqueio(b, p)}
            aoSelecionar={(inicioMin, fimMin) =>
              aoSelecionar({ profissional: p, inicioMin, fimMin })
            }
            f={f}
          />
        ))}
      </div>
    </div>
  );
}

function rotuloExcecao(e: Excecao, t: ReturnType<typeof useTranslations<'painel.agenda'>>) {
  if (e.tipo === 'FERIADO') return t('feriado');
  if (e.tipo === 'HORARIO_EXTRA')
    return t('horarioExtra', { inicio: e.inicio ?? '', fim: e.fim ?? '' });
  return e.inicio === null || e.fim === null
    ? t('folga')
    : t('folgaParcial', { inicio: e.inicio, fim: e.fim });
}

function CabecalhoColuna({
  p,
  cor,
  aoRemoverExcecao,
}: {
  p: Profissional;
  cor: string;
  aoRemoverExcecao: (e: Excecao) => void;
}) {
  const t = useTranslations('painel.agenda');
  const ativos = p.agendamentos.filter((a) => a.status !== 'CANCELADO').length;
  return (
    <div
      className="sticky top-0 z-10 flex min-h-16 flex-col justify-center gap-1 border-b border-l border-border border-l-rule bg-surface px-3 py-2"
      style={{ boxShadow: `inset 0 2px 0 ${cor}` }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: cor }} />
        <span className="texto-14 truncate font-semibold">{p.profissional.nome}</span>
      </div>
      <span className="texto-12 num text-muted">
        {p.expediente.length === 0 ? t('semExpediente') : t('resumo', { atendimentos: ativos })}
      </span>
      {p.excecoes.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {p.excecoes.map((e) => {
            const rotulo = rotuloExcecao(e, t);
            return (
              <li key={e.id}>
                <span className="texto-12 inline-flex h-6 items-center gap-1 rounded-full bg-warning-bg pr-1 pl-2 font-medium text-warning">
                  {rotulo}
                  <button
                    type="button"
                    onClick={() => aoRemoverExcecao(e)}
                    aria-label={t('removerExcecao', { rotulo })}
                    className="inline-flex size-5 items-center justify-center rounded-full hover:bg-[var(--warning-line)]"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Coluna({
  p,
  altura,
  horas,
  y,
  faixa,
  fuso,
  granularidade,
  minutoAgora,
  selecionado,
  aoAbrir,
  aoBloqueio,
  aoSelecionar,
  f,
}: {
  p: Profissional;
  altura: number;
  horas: number[];
  y: (min: number) => number;
  faixa: { inicio: number; fim: number };
  fuso: string;
  granularidade: number;
  minutoAgora: number | null;
  selecionado: string | null;
  aoAbrir: (a: AgendamentoLista) => void;
  aoBloqueio: (b: Bloqueio) => void;
  aoSelecionar: (inicioMin: number, fimMin: number) => void;
  f: ReturnType<typeof useFormatos>;
}) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  const [arraste, setArraste] = useState<{ de: number; ate: number } | null>(null);

  const minutoDoPonteiro = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const min = faixa.inicio + (e.clientY - r.top) / PX_POR_MINUTO;
    return Math.max(faixa.inicio, Math.min(faixa.fim, naGrade(min, granularidade)));
  };

  const ativos = p.agendamentos.filter((a) => a.status !== 'CANCELADO');

  return (
    <div
      ref={ref}
      className="relative touch-pan-y border-l border-rule bg-ground select-none"
      style={{ height: altura }}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset['fundo']) return;
        if (e.button !== 0) return;
        const m = minutoDoPonteiro(e);
        e.currentTarget.setPointerCapture(e.pointerId);
        setArraste({ de: m, ate: m + granularidade });
      }}
      onPointerMove={(e) => {
        if (arraste === null) return;
        const m = minutoDoPonteiro(e);
        setArraste({ de: arraste.de, ate: Math.max(arraste.de + granularidade, m) });
      }}
      onPointerUp={() => {
        if (arraste === null) return;
        aoSelecionar(arraste.de, Math.min(faixa.fim, arraste.ate));
        setArraste(null);
      }}
      onPointerCancel={() => setArraste(null)}
    >
      {/* Expediente: superfície clara; fora dele, o fundo. */}
      {p.expediente.map((tr) => {
        const de = minutosDoDia(tr.inicio, fuso);
        const ate = fimLocal(tr.fim, tr.inicio, fuso);
        return (
          <div
            key={tr.inicio}
            data-fundo="1"
            className="absolute inset-x-0 bg-surface"
            style={{ top: y(de), height: (ate - de) * PX_POR_MINUTO }}
          />
        );
      })}
      {horas.map((h) => (
        <div
          key={h}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-rule"
          style={{ top: y(h) }}
        />
      ))}

      {p.bloqueios.map((b) => {
        const de = minutosDoDia(b.inicio, fuso);
        const ate = fimLocal(b.fim, b.inicio, fuso);
        const rotulo = t('painel.agenda.bloqueioRotulo', {
          inicio: f.hora(b.inicio),
          fim: f.hora(b.fim),
        });
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => aoBloqueio(b)}
            aria-label={b.motivo === null ? rotulo : `${rotulo}. ${b.motivo}`}
            className="texto-12 absolute inset-x-1.5 z-[1] flex flex-col items-start overflow-hidden rounded-[10px] border border-dashed border-control bg-ground px-2 py-1 text-left text-muted hover:border-muted"
            style={{ top: y(de) + 1, height: Math.max(20, (ate - de) * PX_POR_MINUTO - 2) }}
          >
            <span className="num font-medium">{f.intervalo(b.inicio, b.fim)}</span>
            <span className="truncate">{b.motivo ?? t('painel.agenda.bloqueio')}</span>
          </button>
        );
      })}

      {ativos.map((a) => (
        <CartaoNaGrade
          key={a.id}
          a={a}
          y={y}
          fuso={fuso}
          f={f}
          selecionado={selecionado === a.id}
          aoAbrir={aoAbrir}
        />
      ))}

      {arraste === null ? null : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 z-[3] flex items-start rounded-[10px] border border-dashed border-accent bg-accent-soft px-2 py-1"
          style={{ top: y(arraste.de), height: (arraste.ate - arraste.de) * PX_POR_MINUTO }}
        >
          <span className="texto-12 num font-semibold text-accent">
            {t('comum.intervalo', {
              inicio: horaDeMinutos(arraste.de),
              fim: horaDeMinutos(arraste.ate),
            })}
          </span>
        </div>
      )}

      {minutoAgora === null ? null : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-[4] h-0.5 bg-accent"
          style={{ top: y(minutoAgora) - 1 } as CSSProperties}
        />
      )}
    </div>
  );
}

function CartaoNaGrade({
  a,
  y,
  fuso,
  f,
  selecionado,
  aoAbrir,
}: {
  a: AgendamentoLista;
  y: (min: number) => number;
  fuso: string;
  f: ReturnType<typeof useFormatos>;
  selecionado: boolean;
  aoAbrir: (a: AgendamentoLista) => void;
}) {
  const t = useTranslations();
  const deBloco = minutosDoDia(a.inicioBloco, fuso);
  const ateBloco = fimLocal(a.fimBloco, a.inicioBloco, fuso);
  const preparo = a.servico.preparoMin * PX_POR_MINUTO;
  const limpeza = a.servico.limpezaMin * PX_POR_MINUTO;
  const alturaTotal = (ateBloco - deBloco) * PX_POR_MINUTO;
  const encerrado = a.status === 'CONCLUIDO' || a.status === 'NAO_COMPARECEU';
  const conteudo = alturaTotal - preparo - limpeza;
  const curto = conteudo < 36;
  const medio = conteudo < 60;
  return (
    <button
      type="button"
      onClick={() => aoAbrir(a)}
      data-agendamento={a.id}
      aria-pressed={selecionado}
      aria-label={t('painel.agenda.atendimentoRotulo', {
        hora: f.intervalo(a.inicio, a.fim),
        cliente: a.cliente.nome,
        servico: a.servico.nome,
        status: t(`status.${a.status}`),
      })}
      className={cn(
        'absolute inset-x-1.5 z-[2] flex flex-col overflow-hidden rounded-[10px] border text-left transition-[border-color,box-shadow] duration-150',
        selecionado
          ? 'border-accent shadow-[0_0_0_1px_var(--accent)]'
          : 'border-control hover:border-muted',
        encerrado ? 'bg-ground' : 'bg-surface',
      )}
      style={{ top: y(deBloco) + 1, height: Math.max(22, alturaTotal - 2) }}
    >
      {preparo > 0 ? (
        <span aria-hidden className="hachura block shrink-0" style={{ height: preparo }} />
      ) : null}
      <span
        className={cn(
          'flex min-h-0 flex-1 gap-x-2 overflow-hidden px-2',
          curto ? 'flex-row items-center' : 'flex-col justify-start py-1',
        )}
      >
        <span className="texto-12 num flex shrink-0 items-center gap-1.5 font-semibold text-text">
          <MarcaDoStatus
            status={a.status}
            className={a.status === 'PENDENTE' ? 'text-warning' : 'text-positive'}
          />
          {f.intervalo(a.inicio, a.fim)}
        </span>
        <span
          className={cn(
            'texto-12 truncate font-medium',
            encerrado && 'text-muted',
            a.status === 'NAO_COMPARECEU' && 'line-through',
          )}
        >
          {a.cliente.nome}
        </span>
        {medio ? null : <span className="texto-12 truncate text-muted">{a.servico.nome}</span>}
        {medio || a.status === 'CONFIRMADO' ? null : (
          <span className="texto-12 truncate text-muted">{t(`status.${a.status}`)}</span>
        )}
      </span>
      {limpeza > 0 ? (
        <span aria-hidden className="hachura block shrink-0" style={{ height: limpeza }} />
      ) : null}
    </button>
  );
}
