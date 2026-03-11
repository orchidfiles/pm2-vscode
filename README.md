# PM2

[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/orchidfiles/pm2)](https://open-vsx.org/extension/orchidfiles/pm2)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

View and manage PM2 processes from VS Code and Cursor.

## Features

- View PM2 processes in a dedicated Explorer view
- See process status, CPU and memory usage
- Open logs in the integrated terminal
- Start, restart, and stop processes from inline actions
- Refresh automatically every 5 seconds
- Trigger a manual refresh from the view header

## Requirements

The extension expects `pm2` to be available in `PATH`.

Install `pm2` globally first:

```sh
npm install -g pm2
pm2 --version
```

## Installation

Open Extensions in VS Code or Cursor and search: `@id:orchidfiles.pm2`

Or install it from the command line:

```sh
# VS Code
code --install-extension orchidfiles.pm2

# Cursor
cursor --install-extension orchidfiles.pm2
```

## Build from source

```sh
git clone https://github.com/orchidfiles/pm2-vscode.git
cd pm2-vscode
pnpm install
pnpm package
```

This produces a `.vsix` file in the project root.  
Install it via `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) → "Extensions: Install from VSIX..." → select the file.

## Marketplaces

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=orchidfiles.pm2)  
[Open VSX](https://open-vsx.org/extension/orchidfiles/pm2)

## Support

Bug reports and feature requests: [GitHub issues](https://github.com/orchidfiles/pm2-vscode/issues)  
Other inquiries: [orchid@orchidfiles.com](mailto:orchid@orchidfiles.com)

---

Made by [orchidfiles.com](https://orchidfiles.com)
