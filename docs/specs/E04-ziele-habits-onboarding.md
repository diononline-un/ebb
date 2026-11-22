# E4 · Ziele, Habits, Onboarding

Migrationsblock 0040–0049. PRD: F2, F8, F9. Startprompt-Kopf: `AGENTS.md`.
**Nachgeschärft am Code `main@12f3e25` (2026-11-22).**

## Ziel

Neue Nutzer kommen in unter 5 Minuten zu einem echten ersten Tag, mit 1–3 Zielen und 1–2 Habits. Das ist der wichtigste Hebel gegen Churn (Dions Vorgabe).

## Ist-Stand (geprüft am Code)

**Gibt es schon, nur wiederverwenden:**

| Baustein | Wo | Nutzen in E4 |
|---|---|---|
| `user_settings.onboarding_step` (0–9), `onboarding_done_at` | `migrations/0003_spaces_users.sql` | Fortschritt des Onboardings, keine neue Tabelle |
| `SettingsPatch` (`timezone`, `morningReminder`, `weeklyResetDow`, `weeklyResetTime`) | `src/shared/schemas/settings.ts`, `PATCH /api/settings` | Schritt 8 speichert Uhrzeiten, Schritt 1 die Zeitzone |
| `GET /api/me` (`settings`, `trialEndsAt`, `personalSpaceId`) | `src/server/domain/users/me.ts`, `src/server/app.ts` | Onboarding-Umleitung liest `settings.onboardingDoneAt` |
| `space` + `space_member` + `app.uid()`-Policies als Vorlage | `migrations/0003_spaces_users.sql` | RLS-Muster für `goal`, `habit`, `habit_log` |
| `TaskError` (Status + Code) und `applyRules` | `src/server/domain/tasks/rules.ts` | Muster für Regelcodes (`too_many_goals`) |
| `Sheet`, `Button`, `Input`, `Checkbox`, `TideLine`, `Menu` | `src/web/ui/` | Formulare, Abhaken, Fortschritt |
| `DumpComposer` + `useDumpSubmit`, `TriageFlow`, `AnchorBlock`, `useToday` | `src/web/features/` | Onboarding-Schritte 4–7 **unverändert** |
| `More`-Seite (`/more`) und Leiste | `src/web/routes/more.tsx`, `features/shell/AppShell.tsx` | Einstieg Ziele und Habits |
| `todayOf(c)` | `src/server/middleware/day-start.ts` | „heute“/„gestern“ bei Habit-Logs |

**Fehlt, wird gebaut:** `goal`, `habit`, `habit_log`, ihre API, `habitWeek`, die Ziel- und Habit-Seiten, der Abschnitt „Habits today“, das Onboarding samt Umleitung.

## Entscheidungen

### Getroffen
- **Grenze von 5 aktiven Zielen im Domain, nicht per Trigger.** Der Code muss eine übersetzbare Antwort sein (`422 too_many_goals`), und der Zähler läuft ohnehin in derselben Transaktion. Ein Trigger könnte nur einen Postgres-Fehler werfen, den die Route wieder übersetzen müsste. Muster: `TaskError`.
- **`habit_log.user_id` kommt aus `habit`.** Ein `BEFORE INSERT`-Trigger setzt `NEW.user_id` aus der Regel; der Client kann es nicht setzen, die Policy prüft zusätzlich `user_id = app.uid()`.
- **Habit-Woche** (`habitWeek(habit, logs, weekStart)` rein in `src/shared/habit-week.ts`): `x` = Logs in dieser Woche, `y` = 7 bei `daily` ohne Wochentage, sonst Anzahl der gewählten Wochentage dieser Woche, bei `weekly_count` = `weekly_target`. Wochentage `0`–`6` (0 = Sonntag, wie `weekStart`).
- **Nachtragen nur heute und gestern**, ältere Tage antworten `422 day_locked` (PRD F9).
- **Habits archivieren statt löschen** (`archived_at`); archivierte fallen aus `GET /api/habits/today` und aus der Woche.
- **Onboarding-Umleitung in `src/web/routes/__root.tsx`** (RootLayout): Query `['me']`, solange `settings.onboardingDoneAt === null` und der Pfad nicht `/welcome` ist → `/welcome`. `POST /api/onboarding/done` invalidiert `['me']`. Kein neuer Endpunkt, keine Umleitung in `beforeLoad` (die hat keinen Query-Cache und würde pro Navigation fragen).
- **Ziel-Seite zeigt den Wochenstand der Habits.** Der Projektblock kommt mit E5-P6 dazu.
- **Habits auf Today** stehen zwischen Erledigungen und „Erledigt heute“ (DESIGN §5).

