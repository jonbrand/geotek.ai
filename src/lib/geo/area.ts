import proj4 from "proj4";
import { Geodesic } from "geographiclib-geodesic";
import type { LineString, MultiLineString, Position } from "geojson";
import type { Geometria } from "@/lib/caso";

// SIRGAS 2000 usa o elipsoide GRS80. GeoJSON e KML vêm em WGS 84, que coincide
// com o SIRGAS 2000 dentro da precisão de um levantamento.
const GRS80 = { a: 6378137, f: 1 / 298.257222101 };
const geodesico = new Geodesic.Geodesic(GRS80.a, GRS80.f);
const SIRGAS_GEO = "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs";

export interface Fuso {
  zona: number;
  sul: boolean;
  /** Código EPSG do SIRGAS 2000 / UTM da zona (ex.: 31982 = 22S) */
  epsg: number;
}

export interface ResultadoArea {
  ha: number;
  perimetroM: number;
  metodo: "utm" | "geodesico";
  /** Presente quando o método é "utm" */
  fuso?: Fuso;
}

export function fusoDe(lon: number, lat: number): Fuso {
  const zona = Math.min(60, Math.floor((lon + 180) / 6) + 1);
  const sul = lat < 0;
  // SIRGAS 2000 / UTM: 31978–31985 = 18S–25S; 31972–31976 = 18N–22N
  const epsg = sul ? 31960 + zona : 31954 + zona;
  return { zona, sul, epsg };
}

const projecoes = new Map<string, proj4.Converter>();
function projecaoUtm({ zona, sul }: Fuso) {
  const chave = `${zona}${sul ? "S" : "N"}`;
  if (!projecoes.has(chave)) {
    const utm = `+proj=utm +zone=${zona}${sul ? " +south" : ""} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
    projecoes.set(chave, proj4(SIRGAS_GEO, utm));
  }
  return projecoes.get(chave)!;
}

export const poligonos = (g: Geometria): Position[][][] =>
  g.type === "Polygon" ? [g.coordinates] : g.coordinates;

function envelope(g: Geometria) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const poligono of poligonos(g))
    for (const [lon, lat] of poligono[0]) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  return { minLon, maxLon, minLat, maxLat };
}

function areaPlana(anel: Position[]) {
  let soma = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++)
    soma += anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
  return Math.abs(soma) / 2;
}

function comprimentoPlano(anel: Position[]) {
  let total = 0;
  for (let i = 1; i < anel.length; i++) total += Math.hypot(anel[i][0] - anel[i - 1][0], anel[i][1] - anel[i - 1][1]);
  return total;
}

function anelGeodesico(anel: Position[]) {
  const p = geodesico.Polygon(false);
  // O último vértice repete o primeiro; o PolygonArea fecha o anel sozinho
  const pontos = anel.length > 1 && anel[0][0] === anel.at(-1)[0] && anel[0][1] === anel.at(-1)[1] ? anel.slice(0, -1) : anel;
  for (const [lon, lat] of pontos) p.AddPoint(lat, lon);
  const r = p.Compute(false, true);
  return { area: Math.abs(r.area ?? 0), perimetro: r.perimeter };
}

/**
 * Área legal do perímetro. Projeta na zona UTM SIRGAS 2000 do imóvel (padrão SIGEF);
 * se o perímetro cruza duas zonas, calcula sobre o elipsoide. Nunca em Web Mercator.
 */
export function calcularArea(g: Geometria): ResultadoArea {
  const { minLon, maxLon, minLat, maxLat } = envelope(g);
  const fusoOeste = fusoDe(minLon, (minLat + maxLat) / 2);
  const fusoLeste = fusoDe(maxLon, (minLat + maxLat) / 2);
  const cruzaFuso = fusoOeste.zona !== fusoLeste.zona || (minLat < 0 && maxLat > 0);

  let area = 0;
  let perimetro = 0;
  if (cruzaFuso) {
    for (const poligono of poligonos(g))
      poligono.forEach((anel, i) => {
        const r = anelGeodesico(anel);
        area += i === 0 ? r.area : -r.area;
        if (i === 0) perimetro += r.perimetro;
      });
    return { ha: area / 10_000, perimetroM: perimetro, metodo: "geodesico" };
  }

  const fuso = fusoDe((minLon + maxLon) / 2, (minLat + maxLat) / 2);
  const projetar = projecaoUtm(fuso);
  for (const poligono of poligonos(g))
    poligono.forEach((anel, i) => {
      const projetado = anel.map((p) => projetar.forward([p[0], p[1]]));
      area += i === 0 ? areaPlana(projetado) : -areaPlana(projetado);
      if (i === 0) perimetro += comprimentoPlano(projetado);
    });
  return { ha: area / 10_000, perimetroM: perimetro, metodo: "utm", fuso };
}

/** Usado nos testes e na geração de exemplos: UTM → lon/lat */
export function utmParaGeo(fuso: Fuso, x: number, y: number): Position {
  return projecaoUtm(fuso).inverse([x, y]);
}

export const descreverMetodo = (r: ResultadoArea) =>
  r.metodo === "utm"
    ? `Área plana em SIRGAS 2000 / UTM zona ${r.fuso.zona}${r.fuso.sul ? "S" : "N"} (EPSG:${r.fuso.epsg}), mesmo referencial das peças do SIGEF.`
    : "Área geodésica sobre o elipsoide GRS80 (SIRGAS 2000), porque o perímetro cruza dois fusos UTM.";

/** Comprimento de uma linha somando os trechos sobre o elipsoide (vale em qualquer fuso). */
export function calcularComprimento(g: LineString | MultiLineString): number {
  const linhas = g.type === "LineString" ? [g.coordinates] : g.coordinates;
  let total = 0;
  for (const linha of linhas)
    for (let i = 1; i < linha.length; i++)
      total += geodesico.Inverse(linha[i - 1][1], linha[i - 1][0], linha[i][1], linha[i][0]).s12 ?? 0;
  return total;
}

export const METODO_COMPRIMENTO = "Comprimento geodésico sobre o elipsoide GRS80 (SIRGAS 2000), somando trecho a trecho.";

/** Distância em metros entre dois pontos, sobre o elipsoide */
export const distanciaGeodesica = (a: Position, b: Position) => geodesico.Inverse(a[1], a[0], b[1], b[0]).s12 ?? 0;
