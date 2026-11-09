import { type VariantProps, cva } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Botões do DESIGN.md: primário quase preto, secundário com contorno, perigo com contorno
 * vermelho. Pílula (raio 999). 48 px no fluxo do cliente (toque), 40 px no painel.
 */
export const estiloBotao = cva(
  'pressionavel inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
  {
    variants: {
      variante: {
        primario:
          'bg-primary text-on-primary hover:opacity-90 disabled:bg-raised disabled:text-muted aria-disabled:bg-raised aria-disabled:text-muted',
        secundario:
          'border border-control bg-surface text-text hover:border-muted disabled:text-muted',
        fantasma: 'text-text hover:bg-raised disabled:text-muted',
        perigo:
          'border border-negative/50 bg-surface text-negative hover:border-negative disabled:opacity-60',
        link: 'px-0 text-accent underline-offset-4 hover:underline',
      },
      tamanho: {
        sm: 'h-8 px-3 texto-12',
        md: 'h-10 px-4 texto-14',
        lg: 'h-12 px-6 texto-16',
        icone: 'size-10',
        iconeSm: 'size-8',
      },
      largura: { auto: '', total: 'w-full' },
    },
    compoundVariants: [{ variante: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variante: 'secundario', tamanho: 'md', largura: 'auto' },
  },
);

export interface BotaoProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof estiloBotao> {
  carregando?: boolean;
  icone?: ReactNode;
}

export function Botao({
  className,
  variante,
  tamanho,
  largura,
  carregando = false,
  icone,
  children,
  type = 'button',
  disabled,
  ...props
}: BotaoProps) {
  return (
    <button
      type={type}
      className={cn(estiloBotao({ variante, tamanho, largura }), className)}
      disabled={disabled}
      aria-busy={carregando || undefined}
      {...props}
    >
      {carregando ? (
        <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
      ) : (
        icone
      )}
      {children}
    </button>
  );
}
