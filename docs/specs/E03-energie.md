# E3 · Energie: Morgen-Ritual, Low-Energy-Modus, Fokus-Timer

Migrationsblock 0030–0039. Paket-IDs `E3-Pn`. PRD: F6, F7, Methode §5. Startprompt-Kopf: `AGENTS.md`.
**Nachgeschärft am Code `main@483b68f` (2026-11-22).**

## Ziel

Der Tag beginnt mit einer Frage statt mit einem Board. An Low-Energy-Tagen bleibt nur eine Aufgabe übrig, und die Tide-Linie „ebbt“. Blöcke lassen sich mit einem Timer abarbeiten.

## Ist-Stand (geprüft am Code)

**Gibt es schon, nur wiederverwenden:**

| Baustein | Wo | Nutzen in E3 |
|---|---|---|
| `day_entry (energy, rolled_count, ritual_done_at)` | `migrations/0020_planning.sql` | Energie und Ritual-Status pro Tag, keine neue Tabelle nötig |
| `TodayView.energy`, `TodayView.rolledCount` | `src/shared/schemas/task.ts`, `src/server/domain/tasks/views.ts` | Ritual und Low-Modus lesen `GET /api/today` |
| Energie-Zeile auf Today | `TodayPage.tsx` (`t('energy.low')`/`t('energy.good')`) | bleibt; P3 macht daraus den Umschalter |
| `RolloverNote` | `src/web/features/today/RolloverNote.tsx` | Schritt 2 des Rituals |
| `DumpComposer` + `useDumpSubmit()` | `src/web/features/dump/DumpComposer.tsx`, `dump/api.ts` | Schritt 3 (Offline-Warteschlange inklusive) |
| `TriageFlow` (Props `view`, `onTriage`, `onChooseAnchor`, `onDone`) | `src/web/features/triage/TriageFlow.tsx`; Callbacks wie in `TriagePage.tsx` | Schritte 4 und 5 (Sortieren + Anker) **unverändert** |
| `TaskRow`, `TaskSheet`, `usePatchTask`, `useToday` | `src/web/features/tasks/` | Low-Modus |
| `TideLine` (`animateIn`) | `src/web/ui/TideLine.tsx` | Signatur im Ritual und Low-Modus |
| `TaskPatch.nextStep` (≤ 280) | `src/shared/schemas/task.ts`, `domain/tasks/tasks.ts` | erster 10-Minuten-Schritt / „wo ich aufgehört habe“ |
| Settings `timerDefaultMin` | `GET /api/settings` (`src/server/domain/settings/settings.ts`) | Standarddauer des Timers |

**Fehlt, wird gebaut:** Energie setzen und Ritual abschließen (API), Fokus-Sitzungen (Tabelle + API), `TodayView.ritualDoneAt`, die Ritual-Seite, der Low-Modus, der Timer.

## Entscheidungen

### Getroffen
- **Kein `GET /api/day`.** `TodayView` bekommt `ritualDoneAt` (ISO-Zeitstempel oder `null`); Energie und `rolledCount` stehen schon drin. Ritual und Low-Modus lesen nur `GET /api/today`.
- **Ritual-Ablauf** (`/ritual`): 1 Energie → 2 Rollover-Hinweis (nur wenn `rolledCount > 0`) → 3 Dump-Kurzeingabe (überspringbar) → 4+5 `TriageFlow` (Sortieren + Anker) → 6 Start. Bei `low` führt Schritt 6 in den Low-Modus (`/low`), bei `good` bietet er „Start Block 1“ (Timer) oder „Not now“ an. Schritt 6 schickt `POST /api/day/ritual-done`.
- **Automatischer Start:** Beim Öffnen von Today leitet die Seite einmal pro Tag auf `/ritual` um, solange `ritualDoneAt === null`. Wer das Ritual abbricht, kommt nicht nochmal dorthin (Merker in `localStorage` `ebb.ritual.skipped.<YYYY-MM-DD>`). Auf Today bleibt dann die Zeile „Start your day“.
- **Low-Vorschlag:** erste Muss-Aufgabe vor dem Anker vor der ersten Inbox-Aufgabe vor der ersten Block-Aufgabe (Block 1–4). „Choose another“ öffnet die Auswahl aus denselben Aufgaben.
- **Timer läuft im Client** über `startedAt` und `plannedMinutes` der Sitzung (`Date.now()`-Differenz, kein Zählen von Intervallen). Höchstens eine offene Sitzung pro Person; eine neue beendet die alte. Nach einem Reload holt `GET /api/focus/current` die laufende Sitzung zurück.
- **Kein Push in E3.** Läuft die Zeit bei offener Seite ab, zeigt der Timer eine `Notification` (Erlaubnis nur auf Klick) und schickt `stop`. Push bei geschlossener Seite kommt mit E9.
- **Dauer:** 25, 50, 90 oder frei (5–180 Minuten). Low-Modus: 10 Minuten.

