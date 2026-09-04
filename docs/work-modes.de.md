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

## Away heißt ganzer Canvas, denn wer weg ist, kann nicht zeigen

Ein Grant handelt von etwas, und dieses Etwas war bisher das Feld, auf das der
Mensch zeigt. Solange er dasitzt, ist das richtig — Zeigen ist die Art, „dieses
hier" zu sagen. Es ist falsch in dem Moment, in dem er geht: Wer weg ist, kann
nicht zeigen. Einen Zeiger zu verlangen hieß darum, dass der Away-Pfad genau
dann verweigerte, wenn er gebraucht wurde, und der Mensch das Modell nie allein
arbeiten sah.

Der Geltungsbereich folgt also der Anwesenheit, das *Recht zu handeln* weiter
allein dem Grant:

| Geste | Geltungsbereich des Grants |
| --- | --- |
| Übergeben und zusehen, auf ein Feld zeigend | dieses Feld — Sparring an einer Stelle |
| Übergeben und zusehen, auf nichts zeigend | der ganze Canvas |
| Abmelden, egal worauf gezeigt wurde | **immer** der ganze Canvas |

Auf dem festen Demo-Formular ist der ganze Canvas ein Ziel je sichtbarem Feld,
mit einem Aufruf je Feld plus der Zwei-Versuche-Reserve. Auf dem Studio-Canvas
ist es das Canvas-Ziel, das die Entwurfs-Fähigkeit ohnehin benutzt. Ein leeres
„Job to hand over" verweigert ebenfalls nicht mehr: Das Panel schreibt den
naheliegenden Auftrag für diesen Geltungsbereich in das sichtbare Feld, wo er
weiter änderbar bleibt.

Die Linse sagt es, solange sie gilt: `Working across: Whole form (4 fields)`.
`cowork_read_focus` verweigert ohne Zeiger weiterhin — das ist richtig, es gibt
keinen Zeiger —, also liest ein Solo-Agent seine Ziele aus dem Grant, den
`cowork_read_presence` jetzt mitführt.

## Der Sitz-Klick ist die Autorisierung, die Modusauswahl ein Wunsch

Beide fragen nach demselben Zustand und antworten bewusst verschieden.

`sparring-model` in der Modusauswahl sagt, was man gern hätte. Ohne Grant
schnappt die Auswahl auf den geltenden Modus zurück und die Oberfläche nennt,
was fehlt. Eine Auswahl ist keine Autorisierung, und der Sicherheitskern
darüber gilt auch für ein Auswahlfeld.

Der Druck auf den Modellsitz ist keine Auswahl. Es ist ein vertrauenswürdiger
Klick der Person, die die Autorität hält, auf den Akteur, dem sie den Job
übergibt — und genau diese Geste hält ein Grant fest. Also prägt der Sitz einen:
Ziel aus dem fokussierten Element, dasselbe Aufrufbudget und dieselbe
Ablaufzeit wie beim Übergabeknopf der Fläche, sichtbar benannt. Ausgeführt wird
in keinem Fall ohne Grant; die beiden Wege unterscheiden sich darin, wer die
Geste gemacht hat.

- **Eingebettetes Panel** — Mensch anwesend: übergeben und zusehen. Mensch
  abwesend: der Away-Pfad, Modell solo innerhalb der Lease. Der nächste Druck
  holt den Job zurück.
- **Desktop Companion** — der Companion ist Session Authority und prägt den
  Grant selbst, statt zurück auf die Seite zu verweisen. Ohne verknüpfte Seite
  sagt er `PAGE_NOT_LINKED`. Ein Grant handelt von etwas, und er erfindet nicht,
  wovon: Eine Seite, die gar keine Ziele meldet, wird weiterhin abgelehnt.
- **Browser-Erweiterung** — prägt keinen Grant, überspringt darum `executing`
  und sagt warum. Dieselbe Regel dort, wo kein Autoritätsnachweis entstehen
  kann.

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
