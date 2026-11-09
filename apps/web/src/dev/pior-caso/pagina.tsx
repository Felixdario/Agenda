'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { PaginaEstabelecimento } from '@/app/b/[slug]/pagina-estabelecimento';
import { PaginaMeusAgendamentos } from '@/app/meus-agendamentos/pagina-meus';
import { AgendaDoDia } from '@/app/painel/agenda-do-dia';
import Clientes from '@/app/painel/clientes/page';
import Profissionais from '@/app/painel/profissionais/page';
import Servicos from '@/app/painel/servicos/page';
import { MolduraCliente } from '@/components/comum/moldura-cliente';
import { ShellPainel } from '@/components/painel/shell';
import { useAgora } from '@/lib/agora';
import { dataLocalDe } from '@/lib/tempo';
import { CENARIOS, type Cenario, ROTULOS, SLUG_FIXTURE, TELAS, type Tela } from './dados';
import {
  configurar,
  definirOnline,
  desinstalarInterceptador,
  instalarInterceptador,
} from './interceptador';

const ehCenario = (v: string | null): v is Cenario => CENARIOS.includes(v as Cenario);
const ehTela = (v: string | null): v is Tela => TELAS.includes(v as Tela);

/**
 * Página de desenvolvimento do break-ui: renderiza as telas reais com os dados de demo (API real)
 * ou com as fixtures de pior caso, trocando só a fronteira de dados. Estado na URL:
 * `?cenario=pior|sem-vaga|vazio|demo&tela=…&offline=1`.
 */
export function PaginaPiorCaso() {
  const busca = useSearchParams();
  const router = useRouter();
  const caminho = usePathname();
  const qc = useQueryClient();
  const cenario: Cenario = ehCenario(busca.get('cenario'))
    ? (busca.get('cenario') as Cenario)
    : 'pior';
  const tela: Tela = ehTela(busca.get('tela')) ? (busca.get('tela') as Tela) : 'publica';
  const offline = busca.get('offline') === '1';
  const chave = `${cenario}|${tela}`;
  // Só no cliente: o interceptador troca o fetch do navegador.
  const agora = useAgora();
  const noCliente = agora !== 0;
  // O interceptador é configurado antes de as telas montarem (as consultas já saem com a fixture).
  if (noCliente) {
    instalarInterceptador();
    configurar(cenario, offline, dataLocalDe(agora, 'America/Sao_Paulo'));
  }

  useEffect(() => definirOnline(!offline), [offline]);
  useEffect(() => () => desinstalarInterceptador(), []);

  const ir = (mudanca: Record<string, string | null>) => {
    const p = new URLSearchParams();
    p.set('cenario', mudanca['cenario'] ?? cenario);
    p.set('tela', mudanca['tela'] ?? tela);
    const off = 'offline' in mudanca ? mudanca['offline'] : offline ? '1' : null;
    if (off === '1') p.set('offline', '1');
    if ('data' in mudanca && mudanca['data'] !== null) p.set('data', mudanca['data']!);
    // Cenário ou tela novos: nada do cache anterior sobrevive. Offline mantém o cache (é o ponto).
    if (p.get('cenario') !== cenario || p.get('tela') !== tela) qc.clear();
    router.replace(`${caminho}?${p.toString()}`, { scroll: false });
  };

  const conteudo = !noCliente ? null : tela === 'publica' ? (
    <PaginaEstabelecimento slug={cenario === 'demo' ? 'navalha-e-cafe' : SLUG_FIXTURE} />
  ) : tela === 'meus' ? (
    <MolduraCliente>
      <PaginaMeusAgendamentos />
    </MolduraCliente>
  ) : (
    <ShellPainel>
      {tela === 'painel-agenda' ? (
        <AgendaDoDia />
      ) : tela === 'painel-servicos' ? (
        <Servicos />
      ) : tela === 'painel-profissionais' ? (
        <Profissionais />
      ) : (
        <Clientes />
      )}
    </ShellPainel>
  );

  return (
    <>
      <div key={chave} className="pb-28">
        {conteudo}
      </div>
      <div
        data-testid="toggle-pior-caso"
        className="fixed bottom-3 left-1/2 z-30 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl bg-[#e5e7eb] p-1 font-[system-ui] text-[12px] text-[#111] shadow-[0_1px_3px_rgb(0_0_0/0.2)]"
      >
        {CENARIOS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === cenario}
            onClick={() => ir({ cenario: c })}
            className={`h-7 rounded-lg px-2.5 ${c === cenario ? 'bg-white font-semibold' : ''}`}
          >
            {ROTULOS[c]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={offline}
          onClick={() => ir({ offline: offline ? null : '1' })}
          className={`h-7 rounded-lg px-2.5 ${offline ? 'bg-white font-semibold' : ''}`}
        >
          {offline ? ROTULOS.offline : ROTULOS.online}
        </button>
        <select
          aria-label="tela"
          value={tela}
          onChange={(e) => ir({ tela: e.target.value })}
          className="h-7 rounded-lg bg-white px-1.5"
        >
          {TELAS.map((t) => (
            <option key={t} value={t}>
              {ROTULOS[t]}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
