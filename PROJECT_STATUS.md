# Projektstatus

**Stand:** 2026-11-22 · **Phase:** E1 und E2 fertig, auf `main` · nächstes Epic: E3 (wird nachgeschärft)

| Bereich | Stand |
|---|---|
| Planung | Analyse, PRD, Architektur, DESIGN.md 1.0.1, Specs |
| E1 Fundament | 9/9 fertig, geprüft, auf `main` |
| E2 Kern-Ablauf | 11/11 fertig, geprüft, auf `main` |
| E3–E10 | `needs-refinement`, werden vor dem Start am Code nachgeschärft |
| Tests | 215 Vitest + 5 Playwright grün · Check 0 Fehler (Server, Web, Web-Tests) · Design-Drift 0 · CI grün |
| Bundle | erster Chunk 107 KB gzip (Budget 250), Seiten als eigene Chunks |

**Arbeitsordner:** `/home/dsh/Projekte/ebb` (Klon von `diononline-un/ebb`, Branch `main`). Neue Arbeit auf eigenen Branches `ds/<epic>` von dort.

**Entwicklung:** `docker compose up -d postgres` (Container `ebb-postgres-1`), `npm run db:migrate`, `npm run dev`; E2E mit laufendem dev: `npm run e2e`.

**Ports (Port-Ring):** 2040 App/API · 2041 Postgres · 2042 Vite

**Offen (PRD §13):** Produktname + Markenprüfung, Rechtstexte, E-Mail-Provider, Ende der Founder-Phase.
**Später:** PNG-Icons (E10-P5), Build-Audit `vite-plugin-pwa` (nur Build-Zeit), erster GHCR-Push mit Tag `v*`, die vier älteren Web-Tests von `createElement`/`@ts-nocheck` auf `.test.tsx` umstellen, leere Blöcke als Drag-Ziel.
