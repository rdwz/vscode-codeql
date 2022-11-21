import { CancellationToken } from "vscode";
import { CodeQLCliServer } from "./cli";
import { ProgressCallback } from "./commandRunner";
import { DatabaseItem } from "./databases";
import { DatabaseContents } from "./databases/local/database-contents";
import { InitialQueryInfo, LocalQueryInfo } from "./query-results";
import { QueryWithResults } from "./run-queries-shared";

export abstract class QueryRunner {
  abstract restartQueryServer(
    progress: ProgressCallback,
    token: CancellationToken,
  ): Promise<void>;

  abstract cliServer: CodeQLCliServer;

  abstract onStart(
    arg0: (
      progress: ProgressCallback,
      token: CancellationToken,
    ) => Promise<void>,
  ): void;
  abstract clearCacheInDatabase(
    dbContents: DatabaseContents | undefined,
    dbPath: string,
    progress: ProgressCallback,
    token: CancellationToken,
  ): Promise<void>;

  abstract compileAndRunQueryAgainstDatabase(
    dbItem: DatabaseItem,
    initialInfo: InitialQueryInfo,
    queryStorageDir: string,
    progress: ProgressCallback,
    token: CancellationToken,
    templates?: Record<string, string>,
    queryInfo?: LocalQueryInfo, // May be omitted for queries not initiated by the user. If omitted we won't create a structured log for the query.
  ): Promise<QueryWithResults>;

  abstract deregisterDatabase(
    progress: ProgressCallback,
    token: CancellationToken,
    dbContents: DatabaseContents | undefined,
    dbPath: string,
  ): Promise<void>;

  abstract registerDatabase(
    progress: ProgressCallback,
    token: CancellationToken,
    dbContents: DatabaseContents | undefined,
    dbPath: string,
  ): Promise<void>;

  abstract upgradeDatabaseExplicit(
    dbItem: DatabaseItem,
    progress: ProgressCallback,
    token: CancellationToken,
  ): Promise<void>;

  abstract clearPackCache(): Promise<void>;
}
