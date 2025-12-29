[![English](https://img.shields.io/badge/Language-English-blue?style=flat-square)](README.md) [![License](https://img.shields.io/github/license/MaaGF1/MaaPipeline-Format-VSCode?style=flat-square)](LICENSE) [![Version](https://img.shields.io/visual-studio-marketplace/v/SwordofMorning.maapipeline-format?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=SwordofMorning.maapipeline-format)

<p align="center">
  <img src="icon.png" width="200" height="200" alt="LOGO">
</p>
<h1 align="center">MAA Pipeline Formatter</h1>

专为 [MaaFramework] 流水线文件设计的 JSON 格式化工具，支持智能结构感知与注释保留。

## 一、功能特性

- **结构感知**：自动保持坐标数组(如 `roi`, `target`)和简短控制流字段在单行显示，同时强制展开复杂的参数对象；
- **注释保留**：支持`JSONC`，在格式化过程中保留注释并自动调整缩进；
- **自定义配置**：`Clang-Format`风格的独立配置文件完全自定义格式化规则；

## 二、如何使用

### 2.1 安装

在 VS Code 插件市场搜索 `MAA Pipeline Formatter` 并安装。

### 2.2 格式化

打开任意 MaaFramework 相关的 `.json` 文件(如 `pipeline.json`, `task.json`)。

- **快捷键**：`Shift + Alt + F` (或 `Ctrl + Shift + Alt + F`，取决于你的键位设置)。
- **命令面板**：`Ctrl + Shift + P` -> `Format Document` (格式化文档)。
- **右键菜单**：在编辑器中右键 -> `Format Document`。

### 2.3 配置说明

本插件现在使用**独立配置文件**来管理格式化规则，不依赖 VS Code 的设置项。

**配置优先级：**

1. 工作区根目录下的 `.maapipeline-format` 文件。
2. 工作区 `.vscode` 文件夹下的 `maapipeline-format` 文件。

**自动生成：**

当你触发格式化时，如果未找到上述配置文件，插件将**自动**在 `.vscode/maapipeline-format` 生成一份默认配置文件。你可以直接修改该文件来调整缩进、换行规则等。

**配置文件示例：**

```json
{
    "version": "1.0",
    "indent": {
        // 或 "space"
        "style": "tab",
        "width": 1
    },
    "posix": {
        "insert_final_newline": false
    },
    "formatting": {
        // 数组长度小于此值且结构简单时保持单行
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

### 2.4 保存时自动格式化

为了防止误操作，**保存时自动格式化 (Format On Save) 默认已关闭**。如果你希望开启此功能，请在 VS Code 的 `settings.json` 中添加：

```json
"maapipeline-format.enableFormatOnSave": true
```

## 三、反馈与贡献

- [提交 Issue]
- QQ交流群：`720731834`

## 四、致谢

### 4.1 开源项目

1. [MaaFramework]
2. [MaaPipeline-Format-VSCode]

[MaaFramework]: https://github.com/MaaAssistantArknights/MaaFramework
[MaaPipeline-Format-VSCode]: https://github.com/MaaGF1/MaaPipeline-Format-VSCode
[提交 Issue]: https://github.com/MaaGF1/MaaPipeline-Format-VSCode/issues