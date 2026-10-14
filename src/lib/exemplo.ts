import type { Caso } from "@/lib/caso";

/** Caso fictício aberto na primeira visita. Gerado por scripts/gerar-exemplo.py. */
export const ARQUIVO_EXEMPLO = { url: "/exemplos/demarcatoria-sorriso.kml", nome: "demarcatoria-sorriso.kml" };

export const METADADOS_EXEMPLO: Pick<Caso, "nome" | "comarca" | "responsavel"> = {
  nome: "Ação demarcatória — Fazenda Santa Luzia × Fazenda Boa Esperança (exemplo fictício)",
  comarca: "Sorriso/MT",
  responsavel: "Eng. agrimensor fictício — CREA-MT 000000-0 · ART 0000000000 (exemplo)",
};
