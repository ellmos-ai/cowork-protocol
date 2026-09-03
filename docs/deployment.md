# Static web release

The public site is a deliberately small allowlisted artifact. It contains the FormBuilder showcase, the ten runtime protocol packages it imports (core, conversation, model-transport, formbuilder-connector, native-webmcp, integration-contract, reference-ui, session-authority, companion-link and context-manager), the license and a root redirect. It excludes tests, repository documentation, Devpost drafts and internal planning paths.

## Build and preview

```powershell
npm ci --ignore-scripts
npm test
npm run eval
npm run check:secrets
npm run proof
npm run build:pages
npm run preview:pages
```

Open `http://127.0.0.1:4174/`. The root page redirects to the FormBuilder showcase. `dist/` is generated and ignored by Git.

## GitHub Pages gate

`.github/workflows/deploy-pages.yml` follows GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) structure, but it has only `workflow_dispatch`. A push alone cannot deploy the site.

After explicit release approval:

1. Recheck that the chosen public branch has the same tree as the approved local commit and no internal paths in its ancestry.
2. Push that branch to the approved public repository.
3. Configure Pages to use GitHub Actions.
4. Manually run **Deploy public web showcase** for the approved branch.
5. Read back the workflow result, Pages URL, root redirect, showcase page, license and public repository state.

No local build or workflow file is evidence that these external steps succeeded.
