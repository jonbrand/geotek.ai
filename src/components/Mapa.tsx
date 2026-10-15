import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { bbox } from "@turf/bbox";
import { feature, featureCollection } from "@turf/helpers";
import type { FeatureCollection, Position } from "geojson";
import { COR_DISPUTA, TRACOS, tracoDoLote, type Elemento, type Geometria, type GeometriaElemento, type Perimetro, type Planta } from "@/lib/caso";
import { AmostraLote } from "@/components/AmostraLote";
import type { Ficha } from "@/lib/ficha";
import type { Sobreposicao } from "@/lib/geo/sobreposicao";
import { CASCO_DO_FUNDO, camadasDoFundo, CHAVE_ESRI, estiloBase, type Fundo, type Rotulo } from "@/lib/mapa";

interface Props {
  perimetros: Perimetro[];
  /** Parte de cada lote fora das faixas em disputa (só para o preenchimento) */
  partes: Map<string, Geometria | null>;
  elementos: Elemento[];
  plantas: Planta[];
  fichas: Map<string, Ficha>;
  /** Muda de identidade sempre que uma ficha deve ser aberta a partir do painel */
  fichaAberta: { id: string } | null;
  sobreposicoes: Sobreposicao[];
  pontosDeAviso: Position[];
  rotulos: Rotulo[];
  /** Muda de identidade sempre que o mapa deve reenquadrar */
  enquadrar: { geometrias: (Geometria | GeometriaElemento)[] } | null;
  onMapa?: (mapa: maplibregl.Map) => void;
  fundo: Fundo;
  onFundo: (fundo: Fundo) => void;
}

const VAZIO: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Listras diagonais vermelhas para destacar a faixa em disputa */
function hachura(): ImageData {
  const lado = 12;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = lado;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(153, 27, 27, 0.95)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-2, lado + 2);
  ctx.lineTo(lado + 2, -2);
  ctx.moveTo(-2, 2);
  ctx.lineTo(2, -2);
  ctx.moveTo(lado - 2, lado + 2);
  ctx.lineTo(lado + 2, lado - 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, lado, lado);
}


// Camadas que abrem a ficha ao clicar, da mais específica para a mais geral
const CAMADAS_CLICAVEIS = ["elementos-pontos", "elementos-linhas-toque", "perimetros-fundo"];

/** Monta a ficha só com textContent: o conteúdo vem do arquivo e não pode virar HTML */
function elementoDaFicha(ficha: Ficha): HTMLElement {
  const criar = (tag: string, classe: string, texto?: string) => {
    const el = document.createElement(tag);
    el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  };
  const raiz = criar("div", "ficha-mapa");
  raiz.append(criar("p", "ficha-titulo", ficha.titulo), criar("p", "ficha-medida", ficha.medida));
  if (ficha.oculto) raiz.append(criar("p", "ficha-aviso", "Estava oculto no arquivo original."));
  for (const aviso of ficha.avisos) raiz.append(criar("p", "ficha-aviso", aviso));
  if (ficha.pasta) raiz.append(criar("p", "ficha-pasta", `Pasta: ${ficha.pasta}`));
  if (ficha.descricao) raiz.append(criar("p", "ficha-descricao", ficha.descricao));
  const atributos = Object.entries(ficha.atributos);
  if (atributos.length) {
    const lista = criar("dl", "ficha-atributos");
    for (const [chave, valor] of atributos) lista.append(criar("dt", "", chave), criar("dd", "", valor));
    raiz.append(lista);
  }
  for (const foto of ficha.fotos) {
    const img = document.createElement("img");
    img.className = "ficha-foto";
    img.src = foto.url;
    img.alt = foto.nome;
    raiz.append(img);
  }
  return raiz;
}

