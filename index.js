// Vercel entry point. The Express app is exported so the serverless runtime can
// handle requests; `src/index.js` keeps using app.listen for local/Docker runs.
import app from './src/app.js';

export default app;