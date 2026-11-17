import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { RESERVED_PAGE_SLUGS } from '../contentDefaults.js';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LAYOUTS = new Set(['article', 'about']);

const str = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const optionalStr = (value, max = 400) => (value === undefined ? undefined : str(value, max) || null);

const list = (value, maxItems, maxLength) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
};

const normalizeTable = (raw) => {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const rows = raw.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
    if (!rows.length) return null;
    const columns = Object.keys(rows[0]).slice(0, 8).map((key) => key.toUpperCase().slice(0, 40));
    const body = rows.slice(0, 200).map((row) => {
      const byLowerKey = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
      );
      return Object.keys(rows[0]).slice(0, 8).map((key) => String(byLowerKey[key.toLowerCase()] ?? '').slice(0, 300));
    });
    return { columns, rows: body };
  }

  if (typeof raw === 'object') {
    const columns = list(raw.columns, 8, 40);
    if (!columns.length) return null;
    const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 200) : [];
    return {
      columns,
      rows: rows
        .filter((row) => Array.isArray(row))
        .map((row) => columns.map((_, index) => String(row[index] ?? '').slice(0, 300))),
    };
  }

  return null;
};

const normalizeSections = (raw) => {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new AppError(400, 'sections must be an array');
  if (raw.length > 40) throw new AppError(400, 'A page can have at most 40 sections');

  return raw
    .filter((section) => section && typeof section === 'object')
    .map((section) => ({
      heading: str(section.heading, 200),
      body: list(section.body, 40, 4000),
      items: list(section.items, 60, 2000),
      table: normalizeTable(section.table),
    }))
    .filter((section) => section.heading || section.body.length || section.items.length || section.table);
};

const normalizeData = (raw) => {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new AppError(400, 'data must be an object');
  const serialised = JSON.stringify(raw);
  if (serialised.length > 100_000) throw new AppError(400, 'data is too large');
  return raw;
};

const normalizeSlug = (raw) => {
  const slug = str(raw, 120).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new AppError(400, 'slug must contain only lowercase letters, numbers and single hyphens');
  }
  return slug;
};

const publicPage = (page) => ({
  slug: page.slug,
  title: page.title,
  subtitle: page.subtitle,
  seoTitle: page.seoTitle,
  seoDesc: page.seoDesc,
  layout: page.layout,
  sections: page.sections ?? [],
  data: page.data ?? null,
  updatedAt: page.updatedAt,
});

// ------------------------------------------------------------------ public
export const listPublicPages = async (_req, res, next) => {
  try {
    const pages = await prisma.contentPage.findMany({
      where: { isPublished: true },
      orderBy: { title: 'asc' },
      select: { slug: true, title: true, subtitle: true, updatedAt: true },
    });
    res.json({ pages });
  } catch (err) { next(err); }
};

export const getPublicPage = async (req, res, next) => {
  try {
    const slug = str(req.params.slug, 120).toLowerCase();
    const page = await prisma.contentPage.findUnique({ where: { slug } });
    if (!page) throw new AppError(404, 'Page not found');
    if (!page.isPublished && req.user?.role !== 'ADMIN') throw new AppError(404, 'Page not found');
    // Admins get the full row (including publish state) so the editor can load it.
    if (req.user?.role === 'ADMIN') return res.json(page);
    res.json(publicPage(page));
  } catch (err) { next(err); }
};

// ------------------------------------------------------------------ admin
export const listAdminPages = async (_req, res, next) => {
  try {
    const pages = await prisma.contentPage.findMany({ orderBy: { title: 'asc' } });
    res.json({ pages });
  } catch (err) { next(err); }
};

export const getAdminPage = async (req, res, next) => {
  try {
    const page = await prisma.contentPage.findUnique({ where: { id: req.params.id } });
    if (!page) throw new AppError(404, 'Page not found');
    res.json(page);
  } catch (err) { next(err); }
};

export const createPage = async (req, res, next) => {
  try {
    const slug = normalizeSlug(req.body.slug);
    const title = str(req.body.title, 200);
    if (!title) throw new AppError(400, 'title is required');

    const layout = LAYOUTS.has(req.body.layout) ? req.body.layout : 'article';
    const existing = await prisma.contentPage.findUnique({ where: { slug } });
    if (existing) throw new AppError(409, 'A page with that slug already exists');

    const page = await prisma.contentPage.create({
      data: {
        slug,
        title,
        subtitle: optionalStr(req.body.subtitle) ?? null,
        seoTitle: optionalStr(req.body.seoTitle) ?? null,
        seoDesc: optionalStr(req.body.seoDesc, 500) ?? null,
        layout,
        sections: normalizeSections(req.body.sections) ?? [],
        data: normalizeData(req.body.data) ?? null,
        isPublished: req.body.isPublished !== false,
        updatedBy: req.user?.id ?? null,
      },
    });
    res.status(201).json(page);
  } catch (err) { next(err); }
};

export const updatePage = async (req, res, next) => {
  try {
    const current = await prisma.contentPage.findUnique({ where: { id: req.params.id } });
    if (!current) throw new AppError(404, 'Page not found');

    const data = {};
    if (req.body.slug !== undefined) {
      const slug = normalizeSlug(req.body.slug);
      if (slug !== current.slug) {
        const clash = await prisma.contentPage.findUnique({ where: { slug } });
        if (clash) throw new AppError(409, 'A page with that slug already exists');
      }
      data.slug = slug;
    }
    if (req.body.title !== undefined) {
      const title = str(req.body.title, 200);
      if (!title) throw new AppError(400, 'title cannot be empty');
      data.title = title;
    }
    if (req.body.subtitle !== undefined) data.subtitle = optionalStr(req.body.subtitle);
    if (req.body.seoTitle !== undefined) data.seoTitle = optionalStr(req.body.seoTitle);
    if (req.body.seoDesc !== undefined) data.seoDesc = optionalStr(req.body.seoDesc, 500);
    if (req.body.layout !== undefined) {
      if (!LAYOUTS.has(req.body.layout)) throw new AppError(400, 'layout must be article or about');
      data.layout = req.body.layout;
    }
    if (req.body.sections !== undefined) data.sections = normalizeSections(req.body.sections);
    if (req.body.data !== undefined) data.data = normalizeData(req.body.data);
    if (req.body.isPublished !== undefined) data.isPublished = Boolean(req.body.isPublished);
    data.updatedBy = req.user?.id ?? null;

    const page = await prisma.contentPage.update({ where: { id: current.id }, data });
    res.json(page);
  } catch (err) { next(err); }
};

export const deletePage = async (req, res, next) => {
  try {
    const page = await prisma.contentPage.findUnique({ where: { id: req.params.id } });
    if (!page) throw new AppError(404, 'Page not found');
    if (RESERVED_PAGE_SLUGS.has(page.slug)) {
      throw new AppError(400, 'Storefront pages cannot be deleted. Unpublish it instead.');
    }
    await prisma.contentPage.delete({ where: { id: page.id } });
    res.json({ message: 'Page deleted' });
  } catch (err) { next(err); }
};
