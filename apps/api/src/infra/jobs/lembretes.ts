import { enviarLembretes } from '../../application/notificacoes';
import type { DependenciasApp } from '../../application/portas-app';

/**
 * RN-24: roda o envio de lembretes a cada `intervaloMs` (padrão 1 min). Devolve a função que para o
 * job. Uma rodada não começa enquanto a anterior não terminou; a marcação atômica no banco impede
 * envio duplo mesmo com várias instâncias.
 */
export function iniciarJobDeLembretes(deps: DependenciasApp, intervaloMs = 60_000): () => void {
  let rodando = false;
  const rodada = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await enviarLembretes(deps);
    } catch (erro) {
      deps.registro.erro('Falha no job de lembretes', erro);
    } finally {
      rodando = false;
    }
  };
  const timer = setInterval(() => void rodada(), intervaloMs);
  timer.unref();
  return () => clearInterval(timer);
}
