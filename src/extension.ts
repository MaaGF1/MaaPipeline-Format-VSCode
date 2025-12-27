import * as vscode from 'vscode';
import * as path from 'path';
import { MaaPipelineFormatter, DEFAULT_CONFIG, MaaFormatConfig } from './MaaFormatter';

export function activate(context: vscode.ExtensionContext) {
    console.log('MAA Pipeline Formatter is now active (TypeScript Version)!');

    // Register Formatter
    const provider = vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'json' },
        new MAAJsonFormattingProvider()
    );

    // Register Format on Save
    const onSaveProvider = vscode.workspace.onWillSaveTextDocument(async (event) => {
        const config = vscode.workspace.getConfiguration('maapipeline-format');
        const enableFormatOnSave = config.get<boolean>('enableFormatOnSave', true);
        
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

function getConfiguration(): MaaFormatConfig {
    const vsConfig = vscode.workspace.getConfiguration('maapipeline-format');
    
    // Merge VS Code settings with Default Config
    // We clone the default config to avoid mutation
    const config: MaaFormatConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // Map VS Code specific settings if you expose them in package.json
    // For now, we rely on defaults or what you might add to package.json configuration section
    
    // Example: Overriding indent based on VS Code editor settings
    const editorConfig = vscode.workspace.getConfiguration('editor');
    if (!editorConfig.get('insertSpaces')) {
        config.indent.style = 'tab';
    }
    const tabSize = editorConfig.get<number>('tabSize');
    if (tabSize) {
        config.indent.width = tabSize;
    }

    return config;
}

async function doFormat(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    try {
        const text = document.getText();
        if (text.trim().length === 0) return [];

        const config = getConfiguration();
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