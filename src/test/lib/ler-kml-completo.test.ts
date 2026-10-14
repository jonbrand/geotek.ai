import JSZip from "jszip";
import { ErroLeitura, lerArquivo, resumoDaLeitura } from "@/lib/geo/ler-arquivo";
import { calcularArea } from "@/lib/geo/area";
import { calcularSobreposicoes } from "@/lib/geo/sobreposicao";

const buffer = (texto: string) => new TextEncoder().encode(texto).buffer as ArrayBuffer;
const kml = (corpo: string, cabecalho = '<?xml version="1.0" encoding="UTF-8"?>') =>
  `${cabecalho}<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>${corpo}</Document></kml>`;

async function kmz(arquivos: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  for (const [nome, conteudo] of Object.entries(arquivos)) zip.file(nome, conteudo);
  return zip.generateAsync({ type: "arraybuffer" });
}

// Quadrado de ~1,1 km perto de Sorriso/MT
const QUADRADO = "-55.70,-12.50 -55.69,-12.50 -55.69,-12.51 -55.70,-12.51 -55.70,-12.50";
const poligono = (coords = QUADRADO) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
const PNG_1PX = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

describe("perímetro desenhado como caminho fechado", () => {
  it("vira área, com aviso", async () => {
    const { perimetros, elementos } = await lerArquivo("a.kml", buffer(kml(`<Placemark><name>Lote</name><LineString><coordinates>${QUADRADO}</coordinates></LineString></Placemark>`)));
    expect(elementos).toEqual([]);
    expect(perimetros).toHaveLength(1);
    expect(perimetros[0].avisos).toEqual(["Este contorno veio como caminho fechado e foi tratado como área."]);
    expect(calcularArea(perimetros[0].geometria).ha).toBeGreaterThan(100);
  });

  it("aceita um fechamento com folga de centímetros, mas não de metros", async () => {
    // 0,000003° ≈ 0,3 m; 0,00005° ≈ 5 m
    const quase = (folga: number) => `-55.70,-12.50 -55.69,-12.50 -55.69,-12.51 -55.70,-12.51 ${-55.7 + folga},-12.50`;
    const ler = async (folga: number) => lerArquivo("a.kml", buffer(kml(`<Placemark><LineString><coordinates>${quase(folga)}</coordinates></LineString></Placemark>`)));
    expect((await ler(0.000003)).perimetros).toHaveLength(1);
    expect((await ler(0.00005)).elementos[0].tipo).toBe("linha");
  });

  it("deixa caminhos abertos como linha", async () => {
    const { elementos } = await lerArquivo("a.kml", buffer(kml(`<Placemark><LineString><coordinates>-55.70,-12.50 -55.69,-12.50 -55.69,-12.51</coordinates></LineString></Placemark>`)));
    expect(elementos[0].tipo).toBe("linha");
  });
});

describe("planta digitalizada (GroundOverlay)", () => {
  const sobreposta = `<GroundOverlay><name>Planta 1987</name><Icon><href>files/planta.png</href></Icon>
    <LatLonBox><north>-12.50</north><south>-12.51</south><east>-55.69</east><west>-55.70</west></LatLonBox></GroundOverlay>`;

  it("vira planta, nunca lote — sem área nem sobreposição falsa", async () => {
    const lido = await lerArquivo("a.kml", buffer(kml(`${sobreposta}<Placemark><name>Lote</name>${poligono()}</Placemark>`)));
    expect(lido.perimetros).toHaveLength(1);
    expect(calcularSobreposicoes(lido.perimetros)).toEqual([]);
    expect(lido.plantas).toHaveLength(1);
    expect(lido.plantas[0].cantos).toEqual([[-55.7, -12.5], [-55.69, -12.5], [-55.69, -12.51], [-55.7, -12.51]]);
  });

  it("traz a imagem quando ela vem no KMZ", async () => {
    const { plantas, avisos } = await lerArquivo("a.kmz", await kmz({ "doc.kml": kml(sobreposta), "files/planta.png": PNG_1PX }));
    expect(plantas[0].imagem).toMatch(/^(blob:|data:image\/png)/);
    expect(avisos).toEqual([]);
  });

  it("avisa quando a imagem não veio junto", async () => {
    const { plantas, avisos } = await lerArquivo("a.kml", buffer(kml(sobreposta)));
    expect(plantas[0].imagem).toBeUndefined();
    expect(avisos[0]).toMatch(/planta\.png.*não veio junto.*\.kmz/);
  });

  it("ordena os cantos de gx:LatLonQuad como noroeste, nordeste, sudeste, sudoeste", async () => {
    const quad = `<GroundOverlay><name>Q</name><gx:LatLonQuad><coordinates>-55.70,-12.51 -55.69,-12.51 -55.69,-12.50 -55.70,-12.50</coordinates></gx:LatLonQuad></GroundOverlay>`;
    const { plantas } = await lerArquivo("a.kml", buffer(kml(quad)));
    expect(plantas[0].cantos).toEqual([[-55.7, -12.5], [-55.69, -12.5], [-55.69, -12.51], [-55.7, -12.51]]);
  });
});

