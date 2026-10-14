import { feature } from "@turf/helpers";
import { pointOnFeature } from "@turf/point-on-feature";
import type { Position } from "geojson";
import type { Atributos, Caso, Elemento, Foto, Perimetro } from "@/lib/caso";
import { calcularComprimento, type ResultadoArea } from "@/lib/geo/area";
import { formatarGrau, formatarHa, formatarMetros } from "@/lib/formatar";

/** O que aparece ao clicar em qualquer coisa do caso, no mapa ou no painel */
export interface Ficha {
  id: string;
  titulo: string;
  medida: string;
  pasta?: string;
  descricao?: string;
  atributos: Atributos;
  local: Position;
  fotos: Foto[];
  oculto: boolean;
  avisos: string[];
}

const altitude = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export const formatarCoordenada = ([lon, lat, alt]: Position) =>
  `${formatarGrau(lat, "lat")} · ${formatarGrau(lon, "lon")}${alt ? ` · altitude ${altitude.format(alt)} m` : ""}`;

export function medidaDoElemento(e: Elemento): string {
  const g = e.geometria;
  if (g.type === "Point") return formatarCoordenada(g.coordinates);
  if (g.type === "MultiPoint") return `${g.coordinates.length} pontos`;
  return `Comprimento: ${formatarMetros(calcularComprimento(g))}`;
}

const fichaBase = (item: Perimetro | Elemento) => ({
  id: item.id,
  titulo: item.nome,
  pasta: item.pasta,
  descricao: item.descricao,
  atributos: item.atributos,
  fotos: item.fotos ?? [],
  oculto: Boolean(item.oculto),
  avisos: item.avisos ?? [],
  local: pointOnFeature(feature(item.geometria)).geometry.coordinates,
});

export function fichasDoCaso(caso: Caso, areas: Map<string, ResultadoArea>): Map<string, Ficha> {
  return new Map([
    ...caso.perimetros.map((p): [string, Ficha] => [p.id, { ...fichaBase(p), medida: `Área: ${formatarHa(areas.get(p.id)?.ha ?? 0)}` }]),
    ...caso.elementos.map((e): [string, Ficha] => [e.id, { ...fichaBase(e), medida: medidaDoElemento(e) }]),
  ]);
}

export const temInformacoes = (item: { atributos: Atributos; descricao?: string }) =>
  Boolean(item.descricao) || Object.keys(item.atributos).length > 0;
