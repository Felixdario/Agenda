/**
 * Fronteira de dados do pior caso: troca as respostas de `/api/...` pelas fixtures, no mesmo
 * lugar em que a API real entra (Hard Rule 2 do break-ui: muda o dado, não o componente).
 * Só a página `/dev/pior-caso` instala este interceptador.
 */
import { onlineManager } from '@tanstack/react-query';
import { type Cenario, type Fixture, fixtureDo } from './dados';

interface Estado {
  cenario: Cenario;
  offline: boolean;
  fixture: Fixture | null;
}

const estado: Estado = { cenario: 'pior', offline: false, fixture: null };
let fetchOriginal: typeof fetch | null = null;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const erro = (codigo: string, status: number, detalhes?: Record<string, unknown>) =>
  json({ codigo, mensagem: codigo, ...(detalhes === undefined ? {} : { detalhes }) }, status);

function responder(f: Fixture, url: URL, metodo: string, corpo: unknown): Response {
  const p = url.pathname.replace(/^\/api/, '');
  const q = url.searchParams;
  if (metodo !== 'GET') {
    if (/^\/estabelecimentos\/[^/]+\/agendamentos$/.test(p)) {
      const inicio = (corpo as { inicio?: string } | null)?.inicio ?? new Date().toISOString();
      return erro('HORARIO_INDISPONIVEL', 409, { proximosHorarios: f.proximos(inicio) });
    }
    return erro('TRANSICAO_DE_STATUS_INVALIDA', 422);
  }
  if (p === '/auth/eu') return json(f.eu);
  if (/^\/estabelecimentos\/[^/]+$/.test(p)) return json(f.estabelecimento);
  if (/^\/estabelecimentos\/[^/]+\/horarios$/.test(p)) {
    return json(f.horarios(q.get('servicoId') ?? '', q.get('profissionalId'), q.get('data') ?? ''));
  }
  if (p === '/eu/agendamentos') {
    return json(q.get('escopo') === 'passados' ? f.meus.passados : f.meus.futuros);
  }
  if (p === '/painel/estabelecimento') return json(f.estabelecimentoPainel);
  if (p === '/painel/agenda') return json(f.agenda(q.get('data') ?? ''));
  if (p === '/painel/servicos') return json(f.servicos);
  if (p === '/painel/profissionais') return json(f.profissionais);
  if (p === '/painel/clientes') return json(f.clientes);
  const jornada = /^\/painel\/profissionais\/([^/]+)\/jornada$/.exec(p);
  if (jornada !== null) return json({ profissionalId: jornada[1], dias: f.jornada });
  if (/^\/agendamentos\/[^/]+\/historico$/.test(p)) return json(f.historico);
  return erro('NAO_ENCONTRADO', 404);
}

/** Instala (uma vez) o fetch que serve as fixtures. Cenário "demo" passa direto para a API real. */
export function instalarInterceptador() {
  if (fetchOriginal !== null || typeof window === 'undefined') return;
  fetchOriginal = window.fetch.bind(window);
  window.fetch = async (entrada, init) => {
    const url = new URL(
      typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
      window.location.origin,
    );
    if (!url.pathname.startsWith('/api/')) return fetchOriginal!(entrada, init);
    if (estado.offline) throw new TypeError('Failed to fetch');
    if (estado.cenario === 'demo' || estado.fixture === null) return fetchOriginal!(entrada, init);
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const corpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
    await new Promise((r) => setTimeout(r, 150)); // latência plausível: os skeletons aparecem
    return responder(estado.fixture, url, metodo, corpo);
  };
}

export function desinstalarInterceptador() {
  if (fetchOriginal === null) return;
  window.fetch = fetchOriginal;
  fetchOriginal = null;
  onlineManager.setOnline(true);
}

export function configurar(cenario: Cenario, offline: boolean, hoje: string) {
  estado.cenario = cenario;
  estado.fixture = cenario === 'demo' ? null : fixtureDo(cenario, hoje);
  estado.offline = offline;
}

/** O mesmo sinal que o navegador daria: o TanStack pausa, o aviso aparece, voltar revalida. */
export function definirOnline(online: boolean) {
  onlineManager.setOnline(online);
}
