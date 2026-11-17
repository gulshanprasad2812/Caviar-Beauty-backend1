import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { defaultSiteSettings } from '../contentDefaults.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TEXT_FIELDS = {
  brandName: 80,
  tagline: 160,
  supportEmail: 160,
  supportPhone: 40,
  whatsapp: 40,
  address: 300,
  hours: 160,
  footerBlurb: 500,
  announcement: 200,
};
const URL_FIELDS = ['instagramUrl', 'twitterUrl', 'linkedinUrl', 'youtubeUrl'];

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const cleanUrl = (value, field) => {
  const url = cleanText(value, 500);
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    throw new AppError(400, `${field} must start with http:// or https://`);
  }
  try {
    new URL(url);
  } catch {
    throw new AppError(400, `${field} is not a valid URL`);
  }
  return url;
};

const cleanHref = (value, field) => {
  const href = cleanText(value, 300);
  if (!href) return '';
  if (!href.startsWith('/') && !/^https?:\/\//i.test(href)) {
    throw new AppError(400, `${field} must be a site path starting with / or a full URL`);
  }
  return href;
};

const cleanHeroSlides = (raw) => {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new AppError(400, 'heroSlides must be an array');
  return raw.slice(0, 6)
    .filter((slide) => slide && typeof slide === 'object' && cleanText(slide.title, 120))
    .map((slide) => ({
      title: cleanText(slide.title, 120),
      subtitle: cleanText(slide.subtitle, 160),
      cta: cleanText(slide.cta, 60),
      ctaHref: cleanHref(slide.ctaHref, 'ctaHref'),
      cta2: cleanText(slide.cta2, 60),
      cta2Href: cleanHref(slide.cta2Href, 'cta2Href'),
    }));
};

const ensureSettings = () => prisma.siteSetting.upsert({
  where: { id: 'default' },
  update: {},
  create: { id: 'default', ...defaultSiteSettings },
});

const publicSettings = (settings) => {
  const { updatedBy, ...rest } = settings;
  return rest;
};

export const getSiteSettings = async (_req, res, next) => {
  try {
    res.json(publicSettings(await ensureSettings()));
  } catch (err) { next(err); }
};

export const updateSiteSettings = async (req, res, next) => {
  try {
    const data = {};

    for (const [field, max] of Object.entries(TEXT_FIELDS)) {
      if (req.body[field] === undefined) continue;
      const value = cleanText(req.body[field], max);
      if (field === 'brandName' && !value) throw new AppError(400, 'brandName cannot be empty');
      if (field === 'supportEmail' && value && !EMAIL_PATTERN.test(value)) {
        throw new AppError(400, 'supportEmail is not a valid email address');
      }
      data[field] = value || null;
    }

    for (const field of URL_FIELDS) {
      if (req.body[field] !== undefined) data[field] = cleanUrl(req.body[field], field);
    }

    const slides = cleanHeroSlides(req.body.heroSlides);
    if (slides !== undefined) data.heroSlides = slides;

    if (req.body.announcementEnabled !== undefined) {
      data.announcementEnabled = Boolean(req.body.announcementEnabled);
    }

    data.updatedBy = req.user?.id ?? null;

    const settings = await prisma.siteSetting.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...defaultSiteSettings, ...data },
    });
    res.json(publicSettings(settings));
  } catch (err) { next(err); }
};
