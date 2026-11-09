import { type NextRequest, NextResponse } from 'next/server';

/**
 * Proxy do Next (antigo middleware): só protege rotas (D-17). A verdade continua na API; aqui a
 * sessão é conferida em GET /auth/eu para mandar quem não pode direto para o lugar certo.
 * - `/painel/*` exige DONO ou PROFISSIONAL;
 * - `/meus-agendamentos` exige sessão.
 */
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const COOKIE_SESSAO = 'agenda_sessao';

function paraEntrar(req: NextRequest) {
  const destino = new URL('/entrar', req.url);
  destino.searchParams.set('voltar', `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(destino);
}

async function papelDaSessao(req: NextRequest): Promise<string | null | 'indisponivel'> {
  const token = req.cookies.get(COOKIE_SESSAO)?.value;
  if (token === undefined || token === '') return null;
  try {
    const r = await fetch(`${API_URL}/auth/eu`, {
      headers: { cookie: `${COOKIE_SESSAO}=${token}`, accept: 'application/json' },
      cache: 'no-store',
    });
    if (r.status === 401) return null;
    if (!r.ok) return 'indisponivel';
    const corpo = (await r.json()) as { usuario?: { papel?: string } };
    return corpo.usuario?.papel ?? null;
  } catch {
    // API fora do ar: deixa a página abrir e mostrar o próprio estado de erro de rede.
    return 'indisponivel';
  }
}

export async function proxy(req: NextRequest) {
  const papel = await papelDaSessao(req);
  if (papel === 'indisponivel') return NextResponse.next();
  if (papel === null) return paraEntrar(req);
  if (req.nextUrl.pathname.startsWith('/painel') && papel === 'CLIENTE') {
    return NextResponse.redirect(new URL('/meus-agendamentos', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/painel', '/painel/:path*', '/meus-agendamentos'],
};
