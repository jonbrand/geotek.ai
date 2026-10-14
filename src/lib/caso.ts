import type { LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon, Position } from "geojson";

export type Geometria = Polygon | MultiPolygon;
export type GeometriaElemento = Point | MultiPoint | LineString | MultiLineString;

/** Informações que vieram no próprio arquivo (matrícula, proprietário, CCIR…) */
export type Atributos = Record<string, string>;

/** Dados de origem comuns a tudo que foi lido de um arquivo */
interface DadosDoArquivo {
  id: string;
  nome: string;
  cor: string;
  atributos: Atributos;
  /** Texto puro — o HTML do arquivo nunca é exibido como HTML */
  descricao?: string;
  /** Caminho de pastas no arquivo, ex.: "Levantamento / Marcos" */
  pasta?: string;
  arquivo: string;
  sha256: string;
  /** Fotos que vieram no KMZ — só na sessão: não cabem no link */
  fotos?: Foto[];
  /** Estava oculto no arquivo original (visibility=0); continua visível aqui */
  oculto?: boolean;
  /** Como o item foi interpretado, quando não veio exatamente como área/linha/ponto */
  avisos?: string[];
}

export interface Foto {
  nome: string;
  url: string;
}

/** Planta ou imagem georreferenciada (GroundOverlay) — nunca é lote */
export interface Planta {
  id: string;
  nome: string;
  /** Noroeste, nordeste, sudeste, sudoeste */
  cantos: [Position, Position, Position, Position];
  /** `blob:` do KMZ; ausente quando a imagem não veio junto (ou o caso veio por link) */
  imagem?: string;
  opacidade: number;
  arquivo: string;
}

/** Marcador sem localização: anotações do agrimensor que não vão para o mapa */
export interface Observacao {
  id: string;
  nome: string;
  descricao?: string;
  atributos: Atributos;
  pasta?: string;
  arquivo: string;
}

export interface Perimetro extends DadosDoArquivo {
  geometria: Geometria;
}

/** Tudo que não é área: marcos, vértices, córregos, estradas, cercas… */
export interface Elemento extends DadosDoArquivo {
  tipo: "ponto" | "linha";
  geometria: GeometriaElemento;
}

export interface Caso {
  nome: string;
  comarca: string;
  responsavel: string;
  perimetros: Perimetro[];
  elementos: Elemento[];
  plantas: Planta[];
  observacoes: Observacao[];
  /** Descrição de cada pasta do arquivo, pelo caminho ("Levantamento / Marcos") */
  pastas: Record<string, string>;
}

export const casoVazio = (): Caso => ({
  nome: "",
  comarca: "",
  responsavel: "",
  perimetros: [],
  elementos: [],
  plantas: [],
  observacoes: [],
  pastas: {},
});

// Paleta dos lotes validada (scripts da skill dataviz, todos os pares, sobre mapa claro):
// distinguível com daltonismo e sem confusão com o vermelho reservado à disputa.
// Só 3 cores passam juntas; do 4º lote em diante a distinção é pelo traço e pelo rótulo.
export const PALETA_LOTES = ["#1d4ed8", "#0d9488", "#ca8a04"];
export const COR_LOTE_EXCEDENTE = "#475569";
export const COR_DISPUTA = "#dc2626";

/** Padrões de traço do contorno (múltiplos da largura da linha); vazio = contínuo */
export const TRACOS: number[][] = [[], [3, 1.5], [3, 1.2, 0.6, 1.2]];

/** Primeira cor da paleta ainda livre; a cor acompanha o lote e não muda se outro sair */
export function proximaCorDeLote(emUso: string[]): string {
  return PALETA_LOTES.find((c) => !emUso.includes(c)) ?? COR_LOTE_EXCEDENTE;
}

/** Índice do padrão de traço: o do slot da paleta, ou alternado entre os lotes cinza */
export function tracoDoLote(perimetro: Perimetro, todos: Perimetro[]): number {
  const slot = PALETA_LOTES.indexOf(perimetro.cor);
  if (slot >= 0) return slot;
  const excedentes = todos.filter((p) => !PALETA_LOTES.includes(p.cor));
  return Math.max(0, excedentes.indexOf(perimetro)) % TRACOS.length;
}

/** Garante que todo perímetro use uma cor da paleta (links antigos, arquivos com cor própria) */
export function normalizarCores(perimetros: Perimetro[]): Perimetro[] {
  const emUso: string[] = [];
  return perimetros.map((p) => {
    const cor = PALETA_LOTES.includes(p.cor) && !emUso.includes(p.cor) ? p.cor : proximaCorDeLote(emUso);
    emUso.push(cor);
    return cor === p.cor ? p : { ...p, cor };
  });
}

export const COR_LINHA_PADRAO = "#38bdf8";
// Branco com borda escura: não se confunde com a disputa nem com os lotes
export const COR_PONTO_PADRAO = "#ffffff";

export const novoId = () => Math.random().toString(36).slice(2, 10);
