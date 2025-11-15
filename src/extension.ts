import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

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
            const formattedText = await formatWithPython(originalText, this.context);
            
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
        const formattedText = await formatWithPython(originalText, context);
        
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

async function formatWithPython(jsonText: string, context: vscode.ExtensionContext): Promise<string> {
    return new Promise((resolve, reject) => {
        // 获取配置
        const config = vscode.workspace.getConfiguration('maapipeline-format');
        let pythonPath = config.get<string>('pythonPath', 'python');
        let scriptPath = config.get<string>('scriptPath', '');
        
        // 如果没有配置脚本路径，使用扩展内置的脚本
        if (!scriptPath) {
            scriptPath = path.join(context.extensionPath, 'python', 'format_pipeline.py');
        }
        
        // 检查脚本是否存在
        const fs = require('fs');
        if (!fs.existsSync(scriptPath)) {
            reject(new Error(`Python script not found: ${scriptPath}. Please install Python formatter or configure the path.`));
            return;
        }

        // 执行 Python 脚本
        const pythonProcess = spawn(pythonPath, [scriptPath], {
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });

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
            if (error.message.includes('ENOENT')) {
                reject(new Error(`Python not found. Please install Python or configure the path in settings. Error: ${error.message}`));
            } else {
                reject(new Error(`Failed to execute Python script: ${error.message}`));
            }
        });

        // 设置超时
        const timeout = setTimeout(() => {
            pythonProcess.kill();
            reject(new Error('Python script execution timed out'));
        }, 30000); // 30 seconds timeout

        pythonProcess.on('close', () => {
            clearTimeout(timeout);
        });

        // 将 JSON 内容发送给 Python 脚本
        pythonProcess.stdin.write(jsonText);
        pythonProcess.stdin.end();
    });
}

export function deactivate() {}