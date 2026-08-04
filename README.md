# Merit Badge Requirement Sheet Generator

Paste a merit badge's requirements, get a printable one-page counselor sign-off
sheet — plus the big table sign for a merit badge midway.

This started as a pile of Python scripts (`legacy/`) where adding a badge meant
writing a new `.py` module and editing the filename at the top of `reqs.py`.
It is now a web app: anyone can make a sheet for any badge without touching
code, and cheap AI condenses long official requirements down to one line each
so they fit on a single page.

## What it does

1. **Paste** the official requirements for a badge.
2. **Convert** them into a structured list — either with **Shorten with AI**
   (Claude Haiku 4.5 rewrites each requirement to one line while preserving
   every number, count, and named item), or with **Use as-is**, which recovers
   the structure from the numbering alone and changes no wording.
3. **Edit** anything in the review pane. Indent / outdent controls change the
   nesting, and the underline button toggles a row's signature line.
4. **Download** as PDF — the requirement sheet, the table sign, or both in one
   file.

Badge art and an optional watermark are uploaded per sheet and never leave the
browser — they are re-encoded to PNG on a canvas and embedded straight into
the PDF.

## Setup

```bash
pnpm install
cp .env.example .env    # fill in the keys you want
pnpm dev                # http://localhost:3000
```

The app runs with **no keys at all** — paste, convert with "Use as-is", edit,
and download all work offline. Keys only unlock the AI rewrite:

| Variable                     | Needed for                         |
| ---------------------------- | ---------------------------------- |
| `ANTHROPIC_API_KEY`          | The AI rewrite. Server-side only.  |
| `VITE_CLERK_PUBLISHABLE_KEY` | Sign-in UI.                        |
| `CLERK_SECRET_KEY`           | Verifying the session server-side. |

**Why auth:** the Anthropic key is yours and every rewrite spends it. The
server function refuses unless there is a signed-in Clerk user, so a public
deployment cannot burn your budget. Everything else stays open. Without Clerk
keys the AI button is disabled and explains why, and the server function
refuses regardless — a missing key can never leave the AI path ungated.

## Commands

| Command              | What it does                                               |
| -------------------- | ---------------------------------------------------------- |
| `pnpm dev`           | Dev server on port 3000                                    |
| `pnpm build`         | Production build                                           |
| `pnpm typecheck`     | `tsc --noEmit`                                             |
| `pnpm lint`          | ESLint                                                     |
| `pnpm render:sample` | Render sample PDFs to `sample-output/` without the browser |

`render:sample` is the layout smoke test — compare its output against
`legacy/output/genealogy.pdf` after touching anything in `src/pdf/`.

## License

MIT — see [LICENSE](LICENSE).

The license covers the code in this repository. It does not extend to the merit
badge requirement text that appears in `legacy/badges/` or that users paste into
the app; those requirements are the property of the Boy Scouts of America and
are reproduced here only as sample input.

## Deploying — AWS Amplify Hosting

`pnpm build` emits `.amplify-hosting/` (Nitro's `aws_amplify` preset —
`compute/default/` + `static/` + `deploy-manifest.json`), which is exactly what
Amplify's **WEB_COMPUTE** platform expects. `amplify.yml` points the build at
it. No API Gateway or hand-rolled Lambda is involved; Amplify's own CloudFront
splits static from compute using `deploy-manifest.json`.

**Amplify's SSR compute runtime never receives environment variables** — they
reach the *build* only, and Nitro does not read `.env` in production. Both of
this app's secrets are read lazily at request time (Clerk's middleware reads
`CLERK_SECRET_KEY` per request; `simplify.ts` reads `ANTHROPIC_API_KEY` per
rewrite), so they are baked from the build env into Nitro's server-only
`runtimeConfig` in [`vite.config.ts`](vite.config.ts) and copied into
`process.env` at startup by [`src/server/env.ts`](src/server/env.ts). Set both
in Amplify's **build** environment. Never bake a secret with Vite `define` — it
would be string-replaced into the client bundle too.

Verify a build the way Amplify runs it — secrets present at build, absent at
runtime:

```bash
CLERK_SECRET_KEY=sk_test_… ANTHROPIC_API_KEY=sk-ant-… pnpm build
grep -rl "sk_test_…" .amplify-hosting/compute/   # -> index.mjs   (expected)
grep -rl "sk_test_…" .amplify-hosting/static/    # -> nothing     (required)
cd .amplify-hosting/compute/default && env -i PATH="$PATH" NODE_ENV=production node server.js
```

