import * as crypto from 'crypto';
import * as os from 'os';
import {
  Uri,
  Location,
  Range,
  WebviewPanel,
  Webview,
  workspace,
  window as Window,
  ViewColumn,
  Selection,
  TextEditorRevealType,
  ThemeColor,
} from 'vscode';
import {
  tryGetResolvableLocation,
  isLineColumnLoc
} from './pure/bqrs-utils';
import { DatabaseItem, DatabaseManager } from './databases';
import { ViewSourceFileMsg } from './pure/interface-types';
import { Logger } from './logging';
import {
  LineColumnLocation,
  WholeFileLocation,
  UrlValue,
  ResolvableLocationValue
} from './pure/bqrs-cli-types';

/**
 * This module contains functions and types that are sharedd between
 * interface.ts and compare-interface.ts.
 */

/** Gets a nonce string created with 128 bits of entropy. */
export function getNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Whether to force webview to reveal
 */
export enum WebviewReveal {
  Forced,
  NotForced,
}

/**
 * Converts a filesystem URI into a webview URI string that the given panel
 * can use to read the file.
 */
export function fileUriToWebviewUri(
  panel: WebviewPanel,
  fileUriOnDisk: Uri
): string {
  return panel.webview.asWebviewUri(fileUriOnDisk).toString();
}

/**
 * Resolves the specified CodeQL location to a URI into the source archive.
 * @param loc CodeQL location to resolve. Must have a non-empty value for `loc.file`.
 * @param databaseItem Database in which to resolve the file location.
 */
function resolveFivePartLocation(
  loc: LineColumnLocation,
  databaseItem: DatabaseItem
): Location {
  // `Range` is a half-open interval, and is zero-based. CodeQL locations are closed intervals, and
  // are one-based. Adjust accordingly.
  const range = new Range(
    Math.max(0, loc.startLine - 1),
    Math.max(0, loc.startColumn - 1),
    Math.max(0, loc.endLine - 1),
    Math.max(1, loc.endColumn)
  );

  return new Location(databaseItem.resolveSourceFile(loc.uri), range);
}

/**
 * Resolves the specified CodeQL filesystem resource location to a URI into the source archive.
 * @param loc CodeQL location to resolve, corresponding to an entire filesystem resource. Must have a non-empty value for `loc.file`.
 * @param databaseItem Database in which to resolve the filesystem resource location.
 */
function resolveWholeFileLocation(
  loc: WholeFileLocation,
  databaseItem: DatabaseItem
): Location {
  // A location corresponding to the start of the file.
  const range = new Range(0, 0, 0, 0);
  return new Location(databaseItem.resolveSourceFile(loc.uri), range);
}

/**
 * Try to resolve the specified CodeQL location to a URI into the source archive. If no exact location
 * can be resolved, returns `undefined`.
 * @param loc CodeQL location to resolve
 * @param databaseItem Database in which to resolve the file location.
 */
export function tryResolveLocation(
  loc: UrlValue | undefined,
  databaseItem: DatabaseItem
): Location | undefined {
  const resolvableLoc = tryGetResolvableLocation(loc);
  if (!resolvableLoc || typeof resolvableLoc === 'string') {
    return;
  } else if (isLineColumnLoc(resolvableLoc)) {
    return resolveFivePartLocation(resolvableLoc, databaseItem);
  } else {
    return resolveWholeFileLocation(resolvableLoc, databaseItem);
  }
}

/**
 * Returns HTML to populate the given webview.
 * Uses a content security policy that only loads the given script.
 */
