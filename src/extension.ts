import * as vscode from 'vscode';
import { exec } from 'child_process';
import { log } from 'console';

export function activate(context: vscode.ExtensionContext) {
    console.log('Syrup-mode extension activated.');




    const checkCommand = (command: string): Promise<boolean> => {
        return new Promise((resolve) => {
            if (command === 'dot') {
                exec(`${command} -V`, (error) => {
                    console.error(`Checking for ${command}... ${!error ? 'found' : 'not found'}`);
                    console.error(error);
                    resolve(!error); // If no error, command exists
                });
            } else if (command === 'unzip') {
                exec(`${command}`, (error) => {
                    console.error(`Checking for ${command}... ${!error ? 'found' : 'not found'}`);
                    console.error(error);
                    resolve(!error); // If no error, command exists
                });
            } 
            else {
                exec(`${command} --version`, (error) => {
                    console.error(`Checking for ${command}... ${!error ? 'found' : 'not found'}`);
                    console.error(error);
                    resolve(!error); // If no error, command exists
                });
            }
        });
    };

    const installCommand = vscode.commands.registerCommand('syrup.install', () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Installing Syrup...',
            cancellable: false
        }, async (progress) => {
            try {
                // Platform-specific checks
                const isWindows = process.platform === 'win32';
                const isMac = process.platform === 'darwin';
                const isLinux = process.platform === 'linux';
                const isBSD = process.platform === 'freebsd';
    
                if (!isWindows && !isMac && !isLinux && !isBSD) {
                    vscode.window.showErrorMessage('Unsupported platform.');
                    return;
                } else {
                    vscode.window.showInformationMessage(`Detected platform: ${isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux/BSD'}`);
                }
    
                // Command checks for all platforms
                const commandsToCheck = {
                    ghc: 'ghc',
                    cabal: 'cabal',
                    graphviz: 'dot',  // Optional
                    curl: 'curl',
                    unzip: isWindows ? 'tar' : 'unzip', // Use 'tar' on Windows, 'unzip' on macOS/Linux
                };
    
                // Check for dependencies
                const isGhcInstalled = await checkCommand(commandsToCheck.ghc);
                const isCabalInstalled = await checkCommand(commandsToCheck.cabal);
                const isGraphvizInstalled = await checkCommand(commandsToCheck.graphviz); // Optional check for Graphviz
                const isWgetInstalled = await checkCommand(commandsToCheck.curl);
                const isUnzipInstalled = await checkCommand(commandsToCheck.unzip);
    
                // Show warnings for missing dependencies
                if (!isGhcInstalled) {
                    vscode.window.showWarningMessage("Warning: GHC (Glasgow Haskell Compiler) is not installed.");
                }
                if (!isCabalInstalled) {
                    vscode.window.showWarningMessage("Warning: Cabal is not installed.");
                }
                if (!isGraphvizInstalled) {
                    vscode.window.showWarningMessage("Warning: Graphviz is not installed (optional).");
                }
                if (!isWgetInstalled) {
                    vscode.window.showWarningMessage("Warning: curl is not installed.");
                }
                if (!isUnzipInstalled) {
                    vscode.window.showWarningMessage("Warning: unzip (or tar) is not installed.");
                }
    
                // Check if all required dependencies are available
                if (isGhcInstalled && isCabalInstalled && isWgetInstalled && isUnzipInstalled) {
                    progress.report({ increment: 10, message: "Downloading Syrup..." });
    
                    const execPromise = (command: string) => {
                        return new Promise<string>((resolve, reject) => {
                            exec(command, (error, stdout, stderr) => {
                                if (error) {
                                    reject(stderr);
                                } else {
                                    resolve(stdout);
                                }
                            });
                        });
                    };
    
                    try {
                        await execPromise('curl -L -o main.zip https://github.com/pigworker/Syrup/archive/refs/heads/main.zip');
                        progress.report({ increment: 30, message: "Extracting Syrup..." });
    
                        // Platform-specific extraction
                        if (isWindows) {
                            await execPromise('tar -xf main.zip'); // On Windows, use tar to extract
                        } else {
                            await execPromise('unzip -o main.zip'); // On macOS/Linux, use unzip
                        }
    
                        progress.report({ increment: 50, message: "Installing Syrup..." });
                        await execPromise('cd Syrup-main && cabal install --overwrite-policy=always');
    
                        vscode.window.showInformationMessage('Syrup installed successfully!');
                    } catch (err) {
                        const errorMessage = err instanceof Error ? err.message : 'An error occurred during the installation.';
                        vscode.window.showErrorMessage(`Error: ${errorMessage}`);
                    }
                } else {
                    vscode.window.showErrorMessage("Installation aborted due to missing dependencies.");
                }
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
                vscode.window.showErrorMessage(`An error occurred: ${errorMessage}`);
            }
        });
    });
    


    
    
    const provider = vscode.languages.registerCompletionItemProvider('syrup', {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
            const keywords = vscode.workspace.getConfiguration('syrup').get<string[]>('keywords') || ['where', 'type', 'display', 'cost', 'experiment'];
            return keywords.map(word => new vscode.CompletionItem(word, vscode.CompletionItemKind.Keyword));
        }
    });

    const runCommand = vscode.commands.registerCommand('syrup.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'syrup') {
            vscode.window.showErrorMessage('Active file is not a .syrup file.');
            return;
        }

        const filePath = document.uri.fsPath;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Running Syrup Script...',
            cancellable: false
        }, (progress) => {
            return new Promise<void>((resolve, reject) => {
                exec(`syrup -f "${filePath}"`, (error, stdout, stderr) => {
                    if (error) {
                        vscode.window.showErrorMessage(`Error running Syrup script: ${stderr}`);
                        reject(error);
                        return;
                    }

                    const sanitizedOutput = sanitizeOutput(stdout);
                    const { segments } = parseSyrupOutput(sanitizedOutput);

                    const panel = vscode.window.createWebviewPanel(
                        'syrupOutput',
                        'Syrup Output',
                        vscode.ViewColumn.Beside,
                        {
                            enableScripts: true,
                            retainContextWhenHidden: true
                        }
                    );

                    const htmlContent = generateWebviewContent(segments, panel.webview);
                    panel.webview.html = htmlContent;

                    resolve();
                });
            });
        });
    });

    context.subscriptions.push(installCommand, provider, runCommand);
}

