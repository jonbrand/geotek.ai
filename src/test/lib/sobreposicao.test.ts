import type { Polygon } from "geojson";
import type { Perimetro } from "@/lib/caso";
import { calcularPartesExclusivas, calcularSobreposicoes } from "@/lib/geo/sobreposicao";
import { calcularArea } from "@/lib/geo/area";

const retangulo = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
  type: "Polygon",
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});

const perimetro = (id: string, geometria: Polygon): Perimetro => ({
  id, nome: id, cor: "#000", geometria, arquivo: `${id}.kml`, sha256: "", atributos: {},
});

describe("calcularSobreposicoes", () => {
  it("encontra a faixa em comum entre dois perímetros", () => {
    const a = perimetro("a", retangulo(-55.73, -12.56, -55.71, -12.54));
    const b = perimetro("b", retangulo(-55.72, -12.56, -55.70, -12.54));
    const [s, ...resto] = calcularSobreposicoes([a, b]);
    expect(resto).toHaveLength(0);
    expect(s.a.id).toBe("a");
    expect(s.b.id).toBe("b");
    expect(s.area.ha).toBeCloseTo(calcularArea(a.geometria).ha / 2, 1);
  });

  it("ignora perímetros que não se tocam", () => {
    const a = perimetro("a", retangulo(-55.73, -12.56, -55.72, -12.55));
    const b = perimetro("b", retangulo(-55.70, -12.56, -55.69, -12.55));
    expect(calcularSobreposicoes([a, b])).toEqual([]);
  });

  it("ignora perímetros que só compartilham a divisa", () => {
    const a = perimetro("a", retangulo(-55.73, -12.56, -55.72, -12.55));
    const b = perimetro("b", retangulo(-55.72, -12.56, -55.71, -12.55));
    expect(calcularSobreposicoes([a, b])).toEqual([]);
  });
});

describe("calcularPartesExclusivas", () => {
  it("separa a parte só de cada lote da faixa em disputa", () => {
    const a = perimetro("a", retangulo(-55.73, -12.56, -55.71, -12.54));
    const b = perimetro("b", retangulo(-55.72, -12.56, -55.70, -12.54));
    const sobreposicoes = calcularSobreposicoes([a, b]);
    const partes = calcularPartesExclusivas([a, b], sobreposicoes);
    const soDeA = calcularArea(partes.get("a")).ha;
    expect(soDeA + sobreposicoes[0].area.ha).toBeCloseTo(calcularArea(a.geometria).ha, 3);
    expect(soDeA).toBeLessThan(calcularArea(a.geometria).ha);
  });

  it("mantém o lote inteiro quando não há disputa", () => {
    const a = perimetro("a", retangulo(-55.73, -12.56, -55.72, -12.55));
    expect(calcularPartesExclusivas([a], []).get("a")).toBe(a.geometria);
  });
});
