# Arbeitsmodi — Kurzfassung

Vollständige Fassung: [`work-modes.md`](./work-modes.md) (Englisch).

## Warum der Umbau

`Point → Offer → Click → Verify` hat Mensch- und Modellaufgaben in einer Zeile
vermischt: „Point" macht der Mensch, „Offer" das Modell, „Click" wieder der
Mensch. Das beschrieb einen einzelnen Ablauf, nicht den Zustand der Sitzung.
Dazu kam eine zweite Belegung: Ein pausiertes Modell war über die Statusanzeige
**und** über das Menü „Action rights" erreichbar, und beide konnten sich
widersprechen.

## Drei Fragen pro Partner, mehr nicht

| Frage | Feld | Werte |
| --- | --- | --- |
| Anwesend? | `availability` | `here` · `standby` · `away` |
| Woran? | `area` | Seite, Aufgabe, fokussiertes Feld, Grant-Ziel oder `null` |
| Rolle? | `role` | `executing` (hat Authority) · `advising` (berät) |

Mensch und Modell beantworten dieselben drei Fragen. `standby` heißt beim
Menschen „kurz weg", beim Modell „verbunden, aber nicht am Arbeiten"; `away`
heißt „gegangen" bzw. „kein Modellsitz verbunden".

## Die Modi sind nur Namen für Kombinationen

- **Sparring** — einer führt aus, der andere berät. Die Authority wechselt so
  oft man will. „Advisor" ist derselbe Zustand aus der anderen Richtung: berät
  das Modell, ist es der Beobachtungsmodus mit Vorschlägen; berät der Mensch,
  dirigiert er ein arbeitendes Modell.
- **Doubling** — beide führen gleichzeitig aus, jeder auf seinen eigenen
  Bereich beschränkt. Wird **nur angeboten**, wenn beide Bereiche gesetzt und
  verschieden sind. Gleicher oder unbekannter Bereich heißt: sie kämen sich in
  die Quere, also gibt es die Option dort gar nicht.
- **Alleinarbeit** — der Partner ist nicht da (`standby` oder `away`).
- **Idle** — niemand führt aus.

## Die drei Kernsätze

- **Authority ist das Klickrecht.** Wer ausführt, darf klicken; wer daneben
  steht, darf vorschlagen. Es gibt keine getrennte Rechte-Einstellung mehr.
- **Modell-Authority hängt immer an einem Grant oder einer Lease** mit Ziel,
  Budget und Ablaufzeit. Die Anwesenheit eines Menschen ist **kein** Ersatz
  dafür: sie bedeutet nur, dass jemand eingreifen kann, nicht dass das Modell
  autorisiert wäre. Ohne gültigen Nachweis berät das Modell, und die Oberfläche
  sagt warum. Das ist der Sicherheitskern.
- **Die Hand an der Maus gewinnt.** Führen beide aus und ist der Bereich
  derselbe oder unbekannt, behält der Mensch das Klickrecht.

`explain` und `suggest` waren nie zwei Dinge und sind jetzt ein Zustand:
beobachten heißt beraten, also kommentieren und vorschlagen.

## Der typische Ablauf, ohne eine einzige Einstellung

Mensch tippt eine Direktive → daraus entsteht ein Grant → Modell führt aus,
Mensch schaut zu → Mensch meldet sich ab, das Modell arbeitet den Auftrag zu
Ende → Mensch kommt zurück (Klick oder Stimme) und nimmt sich das Klickrecht,
das Modell berät weiter.

An keiner Stelle wird etwas konfiguriert. Es ändert sich jeweils **eine**
Antwort; Modus, Klickrecht und Rolle des Modells folgen daraus. Genau das war
die Vorgabe: man soll gar nicht nachdenken müssen.

## Die Leiste

Alle drei Oberflächen zeigen dieselben drei Schritte: **Present · Working on ·
Role.** Ein vierter Schritt „Aufgabe des Modells" wurde während des Umbaus
wieder entfernt: die Aufgabe **ist** die Rolle, also keine eigene Frage. Wer
einen abgeleiteten Wert neben seine Quellen stellt, lädt dazu ein, ihn separat
einzustellen, und das ist genau der Fehler, den dieser Umbau beseitigt.
Aufmerksamkeit und Token-Budget gehören unter „Working on", weil sie genau das
eingrenzen.

## Modellsitz ist eine eigene Achse

Ob überhaupt ein Modell verbunden ist, ist eine andere Frage als das, was ein
verbundenes Modell gerade tut. `away` heißt „kein Sitz", `standby` heißt
„verbunden, arbeitet bewusst nicht". Die Unterscheidung zählt, weil die
Abhilfe verschieden ist: ein pausiertes Modell weckt man mit einem Klick, für
einen fehlenden Sitz braucht es den Desktop Companion, einen Model-Host, einen
OpenAI-kompatiblen Endpunkt oder einen WebMCP-fähigen Browser-Agenten.

## Was unverändert bleibt

Das Drahtformat ist weiterhin 0.1: Presence-Events, Offers, Autorisierungen,
Quittungen, Leases, Grants und die neun WebMCP-Tools behalten ihre Form.
`toLegacyPresence()` und `fromLegacyPresence()` übersetzen in beide Richtungen.
Die feineren Unterscheidungen der Matrix leben in der Oberfläche, nicht auf dem
Draht.
