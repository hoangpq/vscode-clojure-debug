import {DefinitionProvider, Definition, Location, TextDocument, Position, Uri, CancellationToken} from 'vscode';
import nrepl_client = require('jg-nrepl-client');
import edn = require('jsedn');
import {EditorUtils} from './editorUtils';
import {CompletionUtils} from './completionUtils';
import {ReplConnection} from './replConnection';

let chalk = require("chalk");

export class ClojureDefinitionProvider implements DefinitionProvider {

  private connection: ReplConnection;

  constructor(conn: ReplConnection) {
    this.connection = conn;
  }

  public provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Thenable<Definition> {
    let self = this;
    let ns = EditorUtils.findNSDeclaration(document.getText());
    let wordRange = document.getWordRangeAtPosition(position);
    let symbol = document.getText(wordRange);

    return new Promise<Definition>((resolve, reject) => {
      // Use the REPL to find the definition point
      self.connection.findDefinition(ns, symbol, (err: any, result: any) => {
        if (result && result.length > 0) {
          var def: Location[] = [];
          let res = result[0];
          let uri = Uri.file(res["path"]);
          let line = res["line"] - 1;
          let pos = new Position(line, 0);
          def = [new Location(uri, pos)];

          resolve(def);
        } else {
          reject(err);
        }
      });
    });
  }
}