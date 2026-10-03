# Supabase einrichten

Mit Supabase bekommt die App eine echte Datenbank und eine sichere Anmeldung. Für einen Verein mit rund 500 Mitgliedern reicht der kostenlose Tarif. Die Grenzen des Tarifs ändern sich gelegentlich, prüfe sie auf supabase.com/pricing.

Ohne die Einstellungen unten läuft die App weiter im **Demo-Modus** (Daten nur im Browser). Demo-Daten werden nicht übernommen.

## 1. Projekt anlegen

1. Konto auf supabase.com erstellen und ein neues Projekt anlegen.
2. **Region: Frankfurt (eu-central-1)**, damit die Daten in der EU liegen. Ein langes Datenbank-Passwort wählen und gut aufbewahren.

## 2. Datenbank einrichten

1. Im Projekt links *SQL Editor* öffnen.
2. Öffne im Repository den Ordner `supabase/migrations` und führe **alle Dateien nacheinander in der Reihenfolge der Nummern** aus: Inhalt der Datei einfügen, auf *Run* klicken, dann die nächste Datei in einer neuen Abfrage. Es darf kein Fehler erscheinen.

   | Datei | Inhalt |
   | --- | --- |
   | `0001_init.sql` | Tabellen, Zugriffsregeln, Buchung und Platzvergabe |
   | `0002_profile.sql` | Profil bearbeiten, Konto löschen |
   | `0003_trip_info.sql` | Fahrt-Infos, Absage, Stornofrist |
   | `0004_companions.sql` | Begleitpersonen, Zustiegsstellen, Busse |
   | `0005_participants.sql` | Bezahlt, eingestiegen, Punkte |
   | `0006_notifications.sql` | Mitteilungen |
   | `0007_roster.sql` | Mitgliederliste und Mitgliedscode |
   | `0008_audit.sql` | Änderungsprotokoll |
   | `0009_admin_cancel_booking.sql` | Admins stornieren Buchungen |
3. Hinweis zu `pg_cron`: Die Datei versucht, die automatische Vergabe alle 5 Minuten einzurichten. Klappt das nicht, erscheint nur ein Hinweis. Dann läuft die Vergabe beim Öffnen der App, was ebenfalls funktioniert. Aktivieren kannst du es unter *Database → Extensions → pg_cron*, danach die letzten Zeilen der Datei erneut ausführen.

Kommt in einer neuen Version der App eine weitere Datei dazu (z. B. `0010_….sql`), führst du nur die neuen Dateien auf dieselbe Weise aus. Bereits ausgeführte Dateien nie ein zweites Mal ausführen.

## 3. Anmeldung einstellen

Unter *Authentication*:

- **URL Configuration:** *Site URL* auf die Adresse der App setzen, z. B. `https://thomasbiebl.github.io/Fanclub-App/`. Bei *Redirect URLs* dieselbe Adresse eintragen, für lokale Tests zusätzlich `http://localhost:5173/`. Ohne das funktionieren die Links in Bestätigungs- und Passwort-Mails nicht.
- **Sign In / Providers → Email:** E-Mail-Anmeldung aktiv lassen. „Confirm email“ ist empfehlenswert, damit sich niemand mit fremden Adressen registriert.
- **E-Mail-Versand:** Der eingebaute Versand ist stark begrenzt (nur wenige Mails pro Stunde). Richte deshalb unter *Project Settings → Authentication → SMTP Settings* einen eigenen Anbieter ein, z. B. Brevo oder Resend mit kostenlosem Tarif und eigener Absenderadresse.

**Anmeldung mit Google, Apple oder Facebook (optional):**

