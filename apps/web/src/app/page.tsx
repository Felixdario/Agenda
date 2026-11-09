import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MolduraCliente } from '@/components/comum/moldura-cliente';
import { estiloBotao } from '@/components/ui/botao';

const SLUG_DEMO = process.env.NEXT_PUBLIC_SLUG_DEMO ?? 'navalha-e-cafe';

export default async function Inicio() {
  const t = await getTranslations('inicio');
  return (
    <MolduraCliente>
      <section className="flex flex-col gap-4 pt-10 pb-10">
        <h1 className="texto-28 font-bold">{t('titulo')}</h1>
        <p className="texto-16 max-w-[60ch] text-muted">{t('descricao')}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            href={`/b/${SLUG_DEMO}`}
            className={estiloBotao({ variante: 'primario', tamanho: 'lg' })}
          >
            {t('verDemo')}
          </Link>
          <Link href="/entrar?voltar=%2Fpainel" className={estiloBotao({ tamanho: 'lg' })}>
            {t('entrarPainel')}
          </Link>
        </div>
      </section>
      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="texto-16 font-semibold">{t('demoTitulo')}</h2>
        <p className="texto-14 mt-1 max-w-[65ch] text-muted">{t('demoDescricao')}</p>
      </section>
    </MolduraCliente>
  );
}