export function Mapa({ perimetros, partes, elementos, plantas, fichas, fichaAberta, sobreposicoes, pontosDeAviso, enquadrar, onMapa, rotulos, fundo, onFundo }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map>();
  const pronto = useRef(false);
  const aoCriar = useRef(onMapa);
  const marcadores = useRef<maplibregl.Marker[]>([]);
  const popup = useRef<maplibregl.Popup>();
  const dados = useRef({ perimetros, partes, elementos, plantas, fichas, sobreposicoes, pontosDeAviso, rotulos, fundo });
  dados.current = { perimetros, partes, elementos, plantas, fichas, sobreposicoes, pontosDeAviso, rotulos, fundo };
  const plantasNoMapa = useRef(new Set<string>());

  /** Cada planta com imagem é uma fonte de imagem própria, sempre abaixo dos lotes */
  const desenharPlantas = (m: maplibregl.Map) => {
    const { plantas } = dados.current;
    const comImagem = plantas.filter((p) => p.imagem);
    for (const id of plantasNoMapa.current)
      if (!comImagem.some((p) => p.id === id)) {
        m.removeLayer(`planta-${id}`);
        m.removeSource(`planta-${id}`);
        plantasNoMapa.current.delete(id);
      }
    for (const p of comImagem) {
      const id = `planta-${p.id}`;
      if (!plantasNoMapa.current.has(p.id)) {
        m.addSource(id, { type: "image", url: p.imagem!, coordinates: p.cantos.map((c) => [c[0], c[1]]) as [[number, number], [number, number], [number, number], [number, number]] });
        m.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": p.opacidade, "raster-fade-duration": 0 } }, "partes-fundo");
        plantasNoMapa.current.add(p.id);
      } else {
        m.setPaintProperty(id, "raster-opacity", p.opacidade);
      }
    }
    (m.getSource("plantas-moldura") as maplibregl.GeoJSONSource).setData(
      featureCollection(plantas.map((p) => feature({ type: "Polygon", coordinates: [[...p.cantos, p.cantos[0]]] }))),
    );
  };

  const aplicarFundo = () => {
    const m = mapa.current;
    if (!m || !pronto.current) return;
    const { fundo } = dados.current;
    for (const [id, visibilidade] of Object.entries(camadasDoFundo(fundo))) m.setLayoutProperty(id, "visibility", visibilidade);
    m.setPaintProperty("perimetros-casco", "line-color", CASCO_DO_FUNDO[fundo].cor);
    m.setPaintProperty("perimetros-casco", "line-opacity", CASCO_DO_FUNDO[fundo].opacidade);
    // A imagem de satélite é mais carregada: preenchimento um pouco mais forte
    m.setPaintProperty("partes-fundo", "fill-opacity", fundo === "satelite" ? 0.35 : 0.3);
  };

  const abrirFicha = (id: string, onde?: maplibregl.LngLatLike) => {
    const ficha = dados.current.fichas.get(id);
    if (!ficha || !mapa.current) return;
    popup.current?.remove();
    popup.current = new maplibregl.Popup({ maxWidth: "320px", focusAfterOpen: false })
      .setLngLat(onde ?? (ficha.local as [number, number]))
      .setDOMContent(elementoDaFicha(ficha))
      .addTo(mapa.current);
  };

  const desenhar = () => {
    const m = mapa.current;
    if (!m || !pronto.current) return;
    const { perimetros, partes, elementos, sobreposicoes, pontosDeAviso, rotulos } = dados.current;
    (m.getSource("perimetros") as maplibregl.GeoJSONSource).setData(
      featureCollection(perimetros.map((p) => feature(p.geometria, { id: p.id, cor: p.cor, traco: tracoDoLote(p, perimetros) }))),
    );
    (m.getSource("partes") as maplibregl.GeoJSONSource).setData(
      featureCollection(perimetros.flatMap((p) => (partes.get(p.id) ? [feature(partes.get(p.id)!, { id: p.id, cor: p.cor })] : []))),
    );
    (m.getSource("elementos") as maplibregl.GeoJSONSource).setData(
      featureCollection(elementos.map((e) => feature(e.geometria, { id: e.id, cor: e.cor }))),
    );
    (m.getSource("sobreposicoes") as maplibregl.GeoJSONSource).setData(
      featureCollection(sobreposicoes.map((s) => feature(s.geometria))),
    );

    desenharPlantas(m);

    marcadores.current.forEach((mk) => mk.remove());
    marcadores.current = [
      ...rotulos.map((r) => {
        const el = document.createElement("div");
        el.className = r.tipo === "sobreposicao" ? "rotulo-mapa rotulo-disputa" : "rotulo-mapa";
        el.textContent = r.texto;
        return new maplibregl.Marker({ element: el }).setLngLat(r.local as [number, number]).addTo(m);
      }),
      ...pontosDeAviso.map((p) => {
        const el = document.createElement("div");
        el.className = "ponto-aviso";
        el.title = "O contorno se cruza aqui";
        return new maplibregl.Marker({ element: el }).setLngLat(p as [number, number]).addTo(m);
      }),
    ];
  };

  // O mapa é criado uma única vez; ao carregar, aplica o estado mais recente
  const aoCarregar = useRef(() => {});
  aoCarregar.current = () => {
    aplicarFundo();
    desenhar();
  };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: estiloBase(CHAVE_ESRI, dados.current.fundo),
      center: [-52, -14],
      zoom: 3.5,
      // O PDF precisa ler o desenho do mapa depois que ele já foi exibido
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      // Norte sempre para cima: a seta do PDF depende disso
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    m.touchZoomRotate.disableRotation();
    // Onde a imagem não existe naquele zoom o servidor responde "não encontrado" e o mapa amplia
    // o nível anterior; isso é esperado e não deve poluir o console. Outros erros seguem visíveis.
    m.on("error", (e: maplibregl.ErrorEvent & { sourceId?: string }) => {
      if (e.sourceId?.startsWith("satelite")) return;
      console.error(e.error);
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    m.on("load", () => {
      m.addImage("hachura", hachura());
      m.addSource("plantas-moldura", { type: "geojson", data: VAZIO });
      // Moldura da planta: mostra onde ela fica mesmo quando a imagem não veio junto
      m.addLayer({ id: "plantas-moldura", type: "line", source: "plantas-moldura", paint: { "line-color": "#f8fafc", "line-width": 1.5, "line-dasharray": [4, 3], "line-opacity": 0.9 } });
      m.addSource("perimetros", { type: "geojson", data: VAZIO });
      m.addSource("partes", { type: "geojson", data: VAZIO });
      m.addSource("sobreposicoes", { type: "geojson", data: VAZIO });
      // Preenche só a parte exclusiva de cada lote: a faixa disputada fica só em vermelho
      m.addLayer({ id: "partes-fundo", type: "fill", source: "partes", paint: { "fill-color": ["get", "cor"], "fill-opacity": 0.3 } });
      // Área inteira do lote, invisível, só para abrir a ficha ao clicar
      m.addLayer({ id: "perimetros-fundo", type: "fill", source: "perimetros", paint: { "fill-color": "#000", "fill-opacity": 0 } });
      m.addLayer({ id: "sobreposicoes-fundo", type: "fill", source: "sobreposicoes", paint: { "fill-color": COR_DISPUTA, "fill-opacity": 0.4 } });
      m.addLayer({ id: "sobreposicoes-hachura", type: "fill", source: "sobreposicoes", paint: { "fill-pattern": "hachura" } });
      m.addLayer({ id: "sobreposicoes-casco", type: "line", source: "sobreposicoes", paint: { "line-color": "#fff", "line-width": 4.5, "line-opacity": 0.8 } });
      m.addLayer({ id: "sobreposicoes-contorno", type: "line", source: "sobreposicoes", paint: { "line-color": "#991b1b", "line-width": 2 } });
      // Casco escuro sob o contorno: contraste no mapa claro e no satélite
      m.addLayer({ id: "perimetros-casco", type: "line", source: "perimetros", paint: { "line-color": "#0f172a", "line-width": 6, "line-opacity": 0.7 } });
      TRACOS.forEach((traco, i) =>
        m.addLayer({
          id: `perimetros-contorno-${i}`,
          type: "line",
          source: "perimetros",
          filter: ["==", ["get", "traco"], i],
          paint: { "line-color": ["get", "cor"], "line-width": 3.5, ...(traco.length ? { "line-dasharray": traco } : {}) },
        }),
      );
      m.addSource("elementos", { type: "geojson", data: VAZIO });
      const linhas: maplibregl.FilterSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
      const pontos: maplibregl.FilterSpecification = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
      m.addLayer({ id: "elementos-linhas", type: "line", source: "elementos", filter: linhas, paint: { "line-color": ["get", "cor"], "line-width": 2.5 } });
      // Faixa invisível mais larga para facilitar o clique em linhas finas
      m.addLayer({ id: "elementos-linhas-toque", type: "line", source: "elementos", filter: linhas, paint: { "line-color": "#000", "line-width": 14, "line-opacity": 0 } });
      m.addLayer({
        id: "elementos-pontos",
        type: "circle",
        source: "elementos",
        filter: pontos,
        paint: { "circle-color": ["get", "cor"], "circle-radius": 6, "circle-stroke-color": "#0f172a", "circle-stroke-width": 2 },
      });

      m.on("click", (e) => {
        const [alvo] = m.queryRenderedFeatures(e.point, { layers: CAMADAS_CLICAVEIS });
        if (alvo) abrirFicha(String(alvo.properties.id), e.lngLat);
      });
      for (const camada of CAMADAS_CLICAVEIS) {
        m.on("mouseenter", camada, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", camada, () => (m.getCanvas().style.cursor = ""));
      }
      pronto.current = true;
      aoCarregar.current();
    });

    mapa.current = m;
    aoCriar.current?.(m);
    return () => m.remove();
  }, []);

  useEffect(aplicarFundo, [fundo]);

  useEffect(desenhar, [perimetros, partes, elementos, plantas, sobreposicoes, pontosDeAviso, rotulos]);

  useEffect(() => {
    if (fichaAberta) abrirFicha(fichaAberta.id);
  }, [fichaAberta]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !enquadrar?.geometrias.length) return;
    const [x0, y0, x1, y1] = bbox(featureCollection(enquadrar.geometrias.map((g) => feature(g))));
    m.fitBounds([x0, y0, x1, y1], { padding: 60, maxZoom: 17, duration: 800 });
  }, [enquadrar]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" data-testid="mapa" />
      <div className="absolute left-2 top-2 flex overflow-hidden rounded-md bg-white/95 text-sm font-medium shadow" role="group" aria-label="Fundo do mapa">
        {(
          [
            ["satelite", "Satélite"],
            ["ruas", "Mapa"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={fundo === valor}
            onClick={() => onFundo(valor)}
            className={fundo === valor ? "bg-slate-900 px-3 py-1.5 text-white" : "px-3 py-1.5 text-slate-700 hover:bg-slate-100"}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {perimetros.length > 0 && (
        // Legenda sempre visível: a identidade de cada lote nunca depende só da cor
        <ul className="absolute bottom-8 right-2 max-w-[45%] space-y-1 rounded-md bg-white/95 p-2 text-xs text-neutral-900 shadow">
          {perimetros.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <AmostraLote cor={p.cor} traco={tracoDoLote(p, perimetros)} casco={CASCO_DO_FUNDO[fundo].cor} />
              <span className="truncate">{p.nome}</span>
            </li>
          ))}
          {sobreposicoes.length > 0 && (
            <li className="flex items-center gap-2">
              <AmostraLote disputa />
              <span>Área em disputa</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