describe("texto e codificação", () => {
  it("lê arquivos em ISO-8859-1 sem estragar acentos", async () => {
    const texto = kml(`<Placemark><name>Fazenda São João - Matrícula nº 5</name>${poligono()}</Placemark>`, '<?xml version="1.0" encoding="ISO-8859-1"?>');
    const latin1 = Uint8Array.from(texto, (c) => c.charCodeAt(0) & 0xff);
    const { perimetros } = await lerArquivo("a.kml", latin1.buffer as ArrayBuffer);
    expect(perimetros[0].nome).toBe("Fazenda São João - Matrícula nº 5");
  });

  it("usa o nome amigável dos campos", async () => {
    const corpo = `<Schema id="s"><SimpleField name="MAT" type="string"><displayName>Matrícula</displayName></SimpleField></Schema>
      <Placemark><ExtendedData><SchemaData schemaUrl="#s"><SimpleData name="MAT">123</SimpleData></SchemaData></ExtendedData>${poligono()}</Placemark>`;
    const { perimetros } = await lerArquivo("a.kml", buffer(kml(corpo)));
    expect(perimetros[0].atributos).toEqual({ Matrícula: "123" });
  });

  it("guarda datas do levantamento e do trajeto", async () => {
    const corpo = `<Placemark><name>Marco</name><TimeStamp><when>2026-03-01</when></TimeStamp><Point><coordinates>-55.7,-12.5</coordinates></Point></Placemark>
      <Placemark><name>Lote</name><TimeSpan><begin>2026-03-01</begin><end>2026-03-05</end></TimeSpan>${poligono()}</Placemark>
      <Placemark><name>Caminhamento</name><gx:Track><when>2026-03-01T10:00:00Z</when><when>2026-03-01T11:30:00Z</when>
        <gx:coord>-55.7 -12.5 300</gx:coord><gx:coord>-55.69 -12.51 301</gx:coord></gx:Track></Placemark>`;
    const { perimetros, elementos } = await lerArquivo("a.kml", buffer(kml(corpo)));
    expect(elementos[0].atributos).toEqual({ Data: "01/03/2026" });
    expect(perimetros[0].atributos).toEqual({ Período: "01/03/2026 a 05/03/2026" });
    expect(Object.keys(elementos[1].atributos)).toEqual(["Início", "Fim"]);
    expect(elementos[1].atributos).not.toHaveProperty("coordinateProperties");
  });

  it("mantém o endereço dos links e as fotos do KMZ", async () => {
    const descricao = `<![CDATA[Ver <a href="https://exemplo.com/matricula.pdf">matrícula</a> <a href="javascript:alert(1)">aqui</a> <img src="fotos/marco.png"> <img src="sumiu.jpg">]]>`;
    const corpo = `<Placemark><name>M-1</name><description>${descricao}</description><Point><coordinates>-55.7,-12.5</coordinates></Point></Placemark>`;
    const { elementos } = await lerArquivo("a.kmz", await kmz({ "doc.kml": kml(corpo), "fotos/marco.png": PNG_1PX }));
    expect(elementos[0].descricao).toBe("Ver matrícula (https://exemplo.com/matricula.pdf) aqui [foto: sumiu.jpg — não incluída no arquivo]");
    expect(elementos[0].fotos).toEqual([{ nome: "marco.png", url: expect.stringMatching(/^(blob:|data:image\/png)/) }]);
  });
});

