import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
    console.log('MAA Pipeline Formatter is now active!');

    // 注册格式化提供者
    const provider = vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'json' },
        new MAAJsonFormattingProvider(context)
    );

    // 注册命令
    let disposable = vscode.commands.registerCommand('maapipeline-format.formatDocument', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'json') {
            await formatDocument(editor.document, context);
        } else {
            vscode.window.showWarningMessage('Please open a JSON file to format.');
        }
    });

    context.subscriptions.push(provider, disposable);
}

class MAAJsonFormattingProvider implements vscode.DocumentFormattingEditProvider {
    constructor(private context: vscode.ExtensionContext) {}

    async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        try {
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
            vscode.window.showErrorMessage(`MAA Pipeline format failed: ${error}`);
        }
        
        return [];
    }
}

async function formatDocument(document: vscode.TextDocument, context: vscode.ExtensionContext): Promise<void> {
    try {
        const originalText = document.getText();
        const formattedText = await formatWithExecutable(originalText, context);
        
        if (formattedText && formattedText !== originalText) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(originalText.length)
                );
                
                await editor.edit(editBuilder => {
                    editBuilder.replace(fullRange, formattedText);
                });
                
                vscode.window.showInformationMessage('MAA Pipeline formatted successfully!');
            }
        } else {
            vscode.window.showInformationMessage('No formatting changes needed.');
        }
    } catch (error) {
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
            // 使用内置的可执行文件
            executablePath = getExecutablePath(context);
            
            if (!fs.existsSync(executablePath)) {
                reject(new Error(`Built-in executable not found: ${executablePath}. Please reinstall the extension.`));
                return;
            }
        } else {
            // 回退到 Python 脚本模式
            const pythonPath = config.get<string>('pythonPath', 'python');
            const scriptPath = path.join(context.extensionPath, 'python', 'format_pipeline.py');
            
            if (!fs.existsSync(scriptPath)) {
                reject(new Error(`Python script not found: ${scriptPath}. Please reinstall the extension.`));
                return;
            }
            
            return formatWithPython(jsonText, pythonPath, scriptPath).then(resolve).catch(reject);
        }

        // 执行内置可执行文件
        const process = spawn(executablePath, [], {
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                const errorMsg = stderr.trim() || `Formatter exited with code ${code}`;
                reject(new Error(errorMsg));
            }
        });

        process.on('error', (error) => {
            reject(new Error(`Failed to execute formatter: ${error.message}`));
        });

        // 设置超时
        const timeout = setTimeout(() => {
            process.kill();
            reject(new Error('Formatter execution timed out'));
        }, 30000);

        process.on('close', () => {
            clearTimeout(timeout);
        });

        // 发送 JSON 内容
        process.stdin.write(jsonText);
        process.stdin.end();
    });
}

async function formatWithPython(jsonText: string, pythonPath: string, scriptPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonPath, [scriptPath]);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                const errorMsg = stderr.trim() || `Python script exited with code ${code}`;
                reject(new Error(errorMsg));
            }
        });

        pythonProcess.on('error', (error) => {
            reject(new Error(`Failed to execute Python script: ${error.message}`));
        });

        pythonProcess.stdin.write(jsonText);
        pythonProcess.stdin.end();
    });
}

export function deactivate() {}