import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { slugify } from '../utils/helpers.js';

export const getTags = async (req, res, next) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    res.json({ tags });
  } catch (err) { next(err); }
};

export const createTag = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) throw new AppError(400, 'Name is required');
    const slug = slugify(name);
    const tag = await prisma.tag.create({ data: { name: name.trim(), slug } });
    res.status(201).json(tag);
  } catch (err) { next(err); }
};

export const updateTag = async (req, res, next) => {
  try {
    const { name, isActive } = req.body;
    const data = {};
    if (name !== undefined) { data.name = name.trim(); data.slug = slugify(name); }
    if (isActive !== undefined) data.isActive = isActive;
    const tag = await prisma.tag.update({ where: { id: req.params.id }, data });
    res.json(tag);
  } catch (err) { next(err); }
};

export const deleteTag = async (req, res, next) => {
  try {
    await prisma.tag.delete({ where: { id: req.params.id } });
    res.json({ message: 'Tag deleted' });
  } catch (err) { next(err); }
};

export const getCollections = async (req, res, next) => {
  try {
    const collections = await prisma.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    res.json({ collections });
  } catch (err) { next(err); }
};

export const getCollection = async (req, res, next) => {
  try {
    const collection = await prisma.collection.findUnique({
      where: { slug: req.params.slug },
      include: {
        products: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              where: { isActive: true },
              include: {
                brand: true,
                category: true,
                images: { orderBy: { sortOrder: 'asc' } },
                inventory: true,
              },
            },
          },
        },
      },
    });
    if (!collection) throw new AppError(404, 'Collection not found');
    res.json({ ...collection, products: collection.products.map((p) => p.product).filter(Boolean) });
  } catch (err) { next(err); }
};

export const createCollection = async (req, res, next) => {
  try {
    const { name, description, image, sortOrder, productIds } = req.body;
    if (!name) throw new AppError(400, 'Name is required');
    const slug = slugify(name);
    const collection = await prisma.collection.create({
      data: {
        name: name.trim(),
        slug,
        description: description || null,
        image: image || null,
        sortOrder: parseInt(sortOrder || 0),
        products: productIds?.length
          ? { create: productIds.map((productId) => ({ productId })) }
          : undefined,
      },
    });
    res.status(201).json(collection);
  } catch (err) { next(err); }
};

export const updateCollection = async (req, res, next) => {
  try {
    const { name, description, image, sortOrder, isActive, productIds } = req.body;
    const data = {};
    if (name !== undefined) { data.name = name.trim(); data.slug = slugify(name); }
    if (description !== undefined) data.description = description;
    if (image !== undefined) data.image = image;
    if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder);
    if (isActive !== undefined) data.isActive = isActive;

    if (Array.isArray(productIds)) {
      data.products = {
        deleteMany: {},
        create: productIds.map((productId) => ({ productId })),
      };
    }

    const collection = await prisma.collection.update({ where: { id: req.params.id }, data });
    res.json(collection);
  } catch (err) { next(err); }
};

export const deleteCollection = async (req, res, next) => {
  try {
    await prisma.collection.delete({ where: { id: req.params.id } });
    res.json({ message: 'Collection deleted' });
  } catch (err) { next(err); }
};
