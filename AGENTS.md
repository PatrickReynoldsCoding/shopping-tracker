# Instructions for Claude (and any other agent) working on Shopping tracker

Read this file at the start of every session that touches this project.

## What it is

A two-person shared-spending app. `Code.gs` (server) and `Index.html` (the whole page) run on Google Apps Script, bound to a Google Sheet that holds the data. `appsscript.json` is the Apps Script manifest. `dev/` is a local preview with a fake Google runtime; it never goes to Apps Script.

## Never commit

- `.clasp.json` (holds the Script ID) and `.deployment-id` (holds the web app deployment ID). Both are git-ignored. This repository is public, so no IDs, links or account emails go into it.

## Deploying with clasp (any machine)

clasp is Google's command-line tool for Apps Script. This repo pins it as a dev dependency, so nothing is installed globally, and keeps its own login, so it works next to other clasp projects that use a different Google account.

One-time setup on a new machine:

1. Install Node.js 18 or newer, then clone the repo and run `npm install`. The repo's `.npmrc` sends npm to the public registry (registry.npmjs.org), whatever `~/.npmrc` says. Do not remove it and do not edit `~/.npmrc`.
2. Turn on the Apps Script API for the Google account that owns the Sheet: <https://script.google.com/home/usersettings>.
3. `npm run login` opens a browser. Sign in with the Google account that owns the Sheet. The login is saved in `~/.config/clasp/shopping-tracker/`, not in `~/.clasprc.json`, so other clasp projects keep their own accounts. `npm run whoami` shows which account is in use. A login needs a person at a browser: an agent asks the owner to run `npm run login` themselves.
4. `cp .clasp.json.example .clasp.json` and put in the Script ID (Apps Script editor, Project Settings, IDs).
5. `npm run deployments`, then save the web app's deployment ID (the one that is not `@HEAD`) in a file called `.deployment-id`. Updating that deployment keeps the same web app URL on both phones.
6. `npm run pull`, then `git diff`. The pull writes the live code over the local files. Any difference means someone edited the code in the Apps Script editor: commit it or drop it before you deploy.

Every change after that:

1. `npm run preview` and try the change in `dev/preview.html`.
2. `npm run deploy -- -d "What changed"` pushes the code and points the existing deployment at a new version.

`npm run push` only uploads the code; the web app keeps serving the old version until you deploy. `npm run status` lists the files clasp will upload. `.claspignore` allows only `Code.gs`, `Index.html` and `appsscript.json`.

## Checks

There is no test suite. `npm run preview` builds `dev/preview.html`, which runs the real `Code.gs` against a fake in-memory sheet with demo data (see README, Developing).
