import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

export const getCategories = async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null },
      include: { children: { where: { isActive: true } }, _count: { select: { products: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ categories });
  } catch (err) { next(err); }
};

export const getCategory = async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { slug: req.params.slug },
      include: { children: { where: { isActive: true } }, products: { where: { isActive: true }, take: 12, include: { images: { where: { isPrimary: true }, take: 1 }, brand: true } } },
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) { next(err); }
};

export const getAllCategoriesAdmin = async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { sortOrder: 'asc' } });
    res.json({ categories });
  } catch (err) { next(err); }
};

export const createCategory = async (req, res, next) => {
  try {
    const { name, slug, description, image, parentId, sortOrder } = req.body;
    if (!name || !slug) throw new AppError(400, 'Name and slug are required');
    const category = await prisma.category.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        description: description || null,
        image: image || null,
        parentId: parentId || null,
        sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      },
    });
    res.status(201).json(category);
  } catch (err) { next(err); }
};

export const updateCategory = async (req, res, next) => {
  try {
    const { name, slug, description, image, parentId, sortOrder, isActive } = req.body;
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(slug && { slug: slug.toLowerCase().replace(/\s+/g, '-') }),
        ...(description !== undefined && { description }),
        ...(image !== undefined && { image }),
        ...(parentId !== undefined && { parentId }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(category);
  } catch (err) { next(err); }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const count = await prisma.product.count({ where: { categoryId: req.params.id } });
    if (count > 0) {
      await prisma.category.update({ where: { id: req.params.id }, data: { isActive: false } });
      return res.json({ message: 'Category has products, deactivated instead' });
    }
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ message: 'Category deleted' });
  } catch (err) { next(err); }
};
