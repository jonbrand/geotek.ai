import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXTENSOES_ACEITAS } from "@/lib/geo/ler-arquivo";

interface Props {
  onArquivos: (arquivos: File[]) => void;
  onExemplo?: () => void;
  compacta?: boolean;
}

export function AreaDeEnvio({ onArquivos, onExemplo, compacta }: Props) {
  const entrada = useRef<HTMLInputElement>(null);

  return (
    <div className={`rounded-lg border-2 border-dashed border-muted-foreground/30 text-center ${compacta ? "p-3" : "p-6"}`}>
      {!compacta && <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />}
      <p className="font-medium">Envie os arquivos do levantamento</p>
      {!compacta && (
        <p className="mt-1 text-sm text-muted-foreground">
          Arraste para cá os arquivos do Google Earth (.kml, .kmz) ou .geojson. Pode enviar vários de uma vez — um para cada
          perímetro.
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => entrada.current?.click()}>
          Escolher arquivos
        </Button>
        {onExemplo && (
          <Button size="sm" variant="ghost" onClick={onExemplo}>
            Ver um caso de exemplo
          </Button>
        )}
      </div>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={EXTENSOES_ACEITAS.join(",")}
        className="hidden"
        data-testid="entrada-arquivos"
        onChange={(e) => {
          onArquivos(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
