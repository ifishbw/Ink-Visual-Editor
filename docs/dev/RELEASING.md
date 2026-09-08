# Releasing InkVisual

Cutting a release is: bump the version, write the changelog, push a `v*` tag. GitHub
Actions does the rest — builds the Windows and Linux installers on their own runners and
publishes a GitHub Release with them attached.

Nothing is code-signed. That is a deliberate, documented limitation, not an oversight
(see [Unsigned builds](#unsigned-builds)).

---

## Test a build locally first

Do this before tagging, at least for anything bigger than a typo fix. A tag that fails in
CI costs you the delete-and-re-tag dance below.

```bash
npm ci
npm run typecheck
npm test
npm run dist:win        # Windows host: NSIS installer + portable exe
```

Installers land in `release/` (gitignored). Install the NSIS build, launch it, open one
of the projects in `examples/`, and check the things that only break when packaged:

- the window opens and the canvas renders (the `app://inkvisual/` scheme is serving `dist/`),
- **Open project** shows a native file dialog and can actually open a `.ink` file,
- editing a `.ink` file outside the app updates the graph (chokidar in the main process),
- saving writes the file back, and the sidecar `*.inkvisual.json` is written next to it,
- quit and relaunch: the last project, theme and dock width come back (that is `localStorage`
  keyed to the `app://inkvisual` origin — if it resets, the origin is not stable).

### You cannot build the Linux targets from Windows

`npm run dist:linux` needs a Linux host: the `.deb` target shells out to `dpkg-deb` under
`fakeroot`, and AppImage tooling is Linux-only. Options, in order of least hassle:

1. **Let CI do it.** Run the Release workflow with `workflow_dispatch` (Actions → Release →
   Run workflow). It builds both platforms and uploads the installers as job artifacts
   *without* creating a release. This is the dry run.
2. WSL2 (Ubuntu), clone the repo inside the Linux filesystem — not `/mnt/d`, the permission
   bits get mangled — then `npm ci && npm run dist:linux`.
3. Docker: `docker run --rm -v "$PWD":/project electronuserland/builder:latest bash -lc "npm ci && npm run dist:linux"`.

---

## The release steps

1. **Make sure `main` is green.** The CI workflow must be passing on the commit you are
   about to tag; the release workflow re-runs typecheck and tests anyway and will simply
   fail later if it is not.

2. **Bump the version** in `package.json`. Semver: `0.1.0` → `0.1.1` for fixes, `0.2.0`
   while the app is still pre-1.0 and anything user-visible changed.

3. **Update `CHANGELOG.md`** — a new section at the top, headed with the version and the
   date, grouped as Added / Changed / Fixed. Write it for a person who uses the app, not
   for someone reading the diff.

4. **Commit both together**, so the tag points at a commit whose `package.json` version
   matches the tag. electron-builder takes the installer filenames from that field, and a
   mismatch produces `InkVisual Setup 0.1.0.exe` attached to a release called `v0.1.1`.

   ```bash
   git add package.json CHANGELOG.md
   git commit -m "Release v0.1.1"
   ```

5. **Tag and push.**

   ```bash
   git tag v0.1.1
   git push origin main --tags
   ```

   The tag must start with `v` — the workflow triggers on `tags: ['v*']` and nothing else.

6. **Watch the run** under the repo's Actions tab. Roughly 6–12 minutes: the two build
   jobs run in parallel, then the publish job.

7. **Check the published release.** Download the Windows installer and the AppImage from
   the release page itself and run each once. An installer that only ever ran from
   `release/` on your own machine is not a tested installer.

`npm version 0.1.1` also works and creates the `v0.1.1` tag for you, but it commits before
you have written the changelog. If you use it, `git commit --amend` the changelog in
*before* pushing the tag.

---

## What CI does

**`.github/workflows/ci.yml`** — on every push to `main` and every pull request.
Ubuntu, Node 22: `npm ci` → `npm run typecheck` → `npm test` → `npm run build`. It sets
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` because nothing in that job launches Electron, which
saves the ~100 MB binary download. No installers are built here.

**`.github/workflows/release.yml`** — on a pushed `v*` tag, or manually via
`workflow_dispatch`.

| Job | Runner | Does |
| --- | --- | --- |
| `build (Windows)` | `windows-latest` | `npm ci`, typecheck, test, `npm run build`, `npx electron-builder --win --publish never` |
| `build (Linux)` | `ubuntu-latest` | the same with `--linux`, after checking `fakeroot` / `dpkg` are present and installing them if not |
| `release` | `ubuntu-latest` | downloads both jobs' artifacts and publishes the GitHub Release |

`fail-fast: false`, so a Windows failure still gets you the Linux installers to inspect.

`--publish never` is important: electron-builder never talks to GitHub itself. Uploading is
`softprops/action-gh-release@v2`'s job, in one place, after both platforms succeeded.

The release job is guarded by `if: startsWith(github.ref, 'refs/tags/v')`, which is what
makes `workflow_dispatch` a genuine dry run — it builds and uploads job artifacts, and
stops there.

### Where the artifacts land

electron-builder writes to `release/`. The build jobs upload these as job artifacts
(`installers-windows`, `installers-linux`, kept 7 days), and the release job attaches them
to the release:

| File | What it is |
| --- | --- |
| `InkVisual Setup <version>.exe` | Windows NSIS installer |
| `InkVisual <version>.exe` | Windows portable executable |
| `InkVisual-<version>.AppImage` | Linux, any distro |
| `inkvisual_<version>_amd64.deb` | Debian / Ubuntu |
| `latest.yml`, `latest-linux.yml`, `*.blockmap` | updater metadata; harmless, leave them attached |

(Exact filenames come from the electron-builder config; the shapes above are its defaults
for `productName: InkVisual`.)

The release body is written by the workflow: a short "which file do I download?" table plus
the SmartScreen warning, above GitHub's auto-generated changelog
(`generate_release_notes: true`, which lists merged PRs since the previous tag). Edit the
release afterwards on GitHub if you want to say more — hand-written notes belong at the top
of that body, and `CHANGELOG.md` is the durable copy.

---

## When a release fails

**A build job failed.** Nothing was published — the release job `needs` both builds. Fix
the problem on `main`, then move the tag:

```bash
git push --delete origin v0.1.1     # remove the remote tag
git tag -d v0.1.1                   # and the local one
# ... commit the fix ...
git tag v0.1.1
git push origin main --tags
```

**The release was published but is wrong** (missing an installer, bad version, wrong
notes). Delete the release *and* the tag, then re-tag. A release whose tag is deleted does
not disappear on its own; it turns into an orphan pointing at nothing.

```bash
gh release delete v0.1.1 --yes --cleanup-tag
git tag -d v0.1.1
# ... fix ...
git tag v0.1.1 && git push origin main --tags
```

Without `gh`: Releases → the release → Delete, then delete the tag under Tags.

**Someone already downloaded it.** Do not re-use the version number. Bump to `0.1.2` and
release again — a re-tagged version that differs from what people already have is how you
get bug reports nobody can reproduce.

**The release job fails with 403.** The token could not write. Check Settings → Actions →
General → Workflow permissions; the workflow asks for `contents: write` explicitly, but a
repository or organisation policy can still hold it down.

---

## Unsigned builds

There are no code-signing certificates, on either platform, and the workflow sets
`CSC_IDENTITY_AUTO_DISCOVERY: 'false'` so electron-builder does not go looking for one on
the runner. Consequences, all expected:

- **Windows**: SmartScreen shows "Windows protected your PC" on first run. The user has to
  click **More info → Run anyway**. This is documented in the release notes and in the
  README; do not try to work around it. It fades as a given build accumulates downloads,
  and it comes back for every new version.
- **Linux**: nothing complains. The AppImage needs `chmod +x`.

Buying an OV certificate (~$200–400/yr, and it still warms up SmartScreen slowly) or an EV
one (more, plus a hardware token) is the only real fix, and it is a decision for whoever
funds the project — not something to paper over in the build.

---

## One-time repo setup

Things a maintainer has to do by hand, once, in the GitHub UI:

- **Enable Discussions** (Settings → General → Features). The issue-template
  `config.yml` links there; without it the "Question or idea" link 404s.
- **Check workflow permissions** (Settings → Actions → General → Workflow permissions).
  "Read repository contents and packages permissions" is fine — the release workflow
  requests `contents: write` for its publish job on its own — but an org policy that
  forbids raising it will 403 the release.
- **Confirm `package-lock.json` is committed.** `npm ci` fails without it, in both
  workflows.
- **Add repo topics and a description** (`ink`, `inkle`, `interactive-fiction`,
  `narrative`, `electron`, `react`) so the project is findable.
- Optional hardening: **pin the third-party action to a commit SHA**. Only
  `softprops/action-gh-release@v2` is third-party; the rest are `actions/*`. To pin it:

  ```bash
  gh api repos/softprops/action-gh-release/git/refs/tags/v2 --jq .object.sha
  ```

  then replace `@v2` with `@<sha>` in `release.yml`, keeping `# v2.x.y` as a trailing
  comment so a human can still read it.
