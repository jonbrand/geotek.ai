"""Gera o caso fictício de demonstração (public/exemplos/demarcatoria-sorriso.kml).

Ação demarcatória na zona rural de Sorriso/MT: o autor diz que a divisa é o córrego;
a matrícula antiga do réu descreve a divisa como uma reta entre dois marcos. Sem
aleatoriedade, para que o arquivo (e seu SHA-256) seja sempre o mesmo.

Uso: python3 scripts/gerar-exemplo.py
"""

import struct
import zipfile
import zlib
from xml.sax.saxutils import escape
import math
from pathlib import Path

# Origem do sistema local, em metros (x = leste, y = norte)
LON0, LAT0 = -55.665, -12.585
M_POR_GRAU_LAT = 110_574
M_POR_GRAU_LON = 111_320 * math.cos(math.radians(LAT0))


def geo(x, y):
    return [round(LON0 + x / M_POR_GRAU_LON, 7), round(LAT0 + y / M_POR_GRAU_LAT, 7)]


def corrego(y):
    """Posição leste-oeste do córrego: meandros de amplitude variável."""
    return 2400 + 170 * math.sin(y / 340) + 55 * math.sin(y / 125 + 1.3)


def coords(pontos):
    return " ".join(f"{lon},{lat},0" for lon, lat in (geo(x, y) for x, y in pontos))


# 1. Autor: limite leste acompanha o córrego, levantado vértice a vértice
NORTE, SUL = 1500, -1200
margem = [(corrego(y), y) for y in range(NORTE, SUL - 1, -40)]
santa_luzia = [(0, SUL), (-35, -600), (20, 0), (-15, 700), (10, NORTE), *margem]

# 2. Réu: título antigo, lados retos; a divisa oeste é a reta entre os marcos M-1 e M-2
boa_esperanca = [(2020, 1700), (4250, 1720), (4200, -900), (2110, -900)]

# 3. Confrontante ao sul: divisa norte a confirmar, invade levemente a Santa Luzia
recanto = [(600, -1185), (1900, -1160), (1950, -2100), (620, -2120)]


# 4. Elementos que não são área: o córrego e os marcos
leito = [(corrego(y), y) for y in range(2200, -2001, -40)]
marcos = [
    ("M-1", 2020, 1700, "Marco de concreto citado na matrícula 12.345 (início da divisa em linha reta)"),
    ("M-2", 2110, -900, "Marco de concreto citado na matrícula 12.345 (fim da divisa em linha reta)"),
    ("SL-01", 0, SUL, "Vértice do levantamento do autor — canto sudoeste"),
    ("SL-02", 10, NORTE, "Vértice do levantamento do autor — canto noroeste"),
    ("SL-03", corrego(NORTE), NORTE, "Vértice do levantamento do autor — encontro com o córrego ao norte"),
    ("SL-04", corrego(SUL), SUL, "Vértice do levantamento do autor — encontro com o córrego ao sul"),
]


def kml_cor(hexa, alfa="ff"):
    """#rrggbb → aabbggrr (ordem do KML)"""
    r, g, b = hexa[1:3], hexa[3:5], hexa[5:7]
    return f"{alfa}{b}{g}{r}"


def estilo(ident, linha, largura=3, preenchimento=None, icone=None):
    partes = [f"<LineStyle><color>{kml_cor(linha)}</color><width>{largura}</width></LineStyle>"]
    if preenchimento:
        partes.append(f"<PolyStyle><color>{kml_cor(preenchimento, '4d')}</color></PolyStyle>")
    if icone:
        partes.append(f"<IconStyle><color>{kml_cor(icone)}</color></IconStyle>")
    return f'<Style id="{ident}">{"".join(partes)}</Style>'


# Campos com nome técnico e nome amigável (<displayName>), como exportam QGIS e ArcGIS
CAMPOS = {"Matrícula": "MATRICULA", "Proprietário": "PROPRIET", "CCIR": "CCIR", "Código SIGEF": "COD_SIGEF", "Divisa oeste": "DIV_OESTE"}


def dados(campos):
    linhas = "".join(
        f'<Data name="{CAMPOS.get(k, k)}"><displayName>{escape(k)}</displayName><value>{escape(v)}</value></Data>' for k, v in campos.items()
    )
    return f"<ExtendedData>{linhas}</ExtendedData>"


def marcador(nome, estilo_id, geometria, descricao="", campos=None, data=None):
    desc = f"<description><![CDATA[{descricao}]]></description>" if descricao else ""
    quando = f"<TimeStamp><when>{data}</when></TimeStamp>" if data else ""
    return f"<Placemark><name>{escape(nome)}</name>{desc}{quando}<styleUrl>#{estilo_id}</styleUrl>{dados(campos) if campos else ''}{geometria}</Placemark>"


def poligono(pontos):
    fechado = [*pontos, pontos[0]]
    return f"<Polygon><outerBoundaryIs><LinearRing><coordinates>{coords(fechado)}</coordinates></LinearRing></outerBoundaryIs></Polygon>"


