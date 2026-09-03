# Arbeitsmodi — Kurzfassung

Vollständige Fassung: [`work-modes.md`](./work-modes.md) (Englisch).

## Warum der Umbau

`Point → Offer → Click → Verify` hat Mensch- und Modellaufgaben in einer Zeile
vermischt: „Point" macht der Mensch, „Offer" das Modell, „Click" wieder der
Mensch. Das beschrieb einen einzelnen Ablauf, nicht den Zustand der Sitzung.
Dazu kam eine zweite Belegung: Ein pausiertes Modell war über die
Statusanzeige **und** über das Menü „Action rights" erreichbar — beide konnten
sich widersprechen.

## Zwei Variablen pro Akteur, alles andere folgt

| Variable | Werte | Frage |
| --- | --- | --- |
| `availability` | `here` · `standby` · `away` | Kann dieser Akteur überhaupt mitwirken? |
| `role` | `acting` · `observing` | Was tut er, solange er da ist? |

Mensch und Modell benutzen dieselben Wörter. `standby` heißt beim Menschen „kurz
weg", beim Modell „verbunden, aber nicht am Arbeiten"; `away` heißt „gegangen"
bzw. „getrennt".

Daraus ergibt sich der Arbeitsmodus:

| Lage | Modus | Wer darf klicken |
| --- | --- | --- |
| Beide handeln, Gleichzeitigkeit erlaubt | `parallel` | beide |
| Beide handeln, nicht erlaubt | `cowork` | Mensch |
| Mensch handelt, Modell ist da und schaut zu | `cowork` | Mensch |
| Mensch handelt, Modell auf standby oder weg | `human-solo` | Mensch |
| Modell handelt, Mensch ist da und schaut zu | `cowork` | Modell |
| Modell handelt, Mensch weg | `model-solo` | Modell |
| Niemand handelt | `idle` | niemand |

## Die drei Kernsätze

- **Authority ist das Klickrecht.** Wer handelt, darf klicken. Wer daneben
  steht, darf vorschlagen. Es gibt keine getrennte Rechte-Einstellung mehr —
  die frühere Auswahl „Action rights" ist ersatzlos entfallen, weil ihr nichts
  mehr zu entscheiden blieb.
- **Solo heißt: der Partner ist nicht da.** Nicht „darf nicht", sondern „ist
  nicht im Raum". Ein anwesendes, zuschauendes Modell macht daraus Cowork, weil
  es sich melden kann.
- **Die Hand an der Maus gewinnt.** Wollen beide gleichzeitig handeln und ist
  Gleichzeitigkeit nicht ausdrücklich erlaubt, behält der Mensch das Klickrecht
  und das Modell wechselt ins Beraten. Genau das ist der Rückweg aus dem
  typischen Ablauf.

`explain` und `suggest` waren nie zwei Dinge und sind jetzt ein Zustand:
beobachten heißt beraten — kommentieren und vorschlagen.

## Der typische Ablauf

Mensch schreibt einen Auftrag → Modell arbeitet, Mensch schaut zu → Mensch
meldet sich ab, das Modell arbeitet den Auftrag allein zu Ende → Mensch kommt
zurück (Klick oder Stimme) → Modell berät, Mensch handelt.

An keiner Stelle wird etwas umkonfiguriert. Es ändert sich jeweils **eine**
Statusvariable; Modus, Klickrecht und Aufgabe des Modells folgen daraus.

## Nachweis statt Absicht

Soll das Modell arbeiten, während der Mensch weg ist, braucht es einen Nachweis:
die Solo-Lease mit Ziel, Umfang, Aufrufgrenze und Ablaufzeit. Fehlt oder
verfällt sie, fällt das Modell sichtbar aufs Beraten zurück. Ist der Mensch
anwesend, ist seine Anwesenheit selbst die lebende Autorität — dann braucht es
keine Lease.

## Vier Klärungsschritte

Alle drei Oberflächen zeigen dieselbe Leiste: **Dein Status → Wie wir arbeiten →
Was das Modell sieht → Aufgabe des Modells.** Die ersten beiden werden gewählt,
die letzten beiden folgen. Die Attention Lens bleibt einstellbar, weil sie zwei
eigene Zwecke hat: die Aufmerksamkeit auf die Aufgabe lenken und das
Token-Budget bewusst ausgeben.

## Was unverändert bleibt

Das Drahtformat ist weiterhin 0.1: Presence-Events, Offers, Autorisierungen,
Quittungen, Leases, Grants und die neun WebMCP-Tools behalten ihre Form.
`toLegacyPresence()` und `fromLegacyPresence()` übersetzen in beide Richtungen.
Die feineren Unterscheidungen der Matrix leben in der Oberfläche, nicht auf dem
Draht.
