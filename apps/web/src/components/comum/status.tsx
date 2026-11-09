'use client';

import type { StatusAgendamento } from '@agenda/shared';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

const ESTILO: Record<StatusAgendamento, string> = {
  CONFIRMADO: 'bg-positive-bg text-positive',
  PENDENTE: 'bg-warning-bg text-warning',
  CONCLUIDO: 'bg-raised text-muted',
  CANCELADO: 'bg-raised text-muted',
  NAO_COMPARECEU: 'bg-negative-bg text-negative',
};

/**
 * Marca de forma do status (o status nunca é só cor): confirmado é um círculo cheio, pendente um
 * círculo vazado, cancelado é texto riscado, concluído e falta têm rótulo próprio.
 */
export function MarcaDoStatus({
  status,
  className,
}: {
  status: StatusAgendamento;
  className?: string;
}) {
  if (status === 'CONFIRMADO')
    return (
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full bg-current', className)} />
    );
  if (status === 'PENDENTE')
    return (
      <span
        aria-hidden
        className={cn('size-2 shrink-0 rounded-full border-[1.5px] border-current', className)}
      />
    );
  return null;
}

/** Pílula pálida de status: tinta escura do mesmo matiz + a marca de forma + o rótulo. */
export function PilulaDeStatus({
  status,
  className,
}: {
  status: StatusAgendamento;
  className?: string;
}) {
  const t = useTranslations('status');
  return (
    <span
      className={cn(
        'texto-12 inline-flex h-6 flex-none items-center gap-1.5 rounded-full px-2.5 font-medium whitespace-nowrap',
        ESTILO[status],
        status === 'CANCELADO' && 'line-through',
        className,
      )}
    >
      <MarcaDoStatus status={status} />
      {t(status)}
    </span>
  );
}
