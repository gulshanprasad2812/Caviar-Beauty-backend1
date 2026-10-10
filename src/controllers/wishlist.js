import { prisma } from '../db.js';

export const getWishlist = async (req, res, next) => {
  try {
    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.user.id },
      include: { product: { include: { images: { where: { isPrimary: true }, take: 1 }, brand: true } } },
    });
    res.json({ items });
  } catch (err) { next(err); }
};

export const addToWishlist = async (req, res, next) => {
  try {
    const { productId } = req.body;
    const existing = await prisma.wishlistItem.findUnique({ where: { userId_productId: { userId: req.user.id, productId } } });
    if (existing) return res.json(existing);
    const item = await prisma.wishlistItem.create({ data: { userId: req.user.id, productId } });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

export const removeFromWishlist = async (req, res, next) => {
  try {
    await prisma.wishlistItem.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    res.json({ message: 'Removed from wishlist' });
  } catch (err) { next(err); }
};

export const moveToCart = async (req, res, next) => {
  try {
    const item = await prisma.wishlistItem.findUnique({ where: { id: req.params.id }, include: { product: true } });
    if (!item || item.userId !== req.user.id) return res.status(404).json({ error: 'Item not found' });
    await prisma.cartItem.upsert({
      where: { userId_productId_variantId: { userId: req.user.id, productId: item.productId, variantId: null } },
      update: { quantity: { increment: 1 } },
      create: { userId: req.user.id, productId: item.productId },
    });
    await prisma.wishlistItem.delete({ where: { id: item.id } });
    res.json({ message: 'Moved to cart' });
  } catch (err) { next(err); }
};
