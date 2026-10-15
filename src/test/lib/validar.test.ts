import { validar } from "@/lib/geo/validar";

describe("validar", () => {
  it("não reclama de um contorno correto", () => {
    expect(validar({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] })).toEqual([]);
  });

  it("aponta onde o contorno se cruza", () => {
    // Formato de gravata-borboleta: cruza em (0,5; 0,5)
    const [aviso] = validar({ type: "Polygon", coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] });
    expect(aviso.mensagem).toMatch(/se cruza em um ponto/);
    expect(aviso.local).toEqual([0.5, 0.5]);
  });
});
