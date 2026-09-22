import { env } from './config/env.js';
import { log } from './config/logger.js';
import { pool } from './db/pool.js';
import { startProjector, stopProjector } from './events/projector.js';
import { createGraphQLServer, GRAPHQL_PATH } from './server.js';
import { startPrescriptionVerificationSaga, stopPrescriptionVerificationSaga } from './write/prescriptionVerificationSaga.js';

async function main() {
  await pool.query('select 1');
  const { httpServer, stop } = await createGraphQLServer();

  await startPrescriptionVerificationSaga();
  startProjector();

  httpServer.listen(env.port, () => {
    log.server(`🚀 GraphQL  http://localhost:${env.port}${GRAPHQL_PATH}`);
    log.server(`🔌 WS       ws://localhost:${env.port}${GRAPHQL_PATH}`);
    log.server(
      `CQRS: proyección con ${env.projectionDelayMs}ms de latencia · aprobación automática ${
        env.autoApproval ? `en ${env.approvalDelayMs}ms` : 'desactivada'
      }`,
    );
  });

  const shutdown = async (signal: string) => {
    log.server(`${signal} recibido, cerrando...`);
    stopProjector();
    stopPrescriptionVerificationSaga();
    await stop();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  log.error('No fue posible iniciar el servidor', error);
  process.exit(1);
});
