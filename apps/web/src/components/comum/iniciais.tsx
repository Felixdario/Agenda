import { cn } from '@/lib/cn';

/** Até duas iniciais do nome, sem depender de idioma ("Navalha & Café" → "NC"). */
export function iniciaisDe(nome: string): string {
  const palavras = nome
    .split(/[\s&+\-–]+/u)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && /\p{L}/u.test(p));
  const letras = palavras.length === 1 ? [palavras[0]!] : [palavras[0]!, palavras.at(-1)!];
  return letras
    .map((p) => p.match(/\p{L}/u)?.[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

/** Iniciais num disco neutro (sem foto: nunca foto de banco de imagens). */
export function Iniciais({
  nome,
  tamanho = 'md',
  className,
}: {
  nome: string;
  tamanho?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-raised font-semibold text-muted',
        tamanho === 'sm' && 'texto-12 size-8',
        tamanho === 'md' && 'texto-14 size-10',
        tamanho === 'lg' && 'texto-20 size-14',
        className,
      )}
    >
      {nome.trim() === '' ? null : iniciaisDe(nome)}
    </span>
  );
}
