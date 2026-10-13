# Komponentenübersicht

[English](components.md) · [Deutsch](components_de.md) · [README English](../README.md#packages) · [README Deutsch](../README_de.md#packages)

Diese quellengestützte Übersicht beschreibt die Protokollpakete und Referenzanwendungen.

<a id="packages"></a>
## Pakete

- packages/core — Protokollpakete, kausale Änderungen, Feedback von Menschen,
  Zustandsentscheidungen, Freigaben und Budgets.
- packages/conversation — providerneutrale, begrenzte Gesprächsrunden und
  Antworten sowie ein nur lesender Posteingang für den neuesten Stand; Schweigen
  und ein pausierter Agent rufen den Modelltransport des Hosts nicht auf.
- packages/model-transport — Browser-Erkennung und ein serverseitiger
  OpenAI-kompatibler Gateway; der Browser sieht weder Anbieterkonfiguration
  noch Zugangsdaten.
- packages/formbuilder-connector — bildet ein stabiles FormBuilder-Feld auf
  einen nativen Cowork-Fokus ab und stellt denselben Angebots-/Planvertrag für
  drei Canvas-Funktionen bereit (Feld hinzufügen, ändern und verschieben), die
  der Builder unten verwendet.
- packages/native-webmcp — registriert die neun Cowork-Werkzeuge bei der
  aktuellen WebMCP-API.
- packages/integration-contract — beschreibt providerneutrale Protokoll-Hosts,
  austauschbare Oberflächen-Clients und die drei vom Betreiber gesteuerten Modi
  für Seitenoberflächen.
- packages/reference-ui — gemeinsame Identität der Cowork-Referenzoberfläche,
  Symbole für Mensch und Modell und einheitliches Vokabular für Arbeitsmodi
  (Status- und Modusbezeichnungen sowie drei Statusschritte). Es wird vom
  FormBuilder-Embed, der Browser-Seitenleiste und dem Desktop Companion
  verwendet. Keine Oberfläche pflegt ihre Statusformulierungen selbst.
- packages/session-authority — verwaltet versionierte Kollaborations-Snapshots,
  begrenzte Deltas, Übergaben an eine Oberfläche für eine genaue Revision und
  kompakte, optionale Modellbriefings über Cowork-Oberflächen hinweg.
- packages/companion-link — führt einen exakten, nur über Loopback möglichen
  Beitritt des Companions und geordnete Bestätigungen von Deltas aus.
- packages/context-manager — speichert eine kompakte Zusammenfassung und ein
  begrenztes Fenster der letzten Gesprächsrunden und erstellt übertragbare
  Handoff Capsules.
- packages/model-gateway — setzt den aktiven Modellplatz durch, dedupliziert
  Gesprächsrunden-IDs und serialisiert Inferenzen über Cowork-Oberflächen hinweg.
- packages/bridge — handelt native Verbindung, allgemeines WebMCP und Companion
  für Hosts ohne WebMCP aus. Es passt ausdrückliche Hostkataloge und begrenzte
  Callback-Signale für alte semantische/visuelle Übertragung an, ohne
  seitenweite Browser-Erkennung oder eingebaute Bilderfassung zu behaupten.
- packages/open-compute-adapter — verzögert geladener, vom Betreiber aktivierter
  Computer-Use-Pfad für den Desktop Companion. Das mitgelieferte Profil bietet
  nur fokussierte Semantik, eine angeforderte visuelle Linse und exakt
  klickautorisierte Aktionen.
- packages/evals — reproduzierbare Prüfungen für Zeichenbudgets und Schweigen;
  ohne Aussage über Host-Tokens.
- apps/browser-companion — optionale, standardmäßig deaktivierte MV3-Brücke
  für Seiten ohne Cowork/WebMCP. Sie hat begrenzte semantische Stufen, einen
  einmaligen Zeigerausschnitt und Änderungen an Werten nur nach
  vertrauenswürdigem Klick. Die sichtbare Oberfläche liegt im Ursprung der
  Erweiterung, der als Chrome-/Edge-Seitenleiste deklariert ist; das
  Inhalts-Relay fügt keine Seitenoberfläche ein.
- apps/desktop-companion — dauerhafte, nur über Loopback erreichbare
  Sitzungsautorität mit verschiebbarem Referenzfenster, gemeinsamem
  Modellgespräch, Audiosteuerung und Windows-Infobereichssymbol für Präsenz.
- apps/formbuilder-showcase — sichtbarer Referenzablauf für Fokus, Angebot,
  Bestätigung, kausalen Beleg, Feedback, Arbeitsmodi, Einzelarbeitsberechtigung
  und Audiosteuerung.
- apps/formbuilder-showcase/src/form-engine.mjs — zugeschriebene, webbasierte
  FormBuilder-Engine für Pflichtfeldprüfung und JSON-Export von Antworten.
- apps/formbuilder-showcase/src/form-builder.mjs, fodt-export.mjs,
  builder-view.js — das neue, Cowork-freie FormBuilder-Studio-Produkt:
  Formulare aus einer Palette entwerfen, ausfüllen und Schema, Antwort oder
  druckbares .fodt exportieren. Siehe
  [apps/formbuilder-showcase/INTEGRATION.md](../apps/formbuilder-showcase/INTEGRATION.md), wie es danach auf Cowork
  aufgesetzt wurde.
- apps/formbuilder-showcase/src/builder-cowork.js,
  builder-model-suggester.js, builder-directive-classifier.js — die Schicht auf
  dem Cowork Protocol, die Formularfelder kennt: drei Canvas-Funktionen
  (form-add-field, form-update-field, form-move-field) werden wie alle anderen
  FormBuilder-Funktionen angeboten, angeklickt und geprüft. Dazu kommen
  Freigaben, Einzelentwürfe und durch Äußerungen autorisierte Anweisungen.
  Kein neues WebMCP-Werkzeug.
- apps/formbuilder-showcase/src/builder-cowork-ui.js — der kopflose Adapter
  (initBuilderCowork) zwischen dieser Schicht und der Seite. Er verwaltet das
  Aufmerksamkeitsziel, Angebote, Freigaben und Anweisungen des Studio-Canvas,
  rendert aber nichts: Das einzige Cowork-Panel der Seite bedient sowohl das
  Demoformular als auch den Studio-Canvas. Die Studio-eigenen Abschnitte
  „Model suggestions“, „Delegate to the model“ und „Say what to do“ wurden
  deshalb entfernt; siehe [apps/formbuilder-showcase/INTEGRATION.md](../apps/formbuilder-showcase/INTEGRATION.md).

Siehe außerdem den [Adapter-Laufzeitleitfaden](../packages/bridge/README.md), den
[Browser-Bridge-Leitfaden](../apps/browser-companion/README.md),
[docs/architecture.md](../docs/architecture.md), [docs/testing.md](../docs/testing.md),
[docs/deployment.md](../docs/deployment.md), [docs/evidence.md](../docs/evidence.md) und
[PREEXISTING-AND-NEW.md](../PREEXISTING-AND-NEW.md).
