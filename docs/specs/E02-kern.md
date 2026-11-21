# E2 · Kern-Ablauf: Dump, Aufgaben, Sortieren, Heute

Migrationsblock 0020–0029. Paket-IDs `E2-Pn`. PRD: F3, F4, F5. Startprompt-Kopf: `AGENTS.md`.

## Ziel

Vom vollen Kopf zum Tagesplan: Gedanken in den Dump werfen (auch offline), Zeilen per Tap zu Aufgaben machen, jede Aufgabe mit der Konsequenz-Frage einsortieren, einen Anker wählen, in Blöcken abarbeiten. Unerledigtes rollt beim Tagesbeginn automatisch in die Inbox.

## Ist-Stand

Nach E1: Auth, Bereiche, Settings, Isolations-Harness, Web-Shell, PWA. Vor dem Start prüft Claude die Dateipfade gegen den echten Stand.

## Entscheidungen

### Getroffen
- **Rollover** als ein SQL-`UPDATE` in `start-day.ts` (A3). Rollen: `status in ('todo','doing')` und `do_date < heute`. Danach `do_date = heute`, `slot = 'inbox'`, `must = false`, `anchor = false`, `push_count + 1`. Deadline bleibt. Aufgaben mit `do_date IS NULL` (Erledigungen) rollen nie.
- **Sortier-Antworten** (`src/shared/triage.ts`):
  - `must_today(slot)` → `doDate = heute`, `must = true`, `slot`
  - `later(date)` → `doDate = date` (> heute), `slot = 'inbox'`, `must = false`, `anchor = false`
  - `errand` → `doDate = null`, `slot = 'errands'`, `must = false`, `anchor = false`
  - `today(slot)` → `doDate = heute`, `slot`
- **Anker:** nur für `doDate = heute`. Höchstens einer pro Person und Tag (Unique-Index). Ein zweiter → `409 anchor_exists`, außer mit `replaceAnchor: true`.
- **Muss-Grenze:** ab `must_warn_at` (Standard 4) kommt `warnings: ['must_many']` in der Antwort. Mehr als 5 → `422 must_limit`.
- **Reihenfolge** über `position` (Ganzzahl) pro `(assignee, doDate, slot)`. Der Server nummeriert beim Verschieben lückenlos neu.
- **Dump-Idempotenz** über `(user_id, client_id)`.

### Offen
| # | Frage | Wer | Vorschlag | Betrifft |
|---|---|---|---|---|
| D1 | Zeigt „Today“ Erledigungen als Liste oder nur als Zeile „5 errands“ mit Link? | Dion | Eine Zeile mit Anzahl und Link (weniger Reize). Die Liste lebt in Plan → Errands. | E2-P7 |

## Datenmodell

`migrations/0020_planning.sql` (E2-P1): `task`, `dump_line`, `day_entry` wie in `docs/architektur.md`, **ohne** `project_id`, `parent_id`, `recurrence_id` (die ergänzt E5). Text-Spalten mit `CHECK` statt Enums:
- `task.status in ('todo','doing','waiting','done','skipped')`, `task.slot in ('inbox','block1','block2','block3','block4','errands')`
- `CHECK (anchor = false OR do_date IS NOT NULL)`, `CHECK (slot <> 'errands' OR do_date IS NULL)`, `char_length(title) between 1 and 200`
- Indizes: `task (assignee_id, do_date, slot, position)`, `task (space_id)`, partiell unique `task (assignee_id, do_date) WHERE anchor`, unique `dump_line (user_id, client_id)`.
- Trigger `app.task_personal_assignee()` (BEFORE INSERT/UPDATE): liegt `space_id` in einem persönlichen Bereich, wird `assignee_id` auf dessen Owner gesetzt.
- RLS wie in der Architektur. `dump_line`, `day_entry`: `user_id = app.uid()`.

## Wellen

| Welle | Pakete |
|---|---|
| A | P1 (Kern) ‖ P2 |
| B | P3 (Kern) ‖ P4 ‖ P5 |
| C | P6 ‖ P7 ‖ P9 ‖ P10 |
| D | P8 |
| E | P11 |

---

### E2-P1 · Migration Planung und API-Schemas

