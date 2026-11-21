# E9 · Betrieb: Push, Export, Löschung, Deploy, Backups

Migrationsblock 0090–0099. PRD: F14, F17, §8, §11. **Vor Start am Code nachschärfen (Claude).**

## Entscheidungen
- Push über VAPID (`web-push`). Schlüssel aus ENV oder beim ersten Start erzeugt und in `instance_config` gespeichert.
- `reminders` läuft jede Minute per graphile-worker-Crontab und findet fällige Nutzer per SQL in Ortszeit (`now() AT TIME ZONE timezone`). `*_sent_on` verhindert Dopplungen, Ruhezeiten werden beachtet.
- Export synchron bis 10 MB, sonst Job + Download-Link (24 h gültig).
- Löschung: sofort abgemeldet und markiert, hart gelöscht nach 30 Tagen im Job `retention`.
- Backups: `pg_dump` täglich, verschlüsselt mit `age` (öffentlicher Schlüssel auf dem Server, privater offline bei Dion), offsite in der EU (Ziel offen, D1).

### Offen
| # | Frage | Wer | Vorschlag |
|---|---|---|---|
| D1 | Offsite-Ziel für Backups | Dion | Hetzner Storage Box oder Contabo Object Storage (EU) |
| D2 | Uptime-Monitor | Dion | Uptime Kuma auf einem anderen Host als der App |

## Wellen
A: P1 ‖ P4 ‖ P7 → B: P2 (Kern) ‖ P3 ‖ P5 (Kern) → C: P6 ‖ P8

### E9-P1 · Push-Grundlage
- **Ausführung:** DeepSeek · **hängt ab von:** E1-P9
- **Dateien:** `migrations/0090_push.sql` (`push_subscription`, `instance_config`), `src/server/push/*`, `src/server/routes/push.ts` (subscribe/unsubscribe, VAPID public key), `src/web/lib/push.ts`, `src/web/sw.ts` (`push`, `notificationclick`), Tests.
- **Akzeptanz:** Subscription wird gespeichert; 404/410 vom Push-Dienst → gelöscht (Fake). Klick öffnet die URL aus der Payload.

### E9-P2 · Erinnerungs-Job (Kern)
- **Ausführung:** Kern
- **Dateien:** `migrations/0091_reminder_state.sql` (`*_sent_on`-Spalten), `src/server/jobs/worker.ts`, `src/server/jobs/crontab`, `src/server/jobs/tasks/reminders.ts`, `send-push.ts`, Tests mit fester Uhr über Zeitzonen und Sommerzeit.
- **Auftrag:** Morgen-Ritual, Habits (pro Habit-Uhrzeit), Weekly Reset, Erledigungs-Tag, Timer-Ende (Push von E3-P4 aus), Trial endet. Texte über i18n in der Sprache des Nutzers.

### E9-P3 · Web: Erinnerungs-Einstellungen
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/web/routes/settings.notifications.tsx`, `src/web/features/settings/*`, `locales/en/settings.json`.

### E9-P4 · Export
- **Ausführung:** DeepSeek
- **Dateien:** `src/server/routes/export.ts`, `src/server/domain/export/*`, Tests.
- **Abhängigkeiten:** `fflate` (ZIP).
- **Akzeptanz:** ZIP enthält `data.json` und CSV pro Entität, nur eigene Daten und eigene/zugewiesene Aufgaben in geteilten Bereichen. Funktioniert auch ohne Zugriff (read-only).

### E9-P5 · Konto löschen und Aufbewahrung (Kern)
- **Ausführung:** Kern
- **Dateien:** `src/server/domain/users/delete.ts`, `src/server/jobs/tasks/retention.ts`, Routen, Web-Bestätigung, Tests.
- **Auftrag:** Laufendes Paddle-Abo vorher kündigen (API). Inaktivitäts-Warnungen nach 11 Monaten und 7 Tage vor Löschung, Löschung nach 12 Monaten ohne Zugriff und ohne Login.

### E9-P6 · Lasttest
- **Ausführung:** DeepSeek · **hängt ab von:** E2
- **Dateien:** `scripts/load/seed-users.ts`, `scripts/load/scenario.js` (k6), `docs/betrieb.md` (Abschnitt Lasttest).
- **Akzeptanz:** 5 000 Nutzer mit je 50 Aufgaben, Morgenspitze 100 req/s gemischt, p95 < 200 ms auf dem Ziel-VPS. Ergebnis mit Messwerten im Bericht; wird das Budget gerissen, Ursachen statt Optimierungen raten.

### E9-P7 · Produktion: Compose, Caddy, Backups
- **Ausführung:** DeepSeek
- **Dateien:** `docker-compose.prod.yml`, `docker/Caddyfile`, `docker/backup/*`, `docs/betrieb.md` (Deploy, Restore-Runbook).
- **Akzeptanz:** Restore aus einem Backup in eine leere Instanz klappt nach Runbook (Bericht mit Befehlen und Dauer). Ressourcenlimits gesetzt. Kein Port außer 80/443 offen.

### E9-P8 · Monitoring und Logs
- **Ausführung:** DeepSeek
- **Dateien:** `src/server/middleware/log.ts` (JSON-Logs ohne personenbezogene Daten im Pfad), `GET /api/health/deep` (DB, Worker-Lag), `docs/betrieb.md` (Uptime-Monitor, Alarmregeln).
