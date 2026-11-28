# Projektstatus

**Stand:** 2026-11-27 · **Phase:** E1 bis E10 gebaut und geprüft auf `main` · offen: nur die Punkte für Dion unten

| Bereich | Stand |
|---|---|
| Planung | Analyse, PRD, Architektur, DESIGN.md 1.0.2 (Name „ebbe“), Specs, `docs/entwicklungsplan.md` |
| E1–E7 | fertig, geprüft, auf `main` (E7-P5b: Plan-Seite nennt Bereiche) |
| E8 Billing | P1–P8 fertig: Zugriff, Webhook, Ereignis-Job, 402-Sperre, Abo-Seite mit Checkout (läuft, sobald Paddle-Variablen gesetzt sind), Sitze, Self-Host minimal, Trial-Mails |
| E9 Betrieb | P1–P5, P7, P8 fertig: Push (Endpoint-Allowlist gegen SSRF), Erinnerungs-Job, Einstellungsseite, Export, Löschung, Compose/Caddy/Backups (Restore-Drill bestanden), Monitoring, Lasttest (P6) plus P-1 (Caches für Tagesbeginn und Zugriff) |
| E10 Launch | P1–P6 fertig: Locale-Prüfung, Übersetzungen ES/FR/DE/JA/ZH-CN (maschinell, `reviewed: false`, unsichtbar), Rechtsseiten mit Platzhaltern, Landingpage, PWA, Produkt-Events |
| Tests | 755 Vitest (73 Dateien) grün · Check 0 Fehler · Design-Drift 0 (242 Dateien) · `i18n:check` grün · E2E 8/8 zweimal hintereinander auf `363117c` |
| Last | 100 req/s auf der geteilten Dev-VPS: p95 323 ms nach P-1 (vorher 773, Ziel 200). Rest steckt in der Sitzungsprüfung von Better Auth (~2 Transaktionen je Request), Details `docs/betrieb.md` → „Lasttest“ |
| Bundle | Einstiegs-Chunk 226 KB gzip (Budget 250). Wächst: 205 KB nach T-6, seitdem +21 KB |

**Arbeitsordner:** `/home/dsh/Projekte/ebb` (Klon von `diononline-un/ebb`, Branch `main`). Pakete laufen über die Schleife in `~/Projekte/ebb-loop/` (Worker startet dsh je `ready`-Issue, Prüfung durch Claude/Sonnet, Merge per `merge.sh`).

**Entwicklung:** `docker compose up -d postgres` (Container `ebb-postgres-1`), `npm run db:migrate`, `npm run dev`; E2E mit laufendem dev: `npm run e2e`.

**Ports (Port-Ring):** 2040 App/API · 2041 Postgres · 2042 Vite

**Abweichungen von den Specs (E05–E10 sind nicht am Code nachgeschärft, die Issues sind es):**
- `GET /api/tasks/:id` liefert `{ task, subtasks, progress }`.
- `POST /api/onboarding/done` setzt `ritual_done_at` für den Tag.
- 402-Sperre nimmt aus: `/api/auth`, `/api/billing/*`, `/api/billing-config/portal`, `/api/export`, `/api/settings`, `/api/account`, `/api/events`.
- `0090`: `ebb_system` darf `"user"` löschen und `session("userId","createdAt")` lesen (Kontolöschung, Aufbewahrung).
- Push: VAPID aus der Umgebung statt `instance_config`; Erinnerungen in `reminder_sent` statt `*_sent_on`-Spalten.
- Sitze: Paddle hält die Liste in `custom_data.seatUserIds`, lokal nur Wünsche (`seat_request`).
- Kern-Pakete E8-P6 und E9-P2 hat dsh gebaut, Claude hat sie selbst geprüft.

**Bekannte Risiken:** keine Paddle-Kündigung vor der Kontolöschung, Löschung sofort ohne Gnadenfrist, `last_seen_at` schreibt niemand fort, `PATCH /api/tasks` kennt kein `spaceId`, Webhook prüft nur den ersten `h1`-Wert, keine CSP (Paddle.js braucht `cdn.paddle.com`), Vitest-Timeouts unter paralleler Last (5 s), Einstiegs-Chunk wächst.

**Für Dion:**
- Paddle live: Variablen setzen (`docs/betrieb.md` → „Paddle live schalten“).
- Betreiberangaben in `content/legal/*` (`[[…]]`); bis dahin bricht der Release-Build absichtlich ab.
- Muttersprachler-Review (`docs/uebersetzung-review.md`), danach `reviewed: true`.
- Markenprüfung „ebbe“, App-Icon (DESIGN §8), Mail-Anbieter beim Deploy.

**Später:** Build-Audit `vite-plugin-pwa`, erster GHCR-Push mit Tag `v*`, leere Blöcke als Drag-Ziel.
