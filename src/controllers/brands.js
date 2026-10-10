import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

export const getBrands = async (_req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    res.json({ brands });
  } catch (err) { next(err); }
};

export const getAllBrandsAdmin = async (_req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } });
    res.json({ brands });
  } catch (err) { next(err); }
};

export const createBrand = async (req, res, next) => {
  try {
    const { name, slug, description, logo } = req.body;
    if (!name || !slug) throw new AppError(400, 'Name and slug are required');
    const brand = await prisma.brand.create({
      data: { name, slug: slug.toLowerCase().replace(/\s+/g, '-'), description: description || null, logo: logo || null },
    });
    res.status(201).json(brand);
  } catch (err) { next(err); }
};

export const updateBrand = async (req, res, next) => {
  try {
    const { name, slug, description, logo, isActive } = req.body;
    const brand = await prisma.brand.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(slug && { slug: slug.toLowerCase().replace(/\s+/g, '-') }),
        ...(description !== undefined && { description }),
        ...(logo !== undefined && { logo }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(brand);
  } catch (err) { next(err); }
};

export const deleteBrand = async (req, res, next) => {
  try {
    const count = await prisma.product.count({ where: { brandId: req.params.id } });
    if (count > 0) {
      await prisma.brand.update({ where: { id: req.params.id }, data: { isActive: false } });
      return res.json({ message: 'Brand has products, deactivated instead' });
    }
    await prisma.brand.delete({ where: { id: req.params.id } });
    res.json({ message: 'Brand deleted' });
  } catch (err) { next(err); }
};
