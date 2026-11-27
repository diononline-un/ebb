# Projektstatus

**Stand:** 2026-11-27 · **Phase:** E1 bis E7 auf `main`, E8–E10 teilweise · Plan: `docs/entwicklungsplan.md`

| Bereich | Stand |
|---|---|
| Planung | Analyse, PRD, Architektur, DESIGN.md 1.0.2, Specs |
| E1 Fundament | 9/9 fertig, geprüft, auf `main` |
| E2 Kern-Ablauf | 11/11 fertig, geprüft, auf `main` |
| E3 Energie | 4/4 fertig, geprüft, auf `main` (Ritual, Low-Modus, Fokus-Timer; D1: Ritual auch am Wochenende) |
| E4 Ziele, Habits, Onboarding | 6/6 fertig, geprüft, auf `main` |
| E5 Projekte, Wiederholungen, Erledigungen | 8/8 fertig, geprüft, auf `main` |
| E6 Weekly Reset | 4/4 fertig, geprüft, auf `main` |
| E7 Geteilte Bereiche | 6/6 fertig, geprüft, auf `main` (Rest: Plan-Seite zeigt keine Bereichsnamen) |
| E8 Billing | P1–P4 + Ereignis-Job auf `main`; offen P5 (Attrappe), P6 Sitze, P7 (minimal), P8 Trial-Mails |
| E9 Betrieb | P4 Export, P5 Löschung auf `main`; offen P1–P3, P6–P8 |
| E10 Launch | P6 Produkt-Events auf `main`; offen P1–P5 (Entscheidungen 2026-11-27 im Plan) |
| Tests | 541 Vitest (56 Dateien) + 8 Playwright grün · Check 0 Fehler · Design-Drift 0 (208 Dateien) |
| Bundle | erster Chunk 111 KB gzip (Budget 250), Seiten als eigene Chunks (Stand E3, nicht neu gemessen) |

**Arbeitsordner:** `/home/dsh/Projekte/ebb` (Klon von `diononline-un/ebb`, Branch `main`). Neue Arbeit auf `ds/<paket-id>` von `origin/main`.

**Entwicklung:** `docker compose up -d postgres` (Container `ebb-postgres-1`), `npm run db:migrate`, `npm run dev`; E2E mit laufendem dev: `npm run e2e`.

**Ports (Port-Ring):** 2040 App/API · 2041 Postgres · 2042 Vite

**Abweichungen von den Specs (E05–E10 sind nicht am Code nachgeschärft):**
- `GET /api/tasks/:id` liefert `{ task, subtasks, progress }`.
- Sign-up-Limit im Dev-Modus 50 (Produktion/Selfhost 5), sonst kippt die E2E-Suite am gemeinsamen Bucket.
- `POST /api/onboarding/done` setzt `ritual_done_at` für den Tag.
- 402-Sperre nimmt aus: `/api/auth`, `/api/billing`, `/api/export`, `/api/settings`, `/api/account`, `/api/events`.
- `0090`: `ebb_system` darf `"user"` löschen und `session("userId","createdAt")` lesen (Kontolöschung, Aufbewahrung).

**Bekannte Risiken:** keine Paddle-Kündigung vor der Kontolöschung (kein API-Client), Löschung sofort ohne Gnadenfrist, `last_seen_at` schreibt niemand fort, `PATCH /api/tasks` kennt kein `spaceId`, Webhook prüft nur den ersten `h1`-Wert (Secret-Rotation).

**Offen (PRD §13):** Markenprüfung für „ebbe“, Betreiberangaben für die Rechtstexte, E-Mail-Provider (beim Deploy), Paddle live, Ende der Founder-Phase.
**Später:** Build-Audit `vite-plugin-pwa` (nur Build-Zeit), erster GHCR-Push mit Tag `v*`, leere Blöcke als Drag-Ziel.
