<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS: your memory, your machine, your rules." />

[**mnemosyne-os.io**](https://mnemosyne-os.io): the product&ensp;·&ensp;[**mnemosyne-os.com**](https://mnemosyne-os.com): for organizations&ensp;·&ensp;[**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io): the documentation

</div>

# PCB Workshop

A workshop for printed circuit boards that drives the KiCad on your
computer. A [Mnemosyne OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)
cartridge.

> [!WARNING]
> **PCB Workshop is in beta, and it needs a version of Mnemosyne OS newer
> than 2.2.0.**
>
> It uses a host door (`kicad:run`) that ships after Mnemosyne OS 2.2.0. On
> 2.2.0 the workshop opens, but every KiCad job is refused.
>
> It was built on Windows with KiCad 10.0.8 and checked on the demo boards
> KiCad ships. It ran in a test host fed with real KiCad outputs, not yet in a
> released Mnemosyne OS. macOS and Linux have not been tried. If something
> looks wrong, please open an issue.

**Install:** see [INSTALL.md](INSTALL.md). An AI coding assistant (Claude Code,
Cursor, Codex…) can do the whole setup for you with the prompt in
[docs/ide-setup-prompt.md](docs/ide-setup-prompt.md).

---

## What it does

You pick a KiCad project in a file window. The workshop shows it in five views.

- **Board and schematic.** Drawn by [KiCanvas](https://kicanvas.org), with
  every sheet of a hierarchical schematic.
- **Check.** KiCad's design rules check (DRC) on the board and electrical
  rules check (ERC) on the schematic. Findings are grouped by type. 41 types
  get a plain sentence in your language that says what is wrong and why it
  matters. Findings the designer excluded in KiCad are counted apart.
- **Order pack.** The files JLCPCB asks for: Gerber and drill files in one
  zip, the bill of materials and the placement file beside it, in JLCPCB's
  columns. The part number is read from the `LCSC`, `LCSC Part` or `JLC`
  field. The screen tells you how many parts have none.
- **Render.** A photo-like picture of the board, top or bottom, made by KiCad.
- **3D model.** The board as a STEP file, to open in
  [Parts](https://github.com/Mnemosyne-OS/MnemoParts) and take apart piece by
  piece.

A verdict sums up the check: errors to fix, warnings to review, or ready to
order. A board without a schematic is judged on its board check alone, and
the reverse.

## Beginner, maker or pro

The level is your setting, chosen at the top of the window.

- **Beginner** gets first steps and every explanation open.
- **Maker** gets the layers and file lists of the order pack.
- **Pro** also sees KiCad's own words next to each explanation.

## With the rest of Mnemosyne OS

- **Memory.** « Keep in memory » writes a sheet of the board into the
  workshop's own vault: what each check found, the order pack, your note. At
  the next board, the chat can find that the last one had 12 clearance errors.
- **Agents and voice.** Nine actions let the chat, the orb or a coding agent
  drive the workshop: « check my board », « prepare the JLCPCB order »,
  « explain the clearance error ».

## What it does not do

- It does not draw boards. You design in KiCad, the workshop checks and
  prepares what comes out.
- One board maker for now: JLCPCB.
- No automatic routing yet.
- It does not pick LCSC parts for you. The KiCad plugin
  [kicad-jlcpcb-tools](https://github.com/Bouni/kicad-jlcpcb-tools) does that
  well.

## What stays on your machine

Everything. KiCad runs on your computer. Your board and schematic are only
read. KiCad may add its small display-settings file (`.kicad_prl`) next to
them when the project has none. What KiCad makes goes into a work folder of
Mnemosyne OS. The JLCPCB link opens their page in your browser and sends
nothing.

## Permissions

| Permission | Why |
|---|---|
| `kicad:run` | Run KiCad's command line on a project you pick, with a closed list of jobs: check, order pack, STEP, render. The workshop never sees a path and never builds a command line: Mnemosyne OS does. |
| `vault:write` | Keep a board sheet in the workshop's own sandbox vault, when you press « Keep in memory ». |

## Licences

- This cartridge: MIT, see [LICENSE](LICENSE).
- KiCanvas (`public/vendor/kicanvas.js`): MIT, see
  [KICANVAS-LICENSE.md](public/vendor/KICANVAS-LICENSE.md). Bundle taken from
  kicanvas.org on 2026-11-10, upstream commit `b031159eb74a`.
- KiCad is GPL. It runs as a separate program and is not shipped here.

## Languages

English, French and Spanish. Other languages read English for now.

## Where Mnemosyne OS lives

This cartridge runs inside **Mnemosyne OS**, the sovereign, local-first memory operating system published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

<sub>**[Mnemosyne OS](https://mnemosyne-os.io)** — the sovereign, local-first memory OS this cartridge runs in.
Get it at [mnemosyne-os.io/download](https://mnemosyne-os.io/download), install cartridges from the built-in MnemoHub store, or [build your own](https://mnemosyne-os.io/dev).</sub>
