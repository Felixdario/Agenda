/**
 * Idempotency-Key por tentativa de confirmação (RN-22, D-17).
 *
 * - A mesma escolha (serviço, profissional, início) reusa a mesma chave: clicar de novo em
 *   "Confirmar" ou repetir depois de uma falha de rede não cria um segundo agendamento.
 * - Uma escolha nova (outro horário, inclusive uma pílula da recusa 409) gera uma chave nova.
 * - Depois de uma resposta definitiva (sucesso), `encerrar()` descarta a chave.
 */

export interface EscolhaDeHorario {
  servicoId: string;
  /** `null` = qualquer profissional. */
  profissionalId: string | null;
  inicio: string;
}

const assinatura = (e: EscolhaDeHorario) => `${e.servicoId}|${e.profissionalId ?? '*'}|${e.inicio}`;

export interface ChavesDeIdempotencia {
  chavePara(escolha: EscolhaDeHorario): string;
  encerrar(): void;
}

export function criarChavesDeIdempotencia(
  gerar: () => string = () => crypto.randomUUID(),
): ChavesDeIdempotencia {
  let atual: { assinatura: string; chave: string } | null = null;
  return {
    chavePara(escolha) {
      const a = assinatura(escolha);
      if (atual === null || atual.assinatura !== a) atual = { assinatura: a, chave: gerar() };
      return atual.chave;
    },
    encerrar() {
      atual = null;
    },
  };
}
