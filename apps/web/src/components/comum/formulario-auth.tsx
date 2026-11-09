'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, registroSchema } from '@agenda/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { Botao } from '@/components/ui/botao';
import { Campo, Entrada } from '@/components/ui/campo';
import { useCriarConta, useEntrar } from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';

/** `?voltar=` só aceita caminhos internos (nada de //outro-site). */
export function destinoSeguro(voltar: string | null): string | null {
  if (voltar === null || !voltar.startsWith('/') || voltar.startsWith('//')) return null;
  return voltar;
}

function destinoPorPapel(papel: string) {
  return papel === 'CLIENTE' ? '/meus-agendamentos' : '/painel';
}

const CONTAS_DEMO = [
  { papel: 'DONO', email: 'dono@agenda.dev' },
  { papel: 'PROFISSIONAL', email: 'profissional@agenda.dev' },
  { papel: 'CLIENTE', email: 'cliente@agenda.dev' },
] as const;
const SENHA_DEMO = 'demo1234';

export function FormularioEntrar() {
  const t = useTranslations('auth');
  const router = useRouter();
  const voltar = destinoSeguro(useSearchParams().get('voltar'));
  const entrar = useEntrar();
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
  });
  const erros = form.formState.errors;
  const credenciais = ehErroApi(entrar.error) && entrar.error.status === 401;

  const enviar = form.handleSubmit((dados) =>
    entrar.mutate(dados, {
      onSuccess: (r) => {
        router.replace(voltar ?? destinoPorPapel(r.usuario.papel));
        router.refresh();
      },
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={enviar}
        noValidate
        className="flex flex-col gap-4"
        aria-describedby="descricao-entrar"
      >
        <Campo id="email" rotulo={t('email')} erro={erros.email?.message}>
          <Entrada
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            tamanho="lg"
            aria-invalid={erros.email !== undefined || credenciais}
            {...form.register('email')}
          />
        </Campo>
        <Campo id="senha" rotulo={t('senha')} erro={erros.senha?.message}>
          <Entrada
            id="senha"
            type="password"
            autoComplete="current-password"
            tamanho="lg"
            aria-invalid={erros.senha !== undefined || credenciais}
            {...form.register('senha')}
          />
        </Campo>
        {credenciais ? (
          <p role="alert" className="texto-14 rounded-card bg-negative-bg px-4 py-3 font-medium">
            {t('entrar.credenciais')}
          </p>
        ) : entrar.error !== null && ehErroApi(entrar.error) ? (
          <ErroDeRegra erro={entrar.error} />
        ) : null}
        <Botao
          type="submit"
          variante="primario"
          tamanho="lg"
          largura="total"
          carregando={entrar.isPending}
        >
          {entrar.isPending ? t('entrar.entrando') : t('entrar.botao')}
        </Botao>
        <p className="texto-14 text-muted">
          {t('entrar.semConta')}{' '}
          <Link
            href={
              voltar === null ? '/criar-conta' : `/criar-conta?voltar=${encodeURIComponent(voltar)}`
            }
            className="font-medium text-accent underline"
          >
            {t('entrar.criarConta')}
          </Link>
        </p>
      </form>

      <section
        aria-labelledby="titulo-demo"
        className="rounded-card border border-border bg-surface p-5"
      >
        <h2 id="titulo-demo" className="texto-16 font-semibold">
          {t('demo.titulo')}
        </h2>
        <p className="texto-14 mt-1 text-muted">{t('demo.descricao')}</p>
        <ul className="mt-4 divide-y divide-rule">
          {CONTAS_DEMO.map((c) => (
            <li key={c.papel} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="texto-14 font-medium">{t(`papeis.${c.papel}`)}</p>
                <p className="texto-12 break-all text-muted">{c.email}</p>
              </div>
              <Botao
                tamanho="md"
                onClick={() => {
                  form.setValue('email', c.email, { shouldValidate: true });
                  form.setValue('senha', SENHA_DEMO, { shouldValidate: true });
                  entrar.reset();
                  form.setFocus('senha');
                }}
                data-conta={c.papel}
              >
                {t('demo.entrarComo', { papel: t(`papeis.${c.papel}`).toLocaleLowerCase() })}
              </Botao>
            </li>
          ))}
        </ul>
        <p className="texto-12 num mt-3 text-muted">{t('demo.senha', { senha: SENHA_DEMO })}</p>
      </section>
    </div>
  );
}

export function FormularioCriarConta() {
  const t = useTranslations('auth');
  const router = useRouter();
  const voltar = destinoSeguro(useSearchParams().get('voltar'));
  const criar = useCriarConta();
  const entrar = useEntrar();
  const form = useForm({
    resolver: zodResolver(registroSchema),
    defaultValues: { nome: '', email: '', senha: '' },
  });
  const erros = form.formState.errors;
  const emailEmUso =
    ehErroApi(criar.error) &&
    criar.error.codigo === 'DADOS_INVALIDOS' &&
    'email' in criar.error.campos;

  const enviar = form.handleSubmit((dados) =>
    criar.mutate(dados, {
      onSuccess: () =>
        entrar.mutate(
          { email: dados.email, senha: dados.senha },
          {
            onSuccess: (r) => {
              router.replace(voltar ?? destinoPorPapel(r.usuario.papel));
              router.refresh();
            },
          },
        ),
    }),
  );
  const pendente = criar.isPending || entrar.isPending;

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo id="nome" rotulo={t('nome')} erro={erros.nome?.message}>
        <Entrada
          id="nome"
          autoComplete="name"
          tamanho="lg"
          aria-invalid={erros.nome !== undefined}
          {...form.register('nome')}
        />
      </Campo>
      <Campo
        id="email"
        rotulo={t('email')}
        erro={emailEmUso ? t('criar.emailEmUso') : erros.email?.message}
      >
        <Entrada
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          tamanho="lg"
          aria-invalid={erros.email !== undefined || emailEmUso}
          {...form.register('email')}
        />
      </Campo>
      <Campo id="senha" rotulo={t('senha')} dica={t('criar.senhaDica')} erro={erros.senha?.message}>
        <Entrada
          id="senha"
          type="password"
          autoComplete="new-password"
          tamanho="lg"
          aria-invalid={erros.senha !== undefined}
          {...form.register('senha')}
        />
      </Campo>
      {!emailEmUso && ehErroApi(criar.error) ? <ErroDeRegra erro={criar.error} /> : null}
      {ehErroApi(entrar.error) ? <ErroDeRegra erro={entrar.error} /> : null}
      <Botao type="submit" variante="primario" tamanho="lg" largura="total" carregando={pendente}>
        {pendente ? t('criar.criando') : t('criar.botao')}
      </Botao>
      <p className="texto-14 text-muted">
        {t('criar.jaTem')}{' '}
        <Link
          href={voltar === null ? '/entrar' : `/entrar?voltar=${encodeURIComponent(voltar)}`}
          className="font-medium text-accent underline"
        >
          {t('entrar.botao')}
        </Link>
      </p>
    </form>
  );
}
