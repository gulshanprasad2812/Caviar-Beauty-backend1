import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

export const getAddresses = async (req, res, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id, orderId: null },
    });
    res.json({ addresses });
  } catch (err) { next(err); }
};

export const createAddress = async (req, res, next) => {
  try {
    const { type, firstName, lastName, street, city, state, zipCode, country, phone, isDefault } = req.body;
    if (!firstName || !lastName || !street || !city || !state || !zipCode) {
      throw new AppError(400, 'All address fields are required');
    }

    if (isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    }

    const existing = await prisma.address.findFirst({
      where: {
        userId: req.user.id,
        orderId: null,
        firstName,
        lastName,
        street,
        city,
        state,
        zipCode,
        country: country || 'India',
        phone: phone || null,
        type: type || 'SHIPPING',
      },
    });
    if (existing) {
      if (isDefault && !existing.isDefault) {
        const updated = await prisma.address.update({ where: { id: existing.id }, data: { isDefault: true } });
        return res.json(updated);
      }
      return res.json(existing);
    }

    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        type: type || 'SHIPPING',
        firstName, lastName, street, city, state, zipCode,
        country: country || 'India', phone, isDefault: isDefault || false,
      },
    });
    res.status(201).json(address);
  } catch (err) { next(err); }
};

export const updateAddress = async (req, res, next) => {
  try {
    const address = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.id, orderId: null } });
    if (!address) throw new AppError(404, 'Address not found');

    const { type, firstName, lastName, street, city, state, zipCode, country, phone, isDefault } = req.body;

    if (isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    }

    const updated = await prisma.address.update({
      where: { id: address.id },
      data: { type, firstName, lastName, street, city, state, zipCode, country, phone, isDefault },
    });
    res.json(updated);
  } catch (err) { next(err); }
};

export const deleteAddress = async (req, res, next) => {
  try {
    await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.user.id, orderId: null } });
    res.json({ message: 'Address deleted' });
  } catch (err) { next(err); }
};
