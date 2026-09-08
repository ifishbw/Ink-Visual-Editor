# build/

electron-builder's resource directory (`directories.buildResources` in `electron-builder.yml`), and
also where `npm run build:electron` drops the bundled main process and preload (`main.cjs`,
`preload.cjs` — generated, gitignored). The two icons here are committed so a clean checkout can
package without running the generator: `icon.ico` is used for the Windows installer and executable,
`icon.png` (1024x1024) for the Linux AppImage and .deb. To regenerate them after changing the
artwork, run `npm run build:icons` (`scripts/make-icons.mjs` — pure Node, draws the icon and writes
the PNG and ICO containers itself, so there is nothing to install).
