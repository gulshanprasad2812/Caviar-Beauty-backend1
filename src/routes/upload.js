import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { storeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const MAX_IMAGE_DIMENSION = process.env.MAX_IMAGE_DIMENSION ? parseInt(process.env.MAX_IMAGE_DIMENSION, 10) : 2000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

async function processImage(buffer) {
  const image = sharp(buffer, { failOn: 'error', limitInputPixels: 4000 * 4000 });
  const metadata = await image.metadata();
  const allowed = ['jpeg', 'png', 'webp', 'avif'];
  if (!allowed.includes(metadata.format)) {
    throw new AppError(400, 'Invalid image format. Allowed: JPEG, PNG, WebP, AVIF');
  }

  const pipeline = image.rotate().webp({ quality: 82 });
  if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
    pipeline.resize({
      width: metadata.width > metadata.height ? MAX_IMAGE_DIMENSION : undefined,
      height: metadata.height > metadata.width ? MAX_IMAGE_DIMENSION : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  return pipeline.toBuffer();
}

async function uploadToSupabase(buffer, filename) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { error } = await supabase.storage
    .from('uploads')
    .upload(filename, buffer, { contentType: 'image/webp', upsert: false });

  if (error) throw new AppError(500, `Failed to upload image: ${error.message}`);

  const { data } = supabase.storage.from('uploads').getPublicUrl(filename);
  return data.publicUrl;
}

async function uploadToDisk(buffer, filename) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

router.post('/', authenticate, authorize('ADMIN'), storeLimiter, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded');
    const processed = await processImage(req.file.buffer);
    const filename = `${uuidv4()}.webp`;

    let url;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      url = await uploadToSupabase(processed, filename);
    } else {
      url = await uploadToDisk(processed, filename);
    }

    res.json({ url });
  } catch (err) { next(err); }
});

export default router;
