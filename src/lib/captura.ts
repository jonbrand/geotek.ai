import type { Map as MapaMapLibre } from "maplibre-gl";
import type { Fundo, Rotulo } from "@/lib/mapa";

export interface Captura {
  imagem: string;
  /** Proporção largura/altura da imagem */
  proporcao: number;
  cantos: { norte: number; sul: number; leste: number; oeste: number };
  escala: { rotulo: string; larguraPct: number };
  rotulos: (Rotulo & { xPct: number; yPct: number })[];
  data: Date;
  fundo: Fundo;
}

const CIRCUNFERENCIA_TERRA = 40_075_016.686;

/** Maior valor 1, 2 ou 5 × 10ⁿ que cabe em `limite` */
function distanciaRedonda(limite: number) {
  const potencia = 10 ** Math.floor(Math.log10(limite));
  return [5, 2, 1].map((m) => m * potencia).find((d) => d <= limite) ?? potencia;
}

export function capturarMapa(mapa: MapaMapLibre, rotulos: Rotulo[], fundo: Fundo): Captura {
  const canvas = mapa.getCanvas();
  const largura = canvas.clientWidth;
  const altura = canvas.clientHeight;
  const limites = mapa.getBounds();
  const centro = mapa.getCenter();
  // Tamanho do pixel no centro do mapa (mosaicos de 512 px no MapLibre)
  const metrosPorPixel = (CIRCUNFERENCIA_TERRA * Math.cos((centro.lat * Math.PI) / 180)) / (512 * 2 ** mapa.getZoom());
  const distancia = distanciaRedonda(metrosPorPixel * largura * 0.25);

  return {
    imagem: canvas.toDataURL("image/png"),
    proporcao: largura / altura,
    cantos: { norte: limites.getNorth(), sul: limites.getSouth(), leste: limites.getEast(), oeste: limites.getWest() },
    escala: {
      rotulo: distancia >= 1000 ? `${(distancia / 1000).toLocaleString("pt-BR")} km` : `${distancia} m`,
      larguraPct: (distancia / (metrosPorPixel * largura)) * 100,
    },
    rotulos: rotulos
      .map((r) => {
        const p = mapa.project(r.local as [number, number]);
        return { ...r, xPct: (p.x / largura) * 100, yPct: (p.y / altura) * 100 };
      })
      .filter((r) => r.xPct >= 0 && r.xPct <= 100 && r.yPct >= 0 && r.yPct <= 100),
    data: new Date(),
    fundo,
  };
}
