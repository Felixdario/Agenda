'use client';

import type { AgendaPainel, AgendamentoLista } from '@agenda/shared';
import { Ban, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { AgendaGrade, corDaSerie } from '@/components/painel/agenda-grade';
import { DetalheAtendimento } from '@/components/painel/detalhe-atendimento';
import {
  DialogoBloqueio,
  DialogoConfirmar,
  DialogoRemarcarPainel,
  type PedidoDeBloqueio,
} from '@/components/painel/dialogos-agenda';
import { usePainel } from '@/components/painel/shell';
import { Botao, estiloBotao } from '@/components/ui/botao';
import { Entrada } from '@/components/ui/campo';
import { Carregando, EstadoErro, EstadoVazio, Esqueleto } from '@/components/ui/estados';
import { Folha } from '@/components/ui/folha';
import { useAgora } from '@/lib/agora';
import { useAgendaDoDia, useRemoverBloqueio, useRemoverExcecao } from '@/lib/consultas';
import { useFormatos } from '@/lib/formatos';
import { useMidia } from '@/lib/midia';
import { dataLocalDe, horaDeMinutos, somarDias } from '@/lib/tempo';

type Profissional = AgendaPainel['profissionais'][number];

export function AgendaDoDia() {
  const t = useTranslations();
  const { estab } = usePainel();
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const agora = useAgora();
  const hoje = agora === 0 ? null : dataLocalDe(agora, estab.fuso);
  const dataUrl = busca.get('data');
  const data = dataUrl !== null && /^\d{4}-\d{2}-\d{2}$/.test(dataUrl) ? dataUrl : hoje;
  const selecionadoId = busca.get('ag');
  const largo = useMidia('(min-width: 1280px)');

  const [bloqueio, setBloqueio] = useState<PedidoDeBloqueio | null>(null);
  const [removerBloqueio, setRemoverBloqueio] = useState<{ id: string; rotulo: string } | null>(
    null,
  );
  const [removerExcecao, setRemoverExcecao] = useState<{
    id: string;
    rotulo: string;
    profissional: string;
  } | null>(null);
  const [remarcando, setRemarcando] = useState<AgendamentoLista | null>(null);
  const remover = useRemoverBloqueio();
  const removerEx = useRemoverExcecao();

  const ir = (mudanca: { data?: string; ag?: string | null }) => {
    const p = new URLSearchParams(busca.toString());
    if (mudanca.data !== undefined) p.set('data', mudanca.data);
    if (mudanca.ag === null) p.delete('ag');
    else if (mudanca.ag !== undefined) p.set('ag', mudanca.ag);
    router.replace(`${caminho}?${p.toString()}`, { scroll: false });
  };

  return data === null ? (
    <Carregando>
      <Esqueleto className="h-9 w-64" />
    </Carregando>
  ) : (
    <Conteudo
      data={data}
      hoje={hoje}
      agora={agora}
      selecionadoId={selecionadoId}
      largo={largo}
      ir={ir}
      estabNome={estab.nome}
      granularidade={estab.politicas.granularidadeMin}
      aoBloquear={setBloqueio}
      aoRemoverBloqueio={setRemoverBloqueio}
      aoRemoverExcecao={setRemoverExcecao}
      aoRemarcar={setRemarcando}
      dialogos={(profissionais) => (
        <>
          <DialogoBloqueio
            pedido={bloqueio}
            profissionais={profissionais}
            aoFechar={() => setBloqueio(null)}
          />
          <DialogoRemarcarPainel
            a={remarcando}
            profissionais={profissionais}
            aoFechar={() => setRemarcando(null)}
          />
          <DialogoConfirmar
            aberto={removerBloqueio !== null}
            titulo={t('painel.bloqueio.removerTitulo')}
            descricao={removerBloqueio?.rotulo ?? ''}
            confirmar={t('comum.remover')}
            pendente={remover.isPending}
            erro={remover.error}
            aoFechar={() => {
              setRemoverBloqueio(null);
              remover.reset();
            }}
            aoConfirmar={() =>
              removerBloqueio !== null &&
              remover.mutate(removerBloqueio.id, {
                onSuccess: () => {
                  toast.success(t('painel.bloqueio.removido'));
                  setRemoverBloqueio(null);
                },
              })
            }
          />
          <DialogoConfirmar
            aberto={removerExcecao !== null}
            titulo={t('painel.bloqueio.removerExcecaoTitulo', {
              rotulo: removerExcecao?.rotulo ?? '',
            })}
            descricao={t('painel.bloqueio.removerExcecaoDescricao', {
              profissional: removerExcecao?.profissional ?? '',
            })}
            confirmar={t('comum.remover')}
            pendente={removerEx.isPending}
            erro={removerEx.error}
            aoFechar={() => {
              setRemoverExcecao(null);
              removerEx.reset();
            }}
            aoConfirmar={() =>
              removerExcecao !== null &&
              removerEx.mutate(removerExcecao.id, {
                onSuccess: () => {
                  toast.success(t('painel.bloqueio.excecaoRemovida'));
                  setRemoverExcecao(null);
                },
              })
            }
          />
        </>
      )}
    />
  );
}

function Conteudo({
  data,
  hoje,
  agora,
  selecionadoId,
  largo,
  ir,
  estabNome,
  granularidade,
  aoBloquear,
  aoRemoverBloqueio,
  aoRemoverExcecao,
  aoRemarcar,
  dialogos,
}: {
  data: string;
  hoje: string | null;
  agora: number;
  selecionadoId: string | null;
  largo: boolean;
  ir: (m: { data?: string; ag?: string | null }) => void;
  estabNome: string;
  granularidade: number;
  aoBloquear: (p: PedidoDeBloqueio) => void;
  aoRemoverBloqueio: (b: { id: string; rotulo: string }) => void;
  aoRemoverExcecao: (e: { id: string; rotulo: string; profissional: string }) => void;
  aoRemarcar: (a: AgendamentoLista) => void;
  dialogos: (profissionais: { id: string; nome: string }[]) => ReactNode;
}) {
  const t = useTranslations();
  const { estab, dono } = usePainel();
  const f = useFormatos(estab.fuso);
  const agenda = useAgendaDoDia(data);
  const ehHoje = data === hoje;
  const dados = agenda.data;
  const todos = dados?.profissionais.flatMap((p) => p.agendamentos) ?? [];
  const selecionado = todos.find((a) => a.id === selecionadoId) ?? null;
  const cancelados = todos.filter((a) => a.status === 'CANCELADO').length;
  const profissionais = dados?.profissionais.map((p) => p.profissional) ?? [];

  const detalhe =
    selecionado === null ? null : (
      <DetalheAtendimento
        a={selecionado}
        estabelecimento={estabNome}
        aoRemarcar={() => aoRemarcar(selecionado)}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="texto-28 font-bold">
            {ehHoje ? t('painel.agenda.tituloHoje') : t('painel.agenda.titulo')}
          </h1>
          <p className="texto-14 mt-1 text-muted">
            {f.frase(f.dataLocalLonga(data))}
            {cancelados > 0
              ? ` ${t('comum.separador')} ${t('painel.agenda.cancelados', { n: cancelados })}`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Botao
              tamanho="icone"
              variante="fantasma"
              aria-label={t('painel.agenda.anterior')}
              onClick={() => ir({ data: somarDias(data, -1), ag: null })}
            >
              <ChevronLeft aria-hidden className="size-5" />
            </Botao>
            <Botao
              variante="secundario"
              disabled={ehHoje || hoje === null}
              onClick={() => hoje !== null && ir({ data: hoje, ag: null })}
            >
              {t('painel.agenda.hoje')}
            </Botao>
            <Botao
              tamanho="icone"
              variante="fantasma"
              aria-label={t('painel.agenda.proximo')}
              onClick={() => ir({ data: somarDias(data, 1), ag: null })}
            >
              <ChevronRight aria-hidden className="size-5" />
            </Botao>
          </div>
          <label className="sr-only" htmlFor="data-agenda">
            {t('painel.agenda.data')}
          </label>
          <div className="w-[164px]">
            <Entrada
              id="data-agenda"
              type="date"
              value={data}
              onChange={(e) => {
                if (e.target.value !== '') ir({ data: e.target.value, ag: null });
              }}
            />
          </div>
          <Botao
            icone={<Ban aria-hidden className="size-4" />}
            disabled={profissionais.length === 0}
            onClick={() =>
              profissionais[0] !== undefined &&
              aoBloquear({
                profissionalId: profissionais[0].id,
                data,
                inicio: '12:00',
                fim: '13:00',
              })
            }
          >
            {t('painel.agenda.bloquear')}
          </Botao>
          <Link
            href={`/painel/encaixe?data=${data}`}
            className={estiloBotao({ variante: 'primario', tamanho: 'md' })}
          >
            <CalendarPlus aria-hidden className="size-4" />
            {t('painel.agenda.novoEncaixe')}
          </Link>
        </div>
      </header>

      <Legenda profissionais={profissionais} />

      {dados === undefined ? (
        agenda.isError ? (
          <EstadoErro erro={agenda.error} aoTentar={() => void agenda.refetch()} />
        ) : (
          <Carregando>
            <div className="h-[560px] rounded-card border border-border bg-surface p-4">
              <div className="grid grid-cols-[56px_1fr_1fr_1fr] gap-3">
                <span />
                {[0, 1, 2].map((i) => (
                  <Esqueleto key={i} className="h-10" />
                ))}
              </div>
            </div>
          </Carregando>
        )
      ) : (
        <>
          {agenda.isError ? (
            <EstadoErro erro={agenda.error} temDados aoTentar={() => void agenda.refetch()} />
          ) : null}
          {dados.profissionais.length === 0 ? (
            <EstadoVazio
              acao={
                dono ? (
                  <Link
                    href="/painel/profissionais"
                    className={estiloBotao({ variante: 'secundario', tamanho: 'md' })}
                  >
                    {t('painel.profissionais.novo')}
                  </Link>
                ) : undefined
              }
            >
              {t('painel.agenda.semProfissionais')}
            </EstadoVazio>
          ) : (
            <div
              className={
                largo && selecionado !== null ? 'grid grid-cols-[minmax(0,1fr)_360px] gap-4' : ''
              }
            >
              <div className="flex min-w-0 flex-col gap-2">
                <AgendaGrade
                  agenda={dados}
                  agora={ehHoje ? agora : null}
                  granularidade={granularidade}
                  selecionado={selecionadoId}
                  aoAbrir={(a) => ir({ ag: a.id })}
                  aoBloqueio={(b, p) =>
                    aoRemoverBloqueio({
                      id: b.id,
                      rotulo: t('painel.bloqueio.removerDescricao', {
                        inicio: f.hora(b.inicio),
                        fim: f.hora(b.fim),
                        profissional: p.profissional.nome,
                      }),
                    })
                  }
                  aoSelecionar={({ profissional, inicioMin, fimMin }) =>
                    aoBloquear({
                      profissionalId: profissional.profissional.id,
                      data,
                      inicio: horaDeMinutos(inicioMin),
                      fim: horaDeMinutos(fimMin),
                    })
                  }
                  aoRemoverExcecao={(e, p: Profissional) =>
                    aoRemoverExcecao({
                      id: e.id,
                      rotulo:
                        e.tipo === 'FERIADO'
                          ? t('painel.agenda.feriado')
                          : e.tipo === 'HORARIO_EXTRA'
                            ? t('painel.agenda.horarioExtra', {
                                inicio: e.inicio ?? '',
                                fim: e.fim ?? '',
                              })
                            : e.inicio === null || e.fim === null
                              ? t('painel.agenda.folga')
                              : t('painel.agenda.folgaParcial', { inicio: e.inicio, fim: e.fim }),
                      profissional: p.profissional.nome,
                    })
                  }
                />
                <p className="texto-12 text-muted">
                  {todos.length === 0 ? `${t('painel.agenda.vazio')} ` : null}
                  {t('painel.agenda.selecionarDica')}
                </p>
              </div>
              {largo && selecionado !== null ? (
                <aside
                  aria-label={t('painel.detalhe.titulo')}
                  className="sticky top-6 max-h-[calc(100dvh-48px)] self-start overflow-y-auto rounded-card border border-border bg-surface p-5"
                >
                  {detalhe}
                </aside>
              ) : null}
            </div>
          )}
        </>
      )}

      {largo ? null : (
        <Folha
          aberta={selecionado !== null}
          aoMudar={(v) => {
            if (!v) ir({ ag: null });
          }}
          titulo={t('painel.detalhe.titulo')}
        >
          <div className="pb-6">{detalhe}</div>
        </Folha>
      )}
      {dialogos(profissionais)}
    </div>
  );
}

function Legenda({ profissionais }: { profissionais: { id: string; nome: string }[] }) {
  const t = useTranslations('painel.agenda.legenda');
  return (
    <ul
      aria-label={t('rotulo')}
      className="texto-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted"
    >
      {profissionais.map((p, i) => (
        <li key={p.id} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ background: corDaSerie(i) }} />
          {p.nome}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="hachura inline-block size-3 rounded-[4px]" />
        {t('preparo')}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block size-3 rounded-[4px] border border-dashed border-muted"
        />
        {t('bloqueio')}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-0.5 w-3 bg-accent" />
        {t('agora')}
      </li>
    </ul>
  );
}