The compute entrypoint always listens on **port 3000** and ignores `PORT` —
that is Amplify's contract, not a bug.

Devtools must stay behind the `import.meta.env.DEV` dynamic import in
[`src/routes/__root.tsx`](src/routes/__root.tsx). A static import pulls
`@tanstack/devtools` into the production SSR bundle, where it throws
"Client-only API called on the server side" at module evaluation and 500s
**every** request.

## Layout of the code

```
src/
  lib/
    requirements.ts   Requirement tree: types, Zod + JSON schema, tree helpers
    parse.ts          Deterministic parser — recovers the tree from numbering
    sheet.ts          SheetSpec: everything that goes on a sheet
    auth.tsx          Clerk wrappers that degrade when unconfigured
  pdf/
    theme.ts          Page geometry ported from legacy/sign.py (points, 1:1)
    RequirementSheet.tsx   The sheet and the table sign
  server/
    simplify.ts       Auth-gated Haiku call with structured output
  components/         Image upload, requirement editor, PDF preview
  routes/             __root (shell + auth menu), index (the builder)
scripts/
  render-sample.tsx   Headless layout smoke test
legacy/               The original Python tool, kept for reference
```

### How the port maps to the original

`legacy/sign.py` laid the sheet out with reportlab tables in points.
`src/pdf/theme.ts` keeps those numbers: 0.5in margins, a 90/10 split between
requirement text and the initials column, 30/5/30/5/30 for the signature-blank
rows, and 0.15in of indent per nesting level. The visible differences are
deliberate: nesting is uniform recursion rather than the original's hardcoded
three levels, checkboxes are drawn instead of loaded from `checkbox.png`, and
the vertical rhythm is a few points tighter so a badge like Genealogy fits on
one page instead of spilling the counselor block onto a second.

### Notes for future work

- **PDFs render in the browser**, not on the server — that is what makes the
  live preview instant and keeps uploaded art private. `@react-pdf/renderer`
  is code-split into its own chunk and loaded behind `<ClientOnly>`.
- **The preview double-buffers two iframes.** A new PDF loads into the hidden
  one and they swap only after it has painted. Navigating a _visible_ iframe
  makes the browser tear its PDF viewer down to a dark shell first, which
  reads as a black flash. Waiting for `load` alone is not enough — the viewer
  reports the document as loaded before the first page is on screen, hence
  `PAINT_SETTLE_MS`. There is a fallback timer for engines that never fire
  `load` for an embedded PDF.
- **The preview reserves its full height from the first paint.**
  `PreviewSkeleton` in `routes/index.tsx` mirrors the real bar and body, and
  the download button's box is held open before the first blob exists —
  otherwise mounting the lazily-loaded renderer shoves the page around.
- **Do not wrap the frames in an `opacity-0` group while loading.** An
  opacity-0 _ancestor_ makes Chrome skip rasterising the PDF plugin, so the
  frame is still blank when revealed. A hidden sibling inside a visible parent
  keeps painting, which is what the swap depends on; cover the loading state
  with an opaque overlay instead.
- **`VIEWER_PARAMS` hides Chrome's PDF toolbar** via the URL fragment. It is
  applied to the frame only, never the download link, where the fragment would
  end up in the saved filename.
- **`@react-pdf/renderer` accepts PNG and JPEG only.** Every upload is
  re-encoded to PNG via canvas in `components/ImageDrop.tsx`, which is what
  makes the WebP badge art in `legacy/assets/` usable.
- **Fonts are the built-in Helvetica.** The original registered `DejaVuSans`
  but — because `getSampleStyleSheet()` was called twice — actually printed
  most of the sheet in Helvetica anyway, so this matches the real output. To
  use a font file, register it with `Font.register` in `src/pdf/theme.ts`.
- The **row counter** in the review pane warns past ~26 rows, roughly where a
  sheet stops fitting on one page.
- **Signature lines default to leaves** but `Requirement.signable` overrides
  that per row. The override is stored only when it disagrees with the
  structural default and is cleared as soon as it agrees again, so a row never
  sits pinned to a value that merely happens to match — restructure the tree
  and untouched rows keep following it. Note `toText()` does not round-trip
  overrides; "Copy edits back to the box" drops them.
- Sheets are not persisted. Adding save/load means storing a `SheetSpec` —
  it is plain JSON apart from the image data URLs.
