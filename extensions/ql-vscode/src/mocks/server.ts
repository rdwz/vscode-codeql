import { setupServer } from 'msw/node';
import { createHandlers } from './handlers';

export const server = setupServer();

export function loadScenario(scenarioPath: string): void {
  server.resetHandlers();
  server.use(...createHandlers(scenarioPath));
}
