# Installing InkVisual

InkVisual is a normal desktop application. You do not need Node.js, git, or a terminal to use it.

All downloads are on the **[Releases page](https://github.com/ifishbw/Ink-Visual-Editor/releases/latest)**.
Open the newest release and look under **Assets** for the file that matches your computer.

| File name looks like | Platform | What it is |
|---|---|---|
| `InkVisual-Setup-0.1.0-x64.exe` | Windows | Installer. Adds a Start-menu shortcut and an uninstaller. |
| `InkVisual-0.1.0-portable-x64.exe` | Windows | A single file that runs on the spot. Installs nothing. |
| `InkVisual-0.1.0-x64.AppImage` | Linux | A single file that runs on almost any distribution. |
| `InkVisual-0.1.0-x64.deb` | Debian, Ubuntu, Mint, Pop!_OS | A system package. |

The version number changes with each release; the shape of the names does not.

---

## Windows

### Which one?

- **Installer** if this is your own machine. It puts InkVisual in your user profile, adds it to the Start menu
  and gives you an entry in *Apps & features* so you can remove it cleanly.
- **Portable** if you cannot install software, want it on a USB stick, or just want to try it. Download it,
  put it anywhere, double-click it.

Neither one needs administrator rights: the installer installs for the current user only.

### The "Windows protected your PC" warning

This will happen, and it does not mean anything is wrong with the download. Publishing signed Windows software
requires a paid code-signing certificate, and InkVisual does not have one. Windows SmartScreen shows the same
blue box for every unsigned program it has not seen many times before.

What you will see, and what to click:

1. A blue full-screen box headed **"Windows protected your PC"**, with a single **Don't run** button.
2. Click the small **More info** link, just under the message text.
3. The box grows a second button: **Run anyway**. Click it.

That is all. Windows remembers the choice for that file.

You may also see, before that, a browser warning while downloading — in Edge or Chrome, an item in the
downloads list marked as not commonly downloaded, with a `...` menu offering **Keep**. Choose Keep, then
**Keep anyway** if asked again.

If you would rather check the file first, see [Verifying a download](#verifying-a-download) below.

### Installing

1. Double-click `InkVisual-Setup-<version>-x64.exe`.
2. Work through the SmartScreen box as above.
3. The installer runs. By default it installs to
   `C:\Users\<you>\AppData\Local\Programs\InkVisual`, and offers a desktop shortcut.
4. InkVisual appears in the Start menu.

### Running the portable build

Double-click `InkVisual-<version>-portable.exe`. It unpacks itself into a temporary folder each time it runs,
so first launch takes a couple of seconds longer than the installed version. Everything else is identical.

Your window layout and recent-project list are stored in your user profile, not next to the exe, so a portable
copy on a USB stick will not carry those settings from machine to machine. Your ink files and their
`.inkvisual.json` sidecars travel with the project folder as normal.

### Uninstalling

- **Installer:** Settings → *Apps* → *Installed apps* → **InkVisual** → *Uninstall*. Or run `Uninstall
  InkVisual.exe` from the install folder.
- **Portable:** delete the `.exe`.

Neither removes anything from your story folders. The `.inkvisual.json` sidecar next to your script is yours;
delete it by hand if you want it gone.

---

## Linux

### AppImage (works on any distribution)

1. Download `InkVisual-<version>.AppImage`.
2. Make it executable. In a file manager: right-click → *Properties* → *Permissions* → tick *Allow executing
   file as program*. In a terminal:

   ```sh
   chmod +x InkVisual-*.AppImage
   ```

3. Run it — double-click, or:

   ```sh
   ./InkVisual-*.AppImage
   ```

**If nothing happens, or you get an error mentioning FUSE**, your system is missing the FUSE 2 library that
AppImages use to mount themselves. Two options:

- Run it without FUSE:

  ```sh
  ./InkVisual-*.AppImage --appimage-extract-and-run
  ```

- Or install the library. On Ubuntu 22.04 and later, and on recent Debian:

  ```sh
  sudo apt install libfuse2
  ```

  (On Ubuntu 24.04 the package may be called `libfuse2t64`.) On Fedora: `sudo dnf install fuse-libs`.

Put the AppImage wherever you like — `~/Applications` is a common choice. To uninstall, delete the file.

If you want a menu entry, install [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or write
a `.desktop` file by hand; InkVisual does not integrate itself into your menus.

### .deb (Debian, Ubuntu, Mint, Pop!_OS)

Install from the folder you downloaded it into. The leading `./` matters — without it `apt` looks for a
package by that name in your repositories:

```sh
sudo apt install ./InkVisual*.deb
```

InkVisual then appears in your application menu.

To remove it:

```sh
sudo apt remove inkvisual
```

Add `--purge` if you also want its system-level configuration gone. Your ink files and sidecars are never
touched.

### A note on Wayland

If the window misbehaves under Wayland, launching with `--ozone-platform-hint=auto` usually settles it:

```sh
./InkVisual-*.AppImage --ozone-platform-hint=auto
```

---

## macOS

**There is no macOS build yet.** No `.dmg` or `.zip` is published, and the Windows and Linux downloads will not
run on a Mac.

The app itself is cross-platform, so a Mac user who is comfortable with a terminal can build and run it
locally: install Node.js, clone the repository, then `npm install` and `npm start`. See
[CONTRIBUTING.md](../CONTRIBUTING.md). Nothing about that path is supported or tested yet, and the result will
not be signed or notarised.

---

## Verifying a download

Each release lists file sizes, and GitHub serves the assets over HTTPS from `github.com`. If a release
includes a checksum file (`SHA256SUMS` or similar), you can confirm the download matches:

**Windows (PowerShell):**

```powershell
Get-FileHash .\InkVisual-Setup-0.1.0-x64.exe -Algorithm SHA256
```

**Linux:**

```sh
sha256sum InkVisual-0.1.0-x64.AppImage
```

Compare the result with the value published in the release. Only ever download InkVisual from
`https://github.com/ifishbw/Ink-Visual-Editor/releases` — nowhere else distributes it.

---

## Something went wrong

- Common problems and their fixes are in the [FAQ](FAQ.md).
- Still stuck? Open an issue at
  [github.com/ifishbw/Ink-Visual-Editor/issues](https://github.com/ifishbw/Ink-Visual-Editor/issues). Say
  which operating system you are on, which download you used, and what you saw. A screenshot helps.

Once it is running, go to the [User Guide](USER_GUIDE.md).
