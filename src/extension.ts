/* --------------------------------------------------------------------------------------------
 * Copyright (c) James Norton. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';

import { window, workspace, languages, commands, Range, CompletionItemProvider, Disposable, ExtensionContext, LanguageConfiguration } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';
import nrepl_client = require('jg-nrepl-client');
import {ReplConnection} from './replConnection';
import {spawn} from 'child_process';
import {ClojureCompletionItemProvider} from './clojureCompletionItemProvider';
import {ClojureDefinitionProvider} from './clojureDefinitionProvider';
import {ClojureHoverProvider} from './clojureHoverProvider';
import {EditorUtils} from './editorUtils';
import edn = require('jsedn');
import {} from 'languages';

const languageConfiguration: LanguageConfiguration = {
	comments: {
		"lineComment": ";"
	},
	brackets: [
		["{", "}"],
		["[", "]"],
		["(", ")"]
	],
	wordPattern: /[^\s()"',;~@#$%^&{}\[\]\\`\n]+/g
}

var extensionInitialized = false;

export function activate(context: ExtensionContext) {
	console.log("Starting Clojure extension...");
	let repl_port = 7777;
	var isInitialized = false;
	let regexp = new RegExp('nREPL server started on port');
	var rconn: ReplConnection;
	let env = {};
	let cfg = workspace.getConfiguration("clojure");
	// let cwd = "/Users/jnorton/Clojure/repl_test";
	// let repl = spawn('/usr/local/bin/lein', ["repl", ":headless", ":port", "" + repl_port], {cwd: cwd, env: env});

	// use default completions if none are available from Compliment
	//context.subscriptions.push(languages.registerCompletionItemProvider("clojure", new CompletionItemProvider()))

	rconn = new ReplConnection("127.0.0.1", repl_port);
	rconn.eval("(use 'compliment.core)", (err: any, result: any) => {
		if (!extensionInitialized) {
			extensionInitialized = true;
			context.subscriptions.push(languages.setLanguageConfiguration("clojure", languageConfiguration));
			context.subscriptions.push(languages.registerCompletionItemProvider("clojure", new ClojureCompletionItemProvider(rconn), ""));
			context.subscriptions.push(languages.registerDefinitionProvider("clojure", new ClojureDefinitionProvider(rconn)));
			context.subscriptions.push(languages.registerHoverProvider("clojure", new ClojureHoverProvider(rconn)));
			console.log("Compliment namespace loaded");
		}

	});

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };

	// If the extension is launched in debug mode the debug server options are used.
	// Otherwise the run options are used.
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: ['clojure'],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'languageServerExample',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	}

	// Create the language client and start the client.
	let client = new LanguageClient('Language Server Example', serverOptions, clientOptions);
	let disposable = client.start();
	let promise = client.onReady();
	// promise.then(() => {

	// 		let rconn = nrepl_client.connect({port: repl_port, host: "127.0.0.1", verbose: false});
	// 		rconn.eval("(use 'compliment.core)", (err: any, result: any) => {
	// 		// TODO move code into here so we can wait for this eval to finish
	// 		});
	// });
	// client.onReady(() => void {

	// });

	context.subscriptions.push(commands.registerCommand('clojure.eval', () => {
		// only support evaluating select text for now.
		// See https://github.com/indiejames/vscode-clojure-debug/issues/39.
		let editor = window.activeTextEditor;
		let selection = editor.selection;
		let range = new Range(selection.start, selection.end);
		let code = editor.document.getText(range);
		let ns = EditorUtils.findNSForCurrentEditor();
		// if (ns) {
		// 	rconn.eval(code, (err: any, result: any) : void => {
		// 		// TODO handle errors here
    // 	}, ns);
		// } else {
			rconn.eval(code, (err: any, result: any) : void => {
				// TODO handle errors here
				console.log("Evaluated code");
				console.log(result);
			});
		// }

	}));

	context.subscriptions.push(commands.registerCommand('clojure.refresh', () => {
		console.log("Calling refresh...")
		rconn.refresh((err: any, result: any) : void => {
			// TODO handle errors here
			console.log("Refreshed Clojure code.");
    });
	}));

	// TODO create a test runner class and moves these to it
	context.subscriptions.push(commands.registerCommand('clojure.run-all-tests', () => {
		if (cfg.get("refreshNamespacesBeforeRunnningAllTests") === true) {
			console.log("Calling refresh...")
			rconn.refresh((err: any, result: any) : void => {
				// TODO handle errors here
				console.log("Refreshed Clojure code.");
				rconn.runAllTests((err: any, result: any) : void => {
					console.log("All tests run.");
				});
			});
		} else {
			rconn.runAllTests((err: any, result: any) : void => {
				console.log("All tests run.");
			});
		}
	}));

	context.subscriptions.push(commands.registerCommand('clojure.run-test-file', () => {
		let ns = EditorUtils.findNSForCurrentEditor();
		if (cfg.get("refreshNamespacesBeforeRunnningTestNamespace") === true) {
			rconn.refresh((err: any, result: any) => {
				console.log("Refreshed Clojure code.");
				rconn.runTestsInNS(ns, (err: any, result: any) => {
					console.log("Tests for namespace " + ns + " run.");
				});
			});
		} else {
			rconn.runTestsInNS(ns, (err: any, result: any) => {
					console.log("Tests for ns " + ns + " run.");
				});
		}
	}));

	context.subscriptions.push(commands.registerCommand('clojure.run-test', () => {
		let ns = EditorUtils.findNSForCurrentEditor();
		let test = EditorUtils.getSymobleUnderCursor();
		if (cfg.get("refreshNamespacesBeforeRunnningTest") === true) {
			rconn.refresh((err: any, result: any) => {
				rconn.runTest(ns, test, (err: any, result: any) => {
					console.log("Test " + test + " run.");
				});
			});
		} else {
			rconn.runTest(ns, test, (err: any, result: any) => {
					console.log("Test " + test + " run.");
				});
		}
	}));

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	console.log("Clojure extension active");
}