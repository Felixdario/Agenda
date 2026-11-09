'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { type ErroApi, chavesDoErro } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';

/** O que a mensagem de um código pode citar (vem da API: políticas, nome, limites). */
export interface ContextoDoErro {
  estabelecimento?: string;
  antecedenciaMin?: number;
  limiteAgendamentos?: number;
  granularidadeMin?: number;
  fuso?: string;
}

/** Mensagem e ação de um código de erro, traduzidas a partir do `codigo` (nunca do texto da API). */
export function useTextoDoErro(contexto: ContextoDoErro = {}) {
  const t = useTranslations('erros');
  const f = useFormatos(contexto.fuso ?? 'UTC');
  return (erro: ErroApi) => {
    const ultima = erro.detalhes['ultimaData'];
    const args = {
      estabelecimento: contexto.estabelecimento ?? '',
      antecedencia: f.duracao(contexto.antecedenciaMin ?? 0),
      limite: contexto.limiteAgendamentos ?? 0,
      granularidade: contexto.granularidadeMin ?? 15,
      ultimaData: typeof ultima === 'string' ? f.dataLocalLonga(ultima) : '',
    };
    const chaves = chavesDoErro(erro.codigo);
    return { mensagem: t(chaves.mensagem, args), acao: t(chaves.acao, args) };
  };
}

/**
 * Recusa de regra (422/403/…): código → mensagem → próxima ação, no lugar onde aconteceu. Nunca em
 * toast. `acao` substitui o texto da ação por um controle (link, botão).
 */
export function ErroDeRegra({
  erro,
  contexto,
  acao,
  className,
}: {
  erro: ErroApi;
  contexto?: ContextoDoErro;
  acao?: ReactNode;
  className?: string;
}) {
  const texto = useTextoDoErro(contexto)(erro);
  return (
    <div
      role="alert"
      data-codigo={erro.codigo}
      className={cn('flex gap-3 rounded-card bg-negative-bg px-4 py-3 text-text', className)}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-negative" />
      <div className="min-w-0 flex-1">
        <p className="texto-14 font-medium">{texto.mensagem}</p>
        {acao ?? <p className="texto-14 mt-0.5 text-muted">{texto.acao}</p>}
      </div>
    </div>
  );
}
