'use client';

import { CalendarSearch, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { Botao } from '@/components/ui/botao';
import { cn } from '@/lib/cn';
import { useFormatos } from '@/lib/formatos';
import { dataLocalDe } from '@/lib/tempo';

/**
 * A recusa com saída (409): o horário perdido aparece riscado e encolhe; os próximos horários
 * livres (até 5, da API) entram em sequência e são clicáveis direto: cada um recomeça a
 * confirmação com uma Idempotency-Key nova.
 */
export function Recusa({
  perdido,
  proximos,
  fuso,
  marcando,
  nomeProfissional,
  aoEscolher,
  aoOutroDia,
}: {
  perdido: string;
  proximos: readonly string[];
  fuso: string;
  marcando: string | null;
  nomeProfissional: string | null;
  aoEscolher: (inicio: string) => void;
  aoOutroDia: () => void;
}) {
  const t = useTranslations();
  const f = useFormatos(fuso);
  const diaPerdido = dataLocalDe(perdido, fuso);

  return (
    <section
      aria-labelledby="titulo-recusa"
      className="passo-entra flex flex-col gap-5"
      data-testid="recusa"
    >
      <div role="alert" className="flex flex-col gap-1">
        <h3 id="titulo-recusa" className="texto-20 font-semibold">
          {t('recusa.titulo')}
        </h3>
        <p className="texto-14 text-muted">{t('recusa.explica')}</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="texto-14 font-medium">{f.frase(f.dataLonga(perdido))}</p>
        <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">
          <span
            aria-label={t('recusa.perdido', { hora: f.hora(perdido) })}
            className="pilula-perdida texto-16 num inline-flex h-12 items-center justify-center rounded-full border border-dashed border-control font-semibold text-muted line-through"
          >
            {f.hora(perdido)}
          </span>
          {proximos.map((inicio, i) => {
            const outroDia = dataLocalDe(inicio, fuso) !== diaPerdido;
            const ocupado = marcando === inicio;
            return (
              <button
                key={inicio}
                type="button"
                style={{ '--ordem': i } as CSSProperties}
                disabled={marcando !== null}
                aria-busy={ocupado || undefined}
                aria-label={
                  nomeProfissional === null
                    ? t('fluxo.rotuloHorarioQualquer', {
                        data: f.dataLonga(inicio),
                        hora: f.hora(inicio),
                      })
                    : t('fluxo.rotuloHorario', {
                        data: f.dataLonga(inicio),
                        hora: f.hora(inicio),
                        profissional: nomeProfissional,
                      })
                }
                onClick={() => aoEscolher(inicio)}
                data-inicio={inicio}
                className={cn(
                  'pilula-entra pressionavel num flex h-12 flex-col items-center justify-center rounded-full border border-accent bg-surface font-semibold text-accent hover:bg-accent-soft disabled:opacity-70',
                  outroDia ? 'texto-14 leading-4' : 'texto-16',
                )}
              >
                {ocupado ? (
                  <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
                ) : (
                  <>
                    {outroDia ? (
                      <span className="texto-12 font-medium text-muted">{f.dataCurta(inicio)}</span>
                    ) : null}
                    <span>{f.hora(inicio)}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {proximos.length === 0 ? <p className="texto-14 text-muted">{t('recusa.nenhum')}</p> : null}
      </div>

      <Botao
        variante="secundario"
        tamanho="lg"
        icone={<CalendarSearch aria-hidden className="size-4" />}
        onClick={aoOutroDia}
        className="self-start"
      >
        {t('recusa.outroDia')}
      </Botao>
    </section>
  );
}
