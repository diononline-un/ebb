# Metriken

Zu PRD §10. Alle Zahlen kommen aus der eigenen Datenbank, kein Drittanbieter. Die App schreibt Events in
`product_event` (E10-P6, `POST /api/events`); für Onboarding, Abo und Konto liefern die Tabellen
`user_settings`, `user_access`, `subscription` die Wahrheit bereits selbst.

Events:

| Event | Wann | Props |
|---|---|---|
| `ritual.opened` | Morgen-Ritual geöffnet | — |
| `onboarding.completed` | Onboarding abgeschlossen (Schritt 9) | — |
| `anchor.set` | eine Aufgabe wurde der Anker des Tages | — |
| `anchor.done` | der Anker wurde erledigt | — |

Der Server verwirft Events im Self-Host-Modus (`src/server/domain/events/events.ts`), Antwort bleibt 204.
Props sind Zähler und kurze Kennungen, nie eingetippter Text: höchstens acht Schlüssel, Werte als Zahl,
Boolean oder Zeichenkette bis 40 Zeichen.

## Onboarding-Abschluss

Anteil der Registrierten, die Schritt 9 erreichen. Ziel nach 3 Monaten: ≥ 70 %.

```sql
select count(*) filter (where onboarding_done_at is not null)::numeric
         / nullif(count(*), 0) as rate
  from user_settings;
```

## Aktivierung

Am Tag 1 einen Anker gesetzt **und** erledigt. Ziel: ≥ 40 %.

```sql
select count(distinct event.user_id)::numeric / nullif(count(distinct u.id), 0) as rate
  from "user" u
  left join product_event event
    on event.user_id = u.id
   and event.name = 'anchor.done'
   and event.created_at < u."createdAt" + interval '1 day';
```

## D7-Retention

An mindestens 3 der ersten 7 Tage das Morgen-Ritual geöffnet. Ziel: ≥ 35 %.
Nur Konten zählen, die vor mindestens 7 Tagen registriert wurden.

```sql
with ritual as (
  select event.user_id, count(distinct event.created_at::date) as days
    from product_event event
    join "user" u on u.id = event.user_id
   where event.name = 'ritual.opened'
     and event.created_at < u."createdAt" + interval '7 days'
   group by event.user_id
)
select count(*) filter (where ritual.days >= 3)::numeric / nullif(count(*), 0) as rate
  from "user" u
  left join ritual on ritual.user_id = u.id
 where u."createdAt" <= now() - interval '7 days';
```

## Trial → Abo

Anteil der Trials mit Abschluss innerhalb von 14 Tagen nach Trial-Ende. Ziel: ≥ 8 %.

```sql
select count(*) filter (where sub.id is not null)::numeric / nullif(count(*), 0) as rate
  from user_access access
  left join subscription sub
    on sub.payer_user_id = access.user_id
   and sub.status in ('active', 'trialing', 'past_due')
   and sub.updated_at <= access.trial_ends_at + interval '14 days'
 where access.trial_ends_at is not null
   and access.trial_ends_at <= now() - interval '14 days';
```

`subscription.updated_at` ist der letzte Schreibvorgang der Zeile, also der Abschluss des Abos im
Normalfall. Wer die Sekunde genau braucht, liest `billing_event` (`subscription.created`).

## Jahres-Churn

Abos, die nicht verlängert werden. Ziel: ≤ 35 %. `subscription` hält Status und Periodenende, keine
Historie, deshalb ist das eine Näherung: gekündigte Abos der letzten 12 Monate gegen alle Abos mit
Periodenende in diesem Zeitraum.

```sql
select count(*) filter (where status = 'canceled')::numeric / nullif(count(*), 0) as rate
  from subscription
 where status = 'canceled'
    or current_period_end >= now() - interval '12 months';
```

Für die genaue Zahl je Monat wertet man `paddle_event` aus:

```sql
select date_trunc('month', occurred_at) as month,
       payload -> 'data' ->> 'status' as status,
       count(*)
  from billing_event
 where type in ('subscription.canceled', 'subscription.updated')
 group by month, status
 order by month desc;
```
