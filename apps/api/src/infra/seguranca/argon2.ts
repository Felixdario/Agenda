import argon2 from 'argon2';
import type { Hasher } from '../../application/portas-app';

/** D-15: argon2id. Perfil padrão (OWASP): 19 MiB, 2 iterações. Em teste, um perfil barato. */
export const PERFIL_PRODUCAO = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
export const PERFIL_TESTE = { memoryCost: 1_024, timeCost: 1, parallelism: 1 } as const;

export function criarHasherArgon2(
  perfil: { memoryCost: number; timeCost: number; parallelism: number } = process.env.NODE_ENV ===
  'test'
    ? PERFIL_TESTE
    : PERFIL_PRODUCAO,
): Hasher {
  return {
    hash: (senha) => argon2.hash(senha, { type: argon2.argon2id, ...perfil }),
    async verificar(hash, senha) {
      try {
        return await argon2.verify(hash, senha);
      } catch {
        return false; // hash malformado
      }
    },
  };
}
