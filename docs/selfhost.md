# Self-Host

Self-Host ist der kleinste Betriebsmodus (Entscheidung vom 2026-11-27): keine Lizenz, keine
Sitzgrenze, keine Billing-Oberfläche. Der Stack besteht aus App und PostgreSQL
(`docker-compose.selfhost.yml`). TLS macht ein Proxy vor dem Stack.

## Voraussetzungen

- Linux-Server mit Docker und dem Compose-Plugin, mindestens 2 GB RAM.
- Ein Proxy deiner Wahl (Caddy, nginx, Traefik) vor dem Stack. Er zeigt auf `127.0.0.1:2040`, der
  Stack veröffentlicht nichts anderes.
- `openssl` auf dem Server für die Secrets.
- Ein Release-Tag `v*` mit gebautem Image in GHCR, zum Beispiel `v0.1.0`.

## `.env` anlegen

```bash
git clone https://github.com/diononline-un/ebb.git
cd ebb
touch .env
chmod 600 .env
```

`.env` braucht diese Werte. Jedes Geheimnis bekommt einen eigenen `openssl rand -hex 32`:

```dotenv
APP_MODE=selfhost
# Adresse im Browser, also die Domain des Proxys. Nicht der Port des Containers.
APP_URL=https://ebb.example.org
EBB_VERSION=v0.1.0

PGHOST=postgres
PGPORT=5432
EBB_DB_NAME=ebb
POSTGRES_PASSWORD=<openssl rand -hex 32>
EBB_OWNER_PASSWORD=<openssl rand -hex 32>
EBB_APP_PASSWORD=<openssl rand -hex 32>
EBB_SYSTEM_PASSWORD=<openssl rand -hex 32>
EBB_AUTH_PASSWORD=<openssl rand -hex 32>
AUTH_SECRET=<openssl rand -hex 32>

# `open` lässt jede Registrierung zu. `closed` nur das erste Konto, danach nur noch die CLI.
REGISTRATION=open

# Optional: ohne SMTP entfällt die Verifizierung, und Passwort-Resets laufen über die CLI.
# SMTP_URL=smtps://benutzer:passwort@smtp.example.org:465
MAIL_FROM=ebbe <no-reply@example.org>
```

Die vier `EBB_*_PASSWORD` setzt das Init-Skript beim ersten Start der Datenbank. Sie müssen zu den
Werten in `.env` passen. `POSTGRES_PASSWORD` gehört dem Superuser des Datenbankcontainers.

## Start

```bash
docker compose -f docker-compose.selfhost.yml pull
docker compose -f docker-compose.selfhost.yml up -d
```

Beim ersten Start legt das Postgres-Init-Skript die Rollen und die Datenbank an, der App-Entrypoint
spielt danach die Migrationen ein und übergibt an den Server. Prüfen:

```bash
docker compose -f docker-compose.selfhost.yml ps
docker compose -f docker-compose.selfhost.yml logs -f app
curl -fsS http://127.0.0.1:2040/api/health
```

Die Zeilen antworten mit `{"ok":true}`. Die erste prüft den Container, die zweite den Weg durch den
Proxy und damit TLS.

## Erstes Konto

Zwei Wege zum ersten Konto:

1. Im Browser `APP_URL` öffnen und registrieren. Mit `REGISTRATION=open` geht das so oft man will.
2. Über die CLI:

   ```bash
   docker compose -f docker-compose.selfhost.yml exec app \
     node src/server/cli.ts create-user du@example.org "Dein Name"
   ```

   Das Passwort wird von stdin gelesen, im Terminal ohne Echo, sonst als eine Zeile. Mindestens 10
   Zeichen. Auch bei `REGISTRATION=closed` erlaubt die CLI das Anlegen; sie läuft im Container, nicht
   über HTTP. Ohne TTY (`docker compose exec -T`) die Zeile über stdin geben, zum Beispiel aus einem
   Passwort-Manager, nicht als Argument auf der Kommandozeile.

## Registrierung schließen

`REGISTRATION=closed` in `.env` eintragen und die App neu erzeugen:

```bash
docker compose -f docker-compose.selfhost.yml up -d --force-recreate app
```

Danach antwortet `POST /api/auth/sign-up/email` mit `403` und dem Code `registration_closed`.
Ausnahme: Solange kein Konto existiert, kommt das allererste Konto noch durch, damit eine frische
Instanz ohne CLI benutzbar ist. Alle weiteren Konten legt `create-user` an.

## Passwort vergessen

```bash
docker compose -f docker-compose.selfhost.yml exec app \
  node src/server/cli.ts reset-password du@example.org
```

Das neue Passwort kommt wie oben von stdin, mindestens 10 Zeichen. Der Befehl widerruft alle offenen
Sitzungen des Kontos, ein alter Cookie funktioniert danach nicht mehr. Ohne `SMTP_URL` gibt es keine
Reset-Mail; die CLI ist der Ersatz.

Beide Befehle enden mit Exit-Code `0` bei Erfolg, `1` bei einem Fehler (eine Zeile Klartext auf
stderr) und `2` bei falscher Nutzung. Passwörter stehen nie in der Ausgabe oder im Log.

## Update

Migrationen laufen nur vorwärts. Vor einem Update mit Migration also erst ein Backup (unten).

1. In `.env` `EBB_VERSION` auf den neuen Tag setzen.
2. Image ziehen und neu starten:

   ```bash
   docker compose -f docker-compose.selfhost.yml pull
   docker compose -f docker-compose.selfhost.yml up -d
   ```

3. `docker compose -f docker-compose.selfhost.yml logs -f app` und `/api/health` prüfen.

## Backups und Restore

Der Dienst `backup` sichert täglich um `BACKUP_HOUR` (UTC) in das Volume `ebb_backups`, wie im
Produktions-Stack. Die Befehle stehen in [betrieb.md](betrieb.md) unter „Backup prüfen“ und
„Restore-Runbook“; statt `-f docker-compose.prod.yml` nimmst du `-f docker-compose.selfhost.yml`.
Der Projektname ist derselbe (`ebb`), also heißen die Volumes gleich.

Die Backups liegen auf demselben Server wie die Datenbank. Kopiere sie regelmäßig außer Haus, sonst
ist ein Serververlust auch ein Backup-Verlust. Eine eingebaute Verschlüsselung für die Offsite-Kopie
gibt es nicht.

## Was im Self-Host fehlt

- **Billing:** kein Paddle, keine Abos, keine Sitze. `GET /api/me` liefert `access.selfhost`, die
  Abo-Seite blendet sich damit selbst aus.
- **Trial:** kein Probezeitraum. `user_access.trial_ends_at` bleibt leer, der Zugriff ist immer an.
- **Produkt-Events:** aus. `POST /api/events` antwortet mit `204`, speichert aber nichts.
- **Aufbewahrung:** der tägliche Retention-Job tut im Self-Host nichts. Konten werden nie
  automatisch gelöscht.
- **Push:** braucht eigene VAPID-Schlüssel. `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` und
  `VAPID_SUBJECT` in `.env` setzen, zum Beispiel aus `npx web-push generate-vapid-keys`. Fehlt einer
  der drei Werte, bleibt Push aus.

Logs und Health-Checks stehen in [betrieb.md](betrieb.md).
