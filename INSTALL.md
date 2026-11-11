# Installing PCB Workshop

Three pieces, in this order: Mnemosyne OS, KiCad, then the workshop.

You can do it by hand with the steps below. You can also hand it to an AI
coding assistant: paste the prompt of
[docs/ide-setup-prompt.md](docs/ide-setup-prompt.md) into Claude Code, Cursor,
Codex or another agent that can run commands. It does the same steps, checks
each one, and asks you before anything that needs your approval.

## 1. Mnemosyne OS, newer than 2.2.0

The workshop needs the `kicad:run` door, which ships after Mnemosyne OS 2.2.0.

1. Download Mnemosyne OS from
   [the releases page](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/latest).
2. Install it and open it once.
3. Check the version in Settings › About. It must be newer than 2.2.0.

## 2. KiCad 9 or newer

The workshop runs `kicad-cli`, the command line that comes with KiCad. It
looks for it in the places the official installers use, never on your `PATH`.

| System | Install | Where the workshop looks |
|---|---|---|
| Windows | the installer from [kicad.org/download](https://www.kicad.org/download/), or `winget install --id KiCad.KiCad -e` | `C:\Program Files\KiCad\<version>\bin\kicad-cli.exe`, then `%LOCALAPPDATA%\Programs\KiCad\<version>\bin` |
| macOS | the installer from kicad.org, or `brew install --cask kicad` | `/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli` |
| Linux | your distribution's package, or the KiCad PPA named on kicad.org | `/usr/bin/kicad-cli`, then `/usr/local/bin/kicad-cli` |

On Linux, the Flatpak build of KiCad is not found yet: its `kicad-cli` lives
inside the Flatpak.

Check it worked. The command prints a version, 9 or more:

```bash
kicad-cli version
```

On Windows, if `kicad-cli` is not on your `PATH`, run it by its full path:

```powershell
& "C:\Program Files\KiCad\10.0\bin\kicad-cli.exe" version
```

KiCad's Windows installer is about 1 GB.

## 3. The workshop

Pick one of the two ways.

### In Mnemosyne OS

1. Open MnemoHub.
2. Choose to add an external cartridge, and paste
   `https://github.com/Mnemosyne-OS/PCB-Workshop`.
3. Accept the two permissions: `kicad:run` and `vault:write`.

### From a folder, with an AI coding assistant

1. Clone the repository into a folder under your home folder:

   ```bash
   git clone https://github.com/Mnemosyne-OS/PCB-Workshop
   ```

2. With Mnemosyne OS open, the assistant calls the `cartridge.link` action of
   the Mnemosyne OS MCP server with the folder's absolute path. A box opens in
   Mnemosyne OS with the name, version and permissions. You decide.

The first outside cartridge is free. A second one needs a Mnemosyne OS
licence.

## 4. First board

1. Open **PCB Workshop**.
2. Press **Add** and pick a KiCad project. KiCad's own demo boards are a good
   start, for example `stickhub` in KiCad's `demos` folder:
   - Windows: `C:\Program Files\KiCad\<version>\share\kicad\demos\stickhub\StickHub.kicad_pro`
   - macOS and Linux: look for a `demos` folder in KiCad's shared files.
3. Open the **Check** view and press **Check**. A small board takes a few
   seconds. A very large one can take over a minute.
4. Try **Render**, then **Order pack**.

## When something goes wrong

| What you see | What to do |
|---|---|
| « KiCad is not installed » | Install KiCad (step 2), then bring the workshop window back to the front: it looks again. |
| « This KiCad is too old » | Install KiCad 9 or newer. |
| Every job is refused, KiCad is installed | Mnemosyne OS is 2.2.0 or older. Update it (step 1). |
| « A file is open in another program » | Close the BOM or placement file in Excel, then run again. |
| « This project is too large to draw here » | The checks and exports still work; only the drawing is skipped. |
| A blank window | The cartridge's `dist/` folder is missing. Clone or install again. |
