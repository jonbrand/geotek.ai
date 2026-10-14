import { Crosshair, EyeOff, FileText, Image as ImagemIcone, TriangleAlert, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { tracoDoLote, type Atributos, type Caso, type Elemento, type Geometria, type GeometriaElemento, type Perimetro } from "@/lib/caso";
import { AmostraLote } from "@/components/AmostraLote";
import { descreverMetodo, METODO_COMPRIMENTO, type ResultadoArea } from "@/lib/geo/area";
import type { Sobreposicao } from "@/lib/geo/sobreposicao";
import type { Aviso } from "@/lib/geo/validar";
import { poligonos } from "@/lib/geo/area";
import { formatarHa, formatarMetros } from "@/lib/formatar";
import { medidaDoElemento, temInformacoes } from "@/lib/ficha";
import type { RegistroDeLeitura } from "@/lib/geo/ler-arquivo";
import type { Foto } from "@/lib/caso";

interface Props {
  caso: Caso;
  areas: Map<string, ResultadoArea>;
  avisos: Map<string, Aviso[]>;
  sobreposicoes: Sobreposicao[];
  leitura: boolean;
  /** Resumo e avisos de cada arquivo lido nesta sessão */
  leituras: RegistroDeLeitura[];
  onAlterar: (caso: Caso) => void;
  /** `id` abre a ficha do item no mapa */
  onEnquadrar: (geometria: Geometria | GeometriaElemento, id?: string) => void;
}

const contarVertices = (g: Geometria) => poligonos(g).reduce((n, p) => n + p.reduce((m, anel) => m + anel.length - 1, 0), 0);

function Campo({ rotulo, valor, onMudar, leitura, placeholder }: { rotulo: string; valor: string; onMudar: (v: string) => void; leitura: boolean; placeholder: string }) {
  if (leitura) return valor ? <p className="text-sm"><span className="text-muted-foreground">{rotulo}:</span> {valor}</p> : null;
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <Input className="mt-1 h-9" value={valor} placeholder={placeholder} onChange={(e) => onMudar(e.target.value)} />
    </label>
  );
}

function DetalhesTecnicos({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none underline-offset-2 hover:underline">detalhes técnicos</summary>
      <div className="mt-1 space-y-0.5 break-all rounded bg-muted p-2">{children}</div>
    </details>
  );
}

/** Descrição e atributos que vieram no próprio arquivo */
export function InformacoesDoArquivo({ item }: { item: { atributos: Atributos; descricao?: string; fotos?: Foto[] } }) {
  if (!temInformacoes(item) && !item.fotos?.length) return null;
  const atributos = Object.entries(item.atributos);
  return (
    <details className="mt-2 text-sm">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <FileText className="h-3.5 w-3.5" aria-hidden /> Informações do arquivo
        {atributos.length > 0 && <span className="text-xs">({atributos.length})</span>}
      </summary>
      <div className="mt-1.5 space-y-2 rounded bg-muted/60 p-2">
        {item.descricao && <p className="whitespace-pre-line break-words">{item.descricao}</p>}
        {atributos.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {atributos.map(([chave, valor]) => (
              <div key={chave} className="contents">
                <dt className="text-muted-foreground">{chave}</dt>
                <dd className="break-words">{valor}</dd>
              </div>
            ))}
          </dl>
        )}
        {item.fotos?.map((f) => (
          <figure key={f.url}>
            <img src={f.url} alt={f.nome} className="max-h-48 w-full rounded object-cover" />
            <figcaption className="mt-0.5 text-xs text-muted-foreground">{f.nome}</figcaption>
          </figure>
        ))}
      </div>
    </details>
  );
}

/** Marca de item oculto no arquivo e avisos de como ele foi interpretado */
function AvisosDoItem({ item }: { item: { oculto?: boolean; avisos?: string[] } }) {
  if (!item.oculto && !item.avisos?.length) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-amber-800">
      {item.oculto && (
        <p className="flex items-center gap-1">
          <EyeOff className="h-3 w-3" aria-hidden /> Estava oculto no arquivo original
        </p>
      )}
      {item.avisos?.map((a) => <p key={a}>{a}</p>)}
    </div>
  );
}

const ROTULO_GRUPO = { linha: ["linha", "linhas"], ponto: ["ponto", "pontos"] } as const;

