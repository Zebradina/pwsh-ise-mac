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

## Keys

| Action | Shortcut |
| --- | --- |
| Run script | F5 |
| Run selection | F8 |
| Stop | Shift+F5 |
| New / Open / Save / Save As | Cmd+N / Cmd+O / Cmd+S / Shift+Cmd+S |

Scripts run in a fresh `pwsh -NoProfile` process. The console shows stdout and
stderr and the exit code.
