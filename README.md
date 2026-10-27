# PowerShell ISE for macOS

A replica of the PowerShell Integrated Scripting Environment layout (script pane,
console, command line, commands add-on, status bar) built with Electron. Every
script runs in PowerShell 7 (`pwsh`), not Windows PowerShell.

## Requirements

- macOS with Node.js 20+
- PowerShell 7: `brew install --cask powershell` or the package from https://aka.ms/powershell

## Run

```sh
npm install
npm start
```

## Build a .dmg

```sh
npm run dist
```

## Opening the app on macOS (unsigned build)

The `.dmg` is ad-hoc signed, not signed with an Apple Developer ID and not
notarized. When you download it, macOS blocks the first launch with a message
saying the app cannot be opened or is from an unidentified developer. To open it:

1. Open the `.dmg` and drag **PowerShell ISE** to Applications.
2. Open **Applications**, then **right-click** (or Control-click) **PowerShell ISE** and choose **Open**. Click **Open** in the dialog.

If macOS still blocks it, open **System Settings → Privacy & Security**, scroll
to the message about PowerShell ISE, click **Open Anyway**, and confirm.

Alternatively, remove the download quarantine flag in Terminal once:

```sh
xattr -dr com.apple.quarantine "/Applications/PowerShell ISE.app"
```

Only do this for builds you trust. The app is not notarized, so Gatekeeper
cannot check it.

## Keys

| Action | Shortcut |
| --- | --- |
| Run script | F5 |
| Run selection | F8 |
| Stop | Shift+F5 |
| New / Open / Save / Save As | Cmd+N / Cmd+O / Cmd+S / Shift+Cmd+S |

Scripts run in a fresh `pwsh -NoProfile` process. The console shows stdout and
stderr and the exit code.
