import * as vscode from "vscode";

export class BobFileDecorationProvider
  implements vscode.FileDecorationProvider
{
  provideFileDecoration(
    uri: vscode.Uri,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.FileDecoration> {
    if (uri.toString().includes("bob")) {
      return {
        propagate: true,
        badge: "✔",
        color: new vscode.ThemeColor("statusBarItem.remoteBackground"),
      };
    }

    return undefined;
  }

  public dipose(): any {
    // no op
  }
  // public provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FileDecoration> {

  //   throw new Error('Method not implemented.');
  // }
}
