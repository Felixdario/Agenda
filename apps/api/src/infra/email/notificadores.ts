import nodemailer from 'nodemailer';
import type { Email, Notificador, Registro } from '../../application/portas-app';

const REMETENTE = 'Agenda <nao-responda@agenda.dev>';

/** RN-24: SMTP (em dev, o Mailpit em localhost:1025; UI em http://localhost:8025). */
export function criarNotificadorSmtp(opcoes: { host: string; port: number }): Notificador {
  const transporte = nodemailer.createTransport({
    host: opcoes.host,
    port: opcoes.port,
    secure: false,
  });
  return {
    async enviar(email: Email) {
      await transporte.sendMail({
        from: REMETENTE,
        to: email.para,
        subject: email.assunto,
        text: email.texto,
      });
    },
  };
}

/** Sem SMTP configurado: escreve o e-mail no console. */
export function criarNotificadorConsole(saida: (linha: string) => void = console.log): Notificador {
  return {
    enviar: async (email) =>
      saida(`[e-mail] para=${email.para} assunto="${email.assunto}"\n${email.texto}`),
  };
}

/** Para testes: guarda os e-mails enviados. */
export class NotificadorEmMemoria implements Notificador {
  readonly enviados: Email[] = [];
  falharProximos = 0;
  async enviar(email: Email) {
    if (this.falharProximos > 0) {
      this.falharProximos--;
      throw new Error('falha simulada de SMTP');
    }
    this.enviados.push(email);
  }
}

export const registroNoConsole: Registro = {
  erro: (mensagem, erro) => console.error(mensagem, erro),
};
