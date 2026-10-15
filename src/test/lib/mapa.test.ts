import type { RasterSourceSpecification } from "maplibre-gl";
import { ATRIBUICAO_FUNDO, camadasDoFundo, estiloBase, FUNDO_PADRAO } from "@/lib/mapa";

const urlDoSatelite = (chave?: string) => (estiloBase(chave).sources.satelite as RasterSourceSpecification).tiles[0];

describe("fundos do mapa", () => {
  it("abre no satélite", () => {
    expect(FUNDO_PADRAO).toBe("satelite");
    const visiveis = estiloBase().layers.filter((c) => c.layout?.visibility === "visible").map((c) => c.id);
    expect(visiveis).toEqual(["satelite", "satelite-nomes"]);
  });

  it("usa a imagem da Esri sem chave", () => {
    expect(urlDoSatelite()).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false");
  });

  it("usa o serviço autenticado quando há chave", () => {
    expect(urlDoSatelite("abc 123")).toBe(
      "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false&token=abc%20123",
    );
  });

  it("liga e desliga as camadas certas em cada fundo", () => {
    expect(camadasDoFundo("satelite")).toEqual({ satelite: "visible", "satelite-nomes": "visible", ruas: "none" });
    expect(camadasDoFundo("ruas")).toEqual({ satelite: "none", "satelite-nomes": "none", ruas: "visible" });
  });

  it("cita a fonte de cada fundo", () => {
    expect((estiloBase().sources.satelite as RasterSourceSpecification).attribution).toBe(ATRIBUICAO_FUNDO.satelite);
    expect(ATRIBUICAO_FUNDO.satelite).toMatch(/Esri/);
    expect(ATRIBUICAO_FUNDO.ruas).toMatch(/OpenStreetMap/);
  });
});
