# E4 · Ziele, Habits, Onboarding

Migrationsblock 0040–0049. PRD: F2, F8, F9. **Vor Start am Code nachschärfen (Claude).**

## Ziel

Neue Nutzer kommen in unter 5 Minuten zu einem echten ersten Tag, mit 1–3 Zielen und 1–2 Habits. Das ist der wichtigste Hebel gegen Churn (Dions Vorgabe).

## Entscheidungen
- Ziele und Habits sind persönlich (`user_id`), nie in geteilten Bereichen.
- Habit-Woche: „x of y this week“. `daily` → y = Anzahl Tage (mit Wochentagen nur die gewählten), `weekly_count` → y = Ziel. Kein Streak.
- Abhaken für heute und gestern, ältere Tage sind gesperrt (422).
- Der Onboarding-Fortschritt steht in `user_settings.onboarding_step` (0–9). Fertig → `onboarding_done_at`. Ohne Abschluss leitet die App jede Route auf `/welcome` um.
- Habit-Vorschläge pro Ziel-Beispiel stehen als statische Liste in `locales/en/onboarding.json` (eigene Formulierungen).

## Wellen
A: P1 (Kern) → B: P2 → C: P3 ‖ P4 → D: P5 → E: P6

### E4-P1 · Migration Ziele und Habits
- **Ausführung:** Kern · **hängt ab von:** E2
- **Dateien:** `migrations/0040_goals_habits.sql`, `src/shared/schemas/goals.ts`, `src/shared/schemas/habits.ts`, Tests.
- **Auftrag:** `goal`, `habit`, `habit_log` laut Architektur, RLS `user_id = app.uid()`. `habit_log.user_id` per Trigger aus `habit` übernehmen (nicht vom Client). Höchstens 5 aktive Ziele (Trigger oder Domain, entscheiden und begründen).
- **Akzeptanz:** RLS-Tests, Grenze 5 Ziele.

### E4-P2 · API Ziele, Habits, Onboarding-Schritt
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/server/routes/goals.ts`, `src/server/routes/habits.ts`, `src/server/domain/goals/*`, `src/server/domain/habits/*`, `src/shared/habit-week.ts` (rein, mit Test), `src/server/routes/onboarding.ts`, Tests, Isolation.
- **Auftrag:** CRUD Ziele (Reihenfolge), CRUD Habits (archivieren statt löschen), `PUT /api/habits/:id/log/:date` und `DELETE …` (nur heute/gestern), `GET /api/habits/today` (fällige Habits + erledigt-Status + Wochenstand). `PUT /api/onboarding { step }`, `POST /api/onboarding/done`. `habitWeek(habit, logs, weekStart)` rein.
- **Akzeptanz:** Tests inkl. Wochenwechsel, Wochentags-Habits, Sperre für ältere Tage.

### E4-P3 · Web: Ziele
- **Ausführung:** DeepSeek · **hängt ab von:** P2
- **Dateien:** `src/web/features/goals/*`, `src/web/routes/goals*.tsx`, `locales/en/goals.json`.
- **Auftrag:** Liste der Ziele (More → Goals), Zielseite mit „Why“, Habits der Woche und (ab E5) offenen Projekten. Anlegen/Bearbeiten im Sheet.

### E4-P4 · Web: Habits
- **Ausführung:** DeepSeek · **hängt ab von:** P2
- **Dateien:** `src/web/features/habits/*`, `src/web/routes/habits*.tsx`, `locales/en/habits.json`; ändern `src/web/features/today/*` (nur Abschnitt „Habits today“ einfügen).
- **Auftrag:** Abschnitt auf Today (ein Tap = erledigt), Verwaltung unter More → Habits (Rhythmus, Wochentage, Ziel, Erinnerungszeit), Wochenstand „5 of 7 this week“ in Mono.

### E4-P5 · Web: Geführtes Onboarding
- **Ausführung:** DeepSeek · **hängt ab von:** P3, P4, E3-P2
- **Dateien:** `src/web/features/onboarding/*`, `src/web/routes/welcome.tsx`, `locales/en/onboarding.json`; ändern `src/web/routes/__root.tsx` (Umleitung).
- **Auftrag:** 9 Schritte laut PRD F2, eine Frage pro Screen, Tide-Linie als Fortschritt, jeder Schritt außer 1 mit „Skip“. Schritt 3 erlaubt höchstens 2 Habits. Schritte 4–7 nutzen Dump-, Sortier- und Anker-Komponenten aus E2. Schritt 8: Uhrzeiten und Push-Erlaubnis (die Push-Registrierung kommt in E9, hier nur Uhrzeiten speichern und den iOS-Hinweis zeigen). Zeitzone wird beim Start automatisch gesetzt (`Intl.DateTimeFormat().resolvedOptions().timeZone` → `PATCH /api/settings`).

### E4-P6 · E2E: Onboarding in ≤ 15 Taps
- **Ausführung:** DeepSeek · **hängt ab von:** P5
- **Dateien:** `e2e/onboarding.spec.ts`.
- **Akzeptanz:** Mit Vorschlägen in ≤ 15 Klicks auf Today, mit 1 Ziel, 1 Habit, 2 Aufgaben, Anker gesetzt. Abbruch nach Schritt 4 → Reload → wieder Schritt 4.