### Offen
| # | Frage | Wer | Vorschlag | Betrifft |
|---|---|---|---|---|
| D1 | Sollen Ziele auch in geteilten Bereichen sichtbar sein? | Dion | Nein, persönlich wie PRD F8 sagt; geteilte Arbeit läuft über Projekte (E7). | E4-P1 |

## Datenmodell

`migrations/0040_goals_habits.sql` (E4-P1):
- `goal (id uuid pk, user_id text default app.uid() → user ON DELETE CASCADE, title 1–80, why ≤ 280 default '', status 'active'|'paused'|'done' default 'active', position int ≥ 0 default 0, created_at)`
- `habit (id uuid pk, user_id default app.uid(), goal_id uuid null → goal ON DELETE SET NULL, name 1–80, cadence 'daily'|'weekly_count', weekly_target int null CHECK 1–7, weekdays int[] null, reminder_time time null, position int ≥ 0, archived_at timestamptz null, created_at)`
- `habit_log (habit_id uuid → habit ON DELETE CASCADE, user_id text NOT NULL, date date, created_at, PK (habit_id, date))`
- Alle drei: `ENABLE` + `FORCE ROW LEVEL SECURITY`; `goal` und `habit` mit Policies `user_id = app.uid()` für `SELECT/INSERT/UPDATE`, `DELETE` nur auf `habit_log` und `goal`; `habit` wird archiviert statt gelöscht.
- Constraints: `CHECK (char_length(title) BETWEEN 1 AND 80)`, `CHECK (char_length(why) <= 280)`, `CHECK (cadence <> 'weekly_count' OR weekly_target IS NOT NULL)`, `CHECK (weekdays IS NULL OR (weekdays <@ '{0,1,2,3,4,5,6}'::int[] AND cardinality(weekdays) BETWEEN 1 AND 7))`.

## API (E4-P2)

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| GET | `/api/goals` | — | `200 Goal[]` (Reihenfolge `position, created_at`) |
| POST | `/api/goals` | `{ title, why?, status? }` | `201 Goal` · `422 too_many_goals` |
| PATCH | `/api/goals/:id` | `{ title?, why?, status?, position? }` | `200 Goal` · `404` |
| DELETE | `/api/goals/:id` | — | `204` · `404` |
| GET | `/api/habits` | — | `200 Habit[]` (aktive zuerst) |
| POST | `/api/habits` | `{ name, goalId?, cadence, weeklyTarget?, weekdays?, reminderTime? }` | `201 Habit` |
| PATCH | `/api/habits/:id` | Felder + `archived: true` | `200 Habit` · `404` |
| PUT | `/api/habits/:id/log/:date` | — | `200 HabitDay` · `422 day_locked` |
| DELETE | `/api/habits/:id/log/:date` | — | `204` · `422 day_locked` |
| GET | `/api/habits/today` | — | `200 { date, habits: HabitToday[] }` |
| PUT | `/api/onboarding` | `{ step }` | `200 { step }` |
| POST | `/api/onboarding/done` | — | `200 { onboardingDoneAt }` |

`Goal`, `Habit`, `HabitDay`, `HabitToday = Habit & { doneToday, week: { done, target } }` in `src/shared/schemas/goals.ts` und `habits.ts`. `habitWeek` in `src/shared/habit-week.ts`.

## Reihenfolge im Durchlauf

P1 (Migration) → P2 (API, inkl. `habitWeek`) → P3 und P4 → P5 (Onboarding) → P6 (E2E).

---

### E4-P1 · Migration Ziele und Habits
- **Ausführung:** Kern · **hängt ab von:** E2
- **Dateien:** `migrations/0040_goals_habits.sql`, `src/shared/schemas/goals.ts`, `src/shared/schemas/habits.ts`, `tests/goals-schema.test.ts`.
- **Auftrag:** Tabellen, Trigger für `habit_log.user_id`, RLS-Policies, Constraints laut Datenmodell.
- **Akzeptanz:** RLS-Tests (fremde Ziele, Habits und Logs unsichtbar; `ebb_app` kann `user_id` nicht fälschen), `habit_log.user_id` kommt aus `habit`, `weekly_target` nur bei `weekly_count`, Wochentage nur 0–6.

