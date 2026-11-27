# Arbeiten im Repo (für Coding-Agents und neue Entwickler)

Kurzfassung dessen, was man wissen muss, bevor man Code ändert.

## Erst lesen

1. `docs/02-prd.md`: was das Produkt tut und warum (Leitprinzipien §2 gelten für jede Entscheidung).
2. `docs/architektur.md`: Aufbau, **Glossar** (verbindliche Namen), Datenmodell, Mandantentrennung.
3. `DESIGN.md`: bindend für jede Oberfläche (Farben, Schrift, Abstände, Bewegung, Tonfall).
4. Das eigene Paket (GitHub Issue) vollständig, inklusive „Nicht tun“.

## Befehle

```bash
npm run check        # tsc für Server + Web, muss 0 Fehler melden
npm test             # Vitest gegen echtes PostgreSQL (leert die Testdatenbank!)
npm run db:migrate   # Migrationen auf die Entwicklungsdatenbank
npm run dev          # Vite + API mit Reload
npm run e2e          # Playwright (braucht laufendes dev)
python3 scripts/check-design.py   # Design-Drift gegen DESIGN.md
```

- Tests laufen gegen die Datenbank `EBB_DB_NAME` und **leeren alle Tabellen**. Wer parallel arbeitet, nimmt eine eigene:
  `export EBB_DB_NAME=ebb_test_<paket> && npm run db:test-setup`.
- Ohne Mailserver: `APP_MODE=development` ohne `SMTP_URL` → Mails landen in `GET /api/dev/mails` (nur im Dev-Modus registriert).

## Regeln

- **Mandantentrennung ist heilig.** Jede Abfrage im Request-Pfad läuft in `withUser(userId, tx => …)`. `withSystem` nur in `src/server/jobs/`, `src/server/billing/webhook.ts`, `src/server/domain/account/delete.ts` (Auth-Zeile löschen, User-ID nur aus der Sitzung), `src/server/domain/health/deep.ts` (nur `select 1` und Billing-Lag, nichts über Personen), Auth-Hooks und `cli.ts`, jeweils mit Kommentar, warum.
- **Neue Tabellen** bekommen in derselben Migration `ENABLE` + `FORCE ROW LEVEL SECURITY` und Policies. Auth-Tabellen (Better Auth) gehören nur der Rolle `ebb_auth`.
- **Jeder neue Endpunkt** kommt in `tests/isolation.routes.ts`. Der Isolationstest prüft dann automatisch, dass fremde IDs `404` liefern.
- **Migrationen** nur vorwärts: `migrations/NNNN_name.sql` mit der nächsten freien Nummer **aus dem Block des eigenen Epics** (`docs/architektur.md` → Migrationsblöcke).
- **Fachlogik** in `src/server/domain/<bereich>/`. Routen bleiben dünn (validieren, Domain aufrufen, Fehler übersetzen). Reine Logik ohne IO in `src/shared/`, immer mit Unit-Test.
- **Routen-Helfer** aus `src/server/routes/http.ts` (`readJson`, `fieldErrors`, `invalidBody`, `idOrNull`, `notFound`), keine eigenen Kopien. 400 heißt immer `{ code: 'invalid_body', fields }`.
- **Web-Tests** als `tests/web/*.test.tsx` mit JSX, typgeprüft über `tsconfig.tests-web.json` (Vorbild `tests/web/tide-line.test.tsx`). Kein `createElement`-Umweg, kein `@ts-nocheck`. Typen und Generics dürfen in `.tsx` stehen: Der Text-Test parst echtes TSX.
- **Oberfläche:** nur Bausteine aus `src/web/ui/` und nur Tokens aus `DESIGN.md`. **Kein UI-Text im Code.** Jeder Text ist ein Schlüssel in `locales/en/<bereich>.json` des eigenen Bereichs. `common.json` ändert nur die Prüfung.
- **Namen** genau wie im Glossar (`anchor`, `must`, `slot`, `doDate` …). Keine Synonyme.
- **Sprache:** Bezeichner und Kommentare englisch, UI-Quelltexte englisch, Doku deutsch. Kommentare erklären das Warum, nicht das Was.
- **Nichts nach außen in Tests:** Paddle, Push und Mail laufen über die vorhandenen Fakes.
- **Geheimnisse** nie in Code, Doku oder Tests. Konfiguration nur über `src/server/env.ts`.
- **Keine neuen Abhängigkeiten**, außer das Paket nennt sie ausdrücklich.
- **Fertig** ist eine Änderung erst mit grünem `npm run check` und den im Paket genannten Tests.
- `PROJECT_STATUS.md` pflegt die Prüfung (Claude), nicht das Paket, sonst kollidieren parallele Zweige.

