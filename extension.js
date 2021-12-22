// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const child_process = require('child_process');
const fs_promises = require('fs/promises');
const util = require('util');

var exercism = {
	url: 'https://exercism.org/cli-walkthrough',
	cmd_show_configure: 'exercism configure -s',
	cmd_configure_token: 'exercism configure -t',
	cmd_configure_workspace: 'exercism configure -w'
};

switch (process.platform) {
	case "darwin":
		exercism.cmd_where = 'which';
		exercism.cmd_url_open = 'open';
		break;
	case "linux":
		exercism.cmd_where = 'which';
		exercism.cmd_url_open = 'xdg-open';
		break;
	case "win32":
		exercism.cmd_where = 'where';
		exercism.cmd_url_open = 'start';
		break;
	default:
		exercism.cmd_where = 'which';
		exercism.cmd_url_open = 'xdg-open';
}

async function exercism_where() {
	let [failed, filepath] = [true, '']

	try {
		const {stdout, stderr} = await util.promisify(child_process.exec)(`${exercism.cmd_where} exercism`);
		failed = false;
		filepath = stdout.trim();
	} catch(error) {
		failed = true;
	}

	if(failed) {
		return false;
	}

	const stats = await fs_promises.stat(filepath);
	if(stats.isFile()) {
		return filepath;
	} else {
		return false;
	}
}

async function exercism_initialize() {
	// find the exectuable filepath of `Exercism CLI`
	let filepath = await exercism_where();
	if(!filepath) {
		const value = await vscode.window.showErrorMessage('没有检测到Exercism命令行工具，请查看官网的安装教程，并在安装完成后重启VS Code。如果你没有配置命令行，也可以告诉我们Exercism可执行文件的位置。', '查看安装教程', '配置Exercism的位置');

		if (value === '查看安装教程') {
			child_process.exec(`${exercism.cmd_url_open} ${exercism.url}`);
			return false;
		} else if (value === '配置Exercism的位置') {
			try {
				filepath = (await vscode.window.showOpenDialog({canSelectMany: false}))[0].path;
			} catch(error) {
				return false;
			}
		}
	}
	return filepath;
}

async function exercism_input_token() {
	const input_string = await vscode.window.showInputBox({
		prompt: 'Please input the token',
		ignoreFocusOut: true
	});

	if(input_string) {
		const result  = await vscode.window.withProgress({
			cancellable: false,
			location: vscode.ProgressLocation.Notification,
		}, async (progress) => {
			progress.report({message: 'Configuring token...'});
			try {
				const {stdout, stderr} = await util.promisify(child_process.exec)(`${exercism.cmd_configure_token} ${input_string}`);
				return input_string;
			} catch(error) {
				const value = await vscode.window.showErrorMessage('无效的token。', '重新输入', '取消');
				if(value === '重新输入') {
					vscode.commands.executeCommand('exercism.configureToken');
				}
				return false;
			}
		});

		return result;
	}

	return input_string;
}

async function exercism_input_workspace() {
	const folderpath = (await vscode.window.showOpenDialog({canSelectMany: false, canSelectFiles: false, canSelectFolders: true}));

	if(folderpath && folderpath[0].path) {
		let folder = folderpath[0].path;
		const result = await vscode.window.withProgress({
			cancellable: false,
			location: vscode.ProgressLocation.Notification
		}, async (progress) => {
			progress.report({message: 'Configuring workspace...'});
			try {
				const {stdout, stderr} = await util.promisify(child_process.exec)(`${exercism.cmd_configure_workspace} ${folder}`);
				return folder;
			} catch(error) {
				const value = await vscode.window.showErrorMessage('无效的workspace。', '重新选择', '取消');
				if(value === '重新选择') {
					vscode.commands.executeCommand('exercism.configureWorkspace');
				}
				return false;
			}
		});

		return result;
	}

	return folderpath;
}

async function exercism_configure() {
	let [token, workspace] = [null, null];

	try {
		const {stdout, stderr} = await util.promisify(child_process.exec)(exercism.cmd_show_configure);
		const exercism_configs = stderr.trim().split('\n');
		for(let entry of exercism_configs) {

			if (entry.startsWith('Token')) {
				token = entry.split(' ').pop();
			} else if (entry.startsWith('Workspace')) {
				workspace = entry.split(' ').pop();
			}

		}
	} catch (error) {
		return false;
	}

	const configs = vscode.workspace.getConfiguration('exercism');

	if (token) {
		if (token !== configs.get('token')) {
			configs.update('token', token);
		}
	} else {
		vscode.window.showWarningMessage('Exercism: Token未配置', '配置').then(async (value)=> {
			if(value === '配置'){
				const token = await exercism_input_token();
				if (token) {
					configs.update('token', token);
				}
			}
		})
	}

	if (workspace) {
		if (workspace !== configs.get('workspace')) {
			configs.update('workspace', workspace);
		}
	} else {
		vscode.window.showWarningMessage('Exercism: Workspace未配置', '配置').then(async (value)=> {
			if(value === '配置'){
				const workspace = await exercism_input_workspace();
				if (workspace) {
					configs.update('workspace', workspace);
				}
			}
		})
	}

}

