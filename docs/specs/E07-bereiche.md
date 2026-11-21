# E7 · Geteilte Bereiche

Migrationsblock 0070–0079. PRD: F13. **Vor Start am Code nachschärfen (Claude).** Muss zum Launch rein.

## Entscheidungen
- Einladung per Link: Token = 32 Byte zufällig, nur der SHA-256-Hash in der DB, 7 Tage gültig, einmal nutzbar. Optional mit E-Mail-Versand. Annahme nur über `app.accept_invite(token text)` (SECURITY DEFINER): prüft Hash, Ablauf und Nutzung, legt die Mitgliedschaft an.
- Rollen `owner` | `member`. Der Owner kann den Bereich nicht verlassen, nur löschen oder (später) übertragen.
- Wer austritt oder entfernt wird: Seine zugewiesenen Aufgaben im Bereich werden „nicht zugewiesen“, Planungsfelder zurückgesetzt (`slot inbox`, `must/anchor false`).
- „Übernehmen“ setzt `assignee_id = ich` (nur wenn nicht zugewiesen, sonst 409).
- Planungsfelder (Slot, Muss, Anker, Do Date) darf nur die zuständige Person ändern (Domain-Regel + Test).
- Abrechnung der Sitze: E8 (Mitglied sein ≠ abgedeckt sein).

## Wellen
A: P1 (Kern) → B: P2 ‖ P3 → C: P4 ‖ P5 → D: P6 (Kern)

### E7-P1 · Einladungen und Beitritt (Kern)
- **Ausführung:** Kern · **hängt ab von:** E2
- **Dateien:** `migrations/0070_invites.sql` (`app.accept_invite`, Policies für `space_invite`), `src/server/domain/spaces/invites.ts`, `src/server/routes/spaces.ts` (Bereich anlegen, Einladung erstellen/widerrufen, annehmen), Tests, Isolation.
- **Akzeptanz:** abgelaufenes, benutztes oder falsches Token → 404 (gleiche Antwort, kein Unterschied erkennbar). Zweimal annehmen → Mitglied genau einmal. Token taucht nie in Logs auf.

### E7-P2 · Mitglieder verwalten
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/server/domain/spaces/members.ts`, Erweiterung `routes/spaces.ts`, Tests, Isolation.
- **Auftrag:** Liste, entfernen (Owner), austreten (Member), Bereich umbenennen/löschen (Owner, Löschen nur mit Bestätigungsname). Entfernen und Austreten setzen Aufgaben zurück (Regel oben).

### E7-P3 · Zuweisen und Übernehmen
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** ändern `src/server/domain/tasks/rules.ts`, `src/server/domain/tasks/views.ts`; neu `POST /api/tasks/:id/claim`, `PATCH assigneeId`; `GET /api/spaces/:id/tasks?filter=unassigned|all`; Tests.
- **Auftrag:** Today und Plan zeigen Aufgaben aus allen Bereichen, die mir zugewiesen sind, mit Bereichsnamen in der Meta-Zeile.

### E7-P4 · Web: Bereiche verwalten und Einladung annehmen
- **Ausführung:** DeepSeek · **hängt ab von:** P2
- **Dateien:** `src/web/features/spaces/*`, `src/web/routes/spaces*.tsx`, `src/web/routes/join.$token.tsx`, `locales/en/spaces.json`.
- **Auftrag:** Liste, anlegen, einladen (Link kopieren, Teilen-API auf Mobil), Mitglieder, austreten/entfernen. Join-Seite: Bereichsname + „Join“, ohne Konto zuerst Registrierung, danach zurück.

### E7-P5 · Web: Bereich, Zuständige Person, Übernehmen
- **Ausführung:** DeepSeek · **hängt ab von:** P3
- **Dateien:** `src/web/features/tasks/SpaceField.tsx`, `AssigneeField.tsx`, `src/web/features/spaces/Unassigned.tsx`; ändern `TaskSheet.tsx` (nur Einbau).

### E7-P6 · Adversary-Tests Bereiche (Kern)
- **Ausführung:** Kern · **hängt ab von:** P1–P3
- **Dateien:** `tests/adversary/spaces.test.ts`.
- **Auftrag:** Ex-Mitglied sieht nach dem Entfernen nichts mehr. Member kann Owner-Aktionen nicht ausführen. Fremde können keine Aufgaben in Bereiche legen, in denen sie nicht Mitglied sind (direkte `space_id` im Body). `app.accept_invite` ist gegen Timing nicht trivial angreifbar (konstante Vergleichszeit über Hash-Lookup).
