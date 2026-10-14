import { compressToEncodedURIComponent } from "lz-string";
import { casoParaFragmento, ErroLinkGrande, fragmentoParaCaso, PREFIXO } from "@/lib/link";
import type { Caso } from "@/lib/caso";

const caso: Caso = {
  plantas: [],
  observacoes: [],
  pastas: {},
  nome: "Demarcatória Silva × Souza",
  comarca: "Sorriso/MT",
  responsavel: "Eng. Ana Lima — CREA 12345",
  perimetros: [
    {
      id: "x", nome: "Laudo do autor", cor: "#1d4ed8", arquivo: "laudo.kml", sha256: "ab".repeat(32),
      atributos: { Matrícula: "12.345" }, descricao: "Levantamento de 2026", pasta: "Perímetros",
      geometria: { type: "Polygon", coordinates: [[[-55.123456789, -12.5], [-55.1, -12.5], [-55.1, -12.4], [-55.123456789, -12.5]]] },
    },
  ],
  elementos: [
    {
      id: "m", tipo: "ponto", nome: "M-1", cor: "#f97316", arquivo: "laudo.kml", sha256: "cd".repeat(32),
      atributos: { Tipo: "Concreto" }, pasta: "Marcos", geometria: { type: "Point", coordinates: [-55.11, -12.45, 320.5] },
    },
    {
      id: "c", tipo: "linha", nome: "Córrego", cor: "#38bdf8", arquivo: "laudo.kml", sha256: "cd".repeat(32),
      atributos: {}, geometria: { type: "LineString", coordinates: [[-55.1, -12.5], [-55.2, -12.4]] },
    },
  ],
};

describe("link do caso", () => {
  it("volta ao mesmo caso depois de virar link", () => {
    const volta = fragmentoParaCaso(casoParaFragmento(caso));
    expect(volta.nome).toBe(caso.nome);
    expect(volta.comarca).toBe(caso.comarca);
    expect(volta.responsavel).toBe(caso.responsavel);
    expect(volta.perimetros[0]).toMatchObject({ nome: "Laudo do autor", cor: "#1d4ed8", arquivo: "laudo.kml", sha256: caso.perimetros[0].sha256 });
    // Arredondado a 8 casas (≈ 1 mm)
    expect(volta.perimetros[0].geometria.coordinates[0][0]).toEqual([-55.12345679, -12.5]);
  });

  it("leva junto informações do arquivo, pontos e linhas", () => {
    const volta = fragmentoParaCaso(casoParaFragmento(caso));
    expect(volta.perimetros[0]).toMatchObject({ atributos: { Matrícula: "12.345" }, descricao: "Levantamento de 2026", pasta: "Perímetros" });
    expect(volta.elementos).toHaveLength(2);
    expect(volta.elementos[0]).toMatchObject({ tipo: "ponto", nome: "M-1", pasta: "Marcos", atributos: { Tipo: "Concreto" } });
    expect(volta.elementos[0].geometria).toEqual({ type: "Point", coordinates: [-55.11, -12.45, 320.5] });
    expect(volta.elementos[1]).toMatchObject({ tipo: "linha", nome: "Córrego", atributos: {} });
  });

  it("leva anotações, pastas, ocultos e a moldura das plantas, sem as imagens", () => {
    const completo: Caso = {
      ...caso,
      perimetros: [{ ...caso.perimetros[0], oculto: true, avisos: ["Este contorno veio como caminho fechado e foi tratado como área."], fotos: [{ nome: "f.png", url: "blob:x" }] }],
      plantas: [{ id: "p", nome: "Planta 1987", cantos: [[-55.7, -12.5], [-55.6, -12.5], [-55.6, -12.6], [-55.7, -12.6]], imagem: "blob:planta", opacidade: 0.5, arquivo: "p.kmz" }],
      observacoes: [{ id: "o", nome: "Observação", descricao: "Confrontante não localizado", atributos: {}, pasta: "Marcos", arquivo: "a.kml" }],
      pastas: { Marcos: "Implantados em março" },
    };
    const volta = fragmentoParaCaso(casoParaFragmento(completo));
    expect(volta.perimetros[0]).toMatchObject({ oculto: true, avisos: completo.perimetros[0].avisos });
    expect(volta.perimetros[0].fotos).toBeUndefined();
    expect(volta.plantas[0]).toMatchObject({ nome: "Planta 1987", cantos: completo.plantas[0].cantos, opacidade: 0.5 });
    expect(volta.plantas[0].imagem).toBeUndefined();
    expect(volta.observacoes[0]).toMatchObject({ nome: "Observação", descricao: "Confrontante não localizado", pasta: "Marcos" });
    expect(volta.pastas).toEqual({ Marcos: "Implantados em março" });
  });

  it("continua abrindo links da primeira versão", () => {
    const v1 = {
      v: 1, n: "Caso antigo", c: "", r: "",
      p: [
        { n: "Lote", k: "#2563eb", g: caso.perimetros[0].geometria, a: "a.kml", h: "" },
        { n: "Vizinho", k: "#f59e0b", g: caso.perimetros[0].geometria, a: "a.kml", h: "" },
      ],
    };
    const volta = fragmentoParaCaso(PREFIXO + compressToEncodedURIComponent(JSON.stringify(v1)));
    expect(volta.nome).toBe("Caso antigo");
    expect(volta.perimetros[0]).toMatchObject({ nome: "Lote", atributos: {} });
    // Cores antigas, de pouco contraste, viram as da paleta atual
    expect(volta.perimetros.map((p) => p.cor)).toEqual(["#1d4ed8", "#0d9488"]);
    expect(volta.elementos).toEqual([]);
  });

  it("recusa caso grande demais para um link", () => {
    const anel = Array.from({ length: 20_000 }, (_, i) => [-55 + Math.random() / 10, -12 + Math.random() / 10]);
    const grande: Caso = { ...caso, perimetros: [{ ...caso.perimetros[0], geometria: { type: "Polygon", coordinates: [anel] } }] };
    expect(() => casoParaFragmento(grande)).toThrow(ErroLinkGrande);
  });

  it("ignora fragmentos que não são caso", () => {
    expect(fragmentoParaCaso("#outra-coisa")).toBeNull();
    expect(fragmentoParaCaso("#c=lixo")).toBeNull();
  });
});
