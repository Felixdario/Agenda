import { z } from 'zod';

// Mensagens de validação em português, na API e no front.
z.config(z.locales.ptBR());

/** Instante ISO 8601 com offset (a API devolve sempre em UTC, com `Z`). */
export const instanteSchema = z.iso.datetime({ offset: true });
/** Data local do estabelecimento, "yyyy-MM-dd". */
export const dataLocalSchema = z.iso.date();
/** Hora local "HH:mm" ("24:00" só como fim de trecho). */
export const horaLocalSchema = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Use HH:mm');
export const idSchema = z.uuid();
