import { intersect } from "@turf/intersect";
import { difference } from "@turf/difference";
import { feature, featureCollection } from "@turf/helpers";
import type { Geometria, Perimetro } from "@/lib/caso";
import { calcularArea, type ResultadoArea } from "@/lib/geo/area";

export interface Sobreposicao {
  id: string;
  a: Perimetro;
  b: Perimetro;
  geometria: Geometria;
  area: ResultadoArea;
}

// Abaixo de 1 m² é ruído de digitalização, não sobreposição
const AREA_MINIMA_HA = 0.0001;

export function calcularSobreposicoes(perimetros: Perimetro[]): Sobreposicao[] {
  const resultado: Sobreposicao[] = [];
  for (let i = 0; i < perimetros.length; i++)
    for (let j = i + 1; j < perimetros.length; j++) {
      const a = perimetros[i];
      const b = perimetros[j];
      let geometria: Geometria | undefined;
      try {
        geometria = intersect(featureCollection([feature(a.geometria), feature(b.geometria)]))?.geometry;
      } catch {
        // Contorno inválido (ex.: autointerseção) — o aviso já aparece em validar.ts
        continue;
      }
      if (!geometria) continue;
      const area = calcularArea(geometria);
      if (area.ha < AREA_MINIMA_HA) continue;
      resultado.push({ id: `${a.id}-${b.id}`, a, b, geometria, area });
    }
  return resultado;
}

/**
 * Parte de cada lote que não está em disputa — só para desenhar: assim o preenchimento de
 * um lote nunca se mistura com o vermelho da faixa disputada. Áreas continuam vindo de
 * `calcularArea` sobre o perímetro inteiro.
 */
export function calcularPartesExclusivas(perimetros: Perimetro[], sobreposicoes: Sobreposicao[]): Map<string, Geometria | null> {
  const partes = new Map<string, Geometria | null>();
  for (const p of perimetros) {
    const faixas = sobreposicoes.filter((s) => s.a.id === p.id || s.b.id === p.id);
    if (!faixas.length) {
      partes.set(p.id, p.geometria);
      continue;
    }
    try {
      const resto = difference(featureCollection([feature(p.geometria), ...faixas.map((s) => feature(s.geometria))]));
      partes.set(p.id, resto?.geometry ?? null);
    } catch {
      partes.set(p.id, p.geometria);
    }
  }
  return partes;
}
