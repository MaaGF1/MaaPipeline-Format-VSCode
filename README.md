# MAA Pipeline Formatter

A Visual Studio Code extension for formatting MaaFramework Pipeline JSON files with intelligent structure-aware formatting.

## Features

- 🎯 **Smart Formatting**: Automatically detects and formats MaaFramework pipeline structures
- 📐 **Coordinate Arrays**: Keeps coordinate arrays (`roi`, `target`, etc.) on single lines
- 🔄 **Control Flow**: Formats control flow fields (`next`, `interrupt`) for readability
- 💬 **Comment Preservation**: Maintains JSON comments during formatting
- ⚡ **Fast Processing**: Uses built-in executable for optimal performance

## Usage

### Format Current Document
- **Command Palette**: `Ctrl+Shift+P` → "Format MAA Pipeline"
- **Keyboard Shortcut**: `Ctrl+Shift+Alt+F`
- **Right-click Menu**: "Format MAA Pipeline" in JSON files
- **Auto Format**: Enable "Format On Save" in VS Code settings