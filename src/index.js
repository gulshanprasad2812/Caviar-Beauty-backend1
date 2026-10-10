import dotenv from 'dotenv';
import { assertSecureConfig } from './utils/security.js';
import { prisma } from './db.js';
import app from './app.js';
import { startAutoCancelJob, stopAutoCancelJob } from './jobs/autoCancelOrders.js';

dotenv.config();

assertSecureConfig();

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

startAutoCancelJob();

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);
  stopAutoCancelJob();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
