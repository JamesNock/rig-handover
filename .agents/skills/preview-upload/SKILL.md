---
name: preview-upload
description: Save a rig page as one HTML file and put it on a public link for a reviewer, then upload it again without the lane marker once the review is in. Use for a plan's "Preview for review" and "Clean up" issues.
---

# preview-upload

A preview is a static copy of one page on a public HTTPS link (ADR 0003). This lane uses
Cloudflare Workers static assets through Wrangler; config in `deploy/wrangler.jsonc`.

Each step that publishes needs a human yes first: say what goes up, where, who can see it and
how to undo it.

## Save the page

Run rig on a spare port and save the page with a command, not a browser's "save as":

```sh
mkdir -p var/preview
PORT=8799 pnpm start &                     # with the marker: reads .env
curl -sf localhost:8799/digest/<night> -o var/preview/index.html
kill %1
```

Without the marker, start it so `.env` isn't read, with the marker empty:

```sh
LANE_MARKER= PORT=8799 npx tsx src/server.ts &
```

Check before uploading: `grep -c "$LANE_MARKER" var/preview/index.html` (1 with, 0 without), and
no `<script` in the file. `var/` is git-ignored; previews never go in the repo.

## Upload

One Worker per plan, named `rig-<plan>-preview`. The human signs in once with
`npx wrangler login`.

```sh
npx wrangler deploy --config deploy/wrangler.jsonc --name rig-<plan>-preview
```

The link is the `https://….workers.dev` line Wrangler prints. Uploading again with the same name
replaces the page on the same link.

- Use `wrangler deploy`, not `wrangler pages …`: Wrangler may turn a Pages command into a Workers
  deploy with a config it writes itself, in whatever folder you ran it from.
- Keep `preview_urls: false`. With version links on, `<version>-rig-<plan>-preview.…workers.dev`
  keeps serving each old upload, marker and all, after the clean-up.

## Check the link

Before sending it, and again after the clean-up:

```sh
curl -s https://<link>/ | cmp - var/preview/index.html      # same bytes as the saved file
curl -s -o /dev/null -w '%{http_code}\n' https://<version-prefix>-<worker>.<sub>.workers.dev/  # 404
```

## Order

1. Save with the marker, check, upload (human yes), check the link, send it to the reviewer.
2. The preview issue stays open until the reviewer has looked. Sent is not reviewed.
3. Save without the marker, upload over the same link (human yes), check the main link shows
   "no marker set" and version links 404. Then close the clean-up issue.

Remove a preview for good: `npx wrangler delete rig-<plan>-preview`.
