import { ErroLeitura, lerArquivo } from "@/lib/geo/ler-arquivo";
import { PALETA_LOTES } from "@/lib/caso";

const buffer = (texto: string) => new TextEncoder().encode(texto).buffer as ArrayBuffer;

const kml = (corpo: string) => `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${corpo}</Document></kml>`;

const anel = "-55.73,-12.56,0 -55.71,-12.56,0 -55.71,-12.54,0 -55.73,-12.54,0 -55.73,-12.56,0";
const poligono = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${anel}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;

const levantamentoCompleto = kml(`
  <Style id="lote"><LineStyle><color>ff0000ff</color><width>3</width></LineStyle><PolyStyle><color>4d0000ff</color></PolyStyle></Style>
  <Style id="rio"><LineStyle><color>ffff9900</color><width>4</width></LineStyle></Style>
  <Schema id="dados"><SimpleField name="ccir" type="string"/></Schema>
  <Folder><name>Levantamento</name>
    <Folder><name>Perímetros</name>
      <Placemark>
        <name>Fazenda Boa Vista</name>
        <description><![CDATA[<p>Levantado em <b>2026</b>.</p><table><tr><td>Livro</td><td>2-B</td></tr></table>]]></description>
        <styleUrl>#lote</styleUrl>
        <ExtendedData>
          <Data name="matricula"><value>12.345</value></Data>
          <SchemaData schemaUrl="#dados"><SimpleData name="ccir">950.123.456.789-0</SimpleData></SchemaData>
        </ExtendedData>
        ${poligono}
      </Placemark>
    </Folder>
    <Folder><name>Marcos</name>
      <Placemark><name>M-01</name><description>Marco de concreto</description><Point><coordinates>-55.72,-12.55,320.5</coordinates></Point></Placemark>
    </Folder>
  </Folder>
  <Placemark><name>Córrego</name><styleUrl>#rio</styleUrl><LineString><coordinates>-55.73,-12.55 -55.70,-12.545</coordinates></LineString></Placemark>
`);

describe("lerArquivo — KML completo", () => {
  it("extrai perímetros, pontos e linhas", async () => {
    const { perimetros, elementos } = await lerArquivo("levantamento.kml", buffer(levantamentoCompleto));
    expect(perimetros.map((p) => p.nome)).toEqual(["Fazenda Boa Vista"]);
    expect(elementos.map((e) => [e.tipo, e.nome])).toEqual([
      ["ponto", "M-01"],
      ["linha", "Córrego"],
    ]);
    expect(elementos[0].geometria).toEqual({ type: "Point", coordinates: [-55.72, -12.55, 320.5] });
  });

  it("guarda atributos, descrição e a tabela da descrição", async () => {
    const [p] = (await lerArquivo("levantamento.kml", buffer(levantamentoCompleto))).perimetros;
    expect(p.atributos).toEqual({ matricula: "12.345", ccir: "950.123.456.789-0", Livro: "2-B" });
    expect(p.descricao).toBe("Levantado em 2026.");
    expect(p.arquivo).toBe("levantamento.kml");
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("guarda o caminho das pastas", async () => {
    const { perimetros, elementos } = await lerArquivo("levantamento.kml", buffer(levantamentoCompleto));
    expect(perimetros[0].pasta).toBe("Levantamento / Perímetros");
    expect(elementos[0].pasta).toBe("Levantamento / Marcos");
    expect(elementos[1].pasta).toBeUndefined();
  });

  it("usa a cor do arquivo em linhas, mas a paleta de contraste nos lotes", async () => {
    const { perimetros, elementos } = await lerArquivo("levantamento.kml", buffer(levantamentoCompleto));
    expect(perimetros[0].cor).toBe(PALETA_LOTES[0]);
    expect(elementos[1].cor).toBe("#0099ff");
  });

  it("dá aos lotes novos as cores ainda livres", async () => {
    const { perimetros } = await lerArquivo("levantamento.kml", buffer(levantamentoCompleto), [PALETA_LOTES[0]]);
    expect(perimetros[0].cor).toBe(PALETA_LOTES[1]);
  });

  it("nunca leva HTML do arquivo adiante, só o texto", async () => {
    const malicioso = kml(`<Placemark><name>Lote</name>
      <description><![CDATA[Antes<script>alert(1)</script><img src=x onerror="alert(2)">depois<br>linha 2]]></description>
      ${poligono}</Placemark>`);
    const [p] = (await lerArquivo("lote.kml", buffer(malicioso))).perimetros;
    // A imagem quebrada vira registro em texto; o script some
    expect(p.descricao).toBe("Antes [foto: x — não incluída no arquivo] depois\nlinha 2");
    expect(p.descricao).not.toMatch(/[<>]/);
  });

  it("aceita um arquivo só com marcos", async () => {
    const soMarcos = kml(`<Placemark><Point><coordinates>-55.7,-12.5</coordinates></Point></Placemark>
      <Placemark><Point><coordinates>-55.6,-12.5</coordinates></Point></Placemark>`);
    const { perimetros, elementos } = await lerArquivo("marcos.kml", buffer(soMarcos));
    expect(perimetros).toEqual([]);
    expect(elementos.map((e) => e.nome)).toEqual(["Ponto 1", "Ponto 2"]);
  });

  it("separa as partes de uma geometria múltipla", async () => {
    const multi = kml(`<Placemark><name>Lote com sede</name><MultiGeometry>${poligono}
      <Point><coordinates>-55.72,-12.55</coordinates></Point></MultiGeometry></Placemark>`);
    const { perimetros, elementos } = await lerArquivo("multi.kml", buffer(multi));
    expect(perimetros).toHaveLength(1);
    expect(elementos).toHaveLength(1);
    expect(elementos[0]).toMatchObject({ tipo: "ponto", nome: "Lote com sede" });
  });
});

describe("lerArquivo — GeoJSON e erros", () => {
  const geojson = JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { nome: "Lote 1", matricula: 987, area_doc: null }, geometry: { type: "Polygon", coordinates: [[[-55, -12], [-54.9, -12], [-54.9, -12.1], [-55, -12]]] } },
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-55, -12] } },
    ],
  });

  it("lê GeoJSON com propriedades como atributos", async () => {
    const { perimetros, elementos } = await lerArquivo("lotes.geojson", buffer(geojson));
    expect(perimetros[0]).toMatchObject({ nome: "Lote 1", atributos: { matricula: "987" } });
    expect(elementos).toHaveLength(1);
  });

  it("explica em português quando o arquivo está vazio", async () => {
    await expect(lerArquivo("vazio.kml", buffer(kml("")))).rejects.toThrow(/não contém nada/);
  });

  it("recusa coordenadas que não são latitude e longitude", async () => {
    const utm = JSON.stringify({ type: "Point", coordinates: [500000, 8300000] });
    await expect(lerArquivo("utm.geojson", buffer(utm))).rejects.toThrow(/não estão em latitude e longitude/);
  });

  it("orienta quem envia um shapefile", async () => {
    const erro = await lerArquivo("lote.shp", buffer("x")).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroLeitura);
    expect(erro.message).toMatch(/Google Earth/);
  });
});