- **Ausführung:** Kern · **hängt ab von:** E1 · **parallel zu:** P2
- **Dateien:** anlegen `migrations/0020_planning.sql`, `src/shared/schemas/task.ts`, `src/shared/schemas/dump.ts`, `tests/planning-schema.test.ts`.
- **Auftrag:** Migration wie oben. zod-Schemas: `TaskStatus`, `Slot`, `Task` (Ausgabe, camelCase), `TaskCreate`, `TaskPatch` (inkl. `replaceAnchor?: boolean`), `DumpLine`, `DumpCreate { clientId: uuid, text: 1–500 }`, `TodayView`, `TaskListView`. Exportierte Typen per `z.infer`.
- **Akzeptanz:** Tests: Trigger setzt `assignee_id` im persönlichen Bereich (auch wenn ein anderer Wert gesendet wird). Zweiter Anker am selben Tag → Unique-Verletzung. `slot = 'errands'` mit Datum → Check-Verletzung. Nutzer B sieht A's Aufgaben und Dump-Zeilen nicht (per `withUser`).
- **Nicht tun:** keine Postgres-Enums, keine Spalten für E5.

### E2-P2 · Reine Logik: Tag und Sortieren

- **Ausführung:** DeepSeek · **hängt ab von:** E1 · **parallel zu:** P1
- **Dateien:** anlegen `src/shared/day.ts`, `src/shared/triage.ts`, `tests/shared/day.test.ts`, `tests/shared/triage.test.ts`.
- **Abhängigkeiten:** `date-fns`, `@date-fns/tz`.
- **Auftrag:**
  1. `localDate(now: Date, timeZone: string, dayStartMinute: number): string` → `YYYY-MM-DD` der Ortszeit minus `dayStartMinute`.
  2. `addDays(date: string, n: number): string`, `weekStart(date: string, weekStartDow: number): string`, `isBefore(a: string, b: string): boolean`.
  3. `type TriageAnswer = { kind: 'must_today'; slot: BlockSlot } | { kind: 'later'; date: string } | { kind: 'errand' } | { kind: 'today'; slot: BlockSlot }`, `BlockSlot = 'block1'|'block2'|'block3'|'block4'`.
  4. `triagePatch(answer: TriageAnswer, today: string): TaskPatch` nach den Regeln oben. `later` mit `date <= today` wirft `RangeError('later_must_be_future')`.
- **Akzeptanz:** `day.test.ts`: Europe/Berlin am 2026-03-29 (Sommerzeit) und 2026-10-25 (Winterzeit): 03:59 → Vortag, 04:00 → heute; `dayStartMinute = 0`; Zeitzone `Pacific/Kiritimati` (UTC+14) und `Pacific/Pago_Pago` (UTC−11); `weekStart` für So- und Mo-Start über einen Jahreswechsel. `triage.test.ts`: alle vier Antworten, `later` mit heute und gestern → Fehler.
- **Nicht tun:** kein `new Date('YYYY-MM-DD')` für lokale Tage (UTC-Falle), keine IO.

### E2-P3 · Tagesbeginn und Rollover

- **Ausführung:** Kern · **hängt ab von:** P1, P2 · **parallel zu:** P4, P5
- **Dateien:** anlegen `src/server/domain/day/start-day.ts`, `src/server/middleware/day-start.ts`, `tests/rollover.test.ts`; ändern `src/server/app.ts`.
- **Auftrag:** `startDayIfNeeded(tx, now: Date): Promise<{ today: string; rolledCount: number | null }>`. Liest die Settings, berechnet `today` mit `localDate`. Sperre und Prüfung in einem Schritt: `UPDATE user_settings SET last_day_started = $today WHERE user_id = app.uid() AND (last_day_started IS NULL OR last_day_started < $today) RETURNING 1`. Nur wenn eine Zeile zurückkommt: Rollover-`UPDATE` (Regel oben), danach `INSERT INTO day_entry (user_id, date, rolled_count) … ON CONFLICT DO NOTHING`. Die Middleware läuft für angemeldete `/api/*`-Requests außer Auth, Health, Dev und Billing-Webhook und setzt `c.var.today`.
- **Akzeptanz:** Tests mit festem `now`: `todo` und `doing` rollen; `waiting`, `done`, `skipped` und `do_date IS NULL` nicht. `push_count` steigt genau um 1, auch bei 5 parallelen Requests (`Promise.all`). Must und Anker werden zurückgesetzt, die Deadline bleibt. Um 03:59 Ortszeit kein Rollover, um 04:00 schon. `rolled_count` stimmt. Aufgaben anderer Nutzer bleiben unberührt.
- **Nicht tun:** kein Cron, keine Schleife über Aufgaben in JS, kein zweiter Ort für die Regel.

### E2-P4 · Dump-API

