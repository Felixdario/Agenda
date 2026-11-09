'use client';

import type { HorarioOferecido } from '@agenda/shared';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useFormatos } from '@/lib/formatos';
import { agruparPorPeriodo, proximoIndice } from '@/lib/horarios';

/** Quantas colunas a grade tem agora (3 no celular, 4 a partir de 400 px). */
function colunasDa(grade: HTMLElement | null): number {
  if (grade === null) return 3;
  const colunas = getComputedStyle(grade).gridTemplateColumns.split(' ').filter(Boolean).length;
  return colunas > 0 ? colunas : 3;
}

/**
 * Horários em pílulas, agrupados em manhã, tarde e noite. Funciona só com teclado: um único ponto
 * de tabulação (roving tabindex) e setas para andar; Enter ou espaço escolhe. Cada pílula tem o
 * rótulo completo ("sábado, 14 de novembro, 10:00, com Rafael Moura").
 */
export function GradeHorarios({
  horarios,
  escolhido,
  aoEscolher,
  fuso,
  nomeProfissional,
  rotulo,
}: {
  horarios: readonly HorarioOferecido[];
  escolhido: string | undefined;
  aoEscolher: (inicio: string) => void;
  fuso: string;
  /** Nome do profissional escolhido, ou `null` para "qualquer profissional". */
  nomeProfissional: string | null;
  rotulo: string;
}) {
  const t = useTranslations('fluxo');
  const f = useFormatos(fuso);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const grupos = agruparPorPeriodo(horarios, fuso);
  const lista = grupos.flatMap((g) => g.horarios);
  const indiceEscolhido = lista.findIndex((h) => h.inicio === escolhido);
  const focavel = indiceEscolhido >= 0 ? indiceEscolhido : 0;

  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, atual: number) => {
    const grade = e.currentTarget.parentElement;
    const proximo = proximoIndice(atual, e.key, lista.length, colunasDa(grade));
    if (proximo === null) return;
    e.preventDefault();
    botoes.current[proximo]?.focus();
  };

  const deslocamentos = grupos.map((_, k) =>
    grupos.slice(0, k).reduce((soma, g) => soma + g.horarios.length, 0),
  );
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-col gap-5">
      {grupos.map((g, k) => (
        <section key={g.periodo} aria-label={t(`periodos.${g.periodo}`)}>
          <h4 className="texto-14 mb-2 font-medium text-muted">{t(`periodos.${g.periodo}`)}</h4>
          <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">
            {g.horarios.map((h, j) => {
              const i = (deslocamentos[k] ?? 0) + j;
              const marcado = h.inicio === escolhido;
              const rotuloCompleto =
                nomeProfissional === null
                  ? t('rotuloHorarioQualquer', {
                      data: f.dataLonga(h.inicio),
                      hora: f.hora(h.inicio),
                    })
                  : t('rotuloHorario', {
                      data: f.dataLonga(h.inicio),
                      hora: f.hora(h.inicio),
                      profissional: nomeProfissional,
                    });
              return (
                <button
                  key={h.inicio}
                  ref={(el) => {
                    botoes.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  aria-label={rotuloCompleto}
                  tabIndex={i === focavel ? 0 : -1}
                  onClick={() => aoEscolher(h.inicio)}
                  onKeyDown={(e) => aoTeclar(e, i)}
                  data-inicio={h.inicio}
                  className={cn(
                    'pressionavel texto-16 num h-12 rounded-full border font-semibold',
                    marcado
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-control bg-surface text-text hover:border-muted',
                  )}
                >
                  {f.hora(h.inicio)}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
