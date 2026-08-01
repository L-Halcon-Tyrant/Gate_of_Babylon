import cors from '@fastify/cors';
import Fastify from 'fastify';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get('/health', async () => ({ status: 'ok', service: 'learning-library-api' }));

const port = Number(process.env.PORT ?? 3000);

try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