1. Beim Anbieter eine App bzw. einen OAuth-Client anlegen. Als Weiterleitungs-Adresse trägst du die *Callback URL* ein, die Supabase unter *Authentication → Sign In / Providers → (Anbieter)* anzeigt. Sie sieht so aus: `https://DEIN-PROJEKT.supabase.co/auth/v1/callback`.
2. Die Zugangsdaten (Client ID und Secret) in Supabase beim Anbieter eintragen und ihn einschalten.
3. In GitHub unter *Settings → Secrets and variables → Actions → Variables* die Variable `OAUTH_PROVIDERS` anlegen, zum Beispiel `google,apple`, und neu deployen. Auf der Login- und Registrierungsseite erscheinen dann die Buttons.

Das Profil entsteht beim ersten Login automatisch, der Name kommt vom Anbieter. Die Mitgliederliste greift über die E-Mail-Adresse des Kontos. Apple verlangt ein kostenpflichtiges Entwicklerkonto, Google und Facebook sind kostenlos. Die Buttons sind nicht mit einem echten Anbieter getestet, nur der Aufruf an Supabase ist es.

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

**Mitglieder in großer Zahl:** Unter *Admin → Mitgliederliste importieren* fügst du die Mitgliederliste ein (aus Excel kopiert: E-Mail, Name, Mitgliedsnummer). Wer sich mit einer dieser Adressen registriert, ist sofort Mitglied, bereits registrierte Personen werden beim Import zu Mitgliedern. Alternativ legst du unter *Admin → Einstellungen* einen **Mitgliedscode** fest, den Mitglieder in ihrem Profil eingeben. Liste und Code können nur Admins lesen. Nach 5 falschen Eingaben pro Stunde ist für die Person erst einmal Pause.

Bei E-Mail-Bestätigung (Schritt 3) ist die Liste sicher: Die Mitgliedschaft hängt an der bestätigten Adresse, denn ohne Bestätigung kann sich niemand anmelden.

## 6. Wach halten und Backup

**Keep-alive:** Kostenlose Projekte werden nach etwa einer Woche ohne Aktivität pausiert. `.github/workflows/keepalive.yml` fragt täglich einmal die Datenbank an. Es nutzt die Variablen aus Schritt 4 und braucht nichts weiter.

**Backup:** Der kostenlose Tarif enthält keine Backups. `.github/workflows/backup.yml` sichert wöchentlich Daten und Konten und legt sie **verschlüsselt** ab. Einrichten unter *Settings → Secrets and variables → Actions → Secrets*:

- `SUPABASE_DB_URL`: in Supabase oben auf *Connect* klicken und die Verbindung **Session pooler** kopieren (nicht „Direct connection“, die ist nur über IPv6 erreichbar und GitHub kann das nicht). Das Passwort in der URL durch dein Datenbank-Passwort ersetzen.
- `BACKUP_PASSPHRASE`: ein langes, zufälliges Passwort. Bewahre es außerhalb von GitHub auf, ohne es ist das Backup nicht lesbar.

Das Repo ist öffentlich, darum ist die Verschlüsselung Pflicht. Die Datei steht unter *Actions → Datenbank-Backup → letzter Lauf → Artifacts*. Entschlüsseln: `gpg --decrypt backup-2026-11-01.tgz.gpg > backup.tgz`, dann `tar xzf backup.tgz`. Einspielen in ein neues Projekt: zuerst `0001_init.sql`, dann die Daten aus `public.sql` und `auth.sql`.

## 7. E-Mail-Benachrichtigungen (optional)

Mitteilungen in der App (Glocke oben rechts) funktionieren ohne weitere Einrichtung. Für zusätzliche E-Mails gibt es die Edge Function `supabase/functions/notify-email`. Sie verschickt zu jeder neuen Mitteilung eine Mail, aber nur wenn die Person es in ihrem Profil erlaubt hat:

- **Persönliche Meldungen** (Platz vergeben, nachgerückt, Fahrt abgesagt): standardmäßig an.
- **Neue Fahrten und News**: standardmäßig aus, weil kostenlose Mail-Tarife begrenzt sind (Brevo: etwa 300 Mails pro Tag). Eine neue Fahrt würde sonst an alle 500 Personen gehen.

