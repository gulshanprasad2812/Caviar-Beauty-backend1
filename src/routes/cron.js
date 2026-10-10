import { Router } from 'express';
import { runAutoCancel } from '../jobs/autoCancelOrders.js';

const router = Router();

router.all('/auto-cancel', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await runAutoCancel();
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[cron:auto-cancel]', error);
    return res.status(500).json({ error: 'Auto-cancel failed' });
  }
});

export default router;
