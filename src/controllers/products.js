import { prisma } from '../db.js';

export const getProducts = async (req, res, next) => {
  try {
    const { category, brand, minPrice, maxPrice, color, size, sort, page = '1', limit = '12', search, tag, collection } = req.query;
    const where = { isActive: true };

    if (category) where.category = { slug: category };
    if (brand) where.brand = { slug: brand };
    if (tag) where.tags = { some: { tag: { slug: tag } } };
    if (collection) where.collections = { some: { collection: { slug: collection } } };
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }];
    if (minPrice || maxPrice) {
      where.basePrice = {};
      if (minPrice) where.basePrice.gte = parseFloat(minPrice);
      if (maxPrice) where.basePrice.lte = parseFloat(maxPrice);
    }
    if (color) where.variants = { some: { color: color } };
    if (size) where.variants = { ...where.variants, some: { ...where.variants?.some, size: size } };

    const orderBy = {};
    switch (sort) {
      case 'price_asc': orderBy.basePrice = 'asc'; break;
      case 'price_desc': orderBy.basePrice = 'desc'; break;
      case 'newest': orderBy.createdAt = 'desc'; break;
      case 'popular': orderBy.reviews = { _count: 'desc' }; break;
      case 'rating': orderBy.reviews = { _count: 'desc' }; break;
      default: orderBy.createdAt = 'desc';
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where, orderBy, skip, take: limitNum,
        include: { brand: true, category: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 }, variants: { where: { isActive: true } } },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ products, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) { next(err); }
};

export const getProduct = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const product = await prisma.product.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      include: {
        brand: true, category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true } },
        reviews: { include: { user: { select: { firstName: true, lastName: true, avatar: true } } }, orderBy: { createdAt: 'desc' } },
        inventory: true,
        tags: { include: { tag: true } },
        collections: { include: { collection: true } },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const related = await prisma.product.findMany({
      where: { categoryId: product.categoryId, id: { not: product.id }, isActive: true },
      take: 4,
      include: { images: { where: { isPrimary: true }, take: 1 }, brand: true },
    });

    res.json({ ...product, related });
  } catch (err) { next(err); }
};

export const searchProducts = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ products: [] });
    const products = await prisma.product.findMany({
      where: { isActive: true, name: { contains: q, mode: 'insensitive' } },
      take: 10,
      include: { images: { where: { isPrimary: true }, take: 1 }, brand: true },
    });
    res.json({ products });
  } catch (err) { next(err); }
};

export const getFeatured = async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true, isFeatured: true },
      take: 8,
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, brand: true },
    });
    res.json({ products });
  } catch (err) { next(err); }
};

export const getNewArrivals = async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true, isNewArrival: true },
      take: 8,
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, brand: true },
    });
    res.json({ products });
  } catch (err) { next(err); }
};

export const getBestSellers = async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true, isBestSeller: true },
      take: 8,
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, brand: true },
    });
    res.json({ products });
  } catch (err) { next(err); }
};

export const getAllProductsAdmin = async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      // This table only renders brand, category, images and stock. Keep the admin list
      // payload small; the edit screen loads the individual product when needed.
      include: { brand: true, category: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 }, inventory: true },
    });
    res.json({ products });
  } catch (err) { next(err); }
};

