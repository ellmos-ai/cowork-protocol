# FormBuilder source notice

`src/form-engine.mjs` is derived from `web_companion/form-engine.mjs` in
[`doc-bricks/FormularErstellen`](https://github.com/doc-bricks/FormularErstellen)
at baseline commit `dc634004401b27fef78a7861b033e8909cf241f4`.

- Original SHA-256: `62AB6E056686BBB47068692DDF0C7435AD1D97481AE86B848770D07171B00F5A`
- Original license: MIT
- Original copyright: Copyright (c) 2026 Lukas
- Challenge modifications: comments and formatting were normalized; behavior remains the web schema parser, type classifier, required-field validator and response builder. The surrounding Cowork integration is new challenge work.
- Post-baseline modification: the 7 internal `Error()` message strings were translated from German to English. The German type-name matching literals used by `classifyType()` (`Textfeld`, `Datum`, `Checkbox`, `Bild`, `Trennlinie`, `Beschreibung`, `Rahmen`, `Überschrift`/`Ueberschrift`, and the `Texteingabefeld-*` legacy keys) were left unchanged, since they match literal type names produced by the real upstream FormBuilder schema format rather than display text.

The complete MIT permission and warranty text is retained in the repository-root
[`LICENSE`](../../LICENSE).
