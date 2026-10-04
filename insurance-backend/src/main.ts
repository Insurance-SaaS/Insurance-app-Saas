import './utc';
// Load environment variables before the application modules are imported.
import * as dotenv from 'dotenv';
import * as path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Logger } from '@nestjs/common';
import { createApp } from './app.setup';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await createApp();

    // Start the server
    const port = Number.parseInt(process.env.PORT || '3000', 10);
    const host = '0.0.0.0';

    logger.log(`Binding to: ${host}:${port}`);
    await app.listen(port, host);

    logger.log(`Application is running on: http://${host}:${port}`);
    logger.log(`Swagger docs available at: http://${host}:${port}/api`);
    logger.log(`Health check available at: http://${host}:${port}/health`);
  } catch (error) {
    new Logger('Bootstrap').error('Error starting application:', error);
    process.exit(1);
  }
}

void bootstrap();