def pasta(nome, conteudo):
    return f"<Folder><name>{escape(nome)}</name>{''.join(conteudo)}</Folder>"


perimetros = [
    marcador(
        "Fazenda Santa Luzia — levantamento do autor",
        "autor",
        poligono(santa_luzia),
        "<p>Levantamento georreferenciado realizado em <b>março de 2026</b>.</p><p>A divisa leste acompanha o leito do córrego Lajeado.</p>",
        {"Matrícula": "8.765 (fictícia)", "Proprietário": "Agropecuária Santa Luzia Ltda. (fictício)", "CCIR": "000.000.000.000-0", "Código SIGEF": "exemplo-0000-0000"},
        data="2026-03-12",
    ),
    marcador(
        "Fazenda Boa Esperança — matrícula nº 12.345 do réu",
        "reu",
        poligono(boa_esperanca),
        # Tabela de duas colunas, como as exportadas por QGIS/ArcGIS: vira atributos na plataforma
        "<p>Perímetro reconstituído a partir da descrição da matrícula (1987).</p>"
        "<table><tr><td>Livro</td><td>2-B</td></tr><tr><td>Folha</td><td>114</td></tr></table>",
        {"Matrícula": "12.345 (fictícia)", "Proprietário": "José da Silva (fictício)", "Divisa oeste": "Linha reta do marco M-1 ao marco M-2"},
    ),
    marcador(
        "Sítio Recanto — confrontante ao sul",
        "confrontante",
        poligono(recanto),
        "Divisa norte ainda não confirmada em campo.",
        {"Matrícula": "3.210 (fictícia)"},
    ),
]

hidrografia = [
    marcador(
        "Córrego Lajeado",
        "corrego",
        f"<LineString><coordinates>{coords(leito)}</coordinates></LineString>",
        "Divisa natural alegada pelo autor.",
    )
]

pontos = [
    marcador(nome, "marco", f"<Point><coordinates>{coords([(x, y)])}</coordinates></Point>", descricao)
    for nome, x, y, descricao in marcos
]

documento = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>Ação demarcatória — exemplo fictício</name>
{estilo("autor", "#1d4ed8", preenchimento="#1d4ed8")}
{estilo("reu", "#0d9488", preenchimento="#0d9488")}
{estilo("confrontante", "#ca8a04", preenchimento="#ca8a04")}
{estilo("corrego", "#38bdf8", largura=4)}
{estilo("marco", "#0f172a", icone="#ffffff")}
{pasta("Perímetros", perimetros)}
{pasta("Hidrografia", hidrografia)}
{pasta("Marcos", pontos)}
</Document>
</kml>
"""

pasta_exemplos = Path(__file__).resolve().parent.parent / "public" / "exemplos"
destino = pasta_exemplos / "demarcatoria-sorriso.kml"
destino.write_text(documento, encoding="utf-8")
print(f"Gerado {destino}")


# 5. Planta digitalizada fictícia (KMZ com imagem), para demonstrar plantas sobrepostas
def png(largura, altura, pixel):
    """PNG RGBA mínimo, sem bibliotecas externas"""
    linhas = b"".join(b"\x00" + b"".join(bytes(pixel(x, y)) for x in range(largura)) for y in range(altura))

    def bloco(tipo, dados):
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    cabecalho = struct.pack(">IIBBBBB", largura, altura, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", cabecalho) + bloco(b"IDAT", zlib.compress(linhas, 9)) + bloco(b"IEND", b"")


def pixel_da_planta(x, y):
    # Papel envelhecido com quadriculado e a divisa reta da matrícula desenhada a nanquim
    if abs(x - 70) <= 1 or (x + y) % 97 == 0:
        return (40, 30, 20, 255)
    if x % 32 == 0 or y % 32 == 0:
        return (150, 120, 80, 255)
    return (236, 222, 190, 255)


oeste, norte = geo(1700, 2000)
leste, sul = geo(2700, -1100)
planta_kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>Planta da matrícula 12.345 (1987) — exemplo fictício</name>
<GroundOverlay>
<name>Planta da matrícula 12.345 (1987)</name>
<description>Planta original digitalizada e georreferenciada pelos marcos M-1 e M-2.</description>
<Icon><href>files/planta-1987.png</href></Icon>
<LatLonBox><north>{norte}</north><south>{sul}</south><east>{leste}</east><west>{oeste}</west></LatLonBox>
</GroundOverlay>
</Document>
</kml>
"""
destino_kmz = pasta_exemplos / "planta-exemplo.kmz"
with zipfile.ZipFile(destino_kmz, "w", zipfile.ZIP_DEFLATED) as kmz:
    # Data fixa nas entradas: o arquivo (e o SHA-256) sai sempre igual
    for nome, conteudo in [("doc.kml", planta_kml.encode("utf-8")), ("files/planta-1987.png", png(160, 320, pixel_da_planta))]:
        kmz.writestr(zipfile.ZipInfo(nome, date_time=(2026, 1, 1, 0, 0, 0)), conteudo)
print(f"Gerado {destino_kmz}")