export const createProduct = async (req, res, next) => {
  try {
    const { name, slug, description, brandId, categoryId, basePrice, discountPrice, currency, material, specifications, isFeatured, isNewArrival, isBestSeller, isLimited, metaTitle, metaDesc, images, variants, tagIds, collectionIds } = req.body;
    const product = await prisma.product.create({
      data: {
        name, slug, description, brandId, categoryId, basePrice: parseFloat(basePrice), discountPrice: discountPrice ? parseFloat(discountPrice) : null, currency: currency || 'INR', material, specifications, sku: `CB-${slug.toUpperCase().replace(/-/g, '')}`,
        isFeatured: isFeatured || false, isNewArrival: isNewArrival || false, isBestSeller: isBestSeller || false, isLimited: isLimited || false, metaTitle, metaDesc,
        images: { create: images?.map((img, i) => ({ url: img.url, alt: img.alt || name, isPrimary: i === 0, sortOrder: i })) || [] },
        variants: { create: variants?.map(v => ({ color: v.color, size: v.size, stock: parseInt(v.stock) || 0, sku: v.sku || `${slug}-${v.color?.toLowerCase().replace(/\s+/g, '-')}-${v.size?.toLowerCase().replace(/\s+/g, '-') || 'os'}`, price: v.price ? parseFloat(v.price) : null })) || [] },
        inventory: { create: { quantity: variants?.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0) || 0, lowStockThreshold: 5 } },
        tags: tagIds?.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
        collections: collectionIds?.length ? { create: collectionIds.map((collectionId) => ({ collectionId })) } : undefined,
      },
      include: { brand: true, category: true, images: true, variants: true, inventory: true, tags: { include: { tag: true } }, collections: { include: { collection: true } } },
    });
    res.status(201).json(product);
  } catch (err) { next(err); }
};

export const updateProduct = async (req, res, next) => {
  try {
    const { name, slug, description, brandId, categoryId, basePrice, discountPrice, currency, material, specifications, isFeatured, isNewArrival, isBestSeller, isLimited, metaTitle, metaDesc, isActive, images, variants, tagIds, collectionIds } = req.body;

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: req.params.id },
        data: {
          name, slug, description, brandId, categoryId, basePrice: basePrice !== undefined ? parseFloat(basePrice) : undefined, discountPrice: discountPrice !== undefined ? (discountPrice ? parseFloat(discountPrice) : null) : undefined, currency: currency || undefined, material, specifications,
          isFeatured, isNewArrival, isBestSeller, isLimited, metaTitle, metaDesc, isActive,
        },
        include: { brand: true, category: true },
      });

      if (Array.isArray(tagIds)) {
        await tx.productTag.deleteMany({ where: { productId: updated.id } });
        if (tagIds.length) await tx.productTag.createMany({ data: tagIds.map((tagId) => ({ productId: updated.id, tagId })) });
      }

      if (Array.isArray(collectionIds)) {
        await tx.collectionProduct.deleteMany({ where: { productId: updated.id } });
        if (collectionIds.length) await tx.collectionProduct.createMany({ data: collectionIds.map((collectionId) => ({ collectionId, productId: updated.id })) });
      }

      if (Array.isArray(images)) {
        await tx.productImage.deleteMany({ where: { productId: updated.id } });
        if (images.length) {
          await tx.productImage.createMany({
            data: images.map((img, i) => ({ productId: updated.id, url: img.url, alt: img.alt || name || updated.name, isPrimary: i === 0, sortOrder: i })),
          });
        }
      }

      if (Array.isArray(variants)) {
        const skuPrefix = updated.sku || `CB-${(slug || updated.slug).toUpperCase().replace(/-/g, '')}`;
        await tx.productVariant.deleteMany({ where: { productId: updated.id } });
        if (variants.length) {
          await tx.productVariant.createMany({
            data: variants.map(v => ({
              productId: updated.id,
              color: v.color || null,
              size: v.size || null,
              stock: parseInt(v.stock) || 0,
              price: v.price !== undefined && v.price !== '' && v.price !== null ? parseFloat(v.price) : null,
              sku: v.sku || `${skuPrefix}-${(v.color || '').toLowerCase().replace(/\s+/g, '-')}-${(v.size || '').toLowerCase().replace(/\s+/g, '-') || 'os'}`,
            })),
          });
        }
        const totalStock = variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
        await tx.inventory.upsert({
          where: { productId: updated.id },
          update: { quantity: totalStock },
          create: { productId: updated.id, quantity: totalStock, lowStockThreshold: 5 },
        });
      }

      return tx.product.findUnique({
        where: { id: updated.id },
        include: { brand: true, category: true, images: { orderBy: { sortOrder: 'asc' } }, variants: true, inventory: true, tags: { include: { tag: true } }, collections: { include: { collection: true } } },
      });
    });

    res.json(product);
  } catch (err) { next(err); }
};

export const deleteProduct = async (req, res, next) => {
  try {
    await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Product deactivated' });
  } catch (err) { next(err); }
};
