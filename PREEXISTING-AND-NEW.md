# Pre-existing and new work

## Pre-existing FormBuilder baseline

FormBuilder (`FormularErstellen`) existed before the WebMCP Challenge. It remains in its own repository and has not been modified by the Cowork Protocol build.

- Upstream: `https://github.com/doc-bricks/FormularErstellen.git`
- Baseline commit: `dc634004401b27fef78a7861b033e8909cf241f4`
- Verified branch relation on 2026-08-30: local `main` exactly matched `origin/main`

Baseline file fingerprints (SHA-256):

| Source file | SHA-256 |
|---|---|
| `EXPORTFORMAT.md` | `F5D59CF8F1C4578FCF2B7DB60C5C2DDD30D4168000CF9A6D02DF20134301724D` |
| `web_companion/form-engine.mjs` | `62AB6E056686BBB47068692DDF0C7435AD1D97481AE86B848770D07171B00F5A` |
| `web_companion/app.js` | `6F3D818AD8D827F5C932BF6912E01512F4FE3069A506D991CB367E3381FB0A59` |
| `web_companion/package.json` | `2C92BE334A60FF1AD3695DCEBC2226CD2CDFFA3CB1C76B0C39D5B9BAE8630ED1` |
| `web_companion/test_logic.mjs` | `CFB8A93B2C3D71782B34F6624A50F5EDD1F3E27E59C033D438032DCCC40DFA2D` |

## New challenge work

Except for the explicitly recorded FormBuilder engine below, this `cowork-protocol` repository is new challenge work created after 2026-08-25. The FormBuilder connector uses the documented stable field-ID and DOM boundary; it does not silently modify the pre-existing application.

Imported web source:

| New path | Original path | Baseline SHA-256 | License | Challenge modification |
|---|---|---|---|---|
| `apps/formbuilder-showcase/src/form-engine.mjs` | `web_companion/form-engine.mjs` | `62AB6E056686BBB47068692DDF0C7435AD1D97481AE86B848770D07171B00F5A` | MIT | provenance header, naming and formatting normalization; parser/validation/response behavior retained |

The original copyright notice and file-specific provenance are retained in `apps/formbuilder-showcase/FORMBUILDER-NOTICE.md`.

## Publication boundary

The submission uses one repository and keeps the flagship application under `apps/formbuilder-showcase`. Only browser code needed for the web use case may be published from the pre-existing FormBuilder. Desktop, Python, executable, Capacitor and native packaging code are out of scope.

Both the pre-existing FormBuilder and this repository use the MIT License. The root `LICENSE` is the publication license; imported substantial portions keep the original copyright and permission notice, and this manifest names every imported source file.
