# Handoff — Stand E4 bis E7 (2026-11-22/23)

Einmal lesen, dann übernehmen und löschen. Alles Weitere steht in Git und in den Specs.

## Wo der Stand liegt

- `main` = Review-Stand nach E3 (`12f3e25`).
- **`ds/e5`** (gepusht) trägt einen Stapel: E4 komplett, dann E5 (Kern + API + Web), E6 (Kern + API), E7-P1/P2. Der Branch enthält die E4-Commits, weil E5 auf E4 aufsetzt; ein Merge nach `main` nimmt alles mit.
- **`ds/e6-web`** (Subagent) bringt E6-P3/P4 (Reset-Ablauf, frühere Wochen) und wird nach `ds/e5` gepickt.
- Verifikation auf `ds/e5`: `npm run check` 0 Fehler · `npx vitest run` 447 Tests grün (44 Dateien) · `npx playwright test` 8 grün · `python3 scripts/check-design.py` sauber (172 Dateien). Entwicklungsdatenbank und `ebb_test` wurden neu aufgebaut (`migrations/0001`–`0071`).

## Fertig

**E4 Ziele, Habits, Onboarding** (P1–P6): `0040_goals_habits.sql` (goal, habit, habit_log, Trigger für `habit_log.user_id`, Archivieren statt Löschen), `/api/goals`, `/api/habits` (+`/today`, Logs nur heute/gestern), `/api/onboarding`, `shared/habit-week.ts`, Seiten `/goals`, `/goals/:id`, `/habits`, „Habits today“ auf Today, `/welcome` mit neun Schritten und Umleitung aus `__root.tsx`, `e2e/onboarding.spec.ts` (15 Klicks). Entscheidung: Abschluss des Onboardings zählt als Ritual des ersten Tages.

**E5 Projekte, Unteraufgaben, Wiederholungen, Erledigungen** (P1–P8): `0050_projects_recurrence.sql` (project, recurrence, `task.project_id/parent_id/recurrence_id`, Teilindex pro Regel und Tag, Trigger für Ziel-im-persönlichen-Bereich und Unteraufgaben-Tiefe), `/api/projects` (Fortschritt done/(alle−skipped), Warnungen `deadline_soon`, `no_next_step`), `/api/recurrences`, Instanzen beim Tagesbeginn, `GET /api/tasks/:id` → `{ task, subtasks, progress }`, Seiten `/projects`, `/projects/:id`, Sheet mit Unteraufgaben und Wiederholung, Seite `/errands`.

**E6 Weekly Reset** (P1–P4): `0060_weekly_reset.sql`, `domain/reset/stats.ts` (Woche endet am Reset-Tag; Anker-Tage, erledigte Aufgaben, Habits-Wochenstand, Projekte, Fokus-Minuten, Rollover; Dauerschieber `push_count >= 3` oder älter 14 Tage; Ausblick 7 Tage), `/api/reset/{current,stuck/:id,complete,history}`. P3/P4: Seite `/reset` mit vier Schritten (Rückblick, Zahlen, Dauerschieber mit vier Entscheidungen, Ausblick), `/reset/history`, Zeile „Weekly reset is ready“ auf Today am Reset-Tag.

**E7 Geteilte Bereiche** (P1–P6, komplett): `0070_invites.sql` und `0071_space_members.sql` — `app.create_shared_space`, `app.accept_invite` (Token 32 Byte, nur SHA-256 in der DB, 7 Tage, einmal), `app.leave_space`, `app.remove_member` (Aufgaben der Person werden „niemand“, Planungsfelder zurück), `app.space_members`; `/api/spaces` mit anlegen, umbenennen, löschen (nur mit getipptem Namen), Mitglieder, entfernen, verlassen, einladen, widerrufen, `/join`.
P3: `assigneeId` in Aufgabe anlegen/ändern (422 `assignee_not_member`), `POST /api/tasks/:id/claim` (409 `already_assigned`), Planungsfelder einer geteilten Aufgabe nur für die zuständige Person (403 `not_your_plan`), `GET /api/spaces/:id/tasks?filter=unassigned|all`, und `TodayView`/`TaskListView` nennen die Bereiche ihrer Aufgaben (`spaces`).

**E8** (P1–P3): `src/shared/entitlement.ts` mit `hasAccess` — selfhost immer, laufender Trial, eigenes Abo oder Sitz; `past_due` und `canceled` bis Periodenende, `paused` nicht (16 Tabellenfälle). `0080_billing.sql` (`billing_event`, `subscription`, `subscription_seat`), `billing/signature.ts` (Paddle-Signatur, 5-Minuten-Fenster, timingSafeEqual), `POST /api/billing/webhook` (413 über 1 MB, 401 bei falscher/alter Signatur, speichert einmal, 503 ohne Secret), `billing/apply.ts` schreibt Abo und Sitze. Billing-Variablen in `env.ts` und `.env.example`.

