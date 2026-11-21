# E6 · Weekly Reset

Migrationsblock 0060–0069. PRD: F12, Methode §5. **Vor Start am Code nachschärfen (Claude).**

## Entscheidungen
- Woche = 7 Tage ab `weekStart(today, weekly_reset_dow + 1)`. Der Reset blickt auf die Woche, die mit dem Reset-Tag endet.
- Dauerschieber: `status in (todo, doing)` und (`push_count >= 3` oder `created_at < heute − 14 Tage`), mir zugewiesen.
- Die Entscheidung über einen Dauerschieber setzt `push_count = 0` (neues Datum oder in Schritte zerlegt), `status = skipped` oder löscht die Aufgabe.
- Zahlen ohne Wertung, im Ton §9 („Anchor done on 4 of 7 days“).

## Wellen
A: P1 (Kern) → B: P2 → C: P3 → D: P4

### E6-P1 · Migration und Wochenzahlen
- **Ausführung:** Kern · **hängt ab von:** E4, E5
- **Dateien:** `migrations/0060_weekly_reset.sql`, `src/server/domain/reset/stats.ts`, Tests.
- **Auftrag:** `weekly_reset` + RLS. `weekStats(tx, weekStart)`: Anker erledigt pro Tag, erledigte Aufgaben, Habits pro Ziel (x/y), erledigte Aufgaben pro Projekt, Fokus-Minuten, Anzahl Rollover.

### E6-P2 · API Reset
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/server/routes/reset.ts`, `src/server/domain/reset/*`, Tests, Isolation.
- **Auftrag:** `GET /api/reset/current` (Woche, Schritt, Antworten, Stats, Dauerschieber, Ausblick 7 Tage mit Deadlines), `PATCH /api/reset/current` (Antworten, Schritt), `POST /api/reset/stuck/:taskId { decision: 'date'|'split'|'skip'|'delete', date? }`, `POST /api/reset/complete` (nur wenn keine Dauerschieber offen sind, sonst 422 `stuck_open`). `GET /api/reset/history`.

### E6-P3 · Web: Reset-Ablauf
- **Ausführung:** DeepSeek · **hängt ab von:** P2
- **Dateien:** `src/web/features/reset/*`, `src/web/routes/reset*.tsx`, `locales/en/reset.json`.
- **Auftrag:** 4 Schritte laut PRD F12, unterbrechbar. Dauerschieber eine Karte pro Aufgabe (Muster 2). „Split“ öffnet das TaskSheet mit Unteraufgaben. Am Reset-Tag eine Zeile auf Today „Weekly reset is ready“.

### E6-P4 · Web: frühere Wochen
- **Ausführung:** DeepSeek · **hängt ab von:** P3
- **Dateien:** `src/web/features/reset/History.tsx`.
