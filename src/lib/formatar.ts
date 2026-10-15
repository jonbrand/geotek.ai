const hectares = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const metros = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 512.34 → "512,3400 ha" */
export const formatarHa = (ha: number) => `${hectares.format(ha)} ha`;

/** 1234.5 → "1.234,50 m" */
export const formatarMetros = (m: number) => `${metros.format(m)} m`;

/** -15.7939 → 15°47'38,04" S */
export const formatarGrau = (valor: number, eixo: "lat" | "lon") => {
  const hemisferio = eixo === "lat" ? (valor < 0 ? "S" : "N") : valor < 0 ? "O" : "L";
  const abs = Math.abs(valor);
  const graus = Math.floor(abs);
  const minutosTotais = (abs - graus) * 60;
  const minutos = Math.floor(minutosTotais);
  const segundos = (minutosTotais - minutos) * 60;
  const seg = segundos.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${graus}°${String(minutos).padStart(2, "0")}'${seg.padStart(5, "0")}" ${hemisferio}`;
};
