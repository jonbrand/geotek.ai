import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { Position } from "geojson";
import {
  casoVazio,
  normalizarCores,
  COR_LINHA_PADRAO,
  COR_PONTO_PADRAO,
  novoId,
  type Atributos,
  type Caso,
  type Elemento,
  type Geometria,
  type GeometriaElemento,
  type Observacao,
  type Perimetro,
  type Planta,
} from "@/lib/caso";

export const PREFIXO = "#c=";
// Links acima disso costumam ser cortados por e-mail e aplicativos de mensagem
export const LIMITE_LINK = 30_000;

export class ErroLinkGrande extends Error {
  constructor() {
    super("Este caso é grande demais para caber em um link. Use \"Imprimir / Exportar\" para gerar o PDF.");
  }
}

// Formato compacto: chaves de uma letra para o link ficar curto
interface Compacto {
  n: string;
  k: string;
  g: Geometria | GeometriaElemento;
  a: string;
  h: string;
  /** Atributos, descrição e pasta — só a partir da versão 2 */
  t?: Atributos;
  d?: string;
  f?: string;
  /** Oculto no arquivo original e avisos de interpretação — versão 3 */
  o?: 1;
  w?: string[];
}

interface PlantaCompacta {
  n: string;
  c: Planta["cantos"];
  a: string;
  op: number;
}

interface ObservacaoCompacta {
  n: string;
  d?: string;
  t?: Atributos;
  f?: string;
  a: string;
}

interface ElementoCompacto extends Compacto {
  y: "p" | "l";
}

// 8 casas decimais ≈ 1 mm no terreno
const arredondar = (coords: unknown): unknown =>
  typeof (coords as number[])[0] === "number"
    ? (coords as number[]).map((v) => Math.round(v * 1e8) / 1e8)
    : (coords as unknown[]).map(arredondar);

const compactarGeometria = <G extends Geometria | GeometriaElemento>(g: G): G =>
  ({ type: g.type, coordinates: arredondar(g.coordinates) as Position[] }) as G;

const compactar = (p: Perimetro | Elemento): Compacto => ({
  n: p.nome,
  k: p.cor,
  g: compactarGeometria(p.geometria),
  a: p.arquivo,
  h: p.sha256,
  ...(Object.keys(p.atributos).length ? { t: p.atributos } : {}),
  ...(p.descricao ? { d: p.descricao } : {}),
  ...(p.pasta ? { f: p.pasta } : {}),
  ...(p.oculto ? { o: 1 as const } : {}),
  ...(p.avisos?.length ? { w: p.avisos } : {}),
});

const expandir = (c: Compacto) => ({
  id: novoId(),
  nome: c.n,
  arquivo: c.a,
  sha256: c.h,
  atributos: c.t ?? {},
  descricao: c.d,
  pasta: c.f,
  ...(c.o ? { oculto: true } : {}),
  ...(c.w?.length ? { avisos: c.w } : {}),
});

export function casoParaFragmento(caso: Caso): string {
  const dados = {
    v: 3,
    n: caso.nome,
    c: caso.comarca,
    r: caso.responsavel,
    p: caso.perimetros.map(compactar),
    e: caso.elementos.map((e): ElementoCompacto => ({ ...compactar(e), y: e.tipo === "ponto" ? "p" : "l" })),
    // Imagens de plantas e fotos não cabem na URL: segue só a moldura da planta
    pl: caso.plantas.map((p): PlantaCompacta => ({ n: p.nome, c: arredondar(p.cantos) as Planta["cantos"], a: p.arquivo, op: p.opacidade })),
    ob: caso.observacoes.map((o): ObservacaoCompacta => ({
      n: o.nome,
      a: o.arquivo,
      ...(o.descricao ? { d: o.descricao } : {}),
      ...(Object.keys(o.atributos).length ? { t: o.atributos } : {}),
      ...(o.pasta ? { f: o.pasta } : {}),
    })),
    pa: caso.pastas,
  };
  const fragmento = PREFIXO + compressToEncodedURIComponent(JSON.stringify(dados));
  if (fragmento.length > LIMITE_LINK) throw new ErroLinkGrande();
  return fragmento;
}

/** Devolve null se o fragmento não for um caso válido. Lê links das versões 1, 2 e 3. */
export function fragmentoParaCaso(fragmento: string): Caso | null {
  if (!fragmento.startsWith(PREFIXO)) return null;
  try {
    const dados = JSON.parse(decompressFromEncodedURIComponent(fragmento.slice(PREFIXO.length)) ?? "");
    if (![1, 2, 3].includes(dados?.v) || !Array.isArray(dados.p)) return null;
    return {
      ...casoVazio(),
      nome: dados.n ?? "",
      comarca: dados.c ?? "",
      responsavel: dados.r ?? "",
      perimetros: normalizarCores(
        dados.p.map((p: Compacto) => ({ ...expandir(p), cor: p.k ?? "", geometria: p.g as Geometria })),
      ),
      elementos: (dados.e ?? []).map((e: ElementoCompacto) => ({
        ...expandir(e),
        tipo: e.y === "p" ? "ponto" : "linha",
        cor: e.k ?? (e.y === "p" ? COR_PONTO_PADRAO : COR_LINHA_PADRAO),
        geometria: e.g as GeometriaElemento,
      })),
      plantas: (dados.pl ?? []).map((p: PlantaCompacta): Planta => ({ id: novoId(), nome: p.n, cantos: p.c, arquivo: p.a, opacidade: p.op ?? 0.7 })),
      observacoes: (dados.ob ?? []).map((o: ObservacaoCompacta): Observacao => ({
        id: novoId(),
        nome: o.n,
        descricao: o.d,
        atributos: o.t ?? {},
        pasta: o.f,
        arquivo: o.a,
      })),
      pastas: dados.pa ?? {},
    };
  } catch {
    return null;
  }
}
