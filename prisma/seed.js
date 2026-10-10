import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Admin user (default credentials — password change is forced on first login)
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@caviarbeauty.com' },
    update: { mustChangePassword: true },
    create: { email: 'admin@caviarbeauty.com', password: adminPassword, firstName: 'Admin', lastName: 'Caviar', role: 'ADMIN', isVerified: true, mustChangePassword: true },
  });
  console.log(`Admin ready: admin@caviarbeauty.com (must change password on first login)`);

  // Categories
  const categories = [
    { name: 'Handbags', slug: 'handbags', description: 'Luxury handbags', sortOrder: 1 },
    { name: 'Footwear', slug: 'footwear', description: 'Premium footwear', sortOrder: 2 },
    { name: 'Eyewear', slug: 'eyewear', description: 'Designer eyewear', sortOrder: 3 },
    { name: 'Accessories', slug: 'accessories', description: 'Luxury accessories', sortOrder: 4 },
    { name: 'Gift Cards', slug: 'gift-cards', description: 'Gift cards', sortOrder: 5 },
    { name: 'Limited Edition', slug: 'limited-edition', description: 'Limited edition pieces', sortOrder: 6 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: {}, create: cat });
  }

  // Brands
  const brands = [
    { name: 'Caviar Beauty', slug: 'caviar-beauty', description: 'Our signature brand' },
    { name: 'Maison Caviar', slug: 'maison-caviar', description: 'Haute couture collection' },
    { name: 'Caviar Noir', slug: 'caviar-noir', description: 'Evening collection' },
    { name: 'Caviar Élite', slug: 'caviar-elite', description: 'Executive luxury' },
  ];

  for (const brand of brands) {
    await prisma.brand.upsert({ where: { slug: brand.slug }, update: {}, create: brand });
  }

  // Products with images, variants, inventory (prices in INR)
  const products = [
    { name: 'Diamond Quilted Shoulder Bag', slug: 'diamond-quilted-shoulder-bag', description: 'Exquisite diamond-quilted leather shoulder bag with gold-toned hardware. Crafted from the finest Italian calfskin leather.', brandSlug: 'caviar-beauty', categorySlug: 'handbags', basePrice: 240000, isFeatured: true, isNewArrival: true, material: 'Italian Calfskin Leather', specifications: { dimensions: '28 x 18 x 8 cm', strapDrop: '55 cm', closure: 'Magnetic snap', interior: '2 compartments, zip pocket', hardware: 'Gold-toned' }, variants: [{ color: 'Black', size: 'Medium', stock: 15 }, { color: 'Ivory', size: 'Medium', stock: 10 }, { color: 'Burgundy', size: 'Medium', stock: 8 }] },
    { name: 'Signature Leather Tote', slug: 'signature-leather-tote', description: 'Spacious yet sophisticated tote bag, perfect for the modern woman. Features our signature lining and protective feet.', brandSlug: 'maison-caviar', categorySlug: 'handbags', basePrice: 286000, isFeatured: true, isBestSeller: true, material: 'Grained Calfskin', specifications: { dimensions: '38 x 28 x 14 cm', handles: 'Dual top handles', strapDrop: '25 cm', interior: 'Laptop compartment, 3 pockets' }, variants: [{ color: 'Tan', size: 'Large', stock: 12 }, { color: 'Black', size: 'Large', stock: 20 }, { color: 'Navy', size: 'Large', stock: 7 }] },
    { name: 'Silk Evening Clutch', slug: 'silk-evening-clutch', description: 'Opulent silk evening clutch embellished with Swarovski crystals. A statement piece for galas and special occasions.', brandSlug: 'caviar-noir', categorySlug: 'handbags', basePrice: 432000, isLimited: true, material: 'Silk with Crystal Embellishment', specifications: { dimensions: '22 x 12 x 4 cm', closure: 'Flap with magnetic closure', chainStrap: 'Removable, 110 cm' }, variants: [{ color: 'Midnight Black', size: 'One Size', stock: 3 }, { color: 'Champagne', size: 'One Size', stock: 2 }] },
    { name: 'Leather Ankle Boots', slug: 'leather-ankle-boots', description: 'Sleek Italian leather ankle boots with a sculptural block heel. Handcrafted by master artisans.', brandSlug: 'caviar-beauty', categorySlug: 'footwear', basePrice: 104000, isFeatured: true, isNewArrival: true, material: 'Italian Patent Leather', specifications: { heelHeight: '6.5 cm', sole: 'Leather with rubber insert', fit: 'True to size' }, variants: [{ color: 'Black', size: '36', stock: 10 }, { color: 'Black', size: '37', stock: 15 }, { color: 'Black', size: '38', stock: 20 }, { color: 'Black', size: '39', stock: 15 }, { color: 'Black', size: '40', stock: 8 }, { color: 'Brown', size: '36', stock: 5 }, { color: 'Brown', size: '37', stock: 8 }, { color: 'Brown', size: '38', stock: 12 }] },
    { name: 'Crystal-Embellished Heels', slug: 'crystal-embellished-heels', description: 'Stunning stiletto heels adorned with hand-placed Swarovski crystals. Every pair takes 40 hours to craft.', brandSlug: 'caviar-noir', categorySlug: 'footwear', basePrice: 286000, isBestSeller: true, material: 'Satin with Crystal Embroidery', specifications: { heelHeight: '10 cm', platform: '1.5 cm', fit: 'True to size' }, variants: [{ color: 'Silver', size: '36', stock: 5 }, { color: 'Silver', size: '37', stock: 8 }, { color: 'Silver', size: '38', stock: 10 }, { color: 'Silver', size: '39', stock: 6 }, { color: 'Gold', size: '37', stock: 4 }, { color: 'Gold', size: '38', stock: 6 }] },
    { name: 'Aviator Sunglasses', slug: 'aviator-sunglasses', description: 'Premium aviator sunglasses with graduated mineral glass lenses. Lightweight titanium frame.', brandSlug: 'caviar-beauty', categorySlug: 'eyewear', basePrice: 56000, isFeatured: true, material: 'Titanium Frame, Mineral Glass', specifications: { lens: 'Graduated, UV400 protection', frameWidth: '145 mm', noseBridge: '15 mm', templeLength: '135 mm' }, variants: [{ color: 'Gold/Brown', size: 'One Size', stock: 25 }, { color: 'Silver/Grey', size: 'One Size', stock: 20 }, { color: 'Black/Green', size: 'One Size', stock: 15 }] },
    { name: 'Cat-Eye Optical Frame', slug: 'cat-eye-optical-frame', description: 'Elegant cat-eye optical frames in acetate. Handcrafted in France with spring hinges.', brandSlug: 'maison-caviar', categorySlug: 'eyewear', basePrice: 43000, isNewArrival: true, material: 'Italian Acetate', specifications: { lensWidth: '52 mm', bridge: '18 mm', temple: '140 mm', hinge: 'Spring' }, variants: [{ color: 'Tortoiseshell', size: 'One Size', stock: 18 }, { color: 'Black', size: 'One Size', stock: 22 }, { color: 'Crystal', size: 'One Size', stock: 10 }] },
    { name: 'Cashmere Wrap', slug: 'cashmere-wrap', description: 'Ultra-soft cashmere wrap in our signature weight. Ethically sourced from Inner Mongolia.', brandSlug: 'caviar-beauty', categorySlug: 'accessories', basePrice: 74000, isFeatured: true, isBestSeller: true, material: 'Pure Mongolian Cashmere', specifications: { dimensions: '180 x 70 cm', weight: '280 gsm', care: 'Dry clean only' }, variants: [{ color: 'Charcoal', size: 'One Size', stock: 30 }, { color: 'Camel', size: 'One Size', stock: 25 }, { color: 'Burgundy', size: 'One Size', stock: 20 }, { color: 'Ivory', size: 'One Size', stock: 15 }] },
    { name: 'Leather Belt', slug: 'leather-belt', description: 'Minimalist calfskin leather belt with polished buckle. Reversible design for versatility.', brandSlug: 'caviar-elite', categorySlug: 'accessories', basePrice: 37000, discountPrice: 30000, material: 'Italian Calfskin', specifications: { width: '3.5 cm', buckle: 'Polished Palladium', care: 'Wipe with damp cloth' }, variants: [{ color: 'Black/Dark Brown', size: '80', stock: 20 }, { color: 'Black/Dark Brown', size: '85', stock: 25 }, { color: 'Black/Dark Brown', size: '90', stock: 30 }, { color: 'Black/Dark Brown', size: '95', stock: 20 }, { color: 'Tan/Navy', size: '85', stock: 12 }, { color: 'Tan/Navy', size: '90', stock: 18 }] },
    { name: 'Pearl Drop Earrings', slug: 'pearl-drop-earrings', description: 'South Sea pearl earrings with 18K gold posts. Each pearl is hand-selected for luster and size.', brandSlug: 'caviar-noir', categorySlug: 'accessories', basePrice: 199000, isLimited: true, material: 'South Sea Pearl, 18K Gold', specifications: { pearlDiameter: '10-11 mm', closure: 'Push-back', goldType: '18K Yellow Gold' }, variants: [{ color: 'White Pearl', size: 'One Size', stock: 5 }, { color: 'Golden Pearl', size: 'One Size', stock: 3 }] },
    { name: 'Digital Gift Card', slug: 'digital-gift-card', description: 'The perfect gift. Delivered instantly via email with a personalized message and elegant packaging.', brandSlug: 'caviar-beauty', categorySlug: 'gift-cards', basePrice: 8300, material: 'Digital', specifications: { delivery: 'Instant via email', validity: '24 months', type: 'E-gift card' }, variants: [{ color: 'Classic', size: 'One Size', stock: 999 }, { color: 'Premium', size: 'One Size', stock: 999 }] },
    { name: 'Limited Edition Silk Scarf', slug: 'limited-edition-silk-scarf', description: 'Hand-rolled silk twill scarf featuring our exclusive limited edition pattern. Only 100 pieces worldwide.', brandSlug: 'caviar-noir', categorySlug: 'limited-edition', basePrice: 81000, isLimited: true, isFeatured: true, material: 'Silk Twill', specifications: { dimensions: '90 x 90 cm', finish: 'Hand-rolled hem', care: 'Dry clean', edition: 'Limited to 100 pieces' }, variants: [{ color: 'Multicolor', size: 'One Size', stock: 8 }] },
    { name: 'Patent Leather Loafers', slug: 'patent-leather-loafers', description: 'Classic penny loafers in high-shine patent leather. Horsebit detail with leather sole.', brandSlug: 'caviar-elite', categorySlug: 'footwear', basePrice: 81000, isBestSeller: true, material: 'Patent Leather', specifications: { sole: 'Leather with rubber inset', fit: 'True to size', last: 'Classic round toe' }, variants: [{ color: 'Black', size: '37', stock: 12 }, { color: 'Black', size: '38', stock: 18 }, { color: 'Black', size: '39', stock: 15 }, { color: 'Black', size: '40', stock: 10 }, { color: 'Brown', size: '38', stock: 8 }, { color: 'Brown', size: '39', stock: 12 }] },
    { name: 'Leather Crossbody Bag', slug: 'leather-crossbody-bag', description: 'Compact crossbody bag in pebbled leather with adjustable strap. Perfect for day-to-night transitions.', brandSlug: 'caviar-beauty', categorySlug: 'handbags', basePrice: 137000, discountPrice: 110000, isNewArrival: true, material: 'Pebbled Calfskin', specifications: { dimensions: '20 x 14 x 6 cm', strapDrop: '50-60 cm adjustable', closure: 'Zip top', pockets: '6 card slots, zip pocket' }, variants: [{ color: 'Black', size: 'Mini', stock: 20 }, { color: 'Blush', size: 'Mini', stock: 12 }, { color: 'Sage', size: 'Mini', stock: 8 }] },
  ];

  for (const product of products) {
    const brand = await prisma.brand.findUnique({ where: { slug: product.brandSlug } });
    const category = await prisma.category.findUnique({ where: { slug: product.categorySlug } });
    if (!brand || !category) continue;

    const { variants, brandSlug, categorySlug, ...productData } = product;

    const created = await prisma.product.upsert({
      where: { slug: productData.slug },
      update: {},
      create: {
        ...productData,
        brandId: brand.id,
        categoryId: category.id,
        basePrice: productData.basePrice,
        currency: 'INR',
        images: {
          create: [
            { url: `/images/products/${productData.slug}-1.jpg`, alt: productData.name, isPrimary: true, sortOrder: 0 },
            { url: `/images/products/${productData.slug}-2.jpg`, alt: `${productData.name} - View 2`, sortOrder: 1 },
            { url: `/images/products/${productData.slug}-3.jpg`, alt: `${productData.name} - View 3`, sortOrder: 2 },
            { url: `/images/products/${productData.slug}-4.jpg`, alt: `${productData.name} - View 4`, sortOrder: 3 },
          ],
        },
        inventory: { create: { quantity: variants.reduce((sum, v) => sum + v.stock, 0), reservedQuantity: 0, lowStockThreshold: 5 } },
      },
    });

    // Create variants
    for (const variant of variants) {
      const variantSku = `${created.sku || created.slug}-${variant.color?.toLowerCase().replace(/\s+/g, '-')}-${variant.size?.toLowerCase().replace(/\s+/g, '-') || 'os'}`;
      await prisma.productVariant.upsert({
        where: { sku: variantSku },
        update: { stock: variant.stock },
        create: { productId: created.id, color: variant.color, size: variant.size, stock: variant.stock, sku: variantSku, price: productData.discountPrice || productData.basePrice },
      });
    }
  }

  // Update product SKUs
  const allProducts = await prisma.product.findMany();
  for (const p of allProducts) {
    if (!p.sku) {
      await prisma.product.update({ where: { id: p.id }, data: { sku: `CB-${p.slug.toUpperCase().replace(/-/g, '')}` } });
    }
  }

  console.log('Seed completed successfully!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
