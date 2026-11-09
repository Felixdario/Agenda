'use client';

import type { ClientePainel } from '@agenda/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { Botao } from '@/components/ui/botao';
import { Dialogo } from '@/components/ui/dialogo';
import { Carregando, EstadoErro, EstadoVazio, Esqueleto } from '@/components/ui/estados';
import { cn } from '@/lib/cn';
import { useClientesPainel, useDesbloquearCliente } from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';

export default function Page() {
  const t = useTranslations('painel.clientes');
  const clientes = useClientesPainel();
  const [desbloquear, setDesbloquear] = useState<ClientePainel | null>(null);
  const lista = [...(clientes.data ?? [])].sort(
    (a, b) =>
      Number(b.bloqueado) - Number(a.bloqueado) ||
      b.faltas - a.faltas ||
      a.nome.localeCompare(b.nome),
  );

  return (
    <div className="flex max-w-[1100px] flex-col gap-5">
      <header>
        <h1 className="texto-28 font-bold">{t('titulo')}</h1>
        {clientes.data === undefined ? null : (
          <p className="texto-14 num mt-1 text-muted">{t('total', { n: clientes.data.length })}</p>
        )}
      </header>
      {clientes.data === undefined ? (
        clientes.isError ? (
          <EstadoErro erro={clientes.error} aoTentar={() => void clientes.refetch()} />
        ) : (
          <Carregando className="rounded-card border border-border bg-surface">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="flex h-12 items-center gap-6 border-b border-rule px-5 last:border-0"
              >
                <Esqueleto className="h-4 w-36" />
                <Esqueleto className="h-4 w-48" />
              </div>
            ))}
          </Carregando>
        )
      ) : lista.length === 0 ? (
        <EstadoVazio>{t('vazio')}</EstadoVazio>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="texto-12 border-b border-border text-muted">
                  <th scope="col" className="h-10 px-5 text-left font-normal">
                    {t('colunas.nome')}
                  </th>
                  <th scope="col" className="px-3 text-left font-normal">
                    {t('colunas.email')}
                  </th>
                  <th scope="col" className="px-3 text-right font-normal">
                    {t('colunas.ativos')}
                  </th>
                  <th scope="col" className="px-3 text-right font-normal">
                    {t('colunas.faltas')}
                  </th>
                  <th scope="col" className="px-3 text-left font-normal">
                    {t('colunas.situacao')}
                  </th>
                  <th scope="col" className="w-36 px-5">
                    <span className="sr-only">{t('colunas.acoes')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="texto-14 border-b border-rule last:border-0">
                    <td className="h-12 px-5 font-medium">{c.nome}</td>
                    <td className="max-w-[280px] truncate px-3 text-muted">{c.email}</td>
                    <td className="num px-3 text-right">{c.ativosFuturos}</td>
                    <td className={cn('num px-3 text-right', c.faltas > 0 && 'font-medium')}>
                      {c.faltas}
                    </td>
                    <td className="px-3">
                      <Situacao bloqueado={c.bloqueado} />
                    </td>
                    <td className="px-5 text-right">
                      {c.bloqueado ? (
                        <Botao tamanho="sm" onClick={() => setDesbloquear(c)}>
                          {t('desbloquear')}
                        </Botao>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-rule rounded-card border border-border bg-surface md:hidden">
            {lista.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="texto-14 font-medium">{c.nome}</span>
                  <span className="texto-12 truncate text-muted">{c.email}</span>
                  <span className="texto-12 num text-muted">
                    {t('linha2', { ativos: c.ativosFuturos, faltas: c.faltas })}
                  </span>
                </div>
                {c.bloqueado ? (
                  <Botao tamanho="sm" onClick={() => setDesbloquear(c)}>
                    {t('desbloquear')}
                  </Botao>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      <DialogoDesbloquear cliente={desbloquear} aoFechar={() => setDesbloquear(null)} />
    </div>
  );
}

function Situacao({ bloqueado }: { bloqueado: boolean }) {
  const t = useTranslations('painel.clientes');
  return bloqueado ? (
    <span className="texto-12 inline-flex h-6 flex-none items-center rounded-full bg-negative-bg px-2.5 font-medium whitespace-nowrap text-negative">
      {t('bloqueado')}
    </span>
  ) : (
    <span className="texto-12 text-muted">{t('liberado')}</span>
  );
}

function DialogoDesbloquear({
  cliente,
  aoFechar,
}: {
  cliente: ClientePainel | null;
  aoFechar: () => void;
}) {
  const t = useTranslations('painel.clientes');
  const tc = useTranslations('comum');
  const desbloquear = useDesbloquearCliente();
  const fechar = () => {
    desbloquear.reset();
    aoFechar();
  };
  return (
    <Dialogo
      aberto={cliente !== null}
      aoMudar={(v) => {
        if (!v) fechar();
      }}
      largura="sm"
      titulo={t('dialogo.titulo', { nome: cliente?.nome ?? '' })}
      descricao={t('dialogo.descricao', { nome: cliente?.nome ?? '' })}
      rodape={
        <>
          <Botao onClick={fechar}>{tc('cancelar')}</Botao>
          <Botao
            variante="primario"
            carregando={desbloquear.isPending}
            onClick={() =>
              cliente !== null &&
              desbloquear.mutate(cliente.id, {
                onSuccess: () => {
                  toast.success(t('desbloqueado'));
                  fechar();
                },
              })
            }
          >
            {t('dialogo.confirmar')}
          </Botao>
        </>
      }
    >
      {ehErroApi(desbloquear.error) ? <ErroDeRegra erro={desbloquear.error} /> : undefined}
    </Dialogo>
  );
}
