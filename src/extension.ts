import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
    console.log('MAA Pipeline Formatter is now active!');

    const provider = vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'json' },
        new MAAJsonFormattingProvider(context)
    );

    let disposable = vscode.commands.registerCommand('maapipeline-format.formatDocument', async () => {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showWarningMessage('No active editor. Please open a file first.');
            return;
        }

        const document = editor.document;
        
        const isJsonFile = isJsonDocument(document);
        
        if (isJsonFile) {
            await formatDocument(document, context);
        } else {
            vscode.window.showWarningMessage(
                `Current file is not a JSON file (detected: ${document.languageId}, extension: ${path.extname(document.fileName)}). Please open a JSON file to format.`
            );
        }
    });

    context.subscriptions.push(provider, disposable);
}

function isJsonDocument(document: vscode.TextDocument): boolean {
    if (document.languageId === 'json') {
        return true;
    }
    
    const extension = path.extname(document.fileName).toLowerCase();
    if (extension === '.json') {
        return true;
    }
    
    const fileName = path.basename(document.fileName).toLowerCase();
    const jsonFilePatterns = [
        /\.json$/,
        /^package\.json$/,
        /^tsconfig.*\.json$/,
        /^.*\.config\.json$/
    ];
    
    for (const pattern of jsonFilePatterns) {
        if (pattern.test(fileName)) {
            return true;
        }
    }
    
    if (document.getText().trim().length > 0) {
        try {
            const text = document.getText().trim();
            if ((text.startsWith('{') && text.endsWith('}')) || 
                (text.startsWith('[') && text.endsWith(']'))) {
                return true;
            }
        } catch {

        }
    }
    
    return false;
}

class MAAJsonFormattingProvider implements vscode.DocumentFormattingEditProvider {
    constructor(private context: vscode.ExtensionContext) {}

    async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        try {
            // 使用同样的检测逻辑
            if (!isJsonDocument(document)) {
                console.log(`MAA Pipeline Formatter: Skipping non-JSON file: ${document.fileName}`);
                return [];
            }
            
            const originalText = document.getText();
            const formattedText = await formatWithExecutable(originalText, this.context);
            
            if (formattedText && formattedText !== originalText) {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(originalText.length)
                );
                return [vscode.TextEdit.replace(fullRange, formattedText)];
            }
        } catch (error) {
            console.error('MAA Pipeline format error:', error);
            vscode.window.showErrorMessage(`MAA Pipeline format failed: ${error}`);
        }
        
        return [];
    }
}

async function formatDocument(document: vscode.TextDocument, context: vscode.ExtensionContext): Promise<void> {
    try {
        const originalText = document.getText();
        
        if (originalText.trim().length === 0) {
            vscode.window.showInformationMessage('Document is empty, nothing to format.');
            return;
        }
        
        const formattedText = await formatWithExecutable(originalText, context);
        
        if (formattedText && formattedText !== originalText) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === document) {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(originalText.length)
                );
                
                await editor.edit(editBuilder => {
                    editBuilder.replace(fullRange, formattedText);
                });
                
                vscode.window.showInformationMessage('MAA Pipeline formatted successfully!');
            } else {
                vscode.window.showErrorMessage('Editor state changed during formatting.');
            }
        } else {
            vscode.window.showInformationMessage('No formatting changes needed.');
        }
    } catch (error) {
        console.error('Format document error:', error);
        vscode.window.showErrorMessage(`MAA Pipeline format failed: ${error}`);
    }
}

function getExecutablePath(context: vscode.ExtensionContext): string {
    const platform = os.platform();
    let executableName: string;
    
    switch (platform) {
        case 'win32':
            executableName = 'format_pipeline.exe';
            break;
        default:
            executableName = 'format_pipeline';
            break;
    }
    
    return path.join(context.extensionPath, 'dist', executableName);
}

async function formatWithExecutable(jsonText: string, context: vscode.ExtensionContext): Promise<string> {
    return new Promise((resolve, reject) => {
        const config = vscode.workspace.getConfiguration('maapipeline-format');
        const useBuiltinExecutable = config.get<boolean>('useBuiltinExecutable', true);
        
        let executablePath: string;
        
        if (useBuiltinExecutable) {
            executablePath = getExecutablePath(context);
            
            if (!fs.existsSync(executablePath)) {
                reject(new Error(`Built-in executable not found: ${executablePath}. Please reinstall the extension.`));
                return;
            }
        } else {
            const pythonPath = config.get<string>('pythonPath', 'python');
            const scriptPath = path.join(context.extensionPath, 'python', 'format_pipeline.py');
            
            if (!fs.existsSync(scriptPath)) {
                reject(new Error(`Python script not found: ${scriptPath}. Please reinstall the extension.`));
                return;
            }
            
            return formatWithPython(jsonText, pythonPath, scriptPath).then(resolve).catch(reject);
        }

        const workingDirectory: string = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 
                                        path.dirname(vscode.window.activeTextEditor?.document.fileName || '') ||
                                        require('process').cwd();

        const childProcess: ChildProcess = spawn(executablePath, [], {
            cwd: workingDirectory
        });

        let stdout = '';
        let stderr = '';

        childProcess.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        childProcess.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        childProcess.on('close', (code: number | null) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                const errorMsg = stderr.trim() || `Formatter exited with code ${code}`;
                reject(new Error(errorMsg));
            }
        });

        childProcess.on('error', (error: Error) => {
            reject(new Error(`Failed to execute formatter: ${error.message}`));
        });

        const timeout = setTimeout(() => {
            childProcess.kill();
            reject(new Error('Formatter execution timed out'));
        }, 30000);

        childProcess.on('close', () => {
            clearTimeout(timeout);
        });

        if (childProcess.stdin) {
            childProcess.stdin.write(jsonText);
            childProcess.stdin.end();
        } else {
            reject(new Error('Failed to access stdin of child process'));
        }
    });
}

async function formatWithPython(jsonText: string, pythonPath: string, scriptPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonProcess: ChildProcess = spawn(pythonPath, [scriptPath]);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        pythonProcess.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', (code: number | null) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                const errorMsg = stderr.trim() || `Python script exited with code ${code}`;
                reject(new Error(errorMsg));
            }
        });

        pythonProcess.on('error', (error: Error) => {
            reject(new Error(`Failed to execute Python script: ${error.message}`));
        });

        if (pythonProcess.stdin) {
            pythonProcess.stdin.write(jsonText);
            pythonProcess.stdin.end();
        } else {
            reject(new Error('Failed to access stdin of Python process'));
        }
    });
}

export function deactivate() {}