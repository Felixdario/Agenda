export const StatusAgendamento = {
  PENDENTE: 'PENDENTE',
  CONFIRMADO: 'CONFIRMADO',
  CONCLUIDO: 'CONCLUIDO',
  CANCELADO: 'CANCELADO',
  NAO_COMPARECEU: 'NAO_COMPARECEU',
} as const;

export type StatusAgendamento = (typeof StatusAgendamento)[keyof typeof StatusAgendamento];

export const STATUS_AGENDAMENTO = Object.values(StatusAgendamento) as [
  StatusAgendamento,
  ...StatusAgendamento[],
];

export const Papel = {
  DONO: 'DONO',
  PROFISSIONAL: 'PROFISSIONAL',
  CLIENTE: 'CLIENTE',
} as const;

export type Papel = (typeof Papel)[keyof typeof Papel];

export const PAPEIS = Object.values(Papel) as [Papel, ...Papel[]];