export function deactivate() {
    console.log('Syrup-mode extension deactivated.');
}

function parseSyrupOutput(output: string): { segments: Array<{ type: 'text' | 'svg', content: string }> } {
    const segments: Array<{ type: 'text' | 'svg', content: string }> = [];
    const svgRegex = /(<svg[\s\S]*?<\/svg>)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = svgRegex.exec(output)) !== null) {
        const svgStart = match.index;
        const svgEnd = svgRegex.lastIndex;
        const svgContent = match[1];

        if (svgStart > lastIndex) {
            const text = output.substring(lastIndex, svgStart).trim();
            if (text) {
                segments.push({ type: 'text', content: text });
            }
        }

        segments.push({ type: 'svg', content: clean(svgContent) });

        lastIndex = svgEnd;
    }

    if (lastIndex < output.length) {
        const text = output.substring(lastIndex).trim();
        if (text) {
            segments.push({ type: 'text', content: text });
        }
    }

    return { segments };
}

function clean(svg: string): string {
    return svg.replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->|<script[\s\S]*?<\/script>/gi, '').trim();
}

function generateWebviewContent(segments: Array<{ type: 'text' | 'svg', content: string }>, webview: vscode.Webview): string {
    const styles = `
        <style>
            body { font-family: 'Courier New', monospace; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); }
            .output-text { white-space: pre-wrap; padding: 10px; margin-bottom: 20px; }
            .svg-container svg { max-width: 100%; border: 1px solid var(--vscode-editorLineNumber-activeForeground); }
        </style>
    `;

    return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Syrup Output</title>${styles}</head>
<body>${segments.map(seg => seg.type === 'text' ? `<div class="output-text">${escapeHtml(seg.content)}</div>` : `<div class="svg-container">${seg.content}</div>`).join('')}</body>
</html>`;
}

function escapeHtml(unsafe: string): string {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function sanitizeOutput(output: string): string {
    return output.replace(/<\?xml[^>]*\?>\s*/gi, '')
        .replace(/<!DOCTYPE[^>]*>\s*/gi, '')
        .replace(/<!--[\s\S]*?-->\s*/g, '')
        .trim();
}

