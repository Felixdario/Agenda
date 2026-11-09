'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { useFormatos } from '@/lib/formatos';

const MIN = 60_000;

/**
 * O bloco ocupado (D-02): preparo, atendimento e limpeza como uma coisa só, com início e fim do
 * bloco nas pontas. Trecho hachurado para preparo e limpeza, cheio para o serviço.
 */
export function BlocoOcupado({
  inicio,
  duracaoMin,
  preparoMin,
  limpezaMin,
  fuso,
  compacto = false,
  className,
}: {
  /** Início do atendimento (o que o cliente vê). */
  inicio: string;
  duracaoMin: number;
  preparoMin: number;
  limpezaMin: number;
  fuso: string;
  compacto?: boolean;
  className?: string;
}) {
  const t = useTranslations('bloco');
  const f = useFormatos(fuso);
  const inicioMs = Date.parse(inicio);
  const inicioBloco = inicioMs - preparoMin * MIN;
  const fimAtendimento = inicioMs + duracaoMin * MIN;
  const fimBloco = fimAtendimento + limpezaMin * MIN;
  const total = preparoMin + duracaoMin + limpezaMin;
  const segmentos = [
    { chave: 'preparo', min: preparoMin, hachura: true },
    { chave: 'atendimento', min: duracaoMin, hachura: false },
    { chave: 'limpeza', min: limpezaMin, hachura: true },
  ] as const;

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      {compacto ? null : (
        <figcaption className="texto-14 text-muted">
          {t('explica', {
            inicio: f.hora(inicioBloco),
            fim: f.hora(fimBloco),
            total: f.duracao(total),
          })}
        </figcaption>
      )}
      <div
        role="img"
        aria-label={t('rotulo', {
          inicio: f.hora(inicioBloco),
          fim: f.hora(fimBloco),
          preparo: f.duracao(preparoMin),
          atendimento: f.duracao(duracaoMin),
          limpeza: f.duracao(limpezaMin),
        })}
      >
        <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-full">
          {segmentos
            .filter((s) => s.min > 0)
            .map((s) => (
              <span
                key={s.chave}
                style={{ flexGrow: s.min, flexBasis: 0 }}
                className={cn(
                  'texto-12 num flex min-w-6 items-center justify-center font-medium whitespace-nowrap',
                  s.hachura ? 'hachura text-muted' : 'min-w-16 bg-accent text-[var(--surface)]',
                )}
              >
                {s.chave === 'atendimento' ? f.intervalo(inicioMs, fimAtendimento) : null}
              </span>
            ))}
        </div>
        <div className="texto-12 num mt-1.5 flex justify-between font-medium text-muted">
          <span>{f.hora(inicioBloco)}</span>
          <span>{f.hora(fimBloco)}</span>
        </div>
      </div>
      <ul className="texto-12 flex flex-wrap gap-x-4 gap-y-1 text-muted">
        {segmentos
          .filter((s) => s.min > 0)
          .map((s) => (
            <li key={s.chave} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'inline-block size-3 rounded-[4px]',
                  s.hachura ? 'hachura' : 'bg-accent',
                )}
              />
              <span className="num">
                {t('segmento', { nome: t(s.chave), duracao: f.duracao(s.min) })}
              </span>
            </li>
          ))}
      </ul>
    </figure>
  );
}
