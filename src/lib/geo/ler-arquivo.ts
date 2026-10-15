import { kmlWithFolders, type Folder, type Root } from "@tmcw/togeojson";
import JSZip from "jszip";
import type { Feature, GeoJSON, Geometry, LineString, Polygon, Position } from "geojson";
import {
  COR_LINHA_PADRAO,
  COR_PONTO_PADRAO,
  novoId,
  proximaCorDeLote,
  type Atributos,
  type Elemento,
  type Foto,
  type Geometria,
  type GeometriaElemento,
  type Observacao,
  type Perimetro,
  type Planta,
} from "@/lib/caso";
import { sha256 } from "@/lib/hash";
import { distanciaGeodesica } from "@/lib/geo/area";

/** Erro mostrado ao usuário como está: uma frase em português simples. */
export class ErroLeitura extends Error {}

export interface ConteudoArquivo {
  perimetros: Perimetro[];
  elementos: Elemento[];
  plantas: Planta[];
  observacoes: Observacao[];
  /** Nome e descrição do documento KML, quando houver */
  documento?: { nome?: string; descricao?: string };
  /** Descrição de cada pasta, pelo caminho */
  pastas: Record<string, string>;
  /** O que não pôde ser aproveitado ou foi interpretado — em português simples */
  avisos: string[];
}

/** O que foi lido de cada arquivo, para o usuário conferir que nada sumiu */
export interface RegistroDeLeitura {
  arquivo: string;
  resumo: string;
  avisos: string[];
}

/** Feição lida do arquivo, com a pasta onde estava */
interface FeicaoComPasta {
  feicao: Feature<Geometry | null>;
  pasta?: string;
}

/** O que vem do arquivo antes de virar perímetros, elementos e plantas */
interface Leitura {
  feicoes: FeicaoComPasta[];
  pastas: Record<string, string>;
  documento?: { nome?: string; descricao?: string };
  /** Nome amigável dos campos (`<displayName>`), pelo nome técnico */
  nomesDeCampos: Record<string, string>;
  /** Cantos das plantas definidas por `gx:LatLonQuad`, na ordem do documento */
  plantasPorQuadrilatero: boolean[];
  /** Imagens dentro do KMZ, pelo caminho em minúsculas */
  imagens: Map<string, Uint8Array>;
  avisos: string[];
}

const extensao = (nome: string) => nome.toLowerCase().split(".").pop() ?? "";
const nomeDoCaminho = (caminho: string) => caminho.split("/").pop() ?? caminho;

export const EXTENSOES_ACEITAS = [".geojson", ".json", ".kml", ".kmz"];
const EXTENSOES_DE_IMAGEM = ["jpg", "jpeg", "png", "gif", "webp"];

