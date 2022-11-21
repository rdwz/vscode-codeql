import * as fs from "fs-extra";
import * as path from "path";
import * as glob from "glob-promise";
import * as vscode from "vscode";
import {
  showAndLogInformationMessage,
  showAndLogWarningMessage,
} from "../../helpers";
import { encodeArchiveBasePath } from "../../archive-filesystem-provider";
import { DatabaseContents, DatabaseKind } from "./database-contents";

/**
 * An error thrown when we cannot find a valid database in a putative
 * database directory.
 */
class InvalidDatabaseError extends Error {}

async function resolveDatabase(
  databasePath: string,
): Promise<DatabaseContents> {
  const name = path.basename(databasePath);

  // Look for dataset and source archive.
  const datasetUri = await findDataset(databasePath);
  const sourceArchiveUri = await findSourceArchive(databasePath);

  return {
    kind: DatabaseKind.Database,
    name,
    datasetUri,
    sourceArchiveUri,
  };
}

// exported for testing
export async function findSourceArchive(
  databasePath: string,
): Promise<vscode.Uri | undefined> {
  const relativePaths = ["src", "output/src_archive"];

  for (const relativePath of relativePaths) {
    const basePath = path.join(databasePath, relativePath);
    const zipPath = basePath + ".zip";

    // Prefer using a zip archive over a directory.
    if (await fs.pathExists(zipPath)) {
      return encodeArchiveBasePath(zipPath);
    } else if (await fs.pathExists(basePath)) {
      return vscode.Uri.file(basePath);
    }
  }

  void showAndLogInformationMessage(
    `Could not find source archive for database '${databasePath}'. Assuming paths are absolute.`,
  );
  return undefined;
}

async function findDataset(parentDirectory: string): Promise<vscode.Uri> {
  /*
   * Look directly in the root
   */
  let dbRelativePaths = await glob("db-*/", {
    cwd: parentDirectory,
  });

  if (dbRelativePaths.length === 0) {
    /*
     * Check If they are in the old location
     */
    dbRelativePaths = await glob("working/db-*/", {
      cwd: parentDirectory,
    });
  }
  if (dbRelativePaths.length === 0) {
    throw new InvalidDatabaseError(
      `'${parentDirectory}' does not contain a dataset directory.`,
    );
  }

  const dbAbsolutePath = path.join(parentDirectory, dbRelativePaths[0]);
  if (dbRelativePaths.length > 1) {
    void showAndLogWarningMessage(
      `Found multiple dataset directories in database, using '${dbAbsolutePath}'.`,
    );
  }

  return vscode.Uri.file(dbAbsolutePath);
}

export async function resolveDatabaseContents(
  uri: vscode.Uri,
): Promise<DatabaseContents> {
  if (uri.scheme !== "file") {
    throw new Error(
      `Database URI scheme '${uri.scheme}' not supported; only 'file' URIs are supported.`,
    );
  }
  const databasePath = uri.fsPath;
  if (!(await fs.pathExists(databasePath))) {
    throw new InvalidDatabaseError(
      `Database '${databasePath}' does not exist.`,
    );
  }

  const contents = await resolveDatabase(databasePath);

  if (contents === undefined) {
    throw new InvalidDatabaseError(
      `'${databasePath}' is not a valid database.`,
    );
  }

  // Look for a single dbscheme file within the database.
  // This should be found in the dataset directory, regardless of the form of database.
  const dbPath = contents.datasetUri.fsPath;
  const dbSchemeFiles = await getDbSchemeFiles(dbPath);
  if (dbSchemeFiles.length === 0) {
    throw new InvalidDatabaseError(
      `Database '${databasePath}' does not contain a CodeQL dbscheme under '${dbPath}'.`,
    );
  } else if (dbSchemeFiles.length > 1) {
    throw new InvalidDatabaseError(
      `Database '${databasePath}' contains multiple CodeQL dbschemes under '${dbPath}'.`,
    );
  } else {
    contents.dbSchemeUri = vscode.Uri.file(
      path.resolve(dbPath, dbSchemeFiles[0]),
    );
  }
  return contents;
}

/** Gets the relative paths of all `.dbscheme` files in the given directory. */
async function getDbSchemeFiles(dbDirectory: string): Promise<string[]> {
  return await glob("*.dbscheme", { cwd: dbDirectory });
}
