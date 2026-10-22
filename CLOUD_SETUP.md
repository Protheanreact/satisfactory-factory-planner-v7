# Cloud-Sync-Änderungen für Satisfactory Factory Planner v7

## Dateien einspielen
Kopiere `src/App.tsx`, `src/cloud.ts` und `.env.example` aus diesem Paket in den bestehenden Projektordner. `src/App1.tsx` bleibt unverändert.

## Supabase-Umgebung
1. Kopiere `.env.example` nach `.env.local` im Projekt-Hauptordner.
2. Trage deine Supabase-Projekt-URL und den `sb_publishable_...`-Schlüssel ein:

```env
VITE_SUPABASE_URL=https://DEINE-PROJEKT-ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_DEIN_OEFFENTLICHER_KEY
```

3. Speichere die Datei. `.env.local` nicht öffentlich hochladen und niemals den `sb_secret_...`-Schlüssel eintragen.
4. Starte den Vite-Server neu (`Ctrl+C`, danach `npm run dev`).
5. Oben in der App auf `Cloud-Login` klicken und ein Konto registrieren. Falls Supabase eine E-Mail-Bestätigung verlangt, den Bestätigungslink öffnen und danach anmelden.

## Supabase
Die Tabelle `public.factory_plans` und RLS-Policies müssen bereits mit der vorherigen SQL-Abfrage erstellt worden sein. Die Policies müssen `select`, `insert`, `update` und `delete` für `authenticated` nur mit `auth.uid() = user_id` erlauben.

## Verhalten
- Speichern erfolgt weiterhin lokal und über den bisherigen Speichern-Button.
- Nach der Anmeldung wird der vorhandene Cloud-Bauplan geladen, sofern einer existiert.
- Änderungen werden nach kurzer Verzögerung automatisch in Supabase gespeichert.
- Bei einem Konto ohne Cloud-Bauplan bleibt der lokale Plan erhalten und wird beim ersten Sync hochgeladen.
- Import/Export JSON bleibt vorhanden.

## Wichtig vor Veröffentlichung
- Vor dem Test zuerst lokal starten und Registrierung/Anmeldung testen.
- In Supabase Authentication die gewünschte E-Mail-Bestätigung einstellen.
- In der Supabase-URL-Konfiguration später die echte öffentliche Website-URL hinzufügen.
- `.env.local` und den geheimen Supabase-Schlüssel niemals ins Repository aufnehmen.
- Diese Implementierung synchronisiert einen Hauptbauplan pro Nutzer; sie ist noch keine Mehrprojekt-Verwaltung und löst parallele Bearbeitung auf zwei Geräten nicht mit Konfliktauflösung.