/** Respeita o `encoding` da declaração XML: softwares antigos gravam em ISO-8859-1 */
function decodificar(bytes: Uint8Array): string {
  const cabecalho = new TextDecoder("ascii").decode(bytes.slice(0, 200));
  const declarada = cabecalho.match(/^\s*<\?xml[^>]*encoding=["']([\w.:-]+)["']/i)?.[1];
  try {
    return new TextDecoder(declarada ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

const tipoDaImagem = (nome: string) => {
  const ext = extensao(nome);
  return ext === "jpg" ? "image/jpeg" : `image/${ext}`;
};

/** URL para exibir uma imagem do KMZ (`blob:` no navegador; `data:` onde não houver) */
function urlDaImagem(bytes: Uint8Array, nome: string): string {
  const tipo = tipoDaImagem(nome);
  if (typeof URL.createObjectURL === "function") return URL.createObjectURL(new Blob([bytes], { type: tipo }));
  let binario = "";
  bytes.forEach((b) => (binario += String.fromCharCode(b)));
  return `data:${tipo};base64,${btoa(binario)}`;
}

function procurarImagem(imagens: Map<string, Uint8Array>, referencia: string) {
  const limpo = decodeURIComponent(referencia).replace(/^\.?\//, "").toLowerCase();
  if (imagens.has(limpo)) return imagens.get(limpo);
  // Alguns programas referenciam só o nome, com a imagem numa subpasta do pacote
  for (const [caminho, bytes] of imagens) if (nomeDoCaminho(caminho) === nomeDoCaminho(limpo)) return bytes;
  return undefined;
}

// ---------- Leitura do arquivo ----------

const filhoDireto = (el: Element, nome: string) => Array.from(el.children).find((c) => c.localName === nome);

function percorrerPastas(no: Root | Folder, caminho: string[], saida: Leitura) {
  for (const filho of no.children) {
    if (filho.type === "folder") {
      const nome = typeof filho.meta.name === "string" && filho.meta.name.trim() ? filho.meta.name.trim() : "Pasta sem nome";
      const novoCaminho = [...caminho, nome];
      const descricao = lerDescricao(filho.meta.description, () => undefined).texto;
      if (descricao) saida.pastas[novoCaminho.join(" / ")] = descricao;
      percorrerPastas(filho, novoCaminho, saida);
    } else {
      saida.feicoes.push({ feicao: filho, pasta: caminho.length ? caminho.join(" / ") : undefined });
    }
  }
}

async function lerKml(nome: string, conteudo: ArrayBuffer): Promise<Leitura> {
  const leitura: Leitura = { feicoes: [], pastas: {}, nomesDeCampos: {}, plantasPorQuadrilatero: [], imagens: new Map(), avisos: [] };
  let bytes = new Uint8Array(conteudo);

  if (extensao(nome) === "kmz") {
    const zip = await JSZip.loadAsync(conteudo).catch(() => {
      throw new ErroLeitura(`Não conseguimos abrir "${nome}". O arquivo compactado parece estar corrompido.`);
    });
    const arquivos = Object.values(zip.files).filter((f) => !f.dir);
    const kmls = arquivos.filter((f) => extensao(f.name) === "kml");
    // Pela especificação, o documento principal é o doc.kml na raiz
    const principal = kmls.find((f) => f.name.toLowerCase() === "doc.kml") ?? kmls[0];
    if (!principal) throw new ErroLeitura(`"${nome}" não contém um arquivo do Google Earth dentro dele.`);
    const outros = kmls.filter((f) => f !== principal).map((f) => f.name);
    if (outros.length)
      leitura.avisos.push(`O pacote tem outros arquivos do Google Earth que não foram abertos: ${outros.join(", ")}. Envie-os separadamente se fizerem parte do caso.`);
    bytes = await principal.async("uint8array");
    for (const f of arquivos)
      if (EXTENSOES_DE_IMAGEM.includes(extensao(f.name))) leitura.imagens.set(f.name.toLowerCase(), await f.async("uint8array"));
  }

  const doc = new DOMParser().parseFromString(decodificar(bytes), "text/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new ErroLeitura(`Não conseguimos ler "${nome}". O arquivo parece estar corrompido ou incompleto.`);

  // Nome amigável dos campos: <SimpleField name="MAT"><displayName>Matrícula</displayName>
  for (const tag of ["SimpleField", "Data"])
    for (const campo of Array.from(doc.getElementsByTagName(tag))) {
      const tecnico = campo.getAttribute("name");
      const amigavel = filhoDireto(campo, "displayName")?.textContent?.trim();
      if (tecnico && amigavel && amigavel !== tecnico) leitura.nomesDeCampos[tecnico] = amigavel;
    }

  leitura.plantasPorQuadrilatero = Array.from(doc.getElementsByTagName("GroundOverlay")).map(
    (g) => g.getElementsByTagName("gx:LatLonQuad").length > 0 || Array.from(g.children).some((c) => c.localName === "LatLonQuad"),
  );

  const documento = doc.getElementsByTagName("Document")[0];
  if (documento) {
    const nomeDoc = filhoDireto(documento, "name")?.textContent?.trim();
    const descricaoDoc = lerDescricao(filhoDireto(documento, "description")?.textContent, () => undefined).texto;
    if (nomeDoc || descricaoDoc) leitura.documento = { nome: nomeDoc || undefined, descricao: descricaoDoc };
  }

  percorrerPastas(kmlWithFolders(doc), [], leitura);
  return leitura;
}

async function lerFeicoes(nome: string, conteudo: ArrayBuffer): Promise<Leitura> {
  const ext = extensao(nome);

  if (ext === "geojson" || ext === "json") {
    let json: GeoJSON | undefined;
    try {
      json = JSON.parse(decodificar(new Uint8Array(conteudo)));
    } catch {
      throw new ErroLeitura(`Não conseguimos ler "${nome}". O arquivo parece estar corrompido ou incompleto.`);
    }
    const vazia: Omit<Leitura, "feicoes"> = { pastas: {}, nomesDeCampos: {}, plantasPorQuadrilatero: [], imagens: new Map(), avisos: [] };
    if (json?.type === "FeatureCollection") return { ...vazia, feicoes: json.features.map((feicao) => ({ feicao })) };
    if (json?.type === "Feature") return { ...vazia, feicoes: [{ feicao: json }] };
    if (json && "type" in json) return { ...vazia, feicoes: [{ feicao: { type: "Feature", properties: {}, geometry: json as Geometry } }] };
    throw new ErroLeitura(`"${nome}" não contém nada que possamos mostrar no mapa.`);
  }

  if (ext === "kml" || ext === "kmz") return lerKml(nome, conteudo);

  if (["shp", "dbf", "shx", "prj", "dxf"].includes(ext))
    throw new ErroLeitura(
      `Ainda não lemos arquivos .${ext} diretamente. Por enquanto, exporte o levantamento para o formato do Google Earth (.kml) ou .geojson e envie de novo.`,
    );

  throw new ErroLeitura(`Não reconhecemos o formato de "${nome}". Envie um arquivo .kml, .kmz ou .geojson.`);
}

// ---------- Geometrias ----------

type Peca = { tipo: "perimetro"; geometria: Geometria; avisos?: string[] } | { tipo: "ponto" | "linha"; geometria: GeometriaElemento };

// Até meio metro de folga: o GPS e o desenho à mão raramente fecham no mesmo milímetro
const FOLGA_FECHAMENTO_M = 0.5;

const AVISO_CAMINHO_FECHADO = "Este contorno veio como caminho fechado e foi tratado como área.";

/** Caminho que volta ao ponto de partida: no Google Earth e no GPS é assim que muitos perímetros são desenhados */
function caminhoFechado(linha: LineString): Polygon | null {
  const c = linha.coordinates;
  if (c.length < 4) return null;
  if (distanciaGeodesica(c[0], c[c.length - 1]) > FOLGA_FECHAMENTO_M) return null;
  const anel = c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1] ? c : [...c, c[0]];
  return { type: "Polygon", coordinates: [anel] };
}

function separarGeometria(g: Geometry | null): Peca[] {
  if (!g) return [];
  switch (g.type) {
    case "Polygon":
    case "MultiPolygon":
      return [{ tipo: "perimetro", geometria: g }];
    case "LineString": {
      const area = caminhoFechado(g);
      return area ? [{ tipo: "perimetro", geometria: area, avisos: [AVISO_CAMINHO_FECHADO] }] : [{ tipo: "linha", geometria: g }];
    }
    case "MultiLineString":
      return [{ tipo: "linha", geometria: g }];
    case "Point":
    case "MultiPoint":
      return [{ tipo: "ponto", geometria: g }];
    case "GeometryCollection":
      return g.geometries.flatMap(separarGeometria);
  }
}

/** Partes de área do mesmo marcador formam um só imóvel, com área total */
function juntarAreas(pecas: Peca[]): Peca[] {
  const areas = pecas.filter((p): p is Extract<Peca, { tipo: "perimetro" }> => p.tipo === "perimetro");
  if (areas.length < 2) return pecas;
  const poligonos = areas.flatMap((p) => (p.geometria.type === "Polygon" ? [p.geometria.coordinates] : p.geometria.coordinates));
  const avisos = [...new Set(areas.flatMap((p) => p.avisos ?? []))];
  return [
    { tipo: "perimetro", geometria: { type: "MultiPolygon", coordinates: poligonos }, avisos: [...avisos, `Imóvel formado por ${poligonos.length} partes separadas; a área é a soma delas.`] },
    ...pecas.filter((p) => p.tipo !== "perimetro"),
  ];
}

function* posicoes(coords: unknown): Generator<Position> {
  if (Array.isArray(coords) && typeof coords[0] === "number") yield coords as Position;
  else if (Array.isArray(coords)) for (const c of coords) yield* posicoes(c);
}

const pareceGeografico = (pontos: Position[]) => pontos.every(([lon, lat]) => Math.abs(lon) <= 180 && Math.abs(lat) <= 90);

// Envelope do território brasileiro, com folga para ilhas oceânicas
const noBrasil = ([lon, lat]: Position) => lon >= -74.5 && lon <= -28.8 && lat >= -34 && lat <= 5.3;

// ---------- Propriedades ----------

const CHAVES_DE_NOME = ["name", "nome", "Name", "NOME", "title"];

// Chaves de controle de estilo/exibição que o leitor de KML adiciona; não são dados do imóvel.
// Datas (timestamp/timespan) e horários de trajeto são tratados à parte.
const CHAVE_DE_CONTROLE =
  /^(name|description|styleUrl|styleHash|styleMapHash|stroke.*|fill.*|icon.*|label.*|marker-.*|visibility|open|timespan|timestamp|coordinateProperties|@.*)$/;

const texto = (valor: unknown) =>
  valor === null || valor === undefined ? "" : typeof valor === "object" ? JSON.stringify(valor) : String(valor).trim();

/** "2026-03-01" → "01/03/2026"; data e hora completas no horário local */
export function formatarData(valor: string): string {
  const soData = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`;
  if (/^\d{4}(-\d{2})?$/.test(valor)) return valor.split("-").reverse().join("/");
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR");
}

function lerDatas(p: Record<string, unknown>): Atributos {
  const datas: Atributos = {};
  if (typeof p.timestamp === "string") datas.Data = formatarData(p.timestamp);
  const periodo = p.timespan as { begin?: string; end?: string } | undefined;
  if (periodo?.begin || periodo?.end)
    datas.Período = [periodo.begin && formatarData(periodo.begin), periodo.end && formatarData(periodo.end)].filter(Boolean).join(" a ");
  const horarios = [(p.coordinateProperties as { times?: unknown } | undefined)?.times].flat(2).filter((t): t is string => typeof t === "string");
  if (horarios.length) {
    datas.Início = formatarData(horarios[0]);
    datas.Fim = formatarData(horarios[horarios.length - 1]);
  }
  return datas;
}

/**
 * Converte a descrição (muitas vezes HTML) em texto puro. Tabelas de duas colunas —
 * comuns em KML exportado de QGIS/ArcGIS — viram atributos; links mantêm o endereço;
 * fotos do KMZ são separadas para exibição.
 */
function lerDescricao(bruta: unknown, procurarFoto: (src: string) => Uint8Array | undefined): { texto?: string; atributos: Atributos; fotos: Foto[] } {
  const atributos: Atributos = {};
  const fotos: Foto[] = [];
  const html = typeof bruta === "object" && bruta !== null && "value" in bruta ? String(bruta.value) : texto(bruta);
  if (!html) return { atributos, fotos };

  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style").forEach((n) => n.remove());
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    const bytes = src && !/^(https?:|data:)/i.test(src) ? procurarFoto(src) : undefined;
    if (bytes) {
      fotos.push({ nome: nomeDoCaminho(src), url: urlDaImagem(bytes, src) });
      img.remove();
    } else {
      // Fotos de fora do pacote não são baixadas: apenas registradas
      img.replaceWith(src ? ` [foto: ${nomeDoCaminho(src)} — não incluída no arquivo] ` : "");
    }
  });
  doc.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    const rotulo = a.textContent?.trim() ?? "";
    a.replaceWith(/^https?:\/\//i.test(href) && href !== rotulo ? `${rotulo} (${href})` : rotulo);
  });
  doc.querySelectorAll("tr").forEach((linha) => {
    const celulas = linha.querySelectorAll("td, th");
    if (celulas.length !== 2) return;
    const chave = celulas[0].textContent?.trim();
    const valor = celulas[1].textContent?.trim();
    if (chave && valor) {
      atributos[chave] = valor;
      linha.remove();
    }
  });
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll("p, div, li, tr, h1, h2, h3, h4").forEach((n) => n.append("\n"));

  const limpo = (doc.body.textContent ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { texto: limpo || undefined, atributos, fotos };
}

function lerPropriedades(props: Record<string, unknown> | null, leitura: Leitura) {
  const p = props ?? {};
  const chaveDoNome = CHAVES_DE_NOME.find((c) => texto(p[c]));
  const descricao = lerDescricao(p.description, (src) => procurarImagem(leitura.imagens, src));
  const atributos: Atributos = { ...lerDatas(p), ...descricao.atributos };
  for (const [chave, valor] of Object.entries(p)) {
    if (chave === chaveDoNome || CHAVE_DE_CONTROLE.test(chave)) continue;
    const v = texto(valor);
    if (v) atributos[leitura.nomesDeCampos[chave] ?? chave] = v;
  }
  const cor = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined);
  return {
    nome: chaveDoNome ? texto(p[chaveDoNome]) : undefined,
    descricao: descricao.texto,
    atributos,
    fotos: descricao.fotos,
    oculto: p.visibility === false,
    corContorno: cor(p.stroke) ?? cor(p.fill),
    corIcone: cor(p["icon-color"]) ?? cor(p["marker-color"]),
  };
}

// ---------- Plantas (GroundOverlay) ----------

function lerPlanta(feicao: Feature<Geometry | null>, quadrilatero: boolean, leitura: Leitura, arquivo: string): Planta | null {
  const anel = feicao.geometry?.type === "Polygon" ? feicao.geometry.coordinates[0] : undefined;
  if (!anel || anel.length < 4) return null;
  // LatLonBox chega como NO, NE, SE, SO; gx:LatLonQuad segue a especificação: SO, SE, NE, NO
  const [a, b, c, d] = anel;
  const cantos: Planta["cantos"] = quadrilatero ? [d, c, b, a] : [a, b, c, d];
  const nome = texto(feicao.properties?.name) || "Planta sem nome";
  const href = texto(feicao.properties?.icon);
  const bytes = href && !/^https?:/i.test(href) ? procurarImagem(leitura.imagens, href) : undefined;
  if (!bytes)
    leitura.avisos.push(
      href
        ? `A imagem da planta "${nome}" (${nomeDoCaminho(href)}) não veio junto. Envie o arquivo .kmz, que leva as imagens dentro dele.`
        : `A planta "${nome}" não indica nenhuma imagem; mostramos só a moldura dela.`,
    );
  return {
    id: novoId(),
    nome,
    cantos: cantos.map((p) => [p[0], p[1]]) as Planta["cantos"],
    imagem: bytes ? urlDaImagem(bytes, href) : undefined,
    opacidade: 0.7,
    arquivo,
  };
}

// ---------- Leitura completa ----------

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Frase curta com o que foi lido, para o usuário conferir que nada sumiu */
export function resumoDaLeitura(c: ConteudoArquivo): string {
  const linhas = c.elementos.filter((e) => e.tipo === "linha").length;
  const pontos = c.elementos.length - linhas;
  const partes = [
    c.perimetros.length && plural(c.perimetros.length, "perímetro", "perímetros"),
    linhas && plural(linhas, "linha", "linhas"),
    pontos && plural(pontos, "ponto", "pontos"),
    c.plantas.length && plural(c.plantas.length, "planta", "plantas"),
    c.observacoes.length && plural(c.observacoes.length, "anotação", "anotações"),
  ].filter(Boolean);
  return partes.length ? `Lidos: ${partes.join(", ")}.` : "Nada para mostrar no mapa.";
}

/**
 * Lê tudo o que o arquivo traz: áreas (perímetros), pontos, linhas, plantas sobrepostas e
 * anotações, com nome, descrição, atributos, datas, fotos, pasta e cor. `coresEmUso` são as
 * cores dos lotes já no caso, para os novos receberem as próximas da paleta.
 */
export async function lerArquivo(nome: string, conteudo: ArrayBuffer, coresEmUso: string[] = []): Promise<ConteudoArquivo> {
  const leitura = await lerFeicoes(nome, conteudo);
  const hash = await sha256(conteudo);
  const base = nome.replace(/\.[^.]+$/, "");
  const { avisos } = leitura;

  const plantas: Planta[] = [];
  const observacoes: Observacao[] = [];
  const pecas: { peca: Peca; pasta?: string; props: ReturnType<typeof lerPropriedades> }[] = [];
  let indicePlanta = 0;

  for (const { feicao, pasta } of leitura.feicoes) {
    const tipoEspecial = feicao.properties?.["@geometry-type"];
    if (tipoEspecial === "groundoverlay") {
      const planta = lerPlanta(feicao, leitura.plantasPorQuadrilatero[indicePlanta++] ?? false, leitura, nome);
      if (planta) plantas.push(planta);
      continue;
    }
    if (tipoEspecial === "networklink") {
      const alvo = texto(feicao.properties?.href);
      const destino = alvo ? (() => { try { return new URL(alvo).hostname; } catch { return alvo; } })() : "";
      avisos.push(`O arquivo aponta para dados externos ("${texto(feicao.properties?.name) || "sem nome"}"${destino ? `, ${destino}` : ""}) que não foram carregados. Baixe esses dados e envie como arquivo.`);
      continue;
    }

    const props = lerPropriedades(feicao.properties, leitura);
    if (!feicao.geometry) {
      if (props.nome || props.descricao || Object.keys(props.atributos).length)
        observacoes.push({ id: novoId(), nome: props.nome ?? "Anotação", descricao: props.descricao, atributos: props.atributos, pasta, arquivo: nome });
      continue;
    }
    for (const peca of juntarAreas(separarGeometria(feicao.geometry))) pecas.push({ peca, pasta, props });
  }

  if (!pecas.length && !plantas.length && !observacoes.length) throw new ErroLeitura(`"${nome}" não contém nada que possamos mostrar no mapa.`);

  const todas = pecas.flatMap(({ peca }) => [...posicoes(peca.geometria.coordinates)]);
  if (!pareceGeografico(todas))
    throw new ErroLeitura(
      `As coordenadas de "${nome}" não estão em latitude e longitude. Exporte o arquivo no padrão do Google Earth e envie de novo.`,
    );
  if (todas.length && !todas.some(noBrasil)) {
    // Ambiguidade de coordenadas é sempre decidida por uma pessoa, nunca corrigida em silêncio
    if (todas.every(([lon, lat]) => noBrasil([lat, lon])))
      throw new ErroLeitura(
        `Em "${nome}", latitude e longitude parecem trocadas: o imóvel cairia fora do Brasil. Corrija a ordem das coordenadas no arquivo e envie de novo.`,
      );
    avisos.push(`Os dados de "${nome}" estão fora do território brasileiro. Confira se é o arquivo certo.`);
  }

  const totalPerimetros = pecas.filter(({ peca }) => peca.tipo === "perimetro").length;
  const perimetros: Perimetro[] = [];
  const elementos: Elemento[] = [];
  const contagem = { ponto: 0, linha: 0 };
  const cores = [...coresEmUso];

  for (const { peca, pasta, props } of pecas) {
    const comum = {
      id: novoId(),
      atributos: props.atributos,
      descricao: props.descricao,
      pasta,
      arquivo: nome,
      sha256: hash,
      ...(props.fotos.length ? { fotos: props.fotos } : {}),
      ...(props.oculto ? { oculto: true } : {}),
    };
    if (peca.tipo === "perimetro") {
      const i = perimetros.length;
      // Lotes sempre na paleta validada: a cor do arquivo poderia sumir no mapa ou imitar a disputa
      const cor = proximaCorDeLote(cores);
      cores.push(cor);
      perimetros.push({
        ...comum,
        nome: props.nome ?? (totalPerimetros > 1 ? `${base} (${i + 1})` : base),
        cor,
        geometria: peca.geometria,
        ...(peca.avisos?.length ? { avisos: peca.avisos } : {}),
      });
    } else {
      const n = ++contagem[peca.tipo];
      elementos.push({
        ...comum,
        tipo: peca.tipo,
        nome: props.nome ?? `${peca.tipo === "ponto" ? "Ponto" : "Linha"} ${n}`,
        cor: peca.tipo === "ponto" ? props.corIcone ?? COR_PONTO_PADRAO : props.corContorno ?? COR_LINHA_PADRAO,
        geometria: peca.geometria,
      });
    }
  }

  const ocultos = [...perimetros, ...elementos].filter((i) => i.oculto).length;
  if (ocultos)
    avisos.push(
      ocultos === 1
        ? "1 item estava oculto no arquivo original; aqui ele aparece no mapa, marcado como oculto."
        : `${ocultos} itens estavam ocultos no arquivo original; aqui eles aparecem no mapa, marcados como ocultos.`,
    );

  return { perimetros, elementos, plantas, observacoes, documento: leitura.documento, pastas: leitura.pastas, avisos };
}
