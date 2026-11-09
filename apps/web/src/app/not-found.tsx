import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MolduraCliente } from '@/components/comum/moldura-cliente';
import { estiloBotao } from '@/components/ui/botao';

export default async function NaoEncontrado() {
  const t = await getTranslations('comum');
  return (
    <MolduraCliente>
      <div className="flex flex-col items-start gap-4 pt-10">
        <h1 className="texto-28 font-bold">{t('naoEncontrado')}</h1>
        <Link href="/" className={estiloBotao({ variante: 'secundario', tamanho: 'lg' })}>
          {t('irParaInicio')}
        </Link>
      </div>
    </MolduraCliente>
  );
}