### Offen
| # | Frage | Wer | Vorschlag | Betrifft |
|---|---|---|---|---|
| D1 | Soll das Ritual an Wochenenden auch automatisch starten? | Dion | Ja, gleich wie unter der Woche. Eine Einstellung dafür erst bei Bedarf. | E3-P2 |

## Datenmodell

`migrations/0030_focus.sql` (E3-P1): `focus_session (id, user_id default app.uid(), task_id null → task ON DELETE SET NULL, slot null|block1..4, planned_minutes 1–180, started_at default now(), ended_at null, CHECK ended_at >= started_at)`, partieller Unique-Index „eine offene Sitzung pro Person“, FORCE RLS, Policy `user_id = app.uid()` `TO ebb_app`, `DELETE` entzogen.

## API (E3-P1)

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| PUT | `/api/day/energy` | `{ energy: 'low' \| 'good' }` | `200 { date, energy }` |
| POST | `/api/day/ritual-done` | — | `200 { date, ritualDoneAt }` (erster Zeitpunkt bleibt) |
| GET | `/api/focus/current` | — | `200 FocusSession \| null` |
| POST | `/api/focus` | `{ plannedMinutes, taskId?, slot? }` | `201 FocusSession` (beendet eine offene) · `422 unknown_task` |
| POST | `/api/focus/:id/stop` | — | `200 FocusSession` (idempotent) · `404` fremd/unbekannt |

`FocusSession = { id, taskId, slot, plannedMinutes, startedAt, endedAt }` in `src/shared/schemas/focus.ts`. `DayEnergy`, `DayState` in `src/shared/schemas/day.ts`.

## Reihenfolge im Durchlauf

P1 (Kern, fertig) → **P4** Timer → **P2** Ritual → **P3** Low-Modus. P2 und P3 nutzen die Timer-Bausteine aus P4.

---

### E3-P1 · Energie, Ritual-Abschluss, Fokus-Sitzungen (API)

- **Ausführung:** Kern · **hängt ab von:** E2 · **gebaut von Claude**
- **Dateien:** `migrations/0030_focus.sql`, `src/shared/schemas/day.ts`, `src/shared/schemas/focus.ts`, `src/shared/schemas/task.ts` (`TodayView.ritualDoneAt`), `src/server/domain/day/day.ts`, `src/server/domain/focus/focus.ts`, `src/server/domain/tasks/views.ts`, `src/server/routes/day.ts`, `src/server/routes/focus.ts`, `src/server/app.ts`, `tests/day.test.ts`, `tests/focus.test.ts`, `tests/isolation.routes.ts`.
- **Akzeptanz:** API-Tabelle oben; Tests für Energie (setzen, wechseln, fremder Tag unberührt), Ritual (idempotent), Fokus (Start, Start beendet die alte, `current`, Stop idempotent, `unknown_task` auch für fremde Aufgaben, 404 für fremde Sitzung), `TodayView.ritualDoneAt`.

### E3-P4 · Web: Fokus-Timer

- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** anlegen `src/web/features/focus/api.ts`, `src/web/features/focus/FocusTimer.tsx`, `src/web/features/focus/StartFocusButton.tsx`, `src/web/features/focus/remaining.ts`, `locales/en/focus.json`, `tests/web/focus-remaining.test.ts`, `tests/web/focus-timer.test.tsx`; ändern `src/web/features/today/TaskList.tsx` (Start-Knopf im Kopf von Block 1–4), `src/web/features/today/TodayPage.tsx` (laufenden Timer oben anzeigen).
- **Auftrag:**
  1. `remaining.ts` (rein): `remainingMs(session: { startedAt: string; plannedMinutes: number }, now: number): number` (nie unter 0) und `formatClock(ms: number): string` → `MM:SS`, ab einer Stunde `H:MM:SS`.
  2. `api.ts`: `useCurrentFocus()` (Query-Key `['focus', 'current']`), `startFocus(input)`, `stopFocus(id)`; nach jeder Änderung `['focus']` invalidieren. Standarddauer aus `GET /api/settings` (`timerDefaultMin`), Hook `useTimerDefault()`.
  3. `FocusTimer`: zeigt die Restzeit in Atkinson Mono mit `tabular-nums` (Rolle Title), Knopf „Stop“. Aktualisierung alle 1 s über `setInterval`, berechnet aber immer aus `remainingMs(…, Date.now())`. Bei 0: einmal `stopFocus`, dann eine `Notification` („Time for a break“), wenn erlaubt; ohne Erlaubnis nur die ruhige Zeile im Timer. Kein Ton, kein Blinken.
  4. `StartFocusButton`: Props `slot?`, `taskId?`, `minutes?`. Ohne `minutes` ein kleines Menü 25 / 50 / 90 / Custom (5–180) mit dem Standard aus den Settings vorausgewählt. Beim ersten Start einmal `Notification.requestPermission()` (nur auf diesen Klick hin).
  5. Today: über dem Anker ein `FocusTimer`, solange eine Sitzung läuft. Im Kopf jedes Blocks mit Aufgaben ein `StartFocusButton` (`slot` = Block).
- **Akzeptanz:** `focus-remaining.test.ts`: Restzeit mit festem `now`, nie negativ, `formatClock` für 0, 59 s, 25 min, 90 min. `focus-timer.test.tsx` (Fake-Timers + jsdom): Restzeit springt nach 10 Minuten im Hintergrund korrekt (Uhr vorstellen, nicht Intervalle zählen); bei 0 wird `stopFocus` genau einmal aufgerufen. Screenshots Today mit laufendem Timer bei 390 (hell/dunkel). Design-Check grün.
- **Nicht tun:** keine Fortschrittsringe oder -balken (DESIGN §11); kein Countdown-Ton; keine Zeit im Server ticken lassen; `remainingMs` nicht in der Komponente duplizieren.

### E3-P2 · Web: Morgen-Ritual

- **Ausführung:** DeepSeek · **hängt ab von:** P1, P4
- **Dateien:** anlegen `src/web/features/ritual/RitualPage.tsx`, `src/web/features/ritual/EnergyStep.tsx`, `src/web/features/ritual/DumpStep.tsx`, `src/web/features/ritual/StartStep.tsx`, `src/web/features/ritual/api.ts`, `src/web/routes/ritual.tsx`, `locales/en/ritual.json`, `tests/web/ritual.test.tsx`, `e2e/ritual.spec.ts`; ändern `src/web/features/today/TodayPage.tsx` (Umleitung + Zeile „Start your day“).
- **Auftrag:**
  1. `api.ts`: `setEnergy(energy)` (`PUT /api/day/energy`), `finishRitual()` (`POST /api/day/ritual-done`), beide invalidieren `['today']`.
  2. `RitualPage`: Vollbild wie `/triage` (`fixed inset-0`, eine Frage pro Screen, Frage in der Rolle „Question“, Antworten unten als Flächen ≥ 56 px). Fortschritt oben als Tide-Linie (Muster aus `features/triage/ProgressLine.tsx` übernehmen oder importieren). `Esc` und „Leave“ brechen ab: Merker `ebb.ritual.skipped.<date>` setzen, zurück auf `/today`.
  3. Schritte: **Energie** („How much battery do you have today?“ → „Low“ / „Good“, `setEnergy`) → **Rollover** (`RolloverNote`, nur bei `rolledCount > 0`, Knopf „Continue“) → **Dump** (`DumpComposer` mit `useDumpSubmit()`, Knopf „Done“ oder „Skip“) → **Sortieren + Anker** (`TriageFlow` mit denselben Callbacks wie `TriagePage`, `onDone` geht zum nächsten Schritt statt nach `/today`) → **Start**: bei `low` sofort `finishRitual()` und weiter nach `/low`; bei `good` zwei Knöpfe „Start Block 1“ (`StartFocusButton` aus P4 mit `slot: 'block1'`, danach `finishRitual()` und `/today`) und „Not now“ (`finishRitual()`, `/today`).
  4. `TodayPage`: Ist `view.ritualDoneAt === null` und kein Merker für `view.date` gesetzt → `router.navigate({ to: '/ritual' })` (einmal, im Effekt). Ist `ritualDoneAt === null` und der Merker gesetzt → oben eine Zeile „Start your day“ mit Link auf `/ritual`.