## Startprompt-Kopf für jedes Paket (DeepSeek-Harness)

```
Lies AGENTS.md, docs/architektur.md und das Paket unten vollständig. Arbeite in einem eigenen Worktree:
git fetch origin && git worktree add ../ebb-<paket-id> -b ds/<paket-id> origin/main && cd ../ebb-<paket-id> && npm ci.
Ändere nur die im Paket genannten Dateien; brauchst du eine weitere, hör auf und berichte.
Eigene Testdatenbank: export EBB_DB_NAME=ebb_test_<paket-id> && npm run db:test-setup. Fertig mit grünem npm run check und den im Paket genannten Tests
(npx vitest run <dateien>); kein npm test über alles (das macht die Prüfung).
Ein Commit mit Präfix feat:/fix:/test:/docs: und der Paket-ID im Betreff, dann git push -u origin ds/<paket-id>.
Kein PR, kein Merge, nicht auf main. Am Ende: Bericht mit Testausgabe und allem, was abweicht.
Wenn etwas nicht so ist wie beschrieben (Datei, Funktion, Spalte fehlt oder heißt anders): aufhören und
berichten statt raten. Keine neuen Abhängigkeiten außer den im Paket genannten. Nie RLS abschwächen,
nie withUser umgehen, nie Tests löschen oder abschwächen, damit sie grün werden. UI-Texte nur über locales/en/<bereich>.json.
```

## Prüfung durch Claude (je Paket)

1. Diff gegen das Paket: nur genannte Dateien, Akzeptanzkriterien erfüllt, nichts darüber hinaus.
2. `npm run check`, die Pakettests, danach `npm test` über alles und `python3 scripts/check-design.py`.
3. Sicherheitsblick: Mandantentrennung, serverseitige Validierung, keine Daten in URLs, keine Secrets.
4. Ergebnis: übernehmen (Merge nach main), mit Korrekturauftrag zurück, oder selbst nachbessern (kleine Fehler). Danach `PROJECT_STATUS.md` aktualisieren.

## Wo anfangen

| Aufgabe | Einstieg |
|---|---|
| Tagesbeginn, Rollover | `src/shared/day.ts`, `src/server/domain/day/start-day.ts`, `src/server/middleware/day-start.ts` |
| Aufgaben, Sortieren, Anker, Muss | `src/server/domain/tasks/`, `src/web/features/today/`, `src/web/features/triage/` |
| Brain Dump, Offline | `src/server/domain/dump/`, `src/web/features/dump/`, `src/web/lib/offline-queue.ts` |
| Bereiche, Einladungen | `src/server/domain/spaces/` |
| Abo, Zugriff | `src/shared/entitlement.ts`, `src/server/billing/` |
| Erinnerungen | `src/server/jobs/`, `src/web/sw.ts` |
| Offene Arbeit | GitHub Issues (Epics E1–E10), Specs in `docs/specs/` |

<!-- do-design guardrail -->
## Design guardrail

`DESIGN.md` is binding. Before changing any colour, font, size, radius, shadow or spacing:
use a token from its §2-§7. If the task needs a value the paper lacks, stop and ask:
"No token for X. Amend the paper (§12) or use <nearest>?" Never invent one.

After UI changes run `python3 scripts/check-design.py`. Fix the drift or explain it;
never edit the tokens to match accidental values. Also not checkable by script:
accent on at most 5% of a screen and never body text; no new font weights; nested
radii concentric (inner = outer - padding). No DESIGN.md: say so and ask.
<!-- /do-design guardrail -->