export function getHtmlForWebview(
  webview: Webview,
  scriptUriOnDisk: Uri,
  stylesheetUrisOnDisk: Uri[],
  allowInlineStyles: boolean
): string {
  // Convert the on-disk URIs into webview URIs.
  const scriptWebviewUri = webview.asWebviewUri(scriptUriOnDisk);
  const stylesheetWebviewUris = stylesheetUrisOnDisk.map(stylesheetUriOnDisk =>
    webview.asWebviewUri(stylesheetUriOnDisk));

  // Use a nonce in the content security policy to uniquely identify the above resources.
  const nonce = getNonce();

  const stylesheetsHtmlLines = allowInlineStyles
    ? stylesheetWebviewUris.map(uri => createStylesLinkWithoutNonce(uri))
    : stylesheetWebviewUris.map(uri => createStylesLinkWithNonce(nonce, uri));

  const styleSrc = allowInlineStyles
    ? 'https://*.vscode-webview.net/ vscode-file: \'unsafe-inline\''
    : `'nonce-${nonce}'`;

  const scriptSrc = `'nonce-${nonce}' ${webview.cspSource}`;

  // Issues:
  //  - Monaco uses web workers to organise language processing in the background
  //    to avoid blocking the UI thread. Our current CSP config shows this error:
  //        Refused to create a worker from 'blob:vscode-webview://7c042d06-a7fe-40ca-a46d-c2cfb80f7d7a/9522e8c9-6694-469e-9e3e-2bdc8d3d6275' because it violates the following Content Security Policy directive: "script-src nonce-UeD/G30pmLDOtlPirbjq/g== https://*.vscode-resource.vscode-webview.net". Note that 'worker-src' was not explicitly set, so 'script-src' is used as a fallback.
  //    It however has a fallback to load on the main thread if that fails, 
  //    so all the functionality still works but it it can potentially block the UI thread.
  //    Options:
  //      - Do nothing, accept there will be an error in the console (assuming the UI blocking
  //      isn't actually an issue because we're only using monaco for read only views (not editing).
  //      - We could relax CSP and add worker-src: 'blob:', but that is almost the same as allowing unsafe
  //      which is definitly not ideal.
  //      - Some other solution to load the worker that I'm not aware of, but note:
  //      https://code.visualstudio.com/api/extension-guides/webview#using-web-workers
  //      
  //  - Monaco tries to load an image which causes the following CSP error:
  //        Refused to load the image 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAAz0lEQVRIx2NgYGBY/R8I/vx5eelX3n82IJ9FxGf6tksvf/8FiTMQAcAGQMDvSwu09abffY8QYSAScNk45G198eX//yev73/4///701eh//kZSARckrNBRvz//+8+6ZohwCzjGNjdgQxkAg7B9WADeBjIBqtJCbhRA0YNoIkBSNmaPEMoNmA0FkYNoFKhapJ6FGyAH3nauaSmPfwI0v/3OukVi0CIZ+F25KrtYcx/CTIy0e+rC7R1Z4KMICVTQQ14feVXIbR695u14+Ir4gwAAD49E54wc1kWAAAAAElFTkSuQmCC' because it violates the following Content Security Policy directive: "img-src https://*.vscode-webview.net".
  //    The image (an image of a cursor?!) doesn't seem to actually be used.
  //    Options:
  //      - Do nothing, accept there will be an error in the console
  //      - We could relax CSP and add img-src: 'data:'. Again this is not ideal security wise.
  //      - We could poke further to see whether we could stop monaco from trying to load that image

  /*
   * Content security policy:
   * default-src: allow nothing by default.
   * script-src: allow only the given script, using the nonce.
   * style-src: allow only the given stylesheet, using the nonce.
   * connect-src: only allow fetch calls to webview resource URIs
   * (this is used to load BQRS result files).
   */
  return `
<html>
  <head>
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src ${scriptSrc}; style-src ${styleSrc}; connect-src ${webview.cspSource}; img-src ${webview.cspSource};">
        ${stylesheetsHtmlLines.join(`    ${os.EOL}`)}
  </head>
  <body>
    <div id=root>
    </div>
      <script nonce="${nonce}" src="${scriptWebviewUri}">
    </script>
  </body>
</html>`;
}

export async function showResolvableLocation(
  loc: ResolvableLocationValue,
  databaseItem: DatabaseItem
): Promise<void> {
  await showLocation(tryResolveLocation(loc, databaseItem));
}

export async function showLocation(location?: Location) {
  if (!location) {
    return;
  }

  const doc = await workspace.openTextDocument(location.uri);
  const editorsWithDoc = Window.visibleTextEditors.filter(
    (e) => e.document === doc
  );
  const editor =
    editorsWithDoc.length > 0
      ? editorsWithDoc[0]
      : await Window.showTextDocument(
        doc, {
        // avoid preview mode so editor is sticky and will be added to navigation and search histories.
        preview: false,
        viewColumn: ViewColumn.One,
      });

  const range = location.range;
  // When highlighting the range, vscode's occurrence-match and bracket-match highlighting will
  // trigger based on where we place the cursor/selection, and will compete for the user's attention.
  // For reference:
  // - Occurences are highlighted when the cursor is next to or inside a word or a whole word is selected.
  // - Brackets are highlighted when the cursor is next to a bracket and there is an empty selection.
  // - Multi-line selections explicitly highlight line-break characters, but multi-line decorators do not.
  //
  // For single-line ranges, select the whole range, mainly to disable bracket highlighting.
  // For multi-line ranges, place the cursor at the beginning to avoid visual artifacts from selected line-breaks.
  // Multi-line ranges are usually large enough to overshadow the noise from bracket highlighting.
  const selectionEnd =
    range.start.line === range.end.line ? range.end : range.start;
  editor.selection = new Selection(range.start, selectionEnd);
  editor.revealRange(range, TextEditorRevealType.InCenter);
  editor.setDecorations(shownLocationDecoration, [range]);
  editor.setDecorations(shownLocationLineDecoration, [range]);
}

const findMatchBackground = new ThemeColor('editor.findMatchBackground');
const findRangeHighlightBackground = new ThemeColor(
  'editor.findRangeHighlightBackground'
);


export const shownLocationDecoration = Window.createTextEditorDecorationType({
  backgroundColor: findMatchBackground,
});

export const shownLocationLineDecoration = Window.createTextEditorDecorationType(
  {
    backgroundColor: findRangeHighlightBackground,
    isWholeLine: true,
  }
);

export async function jumpToLocation(
  msg: ViewSourceFileMsg,
  databaseManager: DatabaseManager,
  logger: Logger
) {
  const databaseItem = databaseManager.findDatabaseItem(
    Uri.parse(msg.databaseUri)
  );
  if (databaseItem !== undefined) {
    try {
      await showResolvableLocation(msg.loc, databaseItem);
    } catch (e) {
      if (e instanceof Error) {
        if (e.message.match(/File not found/)) {
          void Window.showErrorMessage(
            'Original file of this result is not in the database\'s source archive.'
          );
        } else {
          void logger.log(`Unable to handleMsgFromView: ${e.message}`);
        }
      } else {
        void logger.log(`Unable to handleMsgFromView: ${e}`);
      }
    }
  }
}

function createStylesLinkWithNonce(nonce: string, uri: Uri): string {
  return `<link nonce="${nonce}" rel="stylesheet" href="${uri}">`;
}

function createStylesLinkWithoutNonce(uri: Uri): string {
  return `<link rel="stylesheet" href="${uri}">`;
}
