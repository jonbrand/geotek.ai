import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "@/App";
import { casoParaFragmento } from "@/lib/link";

// WebGL não existe no jsdom
vi.mock("@/components/Mapa", () => ({ Mapa: () => <div data-testid="mapa" /> }));

const fragmento = casoParaFragmento({
  plantas: [],
  observacoes: [],
  pastas: {},
  nome: "Demarcatória Silva × Souza",
  comarca: "Sorriso/MT",
  responsavel: "",
  perimetros: [
    {
      id: "a", nome: "Laudo do autor", cor: "#2563eb", arquivo: "a.kml", sha256: "", atributos: {},
      geometria: { type: "Polygon", coordinates: [[[-55.73, -12.56], [-55.71, -12.56], [-55.71, -12.54], [-55.73, -12.54], [-55.73, -12.56]]] },
    },
    {
      id: "b", nome: "Matrícula do réu", cor: "#f59e0b", arquivo: "b.kml", sha256: "", atributos: {},
      geometria: { type: "Polygon", coordinates: [[[-55.72, -12.56], [-55.70, -12.56], [-55.70, -12.54], [-55.72, -12.54], [-55.72, -12.56]]] },
    },
  ],
  elementos: [
    {
      id: "c", tipo: "linha", nome: "Córrego Lajeado", cor: "#38bdf8", arquivo: "a.kml", sha256: "", atributos: {},
      geometria: { type: "LineString", coordinates: [[-55.715, -12.57], [-55.715, -12.53]] },
    },
    {
      id: "m", tipo: "ponto", nome: "M-1", cor: "#f97316", arquivo: "a.kml", sha256: "", atributos: { Tipo: "Marco de concreto" },
      pasta: "Marcos", geometria: { type: "Point", coordinates: [-55.715, -12.54] },
    },
  ],
});

const exemplo = readFileSync(path.resolve(__dirname, "../../public/exemplos/demarcatoria-sorriso.kml"));

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(exemplo)));
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  it("abre logo de cara o caso fictício de demarcação", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Geotek.ai" })).toBeInTheDocument();
    expect(await screen.findByText("Este é um caso fictício para você explorar.")).toBeInTheDocument();
    expect(screen.getByText("Área em disputa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fazenda Santa Luzia — levantamento do autor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeEnabled();
    // O satélite é o padrão: não há mais aviso de "mapa de ruas"
    expect(screen.queryByText("Mapa de ruas")).not.toBeInTheDocument();
  });

  it("\"Começar meu caso\" troca o exemplo pela área de envio", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Começar meu caso" }));
    expect(screen.queryByText("Este é um caso fictício para você explorar.")).not.toBeInTheDocument();
    expect(screen.queryByText("Área em disputa")).not.toBeInTheDocument();
    expect(screen.getByText(/Arraste para cá/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeDisabled();
  });

  it("mostra o que foi lido e o que não pôde ser aproveitado", async () => {
    render(<App />);
    await screen.findByText("Este é um caso fictício para você explorar.");
    const conteudo = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <NetworkLink><name>CAR</name><Link><href>https://exemplo.com/car.kml</href></Link></NetworkLink>
        <Placemark><name>Meu lote</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-55.70,-12.50 -55.69,-12.50 -55.69,-12.51 -55.70,-12.50</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      </Document></kml>`;
    const arquivo = new File([conteudo], "meu-lote.kml");
    // O File do jsdom não implementa arrayBuffer()
    Object.defineProperty(arquivo, "arrayBuffer", { value: async () => new TextEncoder().encode(conteudo).buffer });
    fireEvent.change(screen.getByTestId("entrada-arquivos"), { target: { files: [arquivo] } });
    expect(await screen.findByText("O que veio no arquivo")).toBeInTheDocument();
    expect(screen.getByText("Lidos: 1 perímetro.")).toBeInTheDocument();
    expect(screen.getByText(/dados externos \("CAR", exemplo\.com\)/)).toBeInTheDocument();
  });

  it("abre um link compartilhado em modo leitura, com a área em disputa", () => {
    window.history.replaceState(null, "", `/${fragmento}`);
    render(<App />);
    expect(screen.getByText("Somente leitura")).toBeInTheDocument();
    expect(screen.queryByText("Envie os arquivos do levantamento")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar link/ })).not.toBeInTheDocument();
    expect(screen.getByText("Demarcatória Silva × Souza")).toBeInTheDocument();
    expect(screen.getByText("Área em disputa")).toBeInTheDocument();
    expect(screen.getByText("Outros elementos do levantamento")).toBeInTheDocument();
    expect(screen.getByText("Córrego Lajeado")).toBeInTheDocument();
    expect(screen.getByText("M-1")).toBeInTheDocument();
    expect(screen.getByText("Marco de concreto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Este é um caso fictício para você explorar.")).not.toBeInTheDocument();
  });

  it("não mostra jargão técnico fora dos detalhes técnicos", () => {
    window.history.replaceState(null, "", `/${fragmento}`);
    const { container } = render(<App />);
    container.querySelectorAll("details").forEach((d) => d.remove());
    expect(container.textContent).not.toMatch(/EPSG|shapefile|datum|buffer|geometria|UTM/i);
  });
});