### E4-P2 · API Ziele, Habits, Onboarding-Schritt
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** anlegen `src/server/routes/goals.ts`, `src/server/routes/habits.ts`, `src/server/routes/onboarding.ts`, `src/server/domain/goals/goals.ts`, `src/server/domain/habits/habits.ts`, `src/shared/habit-week.ts`, `tests/goals.test.ts`, `tests/habits.test.ts`, `tests/shared/habit-week.test.ts`; ändern `src/server/app.ts` (Routen registrieren), `tests/isolation.routes.ts`.
- **Auftrag:** Routen über die Helfer aus `routes/http.ts` und `withUser`; `GoalError`/`HabitError` mit übersetzbaren Codes. `GET /api/habits/today` liefert die fälligen Habits (Wochentag passt; bei `weekly_count` offen oder heute schon erledigt), `doneToday` und den Wochenstand aus `habitWeek`. `PUT`/`DELETE …/log/:date` nur heute und gestern.
- **Akzeptanz:** CRUD, 5-Ziele-Grenze mit `too_many_goals`, `habitWeek` als Tabellentest (Wochentags-Habits, `weekly_count`, Wochenwechsel), Sperre für ältere Tage, `archived: true` fällt aus `today`, Isolationseinträge für alle Pfade mit ID.

### E4-P3 · Web: Ziele
- **Ausführung:** DeepSeek · **hängt ab von:** P2
- **Dateien:** anlegen `src/web/features/goals/api.ts`, `src/web/features/goals/GoalsPage.tsx`, `src/web/features/goals/GoalSheet.tsx`, `src/web/features/goals/GoalPage.tsx`, `src/web/routes/goals.tsx`, `src/web/routes/goals.$goalId.tsx`, `locales/en/goals.json`, `tests/web/goal-sheet.test.tsx`; ändern `src/web/routes/more.tsx` (Eintrag Goals).
- **Auftrag:** Liste mit dem Wochenstand der zugehörigen Habits, Anlegen und Bearbeiten im `Sheet`, Ziel-Seite mit „Why“ und den Habits dieser Woche. Kein Ring, kein Balken, kein Prozentwert.
- **Akzeptanz:** `goal-sheet.test.tsx` (anlegen, bearbeiten, `too_many_goals` als ruhige Zeile), Design-Check grün.

### E4-P4 · Web: Habits
- **Ausführung:** DeepSeek · **hängt ab von:** P2
- **Dateien:** anlegen `src/web/features/habits/api.ts`, `src/web/features/habits/HabitsToday.tsx`, `src/web/features/habits/HabitsPage.tsx`, `src/web/features/habits/HabitSheet.tsx`, `src/web/routes/habits.tsx`, `locales/en/habits.json`, `tests/web/habits-today.test.tsx`; ändern `src/web/features/today/TodayPage.tsx` (Abschnitt „Habits today“ über „Erledigt heute“), `src/web/routes/more.tsx` (Eintrag Habits).
- **Auftrag:** Ein Tap hakt heute ab (optimistisch), ein zweiter nimmt es zurück; Gestern lässt sich in der Verwaltung nachtragen; Wochenstand „5 of 7 this week“ in Mono. Verwaltung: Rhythmus, Wochentage, Ziel, Erinnerungszeit, Archivieren.
- **Akzeptanz:** `habits-today.test.tsx` (Tap setzt Log, zweiter Tap nimmt zurück, archivierte Habit fehlt), Design-Check grün.

### E4-P5 · Web: Geführtes Onboarding
- **Ausführung:** DeepSeek · **hängt ab von:** P3, P4, E3-P2
- **Dateien:** anlegen `src/web/features/onboarding/OnboardingPage.tsx`, `src/web/features/onboarding/GoalsStep.tsx`, `src/web/features/onboarding/HabitsStep.tsx`, `src/web/features/onboarding/FinishStep.tsx`, `src/web/features/onboarding/api.ts`, `src/web/routes/welcome.tsx`, `locales/en/onboarding.json`, `tests/web/onboarding.test.tsx`; ändern `src/web/routes/__root.tsx` (Umleitung auf `/welcome`).
- **Auftrag:** 9 Schritte laut PRD F2, eine Frage pro Screen, Tide-Linie als Fortschritt; Schritte 4–7 mit `DumpComposer`, `TriageFlow` und `AnchorBlock`; Schritt 3 lässt höchstens 2 Habits zu; Schritt 8 speichert Uhrzeiten (`PATCH /api/settings`) und zeigt den iOS-Hinweis; Schritt 1 setzt die Zeitzone. Jeder Schritt außer 1 hat „Skip“; der Schritt wird gespeichert, damit es beim nächsten Öffnen dort weitergeht.
- **Akzeptanz:** `onboarding.test.tsx` (Schritt speichern, Skip, 2-Habit-Grenze, Abschluss invalidiert `['me']`), Design-Check grün.

### E4-P6 · E2E: Onboarding in ≤ 15 Taps
- **Ausführung:** DeepSeek · **hängt ab von:** P5
- **Dateien:** `e2e/onboarding.spec.ts`.
- **Akzeptanz:** frisches Konto landet auf `/welcome`, mit den Vorschlägen in ≤ 15 Klicks auf `/today` mit 1 Ziel, 1 Habit, 2 Aufgaben und Anker; Abbruch nach Schritt 4, Reload → wieder Schritt 4.