- **Ausführung:** DeepSeek · **hängt ab von:** P1, P3 (Middleware in `app.ts`) · **parallel zu:** P5
- **Dateien:** anlegen `src/server/routes/dump.ts`, `src/server/domain/dump/dump.ts`, `tests/dump.test.ts`; ändern `src/server/app.ts` (eine Zeile), `tests/isolation.routes.ts`.
- **Auftrag:**
  - `GET /api/dump` → aktive Zeilen (`archived_at IS NULL`), älteste zuerst, inkl. `taskId`.
  - `GET /api/dump/archived` → archivierte, neueste zuerst, höchstens 200.
  - `POST /api/dump` (`DumpCreate`) → `201` neue Zeile; gleiche `clientId` erneut → `200` mit derselben Zeile (`INSERT … ON CONFLICT (user_id, client_id) DO NOTHING`, dann `SELECT`). Text wird getrimmt; leer → 400.
  - `POST /api/dump/:id/to-task` → legt eine Aufgabe im persönlichen Bereich an (`title` = Text, auf 200 Zeichen gekürzt; `doDate = today`; `slot = 'inbox'`) und setzt `task_id`. Ist `task_id` schon gesetzt → `200` mit der bestehenden Aufgabe, keine zweite.
  - `POST /api/dump/:id/archive` → setzt `archived_at`.
- **Akzeptanz:** `tests/dump.test.ts` deckt alle Fälle oben ab, inklusive Idempotenz und Kürzung. Isolation: `to-task` und `archive` stehen in `isolation.routes.ts` und liefern für Fremde 404.
- **Nicht tun:** Zeilen nie hart löschen; keine Aufgabe in geteilten Bereichen (der Dump ist persönlich).

### E2-P5 · Aufgaben-API und Ansichten

- **Ausführung:** DeepSeek · **hängt ab von:** P1, P2, P3 · **parallel zu:** P4
- **Dateien:** anlegen `src/server/routes/tasks.ts`, `src/server/domain/tasks/tasks.ts`, `src/server/domain/tasks/views.ts`, `src/server/domain/tasks/rules.ts`, `tests/tasks.test.ts`, `tests/tasks-views.test.ts`; ändern `src/server/app.ts` (eine Zeile), `tests/isolation.routes.ts`.
- **Auftrag:**
  - `POST /api/tasks` (`TaskCreate`: `title`, `notes?`, `doDate?` (Standard heute), `deadline?`, `slot?` (Standard `inbox`), `spaceId?` (Standard persönlich)). Antwort `201 { task, warnings }`.
  - `GET /api/tasks/:id`, `PATCH /api/tasks/:id` (`TaskPatch`), `DELETE /api/tasks/:id` (nur `created_by` oder Bereichs-Owner, sonst 404).
  - `POST /api/tasks/:id/triage` (`TriageAnswer`) → wendet `triagePatch` an und läuft dann durch dieselben Regeln wie PATCH.
  - Regeln in `rules.ts`, genutzt von Create, Patch und Triage: `status → done` setzt `completed_at`, zurück löscht es. Anker nur bei `doDate = today` (`422 anchor_not_today`); zweiter Anker → `409 { code: 'anchor_exists', currentAnchorId }`, mit `replaceAnchor: true` alter Anker aus, neuer an (eine Transaktion). Muss: Anzahl `must` heute ≥ `mustWarnAt` → `warnings: ['must_many']`; neue Anzahl > 5 → `422 must_limit`. `deadline < doDate` → `warnings: ['deadline_before_do_date']`. Wechsel von `slot` oder `position` → lückenlose Neunummerierung im Ziel- und Quell-Slot.
  - `GET /api/today` → `TodayView { date, energy, rolledCount, anchor, must[], slots: { inbox[], block1[], block2[], block3[], block4[] }, errandsOpen: number, doneToday[] }`. Grundlage: Aufgaben mit `assignee_id = ich` und `do_date = heute`. Anker und Muss-Aufgaben erscheinen **nur** in ihren eigenen Feldern, nicht zusätzlich in den Slots.
  - `GET /api/tasks?view=inbox|tomorrow|week|errands|waiting|done|skipped` → `TaskListView`. Woche = heute+1 bis heute+7, gruppiert nach Datum. `done`/`skipped` = letzte 30 Tage.
- **Akzeptanz:** `tests/tasks.test.ts` für jede Regel (inkl. 409/422-Codes, `replaceAnchor`, Neunummerierung, Löschrecht). `tests/tasks-views.test.ts` für jede Ansicht mit Seed-Daten über mehrere Tage. Isolation: alle `:id`-Routen eingetragen.
- **Nicht tun:** keine Regel doppelt in Route und Domain; Antworten immer camelCase über die zod-Ausgabeschemas; kein `SELECT *` in Antworten.

### E2-P6 · Web: Dump, Quick Capture, Offline-Warteschlange

