# Entwicklungsplan ab 2026-11-27

Grundlage: `docs/handoff.md`, `PROJECT_STATUS.md`, Code auf `ds/e5` (`d9716a8`), GitHub-Issues #23–#80.

## Ist-Stand

- `main` steht auf E3 (`12f3e25`). `ds/e5` liegt 36 Commits davor, ohne Prüfung: E4–E7 komplett, E8-P1 bis P4 plus Billing-Job, E9-P4/P5, E10-P6. Merge wäre Fast-Forward.
- Die Issues spiegeln das nicht: E3 steht noch `ready`, alles ab E4 `needs-refinement`, obwohl gebaut.
- Im Code fehlen wirklich: Push/VAPID, Erinnerungs-Job, Sitze, Self-Host-Einstellungen, Trial-Mails, Produktions-Compose/Caddy, Monitoring, Lasttest, Pseudo-Locale, PWA-Feinschliff, Übersetzungen, Rechtsseiten, Landingpage.

**Folge:** dsh kann nicht direkt loslegen. Ein `ready`-Issue gibt es nur für E3, und das ist fertig. Ein Paket vom heutigen `origin/main` aus würde E4–E9 nicht sehen.

## Phase 0 · Prüfung und Aufräumen (Claude) · erledigt 2026-11-27

1. Abschlussaudit `ds/e5` nach `AGENTS.md` → Prüfung: `npm run check`, `npx vitest run`, `npx playwright test`, `python3 scripts/check-design.py`, Sicherheitsblick auf Migrationen 0040–0090, Billing-Webhook, Kontolöschung.
2. Fast-Forward nach `main`, alte `ds/*`-Branches und `/tmp/ebb-*`-Worktrees entfernen.
3. Issues schließen: #23, #25–#27 (E3), #28–#55 (E4–E7), #57–#60 (E8-P1 bis P4), #69, #70, #80.
4. Labels anlegen: `in-progress`, `review`, `changes-requested`, `blocked`.
5. `PROJECT_STATUS.md` nachziehen, `docs/handoff.md` löschen (steht so in der Datei).

## Phase 1 · DeepSeek-Welle 1 (klein, unabhängig, sofort nach Phase 0)

Je Paket ein Issue mit `ready` + `exec:deepseek`, nachgeschärft am echten Code (Dateiliste, Signaturen, Tests).

| Paket | Inhalt | Quelle |
|---|---|---|
| R-1 | Produktname „Ebbe“ an allen sichtbaren Stellen | Entscheidung 2026-11-27 |
| E7-P5b | Plan-Seite zeigt Bereichsnamen | Handoff, offen aus P5 |
| T-1 | Vier ältere Web-Tests von `createElement`/`@ts-nocheck` auf `.test.tsx` | Status „Später“ |
| T-2 | „Done“ im Low-Modus beendet den laufenden Timer | Status „Später“ (Bug) |
| T-3 | Navigation hinter Ritual und Sortieren bleibt per Tab erreichbar (soll `inert` sein) | Status „Später“ (a11y) |
| T-4 | E2E: Anmelde-Limit pro Spec trennen | Status „Später“ |
| E10-P1 | Übersetzungs-Skript und Pseudo-Locale | #75 |
| E10-P5 | PWA-Feinschliff, PNG-Icons | #79 |

## Phase 2 · Betrieb (gemischt)

