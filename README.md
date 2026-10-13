# Geotek.ai

Plataforma WebGIS jurídico-rural. Visão de produto, requisitos e arquitetura estão em [documento-base-webgis-juridico-rural.md](documento-base-webgis-juridico-rural.md).

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui (componentes adicionados sob demanda com `npx shadcn@latest add <componente>`)
- Vitest + Testing Library
- ESLint

## Ambiente de desenvolvimento

O projeto roda em um Dev Container (`.devcontainer/`) com Node 22, Git e GitHub CLI. Ao abrir no VS Code, escolha **Reopen in Container**: as dependências são instaladas automaticamente.

## Scripts

```sh
npm run dev      # servidor de desenvolvimento em http://localhost:8080
npm run build    # build de produção em dist/
npm run preview  # serve o build localmente
npm test         # testes (Vitest)
npm run lint     # ESLint
```