- **Ausführung:** DeepSeek · **hängt ab von:** P4 · **parallel zu:** P7, P9, P10
- **Dateien:** anlegen `src/web/features/dump/*`, `src/web/lib/offline-queue.ts`, `locales/en/dump.json`, `tests/web/offline-queue.test.ts`; ändern `src/web/routes/dump.tsx`, `src/web/features/shell/AppShell.tsx` (nur den Quick-Capture-Button verdrahten).
- **Abhängigkeiten:** `idb-keyval`; dev `fake-indexeddb`.
- **Auftrag:** Dump-Seite: Fläche `--surface-sunken`, ein Eingabefeld unten („Add a thought“), Enter fügt eine Zeile an. Liste der aktiven Zeilen. Pro Zeile Aktionen „→ Task“ (Zeile danach durchgestrichen in `--ink-3`, mit Link zur Aufgabe) und „Archive“. Denkanstöße als ruhige Liste, wenn der Dump leer ist (Texte in `dump.json`, eigene Formulierungen). Quick Capture: Sheet mit einem Textfeld, Enter speichert und schließt. Tastenkürzel `n` auf Desktop (nicht in Eingabefeldern). `offline-queue.ts`: `enqueueDump(line)`, `flushQueue()`, `pendingCount()`; jede neue Zeile bekommt sofort `crypto.randomUUID()` als `clientId` und wird optimistisch angezeigt. Ohne Netz (oder Fetch-Fehler) landet sie in IndexedDB; bei `online`-Event und App-Start wird in Reihenfolge gesendet. Hinweiszeile „n thoughts waiting for connection“, solange `pendingCount() > 0`.
- **Akzeptanz:** `offline-queue.test.ts` (fake-indexeddb, gemocktes fetch): Reihenfolge bleibt erhalten; doppeltes Flushen sendet nichts doppelt (Server-Idempotenz wird vorausgesetzt); ein Fehler mitten in der Queue stoppt und behält den Rest. Manuell im Bericht: DevTools offline → 3 Zeilen → online → erscheinen auf einem zweiten Gerät/Tab. Design-Check grün.
- **Nicht tun:** keine anderen Schreibaktionen offline puffern, kein eigenes Sync-Protokoll.

### E2-P7 · Web: Heute, Aufgabenzeile, Detail-Sheet

- **Ausführung:** DeepSeek · **hängt ab von:** P5 · **parallel zu:** P6, P9, P10
- **Dateien:** anlegen `src/web/features/today/*`, `src/web/features/tasks/TaskRow.tsx`, `src/web/features/tasks/TaskSheet.tsx`, `src/web/features/tasks/api.ts`, `locales/en/today.json`, `locales/en/tasks.json`; ändern `src/web/routes/today.tsx`.
- **Auftrag:** Layout genau nach `DESIGN.md` §5 (Today-Reihenfolge) und §6 (Aufgabenzeile, Tide-Linie, Muss-Punkt). Rollover-Hinweis, wenn `rolledCount > 0` (Text laut §9, schließbar für den Tag). Leerer Anker: Zeile „Nothing chosen yet. What would make today worth it?“ (eigene Formulierung erlaubt, Ton §9) mit Aktion „Choose anchor“ (öffnet eine Auswahl aus den heutigen Aufgaben). Abhaken per Kreis-Checkbox (optimistisch, Rückgängig per Toast 5 s). Anker erledigt → `TideLine animateIn`. Tippen auf eine Zeile → `TaskSheet` (Titel, Notiz, Do Date, Deadline, Muss, Anker, Status, Löschen mit Bestätigung). 409 `anchor_exists` → Rückfrage „Replace current anchor?“. 422 `must_limit` → ruhiger Hinweis im Sheet. `warnings` als Hinweistext. Leere Blöcke ausgeblendet; Erledigungen als eine Zeile mit Anzahl (D1). „Done today“ eingeklappt.
- **Akzeptanz:** Komponententests (Vitest + Testing Library: `@testing-library/react` als dev-Abhängigkeit erlaubt) für TaskRow (Muss-Punkt mit SR-Text, erledigt durchgestrichen) und den Anker-Ersetzen-Dialog. Screenshots 390 und 1280, light/dark. Design-Check grün. Kein Verschoben-Zähler auf Today.
- **Nicht tun:** keine Modals außer der Lösch-Bestätigung; kein Rot für Muss; kein Drag & Drop (das ist P8).

### E2-P8 · Web: Verschieben zwischen Blöcken

