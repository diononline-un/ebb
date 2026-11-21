# Projektstatus

**Stand:** 2026-11-21 · **Phase:** Umsetzung E1 (Fundament) · Branch `ds/e1-e2` (noch nicht auf `main`)

| Bereich | Stand |
|---|---|
| Planung | Analyse, PRD, Architektur, DESIGN.md 1.0.1, Specs: fertig |
| Tickets | 80 Issues in `diononline-un/ebb`: E1/E2 `ready`, E3–E10 `needs-refinement` |
| E1 Fundament | 7/9 Pakete: P1, P6, P9 (dsh, geprüft) · P2, P3, P4 (Kern, Claude) · offen: P5, P7, P8 |
| E2 Kern-Ablauf | 0/11 |
| Tests | 55 grün, 1 übersprungen (Platzhalter Isolation) · Check 0 Fehler · Design-Drift 0 |

**Nächster Schritt:** dsh-Durchlauf fortsetzen: E1-P8, E1-P7, E1-P5, E2-P2; Stopp vor E2-P1 (Kern).

**Entwicklung:** `docker compose up -d postgres` (läuft auf dem VPS als `ebb-postgres-1`), `npm run db:migrate`, `npm run dev`.

**Ports (Port-Ring):** 2040 App/API · 2041 Postgres · 2042 Vite

**Offen (PRD §13):** Produktname + Markenprüfung, Rechtstexte, E-Mail-Provider, Ende der Founder-Phase. Später: PNG-Icons (E10-P5), Build-Audit `vite-plugin-pwa` (nur Build-Zeit).
