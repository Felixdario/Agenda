'use client';

import type { EstabelecimentoPublico, ServicoPublico } from '@agenda/shared';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Iniciais } from '@/components/comum/iniciais';
import { MolduraCliente } from '@/components/comum/moldura-cliente';
import { type EstadoFluxo, estadoParaUrl, lerEstadoDaUrl } from '@/components/reserva/estado';
import { FluxoReserva } from '@/components/reserva/fluxo-reserva';
import { estiloBotao } from '@/components/ui/botao';
import { Carregando, EstadoErro, EstadoVazio, Esqueleto } from '@/components/ui/estados';
import { useEstabelecimento } from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';

export function PaginaEstabelecimento({ slug }: { slug: string }) {
  const t = useTranslations();
  const consulta = useEstabelecimento(slug);
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const estado = lerEstadoDaUrl(new URLSearchParams(busca.toString()));

  const mudar = (novo: EstadoFluxo | null) => {
    router.replace(`${caminho}${estadoParaUrl(novo, new URLSearchParams(busca.toString()))}`, {
      scroll: false,
    });
  };

  if (consulta.isPending) {
    return (
      <MolduraCliente slug={slug} marca={false}>
        <Carregando>
          <CabecalhoEsqueleto />
          <ListaEsqueleto />
        </Carregando>
      </MolduraCliente>
    );
  }

  if (consulta.data === undefined) {
    const naoExiste = ehErroApi(consulta.error) && consulta.error.status === 404;
    return (
      <MolduraCliente slug={slug}>
        <div className="pt-8">
          {naoExiste ? (
            <EstadoVazio
              acao={
                <Link href="/" className={estiloBotao({ variante: 'secundario' })}>
                  {t('comum.irParaInicio')}
                </Link>
              }
            >
              {t('estabelecimento.naoEncontrado')}
            </EstadoVazio>
          ) : (
            <EstadoErro erro={consulta.error} aoTentar={() => void consulta.refetch()} />
          )}
        </div>
      </MolduraCliente>
    );
  }

  const estab = consulta.data;
  return (
    <MolduraCliente slug={slug} marca={false}>
      {consulta.isError ? (
        <EstadoErro
          erro={consulta.error}
          temDados
          aoTentar={() => void consulta.refetch()}
          className="mb-4"
        />
      ) : null}
      <Cabecalho estab={estab} />
      <ListaDeServicos
        estab={estab}
        aoEscolher={(s) => mudar({ servicoId: s.id, passo: 'profissional' })}
      />
      <FluxoReserva
        estab={estab}
        estado={estado}
        aoMudar={mudar}
        modo={{
          tipo: 'novo',
          enderecoDeVolta: (e) => `${caminho}${estadoParaUrl(e, new URLSearchParams())}`,
        }}
      />
    </MolduraCliente>
  );
}

function Cabecalho({ estab }: { estab: EstabelecimentoPublico }) {
  const t = useTranslations();
  const f = useFormatos(estab.fuso);
  return (
    <header className="flex items-center gap-4 pt-2 pb-6">
      <Iniciais nome={estab.nome} tamanho="lg" />
      <div className="min-w-0">
        <h1 className="texto-28 font-bold">{estab.nome}</h1>
        <p className="texto-14 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock aria-hidden className="size-4" />
            {t('comum.fusoDoEstabelecimento', { fuso: f.nomeDoFuso })}
          </span>
          <span className="texto-12 inline-flex h-6 items-center rounded-full bg-raised px-2.5 font-medium">
            {t('comum.demo')}
          </span>
        </p>
      </div>
    </header>
  );
}

function ListaDeServicos({
  estab,
  aoEscolher,
}: {
  estab: EstabelecimentoPublico;
  aoEscolher: (s: ServicoPublico) => void;
}) {
  const t = useTranslations();
  const f = useFormatos(estab.fuso);
  const servicos = [...estab.servicos].sort((a, b) => a.nome.localeCompare(b.nome, f.locale));
  return (
    <section aria-labelledby="titulo-servicos">
      <h2 id="titulo-servicos" className="texto-20 mb-3 font-semibold">
        {t('estabelecimento.servicos')}
      </h2>
      {servicos.length === 0 ? (
        <EstadoVazio>{t('estabelecimento.nenhumServico')}</EstadoVazio>
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-card border border-border bg-surface">
          {servicos.map((s) => {
            const total = s.preparoMin + s.duracaoMin + s.limpezaMin;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => aoEscolher(s)}
                  aria-label={t('estabelecimento.agendarServico', { servico: s.nome })}
                  data-servico={s.nome}
                  className="group flex min-h-[72px] w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-150 hover:bg-ground focus-visible:-outline-offset-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="texto-16 font-semibold break-words">{s.nome}</span>
                    <span className="texto-14 num text-muted">
                      {f.duracao(s.duracaoMin)}
                      {total > s.duracaoMin ? (
                        <span className="hidden sm:inline">
                          {` ${t('comum.separador')} `}
                          {t('estabelecimento.preparoLimpeza', { total: f.duracao(total) })}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="texto-16 num shrink-0 font-semibold">
                    {f.preco(s.precoCentavos)}
                  </span>
                  <span
                    aria-hidden
                    className={estiloBotao({
                      variante: 'secundario',
                      tamanho: 'md',
                      className: 'group-hover:border-muted max-[359px]:hidden',
                    })}
                  >
                    {t('estabelecimento.agendar')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CabecalhoEsqueleto() {
  return (
    <div className="flex items-center gap-4 pt-2 pb-6">
      <Esqueleto className="size-14 rounded-full" />
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-52" />
        <Esqueleto className="h-5 w-40" />
      </div>
    </div>
  );
}

function ListaEsqueleto() {
  return (
    <div className="flex flex-col gap-3">
      <Esqueleto className="h-7 w-24" />
      <div className="divide-y divide-rule rounded-card border border-border bg-surface">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex min-h-[72px] items-center gap-4 px-4">
            <div className="flex flex-1 flex-col gap-2">
              <Esqueleto className="h-5 w-40" />
              <Esqueleto className="h-4 w-16" />
            </div>
            <Esqueleto className="h-5 w-20" />
            <Esqueleto className="h-10 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
