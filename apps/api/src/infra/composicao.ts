import type { DependenciasApp, Hasher, Notificador, Registro } from '../application/portas-app';
import type { Relogio } from '../application/portas';
import type { Config } from './config';
import { criarNotificadorConsole, criarNotificadorSmtp, registroNoConsole } from './email';
import { type PrismaClient, UnidadeCadastroPrisma, UnidadeDeTrabalhoPrisma } from './prisma';
import { relogioDoSistema } from './relogio';
import { criarHasherArgon2 } from './seguranca';

/** Composição das dependências da aplicação. Os testes trocam relógio, notificador etc. */
export function criarDependencias(
  prisma: PrismaClient,
  opcoes: {
    readonly relogio?: Relogio;
    readonly notificador?: Notificador;
    readonly hasher?: Hasher;
    readonly registro?: Registro;
    readonly smtp?: Config['smtp'];
  } = {},
): DependenciasApp {
  return {
    uow: new UnidadeDeTrabalhoPrisma(prisma),
    cadastro: new UnidadeCadastroPrisma(prisma),
    relogio: opcoes.relogio ?? relogioDoSistema,
    hasher: opcoes.hasher ?? criarHasherArgon2(),
    notificador:
      opcoes.notificador ??
      (opcoes.smtp ? criarNotificadorSmtp(opcoes.smtp) : criarNotificadorConsole()),
    registro: opcoes.registro ?? registroNoConsole,
  };
}
