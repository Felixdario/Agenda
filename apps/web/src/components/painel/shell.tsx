'use client';

import type { EstabelecimentoPainel, Eu } from '@agenda/shared';
import { Menu } from '@base-ui/react/menu';
import {
  CalendarDays,
  CalendarPlus,
  Clock3,
  ExternalLink,
  ListChecks,
  LogOut,
  Menu as IconeMenu,
  SlidersHorizontal,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { toast } from 'sonner';
import { Iniciais } from '@/components/comum/iniciais';
import { SeletorIdioma } from '@/components/comum/seletor-idioma';
import { Folha } from '@/components/ui/folha';
import { Carregando, EstadoErro, Esqueleto } from '@/components/ui/estados';
import { cn } from '@/lib/cn';
import { useEstabelecimentoPainel, useEu, useSair } from '@/lib/consultas';
import { useRedirecionarSeSemSessao } from '@/lib/sessao';

interface ContextoPainel {
  eu: Eu;
  estab: EstabelecimentoPainel;
  dono: boolean;
}

const Contexto = createContext<ContextoPainel | null>(null);

/** Sessão e estabelecimento do painel, já carregados pelo shell. */
export function usePainel(): ContextoPainel {
  const c = useContext(Contexto);
  if (c === null) throw new Error('usePainel fora do ShellPainel');
  return c;
}

type ChaveNav =
  'agenda' | 'encaixe' | 'servicos' | 'profissionais' | 'jornada' | 'clientes' | 'politicas';

const NAV: {
  chave: ChaveNav;
  href: string;
  icone: typeof CalendarDays;
  soDono: boolean;
  soProfissional?: boolean;
}[] = [
  { chave: 'agenda', href: '/painel', icone: CalendarDays, soDono: false },
  { chave: 'encaixe', href: '/painel/encaixe', icone: CalendarPlus, soDono: false },
  { chave: 'servicos', href: '/painel/servicos', icone: ListChecks, soDono: true },
  { chave: 'profissionais', href: '/painel/profissionais', icone: Users, soDono: true },
  {
    chave: 'jornada',
    href: '/painel/profissionais',
    icone: Clock3,
    soDono: false,
    soProfissional: true,
  },
  { chave: 'clientes', href: '/painel/clientes', icone: UserRound, soDono: true },
  { chave: 'politicas', href: '/painel/politicas', icone: SlidersHorizontal, soDono: true },
];

function Navegacao({ dono, aoNavegar }: { dono: boolean; aoNavegar?: () => void }) {
  const t = useTranslations('painel.nav');
  const caminho = usePathname();
  const itens = NAV.filter((i) => (dono ? !i.soProfissional : !i.soDono));
  return (
    <nav aria-label={t('rotulo')}>
      <ul className="flex flex-col gap-0.5">
        {itens.map((i) => {
          const ativo = i.href === '/painel' ? caminho === '/painel' : caminho.startsWith(i.href);
          const Icone = i.icone;
          return (
            <li key={i.chave}>
              <Link
                href={i.href}
                {...(aoNavegar === undefined ? {} : { onClick: aoNavegar })}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'texto-14 flex h-10 items-center gap-2.5 rounded-[10px] px-3 transition-colors duration-150',
                  ativo
                    ? 'bg-raised font-medium text-text'
                    : 'text-muted hover:bg-raised hover:text-text',
                )}
              >
                <Icone aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                {t(i.chave)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Usuario({ eu }: { eu: Eu }) {
  const t = useTranslations();
  const sair = useSair();
  const router = useRouter();
  const u = eu.usuario;
  return (
    <Menu.Root>
      <Menu.Trigger className="pressionavel flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left hover:bg-raised data-popup-open:bg-raised">
        <Iniciais nome={u.nome} tamanho="sm" />
        <span className="flex min-w-0 flex-col">
          <span className="texto-14 truncate font-medium">{u.nome}</span>
          <span className="texto-12 truncate text-muted">{t(`auth.papeis.${u.papel}`)}</span>
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={6} className="z-[60] outline-none">
          <Menu.Popup className="flutuante min-w-[220px] rounded-field bg-surface p-1 shadow-float outline-none">
            <p className="texto-12 truncate px-3 pt-2 pb-2 text-muted">{u.email}</p>
            <Menu.Item
              className="texto-14 flex h-10 cursor-default items-center gap-2.5 rounded-lg px-3 outline-none select-none data-highlighted:bg-raised"
              onClick={() =>
                sair.mutate(undefined, {
                  onSettled: () => {
                    toast(t('conta.saiu'));
                    router.push('/entrar');
                  },
                })
              }
            >
              <LogOut aria-hidden className="size-4 text-muted" />
              {t('conta.sair')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function Marca({ estab }: { estab: EstabelecimentoPainel }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-0.5 px-3">
      <Link href="/painel" className="texto-16 font-bold tracking-tight">
        {t('comum.pontual')}
      </Link>
      <p className="texto-12 truncate text-muted">
        {estab.nome} {t('comum.separador')} {t('painel.nav.escopo')}
      </p>
    </div>
  );
}

/**
 * Casca do painel: barra lateral clara na cor do fundo (Agenda, Encaixe, Serviços, Profissionais,
 * Clientes, Políticas), com o estabelecimento e a pessoa. O PROFISSIONAL vê só o que pode.
 * No celular, a barra vira um topo de 56 px com o menu numa folha.
 */
export function ShellPainel({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const eu = useEu();
  const estab = useEstabelecimentoPainel(
    eu.data !== undefined && eu.data.usuario.papel !== 'CLIENTE',
  );
  const [menu, setMenu] = useState(false);
  useRedirecionarSeSemSessao(eu.error, estab.error);

  if (eu.data === undefined || estab.data === undefined) {
    return (
      <div className="flex min-h-dvh">
        <aside className="hidden w-[232px] shrink-0 flex-col gap-6 border-r border-border p-4 lg:flex">
          <Esqueleto className="h-10 w-36" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Esqueleto key={i} className="h-8 w-full" />
            ))}
          </div>
        </aside>
        <main className="flex-1 p-4 lg:p-6">
          {eu.isError || estab.isError ? (
            <EstadoErro
              erro={eu.error ?? estab.error}
              aoTentar={() => {
                void eu.refetch();
                void estab.refetch();
              }}
            />
          ) : (
            <Carregando>
              <Esqueleto className="h-9 w-56" />
            </Carregando>
          )}
        </main>
      </div>
    );
  }

  const dono = eu.data.usuario.papel === 'DONO';
  const contexto = { eu: eu.data, estab: estab.data, dono };
  const verPagina = (
    <Link
      href={`/b/${estab.data.slug}`}
      target="_blank"
      className="texto-14 flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-muted hover:bg-raised hover:text-text"
    >
      <ExternalLink aria-hidden className="size-4" strokeWidth={1.75} />
      {t('painel.nav.verPagina')}
    </Link>
  );

  return (
    <Contexto.Provider value={contexto}>
      <a
        href="#conteudo"
        className="texto-14 sr-only rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70]"
      >
        {t('comum.pularParaConteudo')}
      </a>
      <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border px-2 py-5 lg:flex">
          <Marca estab={estab.data} />
          <Navegacao dono={dono} />
          <div className="mt-auto flex flex-col gap-2">
            {verPagina}
            <div className="px-1">
              <SeletorIdioma className="w-full justify-between" />
            </div>
            <Usuario eu={eu.data} />
          </div>
        </aside>

        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-ground px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label={t('painel.nav.abrirMenu')}
            className="pressionavel -ml-2 inline-flex size-10 items-center justify-center rounded-full text-text hover:bg-raised"
          >
            <IconeMenu aria-hidden className="size-5" />
          </button>
          <Link href="/painel" className="texto-16 font-bold tracking-tight">
            {t('comum.pontual')}
          </Link>
          <span className="texto-12 min-w-0 truncate text-muted">{estab.data.nome}</span>
        </header>
        <Folha aberta={menu} aoMudar={setMenu} titulo={estab.data.nome}>
          <div className="flex flex-col gap-4 pb-6">
            <Navegacao dono={dono} aoNavegar={() => setMenu(false)} />
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              {verPagina}
              <SeletorIdioma className="self-start" />
              <Usuario eu={eu.data} />
            </div>
          </div>
        </Folha>

        <main id="conteudo" className="min-w-0 px-4 pt-5 pb-12 lg:px-6 lg:pt-6">
          {children}
        </main>
      </div>
    </Contexto.Provider>
  );
}
