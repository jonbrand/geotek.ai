import { useId } from "react";
import { COR_DISPUTA, TRACOS } from "@/lib/caso";

const LARGURA = 28;
const ALTURA = 14;

/**
 * Amostra do código visual de um lote — casco escuro, cor e padrão de traço — ou da faixa
 * em disputa. A mesma no mapa, no painel e no PDF.
 */
export function AmostraLote({
  cor,
  traco = 0,
  disputa = false,
  casco = "#0f172a",
}: {
  cor?: string;
  traco?: number;
  disputa?: boolean;
  /** Cor do casco sob o contorno — acompanha o fundo do mapa */
  casco?: string;
}) {
  // id próprio por amostra: a tela some na impressão e levaria junto um padrão compartilhado
  const hachura = useId();
  if (disputa)
    return (
      <svg
        width={LARGURA}
        height={ALTURA}
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="shrink-0"
        aria-hidden
      >
        <defs>
          <pattern
            id={hachura}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              stroke={COR_DISPUTA}
              strokeWidth="2.2"
            />
          </pattern>
        </defs>
        <rect
          x="1"
          y="1"
          width={LARGURA - 2}
          height={ALTURA - 2}
          fill={COR_DISPUTA}
          fillOpacity="0.4"
        />
        <rect
          x="1"
          y="1"
          width={LARGURA - 2}
          height={ALTURA - 2}
          fill={`url(#${hachura})`}
          stroke="#991b1b"
          strokeWidth="1.5"
        />
      </svg>
    );

  const largura = 3.5;
  const tracos = TRACOS[traco] ?? [];
  return (
    <svg
      width={LARGURA}
      height={ALTURA}
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="shrink-0"
      aria-hidden
    >
      <rect
        x="1"
        y="1"
        width={LARGURA - 2}
        height={ALTURA - 2}
        fill={cor}
        fillOpacity="0.3"
      />
      <line
        x1="1"
        y1={ALTURA / 2}
        x2={LARGURA - 1}
        y2={ALTURA / 2}
        stroke={casco}
        strokeOpacity="0.8"
        strokeWidth="6"
      />
      <line
        x1="1"
        y1={ALTURA / 2}
        x2={LARGURA - 1}
        y2={ALTURA / 2}
        stroke={cor}
        strokeWidth={largura}
        strokeDasharray={
          tracos.length ? tracos.map((t) => t * largura).join(" ") : undefined
        }
      />
    </svg>
  );
}
