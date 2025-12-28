import * as vscode from 'vscode';
import * as path from 'path';
import { MaaPipelineFormatter, DEFAULT_CONFIG, MaaFormatConfig } from './MaaFormatter';
import { TextDecoder, TextEncoder } from 'util';

export function activate(context: vscode.ExtensionContext) {
    console.log('MAA Pipeline Formatter is now active (Config File Support)!');

    // Register Formatter
    const provider = vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'json' },
        new MAAJsonFormattingProvider()
    );

    // Register Format on Save
    const onSaveProvider = vscode.workspace.onWillSaveTextDocument(async (event) => {
        const config = vscode.workspace.getConfiguration('maapipeline-format');
        // Default is now false in package.json, but we check here too
        const enableFormatOnSave = config.get<boolean>('enableFormatOnSave', false);
        
        if (!enableFormatOnSave) return;

        const document = event.document;
        if (isMaaPipelineJsonFile(document)) {
            event.waitUntil(doFormat(document));
        }
    });

    // Register Command
    let disposable = vscode.commands.registerCommand('maapipeline-format.formatDocument', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor.');
            return;
        }

        const document = editor.document;
        if (isJsonDocument(document)) {
            const edits = await doFormat(document);
            if (edits && edits.length > 0) {
                const edit = new vscode.WorkspaceEdit();
                edit.set(document.uri, edits);
                await vscode.workspace.applyEdit(edit);
                vscode.window.showInformationMessage('MAA Pipeline formatted successfully!');
            }
        } else {
            vscode.window.showWarningMessage('Current file is not a JSON file.');
        }
    });

    context.subscriptions.push(provider, onSaveProvider, disposable);
}

/**
 * Loads configuration from:
 * 1. .maapipeline-format (Workspace Root)
 * 2. .vscode/maapipeline-format (Workspace Root)
 * 
 * If neither exists, generates .vscode/maapipeline-format with defaults.
 */
async function loadOrGenerateConfiguration(document: vscode.TextDocument): Promise<MaaFormatConfig> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    
    // If no workspace (single file mode), use defaults without generating file
    if (!workspaceFolder) {
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    const rootUri = workspaceFolder.uri;
    const fs = vscode.workspace.fs;

    // Priority 1: .maapipeline-format in root
    const rootConfigUri = vscode.Uri.joinPath(rootUri, '.maapipeline-format');
    if (await fileExists(rootConfigUri)) {
        return await readConfig(rootConfigUri);
    }

    // Priority 2: .vscode/maapipeline-format
    const vscodeConfigUri = vscode.Uri.joinPath(rootUri, '.vscode', 'maapipeline-format');
    if (await fileExists(vscodeConfigUri)) {
        return await readConfig(vscodeConfigUri);
    }

    // Not found: Generate default config in .vscode/maapipeline-format
    try {
        const vscodeDir = vscode.Uri.joinPath(rootUri, '.vscode');
        if (!(await fileExists(vscodeDir))) {
            await fs.createDirectory(vscodeDir);
        }

        const defaultConfigContent = JSON.stringify(DEFAULT_CONFIG, null, 4); // Pretty print
        await fs.writeFile(vscodeConfigUri, new TextEncoder().encode(defaultConfigContent));
        
        vscode.window.showInformationMessage(`Created default configuration at ${vscodeConfigUri.fsPath}`);
        
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    } catch (e) {
        console.error("Failed to generate default config:", e);
        // Fallback to memory default if generation fails
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

async function readConfig(uri: vscode.Uri): Promise<MaaFormatConfig> {
    try {
        const fileData = await vscode.workspace.fs.readFile(uri);
        const jsonString = new TextDecoder().decode(fileData);
        const userConfig = JSON.parse(jsonString);
        
        // Merge with default to ensure all fields exist (deep merge is better, but simple spread works for top level)
        // Since the structure is nested, we do a basic merge. 
        // For production robustness, consider a deep merge utility.
        // Here we assume the user config is mostly complete or we trust it.
        // Let's do a safe merge on top of defaults.
        const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        
        // Helper to shallow merge keys
        if (userConfig.indent) Object.assign(merged.indent, userConfig.indent);
        if (userConfig.posix) Object.assign(merged.posix, userConfig.posix);
        if (userConfig.formatting) Object.assign(merged.formatting, userConfig.formatting);
        if (userConfig.file_handling) Object.assign(merged.file_handling, userConfig.file_handling);
        if (userConfig.version) merged.version = userConfig.version;

        return merged;
    } catch (e) {
        console.error(`Failed to parse config at ${uri.fsPath}:`, e);
        vscode.window.showErrorMessage(`Failed to parse MAA config file. Using defaults.`);
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
}

async function doFormat(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    try {
        const text = document.getText();
        if (text.trim().length === 0) return [];

        // Load config (async now)
        const config = await loadOrGenerateConfiguration(document);
        
        const formatter = new MaaPipelineFormatter(config);
        const formattedText = formatter.format(text);

        if (formattedText !== text) {
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            return [vscode.TextEdit.replace(fullRange, formattedText)];
        }
    } catch (error) {
        console.error('MAA Pipeline format error:', error);
        vscode.window.showErrorMessage(`Formatting failed: ${error}`);
    }
    return [];
}

class MAAJsonFormattingProvider implements vscode.DocumentFormattingEditProvider {
    async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        if (!isMaaPipelineJsonFile(document)) {
            return [];
        }
        return doFormat(document);
    }
}

// ============================================================================
// File Detection Utilities
// ============================================================================

function isMaaPipelineJsonFile(document: vscode.TextDocument): boolean {
    if (!isJsonDocument(document)) return false;

    const config = vscode.workspace.getConfiguration('maapipeline-format');
    const filePatterns = config.get<string[]>('filePatterns', ['pipeline', 'interface', 'task']);
    
    const fileName = path.basename(document.fileName, '.json').toLowerCase();
    
    // Check filename patterns
    for (const pattern of filePatterns) {
        if (fileName.includes(pattern.toLowerCase())) return true;
    }
    
    // Check content heuristics
    const text = document.getText();
    if (text.includes('"roi"') || text.includes('"recognition"') || text.includes('"action"') || text.includes('"target"')) {
        return true;
    }
    
    return false;
}

function isJsonDocument(document: vscode.TextDocument): boolean {
    if (document.languageId === 'json' || document.languageId === 'jsonc') return true;
    if (path.extname(document.fileName).toLowerCase() === '.json') return true;
    return false;
}

export function deactivate() {}