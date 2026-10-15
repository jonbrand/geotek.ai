import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapaMapLibre } from "maplibre-gl";
import { Link2, Printer, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { Mapa } from "@/components/Mapa";
import { FUNDO_PADRAO, rotulosDoCaso, type Fundo } from "@/lib/mapa";
import { PainelCaso } from "@/components/PainelCaso";
import { AreaDeEnvio } from "@/components/AreaDeEnvio";
import { FolhaImpressao } from "@/components/FolhaImpressao";
import { capturarMapa, type Captura } from "@/lib/captura";
import { casoVazio, type Caso, type Geometria, type GeometriaElemento } from "@/lib/caso";
import { fichasDoCaso } from "@/lib/ficha";
import { calcularArea } from "@/lib/geo/area";
import { calcularPartesExclusivas, calcularSobreposicoes } from "@/lib/geo/sobreposicao";
import { validar } from "@/lib/geo/validar";
import { ErroLeitura, lerArquivo, resumoDaLeitura, type ConteudoArquivo, type RegistroDeLeitura } from "@/lib/geo/ler-arquivo";
import { casoParaFragmento, ErroLinkGrande, fragmentoParaCaso } from "@/lib/link";
import { ARQUIVO_EXEMPLO, METADADOS_EXEMPLO } from "@/lib/exemplo";

// Preferência de cada visitante; sem acesso ao armazenamento, vale o padrão
const CHAVE_FUNDO = "geotek:fundo";
function lerFundoSalvo(): Fundo {
  try {
    const salvo = localStorage.getItem(CHAVE_FUNDO);
    return salvo === "ruas" || salvo === "satelite" ? salvo : FUNDO_PADRAO;
  } catch {
    return FUNDO_PADRAO;
  }
}

const geometriasDo = (c: Pick<ConteudoArquivo, "perimetros" | "elementos" | "plantas">) => [
  ...[...c.perimetros, ...c.elementos].map((p) => p.geometria),
  ...c.plantas.map((p) => ({ type: "Polygon" as const, coordinates: [[...p.cantos, p.cantos[0]]] })),
];

const App = () => {
  const [caso, setCaso] = useState<Caso>(() => fragmentoParaCaso(window.location.hash) ?? casoVazio());
  const [leitura, setLeitura] = useState(() => fragmentoParaCaso(window.location.hash) !== null);
  const [enquadrar, setEnquadrar] = useState<{ geometrias: (Geometria | GeometriaElemento)[] } | null>(() =>
    leitura ? { geometrias: [...caso.perimetros, ...caso.elementos].map((p) => p.geometria) } : null,
  );
  const [leituras, setLeituras] = useState<RegistroDeLeitura[]>([]);
  const [fichaAberta, setFichaAberta] = useState<{ id: string } | null>(null);
  const [fundo, setFundo] = useState<Fundo>(lerFundoSalvo);
  const trocarFundo = (novo: Fundo) => {
    setFundo(novo);
    try {
      localStorage.setItem(CHAVE_FUNDO, novo);
    } catch {
      // Sem armazenamento: a escolha vale só nesta visita
    }
  };
  const [arrastando, setArrastando] = useState(false);
  const [captura, setCaptura] = useState<Captura | null>(null);
  // Caso fictício aberto na primeira visita; some quando o usuário começa o dele
  const [demonstracao, setDemonstracao] = useState(false);
  const mapa = useRef<MapaMapLibre>();

  const areas = useMemo(() => new Map(caso.perimetros.map((p) => [p.id, calcularArea(p.geometria)])), [caso.perimetros]);
  const avisos = useMemo(() => new Map(caso.perimetros.map((p) => [p.id, validar(p.geometria)])), [caso.perimetros]);
  const sobreposicoes = useMemo(() => calcularSobreposicoes(caso.perimetros), [caso.perimetros]);
  const rotulos = useMemo(
    () => rotulosDoCaso(caso.perimetros, sobreposicoes, new Map([...areas].map(([id, a]) => [id, a.ha]))),
    [caso.perimetros, sobreposicoes, areas],
  );
  const partes = useMemo(() => calcularPartesExclusivas(caso.perimetros, sobreposicoes), [caso.perimetros, sobreposicoes]);
  const fichas = useMemo(() => fichasDoCaso(caso, areas), [caso, areas]);
  const pontosDeAviso = useMemo(() => [...avisos.values()].flat().flatMap((a) => (a.local ? [a.local] : [])), [avisos]);

  // Link colado em uma aba já aberta
  useEffect(() => {
    const aoMudar = () => {
      const recebido = fragmentoParaCaso(window.location.hash);
      if (!recebido) return;
      setCaso(recebido);
      setLeitura(true);
      setDemonstracao(false);
      setEnquadrar({ geometrias: [...recebido.perimetros, ...recebido.elementos].map((p) => p.geometria) });
    };
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  useEffect(() => {
    if (captura) window.print();
  }, [captura]);

  // Cores dos lotes já no caso, para cada arquivo novo receber as próximas livres
  const coresEmUso = useRef<string[]>([]);
  coresEmUso.current = caso.perimetros.map((p) => p.cor);

  const adicionar = async (arquivos: { nome: string; conteudo: ArrayBuffer }[]) => {
    for (const { nome, conteudo } of arquivos) {
      try {
        const lido = await lerArquivo(nome, conteudo, coresEmUso.current);
        coresEmUso.current = [...coresEmUso.current, ...lido.perimetros.map((p) => p.cor)];
        setCaso((atual) => ({
          ...atual,
          // O nome do documento do arquivo é uma boa sugestão para um caso ainda sem nome
          nome: atual.nome || lido.documento?.nome || "",
          perimetros: [...atual.perimetros, ...lido.perimetros],
          elementos: [...atual.elementos, ...lido.elementos],
          plantas: [...atual.plantas, ...lido.plantas],
          observacoes: [...atual.observacoes, ...lido.observacoes],
          pastas: { ...atual.pastas, ...lido.pastas },
        }));
        setEnquadrar({ geometrias: geometriasDo(lido) });
        const resumo = resumoDaLeitura(lido);
        setLeituras((atuais) => [...atuais, { arquivo: nome, resumo, avisos: lido.avisos }]);
        if (lido.avisos.length) toast.warning(`${nome} — ${resumo}`, { description: "Parte do arquivo não pôde ser aproveitada. Veja \"O que veio no arquivo\" no painel." });
        else toast.success(`${nome} — ${resumo}`);
      } catch (e) {
        toast.error(e instanceof ErroLeitura ? e.message : `Não conseguimos ler "${nome}". Tente exportar o arquivo de novo.`);
      }
    }
  };

  const enviarArquivos = async (arquivos: File[]) => {
    if (demonstracao) {
      // Os arquivos do usuário substituem o caso fictício em vez de se misturar a ele
      setCaso(casoVazio());
      coresEmUso.current = [];
      setLeituras([]);
      setDemonstracao(false);
    }
    await adicionar(await Promise.all(arquivos.map(async (f) => ({ nome: f.name, conteudo: await f.arrayBuffer() }))));
  };

  const abrirExemplo = async () => {
    try {
      const resposta = await fetch(ARQUIVO_EXEMPLO.url);
      const lido = await lerArquivo(ARQUIVO_EXEMPLO.nome, await resposta.arrayBuffer());
      const { perimetros, elementos, plantas, observacoes, pastas } = lido;
      setCaso({ ...METADADOS_EXEMPLO, perimetros, elementos, plantas, observacoes, pastas });
      setEnquadrar({ geometrias: lido.perimetros.map((p) => p.geometria) });
      setDemonstracao(true);
    } catch {
      // Sem o exemplo, o app continua utilizável a partir da área de envio
    }
  };

  const comecarMeuCaso = () => {
    setCaso(casoVazio());
    setLeituras([]);
    setDemonstracao(false);
  };

  // Primeira visita sem link compartilhado: o caso fictício já aparece montado
  const abriuExemplo = useRef(false);
  useEffect(() => {
    if (leitura || abriuExemplo.current) return;
    abriuExemplo.current = true;
    abrirExemplo();
  });

  const copiarLink = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}${casoParaFragmento(caso)}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado. Quem abrir verá este mapa, sem poder alterar nada.");
    } catch (e) {
      toast.error(e instanceof ErroLinkGrande ? e.message : "Não foi possível copiar o link.");
    }
  };

  const exportar = () => {
    if (!mapa.current) return;
    setCaptura(capturarMapa(mapa.current, rotulos, fundo));
  };

  const temConteudo = caso.perimetros.length > 0 || caso.elementos.length > 0;

  return (
    <div
      className="flex h-screen flex-col"
      onDragOver={(e) => {
        if (leitura) return;
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastando(false);
      }}
      onDrop={(e) => {
        if (leitura) return;
        e.preventDefault();
        setArrastando(false);
        enviarArquivos(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="tela flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
          <h1 className="text-xl font-bold tracking-tight">Geotek.ai</h1>
          {leitura && <Badge variant="secondary">Somente leitura</Badge>}
          <div className="ml-auto flex gap-2">
            {!leitura && (
              <Button size="sm" variant="outline" disabled={!temConteudo} onClick={copiarLink}>
                <Link2 className="mr-1.5 h-4 w-4" /> Copiar link
              </Button>
            )}
            <Button size="sm" disabled={!temConteudo} onClick={exportar}>
              <Printer className="mr-1.5 h-4 w-4" /> Imprimir / Exportar
            </Button>
          </div>
        </header>

        {demonstracao && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-950">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              <strong>Este é um caso fictício para você explorar.</strong>{" "}
              <span className="hidden sm:inline">
                A faixa vermelha é a área que as duas matrículas reivindicam — o autor diz que a divisa é o córrego; a matrícula do réu, uma linha
                reta. Experimente clicar nas áreas, imprimir ou copiar o link.
              </span>
            </p>
            <Button size="sm" variant="outline" className="bg-white" onClick={comecarMeuCaso}>
              Começar meu caso
            </Button>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
          <aside className="max-h-[45vh] overflow-y-auto border-t p-4 md:max-h-none md:w-96 md:border-r md:border-t-0">
            {!leitura && (
              <div className="mb-5">
                <AreaDeEnvio compacta={temConteudo || demonstracao} onArquivos={enviarArquivos} onExemplo={temConteudo ? undefined : abrirExemplo} />
              </div>
            )}
            <PainelCaso
              caso={caso}
              areas={areas}
              avisos={avisos}
              sobreposicoes={sobreposicoes}
              leitura={leitura}
              leituras={leituras}
              onAlterar={setCaso}
              onEnquadrar={(g, id) => {
                setEnquadrar({ geometrias: [g] });
                setFichaAberta(id ? { id } : null);
              }}
            />
          </aside>
          <div className="relative min-h-[300px] flex-1">
            <Mapa
              perimetros={caso.perimetros}
              partes={partes}
              elementos={caso.elementos}
              plantas={caso.plantas}
              fichas={fichas}
              fichaAberta={fichaAberta}
              sobreposicoes={sobreposicoes}
              pontosDeAviso={pontosDeAviso}
              rotulos={rotulos}
              enquadrar={enquadrar}
              onMapa={(m) => (mapa.current = m)}
              fundo={fundo}
              onFundo={trocarFundo}
            />
            {arrastando && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/20 text-lg font-medium">
                {demonstracao ? "Solte os arquivos para começar o seu caso" : "Solte os arquivos para adicionar ao caso"}
              </div>
            )}
          </div>
        </main>
      </div>

      {captura && <FolhaImpressao captura={captura} caso={caso} areas={areas} sobreposicoes={sobreposicoes} />}
      <Toaster position="top-center" />
    </div>
  );
};

export default App;
