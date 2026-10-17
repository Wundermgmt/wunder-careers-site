# Wunder Management — careers site

> **Company copy.** The live site deploys from
> [`jio-wunder/careers-site`](https://github.com/jio-wunder/careers-site), a personal
> account. This repo is the company-owned copy of it, so Wunder keeps the website if that
> account is ever gone. As of the last sync it matches `jio-wunder/careers-site` @ `cecad8d`
> (Team Assistant added; applications go to the portal intake).
>
> **To take the site over from this repo** (keeps the same URL, so the Meta ads keep working):
> 1. Render → service **wunder-careers-site** → **Settings** → **Repository** → **Edit** →
>    choose `Wundermgmt/wunder-careers-site`, branch `main`. Leave Root Directory and Build
>    Command empty, Publish Directory `.`. If the repo is not listed, give Render's GitHub
>    App access to the Wundermgmt organisation first.
> 2. **Manual Deploy → Deploy latest commit**, and keep **Auto-Deploy** on.
> 3. If the Render account itself was personal too: create a new Static Site from this repo
>    with the same settings. `render.yaml` holds them, so **New → Blueprint** also works.
>    The new service gets a new `*.onrender.com` URL, so update the ad links to it.
>
> **Keeping this copy current:** while the live site still deploys from
> `jio-wunder/careers-site`, copy every change here too (all files except this note).

The public careers site. Static files, no build step, no framework.

**Live:** https://wunder-careers-site.onrender.com

This is the **only** intake path for applications. All 8 Airtable forms were closed on
2026-08-07, and 22 Meta ads point at this domain — so a broken deploy here stops hiring.

## Why this repo exists

The site used to live inside `Wundermgmt/kg-hiring-screen` under `careers_site/site/`, and
reached production through a three-step dance: edit the screener repo, run
`careers_site/sync-site.sh` to rsync into a second public repo, then click **Manual Deploy**
in Render. The manual click was not a preference — Render's service was connected through the
"Public Git Repository" URL field, which installs no GitHub webhook, so `autoDeploy` could
never fire no matter what `render.yaml` said.

This repo is connected through Render's GitHub App instead, so a push deploys. One step.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The role list |
| `apply.html` | The job ad plus the multi-step application form |
| `assets/app.js` | Drives both pages |
| `assets/forms.js` | **Generated.** The 9 roles, their ad copy and their questions |
| `assets/angle.js` | Collapses Meta's three spellings of one ad creative into one slug |
| `assets/postings-live.js` | Merges live postings from the hiring admin app |
| `assets/config.js` | The only file edited by hand |
| `assets/styles.css` | All styling |

## How postings work now

`forms.js` renders first, then `postings-live.js` fetches
`https://wunder-hiring-admin.onrender.com/api/postings` and merges the result. Editing a
posting in the hiring admin tool changes this site within about two minutes, with no deploy.

**The order matters and is deliberate.** This page is the destination of paid ad traffic, and
the admin app runs on Render's free tier, which sleeps after 15 minutes and takes ~50 seconds
to wake. If the page waited on it, an asleep admin app would cost applications. So the baked
roles render instantly and the fetch only ever improves on them. A dead host, a timeout, a
non-2xx, malformed JSON or an empty list all leave the page exactly as it was.

## Editing

- **Copy, pay, hours, summary, full ad text** — do it in the hiring admin tool. No deploy.
- **Form questions** — these live in `assets/forms.js`, which is generated from
  `apps_script/hiring_forms/forms_source.py` in `kg-hiring-screen`. Regenerate there with
  `python3 careers_site/spec/generate_site_specs.py`, then copy the file here.
- **Anything else** — edit here and push. Render deploys automatically.

`assets/forms.js` is generated. Editing it by hand means the next regeneration silently
overwrites the change.

## Tests

The site's JavaScript is guarded by pytest driving the real browser files through node, and
those tests live with the generator in `kg-hiring-screen`:

```bash
# from a kg-hiring-screen checkout
python3 -m pytest careers_site/spec/ -q
```

## Gotchas paid for the hard way

- **curl cannot reach this site** — Cloudflare fronts it and TLS handshakes fail (exit 35).
  Check deploys in a real browser.
- **Cloudflare caches with `s-maxage=300`** and returns `cf-cache-status: HIT` even for
  cache-busting query strings. To confirm a deploy landed, poll a *new* asset's URL for a
  200 rather than diffing an existing page.
- **Do not change this service's URL.** 22 live Meta ads point at
  `wunder-careers-site.onrender.com`.
