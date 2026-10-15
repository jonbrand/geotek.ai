import type { Position } from "geojson";
import type { Geometria } from "@/lib/caso";
import { poligonos } from "@/lib/geo/area";

export interface Aviso {
  mensagem: string;
  local?: Position;
}

// Acima disso a checagem O(n²) ficaria lenta no navegador
const MAX_VERTICES_CHECAGEM = 6000;

function cruzamento(p1: Position, p2: Position, p3: Position, p4: Position): Position | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (d === 0) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

function autointersecoes(anel: Position[]): Position[] {
  const pontos: Position[] = [];
  const n = anel.length - 1;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // segmentos vizinhos pelo fechamento
      const p = cruzamento(anel[i], anel[i + 1], anel[j], anel[j + 1]);
      if (p) pontos.push(p);
    }
  return pontos;
}

export function validar(g: Geometria): Aviso[] {
  const avisos: Aviso[] = [];
  for (const poligono of poligonos(g))
    for (const anel of poligono) {
      if (anel.length < 4) {
        avisos.push({ mensagem: "O contorno tem menos de três pontos e não forma uma área.", local: anel[0] });
        continue;
      }
      if (anel.length > MAX_VERTICES_CHECAGEM) continue;
      const pontos = autointersecoes(anel);
      if (pontos.length)
        avisos.push({
          mensagem: `O contorno se cruza em ${pontos.length === 1 ? "um ponto" : `${pontos.length} pontos`}. Marcamos no mapa onde. A área pode não estar correta — peça ao responsável técnico um arquivo corrigido.`,
          local: pontos[0],
        });
    }
  return avisos;
}
