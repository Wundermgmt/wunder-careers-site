# Wunder Management — careers site

The public careers site: 8 open roles, each with its job ad and a 4-step
application form. Static files only — no build step, no server.

**This repo is a deploy target, not the source of truth.** The forms are generated
from `careers_site/spec/generate_site_specs.py` in the private repo
`Wundermgmt/kg-hiring-screen`. Edit questions there, regenerate, then copy
`careers_site/site/` over this repo's root.

## What is here

| Path | What it is |
|---|---|
| `index.html` | The 8 roles, filterable by team |
| `apply.html` | Job ad + application form, one page for all 8 roles (`?role=KEY`) |
| `assets/forms.js` | **Generated.** All 8 forms, 127 questions |
| `assets/config.js` | The intake endpoint and a few switches |
| `assets/app.js`, `assets/styles.css` | Form engine and styling |
| `render.yaml` | Render static-site config |

## Where applications go

`assets/config.js` points at a Google Apps Script web app bound to the
`Philippines Ads — Master` Google Sheet. Each submission lands on the tab matching
its Airtable table, and uploads go to a Drive folder. Nothing sensitive lives in
this repo — the endpoint is public by necessity, since applicants' browsers call it.

## Role keys

`chatters`, `qa_monitor`, `lead_researcher`, `creator_growth_manager`,
`reels_video_editor`, `head_shortform_editing`, `instagram_dm_setter`,
`appointment_setter`

Ad links look like:
`https://<site>/apply.html?role=chatters&utm_source=meta&utm_content=hook_a&angle=pay`
