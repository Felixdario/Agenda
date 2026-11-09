'use client';

import type { AgendamentoLista } from '@agenda/shared';
import { Tabs } from '@base-ui/react/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErroDeRegra } from '@/components/comum/erro-de-regra';
import { GradeHorarios } from '@/components/reserva/grade-horarios';
import { Botao } from '@/components/ui/botao';
import { Campo, Entrada, Selecao } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Esqueleto } from '@/components/ui/estados';
import {
  useCriarBloqueio,
  useCriarExcecao,
  useEstabelecimento,
  useHorarios,
  useRemarcar,
} from '@/lib/consultas';
import { ehErroApi } from '@/lib/erros';
import { useFormatos } from '@/lib/formatos';
import { dataLocalDe, instanteDeLocal } from '@/lib/tempo';
import { usePainel } from './shell';

export interface PedidoDeBloqueio {
  profissionalId: string;
  data: string;
  inicio: string;
  fim: string;
}

const abaClasse =
  'texto-14 h-9 flex-1 rounded-full px-3 font-medium text-muted outline-none focus-visible:outline-2 focus-visible:outline-accent data-active:bg-surface data-active:text-text data-active:shadow-[0_1px_2px_rgb(0_0_0/0.06)]';

/**
 * Bloquear um intervalo (bloqueio pontual, RN-05) ou registrar uma folga (exceção, RN-04).
 * Aberto a partir da seleção na grade ou do botão "Bloquear horário" (alternativa por teclado).
 */
export function DialogoBloqueio({
  pedido,
  profissionais,
  aoFechar,
}: {
  pedido: PedidoDeBloqueio | null;
  profissionais: readonly { id: string; nome: string }[];
  aoFechar: () => void;
}) {
  return pedido === null ? null : (
    <FormBloqueio
      key={JSON.stringify(pedido)}
      pedido={pedido}
      profissionais={profissionais}
      aoFechar={aoFechar}
    />
  );
}

function FormBloqueio({
  pedido,
  profissionais,
  aoFechar,
}: {
  pedido: PedidoDeBloqueio;
  profissionais: readonly { id: string; nome: string }[];
  aoFechar: () => void;
}) {
  const t = useTranslations('painel.bloqueio');
  const tc = useTranslations('comum');
  const { estab } = usePainel();
  const [tipo, setTipo] = useState<'intervalo' | 'folga'>('intervalo');
  const [v, setV] = useState({ ...pedido, motivo: '', diaInteiro: true });
  const criarBloqueio = useCriarBloqueio();
  const criarExcecao = useCriarExcecao();
  const erro = tipo === 'intervalo' ? criarBloqueio.error : criarExcecao.error;
  const pendente = criarBloqueio.isPending || criarExcecao.isPending;

  const enviar = () => {
    if (tipo === 'intervalo') {
      criarBloqueio.mutate(
        {
          profissionalId: v.profissionalId,
          inicio: new Date(instanteDeLocal(v.data, v.inicio, estab.fuso)).toISOString(),
          fim: new Date(instanteDeLocal(v.data, v.fim, estab.fuso)).toISOString(),
          ...(v.motivo.trim() === '' ? {} : { motivo: v.motivo.trim() }),
        },
        {
          onSuccess: () => {
            toast.success(t('sucesso'));
            aoFechar();
          },
        },
      );
    } else {
      criarExcecao.mutate(
        {
          tipo: 'FOLGA',
          profissionalId: v.profissionalId,
          data: v.data,
          ...(v.diaInteiro ? {} : { inicio: v.inicio, fim: v.fim }),
        },
        {
          onSuccess: () => {
            toast.success(t('sucessoFolga'));
            aoFechar();
          },
        },
      );
    }
  };

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar();
      }}
      titulo={t('titulo')}
      largura="sm"
      rodape={
        <>
          <Botao onClick={aoFechar}>{tc('cancelar')}</Botao>
          <Botao
            variante="primario"
            carregando={pendente}
            onClick={enviar}
            data-testid="criar-bloqueio"
            exigeRede
          >
            {tipo === 'intervalo' ? t('criar') : t('criarFolga')}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs.Root value={tipo} onValueChange={(x) => setTipo(x as 'intervalo' | 'folga')}>
          <Tabs.List aria-label={t('tipo')} className="flex gap-1 rounded-full bg-raised p-1">
            <Tabs.Tab value="intervalo" className={abaClasse}>
              {t('intervalo')}
            </Tabs.Tab>
            <Tabs.Tab value="folga" className={abaClasse}>
              {t('folga')}
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
        <Campo id="b-prof" rotulo={t('profissional')}>
          <Selecao
            id="b-prof"
            value={v.profissionalId}
            onChange={(e) => setV({ ...v, profissionalId: e.target.value })}
          >
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="b-data" rotulo={t('data')}>
          <Entrada
            id="b-data"
            type="date"
            value={v.data}
            onChange={(e) => setV({ ...v, data: e.target.value })}
          />
        </Campo>
        {tipo === 'folga' ? (
          <label className="texto-14 flex items-center gap-2">
            <input
              type="checkbox"
              checked={v.diaInteiro}
              onChange={(e) => setV({ ...v, diaInteiro: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            {t('diaInteiro')}
          </label>
        ) : null}
        {tipo === 'intervalo' || !v.diaInteiro ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo id="b-inicio" rotulo={t('inicio')}>
              <Entrada
                id="b-inicio"
                type="time"
                step={300}
                value={v.inicio}
                onChange={(e) => setV({ ...v, inicio: e.target.value })}
              />
            </Campo>
            <Campo id="b-fim" rotulo={t('fim')}>
              <Entrada
                id="b-fim"
                type="time"
                step={300}
                value={v.fim}
                onChange={(e) => setV({ ...v, fim: e.target.value })}
              />
            </Campo>
          </div>
        ) : null}
        {tipo === 'intervalo' ? (
          <Campo id="b-motivo" rotulo={t('motivo')}>
            <Entrada
              id="b-motivo"
              maxLength={200}
              value={v.motivo}
              onChange={(e) => setV({ ...v, motivo: e.target.value })}
            />
          </Campo>
        ) : null}
        {ehErroApi(erro) ? (
          <ErroDeRegra erro={erro} contexto={{ estabelecimento: estab.nome, fuso: estab.fuso }} />
        ) : null}
      </div>
    </Dialogo>
  );
}

/** Confirmação simples (remover bloqueio, remover exceção). */
export function DialogoConfirmar({
  aberto,
  titulo,
  descricao,
  confirmar,
  pendente,
  erro,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  confirmar: string;
  pendente: boolean;
  erro: unknown;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  const t = useTranslations('comum');
  const { estab } = usePainel();
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(v) => {
        if (!v) aoFechar();
      }}
      titulo={titulo}
      descricao={descricao}
      largura="sm"
      rodape={
        <>
          <Botao onClick={aoFechar}>{t('cancelar')}</Botao>
          <Botao variante="perigo" carregando={pendente} onClick={aoConfirmar} exigeRede>
            {confirmar}
          </Botao>
        </>
      }
    >
      {ehErroApi(erro) ? (
        <ErroDeRegra erro={erro} contexto={{ estabelecimento: estab.nome, fuso: estab.fuso }} />
      ) : undefined}
    </Dialogo>
  );
}

