# Projektstatus

**Stand:** 2026-11-22 · **Phase:** Umsetzung E2 (Kern-Ablauf) · Branch `ds/e1-e2` (noch nicht auf `main`)

| Bereich | Stand |
|---|---|
| Planung | Analyse, PRD, Architektur, DESIGN.md 1.0.1, Specs: fertig |
| Tickets | 80 Issues in `diononline-un/ebb`: E1/E2 `ready`, E3–E10 `needs-refinement` |
| E1 Fundament | 9/9: alle Pakete gebaut und geprüft |
| E2 Kern-Ablauf | 3/11: P1, P3 (Kern, Claude) · P2 (dsh, geprüft) · offen: P4–P11 (alle DeepSeek) |
| Tests | 115 grün, 1 übersprungen (Platzhalter Isolation) · Check 0 Fehler · Design-Drift 0 · CI grün |

**Nächster Schritt:** dsh-Durchlauf bis E2-P11, ohne weiteren Kern-Stopp. Danach Prüfung durch Claude und Merge von `ds/e1-e2` nach `main`.

**Entwicklung:** `docker compose up -d postgres` (läuft auf dem VPS als `ebb-postgres-1`), `npm run db:migrate`, `npm run dev`.

**Ports (Port-Ring):** 2040 App/API · 2041 Postgres · 2042 Vite

**Offen (PRD §13):** Produktname + Markenprüfung, Rechtstexte, E-Mail-Provider, Ende der Founder-Phase. Später: PNG-Icons (E10-P5), Build-Audit `vite-plugin-pwa` (nur Build-Zeit), erster GHCR-Push mit Tag `v*`.
