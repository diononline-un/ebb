# E5 · Projekte, Unteraufgaben, wiederkehrende Aufgaben, Erledigungen

Migrationsblock 0050–0059. PRD: F10, F11, F5 (Erledigungen). **Vor Start am Code nachschärfen (Claude).**

## Entscheidungen
- `task` bekommt `project_id`, `parent_id`, `recurrence_id`. Unteraufgaben nur eine Ebene tief (Domain + Test). Eine Unteraufgabe erbt Bereich und Projekt der Eltern-Aufgabe.
- Fortschritt = done ÷ (alle − skipped). Ein Projekt ohne Aufgaben hat `null`, nicht 0 %.
- Wiederkehrende Instanzen entstehen in `startDayIfNeeded` (E2-P3) nach dem Rollover, idempotent über `UNIQUE (recurrence_id, do_date)`.
- Monatlich am Tag 31 → im kürzeren Monat der letzte Tag.

## Wellen
A: P1 (Kern) ‖ P2 → B: P3 (Kern) ‖ P4 ‖ P5 → C: P6 ‖ P7 ‖ P8

### E5-P1 · Migration Projekte und Wiederholungen
- **Ausführung:** Kern · **hängt ab von:** E2
- **Dateien:** `migrations/0050_projects_recurrence.sql`, Schemas, Tests.
- **Auftrag:** `project`, `recurrence` + RLS (`app.is_member(space_id)`), `ALTER TABLE task ADD project_id, parent_id, recurrence_id` mit FKs (`ON DELETE SET NULL` für Projekt, `CASCADE` für Eltern-Aufgabe), `UNIQUE (recurrence_id, do_date)`. `project.goal_id` nur erlaubt, wenn Ziel und Bereich beide mir persönlich gehören (Trigger).

### E5-P2 · Reine Logik: Wiederholungsregeln
- **Ausführung:** DeepSeek · **hängt ab von:** —
- **Dateien:** `src/shared/recurrence.ts`, `tests/shared/recurrence.test.ts`.
- **Auftrag:** `occursOn(rule, startsOn: string, date: string): boolean` und `nextOccurrence(rule, startsOn, after: string): string` für `daily`, `weekdays`, `weekly` (Wochentage), `every_n_days` (Intervall ab `startsOn`), `monthly` (Tag N, Monatsende-Regel).
- **Akzeptanz:** Tabellentests inkl. Schaltjahr 2028-02-29, 31. in 30-Tage-Monaten, Intervall 3 über einen Monatswechsel, Sommerzeitwechsel (darf keinen Einfluss haben, da reine Kalendertage).

### E5-P3 · Instanzen beim Tagesbeginn
- **Ausführung:** Kern · **hängt ab von:** P1, P2
- **Dateien:** ändern `src/server/domain/day/start-day.ts`; Tests.
- **Auftrag:** Nach dem Rollover für jede aktive Regel, deren `assignee_id = ich` und `occursOn(today)` gilt: `INSERT … ON CONFLICT DO NOTHING`, dann `last_generated_on = today`.
- **Akzeptanz:** keine Dubletten bei parallelen Requests, verpasste Tage werden nicht nachgeholt.

### E5-P4 · API Projekte
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/server/routes/projects.ts`, `src/server/domain/projects/*`, Tests, Isolation.
- **Auftrag:** CRUD, Liste mit Fortschritt und Warnungen (`deadline_soon`: Deadline ≤ 3 Tage und < 100 %; `no_next_step`: aktiv, aber keine offene Aufgabe mit Do Date). Aufgaben eines Projekts.

### E5-P5 · API Unteraufgaben und Wiederholungen
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/server/routes/recurrences.ts`, `src/server/domain/recurrences/*`, ändern `src/server/domain/tasks/rules.ts` (`parentId`-Regeln), Tests, Isolation.
- **Auftrag:** `parentId` beim Anlegen/Ändern (Tiefe 1, gleicher Bereich), `GET /api/tasks/:id` liefert `subtasks` und `x/y`. CRUD für Wiederholungen. Eine Regeländerung wirkt erst ab der nächsten Instanz.

### E5-P6 · Web: Projekte
- **Ausführung:** DeepSeek · **hängt ab von:** P4
- **Dateien:** `src/web/features/projects/*`, `src/web/routes/projects*.tsx`, `locales/en/projects.json`.
- **Auftrag:** Liste (Fortschritt als Text „4 of 9 done“, kein Ring), Projektseite mit Aufgaben und Warnzeile, Projekt im TaskSheet wählbar.

### E5-P7 · Web: Unteraufgaben und Wiederholung im TaskSheet
- **Ausführung:** DeepSeek · **hängt ab von:** P5
- **Dateien:** `src/web/features/tasks/Subtasks.tsx`, `src/web/features/tasks/RecurrenceField.tsx`, `locales/en/tasks-extra.json`; ändern `TaskSheet.tsx` (nur Einbau).

### E5-P8 · Web: Erledigungen und Erledigungs-Tag
- **Ausführung:** DeepSeek · **hängt ab von:** E2
- **Dateien:** `src/web/features/errands/*`, `locales/en/errands.json`; ändern `src/web/features/plan/*` (Tab Errands verlinken).
- **Auftrag:** Liste offen / erledigt (letzte 7 Tage). Am eingestellten Erledigungs-Tag oben auf Today eine Zeile „Errand day: n errands“.
