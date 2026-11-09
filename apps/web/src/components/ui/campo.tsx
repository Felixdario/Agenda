import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export const estiloControle =
  'w-full rounded-field border border-control bg-surface px-3 text-text transition-[border-color] duration-150 hover:border-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent aria-invalid:border-negative disabled:bg-raised disabled:text-muted';

/** Rótulo acima do campo, dica e erro embaixo (o erro diz o problema e a saída). */
export function Campo({
  id,
  rotulo,
  dica,
  erro,
  children,
  className,
}: {
  id: string;
  rotulo: ReactNode;
  dica?: ReactNode;
  erro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={id} className="texto-14 font-medium">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="texto-12 font-medium text-negative">
          {erro}
        </p>
      ) : dica ? (
        <p id={`${id}-dica`} className="texto-12 text-muted">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

export function Entrada({
  className,
  tamanho = 'md',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { tamanho?: 'md' | 'lg' }) {
  return (
    <input
      className={cn(
        estiloControle,
        tamanho === 'lg' ? 'texto-16 h-12' : 'texto-14 h-10',
        className,
      )}
      {...props}
    />
  );
}

export function AreaDeTexto({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(estiloControle, 'texto-14 min-h-20 py-2', className)} {...props} />
  );
}

/** Seleção nativa estilizada: no celular abre o seletor do sistema, que é o mais acessível. */
export function Selecao({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(estiloControle, 'texto-14 h-10 appearance-auto pr-8', className)}
      {...props}
    />
  );
}