**E9-P4 Export** (siehe oben) ist fertig.

## Offen, in dieser Reihenfolge

1. **E6-P3/P4 Web** (Subagent) — nach `ds/e5` picken, dann `npm run check`, `npx vitest run tests/web`, Design-Check, `npx playwright test`.
2. **E7-P6 Adversary-Tests** (Bereichsfremder, Owner-Rechte, Planfelder einer fremden Aufgabe) — die Web-Seiten dazu sind fertig: `/spaces`, `/spaces/:id`, `/join/:token`, Bereich/Feld im TaskSheet, „Nobody took yet“ mit Übernehmen. Offen aus P5: die Plan-Seite zeigt noch keine Bereichsnamen.
4. **E8 Rest**: P4 ist fertig (402 auf allen schreibenden Routen, `access` in `GET /api/me`, ruhige Read-only-Zeile in der Shell; Ausnahmen Auth/Billing/Export/Konto/Settings). Offen: P6 Sitze (Sitz anlegen/entfernen, Abdeckung der Bereichsmitglieder), P7 Self-Host-Modus, P8 Trial-Mails. Der Ereignis-Job ist fertig (`src/server/jobs/billing.ts`, `processBillingEvents`, alle 30 s im Server, nicht im Selfhost): Ereignisse in `occurred_at`-Reihenfolge, je Event eine Transaktion, `processed_at`/`failed_at`. Getestet in `tests/jobs-billing.test.ts`. **P5 Checkout/Seite braucht Entscheidungen (siehe Blocker).**
5. **E9 Betrieb**: P1 Push-Grundlage (VAPID), P2 Erinnerungs-Job, P3 Web-Einstellungen, P4 Export, P5 Kontolöschung, P6 Lasttest, P7 Compose/Caddy/Backups, P8 Monitoring — alle baubar, P7/P8 sind Doku + Konfiguration.
6. **E10 Launch**: P1 Übersetzungs-Skript/Pseudo-Locale, P5 PWA-Feinschliff, P6 Produkt-Events sind baubar. **P2 Übersetzungen, P3 Rechtsseiten, P4 Landingpage hängen an Entscheidungen (siehe Blocker).**

## Blocker (Entscheidung von Dion nötig, nicht durch Code lösbar)

1. **E8-P5 Checkout und Abo-Seite:** Paddle-Sandbox-Zugang (API-Key, Webhook-Secret), Preis-IDs für Grundtarif und Sitz, Währung/Intervall. Ohne die ist nur die Attrappe möglich.
2. **E10-P3 Rechtsseiten:** Impressum und Datenschutz brauchen die echten Betreiberangaben (Name/Firma, Anschrift, Kontakt, USt-IdNr., Hosting-Auftragsverarbeitung, E-Mail-Provider).
3. **E10-P2 Übersetzungen (ES, FR, DE, JA, ZH-CN):** maschinell erzeugt + Muttersprachler-Review, oder komplett extern? Davon hängt ab, ob ich sie überhaupt erzeuge.
4. **E10-P4 Landingpage:** Produktname und Markenprüfung stehen laut PRD §13 noch offen; ohne Namen keine Texte, kein Domainbezug.
5. **E9 Push:** VAPID-Schlüssel je Deployment. Vorschlag: erzeuge ich lokal, Dev-Werte nur in `.env.example`, Produktion per Secret.
6. **E8-P7 Self-Host-Modus:** Umfang der Einstellungen (Lizenz, Sitze im Selfhost, Update-Weg) ist im Paket nur angerissen.

## Arbeitsweise dieser Runde

- Kern-Pakete (Migrationen, Domain, API) und die Tiefen-Entscheidungen habe ich selbst gemacht; zwei Web-Paketbündel (E5-P6/P7/P8, E6-P3/P4) liefen als Subagenten in eigenen Worktrees und wurden gepickt.
- Abweichungen, die eine Prüfung wissen sollte:
  - E5-P4 und E5-P3 teilen sich einen Commit, weil beide dieselben `task`-Spalten anfassen; E6-P1/P2 ebenso.
  - `GET /api/tasks/:id` liefert seit E5 `{ task, subtasks, progress }`; die zwei E2-Tests lesen jetzt `.task`.
  - `src/server/auth.ts`: Anmelde-Limit im Dev-Modus auf 50, weil der Dev-Server ohne Proxy alle Anmeldungen in einen Bucket legt und die E2E-Suite sonst kippt (Produktion/Selfhost bleiben bei 5).
  - `POST /api/onboarding/done` setzt `ritual_done_at` für den Tag; `/today` schickt nach dem Onboarding nicht ins Ritual.
  - Die älteren E2E-Specs markieren das Onboarding per In-Page-Fetch (`page.request` kann die Sitzung unter einer harten Navigation drehen).