| Paket | Ausführung | Voraussetzung |
|---|---|---|
| E9-P1 Push-Grundlage | DeepSeek | VAPID-Vorschlag aus dem Handoff bestätigt (Dev-Werte in `.env.example`, Produktion per Secret) |
| E9-P2 Erinnerungs-Job | Kern (Claude) | E9-P1 |
| E9-P3 Web: Erinnerungs-Einstellungen | DeepSeek | E9-P1, E9-P2 |
| E8-P6 Sitze | Kern (Claude) | – |
| E8-P8 Trial-Mails | DeepSeek | E-Mail-Provider egal (Fake im Test) |
| E9-P7 Compose, Caddy, Backups | DeepSeek | – |
| E9-P8 Monitoring und Logs | DeepSeek | E9-P7 |
| E9-P6 Lasttest | DeepSeek | E9-P7 |
| E8-P5 Checkout-Attrappe | DeepSeek | – |
| E8-P7 Self-Host minimal | DeepSeek | – |
| E10-P2 Übersetzungen maschinell | DeepSeek | E10-P1 |
| E10-P3 Rechtsseiten-Gerüst | DeepSeek | – |
| E10-P4 Landingpage | DeepSeek | R-1 |
| Kern-Nacharbeit | Kern (Claude) | `last_seen_at` fortschreiben, `PATCH /api/tasks` mit `spaceId`, Gnadenfrist vor Löschung |

## Entscheidungen von Dion (2026-11-27)

- **Name:** Produkt heißt „Ebbe“. Nur sichtbare Stellen wechseln (Paket R-1). `ebb_*`-Rollen, CSS-Klassen `ebb-*`, Speicherschlüssel `ebb.*`, IndexedDB `ebb-offline`, npm-/Compose-Name und Repo bleiben, sonst gehen Offline-Daten und Sitzungen verloren. Markenprüfung vor dem Launch.
- **VAPID (E9-P1):** Dev-Schlüssel lokal erzeugt, nur in `.env.example`; Produktion je Deployment per Secret.
- **E8-P5 Checkout:** erst Attrappe mit Platzhalter-Preis-IDs und Fake, echtes Paddle später.
- **E8-P7 Self-Host:** minimal. Keine Lizenz, keine Sitzgrenze, Billing-UI aus, Update per Image-Tag mit Anleitung.
- **E10-P2 Übersetzungen:** maschinell aus `locales/en`, vor Launch Muttersprachler-Review; bis dahin hinter Schalter.
- **E10-P3 Rechtsseiten:** Gerüst mit Platzhaltern `[…]`, Build-Check schlägt fehl, solange einer übrig ist.
- **E10-P4 Landingpage:** mit „Ebbe“, Texte als Schlüssel in `locales`.
- **Mail:** Anbieter offen, Code spricht nur `SMTP_URL`; Wahl beim Deploy (E9-P7).

Damit ist nichts mehr blockiert. Offen bleiben nur Paddle live und die Betreiberangaben, beide nach dem Bau.

## Schleife dsh ↔ Claude

Zustand steht nur in Issue-Labels, nie in einem Agenten:

```
ready ──dsh nimmt──▶ in-progress ──push ds/<paket>──▶ review
review ──Claude ok──▶ Merge nach main, Issue zu
review ──Claude nein──▶ changes-requested (Kommentar mit Korrekturauftrag) ──▶ dsh nimmt wieder
```

- **dsh-Seite:** Ein Shell-Watcher (kein LLM), alle 5 min: ältestes Issue mit `exec:deepseek` und `ready` oder `changes-requested` holen, auf `in-progress` setzen, `dsh --profile headless` mit Startprompt und Issue-Nummer starten. Danach `review` setzen. Immer nur ein Paket gleichzeitig: `app.ts` und `tests/isolation.routes.ts` kollidieren sonst, und jedes Paket startet vom frisch gemergten `main`.
- **Claude-Seite:** Ein Shell-Watcher meldet neue Commits auf `ds/*` bzw. Issues mit `review`. Ein Sonnet-Subagent prüft mechanisch (Diff gegen Dateiliste, Check, Pakettests, `npm test` mit eigener DB `ebb_test_review`, Design-Check) und liefert ein Urteil. Claude entscheidet Merge oder Korrekturauftrag und prüft Sicherheit selbst.
- Korrekturen gehen als Kommentar ins selbe Issue, nicht als neues Issue. Neue Issues nur für Funde außerhalb des Pakets.
