import { pathExists, readdir, stat, remove, readFile } from "fs-extra";
import { EOL } from "os";
import { join } from "path";
import { Disposable, ExtensionContext } from "vscode";
import { extLogger } from "./common";
import { QueryHistoryManager } from "./query-history";

const LAST_SCRUB_TIME_KEY = "lastScrubTime";

type Counter = {
  increment: () => void;
};

/**
 * Registers an interval timer that will periodically check for queries old enought
 * to be deleted.
 *
 * Note that this scrubber will clean all queries from all workspaces. It should not
 * run too often and it should only run from one workspace at a time.
 *
 * Generally, `wakeInterval` should be significantly shorter than `throttleTime`.
 *
 * @param wakeInterval How often to check to see if the job should run.
 * @param throttleTime How often to actually run the job.
 * @param maxQueryTime The maximum age of a query before is ready for deletion.
 * @param queryDirectory The directory containing all queries.
 * @param ctx The extension context.
 */
export function registerQueryHistoryScrubber(
  wakeInterval: number,
  throttleTime: number,
  maxQueryTime: number,
  queryDirectory: string,
  qhm: QueryHistoryManager,
  ctx: ExtensionContext,

  // optional counter to keep track of how many times the scrubber has run
  counter?: Counter,
): Disposable {
  const deregister = setInterval(
    scrubQueries,
    wakeInterval,
    throttleTime,
    maxQueryTime,
    queryDirectory,
    qhm,
    ctx,
    counter,
  );

  return {
    dispose: () => {
      clearInterval(deregister);
    },
  };
}

async function scrubQueries(
  throttleTime: number,
  maxQueryTime: number,
  queryDirectory: string,
  qhm: QueryHistoryManager,
  ctx: ExtensionContext,
  counter?: Counter,
) {
  const lastScrubTime = ctx.globalState.get<number>(LAST_SCRUB_TIME_KEY);
  const now = Date.now();

  // If we have never scrubbed before, or if the last scrub was more than `throttleTime` ago,
  // then scrub again.
  if (lastScrubTime === undefined || now - lastScrubTime >= throttleTime) {
    await ctx.globalState.update(LAST_SCRUB_TIME_KEY, now);

    let scrubCount = 0; // total number of directories deleted
    try {
      counter?.increment();
      void extLogger.log("Scrubbing query directory. Removing old queries.");
      if (!(await pathExists(queryDirectory))) {
        void extLogger.log(
          `Cannot scrub. Query directory does not exist: ${queryDirectory}`,
        );
        return;
      }

      const baseNames = await readdir(queryDirectory);
      const errors: string[] = [];
      for (const baseName of baseNames) {
        const dir = join(queryDirectory, baseName);
        const scrubResult = await scrubDirectory(dir, now, maxQueryTime);
        if (scrubResult.errorMsg) {
          errors.push(scrubResult.errorMsg);
        }
        if (scrubResult.deleted) {
          scrubCount++;
        }
      }

      if (errors.length) {
        throw new Error(EOL + errors.join(EOL));
      }
    } catch (e) {
      void extLogger.log(`Error while scrubbing queries: ${e}`);
    } finally {
      void extLogger.log(`Scrubbed ${scrubCount} old queries.`);
    }
    await qhm.removeDeletedQueries();
  }
}

async function scrubDirectory(
  dir: string,
  now: number,
  maxQueryTime: number,
): Promise<{
  errorMsg?: string;
  deleted: boolean;
}> {
  const timestampFile = join(dir, "timestamp");
  try {
    let deleted = true;
    if (!(await stat(dir)).isDirectory()) {
      void extLogger.log(`  ${dir} is not a directory. Deleting.`);
      await remove(dir);
    } else if (!(await pathExists(timestampFile))) {
      void extLogger.log(`  ${dir} has no timestamp file. Deleting.`);
      await remove(dir);
    } else if (!(await stat(timestampFile)).isFile()) {
      void extLogger.log(`  ${timestampFile} is not a file. Deleting.`);
      await remove(dir);
    } else {
      const timestampText = await readFile(timestampFile, "utf8");
      const timestamp = parseInt(timestampText, 10);

      if (Number.isNaN(timestamp)) {
        void extLogger.log(
          `  ${dir} has invalid timestamp '${timestampText}'. Deleting.`,
        );
        await remove(dir);
      } else if (now - timestamp > maxQueryTime) {
        void extLogger.log(
          `  ${dir} is older than ${maxQueryTime / 1000} seconds. Deleting.`,
        );
        await remove(dir);
      } else {
        void extLogger.log(
          `  ${dir} is not older than ${maxQueryTime / 1000} seconds. Keeping.`,
        );
        deleted = false;
      }
    }
    return {
      deleted,
    };
  } catch (err) {
    return {
      errorMsg: `  Could not delete '${dir}': ${err}`,
      deleted: false,
    };
  }
}
