import { tracoDoLote, type Caso } from "@/lib/caso";
import { AmostraLote } from "@/components/AmostraLote";
import { ATRIBUICAO_FUNDO, CASCO_DO_FUNDO } from "@/lib/mapa";
import type { ResultadoArea } from "@/lib/geo/area";
import type { Sobreposicao } from "@/lib/geo/sobreposicao";
import { formatarGrau, formatarHa } from "@/lib/formatar";
import { formatarCoordenada, medidaDoElemento } from "@/lib/ficha";
import type { Captura } from "@/lib/captura";

interface Props {
  captura: Captura;
  caso: Caso;
  areas: Map<string, ResultadoArea>;
  sobreposicoes: Sobreposicao[];
}

/** Página A4 paisagem; só aparece na impressão (ver index.css). */
const MAX_ATRIBUTOS_LEGENDA = 3;
const MAX_PONTOS_QUADRO = 12;

export function FolhaImpressao({ captura, caso, areas, sobreposicoes }: Props) {
  const { cantos } = captura;
  const linhas = caso.elementos.filter((e) => e.tipo === "linha");
  const pontos = caso.elementos.filter((e) => e.tipo === "ponto");
  const pontosSimples = pontos.flatMap((e) =>
    e.geometria.type === "Point"
      ? [{ nome: e.nome, coordenada: e.geometria.coordinates }]
      : [],
  );
  return (
    <div className="folha-impressao">
      <header className="flex items-baseline justify-between border-b pb-1">
        <h1 className="text-base font-semibold">
          {caso.nome || "Mapa do caso"}
        </h1>
        <span className="text-xs">{caso.comarca}</span>
      </header>

      <div className="mt-2 flex gap-3">
        <div className="min-w-0 flex-1">
          {/* Altura máxima de 140 mm para mapa, quadro de pontos e rodapé caberem numa folha A4 deitada */}
          <figure
            className="relative border"
            style={{
              aspectRatio: String(captura.proporcao),
              width: `min(100%, calc(140mm * ${captura.proporcao}))`,
            }}
          >
            <img
              src={captura.imagem}
              alt="Mapa do caso"
              className="h-full w-full"
            />
            {captura.rotulos.map((r, i) => (
              <span
                key={i}
                className={
                  r.tipo === "sobreposicao"
                    ? "rotulo-mapa rotulo-disputa absolute"
                    : "rotulo-mapa absolute"
                }
                style={{
                  left: `${r.xPct}%`,
                  top: `${r.yPct}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {r.texto}
              </span>
            ))}
            <div className="absolute right-2 top-2 flex flex-col items-center rounded bg-white/90 px-1.5 py-1 text-[10px] font-bold">
              <svg
                width="16"
                height="22"
                viewBox="0 0 16 22"
                aria-label="Norte"
              >
                <path d="M8 0 L15 20 L8 15 L1 20 Z" fill="black" />
              </svg>
              N
            </div>
            <div
              className="absolute bottom-2 left-2 rounded bg-white/90 px-1.5 py-1 text-[10px]"
              style={{ width: `calc(${captura.escala.larguraPct}% + 12px)` }}
            >
              <div className="h-1.5 border-x-2 border-b-2 border-black" />
              <div className="text-center">{captura.escala.rotulo}</div>
            </div>
            <span className="absolute left-1 top-1 text-[8px]">
              {formatarGrau(cantos.norte, "lat")} ·{" "}
              {formatarGrau(cantos.oeste, "lon")}
            </span>
            <span className="absolute bottom-1 right-1 text-[8px]">
              {formatarGrau(cantos.sul, "lat")} ·{" "}
              {formatarGrau(cantos.leste, "lon")}
            </span>
          </figure>
        </div>

        <aside className="w-56 space-y-2 text-[10px] leading-snug">
          <section>
            <h2 className="font-semibold">Legenda</h2>
            <ul className="mt-1 space-y-1">
              {caso.perimetros.map((p) => (
                <li key={p.id} className="flex items-start gap-1.5">
                  <AmostraLote
                    cor={p.cor}
                    traco={tracoDoLote(p, caso.perimetros)}
                    casco={CASCO_DO_FUNDO[captura.fundo].cor}
                  />
                  <span>
                    {p.nome}
                    <br />
                    <strong>{formatarHa(areas.get(p.id)?.ha ?? 0)}</strong>
                    {Object.entries(p.atributos)
                      .slice(0, MAX_ATRIBUTOS_LEGENDA)
                      .map(([chave, valor]) => (
                        <span
                          key={chave}
                          className="block text-[9px] text-neutral-600"
                        >
                          {chave}: {valor}
                        </span>
                      ))}
                    {Object.keys(p.atributos).length >
                      MAX_ATRIBUTOS_LEGENDA && (
                      <span className="block text-[9px] text-neutral-600">
                        +{" "}
                        {Object.keys(p.atributos).length -
                          MAX_ATRIBUTOS_LEGENDA}{" "}
                        informações
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {linhas.map((l) => (
                <li key={l.id} className="flex items-start gap-1.5">
                  <span
                    className="mt-1.5 h-0.5 w-2.5 shrink-0"
                    style={{ backgroundColor: l.cor }}
                  />
                  <span>
                    {l.nome}
                    <br />
                    {medidaDoElemento(l).replace("Comprimento: ", "")}
                  </span>
                </li>
              ))}
              {pontos.length > 0 && (
                <li className="flex items-start gap-1.5">
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-slate-900"
                    style={{ backgroundColor: pontos[0].cor }}
                  />
                  <span>Pontos ({pontos.length})</span>
                </li>
              )}
              {sobreposicoes.length > 0 && (
                <li className="flex items-start gap-1.5">
                  <AmostraLote disputa />
                  <span>Área em disputa</span>
                </li>
              )}
              {caso.plantas.map((pl) => (
                <li key={pl.id} className="flex items-start gap-1.5">
                  <span className="mt-0.5 h-2.5 w-2.5 shrink-0 border border-dashed border-neutral-500" />
                  <span>Planta: {pl.nome}</span>
                </li>
              ))}
            </ul>
          </section>

          {sobreposicoes.length > 0 && (
            <section>
              <h2 className="font-semibold">Sobreposições</h2>
              <ul className="mt-1 space-y-1">
                {sobreposicoes.map((s) => (
                  <li key={s.id}>
                    {s.a.nome} × {s.b.nome}:{" "}
                    <strong>{formatarHa(s.area.ha)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {caso.responsavel && (
            <section>
              <h2 className="font-semibold">Responsável técnico</h2>
              <p>{caso.responsavel}</p>
            </section>
          )}
        </aside>
      </div>

      {pontosSimples.length > 0 && (
        <section className="mt-2 text-[9px]">
          <h2 className="text-[11px] font-semibold">Quadro de pontos</h2>
          <ul className="mt-1 grid grid-cols-3 gap-x-4 gap-y-0.5">
            {pontosSimples.slice(0, MAX_PONTOS_QUADRO).map((p, i) => (
              <li key={i}>
                <strong>{p.nome}</strong> — {formatarCoordenada(p.coordenada)}
              </li>
            ))}
          </ul>
          {pontosSimples.length > MAX_PONTOS_QUADRO && (
            <p className="mt-0.5 text-neutral-600">
              + {pontosSimples.length - MAX_PONTOS_QUADRO} pontos (ver link do
              caso)
            </p>
          )}
        </section>
      )}

      <footer className="mt-2 border-t pt-1 text-[8px] leading-tight text-neutral-600">
        <p>
          Gerado pela Geotek em {captura.data.toLocaleString("pt-BR")}. Este
          documento organiza e apresenta o trabalho técnico; não o certifica. A
          responsabilidade técnica é do profissional habilitado. Áreas
          calculadas em SIRGAS 2000, na projeção UTM da zona do imóvel (padrão
          SIGEF/INCRA); comprimentos sobre o elipsoide; coordenadas em SIRGAS
          2000 geográfico.
        </p>
        {caso.observacoes.length > 0 && (
          <p>
            Anotações do arquivo:{" "}
            {caso.observacoes
              .map(
                (o) =>
                  `${o.nome}${o.descricao ? ` — ${o.descricao.replace(/\n/g, " ")}` : ""}`,
              )
              .join(" · ")}
          </p>
        )}
        <p>Mapa de fundo — {ATRIBUICAO_FUNDO[captura.fundo]}.</p>
        <p className="break-all">
          Arquivos originais (SHA-256):{" "}
          {[
            ...new Map(
              caso.perimetros.map((p) => [p.arquivo, p.sha256]),
            ).entries(),
          ]
            .map(([arquivo, hash]) => `${arquivo} ${hash}`)
            .join(" · ")}
        </p>
      </footer>
    </div>
  );
}
