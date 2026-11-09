'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { usePainel } from '@/components/painel/shell';
import { Botao, estiloBotao } from '@/components/ui/botao';
import { Campo, Entrada, Selecao } from '@/components/ui/campo';
import { Carregando, EstadoErro, Esqueleto } from '@/components/ui/estados';
import { useAgora } from '@/lib/agora';
import { cn } from '@/lib/cn';
import { useAgendarNoBalcao, useEstabelecimento, useHorarios } from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';
import { dataLocalDe, instanteDeLocal } from '@/lib/tempo';

const esquema = z.object({
  email: z.email().max(200),
  nome: z.string().trim().min(1).max(120),
  servicoId: z.uuid(),
  profissionalId: z.string(),
  data: z.iso.date(),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
type Valores = z.infer<typeof esquema>;

export default function Page() {
  return (
    <Suspense>
      <Encaixe />
    </Suspense>
  );
}

/** Encaixe no balcão (RN-20): cliente por e-mail, serviço, profissional, data e hora livre. */
function Encaixe() {
  const t = useTranslations('painel.encaixe');
  const { estab, eu, dono } = usePainel();
  const publico = useEstabelecimento(estab.slug);
  const agora = useAgora();
  const dataInicial = useSearchParams().get('data');

  if (publico.data === undefined || agora === 0) {
    return (
      <div className="flex max-w-[720px] flex-col gap-4">
        <h1 className="texto-28 font-bold">{t('titulo')}</h1>
        {publico.isError ? (
          <EstadoErro erro={publico.error} aoTentar={() => void publico.refetch()} />
        ) : (
          <Carregando className="flex flex-col gap-3">
            <Esqueleto className="h-[420px] w-full rounded-card" />
          </Carregando>
        )}
      </div>
    );
  }
  const proprio = eu.usuario.profissionalId;
  return (
    <Formulario
      servicos={publico.data.servicos}
      profissionais={
        dono
          ? publico.data.profissionais
          : publico.data.profissionais.filter((p) => p.id === proprio)
      }
      dono={dono}
      padrao={{
        email: '',
        nome: '',
        servicoId: publico.data.servicos[0]?.id ?? '',
        profissionalId: dono ? '' : (proprio ?? ''),
        data: dataInicial ?? dataLocalDe(agora, estab.fuso),
        hora: '',
      }}
    />
  );
}

function Formulario({
  servicos,
  profissionais,
  dono,
  padrao,
}: {
  servicos: { id: string; nome: string; duracaoMin: number }[];
  profissionais: { id: string; nome: string; servicoIds: string[] }[];
  dono: boolean;
  padrao: Valores;
}) {
  const t = useTranslations('painel.encaixe');
  const tc = useTranslations('comum');
  const { estab } = usePainel();
  const f = useFormatos(estab.fuso);
  const form = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: padrao });
  const balcao = useAgendarNoBalcao();
  const [servicoId, profissionalId, data, hora] = useWatch({
    control: form.control,
    name: ['servicoId', 'profissionalId', 'data', 'hora'],
  });
  const executam = profissionais.filter((p) => p.servicoIds.includes(servicoId));
  const sugestoes = useHorarios(
    estab.slug,
    servicoId,
    profissionalId === '' ? null : profissionalId,
    data,
  );
  const erros = form.formState.errors;

  const enviar = form.handleSubmit((v) =>
    balcao.mutate(
      {
        servicoId: v.servicoId,
        profissionalId: v.profissionalId === '' ? null : v.profissionalId,
        inicio: new Date(instanteDeLocal(v.data, v.hora, estab.fuso)).toISOString(),
        cliente: { email: v.email, nome: v.nome },
      },
      {
        onSuccess: (r) => {
          toast.success(t('sucesso'), {
            description: `${f.frase(f.dataCurta(r.inicio))} ${f.intervalo(r.inicio, r.fim)} ${tc('separador')} ${r.servicoNome}`,
          });
          form.reset({ ...v, email: '', nome: '', hora: '' });
        },
      },
    ),
  );

  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="texto-28 font-bold">{t('titulo')}</h1>
        <p className="texto-14 max-w-[65ch] text-muted">{t('descricao')}</p>
      </header>
      <form
        onSubmit={enviar}
        noValidate
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          <h2 className="texto-16 font-semibold">{t('cliente')}</h2>
          <Campo id="e-email" rotulo={t('email')} erro={erros.email?.message}>
            <Entrada
              id="e-email"
              type="email"
              autoComplete="off"
              aria-invalid={erros.email !== undefined}
              {...form.register('email')}
            />
          </Campo>
          <Campo id="e-nome" rotulo={t('nome')} dica={t('nomeDica')} erro={erros.nome?.message}>
            <Entrada
              id="e-nome"
              autoComplete="off"
              aria-invalid={erros.nome !== undefined}
              {...form.register('nome')}
            />
          </Campo>
          <Campo id="e-servico" rotulo={t('servico')}>
            <Selecao id="e-servico" {...form.register('servicoId')}>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo id="e-prof" rotulo={t('profissional')}>
            <Selecao id="e-prof" disabled={!dono} {...form.register('profissionalId')}>
              {dono ? <option value="">{t('qualquer')}</option> : null}
              {executam.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </section>

        <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          <div className="grid grid-cols-2 gap-3">
            <Campo id="e-data" rotulo={t('data')} erro={erros.data?.message}>
              <Entrada id="e-data" type="date" {...form.register('data')} />
            </Campo>
            <Campo
              id="e-hora"
              rotulo={t('hora')}
              dica={t('horaDica', { granularidade: estab.politicas.granularidadeMin })}
              erro={erros.hora?.message}
            >
              <Entrada
                id="e-hora"
                type="time"
                step={estab.politicas.granularidadeMin * 60}
                aria-invalid={erros.hora !== undefined}
                {...form.register('hora')}
              />
            </Campo>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="texto-14 font-medium">{t('sugestoes')}</h3>
            {sugestoes.isPending ? (
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Esqueleto key={i} className="h-10 rounded-full" />
                ))}
              </div>
            ) : sugestoes.data === undefined || sugestoes.data.length === 0 ? (
              <p className="texto-14 text-muted">{t('semSugestoes')}</p>
            ) : (
              <div className="grid max-h-[200px] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
                {sugestoes.data.map((h) => {
                  const valor = f.hora(h.inicio);
                  return (
                    <button
                      key={h.inicio}
                      type="button"
                      aria-pressed={hora === valor}
                      onClick={() => form.setValue('hora', valor, { shouldValidate: true })}
                      className={cn(
                        'pressionavel texto-14 num h-10 rounded-full border font-semibold',
                        hora === valor
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-control bg-surface hover:border-muted',
                      )}
                    >
                      {valor}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {ehErroApi(balcao.error) ? (
            <ErroDeRegra
              erro={balcao.error}
              contexto={{
                estabelecimento: estab.nome,
                fuso: estab.fuso,
                granularidadeMin: estab.politicas.granularidadeMin,
              }}
            />
          ) : null}
          <div className="mt-auto flex flex-wrap items-center justify-end gap-3 pt-2">
            {balcao.data === undefined ? null : (
              <Link
                href={`/painel?data=${dataLocalDe(balcao.data.inicio, estab.fuso)}&ag=${balcao.data.id}`}
                className={estiloBotao({ variante: 'link' })}
              >
                {t('verNaAgenda')}
              </Link>
            )}
            <Botao type="submit" variante="primario" carregando={balcao.isPending}>
              {balcao.isPending ? t('criando') : t('criar')}
            </Botao>
          </div>
        </section>
      </form>
    </div>
  );
}
