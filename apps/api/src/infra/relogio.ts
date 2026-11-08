import type { Relogio } from '../application/portas';

/** O único lugar do backend que lê o relógio do sistema. */
export const relogioDoSistema: Relogio = {
  agora: () => Date.now(),
};
