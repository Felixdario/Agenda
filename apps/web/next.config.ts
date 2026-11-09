import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/** Endereço da API, visto pelo servidor do Next (o navegador só conhece /api, same-origin). */
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

const nextConfig: NextConfig = {
  // @agenda/shared exporta código-fonte TS; o Next precisa transpilá-lo.
  transpilePackages: ['@agenda/shared'],
  // O next dev não deve gerar AGENTS.md no repositório.
  agentRules: false,
  // Os testes E2E constroem numa pasta própria, sem tocar no .next do dev.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // D-17: proxy same-origin. O cookie httpOnly agenda_sessao fica first-party no domínio do web.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

const comIntl = createNextIntlPlugin('./src/i18n/request.ts');
export default comIntl(nextConfig);
