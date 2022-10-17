import { rest } from 'msw';
import { logger } from '../logging';

export const handlers = [
  // Absolute URLs are needed:
  // https://mswjs.io/docs/getting-started/integrate/node#direct-usage

  rest.get('https://api.github.com/repos/dsp-testing/qc-controller', (req, res, ctx) => {
    void logger.log('Request received: ' + req);
    return res(
      ctx.delay(100),
      ctx.status(418),
    );
  }),
];
