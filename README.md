[![中文](https://img.shields.io/badge/Language-中文-blue?style=flat-square)](README.zh-cn.md) [![License](https://img.shields.io/github/license/MaaGF1/MaaPipeline-Format-VSCode?style=flat-square)](LICENSE) [![Version](https://img.shields.io/visual-studio-marketplace/v/SwordofMorning.maapipeline-format?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=SwordofMorning.maapipeline-format)

<p align="center">
  <img src="icon.png" width="200" height="200" alt="LOGO">
</p>
<h1 align="center">MAA Pipeline Formatter</h1>

A specialized JSON formatter for [MaaFramework] Pipeline files, featuring intelligent structure-aware formatting and comment preservation.

## 1. Features

- **Structure-Aware Formatting**: Automatically keeps coordinate arrays (e.g., `roi`, `target`) and short control flows inline, while expanding complex parameter objects.
- **Comment Preservation**: Full support for JSONC (JSON with comments). Comments are preserved and intelligently indented.
- **Configurable**: Fully customizable formatting rules via a standalone configuration file.

## 2. How to Use

### 2.1 Installation

Search for `MAA Pipeline Formatter` in the VS Code Marketplace and install it.

### 2.2 Formatting

Open any `.json` file related to MaaFramework (e.g., `pipeline.json`, `task.json`).

- **Shortcut**: `Shift + Alt + F` (or `Ctrl + Shift + Alt + F` depending on your keybindings).
- **Command Palette**: `Ctrl + Shift + P` -> `Format Document`.
- **Right Click**: Select `Format Document` in the editor context menu.

### 2.3 Configuration

This extension uses a standalone configuration file instead of VS Code settings for formatting rules.

**Configuration Priority:**
1. `.maapipeline-format` in the workspace root.
2. `.vscode/maapipeline-format` in the workspace root.

**Auto-Generation:**
If no configuration file is found when you trigger formatting, the extension will **automatically generate** a default configuration file at `.vscode/maapipeline-format`.

**Configuration Example:**

```json
{
    "version": "1.0",
    "indent": {
        "style": "tab",                     // or "space"
        "width": 1
    },
    "posix": {
        "insert_final_newline": false
    },
    "formatting": {
        // Keep arrays in single rows if their length is less than this value and their structure is simple.
        "simple_array_threshold": 50,
        "coordinate_fields": [
            "roi",
            "roi_offset",
            "target",
            "target_offset",
            "begin",
            "begin_offset",
            "end",
            "end_offset",
            "lower",
            "upper"
        ],
        "control_flow_fields": [
            "next",
            "interrupt",
            "on_error",
            "template"
        ],
        "always_multiline_fields": [
            "custom_action_param",
            "custom_param",
            "parameters",
            "params",
            "options",
            "config"
        ]
    },
    "file_handling": {
        "preserve_comments": true,
        "output_suffix": "",
        "encoding": "utf-8",
        "newline": "LF"
    }
}
```

### 2.4 Format On Save

By default, **Format On Save is disabled** to prevent accidental changes. To enable it, add the following to your VS Code `settings.json`:

```json
"maapipeline-format.enableFormatOnSave": true
```

## 3. Feedback & Contributions

- [Submit Issues]
- QQ Group: `720731834`

## 4. Acknowledgments

### 4.1 Open Source Projects

1. [MaaFramework]
2. [MaaPipeline-Format-VSCode]

[MaaFramework]: https://github.com/MaaAssistantArknights/MaaFramework
[MaaPipeline-Format-VSCode]: https://github.com/MaaGF1/MaaPipeline-Format-VSCode
[Submit Issues]: https://github.com/MaaGF1/MaaPipeline-Format-VSCode/issues