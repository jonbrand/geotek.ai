import { readFileSync } from "node:fs";
import path from "node:path";
import { lerArquivo } from "@/lib/geo/ler-arquivo";
import { calcularArea } from "@/lib/geo/area";
import { calcularSobreposicoes } from "@/lib/geo/sobreposicao";
import { validar } from "@/lib/geo/validar";
import { ARQUIVO_EXEMPLO } from "@/lib/exemplo";
import { PALETA_LOTES } from "@/lib/caso";

const arquivo = readFileSync(path.resolve(__dirname, "../../../public", ARQUIVO_EXEMPLO.url.slice(1)));
const conteudo = arquivo.buffer.slice(arquivo.byteOffset, arquivo.byteOffset + arquivo.byteLength) as ArrayBuffer;

describe("caso de demonstração", () => {
  it("mostra a disputa do córrego e a divergência com o confrontante", async () => {
    const { perimetros } = await lerArquivo(ARQUIVO_EXEMPLO.nome, conteudo);
    expect(perimetros.map((p) => p.nome)).toEqual([
      "Fazenda Santa Luzia — levantamento do autor",
      "Fazenda Boa Esperança — matrícula nº 12.345 do réu",
      "Sítio Recanto — confrontante ao sul",
    ]);
    perimetros.forEach((p) => expect(validar(p.geometria)).toEqual([]));

    const [autor, reu, recanto] = perimetros.map((p) => calcularArea(p.geometria).ha);
    expect(autor).toBeGreaterThan(600);
    expect(reu).toBeGreaterThan(450);
    expect(recanto).toBeGreaterThan(100);

    const sobreposicoes = calcularSobreposicoes(perimetros);
    expect(sobreposicoes).toHaveLength(2);
    const [principal, sul] = sobreposicoes;
    expect(principal.b.nome).toMatch(/Boa Esperança/);
    expect(principal.area.ha).toBeGreaterThan(70);
    expect(principal.area.ha).toBeLessThan(90);
    expect(sul.b.nome).toMatch(/Recanto/);
    expect(sul.area.ha).toBeGreaterThan(2);
    expect(sul.area.ha).toBeLessThan(5);
  });

  it("traz o córrego, os marcos e as informações das matrículas", async () => {
    const { perimetros, elementos } = await lerArquivo(ARQUIVO_EXEMPLO.nome, conteudo);
    expect(perimetros[1].atributos).toMatchObject({ Matrícula: "12.345 (fictícia)", Livro: "2-B", Folha: "114" });
    // Data do levantamento e nomes amigáveis dos campos (<displayName>) vêm do arquivo
    expect(perimetros[0].atributos).toMatchObject({ Data: "12/03/2026", "Código SIGEF": "exemplo-0000-0000" });
    expect(perimetros.every((p) => p.pasta === "Perímetros")).toBe(true);
    expect(perimetros.map((p) => p.cor)).toEqual(PALETA_LOTES);
    expect(elementos.filter((e) => e.tipo === "linha").map((e) => e.nome)).toEqual(["Córrego Lajeado"]);
    const marcos = elementos.filter((e) => e.tipo === "ponto");
    expect(marcos.map((m) => m.nome)).toEqual(["M-1", "M-2", "SL-01", "SL-02", "SL-03", "SL-04"]);
    expect(marcos.every((m) => m.pasta === "Marcos" && m.cor === "#ffffff")).toBe(true);
  });
});

describe("planta de exemplo", () => {
  it("vira planta com imagem, sem criar lote", async () => {
    const kmz = readFileSync(path.resolve(__dirname, "../../../public/exemplos/planta-exemplo.kmz"));
    const lido = await lerArquivo("planta-exemplo.kmz", kmz.buffer.slice(kmz.byteOffset, kmz.byteOffset + kmz.byteLength) as ArrayBuffer);
    expect(lido.perimetros).toEqual([]);
    expect(lido.plantas).toHaveLength(1);
    expect(lido.plantas[0].imagem).toMatch(/^(blob:|data:image\/png)/);
    expect(lido.avisos).toEqual([]);
  });
});