- **Ausführung:** DeepSeek · **hängt ab von:** P7 · **parallel zu:** —
- **Dateien:** ändern `src/web/features/today/*`, `src/web/features/tasks/TaskRow.tsx`; anlegen `src/web/features/today/MoveMenu.tsx`.
- **Abhängigkeiten:** `@dnd-kit/core`, `@dnd-kit/sortable`.
- **Auftrag:** Drag & Drop innerhalb und zwischen Inbox und Block 1–4 (nicht in Anker/Muss-Bereiche). Long-Press auf Mobil (250 ms), Griff-Icon auf Desktop. Gleichwertige Alternative: Menü an jeder Zeile „Move to → Inbox / Block 1–4 / Errands / Another day…“. Tastatur: dnd-kit Keyboard-Sensor mit Ansagen über i18n. Optimistisch, Rückfall bei Fehler.
- **Akzeptanz:** Verschieben per Menü funktioniert ohne Maus (Test). Reihenfolge bleibt nach Reload gleich. Drag auf Mobil (Playwright mit Touch-Emulation) im Bericht.
- **Nicht tun:** keine Animation außer den zwei erlaubten Mustern (§7); kein Kanban-Spaltenlayout.

### E2-P9 · Web: Sortieren (Konsequenz-Frage)

- **Ausführung:** DeepSeek · **hängt ab von:** P5 · **parallel zu:** P6, P7, P10
- **Dateien:** anlegen `src/web/features/triage/*`, `src/web/routes/triage.tsx`, `locales/en/triage.json`.
- **Auftrag:** Vollbild-Ablauf über die Inbox von heute: eine Karte pro Aufgabe, Frage in der Rolle „Question“, vier große Antworten in Daumenreichweite (Texte laut DESIGN.md §9). „Must today“ und „Today“ fragen danach in einem zweiten Schritt nach dem Block (1–4, Standard Block 1). „Later“ öffnet eine Datumsauswahl (Morgen, Übermorgen, nächster Montag, Datum wählen). Tasten 1–4 auf Desktop, `Esc` beendet. Fortschritt als Tide-Linie oben. Kartenwechsel nach Muster 2 (§7). Am Ende: „Choose your anchor“ (Auswahl aus den heutigen Aufgaben) oder „Skip“. Einstieg: Button „Sort inbox (n)“ auf Today, wenn die Inbox nicht leer ist.
- **Akzeptanz:** Komponententest: Antwort → richtiger `POST /triage`-Body. Fertig ohne Inbox-Aufgaben → direkt zur Anker-Wahl. Design-Check grün.
- **Nicht tun:** keine Mehrfachauswahl, keine Liste aller Aufgaben während des Sortierens.

### E2-P10 · Web: Plan-Ansichten

- **Ausführung:** DeepSeek · **hängt ab von:** P5 · **parallel zu:** P6, P7, P9
- **Dateien:** anlegen `src/web/features/plan/*`, `locales/en/plan.json`; ändern `src/web/routes/plan.tsx`.
- **Auftrag:** Tabs: Inbox · Tomorrow · Week · Errands · Waiting · Done · Not today. Week gruppiert nach Tag (Wochentag + Datum über `Intl`). Zeilen nutzen `TaskRow` aus P7 (falls noch nicht gemergt: Import-Pfad laut Spec verwenden, die Prüfung mergt in Reihenfolge). Hier, und nur hier, wird der Verschoben-Zähler gezeigt („↻ 3×“, ab 2).
- **Akzeptanz:** jede Ansicht mit Seed-Daten gerendert (Screenshot 390). Leerer Zustand pro Tab mit eigenem Text.
- **Nicht tun:** kein Kalender-Grid.

### E2-P11 · E2E: der Kern-Ablauf

- **Ausführung:** DeepSeek · **hängt ab von:** P6–P10 · **parallel zu:** —
- **Dateien:** anlegen `e2e/core-loop.spec.ts`, `e2e/rollover.spec.ts`.
- **Auftrag:** Registrieren → Dump 3 Zeilen → 2 zu Aufgaben → Sortieren (eine Muss in Block 1, eine Later morgen) → Anker wählen → abhaken → Tide-Linie sichtbar. Rollover: über `/api/dev/clock` (nur Dev, setzt einen Uhr-Offset für den Nutzer; dafür `src/server/routes/dev.ts` und `src/server/domain/day/start-day.ts` minimal erweitern, im Paket ausdrücklich erlaubt) einen Tag weiter → Hinweis „came along“, Aufgabe in der Inbox.
- **Akzeptanz:** beide Specs grün in CI (Chromium), Laufzeit < 60 s.
- **Nicht tun:** keine festen `waitForTimeout`; die Dev-Uhr ist außerhalb von `APP_MODE=development` nicht registriert (Test dafür).
