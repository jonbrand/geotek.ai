import type { Polygon } from "geojson";
import { calcularArea, calcularComprimento, fusoDe, utmParaGeo } from "@/lib/geo/area";

const fuso22S = fusoDe(-51, -15);

/** Quadrado de `lado` metros em UTM 22S, convertido para lon/lat */
const quadradoUtm = (x0: number, y0: number, lado: number): Polygon => ({
  type: "Polygon",
  coordinates: [
    [
      [x0, y0],
      [x0 + lado, y0],
      [x0 + lado, y0 + lado],
      [x0, y0 + lado],
      [x0, y0],
    ].map(([x, y]) => utmParaGeo(fuso22S, x, y)),
  ],
});

describe("fusoDe", () => {
  it.each([
    ["Sorriso (MT)", -55.71, -12.54, 21, 31981],
    ["Campinas (SP)", -47.06, -22.9, 23, 31983],
    ["Barreiras (BA)", -45.0, -12.15, 23, 31983],
    ["Rio Verde (GO)", -50.93, -17.79, 22, 31982],
    ["Boa Vista (RR)", -60.67, 2.82, 20, 31974],
  ])("escolhe a zona certa para %s", (_, lon, lat, zona, epsg) => {
    expect(fusoDe(lon, lat)).toMatchObject({ zona, epsg });
  });
});

describe("calcularArea", () => {
  it("calcula 100,0000 ha para um quadrado de 1 km na zona UTM do imóvel", () => {
    const r = calcularArea(quadradoUtm(500_000, 8_300_000, 1000));
    expect(r.metodo).toBe("utm");
    expect(r.fuso.epsg).toBe(31982);
    expect(r.ha).toBeCloseTo(100, 4);
    expect(r.perimetroM).toBeCloseTo(4000, 3);
  });

  it("desconta furos do contorno", () => {
    const externo = quadradoUtm(500_000, 8_300_000, 1000);
    const furo = quadradoUtm(500_100, 8_300_100, 100);
    const r = calcularArea({ type: "Polygon", coordinates: [externo.coordinates[0], furo.coordinates[0]] });
    expect(r.ha).toBeCloseTo(99, 4);
  });

  it("usa cálculo geodésico quando o perímetro cruza dois fusos", () => {
    // Faixa sobre o meridiano -54°, divisa entre as zonas 21 e 22
    const r = calcularArea({
      type: "Polygon",
      coordinates: [[[-54.01, -15], [-53.99, -15], [-53.99, -15.01], [-54.01, -15.01], [-54.01, -15]]],
    });
    expect(r.metodo).toBe("geodesico");
    expect(r.fuso).toBeUndefined();
    // ~2,15 km × ~1,11 km
    expect(r.ha).toBeGreaterThan(235);
    expect(r.ha).toBeLessThan(240);
  });

  it("dá o mesmo resultado nos dois sentidos de percurso", () => {
    const horario = [[-54.01, -15], [-53.99, -15], [-53.99, -15.01], [-54.01, -15.01], [-54.01, -15]];
    const antihorario = [...horario].reverse();
    const a = calcularArea({ type: "Polygon", coordinates: [horario] }).ha;
    const b = calcularArea({ type: "Polygon", coordinates: [antihorario] }).ha;
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("calcularComprimento", () => {
  it("soma os trechos sobre o elipsoide", () => {
    // 1 minuto de latitude perto de -12° ≈ 1.843 m
    const r = calcularComprimento({ type: "LineString", coordinates: [[-55.7, -12], [-55.7, -12 - 1 / 60], [-55.7, -12 - 2 / 60]] });
    expect(r).toBeGreaterThan(3680);
    expect(r).toBeLessThan(3690);
  });

  it("soma as partes de uma linha múltipla", () => {
    const trecho = [[-55.7, -12], [-55.7, -12.01]];
    const um = calcularComprimento({ type: "LineString", coordinates: trecho });
    expect(calcularComprimento({ type: "MultiLineString", coordinates: [trecho, trecho] })).toBeCloseTo(2 * um, 6);
  });
});
