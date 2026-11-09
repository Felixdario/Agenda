'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ServicoPainel } from '@agenda/shared';
import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { usePainel } from '@/components/painel/shell';
import { Botao } from '@/components/ui/botao';
import { Campo, Entrada } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Carregando, EstadoErro, EstadoVazio, Esqueleto } from '@/components/ui/estados';
import { cn } from '@/lib/cn';
import { useSalvarServico, useServicosPainel } from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';

export default function Page() {
  const t = useTranslations('painel.servicos');
  const tc = useTranslations('comum');
  const { estab } = usePainel();
  const f = useFormatos(estab.fuso);
  const servicos = useServicosPainel();
  const [editando, setEditando] = useState<ServicoPainel | 'novo' | null>(null);

  return (
    <div className="flex max-w-[1100px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="texto-28 font-bold">{t('titulo')}</h1>
          {servicos.data === undefined ? null : (
            <p className="texto-14 num mt-1 text-muted">
              {t('total', { n: servicos.data.length })}
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

      {servicos.data === undefined ? (
        servicos.isError ? (
          <EstadoErro erro={servicos.error} aoTentar={() => void servicos.refetch()} />
        ) : (
          <Carregando className="rounded-card border border-border bg-surface">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="flex h-12 items-center gap-6 border-b border-rule px-5 last:border-0"
              >
                <Esqueleto className="h-4 w-40" />
                <Esqueleto className="ml-auto h-4 w-16" />
                <Esqueleto className="h-4 w-16" />
              </div>
            ))}
          </Carregando>
        )
      ) : servicos.data.length === 0 ? (
        <EstadoVazio>{t('vazio')}</EstadoVazio>
      ) : (
        <>
          {servicos.isError ? (
            <EstadoErro erro={servicos.error} temDados aoTentar={() => void servicos.refetch()} />
          ) : null}
          {/* Tabela no desktop */}
          <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="texto-12 border-b border-border text-muted">
                  <th scope="col" className="h-10 px-5 text-left font-normal">
                    {t('colunas.nome')}
                  </th>
                  <th scope="col" className="px-3 text-right font-normal">
                    {t('colunas.duracao')}
                  </th>
                  <th scope="col" className="px-3 text-right font-normal">
                    {t('colunas.preparo')}
                  </th>
                  <th scope="col" className="px-3 text-right font-normal">
                    {t('colunas.limpeza')}
                  </th>
                  <th scope="col" className="px-3 text-right font-normal">
                    {t('colunas.preco')}
                  </th>
                  <th scope="col" className="px-3 text-left font-normal">
                    {t('colunas.situacao')}
                  </th>
                  <th scope="col" className="w-16 px-3">
                    <span className="sr-only">{t('colunas.acoes')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {servicos.data.map((s) => (
                  <tr key={s.id} className="texto-14 border-b border-rule last:border-0">
                    <td className="h-12 px-5 font-medium">{s.nome}</td>
                    <td className="num px-3 text-right">{f.duracao(s.duracaoMin)}</td>
                    <td className="num px-3 text-right text-muted">{f.duracao(s.preparoMin)}</td>
                    <td className="num px-3 text-right text-muted">{f.duracao(s.limpezaMin)}</td>
                    <td className="num px-3 text-right font-medium">{f.preco(s.precoCentavos)}</td>
                    <td className="px-3">
                      <Situacao ativo={s.ativo} />
                    </td>
                    <td className="px-3 text-right">
                      <Botao
                        variante="fantasma"
                        tamanho="iconeSm"
                        aria-label={`${tc('editar')} ${s.nome}`}
                        onClick={() => setEditando(s)}
                      >
                        <Pencil aria-hidden className="size-4 text-muted" />
                      </Botao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Lista de duas linhas no celular */}
          <ul className="divide-y divide-rule rounded-card border border-border bg-surface md:hidden">
            {servicos.data.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setEditando(s)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="texto-14 font-medium">{s.nome}</span>
                    <span className="texto-12 num text-muted">
                      {[
                        f.duracao(s.duracaoMin),
                        `${t('colunas.preparo')} ${f.duracao(s.preparoMin)}`,
                        `${t('colunas.limpeza')} ${f.duracao(s.limpezaMin)}`,
                      ].join(` ${tc('separador')} `)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="texto-14 num font-medium">{f.preco(s.precoCentavos)}</span>
                    <Situacao ativo={s.ativo} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <DialogoServico servico={editando} aoFechar={() => setEditando(null)} />
    </div>
  );
}

function Situacao({ ativo }: { ativo: boolean }) {
  const t = useTranslations('comum');
  return (
    <span
      className={cn(
        'texto-12 inline-flex h-6 flex-none items-center gap-1.5 rounded-full px-2.5 font-medium whitespace-nowrap',
        ativo ? 'bg-positive-bg text-positive' : 'bg-raised text-muted',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          ativo ? 'bg-current' : 'border-[1.5px] border-current',
        )}
      />
      {ativo ? t('ativo') : t('inativo')}
    </span>
  );
}

const esquema = z.object({
  nome: z.string().trim().min(1).max(120),
  duracaoMin: z.coerce.number<string>().int().min(5).max(480),
  preco: z.coerce.number<string>().min(0).max(100_000),
  preparoMin: z.coerce.number<string>().int().min(0).max(120),
  limpezaMin: z.coerce.number<string>().int().min(0).max(120),
  ativo: z.boolean(),
});
type Entrada_ = z.input<typeof esquema>;
type Saida = z.output<typeof esquema>;

function DialogoServico({
  servico,
  aoFechar,
}: {
  servico: ServicoPainel | 'novo' | null;
  aoFechar: () => void;
}) {
  return servico === null ? null : (
    <FormServico
      key={servico === 'novo' ? 'novo' : servico.id}
      servico={servico}
      aoFechar={aoFechar}
    />
  );
}

function FormServico({
  servico,
  aoFechar,
}: {
  servico: ServicoPainel | 'novo';
  aoFechar: () => void;
}) {
  const t = useTranslations('painel.servicos');
  const tc = useTranslations('comum');
  const salvar = useSalvarServico();
  const novo = servico === 'novo';
  const form = useForm<Entrada_, unknown, Saida>({
    resolver: zodResolver(esquema),
    defaultValues: novo
      ? { nome: '', duracaoMin: '30', preco: '0', preparoMin: '0', limpezaMin: '0', ativo: true }
      : {
          nome: servico.nome,
          duracaoMin: String(servico.duracaoMin),
          preco: (servico.precoCentavos / 100).toFixed(2),
          preparoMin: String(servico.preparoMin),
          limpezaMin: String(servico.limpezaMin),
          ativo: servico.ativo,
        },
  });
  const e = form.formState.errors;
  const enviar = form.handleSubmit((v) =>
    salvar.mutate(
      {
        ...(novo ? {} : { id: servico.id }),
        dados: {
          nome: v.nome,
          duracaoMin: v.duracaoMin,
          precoCentavos: Math.round(v.preco * 100),
          preparoMin: v.preparoMin,
          limpezaMin: v.limpezaMin,
          ativo: v.ativo,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('salvo'));
          aoFechar();
        },
      },
    ),
  );
  const numero = (nome: 'duracaoMin' | 'preco' | 'preparoMin' | 'limpezaMin', rotulo: string) => (
    <Campo id={`s-${nome}`} rotulo={rotulo} erro={e[nome]?.message}>
      <Entrada
        id={`s-${nome}`}
        type="number"
        inputMode={nome === 'preco' ? 'decimal' : 'numeric'}
        step={nome === 'preco' ? '0.01' : '5'}
        className="num"
        aria-invalid={e[nome] !== undefined}
        {...form.register(nome)}
      />
    </Campo>
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
          <Botao variante="primario" carregando={salvar.isPending} onClick={() => void enviar()}>
            {salvar.isPending ? tc('salvando') : tc('salvar')}
          </Botao>
        </>
      }
    >
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <Campo id="s-nome" rotulo={t('dialogo.nome')} erro={e.nome?.message}>
          <Entrada id="s-nome" aria-invalid={e.nome !== undefined} {...form.register('nome')} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          {numero('duracaoMin', t('dialogo.duracao'))}
          {numero('preco', t('dialogo.preco'))}
          {numero('preparoMin', t('dialogo.preparo'))}
          {numero('limpezaMin', t('dialogo.limpeza'))}
        </div>
        <p className="texto-12 text-muted">{t('dialogo.blocoDica')}</p>
        <label className="texto-14 flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            {...form.register('ativo')}
          />
          {t('dialogo.ativo')}
        </label>
        {novo ? null : <p className="texto-12 text-muted">{t('dialogo.rn14')}</p>}
        {ehErroApi(salvar.error) ? <ErroDeRegra erro={salvar.error} /> : null}
        <button type="submit" hidden />
      </form>
    </Dialogo>
  );
}
