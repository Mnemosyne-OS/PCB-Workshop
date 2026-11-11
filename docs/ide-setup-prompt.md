# Setup prompt for an AI coding assistant

Copy everything in the block below into Claude Code, Cursor, Codex,
Antigravity or any agent that can run shell commands. It works in any
language: the agent answers in yours.

The agent installs what is missing, checks each step, and stops to ask you
before anything that needs an administrator, a download over 100 MB, or a
choice in Mnemosyne OS.

````text
You are setting up PCB Workshop, a Mnemosyne OS cartridge that drives KiCad.
Repository: https://github.com/Mnemosyne-OS/PCB-Workshop
Follow the steps in order. After each step, check it worked before going on.
Tell me what you found at each step in one or two short sentences.

RULES
- Ask me before: any command that needs administrator rights, any download
  over 100 MB, any installation. Say what it is and its size, then wait.
- Never change my KiCad projects. Never put a file path into the workshop:
  I pick projects myself in its file window.
- If a step fails twice, stop and tell me the exact error. Do not improvise
  a workaround that installs something else.
- If Mnemosyne OS answers DECLINED to a proposal, do not propose it again.

STEP 1. Detect the system
Find the operating system and the CPU architecture. Use the matching
commands below.

STEP 2. KiCad 9 or newer
The workshop only looks in these places, never on PATH:
- Windows: C:\Program Files\KiCad\<version>\bin\kicad-cli.exe,
  then %LOCALAPPDATA%\Programs\KiCad\<version>\bin\kicad-cli.exe
- macOS: /Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli
- Linux: /usr/bin/kicad-cli, then /usr/local/bin/kicad-cli
Check those paths and run "<path> version".
- Found, version 9 or more: go to step 3.
- Found, older than 9: tell me, and offer to install the current version.
- Not found: offer to install it. Ask me first; the Windows installer is
  about 1 GB.
  - Windows: winget install --id KiCad.KiCad -e
    (if winget is missing, give me the link https://www.kicad.org/download/)
  - macOS: brew install --cask kicad
  - Linux: open https://www.kicad.org/download/linux/ and use the package or
    PPA it names for my distribution. Do not use the Flatpak: its kicad-cli
    is not in the places the workshop looks.
After installing, run "<path> version" again and show me the line.

STEP 3. Mnemosyne OS newer than 2.2.0
If the Mnemosyne OS MCP server is connected, call mnemosyne_about and read
the version. Otherwise ask me to open Settings > About and tell you.
- Newer than 2.2.0: go on.
- 2.2.0 or older, or not installed: tell me the workshop needs a newer one,
  give me https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/latest,
  and wait until I say it is done.

STEP 4. Get the workshop
Clone the repository into a folder under my home folder, for example
~/MnemosyneApps/PCB-Workshop:
  git clone https://github.com/Mnemosyne-OS/PCB-Workshop
Check that the folder holds mnemo-plugin.json and dist/index.html.
Do not run npm install or a build: the built app is in dist/ already.

STEP 5. Add it to Mnemosyne OS
Two ways. Use the first one if the Mnemosyne OS actions server is connected
(it has the tools os_find and os_run). Otherwise use the second.
a) Tell me to look at the Mnemosyne OS window, because a box will open
   there. Then call:
     os_run { "action": "cartridge.link",
              "args": { "path": "<absolute path of the cloned folder>",
                        "agent": "<your name>" } }
   It waits up to 105 seconds for my answer.
   - success: note the id it returns.
   - ALREADY_LINKED: it is there already, go on.
   - DEV_LINK_LICENSE_REQUIRED: the free slot for an outside app is used.
     Tell me; do not retry.
   - DECLINED or TIMEOUT: tell me and stop this step.
b) Ask me to open MnemoHub, choose to add an external cartridge, and paste
   https://github.com/Mnemosyne-OS/PCB-Workshop. Wait until I say it is done.
Then ask me to accept the two permissions the workshop asks:
kicad:run and vault:write.

STEP 6. First check
Ask me to open PCB Workshop, press Add, and pick a KiCad project. Suggest
KiCad's demo board StickHub: find StickHub.kicad_pro inside KiCad's
"demos" folder on this computer and tell me its full path, so I can pick it.
When I say it is added, and if the actions server is connected:
  os_run { "action": "cartridge.run",
           "args": { "cartridgeId": "@mnemosyne-plugins/pcb",
                     "action": "check", "args": { "project": "StickHub" } } }
It answers "started". Then call the action "status" of the same cartridge
every 5 seconds until "busy" is null, at most 3 minutes. Tell me the verdict
and the main findings in plain words.

STEP 7. Report
Tell me in a short list: KiCad version and path, Mnemosyne OS version,
where the workshop is, and the result of the first check. If anything was
skipped or failed, say which step and why.

WHEN THE WORKSHOP REFUSES
- KICAD_NOT_FOUND: KiCad is not in the places of step 2.
- KICAD_TOO_OLD: install KiCad 9 or newer.
- "Unauthorized ... kicad:run" or every job refused: Mnemosyne OS is too
  old, or the permission was not accepted.
- NOT_OPEN: ask me to open PCB Workshop in Mnemosyne OS.
- FILE_LOCKED: a file of the order pack is open in another program.
````
