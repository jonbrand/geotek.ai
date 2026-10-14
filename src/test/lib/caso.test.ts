import { COR_LOTE_EXCEDENTE, normalizarCores, PALETA_LOTES, proximaCorDeLote, tracoDoLote, type Perimetro } from "@/lib/caso";

const lote = (id: string, cor: string): Perimetro => ({
  id, nome: id, cor, arquivo: "", sha256: "", atributos: {},
  geometria: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
});

describe("cores dos lotes", () => {
  it("dá a cada lote novo a próxima cor livre da paleta", () => {
    expect(proximaCorDeLote([])).toBe(PALETA_LOTES[0]);
    expect(proximaCorDeLote([PALETA_LOTES[0]])).toBe(PALETA_LOTES[1]);
  });

  it("reaproveita a cor de um lote removido sem repintar os demais", () => {
    // O 1º lote saiu; o 2º continua com a sua cor e o novo ocupa a vaga
    expect(proximaCorDeLote([PALETA_LOTES[1]])).toBe(PALETA_LOTES[0]);
  });

  it("usa cinza a partir do 4º lote e diferencia pelo traço", () => {
    expect(proximaCorDeLote(PALETA_LOTES)).toBe(COR_LOTE_EXCEDENTE);
    const lotes = [...PALETA_LOTES.map((c, i) => lote(`l${i}`, c)), lote("l3", COR_LOTE_EXCEDENTE), lote("l4", COR_LOTE_EXCEDENTE)];
    expect(lotes.map((l) => tracoDoLote(l, lotes))).toEqual([0, 1, 2, 0, 1]);
  });

  it("troca cores fora da paleta e repetidas", () => {
    const lotes = normalizarCores([lote("a", "#ff0000"), lote("b", PALETA_LOTES[0]), lote("c", PALETA_LOTES[0])]);
    expect(lotes.map((l) => l.cor)).toEqual([PALETA_LOTES[0], PALETA_LOTES[1], PALETA_LOTES[2]]);
  });
});
