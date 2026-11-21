# E8 · Trial, Abo, Sitze, Self-Host-Modus

Migrationsblock 0080–0089. PRD: F15, F16, §9. **Vor Start am Code nachschärfen (Claude).**

## Entscheidungen
- Paddle Billing als Merchant of Record. Sandbox in Dev/CI, Live nur in Produktion. Price-IDs ausschließlich über ENV: `PADDLE_PRICE_FOUNDER`, `PADDLE_PRICE_STANDARD`, `PADDLE_PRICE_SEAT`, `PRICE_BASE_ACTIVE=founder|standard`.
- `TRIAL_REQUIRES_CARD=false` zum Start. Bei `true` startet der Trial über einen Paddle-Checkout mit Trial-Zeitraum, und `user_access.trial_ends_at` bleibt leer.
- Webhook: speichern + 200, verarbeiten im Job (Reihenfolge über `occurred_at`, Idempotenz über `event_id`).
- Sitze: Zahlende decken Mitglieder ihrer geteilten Bereiche ab, Obergrenze `MAX_EXTRA_SEATS=5`. Eine Person sitzt auf höchstens einem Abo. Wer ein eigenes Abo hat, braucht keinen Sitz.
- Ohne Zugriff: Lesen, Export, Konto löschen und Abo abschließen gehen. Alles andere → `402 subscription_required`.
- `APP_MODE=selfhost`: Billing-Routen sind nicht registriert, `hasAccess` ist immer wahr, `REGISTRATION=open|invite|closed`, der erste Nutzer wird Instanz-Admin.

## Wellen
A: P1 ‖ P2 (Kern) → B: P3 (Kern) ‖ P4 → C: P5 ‖ P6 (Kern) ‖ P7 → D: P8

### E8-P1 · Reine Logik: Zugriff
- **Ausführung:** DeepSeek
- **Dateien:** `src/shared/entitlement.ts`, `tests/shared/entitlement.test.ts`.
- **Auftrag:** `hasAccess(facts: { mode, now, trialEndsAt, ownSub?, seatSub? }): { access: boolean; reason: 'selfhost'|'trial'|'own'|'seat'|'none' }` laut Architektur.
- **Akzeptanz:** Tabellentest aller Kombinationen, inkl. `past_due`, `canceled` mit Laufzeit-Ende in der Zukunft (Zugriff bis Periodenende).

### E8-P2 · Webhook und Ereignisspeicher (Kern)
- **Ausführung:** Kern
- **Dateien:** `migrations/0080_billing.sql`, `src/server/billing/webhook.ts`, `src/server/billing/signature.ts`, Tests mit echten Beispiel-Payloads aus der Paddle-Doku.
- **Akzeptanz:** falsche oder alte Signatur (> 5 min) → 401; doppeltes Event → einmal gespeichert; Body > 1 MB → 413.

### E8-P3 · Ereignisverarbeitung (Kern)
- **Ausführung:** Kern
- **Dateien:** `src/server/jobs/tasks/paddle-event.ts`, `src/server/billing/apply.ts`, Tests.
- **Auftrag:** `subscription.created|updated|canceled|past_due|activated`, `transaction.completed` → `subscription`, `subscription_seat` aktualisieren. Zuordnung zum Nutzer über `custom_data.userId`.

### E8-P4 · Middleware und Read-only-UI
- **Ausführung:** DeepSeek · **hängt ab von:** P1
- **Dateien:** `src/server/middleware/entitlement.ts`, `src/server/domain/users/access.ts`, ändern `GET /api/me` (Feld `access`), `src/web/features/billing/ReadOnlyBanner.tsx`, `locales/en/billing.json`, Tests.
- **Akzeptanz:** Jede schreibende Route liefert ohne Zugriff 402 (Test über `app.routes`, Ausnahmen als Liste). Banner ruhig, eine Zeile, Link „Subscribe“.

### E8-P5 · Checkout und Abo-Seite
- **Ausführung:** DeepSeek · **hängt ab von:** P3
- **Dateien:** `src/web/routes/billing.tsx`, `src/web/features/billing/*`, `src/server/routes/billing.ts` (Preise, Portal-Link).
- **Auftrag:** Paddle.js nur auf dieser Seite laden (CSP-Ausnahme dokumentieren). Founder-Hinweis, solange `PRICE_BASE_ACTIVE=founder`. Link zum Paddle-Kundenportal.

### E8-P6 · Sitze verwalten (Kern)
- **Ausführung:** Kern
- **Dateien:** `src/server/billing/seats.ts`, `src/server/billing/paddle.ts` (API-Client), Routen, Web-Abschnitt in `features/billing`, Tests mit Paddle-Fake.
- **Auftrag:** Mitglied abdecken/freigeben → Menge per API ändern (`prorated_immediately`). Der lokale Zustand ändert sich erst mit dem Webhook. UI zeigt „pending“.

### E8-P7 · Self-Host-Modus
- **Ausführung:** DeepSeek · **hängt ab von:** P1, P4
- **Dateien:** `src/server/cli.ts` (`reset-password`, `create-admin`), Registrierungs-Modi in `auth.ts` (Hook), `docker-compose.selfhost.yml`, `docs/selfhost.md`, Tests.
- **Akzeptanz:** Mit `REGISTRATION=closed` schlägt eine Registrierung fehl (außer der allerersten). CLI-Reset funktioniert ohne SMTP. Die 5-Minuten-Anleitung läuft auf einer frischen VM (Bericht).

### E8-P8 · Trial-Mails
- **Ausführung:** DeepSeek · **hängt ab von:** P3, E6-P1 (Wochenzahlen für den Wertbeleg)
- **Dateien:** `src/server/jobs/tasks/trial-mails.ts`, Mail-Vorlagen, Tests.
- **Auftrag:** 2 Tage vor Ende (mit „your week so far“), am Ende. Einmalig pro Konto (Flag in `user_access`).