- **Akzeptanz:** `ritual.test.tsx`: Energie „Low“ ruft `setEnergy('low')` und führt am Ende nach `/low`; ohne Rollover wird Schritt 2 übersprungen; „Leave“ setzt den Merker. `e2e/ritual.spec.ts`: frisches Konto → `/today` leitet auf `/ritual` → Good → Dump eine Zeile → Sortieren (eine Aufgabe „today“, Block 1) → Anker → „Not now“ → `/today` zeigt den Anker, erneutes Öffnen von `/today` leitet **nicht** mehr um. Höchstens 8 Klicks bei 2 Inbox-Aufgaben. Design-Check grün.
- **Nicht tun:** `TriageFlow` nicht kopieren oder ändern; kein zweites Sortier-UI; keine Schritt-Nummern („01/06“); kein Modal.

### E3-P3 · Web: Low-Energy-Modus

- **Ausführung:** DeepSeek · **hängt ab von:** P1, P4
- **Dateien:** anlegen `src/web/features/low/LowPage.tsx`, `src/web/features/low/pickLowTask.ts`, `src/web/routes/low.tsx`, `locales/en/low.json`, `tests/web/pick-low-task.test.ts`, `tests/web/low-page.test.tsx`; ändern `src/web/features/today/TodayPage.tsx` (Energie-Zeile wird Umschalter).
- **Auftrag:**
  1. `pickLowTask(view: TodayView): Task | null` (rein) nach der Regel oben.
  2. `LowPage`: oben Titel des Tages, darunter **eine** Aufgabe auf `--surface-2` (Radius 12), darunter die Tide-Linie, darunter nichts außer den Aktionen. Feld „First 10-minute step“ (speichert `nextStep` per `usePatchTask`, beim Verlassen des Felds). `StartFocusButton` mit `minutes: 10` und `taskId`. Knöpfe *Done* (Status `done`) und *Stop for today* (öffnet ein Feld „Where did you stop?“, speichert in `nextStep`, dann zurück nach `/today`). Nach *Done*: Zeile „Done. One more, or call it a day?“ mit „One more“ (nächste Aufgabe nach `pickLowTask`) und „Call it a day“ (`/today`). „Choose another“ öffnet die Auswahl (Sheet) aus denselben Kandidaten.
  3. Übergang: Die Aufgabe blendet ein (Opacity, Muster 1 aus DESIGN §7). Bei `prefers-reduced-motion` ohne Transform. Nichts unter der Linie.
  4. `TodayPage`: Die Energie-Zeile wird zu einem Umschalter „Low / Good“ (`setEnergy` aus P2; existiert P2 noch nicht, `PUT /api/day/energy` direkt über `apiFetch`). Bei `low` zusätzlich ein Link „Show one thing“ auf `/low`.
- **Akzeptanz:** `pick-low-task.test.ts`: alle Vorrang-Fälle und `null` bei leerem Tag. `low-page.test.tsx`: Done → „One more“ zeigt die nächste Aufgabe; „Stop for today“ speichert die Notiz als `nextStep`. Screenshots 390 hell/dunkel. Design-Check grün.
- **Nicht tun:** keine zweite Aufgabenliste im Low-Modus; kein Druck-Text („You can do it“); keine Zähler.