Einrichtung (am einfachsten mit der Supabase CLI auf deinem Rechner, `npm i -g supabase`):

1. Bei Brevo (oder einem anderen Anbieter, dann `index.ts` anpassen) ein Konto anlegen, eine Absenderadresse bestätigen und einen API-Schlüssel erzeugen.
2. Function bereitstellen:

   ```bash
   supabase login
   supabase link --project-ref DEIN-PROJEKT
   supabase functions deploy notify-email --no-verify-jwt
   supabase secrets set BREVO_API_KEY=... MAIL_FROM=info@dein-verein.de MAIL_FROM_NAME="Dein Fanclub" \
     APP_URL=https://thomasbiebl.github.io/Fanclub-App/ WEBHOOK_SECRET=ein-langes-zufaelliges-passwort
   ```
3. In Supabase unter *Database → Webhooks* einen Webhook anlegen: Tabelle `notifications`, Ereignis `Insert`, Typ *Supabase Edge Functions*, Function `notify-email`, zusätzlicher HTTP-Header `x-webhook-secret` mit demselben Wert wie `WEBHOOK_SECRET`.
4. Testen: eine Fahrt absagen, für die du gebucht hast. Die Mail kommt kurz danach. Fehler siehst du unter *Edge Functions → notify-email → Logs*.

Die Function ist nicht automatisch getestet. Nur der Aufbau der Mails ist es (`tests/notifyEmail.test.ts`). Prüfe sie deshalb einmal selbst.

Push-Nachrichten aufs Handy (Web Push) sind nicht eingebaut. Sie brauchen zusätzliche Schlüssel und einen weiteren Dienst, und auf dem iPhone funktionieren sie nur, wenn die App auf dem Startbildschirm liegt.

## Repo umbenennen

Das Repo lässt sich jederzeit umbenennen (GitHub: *Settings → General → Repository name*, ohne Leerzeichen, z. B. `Fanclub-App`). Danach:

1. Der Pages-Deploy baut die App automatisch mit dem neuen Pfad. Im *Actions*-Tab prüfen, sonst *Run workflow*.
2. Die Adresse der App ändert sich auf `https://thomasbiebl.github.io/NEUER-NAME/`. Die alte leitet nicht weiter.
3. In Supabase unter *Authentication → URL Configuration* *Site URL* und *Redirect URLs* auf die neue Adresse umstellen, sonst funktionieren Bestätigungs-, Passwort- und Social-Login-Links nicht mehr.
4. Bei aktiven E-Mail-Benachrichtigungen das Secret `APP_URL` der Edge Function neu setzen (`supabase secrets set APP_URL=…`).
5. Auf dem Handy die App neu zum Startbildschirm hinzufügen. Variablen und Secrets in GitHub bleiben erhalten.

## So ist der Zugriff geschützt

- Gäste (nicht angemeldet) sehen nur den Vereinsnamen.
- Angemeldete Benutzer sehen Fahrten, News, Buchungen, Namen und Fahrtenzahlen, aber nur ihr eigenes Profil mit E-Mail-Adresse. Admins sehen alle Profile.
- Buchen, Stornieren und die Platzvergabe laufen nur über Datenbankfunktionen, die die Regeln prüfen. Niemand kann sich selbst einen Platz eintragen oder sich zum Admin machen.
- Die Regeln sind mit `npm test` gegen eine echte Postgres-Engine getestet (`tests/sql.test.ts`).

## Datenschutz

Für den Echtbetrieb mit Mitgliederdaten brauchst du ein Impressum und eine Datenschutzerklärung. Schließe in Supabase den Auftragsverarbeitungsvertrag ab (*Organization Settings → Legal*) und nenne die Dienste (Supabase, E-Mail-Anbieter, GitHub Pages) in der Erklärung. Beim Vorstand oder einem Datenschutzbeauftragten gegenprüfen lassen.
