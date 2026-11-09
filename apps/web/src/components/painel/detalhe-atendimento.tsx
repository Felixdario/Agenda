'use client';

import type { AgendamentoLista } from '@agenda/shared';
import { Check, CalendarClock, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { PilulaDeStatus } from '@/components/comum/status';
import { BlocoOcupado } from '@/components/reserva/bloco-ocupado';
import { Botao } from '@/components/ui/botao';
import { AreaDeTexto, Campo } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Esqueleto } from '@/components/ui/estados';
import { useAgora } from '@/lib/agora';
import { type AcaoDeStatus, useHistorico, useMudarStatus } from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';

/**
 * Detalhe do atendimento (à direita no desktop, numa folha no celular): o bloco ocupado, o
 * histórico e as ações que o status permite. A ação destrutiva (cancelar) fica isolada no fim.
 */
export function DetalheAtendimento({
  a,
  estabelecimento,
  aoRemarcar,
}: {
  a: AgendamentoLista;
  estabelecimento: string;
  aoRemarcar: () => void;
}) {
  const t = useTranslations();
  const f = useFormatos(a.estabelecimento.fuso);
  const agora = useAgora();
  const mudar = useMudarStatus(a.estabelecimento.slug);
  const historico = useHistorico(a.id);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ultimaAcao, setUltimaAcao] = useState<AcaoDeStatus | null>(null);

  const comecou = agora !== 0 && agora >= Date.parse(a.inicio);
  const ativo = a.status === 'PENDENTE' || a.status === 'CONFIRMADO';

  const executar = (acao: AcaoDeStatus, m?: string) => {
    setUltimaAcao(acao);
    mudar.mutate(
      { id: a.id, acao, ...(m === undefined ? {} : { motivo: m }) },
      {
        onSuccess: () => {
          toast.success(t(`painel.detalhe.sucesso.${acao}`));
          setCancelar(false);
          setMotivo('');
        },
      },
    );
  };
  const pendente = (acao: AcaoDeStatus) => mudar.isPending && ultimaAcao === acao;

  return (
    <div className="flex flex-col gap-5" data-testid="detalhe-atendimento">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="texto-20 truncate font-semibold">{a.cliente.nome}</h2>
          <p className="texto-14 truncate text-muted">{a.cliente.email}</p>
        </div>
        <PilulaDeStatus status={a.status} />
      </header>

      <dl className="flex flex-col gap-3">
        <Linha rotulo={t('painel.detalhe.servico')}>
          <span className="font-medium">{a.servico.nome}</span>
        </Linha>
        <Linha rotulo={t('painel.detalhe.horario')}>
          <span className="font-medium">{f.frase(f.dataLonga(a.inicio))}</span>
          <span className="num text-muted">{f.intervalo(a.inicio, a.fim)}</span>
        </Linha>
        <Linha rotulo={t('painel.detalhe.profissional')}>
          <span className="font-medium">{a.profissional.nome}</span>
        </Linha>
        <Linha rotulo={t('painel.detalhe.preco')}>
          <span className="num font-medium">{f.preco(a.servico.precoCentavos)}</span>
        </Linha>
      </dl>

      <BlocoOcupado
        inicio={a.inicio}
        duracaoMin={a.servico.duracaoMin}
        preparoMin={a.servico.preparoMin}
        limpezaMin={a.servico.limpezaMin}
        fuso={a.estabelecimento.fuso}
      />

      {ehErroApi(mudar.error) ? (
        <ErroDeRegra
          erro={mudar.error}
          contexto={{ estabelecimento, fuso: a.estabelecimento.fuso }}
        />
      ) : null}

      <section aria-labelledby="titulo-acoes" className="flex flex-col gap-3">
        <h3 id="titulo-acoes" className="texto-14 font-semibold">
          {t('painel.detalhe.acoes')}
        </h3>
        {ativo ? (
          <>
            <div className="flex flex-wrap gap-2">
              {a.status === 'PENDENTE' ? (
                <Botao
                  variante="primario"
                  icone={<Check aria-hidden className="size-4" />}
                  carregando={pendente('confirmar')}
                  exigeRede
                  disabled={mudar.isPending}
                  onClick={() => executar('confirmar')}
                >
                  {t('painel.detalhe.confirmar')}
                </Botao>
              ) : null}
              {a.status === 'CONFIRMADO' ? (
                <>
                  <Botao
                    variante="primario"
                    icone={<Check aria-hidden className="size-4" />}
                    carregando={pendente('concluir')}
                    exigeRede
                    disabled={mudar.isPending || !comecou}
                    onClick={() => executar('concluir')}
                  >
                    {t('painel.detalhe.concluir')}
                  </Botao>
                  <Botao
                    icone={<UserX aria-hidden className="size-4" />}
                    carregando={pendente('nao-compareceu')}
                    exigeRede
                    disabled={mudar.isPending || !comecou}
                    onClick={() => executar('nao-compareceu')}
                  >
                    {t('painel.detalhe.falta')}
                  </Botao>
                </>
              ) : null}
              <Botao
                icone={<CalendarClock aria-hidden className="size-4" />}
                exigeRede
                disabled={mudar.isPending}
                onClick={aoRemarcar}
              >
                {t('painel.detalhe.remarcar')}
              </Botao>
            </div>
            {a.status === 'CONFIRMADO' && !comecou ? (
              <p className="texto-12 text-muted">
                {t('painel.detalhe.aguardandoInicio', { hora: f.hora(a.inicio) })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="texto-14 text-muted">{t('painel.detalhe.semAcoes')}</p>
        )}
      </section>

      <section aria-labelledby="titulo-historico" className="flex flex-col gap-2">
        <h3 id="titulo-historico" className="texto-14 font-semibold">
          {t('painel.detalhe.historico')}
        </h3>
        {historico.isPending ? (
          <div className="flex flex-col gap-2">
            <Esqueleto className="h-4 w-56" />
            <Esqueleto className="h-4 w-44" />
          </div>
        ) : historico.data === undefined ? (
          <p className="texto-14 text-muted">{t('comum.erroAoCarregar')}</p>
        ) : historico.data.length === 0 ? (
          <p className="texto-14 text-muted">{t('painel.detalhe.historicoVazio')}</p>
        ) : (
          <ol className="flex flex-col gap-2 border-l border-border pl-4">
            {historico.data.map((h, i) => (
              <li key={i} className="texto-14 flex flex-col">
                <span>
                  {h.tipo === 'REMARCACAO' && h.inicioAnterior !== null && h.inicioNovo !== null
                    ? t('painel.detalhe.remarcado', {
                        anterior: `${f.dataCurta(h.inicioAnterior)} ${f.hora(h.inicioAnterior)}`,
                        novo: `${f.dataCurta(h.inicioNovo)} ${f.hora(h.inicioNovo)}`,
                      })
                    : h.de === null
                      ? t('painel.detalhe.criado', {
                          status: t(`status.${h.para ?? 'CONFIRMADO'}`),
                        })
                      : t('painel.detalhe.mudou', {
                          de: t(`status.${h.de}`),
                          para: t(`status.${h.para ?? h.de}`),
                        })}
                </span>
                <span className="texto-12 num text-muted">{f.dataHora(h.em)}</span>
                {h.motivo === null ? null : (
                  <span className="texto-12 text-muted">
                    {t('painel.detalhe.motivo', { motivo: h.motivo })}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {ativo ? (
        <div className="border-t border-border pt-4">
          <Botao
            variante="perigo"
            onClick={() => setCancelar(true)}
            exigeRede
            disabled={mudar.isPending}
          >
            {t('painel.detalhe.cancelar')}
          </Botao>
        </div>
      ) : null}

      <Dialogo
        aberto={cancelar}
        aoMudar={setCancelar}
        largura="sm"
        titulo={t('painel.detalhe.cancelarDialogo.titulo', { cliente: a.cliente.nome })}
        descricao={t('painel.detalhe.cancelarDialogo.descricao', {
          servico: a.servico.nome,
          data: f.dataCurta(a.inicio),
          hora: f.hora(a.inicio),
        })}
        rodape={
          <>
            <Botao onClick={() => setCancelar(false)}>{t('meus.cancelarDialogo.manter')}</Botao>
            <Botao
              variante="perigo"
              carregando={pendente('cancelar')}
              onClick={() => executar('cancelar', motivo)}
            >
              {t('painel.detalhe.cancelar')}
            </Botao>
          </>
        }
      >
        <Campo id="motivo-painel" rotulo={t('meus.cancelarDialogo.motivo')}>
          <AreaDeTexto
            id="motivo-painel"
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Campo>
      </Dialogo>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
      <dt className="texto-14 text-muted">{rotulo}</dt>
      <dd className="texto-14 flex flex-col">{children}</dd>
    </div>
  );
}
