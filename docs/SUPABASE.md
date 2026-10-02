# Supabase einrichten

Mit Supabase bekommt die App eine echte Datenbank und eine sichere Anmeldung. Für einen Verein mit rund 500 Mitgliedern reicht der kostenlose Tarif. Die Grenzen des Tarifs ändern sich gelegentlich, prüfe sie auf supabase.com/pricing.

Ohne die Einstellungen unten läuft die App weiter im **Demo-Modus** (Daten nur im Browser). Demo-Daten werden nicht übernommen.

## 1. Projekt anlegen

1. Konto auf supabase.com erstellen und ein neues Projekt anlegen.
2. **Region: Frankfurt (eu-central-1)**, damit die Daten in der EU liegen. Ein langes Datenbank-Passwort wählen und gut aufbewahren.

## 2. Datenbank einrichten

1. Im Projekt links *SQL Editor* öffnen.
2. Den Inhalt von `supabase/migrations/0001_init.sql` einfügen und auf *Run* klicken. Es darf kein Fehler erscheinen.
3. Hinweis zu `pg_cron`: Die Datei versucht, die automatische Vergabe alle 5 Minuten einzurichten. Klappt das nicht, erscheint nur ein Hinweis. Dann läuft die Vergabe beim Öffnen der App, was ebenfalls funktioniert. Aktivieren kannst du es unter *Database → Extensions → pg_cron*, danach die letzten Zeilen der Datei erneut ausführen.

Spätere Änderungen am Schema kommen als neue Dateien (`0002_….sql`) in `supabase/migrations/` und werden auf dieselbe Weise ausgeführt.

## 3. Anmeldung einstellen

Unter *Authentication*:

- **URL Configuration:** *Site URL* auf die Adresse der App setzen, z. B. `https://thomasbiebl.github.io/TestRepo/`. Bei *Redirect URLs* dieselbe Adresse eintragen, für lokale Tests zusätzlich `http://localhost:5173/TestRepo/`. Ohne das funktionieren die Links in Bestätigungs- und Passwort-Mails nicht.
- **Sign In / Providers → Email:** E-Mail-Anmeldung aktiv lassen. „Confirm email“ ist empfehlenswert, damit sich niemand mit fremden Adressen registriert.
- **E-Mail-Versand:** Der eingebaute Versand ist stark begrenzt (nur wenige Mails pro Stunde). Richte deshalb unter *Project Settings → Authentication → SMTP Settings* einen eigenen Anbieter ein, z. B. Brevo oder Resend mit kostenlosem Tarif und eigener Absenderadresse.

Später können hier auch Google, Apple oder Facebook als Anmeldung ergänzt werden (OpenID Connect).

## 4. App mit Supabase verbinden

1. In Supabase unter *Project Settings → API* die **Project URL** und den **anon public**-Schlüssel kopieren. Der Schlüssel ist öffentlich gedacht, den Schutz übernehmen die Zugriffsregeln in der Datenbank. Den `service_role`-Schlüssel niemals in die App oder ins Repo eintragen.
2. In GitHub: *Settings → Secrets and variables → Actions → Variables* zwei Variablen anlegen:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Einen neuen Deploy anstoßen (Push oder *Actions → Deploy to GitHub Pages → Run workflow*). Die App läuft danach mit Supabase. Auf der Login-Seite verschwinden die Demo-Zugänge.

Lokal: `.env.example` nach `.env.local` kopieren, Werte eintragen, `npm run dev`.

## 5. Ersten Admin anlegen

1. In der App ein Konto registrieren und die E-Mail bestätigen.
2. Im SQL Editor ausführen (E-Mail anpassen):

   ```sql
   update public.profiles set is_admin = true, is_member = true where email = 'du@example.org';
   ```
3. App neu laden. Der Admin-Bereich erscheint. Weitere Admins und Mitglieder setzt du dort in der Benutzerverwaltung.

## 6. Wach halten und Backup

**Keep-alive:** Kostenlose Projekte werden nach etwa einer Woche ohne Aktivität pausiert. `.github/workflows/keepalive.yml` fragt täglich einmal die Datenbank an. Es nutzt die Variablen aus Schritt 4 und braucht nichts weiter.

**Backup:** Der kostenlose Tarif enthält keine Backups. `.github/workflows/backup.yml` sichert wöchentlich Daten und Konten und legt sie **verschlüsselt** ab. Einrichten unter *Settings → Secrets and variables → Actions → Secrets*:

- `SUPABASE_DB_URL`: in Supabase oben auf *Connect* klicken und die Verbindung **Session pooler** kopieren (nicht „Direct connection“, die ist nur über IPv6 erreichbar und GitHub kann das nicht). Das Passwort in der URL durch dein Datenbank-Passwort ersetzen.
- `BACKUP_PASSPHRASE`: ein langes, zufälliges Passwort. Bewahre es außerhalb von GitHub auf, ohne es ist das Backup nicht lesbar.

Das Repo ist öffentlich, darum ist die Verschlüsselung Pflicht. Die Datei steht unter *Actions → Datenbank-Backup → letzter Lauf → Artifacts*. Entschlüsseln: `gpg --decrypt backup-2026-11-01.tgz.gpg > backup.tgz`, dann `tar xzf backup.tgz`. Einspielen in ein neues Projekt: zuerst `0001_init.sql`, dann die Daten aus `public.sql` und `auth.sql`.

## So ist der Zugriff geschützt

- Gäste (nicht angemeldet) sehen nur den Vereinsnamen.
- Angemeldete Benutzer sehen Fahrten, News, Buchungen, Namen und Fahrtenzahlen, aber nur ihr eigenes Profil mit E-Mail-Adresse. Admins sehen alle Profile.
- Buchen, Stornieren und die Platzvergabe laufen nur über Datenbankfunktionen, die die Regeln prüfen. Niemand kann sich selbst einen Platz eintragen oder sich zum Admin machen.
- Die Regeln sind mit `npm test` gegen eine echte Postgres-Engine getestet (`tests/sql.test.ts`).

## Datenschutz

Für den Echtbetrieb mit Mitgliederdaten brauchst du ein Impressum und eine Datenschutzerklärung. Schließe in Supabase den Auftragsverarbeitungsvertrag ab (*Organization Settings → Legal*) und nenne die Dienste (Supabase, E-Mail-Anbieter, GitHub Pages) in der Erklärung. Beim Vorstand oder einem Datenschutzbeauftragten gegenprüfen lassen.
