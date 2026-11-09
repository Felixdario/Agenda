'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ProfissionalPainel } from '@agenda/shared';
import { Clock3, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { Iniciais } from '@/components/comum/iniciais';
import { usePainel } from '@/components/painel/shell';
import { Botao } from '@/components/ui/botao';
import { Campo, Entrada } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Carregando, EstadoErro, EstadoVazio, Esqueleto } from '@/components/ui/estados';
import {
  useJornada,
  useProfissionaisPainel,
  useSalvarJornada,
  useSalvarProfissional,
  useServicosPainel,
} from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';

const DIAS = ['1', '2', '3', '4', '5', '6', '7'] as const;

export default function Page() {
  const { dono, eu } = usePainel();
  if (!dono) {
    const id = eu.usuario.profissionalId;
    return id === null ? null : (
      <EditorDeJornada profissionalId={id} nome={eu.usuario.nome} embutido />
    );
  }
  return <ListaProfissionais />;
}

function ListaProfissionais() {
  const t = useTranslations('painel.profissionais');
  const tc = useTranslations('comum');
  const tj = useTranslations('painel.jornada');
  const profissionais = useProfissionaisPainel();
  const servicos = useServicosPainel();
  const [editando, setEditando] = useState<ProfissionalPainel | 'novo' | null>(null);
  const [jornada, setJornada] = useState<ProfissionalPainel | null>(null);
  const nomeDoServico = new Map((servicos.data ?? []).map((s) => [s.id, s.nome]));

  return (
    <div className="flex max-w-[1100px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="texto-28 font-bold">{t('titulo')}</h1>
          {profissionais.data === undefined ? null : (
            <p className="texto-14 num mt-1 text-muted">
              {t('total', { n: profissionais.data.length })}
            </p>
          )}
        </div>
        <Botao
          variante="primario"
          icone={<Plus aria-hidden className="size-4" />}
          onClick={() => setEditando('novo')}
        >
          {t('novo')}
        </Botao>
      </header>
      {profissionais.data === undefined ? (
        profissionais.isError ? (
          <EstadoErro erro={profissionais.error} aoTentar={() => void profissionais.refetch()} />
        ) : (
          <Carregando className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-[88px] w-full rounded-card" />
            ))}
          </Carregando>
        )
      ) : profissionais.data.length === 0 ? (
        <EstadoVazio>{t('vazio')}</EstadoVazio>
      ) : (
        <ul className="divide-y divide-rule rounded-card border border-border bg-surface">
          {profissionais.data.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Iniciais nome={p.nome} />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="texto-16 flex items-center gap-2 font-semibold">
                    {p.nome}
                    {p.ativo ? null : (
                      <span className="texto-12 inline-flex h-6 items-center rounded-full bg-raised px-2.5 font-medium text-muted">
                        {tc('inativo')}
                      </span>
                    )}
                  </p>
                  <ul aria-label={t('servicos')} className="flex flex-wrap gap-1.5">
                    {p.servicoIds.length === 0 ? (
                      <li className="texto-12 text-muted">{t('semServicos')}</li>
                    ) : (
                      p.servicoIds.map((id) => (
                        <li
                          key={id}
                          className="texto-12 inline-flex h-6 items-center rounded-full border border-border px-2.5 text-muted"
                        >
                          {nomeDoServico.get(id) ?? tc('nenhum')}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
              <div className="flex gap-2 sm:shrink-0">
                <Botao
                  icone={<Clock3 aria-hidden className="size-4" />}
                  onClick={() => setJornada(p)}
                >
                  {t('jornada')}
                </Botao>
                <Botao
                  icone={<Pencil aria-hidden className="size-4" />}
                  onClick={() => setEditando(p)}
                >
                  {t('editar')}
                </Botao>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editando === null ? null : (
        <FormProfissional
          key={editando === 'novo' ? 'novo' : editando.id}
          profissional={editando}
          servicos={servicos.data ?? []}
          aoFechar={() => setEditando(null)}
        />
      )}
      {jornada === null ? null : (
        <Dialogo
          aberto
          aoMudar={(v) => {
            if (!v) setJornada(null);
          }}
          titulo={tj('titulo', { nome: jornada.nome })}
          largura="lg"
        >
          <EditorDeJornada
            profissionalId={jornada.id}
            nome={jornada.nome}
            aoSalvar={() => setJornada(null)}
          />
        </Dialogo>
      )}
    </div>
  );
}

const esquemaProfissional = z.object({
  nome: z.string().trim().min(1).max(120),
  ativo: z.boolean(),
  servicoIds: z.array(z.string()),
});

function FormProfissional({
  profissional,
  servicos,
  aoFechar,
}: {
  profissional: ProfissionalPainel | 'novo';
  servicos: { id: string; nome: string }[];
  aoFechar: () => void;
}) {
  const t = useTranslations('painel.profissionais');
  const tc = useTranslations('comum');
  const novo = profissional === 'novo';
  const salvar = useSalvarProfissional();
  const form = useForm({
    resolver: zodResolver(esquemaProfissional),
    defaultValues: novo
      ? { nome: '', ativo: true, servicoIds: [] as string[] }
      : { nome: profissional.nome, ativo: profissional.ativo, servicoIds: profissional.servicoIds },
  });
  const enviar = form.handleSubmit((v) =>
    salvar.mutate(
      { ...(novo ? {} : { id: profissional.id }), dados: v },
      {
        onSuccess: () => {
          toast.success(t('salvo'));
          aoFechar();
        },
      },
    ),
  );
  return (
    <Dialogo
      aberto
      aoMudar={(v) => {
        if (!v) aoFechar();
      }}
      titulo={novo ? t('dialogo.tituloNovo') : t('dialogo.tituloEditar')}
      rodape={
        <>
          <Botao onClick={aoFechar}>{tc('cancelar')}</Botao>
          <Botao
            variante="primario"
            carregando={salvar.isPending}
            exigeRede
            onClick={() => void enviar()}
          >
            {salvar.isPending ? tc('salvando') : tc('salvar')}
          </Botao>
        </>
      }
    >
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <Campo id="p-nome" rotulo={t('dialogo.nome')} erro={form.formState.errors.nome?.message}>
          <Entrada id="p-nome" {...form.register('nome')} />
        </Campo>
        <label className="texto-14 flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            {...form.register('ativo')}
          />
          {t('dialogo.ativo')}
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="texto-14 mb-2 font-medium">{t('dialogo.servicos')}</legend>
          {servicos.map((s) => (
            <label key={s.id} className="texto-14 flex min-h-8 items-center gap-2">
              <input
                type="checkbox"
                value={s.id}
                className="size-4 accent-[var(--primary)]"
                {...form.register('servicoIds')}
              />
              {s.nome}
            </label>
          ))}
        </fieldset>
        {ehErroApi(salvar.error) ? <ErroDeRegra erro={salvar.error} /> : null}
        <button type="submit" hidden />
      </form>
    </Dialogo>
  );
}

type Dias = Record<string, { inicio: string; fim: string }[]>;

/** Editor da jornada semanal: intervalos por dia da semana (RN-03), validados pela API. */
function EditorDeJornada({
  profissionalId,
  nome,
  embutido = false,
  aoSalvar,
}: {
  profissionalId: string;
  nome: string;
  embutido?: boolean;
  aoSalvar?: () => void;
}) {
  const t = useTranslations('painel.jornada');
  const jornada = useJornada(profissionalId);
  const conteudo =
    jornada.data === undefined ? (
      jornada.isError ? (
        <EstadoErro erro={jornada.error} aoTentar={() => void jornada.refetch()} />
      ) : (
        <Carregando className="flex flex-col gap-2">
          {DIAS.map((d) => (
            <Esqueleto key={d} className="h-10 w-full" />
          ))}
        </Carregando>
      )
    ) : (
      <FormJornada
        profissionalId={profissionalId}
        inicial={jornada.data.dias}
        {...(aoSalvar === undefined ? {} : { aoSalvar })}
      />
    );
  if (!embutido) return conteudo;
  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <header>
        <h1 className="texto-28 font-bold">{t('titulo', { nome })}</h1>
        <p className="texto-14 mt-1 text-muted">{t('descricao')}</p>
      </header>
      <div className="rounded-card border border-border bg-surface p-5">{conteudo}</div>
    </div>
  );
}

function FormJornada({
  profissionalId,
  inicial,
  aoSalvar,
}: {
  profissionalId: string;
  inicial: Dias;
  aoSalvar?: () => void;
}) {
  const t = useTranslations('painel.jornada');
  const [dias, setDias] = useState<Dias>(() =>
    Object.fromEntries(DIAS.map((d) => [d, inicial[d] ?? []])),
  );
  const salvar = useSalvarJornada();
  const mudar = (dia: string, i: number, campo: 'inicio' | 'fim', valor: string) =>
    setDias({
      ...dias,
      [dia]: (dias[dia] ?? []).map((tr, j) => (j === i ? { ...tr, [campo]: valor } : tr)),
    });

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-rule">
        {DIAS.map((d) => {
          const trechos = dias[d] ?? [];
          return (
            <li key={d} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <span className="texto-14 w-24 shrink-0 pt-2.5 font-medium">{t(`dias.${d}`)}</span>
              <div className="flex flex-1 flex-col gap-2">
                {trechos.length === 0 ? (
                  <span className="texto-14 pt-2.5 text-muted">{t('semExpediente')}</span>
                ) : null}
                {trechos.map((tr, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Entrada
                      type="time"
                      aria-label={`${t(`dias.${d}`)} ${t('inicio')}`}
                      value={tr.inicio}
                      step={300}
                      onChange={(e) => mudar(d, i, 'inicio', e.target.value)}
                      className="num max-w-[130px]"
                    />
                    <Entrada
                      type="time"
                      aria-label={`${t(`dias.${d}`)} ${t('fim')}`}
                      value={tr.fim}
                      step={300}
                      onChange={(e) => mudar(d, i, 'fim', e.target.value)}
                      className="num max-w-[130px]"
                    />
                    <Botao
                      variante="fantasma"
                      tamanho="iconeSm"
                      aria-label={t('removerIntervalo')}
                      onClick={() => setDias({ ...dias, [d]: trechos.filter((_, j) => j !== i) })}
                    >
                      <Trash2 aria-hidden className="size-4 text-muted" />
                    </Botao>
                  </div>
                ))}
              </div>
              <Botao
                variante="link"
                tamanho="sm"
                className="texto-14 self-start sm:pt-2"
                disabled={trechos.length >= 6}
                onClick={() => {
                  const ultimo = trechos.at(-1);
                  setDias({
                    ...dias,
                    [d]: [
                      ...trechos,
                      ultimo === undefined
                        ? { inicio: '09:00', fim: '18:00' }
                        : { inicio: ultimo.fim, fim: ultimo.fim },
                    ],
                  });
                }}
              >
                {t('adicionar')}
              </Botao>
            </li>
          );
        })}
      </ul>
      {ehErroApi(salvar.error) ? <ErroDeRegra erro={salvar.error} /> : null}
      <div className="flex justify-end">
        <Botao
          variante="primario"
          carregando={salvar.isPending}
          exigeRede
          onClick={() =>
            salvar.mutate(
              {
                profissionalId,
                dias: Object.fromEntries(Object.entries(dias).filter(([, trs]) => trs.length > 0)),
              },
              {
                onSuccess: () => {
                  toast.success(t('salva'));
                  aoSalvar?.();
                },
              },
            )
          }
        >
          {t('salvar')}
        </Botao>
      </div>
    </div>
  );
}
