import { feature } from "@turf/helpers";
import { pointOnFeature } from "@turf/point-on-feature";
import type { Position } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import type { Perimetro } from "@/lib/caso";
import type { Sobreposicao } from "@/lib/geo/sobreposicao";
import { formatarHa } from "@/lib/formatar";

/** Opcional agora; obrigatória para uso comercial (chave gratuita do ArcGIS Location Platform) */
export const CHAVE_ESRI = (import.meta.env.VITE_ESRI_KEY as string | undefined) || undefined;

export type Fundo = "satelite" | "ruas";
export const FUNDO_PADRAO: Fundo = "satelite";

export const ATRIBUICAO_FUNDO: Record<Fundo, string> = {
  satelite: "Imagem: Esri, Maxar, Earthstar Geographics e comunidade GIS",
  ruas: "© colaboradores do OpenStreetMap",
};

const CAMADAS_DE_FUNDO: Record<Fundo, string[]> = {
  satelite: ["satelite", "satelite-nomes"],
  ruas: ["ruas"],
};

/** Visibilidade de cada camada de fundo para o fundo escolhido */
export function camadasDoFundo(fundo: Fundo): Record<string, "visible" | "none"> {
  const todas = Object.values(CAMADAS_DE_FUNDO).flat();
  return Object.fromEntries(todas.map((id) => [id, CAMADAS_DE_FUNDO[fundo].includes(id) ? "visible" : "none"]));
}

/**
 * Um único estilo com os dois fundos: trocar entre satélite e ruas só muda a visibilidade,
 * sem recriar as camadas do caso.
 */
export function estiloBase(chaveEsri?: string, fundo: Fundo = FUNDO_PADRAO): StyleSpecification {
  // blankTile=false: onde não há imagem nesse nível de zoom (comum na zona rural), o servidor
  // responde "não encontrado" em vez de um aviso cinza, e o mapa amplia a imagem do nível anterior
  const imagem = chaveEsri
    ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false&token=${encodeURIComponent(chaveEsri)}`
    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false";
  const nomes = chaveEsri
    ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(chaveEsri)}`
    : "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
  const visibilidade = camadasDoFundo(fundo);

  return {
    version: 8,
    sources: {
      satelite: { type: "raster", tiles: [imagem], tileSize: 256, maxzoom: 19, attribution: ATRIBUICAO_FUNDO.satelite },
      "satelite-nomes": { type: "raster", tiles: [nomes], tileSize: 256, maxzoom: 19 },
      ruas: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: ATRIBUICAO_FUNDO.ruas },
    },
    layers: [
      { id: "satelite", type: "raster", source: "satelite", layout: { visibility: visibilidade.satelite } },
      { id: "satelite-nomes", type: "raster", source: "satelite-nomes", layout: { visibility: visibilidade["satelite-nomes"] } },
      // Fundo dessaturado para as cores dos lotes saltarem
      { id: "ruas", type: "raster", source: "ruas", layout: { visibility: visibilidade.ruas }, paint: { "raster-saturation": -0.6 } },
    ],
  };
}

/** Casco sob os contornos: claro sobre a imagem escura, escuro sobre o mapa de ruas claro */
export const CASCO_DO_FUNDO: Record<Fundo, { cor: string; opacidade: number }> = {
  satelite: { cor: "#ffffff", opacidade: 0.85 },
  ruas: { cor: "#0f172a", opacidade: 0.7 },
};

export interface Rotulo {
  texto: string;
  local: Position;
  tipo: "perimetro" | "sobreposicao";
}

export function rotulosDoCaso(perimetros: Perimetro[], sobreposicoes: Sobreposicao[], areas: Map<string, number>): Rotulo[] {
  return [
    ...perimetros.map((p) => ({
      texto: `${p.nome} · ${formatarHa(areas.get(p.id) ?? 0)}`,
      local: pointOnFeature(feature(p.geometria)).geometry.coordinates,
      tipo: "perimetro" as const,
    })),
    ...sobreposicoes.map((s) => ({
      texto: `${formatarHa(s.area.ha)} em disputa`,
      local: pointOnFeature(feature(s.geometria)).geometry.coordinates,
      tipo: "sobreposicao" as const,
    })),
  ];
}
