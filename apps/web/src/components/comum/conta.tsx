'use client';

import { Menu } from '@base-ui/react/menu';
import { CalendarCheck, LayoutGrid, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { estiloBotao } from '@/components/ui/botao';
import { cn } from '@/lib/cn';
import { useEu, useSair } from '@/lib/consultas';
import { Iniciais } from './iniciais';

/** Endereço atual com a query, para voltar depois de entrar. */
export function useEnderecoAtual(): string {
  const caminho = usePathname();
  const busca = useSearchParams().toString();
  return busca === '' ? caminho : `${caminho}?${busca}`;
}

export function linkEntrar(voltar: string) {
  return `/entrar?voltar=${encodeURIComponent(voltar)}`;
}

const itemMenu =
  'texto-14 flex h-10 cursor-default items-center gap-2.5 rounded-lg px-3 text-text outline-none select-none data-highlighted:bg-raised';

/** Entrar, ou o menu da conta (meus agendamentos ou painel, e sair). */
export function MenuConta({ slug }: { slug?: string }) {
  const t = useTranslations('conta');
  const eu = useEu(slug);
  const sair = useSair();
  const router = useRouter();
  const voltar = useEnderecoAtual();

  if (eu.isPending) return <span aria-hidden className="block h-10 w-24 rounded-full bg-raised" />;
  if (eu.data === undefined) {
    return (
      <Link
        href={linkEntrar(voltar)}
        className={estiloBotao({ variante: 'secundario', tamanho: 'md' })}
      >
        {t('entrar')}
      </Link>
    );
  }
  const usuario = eu.data.usuario;
  const doPainel = usuario.papel !== 'CLIENTE';
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          estiloBotao({ variante: 'fantasma', tamanho: 'md' }),
          'max-w-[200px] gap-2 pl-1 data-popup-open:bg-raised',
        )}
      >
        <Iniciais nome={usuario.nome} tamanho="sm" />
        <span className="truncate font-medium">{usuario.nome.split(' ')[0]}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-[60] outline-none">
          <Menu.Popup className="flutuante min-w-[220px] rounded-field bg-surface p-1 shadow-float outline-none">
            <div className="px-3 pt-2 pb-2">
              <p className="texto-14 truncate font-medium">{usuario.nome}</p>
              <p className="texto-12 truncate text-muted">{usuario.email}</p>
            </div>
            <Menu.Separator className="mx-1 my-1 h-px bg-rule" />
            <Menu.Item
              className={itemMenu}
              onClick={() => router.push(doPainel ? '/painel' : '/meus-agendamentos')}
            >
              {doPainel ? (
                <LayoutGrid aria-hidden className="size-4 text-muted" />
              ) : (
                <CalendarCheck aria-hidden className="size-4 text-muted" />
              )}
              {doPainel ? t('painel') : t('meusAgendamentos')}
            </Menu.Item>
            <Menu.Item
              className={itemMenu}
              onClick={() =>
                sair.mutate(undefined, {
                  onSettled: () => {
                    toast(t('saiu'));
                    router.push('/');
                  },
                })
              }
            >
              <LogOut aria-hidden className="size-4 text-muted" />
              {t('sair')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
