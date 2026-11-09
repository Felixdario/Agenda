import { createHash, randomBytes } from 'node:crypto';
import { CodigoErro, Papel, type UsuarioSessao } from '@agenda/shared';
import { type Resultado, falha, ok } from '../domain';
import type { AtorHttp, DependenciasApp, UsuarioDados } from './portas-app';

/** D-15: sessão de 7 dias. */
export const VALIDADE_SESSAO_MS = 7 * 24 * 3_600_000;

export const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function usuarioPublico(u: UsuarioDados): UsuarioSessao {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    estabelecimentoId: u.estabelecimentoId,
    profissionalId: u.profissionalId,
  };
}

const normalizarEmail = (email: string) => email.trim().toLowerCase();

/** D-15: cria um Usuario CLIENTE. */
export async function registrar(
  deps: DependenciasApp,
  dados: { readonly nome: string; readonly email: string; readonly senha: string },
): Promise<Resultado<UsuarioSessao>> {
  const email = normalizarEmail(dados.email);
  const senhaHash = await deps.hasher.hash(dados.senha);
  const criado = await deps.cadastro.transacao((repo) =>
    repo.criarUsuario({
      email,
      nome: dados.nome.trim(),
      senhaHash,
      papel: Papel.CLIENTE,
      estabelecimentoId: null,
      profissionalId: null,
    }),
  );
  if (criado === null) {
    return falha(CodigoErro.DADOS_INVALIDOS, { campos: { email: 'E-mail já cadastrado.' } });
  }
  return ok(usuarioPublico(criado));
}

// Hash fixo para a verificação "de mentira" quando o e-mail não existe: o tempo de resposta não
// revela se a conta existe.
let hashFicticio: Promise<string> | null = null;

/** Login: a mesma recusa para e-mail inexistente, senha errada ou conta sem senha. */
export async function entrar(
  deps: DependenciasApp,
  dados: { readonly email: string; readonly senha: string },
): Promise<Resultado<{ token: string; expiraEm: number; usuario: UsuarioSessao }>> {
  const usuario = await deps.cadastro.leitura((repo) =>
    repo.usuarioPorEmail(normalizarEmail(dados.email)),
  );
  if (usuario?.senhaHash == null) {
    hashFicticio ??= deps.hasher.hash('senha-ficticia-para-tempo-constante');
    await deps.hasher.verificar(await hashFicticio, dados.senha);
    return falha(CodigoErro.NAO_AUTENTICADO, { motivo: 'CREDENCIAIS_INVALIDAS' });
  }
  if (!(await deps.hasher.verificar(usuario.senhaHash, dados.senha))) {
    return falha(CodigoErro.NAO_AUTENTICADO, { motivo: 'CREDENCIAIS_INVALIDAS' });
  }
  const token = randomBytes(32).toString('base64url');
  const agora = deps.relogio.agora();
  const expiraEm = agora + VALIDADE_SESSAO_MS;
  await deps.cadastro.transacao((repo) =>
    repo.criarSessao({
      usuarioId: usuario.id,
      tokenHash: hashDoToken(token),
      criadaEm: agora,
      expiraEm,
    }),
  );
  return ok({ token, expiraEm, usuario: usuarioPublico(usuario) });
}

/** Logout: revoga a sessão (idempotente). */
export async function sair(deps: DependenciasApp, token: string): Promise<void> {
  await deps.cadastro.transacao((repo) =>
    repo.revogarSessao(hashDoToken(token), deps.relogio.agora()),
  );
}

/** Resolve o ator de um token. Sessão inexistente, revogada ou expirada → NAO_AUTENTICADO. */
export async function autenticar(
  deps: DependenciasApp,
  token: string,
): Promise<Resultado<{ ator: AtorHttp; usuario: UsuarioSessao }>> {
  const sessao = await deps.cadastro.leitura((repo) => repo.sessaoPorTokenHash(hashDoToken(token)));
  const agora = deps.relogio.agora();
  if (sessao === null || sessao.revogadaEm !== null || sessao.expiraEm <= agora) {
    return falha(CodigoErro.NAO_AUTENTICADO);
  }
  const u = sessao.usuario;
  return ok({
    ator: {
      usuarioId: u.id,
      papel: u.papel,
      estabelecimentoId: u.estabelecimentoId,
      profissionalId: u.profissionalId,
    },
    usuario: usuarioPublico(u),
  });
}
