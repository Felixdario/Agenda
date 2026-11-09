'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { PoliticasCompletas } from '@agenda/shared';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { usePainel } from '@/components/painel/shell';
import { Botao } from '@/components/ui/botao';
import { Entrada } from '@/components/ui/campo';
import { useSalvarPoliticas } from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';

const inteiro = (min: number, max: number) => z.coerce.number<string>().int().min(min).max(max);
const esquema = z.object({
  antecedenciaMinimaMin: inteiro(0, 60 * 24 * 30),
  horizonteDias: inteiro(0, 365),
  prazoCancelamentoHoras: inteiro(0, 24 * 30),
  granularidadeMin: inteiro(5, 120),
  limiteAgendamentosAtivos: inteiro(1, 100),
  limiteFaltas: inteiro(1, 100),
  confirmacaoAutomatica: z.boolean(),
});
type Numerica = Exclude<keyof PoliticasCompletas, 'confirmacaoAutomatica'>;
const CAMPOS: Numerica[] = [
  'antecedenciaMinimaMin',
  'horizonteDias',
  'prazoCancelamentoHoras',
  'granularidadeMin',
  'limiteAgendamentosAtivos',
  'limiteFaltas',
];

/** Políticas do estabelecimento: cada campo mostra o efeito do valor atual, ao lado. */
export default function Page() {
  const t = useTranslations('painel.politicas');
  const tc = useTranslations('comum');
  const { estab, dono } = usePainel();
  const f = useFormatos(estab.fuso);
  const salvar = useSalvarPoliticas();
  const p = estab.politicas;
  const form = useForm<z.input<typeof esquema>, unknown, z.output<typeof esquema>>({
    resolver: zodResolver(esquema),
    defaultValues: {
      ...Object.fromEntries(CAMPOS.map((c) => [c, String(p[c])])),
      confirmacaoAutomatica: p.confirmacaoAutomatica,
    } as z.input<typeof esquema>,
  });
  const valores = useWatch({ control: form.control });
  const erros = form.formState.errors;

  const efeito = (c: Numerica) => {
    const v = Number(valores[c]);
    if (!Number.isFinite(v)) return '';
    const valor = c === 'antecedenciaMinimaMin' ? f.duracao(v) : v;
    return t(`campos.${c}.efeito`, { valor });
  };

  const enviar = form.handleSubmit((v) =>
    salvar.mutate(v, {
      onSuccess: (e) => {
        toast.success(t('salvas'));
        form.reset({
          ...Object.fromEntries(CAMPOS.map((c) => [c, String(e.politicas[c])])),
          confirmacaoAutomatica: e.politicas.confirmacaoAutomatica,
        } as z.input<typeof esquema>);
      },
    }),
  );

  return (
    <div className="flex max-w-[880px] flex-col gap-5">
      <header>
        <h1 className="texto-28 font-bold">{t('titulo')}</h1>
        <p className="texto-14 mt-1 text-muted">{dono ? t('descricao') : t('somenteDono')}</p>
      </header>
      <form
        onSubmit={enviar}
        noValidate
        className="flex flex-col rounded-card border border-border bg-surface"
      >
        <fieldset disabled={!dono} className="divide-y divide-rule">
          {CAMPOS.map((c) => (
            <div
              key={c}
              className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center sm:gap-6"
            >
              <div className="flex flex-col gap-0.5">
                <label htmlFor={`pol-${c}`} className="texto-14 font-medium">
                  {t(`campos.${c}.rotulo`)}
                </label>
                <p className="texto-12 text-muted" aria-live="polite">
                  {erros[c]?.message ?? efeito(c)}
                </p>
              </div>
              <Entrada
                id={`pol-${c}`}
                type="number"
                inputMode="numeric"
                className="num text-right"
                aria-invalid={erros[c] !== undefined}
                {...form.register(c)}
              />
            </div>
          ))}
          <div className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center sm:gap-6">
            <div className="flex flex-col gap-0.5">
              <label htmlFor="pol-confirmacao" className="texto-14 font-medium">
                {t('campos.confirmacaoAutomatica.rotulo')}
              </label>
              <p className="texto-12 text-muted">
                {valores.confirmacaoAutomatica
                  ? t('campos.confirmacaoAutomatica.efeitoSim')
                  : t('campos.confirmacaoAutomatica.efeitoNao')}
              </p>
            </div>
            <input
              id="pol-confirmacao"
              type="checkbox"
              role="switch"
              className="size-5 justify-self-start accent-[var(--primary)] sm:justify-self-end"
              {...form.register('confirmacaoAutomatica')}
            />
          </div>
        </fieldset>
        {ehErroApi(salvar.error) ? <ErroDeRegra erro={salvar.error} className="mx-5 mb-2" /> : null}
        {dono ? (
          <div className="flex justify-end border-t border-border px-5 py-4">
            <Botao
              type="submit"
              variante="primario"
              carregando={salvar.isPending}
              disabled={!form.formState.isDirty}
            >
              {salvar.isPending ? tc('salvando') : t('salvar')}
            </Botao>
          </div>
        ) : null}
      </form>
    </div>
  );
}
