# Browserbelege (deutsche Ergänzung)

[English ledger](evidence.md) · [README English](../README.md) · [README Deutsch](../README_de.md)

Diese Ergänzungsdatei bewahrt die ausführlichen, datierten Browser-Abnahmen aus dem deutschen README. Sie dokumentiert beobachtete Läufe und ist keine Zusage aktueller Abdeckung. Das vollständige Belegregister steht in der [englischen Chronik](evidence.md).

<a id="accepted-browser-runs"></a>
## Akzeptierte Browserläufe

Die folgenden Browserbelege sind datierte Abnahmeprotokolle und keine Zusage
aktueller Abdeckung. In diesem Care-Lauf vom 13.10.2026 liefen fünf Browser-Smokes
mit Edge 154 erfolgreich. Chrome war nicht verfügbar und wurde in diesem
Care-Lauf nicht getestet.

Der native Browserpfad ist sowohl durch Protokoll- als auch Browserbelege
abgedeckt. Ein isolierter Lauf mit Chrome 152 entdeckte alle neun Werkzeuge über
document.modelContext.getTools(), prüfte begrenzten Fokus und Kontext sowie
die Ausgabe nur des neuesten Gesprächsstands und zeigte, dass zwei
Aktionsangebote und menschliches Feedback an einen Klick gebunden blieben.
Die ausdrücklich gesetzten Grenzen lauten weiterhin agentClientClaim: false
und hostTokenClaim: false: Es handelt sich um WebMCP-Vermittlung im Browser,
nicht um eine verbundene ChatGPT-Agentensitzung.

Derselbe native WebMCP-Smoke-Test wurde auch in einer dokumentierten Sitzung
mit dem installierten, markengebundenen Google Chrome ausgeführt
(152.0.7977.77, gestartet mit WebMCP und WebMCPTesting), nicht mit Chrome for
Testing. Er entdeckte neun Werkzeuge. Der Bericht setzte browserClaim,
conversationClaim und webMcpReplyClaim auf true sowie agentClientClaim und
hostTokenClaim auf false. Diese Werte beschreiben die Prüfungen dieses Laufs;
sie belegen keine aktuelle Browser-Grundlinie. Die früheren
Erweiterungs-Smokes verwendeten Chrome for Testing, weil das damals geprüfte
markengebundene Chrome --load-extension ignorierte. Ob der Schalter
funktioniert, hängt vom jeweiligen Browser-Build ab.

Ein separater Chrome-152-Lauf belegt die Verbindung zum Modell-Host desselben
Ursprungs mit einer deterministischen Runde aus 468 Zeichen und ohne
Browserzugangsdaten. Bei einer früheren Wiederholung mit Anbieter wurde eine
502 Zeichen lange Runde an das lokale Ollama-Modell qwen3:4b gesendet. Das
genaue Angebot blieb bis zum vertrauenswürdigen Klick inaktiv;
providerLocation lautet local, externalModelClaim bleibt false.

Der dokumentierte UI-Lauf zeigte: Bei echtem Browserzoom von 200 Prozent und
einem CSS-Viewport von 390 × 844 waren alle 36 interaktiven Steuerelemente
bedienbar, hatten einen benannten Accessibility-Knoten und einen sichtbaren
Tab-Stopp; horizontaler Überlauf betrug null. Der Ausgangswert sank von 41
auf 34, als Panelbereiche einklappbar wurden, und stieg auf 36, als Sprechen
und Chatfenster ihre Steuerelemente erhielten. Gezählt wird das Panel, das
Besucher sehen, mit aktiviertem Demomodus und bereits verbundenem Modell.
Der Kontrast-Smoke-Test prüft sichtbare Texte in elf Zuständen, darunter den
Feldvorschlag des FormBuilder Studio im Cowork-Panel. Er fand keine
nicht unterstützten oder fehlerhaften Bereiche und einen minimalen Kontrast
von 4,5656:1. Gemessen wurde vor der letzten Panel-Einklappung; diese änderte
den Wert nicht. Echte Mikrofonpraxis, ein entfernter Anbieter, Tests mit
Screenreadern und ein verbundener ChatGPT-Agentenaufruf bleiben offen.

Ein separater Chrome-for-Testing-152-Abnahmelauf deaktivierte WebMCP ausdrücklich
und lud die gebaute Browser Bridge. Vor der vertrauenswürdigen Aktionsabkürzung
enthielt die Seite weder Cowork-Brücke noch Erweiterungs-Ausführungswelt.
Temporärer activeTab-Zugriff injizierte danach bei Bedarf das kopflose Relay.
Die Seitenleiste auf dem Ursprung der Erweiterung kommunizierte mit dem
Relay der Seite, ohne einen Cowork-Stamm in das Seiten-DOM einzufügen. Geprüft
wurden standardmäßig deaktiviertes sowie ein- und ausschaltbares Verhalten,
semantische Stufen von genau 350 und 1.200 Zeichen, ein einmaliger
400 × 400-PNG-Zeigerausschnitt, ein inaktives sichtbares Wertangebot und eine
Änderung mit Prüfung erst nach einem vertrauenswürdigen Browserklick. Der
Bericht setzt browserCompanionClaim: true, sidePanelSurfaceClaim: true,
pageUiInjected: false, visualCaptureClaim: true, visualDeliveryOneShot: true
und webMcpAbsent: true. Die Aussagen zu Modell-Client, externem Modell,
Host-Tokens und Übertragung der ganzen Seite bleiben false.

Ein zweiter Erweiterungs-Abnahmelauf aktivierte WebMCP auf FormBuilder. Er
belegt, dass die Seitenleiste alle neun nativen Cowork-Werkzeuge aus der
Seitenausführungswelt entdeckt, das native Fokuspaket liest, fallbackActive:
false beibehält und keine Seitenoberfläche einfügt. Der Smoke-Test der
Oberfläche ohne Erweiterung löst dann das eingebettete UI in Document
Picture-in-Picture heraus, übergibt die genaue Sitzung samt begrenztem Kontext
an den lokalen Companion, öffnet ein getrenntes Companion-Appfenster und leitet
dessen Antwort über ein einziges serialisiertes Model Gateway. Das Embed
deaktiviert nach dieser Übergabe die eigene Modelleingabe. Ein Wechsel
zwischen verborgenem und sichtbarem Tab belegt anschließend, dass der
Companion keinen Seiteninhalt erhält und keine Modellrunde erstellt, während
die zurückkehrende Seite ab ihrer letzten Revision aufholt.
