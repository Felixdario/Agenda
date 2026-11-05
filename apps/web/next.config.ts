import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @agenda/shared exporta código-fonte TS; o Next precisa transpilá-lo.
  transpilePackages: ['@agenda/shared'],
};

export default nextConfig;