/** Remarcar pelo painel: o balcão vê a grade sem antecedência nem horizonte (RN-20). */
export function DialogoRemarcarPainel({
  a,
  profissionais,
  aoFechar,
}: {
  a: AgendamentoLista | null;
  profissionais: readonly { id: string; nome: string }[];
  aoFechar: () => void;
}) {
  return a === null ? null : (
    <FormRemarcar key={a.id} a={a} profissionais={profissionais} aoFechar={aoFechar} />
  );
}

function FormRemarcar({
  a,
  profissionais,
  aoFechar,
}: {
  a: AgendamentoLista;
  profissionais: readonly { id: string; nome: string }[];
  aoFechar: () => void;
}) {
  const t = useTranslations();
  const { estab } = usePainel();
  const f = useFormatos(estab.fuso);
  const publico = useEstabelecimento(estab.slug);
  const executam =
    publico.data?.profissionais.filter((p) => p.servicoIds.includes(a.servico.id)) ?? profissionais;
  const [data, setData] = useState(dataLocalDe(a.inicio, estab.fuso));
  const [profissionalId, setProfissionalId] = useState(a.profissional.id);
  const [inicio, setInicio] = useState<string | undefined>(undefined);
  const horarios = useHorarios(estab.slug, a.servico.id, profissionalId, data);
  const remarcar = useRemarcar(estab.slug);
  const nome = executam.find((p) => p.id === profissionalId)?.nome ?? a.profissional.nome;

  return (
    <Dialogo
      aberto
      aoMudar={(v) => {
        if (!v) aoFechar();
      }}
      titulo={t('painel.remarcar.titulo', { cliente: a.cliente.nome })}
      descricao={`${a.servico.nome} ${t('comum.separador')} ${f.frase(f.dataCurta(a.inicio))} ${f.intervalo(a.inicio, a.fim)}`}
      largura="md"
      rodape={
        <>
          <Botao onClick={aoFechar}>{t('comum.cancelar')}</Botao>
          <Botao
            variante="primario"
            disabled={inicio === undefined}
            exigeRede
            carregando={remarcar.isPending}
            onClick={() => {
              if (inicio === undefined) return;
              remarcar.mutate(
                {
                  id: a.id,
                  inicio,
                  ...(profissionalId === a.profissional.id ? {} : { profissionalId }),
                },
                {
                  onSuccess: () => {
                    toast.success(t('fluxo.sucessoRemarcar'));
                    aoFechar();
                  },
                },
              );
            }}
          >
            {inicio === undefined
              ? t('painel.remarcar.escolha')
              : t('painel.remarcar.confirmar', { hora: f.hora(inicio) })}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="r-data" rotulo={t('painel.remarcar.data')}>
            <Entrada
              id="r-data"
              type="date"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                setInicio(undefined);
              }}
            />
          </Campo>
          <Campo id="r-prof" rotulo={t('painel.remarcar.profissional')}>
            <Selecao
              id="r-prof"
              value={profissionalId}
              onChange={(e) => {
                setProfissionalId(e.target.value);
                setInicio(undefined);
              }}
            >
              {executam.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="texto-14 font-semibold">{t('painel.remarcar.horarios')}</h3>
          {horarios.isPending ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Esqueleto key={i} className="h-12 rounded-full" />
              ))}
            </div>
          ) : horarios.data === undefined || horarios.data.length === 0 ? (
            <p className="texto-14 text-muted">{t('painel.remarcar.nenhum')}</p>
          ) : (
            <GradeHorarios
              horarios={horarios.data}
              escolhido={inicio}
              aoEscolher={setInicio}
              fuso={estab.fuso}
              nomeProfissional={nome}
              rotulo={t('painel.remarcar.horarios')}
            />
          )}
        </div>
        {ehErroApi(remarcar.error) ? (
          <ErroDeRegra
            erro={remarcar.error}
            contexto={{ estabelecimento: estab.nome, fuso: estab.fuso }}
          />
        ) : null}
      </div>
    </Dialogo>
  );
}