async function exercism_download_exercise(download_string) {
	try{
		const {stdout, stderr} = await util.promisify(child_process.exec)(download_string)
		return `${stderr.trim()} ${stdout.trim()}`;
	} catch(error) {
		return `${error.message}`
	}
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "exercism" is now active!');

	// initialize
	const exercism_path = context.globalState.get('exercism_path');
	// console.log(exercism_path)
	if (exercism_path && (await fs_promises.stat(exercism_path)).isFile()) {
		exercism.initialized = true;
	} else {
		const filepath = await exercism_initialize();
		if(filepath) {
			context.globalState.update('exercism_path', filepath);
			exercism.initialized = true;
		} else {
			exercism.initialized = false;
		}
	}

	// configure
	if (exercism.initialized) {
		exercism_configure();
	}
	// const configs = vscode.workspace.getConfiguration('exercism');
	// console.log(result);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json

	context.subscriptions.push(
		vscode.commands.registerCommand('exercism.configureToken',async function () {
			const token = await exercism_input_token();
			if(token) {
				vscode.workspace.getConfiguration('exercism').update('token', token);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercism.configureWorkspace',async function () {
			const workspace = await exercism_input_workspace();
			if(workspace) {
				vscode.workspace.getConfiguration('exercism').update('workspace', workspace);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercism.downloadExercise',async function () {
			// TODO: download exercism
			const download_string = await vscode.env.clipboard.readText();
			const input_string = await vscode.window.showInputBox({
				prompt: 'Please input the download command',
				ignoreFocusOut: true,
				value: download_string.startsWith('exercism download ') ? download_string : null
			});

			if(input_string && input_string.startsWith('exercism download ')) {
				await vscode.window.withProgress({
					cancellable: false,
					location: vscode.ProgressLocation.Notification,
				}, async (progress) => {
					progress.report({message: 'Downloading exercise...'});
					const result = await exercism_download_exercise(input_string);
					vscode.window.showInformationMessage(result);
				});
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercism.submitSolution', async function () {
			// TODO: submit solution
			const workspace = vscode.workspace.workspaceFolders[0].uri;
			const uri =  await vscode.workspace.findFiles('.exercism/config.json');
			if(uri && uri[0].scheme === 'file') {
				const json_path = uri[0].path;
				const raw_data = await fs_promises.readFile(json_path);
				const configs = JSON.parse(raw_data);
				const solution_files = configs.files.solution;
				let absoult_solution_files = [];
				for (let filepath of solution_files) {
					absoult_solution_files.push(vscode.Uri.joinPath(workspace, filepath).path);
				}

				const submit_command = `exercism submit ${absoult_solution_files.join(' ')}`;
				vscode.window.withProgress({
					cancellable: false,
					location: vscode.ProgressLocation.Notification
				}, async (progress) => {
					progress.report({message: 'Submiting solution...'});
					try {
						const {stdout, stderr} = await util.promisify(child_process.exec)(submit_command);
						vscode.window.showInformationMessage(`${stderr.trim()} ${stdout.trim()}`, '查看结果').then((value) => {
							if(value === '查看结果') {
								child_process.exec(`${exercism.cmd_url_open} ${stdout.trim()}`);
							}
						});
					} catch(error) {
						vscode.window.showErrorMessage(`${error.message}`);
					}
				})
			}
		})
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('exercism.options',async function () {
			// TODO: download exercism
			const value = await vscode.window.showQuickPick(['Download Exercise', 'Submit solution', 'Configure Token', 'Configure Workspace']);
			switch(value) {
				case 'Download Exercise':
					vscode.commands.executeCommand('exercism.downloadExercise');
					break;
				case 'Submit solution':
					vscode.commands.executeCommand('exercism.submitSolution');
					break;
				case 'Configure Token':
					vscode.commands.executeCommand('exercism.configureToken');
					break;
				case 'Configure Workspace':
					vscode.commands.executeCommand('exercism.configureWorkspace');
					break;
				default:
					console.log('default');
			}
		})
	)

	exercism.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	exercism.status.command = 'exercism.submitSolution';
	exercism.status.text = 'Exercism Submit';

	if(exercism.initialized){
		exercism.status.show();
	}

	context.subscriptions.push(exercism.status);
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
