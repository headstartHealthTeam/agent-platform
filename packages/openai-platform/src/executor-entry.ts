import { createExecutorProxy } from './executor-proxy.js';
import { ExecutorSupervisor, serveExecutor } from './executor-supervisor.js';

if (process.argv[2] === 'proxy') createExecutorProxy().listen(8080, '0.0.0.0');
else if (process.argv[2] === 'supervisor') {
  const supervisor = new ExecutorSupervisor();
  const server = serveExecutor(supervisor);
  process.once('SIGTERM', () => {
    supervisor.stop();
    server.close();
  });
} else process.exitCode = 1;
