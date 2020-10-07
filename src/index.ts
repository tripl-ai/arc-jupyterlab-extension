// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { CompleterModel } from './model'
import { CompletionConnector } from './connector'
import { CompletionHandler } from './handler'
import { Completer } from './widget'
import { ICompletionManager } from './tokens'

import { INotebookTracker, Notebook } from '@jupyterlab/notebook';
import { IChangedArgs } from '@jupyterlab/coreutils';
import { Widget } from '@lumino/widgets';

/**
 * The command IDs used by the completer plugin.
 */
namespace CommandIDs {
  export const invoke = 'completer:invoke';

  export const invokeNotebook = 'completer:invoke-notebook';

  export const select = 'completer:select';

  export const selectConsole = 'completer:select-console';

  export const selectNotebook = 'completer:select-notebook';

  export const selectFile = 'completer:select-file';
}

const javascriptRegex = /^%arc|^%configplugin|^%lifecycleplugin|^{/;
const shellRegex = /^%env|^%metadata|^%conf|^%list/;
const sqlRegex = /^%sql|^%sqlvalidate|^%metadatafilter|^%metadatavalidate|^%log|^%configexecute/;

/**
 * A plugin providing code completion for editors.
 */
const manager: JupyterFrontEndPlugin<ICompletionManager> = {
  id: 'arc-jupyerlab-extension:manager',
  autoStart: true,
  provides: ICompletionManager,
  activate: (app: JupyterFrontEnd): ICompletionManager => {
    const handlers: { [id: string]: CompletionHandler } = {};

    app.commands.addCommand(CommandIDs.invoke, {
      execute: args => {
        let id = args && (args['id'] as string);
        if (!id) {
          return;
        }

        const handler = handlers[id];
        if (handler) {
          handler.invoke();
        }
      }
    });

    app.commands.addCommand(CommandIDs.select, {
      execute: args => {
        let id = args && (args['id'] as string);
        if (!id) {
          return;
        }

        const handler = handlers[id];
        if (handler) {
          handler.completer.selectActive();
        }
      }
    });

    // default activate git plugin
    // app.restored.then(() => {
    //   app.shell.activateById("jp-git-sessions");
    // });

    return {
      register: (
        completable: ICompletionManager.ICompletable
      ): ICompletionManager.ICompletableAttributes => {
        const { connector, editor, parent } = completable;
        const model = new CompleterModel();
        const completer = new Completer({ editor, model });
        const handler = new CompletionHandler({ completer, connector });
        const id = parent.id;

        // Hide the widget when it first loads.
        completer.hide();

        // Associate the handler with the parent widget.
        handlers[id] = handler;

        // Set the handler's editor.
        handler.editor = editor;

        // Attach the completer widget.
        Widget.attach(completer, document.body);

        // Listen for parent disposal.
        parent.disposed.connect(() => {
          delete handlers[id];
          model.dispose();
          completer.dispose();
          handler.dispose();
        });

        return handler;
      }
    };
  }
};

const setNotebookCellsEditorLanguage = (notebook: Notebook) => {
  notebook.widgets.forEach(widget => {
    const text = widget.model.value.text;
    if (text) {
      // @ts-ignore 'mode' not in options as of release
      const mode = widget.editor.getOption('mode');
      if (false) {
      } else if (javascriptRegex.test(text)) {
        // @ts-ignore 'mode' not in options as of release
        widget.editor.setOption('mode', 'javascript');
        // @ts-ignore 'indentUnit' not in options as of release
        widget.editor.setOption('indentUnit', 2);
        // @ts-ignore 'indentWithTabs' not in options as of release
        widget.editor.setOption('indentWithTabs', false);
        // @ts-ignore 'smartIndent' not in options as of release
        widget.editor.setOption('smartIndent', false);
        widget.editor.setOption('tabSize', 2);
      } else if (sqlRegex.test(text)) {
        // @ts-ignore 'mode' not in options as of release
        widget.editor.setOption('mode', 'sql');
        // @ts-ignore 'indentUnit' not in options as of release
        widget.editor.setOption('indentUnit', 2);
        // @ts-ignore 'indentWithTabs' not in options as of release
        widget.editor.setOption('indentWithTabs', false);
        // @ts-ignore 'smartIndent' not in options as of release
        widget.editor.setOption('smartIndent', false);
        widget.editor.setOption('tabSize', 2);
      } else if (shellRegex.test(text)) {
        // @ts-ignore 'mode' not in options as of release
        widget.editor.setOption('mode', 'shell');
        // @ts-ignore 'indentUnit' not in options as of release
        widget.editor.setOption('indentUnit', 2);
        // @ts-ignore 'indentWithTabs' not in options as of release
        widget.editor.setOption('indentWithTabs', false);
        // @ts-ignore 'smartIndent' not in options as of release
        widget.editor.setOption('smartIndent', false);
        widget.editor.setOption('tabSize', 2);
      }
    }
  })
}

/**
 * An extension that registers notebooks for code completion.
 */
const notebooks: JupyterFrontEndPlugin<void> = {
  id: 'arc-jupyerlab-extension:notebooks',
  requires: [ICompletionManager, INotebookTracker],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    manager: ICompletionManager,
    notebooks: INotebookTracker
  ): void => {
    // Create a handler for each notebook that is created.
    notebooks.widgetAdded.connect((sender, panel) => {
      const editor = panel.content.activeCell?.editor ?? null;
      // const notebook = panel.content;
      const session = panel.sessionContext.session;
      // TODO: CompletionConnector assumes editor and session are not null
      const connector = new CompletionConnector({ session, editor });
      const handler = manager.register({ connector, editor, parent: panel });

      let updateConnector = () => {
        const editor = panel.content.activeCell?.editor ?? null;
        const session = panel.sessionContext.session;

        handler.editor = editor;

        // TODO: CompletionConnector assumes editor and session are not null
        handler.connector = new CompletionConnector({ session, editor });
      };

      // Update the handler whenever the prompt or session changes
      panel.content.activeCellChanged.connect(updateConnector);
      panel.sessionContext.sessionChanged.connect(updateConnector);

      let initialRender = true;
      panel.content.stateChanged.connect((notebook: Notebook, changed: IChangedArgs<any, any, string>) => {
        if (((initialRender && !notebook.model.dirty) || !initialRender) && ((changed.name == "activeCellIndex" && (changed.newValue as number) !== -1) || (changed.name == "mode"))) {
          initialRender = false;
          setNotebookCellsEditorLanguage(notebook);
        }
      })
    });

    // Add notebook completer command.
    app.commands.addCommand(CommandIDs.invokeNotebook, {
      execute: () => {
        const panel = notebooks.currentWidget;
        if (panel && panel.content.activeCell?.model.type === 'code') {
          return app.commands.execute(CommandIDs.invoke, { id: panel.id });
        }
      }
    });

    // Add notebook completer select command.
    app.commands.addCommand(CommandIDs.selectNotebook, {
      execute: () => {
        const id = notebooks.currentWidget && notebooks.currentWidget.id;

        if (id) {
          return app.commands.execute(CommandIDs.select, { id });
        }
      }
    });

    // Set enter key for notebook completer select command.
    app.commands.addKeyBinding({
      command: CommandIDs.selectNotebook,
      keys: ['Enter'],
      selector: `.jp-Notebook .jp-mod-completer-active`
    });
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  manager,
  notebooks
];
export default plugins;
