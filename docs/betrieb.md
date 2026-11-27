# Betrieb

Produktion läuft als ein Compose-Stack (`docker-compose.prod.yml`): App, PostgreSQL, Caddy und
ein Backup-Dienst. Nur Caddy veröffentlicht Ports (80, 443 und 443/udp); App, Datenbank und Backups
sind ausschließlich im internen Netz erreichbar. Alle Variablen stehen in `.env`, die Vorlage ist
`.env.prod.example`. `src/server/env.ts` prüft sie beim Start und bricht bei fehlenden Werten ab.

## Voraussetzungen

- Server (Contabo-VPS) mit Docker und dem Compose-Plugin, mindestens 2 GB RAM.
- DNS: ein A-Record für die Domain zeigt auf den Server. Für IPv6 zusätzlich ein AAAA-Record.
- Firewall: eingehend nur 80/tcp, 443/tcp und 443/udp offen. Alles andere blockt die Firewall,
  der Stack selbst veröffentlicht nichts weiter.
- Ein Release-Tag `v*` in GitHub mit gebautem Image in GHCR (CI-Job `image`), zum Beispiel `v0.1.0`.
- `openssl` auf dem Server für die Secrets.

## Erster Deploy

1. Repo klonen und `.env` anlegen:

   ```bash
   git clone https://github.com/diononline-un/ebb.git
   cd ebb
   cp .env.prod.example .env
   ```