describe("estrutura do arquivo", () => {
  it("junta as partes de uma mesma gleba num só imóvel", async () => {
    const outra = "-55.68,-12.50 -55.67,-12.50 -55.67,-12.51 -55.68,-12.51 -55.68,-12.50";
    const { perimetros } = await lerArquivo("a.kml", buffer(kml(`<Placemark><name>Gleba</name><MultiGeometry>${poligono()}${poligono(outra)}<Point><coordinates>-55.7,-12.5</coordinates></Point></MultiGeometry></Placemark>`)));
    expect(perimetros).toHaveLength(1);
    expect(perimetros[0].geometria.type).toBe("MultiPolygon");
    const umaParte = calcularArea({ type: "Polygon", coordinates: [QUADRADO.split(" ").map((p) => p.split(",").map(Number))] }).ha;
    expect(calcularArea(perimetros[0].geometria).ha).toBeCloseTo(2 * umaParte, 0);
    expect(perimetros[0].avisos?.[0]).toMatch(/2 partes/);
  });

  it("guarda nome do documento, descrição das pastas e anotações sem localização", async () => {
    const corpo = `<name>Levantamento Fazenda X</name><Folder><name>Marcos</name><description>Implantados em março</description>
      <Placemark><name>Observação</name><description>Confrontante não localizado</description></Placemark>
      <Placemark><name>M-1</name><Point><coordinates>-55.7,-12.5</coordinates></Point></Placemark></Folder>`;
    const lido = await lerArquivo("a.kml", buffer(kml(corpo)));
    expect(lido.documento?.nome).toBe("Levantamento Fazenda X");
    expect(lido.pastas).toEqual({ Marcos: "Implantados em março" });
    expect(lido.observacoes).toMatchObject([{ nome: "Observação", descricao: "Confrontante não localizado", pasta: "Marcos" }]);
  });

  it("avisa sobre dados externos e outros arquivos no pacote", async () => {
    const corpo = `<NetworkLink><name>CAR</name><Link><href>https://exemplo.com/car.kml</href></Link></NetworkLink><Placemark>${poligono()}</Placemark>`;
    const { avisos, perimetros } = await lerArquivo("a.kmz", await kmz({ "outro.kml": kml(""), "doc.kml": kml(corpo) }));
    expect(perimetros).toHaveLength(1);
    expect(avisos).toEqual([expect.stringMatching(/outros arquivos.*outro\.kml/), expect.stringMatching(/dados externos \("CAR", exemplo\.com\)/)]);
  });

  it("marca o que estava oculto, sem esconder", async () => {
    const { perimetros, avisos } = await lerArquivo("a.kml", buffer(kml(`<Placemark><visibility>0</visibility>${poligono()}</Placemark>`)));
    expect(perimetros[0].oculto).toBe(true);
    expect(avisos[0]).toMatch(/1 item estava oculto/);
  });

  it("resume o que foi lido", async () => {
    const lido = await lerArquivo("a.kml", buffer(kml(`<Placemark>${poligono()}</Placemark><Placemark><Point><coordinates>-55.7,-12.5</coordinates></Point></Placemark>`)));
    expect(resumoDaLeitura(lido)).toBe("Lidos: 1 perímetro, 1 ponto.");
  });
});

describe("coordenadas", () => {
  it("recusa latitude e longitude trocadas, sem corrigir sozinho", async () => {
    const trocado = "-12.50,-55.70 -12.50,-55.69 -12.51,-55.69 -12.50,-55.70";
    const erro = await lerArquivo("a.kml", buffer(kml(`<Placemark>${poligono(trocado)}</Placemark>`))).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroLeitura);
    expect(erro.message).toMatch(/latitude e longitude parecem trocadas/);
  });

  it("avisa, sem bloquear, quando o local está fora do Brasil", async () => {
    const { elementos, avisos } = await lerArquivo("a.kml", buffer(kml(`<Placemark><Point><coordinates>-9.14,38.72</coordinates></Point></Placemark>`)));
    expect(elementos).toHaveLength(1);
    expect(avisos[0]).toMatch(/fora do território brasileiro/);
  });
});
