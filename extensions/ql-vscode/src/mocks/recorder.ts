import * as fs from 'fs-extra';
import { logger } from '../logging';
import { RequestResponse } from './request-response';
import { server } from './server';

export function recordScenario(recordingPath: string) {
  fs.ensureDirSync(recordingPath);

  // empty the directory?

  let recordedRequestCount = 0;
  const allRequests = new Map();

  server.events.on('request:start', (req) => {
    allRequests.set(req.id, req);
  });

  server.events.on('response:bypass', (res, reqId) => {
    const req = allRequests.get(reqId);
    if (!req) {
      return;
    }

    const url = req.url.toString();
    const requestKind = getRequestKind(url);

    if (requestKind) {
      recordedRequestCount++;

      const requestResponse: RequestResponse = {
        request: {
          url: url,
          method: req.method,
          body: req.body,
        },
        response: {
          status: res.status,

          // TODO: Make this work for binary responses.
          body: res.body ? JSON.parse(res.body) : undefined,
        }
      };

      const fileName = `${recordedRequestCount}-${requestKind}`;
      const filePath = `${recordingPath}/${fileName}.json`;
      fs.writeFileSync(filePath, JSON.stringify(requestResponse, null, 2));
    } else {
      void logger.log(`Unknown request: ${url}`);
    }
  });
}

type RequestKind =
  | 'getRepo'
  | 'submitVariantAnalysis'
  | 'getVariantAnalysis'
  | 'getVariantAnalysisRepo'
  | 'getVariantAnalysisRepoResult';

function getRequestKind(url: string): RequestKind | undefined {
  if (!url) {
    return undefined;
  }

  if (url.match(/\/repos\/[a-zA-Z0-9-_\.]+\/[a-zA-Z0-9-_\.]+$/)) {
    return 'getRepo';
  }

  if (url.match(/\/repositories\/\d+\/code-scanning\/codeql\/variant-analyses$/)) {
    return 'submitVariantAnalysis';
  }

  if (url.match(/\/repositories\/\d+\/code-scanning\/codeql\/variant-analyses\/\d+$/)) {
    return 'getVariantAnalysis';
  }

  if (url.match(/\/repositories\/\d+\/code-scanning\/codeql\/variant-analyses\/\d+\/repositories\/\d+$/)) {
    return 'getVariantAnalysisRepo';
  }

  // if url is a download URL for a variant analysis result, then it's a get-variant-analysis-repoResult.
  if (url.match(/objects-origin.githubusercontent.com\/codeql-query-console\/codeql-variant-analysis-repo-tasks/)) {
    return 'getVariantAnalysisRepoResult';
  }

  return undefined;
}