2. In `.env` alle `change-me` ersetzen:
   - `EBB_DOMAIN` und `APP_URL`: derselbe Host, `APP_URL` mit `https://`.
   - `EBB_VERSION`: der Release-Tag, zum Beispiel `v0.1.0`. Kein `latest`, damit ein Neustart
     dieselbe Version startet.
   - `POSTGRES_PASSWORD`, `EBB_OWNER_PASSWORD`, `EBB_APP_PASSWORD`, `EBB_SYSTEM_PASSWORD`,
     `EBB_AUTH_PASSWORD`, `AUTH_SECRET`: je ein eigenes `openssl rand -hex 32`.
     `POSTGRES_PASSWORD` gehört dem Superuser des Datenbankcontainers. Die vier
     `EBB_*_PASSWORD` setzt das Init-Skript beim ersten Start der frischen Datenbank, sie müssen
     zu den Werten in `.env` passen.
   - `SMTP_URL` und `MAIL_FROM`: Zugang des Mail-Anbieters. Ohne `SMTP_URL` startet die App im
     Modus `production` nicht.
   - Paddle bleibt leer. Dafür gibt es den Abschnitt [Paddle live schalten](#paddle-live-schalten).

3. Starten:

   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

   Beim ersten Start legt das Postgres-Init-Skript die vier Rollen und die Datenbank an. Der
   App-Entrypoint spielt danach die Migrationen ein und übergibt an den Server.

4. Prüfen:

   ```bash
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs -f app
   curl -fsS https://<domain>/api/health
   ```

   Die letzte Zeile antwortet mit `{"ok":true}`. Caddy holt das TLS-Zertifikat beim ersten
   HTTPS-Aufruf; bei Problemen stehen Details in `docker compose -f docker-compose.prod.yml logs caddy`.

## Update

1. In `.env` `EBB_VERSION` auf den neuen Tag setzen.
2. Image ziehen und Stack neu starten:

   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

   Compose ersetzt nur die Dienste, deren Image oder Konfiguration sich geändert hat. Der
   Entrypoint der App spielt vor dem Start die Migrationen ein.

3. `docker compose -f docker-compose.prod.yml logs -f app` und
   `curl -fsS https://<domain>/api/health` prüfen.

Migrationen laufen nur vorwärts (`docs/architektur.md`). Zurück auf den alten Tag geht mit
`EBB_VERSION` zurücksetzen und `up -d`, solange die neue Migration abwärtskompatibel war. Vor einem
Update mit Migration ein Backup auslösen (siehe unten).

## Backup prüfen

Der Dienst `backup` schläft bis zur nächsten vollen Stunde und sichert täglich um `BACKUP_HOUR`
(UTC). Jeder Lauf legt `/backups/<UTC-Zeitstempel>/` an mit `roles.sql`, `<EBB_DB_NAME>.dump`
(Custom-Format) und `toc.txt` aus `pg_restore --list`. Ordner, die älter als `BACKUP_KEEP_DAYS`
Tage sind, löscht derselbe Lauf.

- Log verfolgen: `docker compose -f docker-compose.prod.yml logs -f backup`
- Inhalt ansehen: `docker compose -f docker-compose.prod.yml exec backup ls -l /backups`
- Lauf sofort auslösen:

  ```bash
  docker compose -f docker-compose.prod.yml run --rm -e BACKUP_ONCE=1 backup
  ```

  Der Befehl endet bei Erfolg mit Exit 0, schreibt einen Ordner mit dem aktuellen Zeitstempel und
  beendet sich. Schlägt er fehl, nennt das Log den Schritt und der Exit-Code ist ungleich 0.
- Plausibilität eines Dumps:

  ```bash
  docker compose -f docker-compose.prod.yml exec backup \
    pg_restore --list /backups/<stamp>/<EBB_DB_NAME>.dump | head
  ```

Die Backups liegen auf demselben Server wie die Datenbank. Kopiere sie regelmäßig außer Haus
(anderer Host, EU), sonst ist ein Serververlust auch ein Backup-Verlust. Der Dienst verschlüsselt
nichts und lädt nichts hoch; das Offsite-Ziel ist noch offen (`docs/specs/E09-betrieb.md`, D1).
Verschlüssele die Kopie auf dem Ziel, wenn der Speicher nicht ohnehin verschlüsselt ist.

## Restore-Runbook

Ziel: einen Backup-Ordner in eine leere Postgres-Instanz spielen und die Zeilenzahlen prüfen.
Das Skript braucht `POSTGRES_PASSWORD`, `EBB_DB_NAME` und den Ordner im Volume `backups`
(Compose-Name in diesem Stack: `ebb_backups`).

### Drill auf einem zweiten Host

1. Repo und `.env` auf den zweiten Host kopieren. `.env` braucht dieselben Werte für
   `POSTGRES_PASSWORD`, `EBB_DB_NAME` und die vier `EBB_*_PASSWORD` wie der Quell-Stack.
2. Nur die Datenbank starten. Das Init-Skript legt Rollen und die leere Datenbank an:

   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres
   ```

3. Den Backup-Ordner vom Quell-Server auf den zweiten Host kopieren und in das Volume legen.
   `<stamp>` ist der Ordnername, zum Beispiel `20261127T030000Z`:

   ```bash
   docker run --rm -v ebb_backups:/backups -v "$PWD/<stamp>:/in:ro" postgres:17 \
     sh -c 'mkdir -p /backups/<stamp> && cp -a /in/. /backups/<stamp>/'
   ```

4. Restore starten. Vorher die Uhrzeit notieren, danach noch einmal:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm --entrypoint sh backup \
     /backup/restore.sh /backups/<stamp>
   ```

   Das Skript spielt zuerst fehlende Rollen ein. Die vier `ebb_*`-Rollen existieren in der frischen
   Instanz schon, deshalb bleibt `roles.sql` für sie folgenlos und die neuen Passwörter aus `.env`
   gelten weiter. Danach läuft `pg_restore --exit-on-error` in `EBB_DB_NAME`. Am Ende stehen die
   Zeilenzahlen für `"user"`, `task` und `space` im Log. Exit 0 heißt: Restore vollständig.

5. Zahlen mit dem Quellstand vergleichen. Danach die App starten und anmelden:

   ```bash
   docker compose -f docker-compose.prod.yml up -d app
   curl -fsS https://<domain>/api/health
   ```

### Notfall-Restore auf dem Produktions-Host

Nur wenn die laufende Datenbank verloren oder beschädigt ist. Die Schritte löschen den aktuellen
Datenbankstand. Der Backup-Ordner liegt schon im Volume `ebb_backups` und überlebt die Schritte 2
und 3.

1. App stoppen:

   ```bash
   docker compose -f docker-compose.prod.yml stop app
   ```

2. Stack entfernen und das Datenbank-Volume löschen:

   ```bash
   docker compose -f docker-compose.prod.yml down
   docker volume rm ebb_pgdata
   ```

3. Leere Datenbank starten:

   ```bash
   docker compose -f docker-compose.prod.yml up -d postgres
   ```

4. Restore ausführen wie im Drill, Schritt 4.
5. Alles starten und prüfen:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   curl -fsS https://<domain>/api/health
   ```

Die Dauer des Drills hängt an der Größe des Dumps: eine kleine Datenbank ist in Sekunden zurück,
bei einigen GB dominiert `pg_restore`. Start- und Endzeit aus Schritt 4 gehören in den Drill-Bericht.

## Paddle live schalten

Die Billing-Variablen in `.env` füllen:

| Variable | Wert |
|---|---|
| `PADDLE_WEBHOOK_SECRET` | Secret der Notification Destination in Paddle |
| `PADDLE_API_KEY` | serverseitiger API-Key aus Paddle |
| `PADDLE_PRICE_FOUNDER` | Price-ID des Gründer-Preises |
| `PADDLE_PRICE_STANDARD` | Price-ID des Standard-Preises |
| `PADDLE_PRICE_SEAT` | Price-ID des Zusatz-Sitzes |
| `PRICE_BASE_ACTIVE` | `founder` oder `standard` |
| `TRIAL_REQUIRES_CARD` | `true` oder `false` |
| `MAX_EXTRA_SEATS` | 0 bis 20, Standard 5 |

Danach die App neu erzeugen, damit sie die neuen Werte liest:

```bash
docker compose -f docker-compose.prod.yml up -d app
```

In Paddle eine Notification Destination auf `https://<domain>/api/billing/webhook` setzen. Ohne
`PADDLE_WEBHOOK_SECRET` antwortet die Route mit 503, mit falschem Secret mit 401. Beides steht im
App-Log, wenn Paddle zustellt.
