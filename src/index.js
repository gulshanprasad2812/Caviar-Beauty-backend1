// dotenv MUST be the first import: ES modules evaluate their dependencies
// before the importing module body runs, so reading process.env at module scope
// in app.js / paytm.js only works if the environment is loaded here first.
import 'dotenv/config';

import { assertSecureConfig, reportPaymentConfig } from './utils/security.js';
import { reportEmailConfig } from './services/email.js';
import { reportSmsConfig } from './services/sms.js';
import { prisma } from './db.js';
import app from './app.js';
import { startAutoCancelJob, stopAutoCancelJob } from './jobs/autoCancelOrders.js';

assertSecureConfig();
reportPaymentConfig();
reportEmailConfig();
reportSmsConfig();

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
