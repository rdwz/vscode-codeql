import * as fs from 'fs-extra';
import { rest } from 'msw';
import { logger } from '../logging';
import { RequestResponse } from './request-response';

export function createHandlers(scenarioDirPath: string) {

  const handlers = [];

  const files = fs.readdirSync(scenarioDirPath);
  const orderedFiles = files.sort((a, b) => {
    const aNum = parseInt(a.split('-')[0]);
    const bNum = parseInt(b.split('-')[0]);
    return aNum - bNum;
  });

  // This is very hacky but it can be tidied up easily. It looks like
  // msw it a bit different to nock - handlers are re-used and are 
  // not cleared out after they've been used. Which means that if we
  // want different behaviour for the same request, we need to deal
  // with that in the handler. 

  const getVariantAnalysisRequestFiles = orderedFiles.filter(f => f.endsWith('getVariantAnalysis.json'));
  let getVariantAnalysisRequestsIndex = 0;
  const getVariantAnalysisRequests: RequestResponse[] = [];
  for (const file of getVariantAnalysisRequestFiles) {
    const filePath = `${scenarioDirPath}/${file}`;
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const requestResponse = JSON.parse(fileContents) as RequestResponse;
    getVariantAnalysisRequests.push(requestResponse);
  }

  handlers.push(rest.get('https://api.github.com/repositories/375657907/code-scanning/codeql/variant-analyses/74', (req, res, ctx) => {
    void logger.log('GET request received: ' + req);
    const requestResponse = getVariantAnalysisRequests[getVariantAnalysisRequestsIndex];
    getVariantAnalysisRequestsIndex++;
    return res(
      ctx.delay(10),
      ctx.status(requestResponse.response.status),
      ctx.json(requestResponse.response.body),
    );
  }));

  for (const file of orderedFiles) {
    const filePath = `${scenarioDirPath}/${file}`;
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const requestResponse = JSON.parse(fileContents) as RequestResponse;
    const { request, response } = requestResponse;

    if (request.method === 'GET') {
      if (request.url === 'https://api.github.com/repositories/375657907/code-scanning/codeql/variant-analyses/74') {
        // Special case handled above
        continue;
      } else {
        handlers.push(rest.get(request.url, (req, res, ctx) => {
          void logger.log('GET request received: ' + req);
          return res(
            ctx.delay(10),
            ctx.status(response.status),
            ctx.json(response.body),
          );
        }));
      }
    } else if (request.method === 'POST') {
      handlers.push(rest.post(request.url, (req, res, ctx) => {
        void logger.log('POST request received: ' + req);
        return res(
          ctx.delay(10),
          ctx.status(response.status),
          // TODO: Deal with binary reponses (use ctx.body?)
          ctx.json(response.body),
        );
      }));
    }
  }

  return handlers;
}