function GrupoDeElementos({ tipo, itens, leitura, onEnquadrar, onRemover }: { tipo: Elemento["tipo"]; itens: Elemento[]; leitura: boolean; onEnquadrar: Props["onEnquadrar"]; onRemover: (id: string) => void }) {
  if (!itens.length) return null;
  const [singular, plural] = ROTULO_GRUPO[tipo];
  return (
    // Muitos vértices de um levantamento não devem empurrar o resto do painel
    <details open={itens.length <= 10} className="text-sm">
      <summary className="cursor-pointer select-none text-muted-foreground">
        {itens.length} {itens.length === 1 ? singular : plural}
      </summary>
      <ul className="mt-1 space-y-1.5">
        {itens.map((e) => (
          <li key={e.id} className="rounded-md border px-2 py-1.5">
            <div className="flex items-center gap-2">
              {tipo === "linha" ? (
                <span className="h-1 w-4 shrink-0 rounded" style={{ backgroundColor: e.cor }} aria-hidden />
              ) : (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-slate-900" style={{ backgroundColor: e.cor }} aria-hidden />
              )}
              <button className="min-w-0 flex-1 text-left hover:underline" onClick={() => onEnquadrar(e.geometria, e.id)}>
                <span className="block truncate font-medium">{e.nome}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">{medidaDoElemento(e)}</span>
              </button>
              {!leitura && (
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Remover" onClick={() => onRemover(e.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <AvisosDoItem item={e} />
            <InformacoesDoArquivo item={e} />
            {tipo === "linha" && (
              <DetalhesTecnicos>
                <p>{METODO_COMPRIMENTO}</p>
                <p>Arquivo original: {e.arquivo}</p>
              </DetalhesTecnicos>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function PainelCaso({ caso, areas, avisos, sobreposicoes, leitura, leituras, onAlterar, onEnquadrar }: Props) {
  const alterarPerimetro = (id: string, mudanca: Partial<Perimetro>) =>
    onAlterar({ ...caso, perimetros: caso.perimetros.map((p) => (p.id === id ? { ...p, ...mudanca } : p)) });

  const totalDisputa = sobreposicoes.reduce((t, s) => t + s.area.ha, 0);

  // Agrupa pontos e linhas pela pasta em que estavam no arquivo
  const pastas = new Map<string, Elemento[]>();
  for (const e of caso.elementos) pastas.set(e.pasta ?? "", [...(pastas.get(e.pasta ?? "") ?? []), e]);
  const removerElemento = (id: string) => onAlterar({ ...caso, elementos: caso.elementos.filter((e) => e.id !== id) });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        {leitura ? (
          caso.nome && <h2 className="text-lg font-semibold">{caso.nome}</h2>
        ) : (
          <Campo rotulo="Nome do caso" valor={caso.nome} leitura={leitura} placeholder="Ex.: Demarcatória Silva × Souza" onMudar={(nome) => onAlterar({ ...caso, nome })} />
        )}
        <Campo rotulo="Comarca" valor={caso.comarca} leitura={leitura} placeholder="Ex.: Sorriso/MT" onMudar={(comarca) => onAlterar({ ...caso, comarca })} />
        <Campo rotulo="Responsável técnico" valor={caso.responsavel} leitura={leitura} placeholder="Nome, CREA e nº da ART" onMudar={(responsavel) => onAlterar({ ...caso, responsavel })} />
      </section>

      {sobreposicoes.length > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-red-900">
            <AmostraLote disputa /> Área em disputa
          </h3>
          <p className="text-2xl font-semibold tabular-nums text-red-700">{formatarHa(totalDisputa)}</p>
          <ul className="mt-2 space-y-2">
            {sobreposicoes.map((s) => (
              <li key={s.id} className="text-sm">
                <button className="flex w-full items-start gap-2 text-left hover:underline" onClick={() => onEnquadrar(s.geometria)}>
                  <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden />
                  <span>
                    <strong className="tabular-nums">{formatarHa(s.area.ha)}</strong> onde <em>{s.a.nome}</em> e <em>{s.b.nome}</em> se sobrepõem
                  </span>
                </button>
                <DetalhesTecnicos>
                  <p>{descreverMetodo(s.area)}</p>
                  <p>Perímetro da faixa: {formatarMetros(s.area.perimetroM)}</p>
                  <p>Interseção calculada sobre as coordenadas originais (SIRGAS 2000 geográfico).</p>
                </DetalhesTecnicos>
              </li>
            ))}
          </ul>
        </section>
      )}

      {caso.perimetros.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">Perímetros</h3>
          <ul className="space-y-3">
            {caso.perimetros.map((p) => {
              const area = areas.get(p.id);
              const avisosDoPerimetro = avisos.get(p.id) ?? [];
              return (
                <li key={p.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <AmostraLote cor={p.cor} traco={tracoDoLote(p, caso.perimetros)} />
                    {leitura ? (
                      <span className="flex-1 truncate text-sm font-medium">{p.nome}</span>
                    ) : (
                      <Input aria-label="Nome do perímetro" className="h-8 flex-1" value={p.nome} onChange={(e) => alterarPerimetro(p.id, { nome: e.target.value })} />
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Mostrar no mapa" onClick={() => onEnquadrar(p.geometria, p.id)}>
                      <Crosshair className="h-4 w-4" />
                    </Button>
                    {!leitura && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Remover"
                        onClick={() => onAlterar({ ...caso, perimetros: caso.perimetros.filter((x) => x.id !== p.id) })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {p.pasta && <p className="mt-1 text-xs text-muted-foreground">Pasta: {p.pasta}</p>}
                  {area && (
                    <p className="mt-2 text-sm">
                      Área: <strong className="tabular-nums">{formatarHa(area.ha)}</strong>
                      <span className="text-muted-foreground"> — calculada no mesmo padrão usado pelo INCRA</span>
                    </p>
                  )}
                  {avisosDoPerimetro.map((a, i) => (
                    <p key={i} className="mt-2 flex gap-1.5 text-sm text-amber-800">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a.mensagem}
                    </p>
                  ))}
                  <AvisosDoItem item={p} />
                  <InformacoesDoArquivo item={p} />
                  {area && (
                    <DetalhesTecnicos>
                      <p>{descreverMetodo(area)}</p>
                      <p>Perímetro: {formatarMetros(area.perimetroM)} · {contarVertices(p.geometria)} vértices</p>
                      <p>Arquivo original: {p.arquivo}</p>
                      <p>SHA-256: {p.sha256}</p>
                    </DetalhesTecnicos>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {caso.elementos.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">Outros elementos do levantamento</h3>
          <div className="space-y-3">
            {[...pastas].map(([pasta, itens]) => (
              <div key={pasta} className="space-y-1.5">
                {pasta && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{pasta}</p>}
                {pasta && caso.pastas[pasta] && <p className="whitespace-pre-line text-xs text-muted-foreground">{caso.pastas[pasta]}</p>}
                {(["linha", "ponto"] as const).map((tipo) => (
                  <GrupoDeElementos
                    key={tipo}
                    tipo={tipo}
                    itens={itens.filter((e) => e.tipo === tipo)}
                    leitura={leitura}
                    onEnquadrar={onEnquadrar}
                    onRemover={removerElemento}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {caso.plantas.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">Plantas sobrepostas</h3>
          <ul className="space-y-2">
            {caso.plantas.map((pl) => (
              <li key={pl.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <ImagemIcone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{pl.nome}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Mostrar no mapa"
                    onClick={() => onEnquadrar({ type: "Polygon", coordinates: [[...pl.cantos, pl.cantos[0]]] })}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </Button>
                  {!leitura && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Remover" onClick={() => onAlterar({ ...caso, plantas: caso.plantas.filter((x) => x.id !== pl.id) })}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {pl.imagem ? (
                  <label className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    Transparência
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((1 - pl.opacidade) * 100)}
                      onChange={(e) =>
                        onAlterar({ ...caso, plantas: caso.plantas.map((x) => (x.id === pl.id ? { ...x, opacidade: 1 - Number(e.target.value) / 100 } : x)) })
                      }
                      className="flex-1"
                      aria-label={`Transparência da planta ${pl.nome}`}
                    />
                  </label>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {leitura ? "A imagem da planta não segue pelo link; aparece só a moldura." : "Só a moldura: a imagem não veio junto com o arquivo."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {caso.observacoes.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">Anotações do arquivo</h3>
          <ul className="space-y-2">
            {caso.observacoes.map((o) => (
              <li key={o.id} className="rounded-md border p-2 text-sm">
                <p className="font-medium">{o.nome}</p>
                {o.pasta && <p className="text-xs text-muted-foreground">Pasta: {o.pasta}</p>}
                {o.descricao && <p className="mt-1 whitespace-pre-line break-words">{o.descricao}</p>}
                {Object.keys(o.atributos).length > 0 && <InformacoesDoArquivo item={{ atributos: o.atributos }} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {leituras.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">O que veio no arquivo</h3>
          <ul className="space-y-2">
            {leituras.map((l, i) => (
              <li key={`${l.arquivo}-${i}`} className="rounded-md border p-2 text-sm">
                <p className="truncate font-medium">{l.arquivo}</p>
                <p className="text-muted-foreground">{l.resumo}</p>
                {l.avisos.map((a) => (
                  <p key={a} className="mt-1 flex gap-1.5 text-amber-800">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {leitura && caso.plantas.length > 0 && (
        <p className="text-xs text-muted-foreground">Imagens de plantas e fotos não seguem pelo link. Para vê-las, peça o PDF ao responsável pelo caso.</p>
      )}

      <p className="text-xs text-muted-foreground">
        A Geotek organiza e apresenta o trabalho técnico. A responsabilidade técnica pelos dados é do profissional habilitado.
      </p>
    </div>
  );
}
