# Teststrategie — deutsche Befehlsreferenz

[English](testing.md) · [README English](../README.md) · [README Deutsch](../README_de.md)

Dieses Dokument enthält die ausführlichen Verträge der einzelnen Prüfkommandos. Das englische Dokument beschreibt zusätzlich die vollständige Teststrategie und die breite Gate-Matrix. Datierte Browserläufe stehen im [deutschen Browserbeleg](evidence_de.md#accepted-browser-runs).

## Befehlsverträge

<a id="what-each-check-proves"></a>
### Was die einzelnen Prüfungen belegen

npm run demo:adapter ist ein deterministischer Host-Vertragstest. Er wählt
alle drei Pfade mit ausdrücklichen Fixtures: natives Cowork, vom Host
bereitgestelltes WebMCP und einen Legacy-Companion ohne WebMCP. Letzterer
liest über Host-Callbacks ein semantisches Ziel und eine begrenzte Kontextebene.
Die Ausgabe hält Aussagen zu browserweiter Erkennung, Erweiterungstransport
und verbundenem Modell-Client ausdrücklich auf false. Dafür sind ein echter
Browser-Host oder eine Erweiterung und gesonderte Abnahmebelege nötig.

npm run eval berichtet adapter-characters, hier definiert als
JavaScript-UTF-16-Codeeinheiten und nicht als Browser- oder Modell-Tokens.
Die zwölf Fälle prüfen die Budgets von 350 Zeichen für Fokus, Änderung und
Feedback; die Grenze bei 160/161 Zeichen für ausgewählten Text; das
Unterdrücken von Schweigen und unverändertem Zustand; eine Erweiterung um genau
eine Ebene; Ereignis- und Gesprächs-Snapshots, die nur den neuesten Stand
enthalten; die begrenzte Zusammenfassung des Brückenkatalogs; die Vorschau
eines Brücken-Leseergebnisses mit 1.200 Zeichen; sowie ein vollständiges
Gesprächspaket unterhalb der Grenze von 1.200 Zeichen, ohne nicht verfügbare
Host-Telemetrie zu erfinden.

npm run proof ist ein deterministischer zehnstufiger Probelauf für die Jury.
Er prüft echten Fokus, eine einmalige Kontextanforderung, den nur den neuesten
Stand enthaltenden Gesprächs-Posteingang und eine begrenzte Antwort, Angebot,
Freigabe durch einen menschlichen Klick, verifizierte Änderung und Feedback,
eine begrenzte AFK-Berechtigung, gemeinsame Formgestaltung (ein
form-add-field-Angebot wird auf einen leeren Canvas angewendet und unabhängig
geprüft) sowie eine vollständige Abfolge aus Delegationsfreigabe,
durch Äußerung autorisierter Anweisung, Warten auf Feedback und Bewertung
(eine durch menschliche Äußerung statt Klick freigegebene form-update-field-
Änderung wartet auf eine echte Bewertung Gut/Anpassen/Anders). Dazu kommen
FormBuilder-Exportverträge in Sekunden. Die Ausgabe setzt browserClaim: false
und hostTokenClaim: false. Sie ist ein reproduzierbarer Beleg für den Kern,
kein Ersatz für die erforderliche Live-Demonstration mit WebMCP im Browser.

npm run check:architecture validiert das veröffentlichte Architekturartefakt:
Es berichtet unterstützte Verbindungspfade, die providerneutrale
Oberflächenaussage, das barrierefreie SVG und die Abmessungen des gerenderten
PNG. So kann die Darstellung nicht von den tatsächlich angebotenen
Verbindungspfaden abweichen.

npm run smoke:companion baut die echte Manifest-V3-Erweiterung und lädt sie
in ein frisches Profil des ausgewählten Browsers. Die früheren dokumentierten
Abnahmen verwendeten Chrome for Testing; dieser Care-Lauf verwendete Edge 154.
Chrome war in diesem Care-Lauf nicht verfügbar und wurde nicht getestet. Das Fixture
deaktiviert WebMCP
ausdrücklich. Der Test belegt, dass vor einer vertrauenswürdigen
_execute_action-Abkürzung, die vorübergehenden activeTab-Zugriff erteilt, keine
Cowork-Seitenwelt existiert und das Relay nicht injiziert ist. Danach prüft er
Ein-/Ausschalten, ein stabiles Zeigerziel, semantische Stufen von genau 350 und
1.200 Zeichen, einen echten 400 × 400-PNG-Zeigerausschnitt, der nur innerhalb
des isolierten Erweiterungs-Hosts einmal verwendet werden kann, ein inaktives
Angebot in der Seitenleiste auf dem Ursprung der Erweiterung und eine verifizierte
Änderung nach vertrauenswürdigem Browserklick. Auch pageUiInjected: false wird
verlangt. Die drei historischen Chrome-basierten Erweiterungs-Smokes verwendeten Chrome
for Testing. Der dokumentierte Lauf mit dem markengebundenen Chrome 152.0.7977.77 ignorierte --load-extension;
ob der Schalter funktioniert, hängt vom Browser-Build ab. Chrome for Testing
lässt sich beispielsweise
mit npx @puppeteer/browsers install chrome@152.0.7977.65 --path ./browser-cache
in einem Cache im Projektverzeichnis installieren. Setze
COWORK_COMPANION_BROWSER_PATH oder COWORK_CHROME_PATH, um einen Browser an einem
anderen Ort auszuwählen. Wenn der ausgewählte Build Erweiterungen nicht im
Headless-Modus lädt, setze COWORK_COMPANION_HEADFUL=1 und
COWORK_COMPANION_VISIBLE=1. Für den begrenzten Pixelbeleg muss das temporäre
Testfenster sichtbar auf dem Bildschirm bleiben.
Der Bericht behauptet weder ein verbundenes Modell noch Host-Tokens oder die
Übertragung der ganzen Seite.

npm run smoke:companion-cockpit rendert den ausgelieferten Code der Seitenleiste
bei einem CSS-Viewport von genau 390 × 844 mit einem begrenzten Laufzeit-Fixture.
Erfasst und geprüft werden die vier Arbeitsmodi, die eine weitergeleitete
Seite erreichen kann: Sparring, bei dem das Modell berät und der Mensch
ausführt; Sparring, bei dem der Mensch berät und das Modell ausführt;
Modellarbeit allein; und menschliche Alleinarbeit. Geprüft werden null
horizontaler Überlauf, benannte Steuerelemente, die vollständige
Tastaturreihenfolge von neun Elementen und die tatsächlichen Fokus- und
Kontextinstrumente. Setze COWORK_COMPANION_EVIDENCE_DIR, um die vier
PNG-Bilder und den JSON-Bericht zu behalten. Die akzeptierten Zustände Native,
WebMCP und Bridge bleiben alle executionMode: structured; der Test schlägt fehl,
wenn sie fälschlich den Computer-Use-Zeiger anzeigen.

npm run smoke:companion-native prüft den ergänzenden nativen Pfad zuerst.
Ist WebMCP auf FormBuilder aktiviert, muss die Erweiterung neun Cowork-
Werkzeuge in der Hauptausführungswelt der Seite entdecken, ein natives
Fokuspaket zurückgeben, den Legacy-Fallback inaktiv halten und alle
Erweiterungsoberflächen außerhalb des Seiten-DOM lassen.

npm run smoke:companion-webmcp prüft den mittleren Verbindungspfad. Auf einer
Fixture-Seite ohne eigene Cowork-Werkzeuge registriert die Erweiterung
cowork_read_focus, cowork_request_context, cowork_offer_action und
cowork_read_presence über WebMCP und beantwortet sie durch ihr eigenes
begrenztes Relay. Jeder WebMCP-Agent im Browser kann dadurch den Fokus lesen
und dort Vorschläge machen. Die Seitenleiste zeigt die Route bridge-webmcp an
und hält selbst keinen Modellplatz; der vorgeschlagene Wert ändert sich erst
nach einem vertrauenswürdigen Klick im Panel.

npm run smoke:webmcp startet das Showcase und ein isoliertes Chrome-Profil,
aktiviert die aktuellen WebMCP-Testfunktionen von Chrome und entdeckt genau
neun Cowork-Werkzeuge. Es führt zehn Werkzeugaufrufe aus: Fokus, einmaliger
Kontext, zwei sichtbare inaktive Angebote, neueste Änderung, neuestes Feedback,
neueste Gesprächsrunde, eine begrenzte Antwort, cowork_read_presence und
cowork_execute_solo. Chrome DevTools erzeugt vertrauenswürdige Klicks, die genau
die sichtbaren Feldwerte, menschliches Feedback, das Angebot des lokalen
Helfers, das WebMCP-Antwortangebot und einen echten Klick für „kurz abwesend“
freigeben. Der anschließende Solo-Aufruf wird direkt über
document.modelContext.executeTool() ohne Klick geprüft, entsprechend einem
echten AFK-Modellaufruf. Kein Angebotswerkzeug und kein Antwortwerkzeug gibt
einen Wert selbst frei oder übernimmt ihn. In derselben Browser-Laufzeit belegt
ein vom Host bereitgestelltes Kalender-Fixture mit zwei Werkzeugen die portable
Brücke: Zwei Leseaufrufe werden ausgeführt, ein zu großes Ergebnis wird auf
1.200 Zeichen Vorschau begrenzt, und die Buchungsänderung bleibt offer-only,
ohne den Host-Executor zu erreichen. Der Bericht unterscheidet
browserHostClaim: true von foreignLiveSiteClaim: false. Er benötigt Chrome 150
oder neuer; setze COWORK_CHROME_PATH, wenn Chrome nicht an einem üblichen Ort
für Windows, macOS oder Linux installiert ist. Es wird weder ein persönliches
Browserprofil noch eine nicht lokale Seite verwendet.

npm run smoke:model-host startet die echte Host-Route desselben Ursprungs mit
einem deterministischen Antwort-Fixture und einem frischen Chrome-Profil. Der
Test verlangt, dass der Browser die Brücke findet, genau eine begrenzte Runde
ohne HTML der Seite oder Autorisierungszugangsdaten zustellt, Grace Hopper als
inaktives Angebot anzeigt und das Feld erst nach einem vertrauenswürdigen Klick
ändert. Die Ausgabe hält Aussagen zu externem und verbundenem Modell auf false:
Belegt wird die Verbindung zum Host, nicht die Antwort eines Anbieters.

Für eine Wiederholung der optionalen, anbietergestützten Abnahme gegen einen
bereits verfügbaren kompatiblen Endpunkt setze COWORK_ACCEPT_CONNECTED_MODEL=1
zusammen mit den Variablen des Modell-Hosts vor demselben Smoke-Befehl. Ein
erfolgreicher Anbieterlauf ergänzt preferredModelClaim: true und
connectedModelClaim: true; ein Loopback-Endpunkt hält externalModelClaim: false.
Dieser Befehl lädt kein Modell herunter.

npm run smoke:surface prüft in Chrome den Weg Embed → Document PiP → Embed → Desktop Companion ohne
  Installation. Der vollständige Kontinuitätsvertrag steht unter [Details zur
  Surface-Kontinuität](#surface-continuity-acceptance-details).

<a id="surface-continuity-acceptance-details"></a>

### Details zur Surface-Kontinuität

Der Smoke-Test prüft den von Cowork verwalteten Kontinuitätsweg ohne Erweiterung. Chrome verschiebt die
  ausgewählte FormBuilder-Referenzoberfläche von Embed zu Document Picture-in-Picture und zurück, gewährt die
  vom Menschen vermittelte Loopback-Freigabe, sendet genau einen Snapshot samt kompaktem Kontext an den
  Companion und wendet die beiden zusammenhängenden Autoritäts-Deltas für Desktop-Oberfläche und Modellplatz an.
  Nach der Übergabe verlangt der Test zuerst eine sofortige tokenfreie `page-visible`-Meldung. Danach löst er
  einen echten Wechsel in den verborgenen Zustand aus und verlangt, dass die Companion-Autorität nur das
  begrenzte `SurfaceEvent` erhält, ohne eine Modellrunde anzufordern. Er führt deterministische
  Hintergrundarbeit aus, macht die Seite wieder sichtbar und verlangt, dass die Seitenkopie alle
  zwischenzeitlichen Deltas abruft und anwendet. Anschließend öffnet der Test ein getrenntes Companion-Fenster
  mit 430 × 760 Pixeln und ohne horizontalen Überlauf. Er prüft die gemeinsame Referenzidentität, den sichtbaren
  Hinweis zur Seitenverfügbarkeit, die tatsächliche Modellkennung des Hosts und drei Audiosteuerungen. Die
  echten Akteursschaltflächen durchlaufen die Zustände „zusammenarbeitend“, „beobachtend“, „pausiert“ und „kurz
  abwesend“. „Kurz abwesend“ bleibt ohne Lease untätig; eine spätere begrenzte Lease aktiviert die gerichtete
  Agent-Solo-Übermittlung. Der Test wählt einen Cockpit-Hintergrund und verlangt, dass dieser zusammen mit
  derselben Sitzung einen Neustart des Companions übersteht. Er erfasst die visuellen Zustände, sendet eine
  deterministische Runde durch das serialisierte Model Gateway, beobachtet den Kontext von Mensch und Assistent
  und bestätigt, dass die Modelleingabe im eingebetteten Panel nach der Übergabe deaktiviert ist.

npm run smoke:accessibility öffnet bei genau 390 × 844 CSS-Pixeln ein weiteres
isoliertes Chrome-Profil. Verlangt werden genau 36 nicht ignorierte interaktive
Browser-Accessibility-Knoten, darunter die Build/Fill/Export-Steuerelemente
des FormBuilder Studio, die ARIA-Rolle tab und Chromes Rolle
DisclosureTriangle für einklappbare Panelabschnitte sowie button, checkbox,
combobox, link und textbox. Die Steuerelemente Delegate und Directive des
Studios wurden entfernt; damit verschwand der letzte spinbutton der Seite.
Der eingeklappte Handoff-Bereich hält sechs Steuerelemente aus der
Standardansicht heraus. Alle Knoten müssen Namen und eindeutige DOM-Identitäten
haben. Anschließend führt der Test ebenso viele echte Tab-Ereignisse aus und
verlangt, dass jeder Fokusstopp mit focus-visible sichtbar bleibt. Außerdem
schaltet er das eingebettete Modell zwischen beobachtend, pausiert und
zusammenarbeitend sowie den Menschen zwischen kurz abwesend, lange abwesend
und anwesend. Abgeschnittene Steuerelemente oder Texte sowie mehr als ein Pixel
Dokumentüberlauf lassen den Test fehlschlagen. Dies ist ein Beleg aus
Browser-Accessibility-Baum und Tastatur-/Layoutprüfung, kein Screenreader-Test.

npm run smoke:builder öffnet den Bereich Build/Fill/Export des FormBuilder
Studio in einem isolierten Chrome-Profil und prüft ihn vollständig ohne Agent:
Feld aus der Palette hinzufügen, im Fill-Tab ausfüllen, eine gültige
formularerstellen-response-v1-Antwort absenden und alle drei Exportsteuerungen
finden. Danach prüft der Test, dass ein einzelnes Feld (nicht nur der Canvas)
adressiert werden kann (GAP-00). Das Ziel wird im einzigen Cowork-Panel der
Seite zurückgelesen, nicht in einer zweiten Studio-Oberfläche. Auch die
Klickfreigabe wird geprüft: Ein Angebot „Model suggests a field“ bleibt in der
Angebotsliste des Panels inaktiv, bis ein echter vertrauenswürdiger Klick folgt;
danach erscheint genau ein verifizierter Beleg. Der gesamte Delegationsablauf
nutzt die Übergabeschaltflächen des Panels: Bei Abwesenheit fügt eine auf den
Canvas begrenzte Freigabe sechs Felder ohne Einzelklicks hinzu (GAP-01/GAP-04).
„I'm back“ berichtet die Änderungen, hebt genau diese Felder hervor und wartet
auf eine Bewertung (GAP-03/GAP-05). Ein echter Feedback-Klick schließt sie ab.
Eine erkannte Anweisung („make it required“) wird ohne Angebotschip und zweiten
Klick ausgeführt (GAP-02). Der Smoke-Test tippt sie in das Gesprächsfeld des
Panels; belegt ist damit menschliche Äußerungsautorisierung, keine
Spracherkennung oder ein Mikrofon, bevor der Test erneut auf await-feedback
wartet. Er prüft auch, dass document.modelContext.getTools().length bei
aktiviertem WebMCP weiterhin 9 ist.

npm run smoke:contrast nutzt ein separates temporäres Chrome-Profil und prüft
den tatsächlich gerenderten Vordergrund gegen die von Chrome aufgelösten
Hintergrundbereiche. Es verlangt genau elf Kollaborationszustände (zehn
Cowork-Demozustände und einen FormBuilder-Studio-Zustand builder-offer-visible:
ein sichtbarer Feldvorschlag des Studios, der jetzt als Angebotschip im Cowork-
Panel erscheint, weil das Studio keine eigene Angebotsliste mehr hat), mindestens
30 sichtbare Textelemente pro Zustand, null ungeklärte Hintergründe und einen
ungerundeten Mindestkontrast von 4,5:1 für jeden geprüften Bereich. Der
deterministische Listening-Zustand ersetzt nur die Erkennungsgrenze; er
behauptet keine Mikrofonaufnahme oder hörbare Ausgabe.

<a id="scope-of-the-imported-showcase"></a>
