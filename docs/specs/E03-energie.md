# E3 · Energie: Morgen-Ritual, Low-Energy-Modus, Fokus-Timer

Migrationsblock 0030–0039. PRD: F6, F7, Methode §5. **Vor Start am Code nachschärfen (Claude).**

## Ziel

Der Tag beginnt mit einer Frage statt mit einem Board. An Low-Energy-Tagen bleibt nur eine Aufgabe übrig, die Tide-Linie „ebbt“. Blöcke lassen sich mit Timer abarbeiten.

## Entscheidungen
- Das Ritual ist ein Ablauf über bestehende Bausteine: Energie-Check → Rollover-Hinweis → Dump-Kurzeingabe → Sortieren (E2-P9) → Anker → Block 1 starten. Kein zweites Sortier-UI.
- Das Ritual startet automatisch beim ersten Öffnen des Tages, solange `day_entry.ritual_done_at` leer ist. Abbrechen ist jederzeit möglich, dann bleibt „Start your day“ als Zeile auf Today.
- Low-Energy-Vorschlag: erste Muss-Aufgabe vor dem Anker vor der ersten Inbox-Aufgabe.
- Der Timer läuft im Client. Gespeichert werden nur Start und Ende (`focus_session`). Bei geschlossener Seite benachrichtigt erst E9 per Push.

## Wellen
A: P1 (Kern) → B: P2 ‖ P4 → C: P3

### E3-P1 · Migration und API: Energie, Ritual, Fokus
- **Ausführung:** Kern · **hängt ab von:** E2
- **Dateien:** `migrations/0030_energy_focus.sql` (`focus_session` + RLS), `src/server/routes/day.ts`, `src/server/domain/day/day.ts`, `src/server/routes/focus.ts`, `src/server/domain/focus/focus.ts`, `src/shared/schemas/day.ts`, Tests, `tests/isolation.routes.ts`.
- **Auftrag:** `PUT /api/day/energy { energy: 'low'|'good' }`, `POST /api/day/ritual-done`, `GET /api/day` (Energie, Ritual-Status, `rolledCount`). `POST /api/focus { taskId?, slot?, plannedMinutes }` → Session; `POST /api/focus/:id/stop`. Höchstens eine offene Session pro Person (eine neue beendet die alte). `PATCH /api/tasks/:id` erlaubt `nextStep` (≤ 280 Zeichen; prüfen, ob E2 das schon hat).
- **Akzeptanz:** Tests für jede Route, offene Session wird beim Neustart geschlossen, Isolation.

### E3-P2 · Web: Morgen-Ritual
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/web/features/ritual/*`, `src/web/routes/ritual.tsx`, `locales/en/ritual.json`, Komponententests.
- **Auftrag:** Ablauf wie oben, eine Frage pro Screen (DESIGN.md §5 „Ritual“), Tide-Linie als Fortschritt, Wiederverwendung von Sortieren und Anker-Wahl aus E2. Energie „low“ führt nach dem Anker direkt in den Low-Energy-Modus.
- **Akzeptanz:** Ritual in ≤ 8 Taps bei 2 Inbox-Aufgaben (Playwright). Abbruch und Wiedereinstieg. Design-Check grün.

### E3-P3 · Web: Low-Energy-Modus
- **Ausführung:** DeepSeek · **hängt ab von:** P1, P2
- **Dateien:** `src/web/features/low/*`, `src/web/routes/low.tsx`, `locales/en/low.json`.
- **Auftrag:** Screen nach PRD F6: eine Aufgabe auf `--surface-2` über der Tide-Linie, darunter nichts. Feld „First 10-minute step“ (speichert `nextStep`), Timer 10 min (Komponente aus P4), *Done* und *Stop for today* (Notiz → `nextStep`). Nach *Done*: „One more, or call it a day?“. Umschalter Low/Good jederzeit.
- **Akzeptanz:** Übergang Today → Low blendet alles unter der Linie aus (Opacity, bei reduzierter Bewegung ohne Transform). Screenshots 390 light/dark.

### E3-P4 · Web: Fokus-Timer
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/web/features/focus/*`, `locales/en/focus.json`, Test.
- **Auftrag:** Timer-Komponente (Atkinson Mono, `tabular-nums`), Dauer 25/50/90/frei, Start aus Block-Kopf und Low-Modus. Zeit über `Date.now()`-Differenz, nicht über Intervall-Zählen. Ende → `Notification` (Erlaubnis nur auf Klick erfragen), `POST /stop`. Kein Ton.
- **Akzeptanz:** Test mit Fake-Timers: Tab im Hintergrund verfälscht die Restzeit nicht.
