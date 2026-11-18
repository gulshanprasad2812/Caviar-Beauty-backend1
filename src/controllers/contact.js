import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendContactNotification } from '../services/email.js';

export const createContactMessage = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) throw new AppError(400, 'All fields are required');
    const contact = await prisma.contactMessage.create({ data: { name, email, subject, message } });

    // Notify the store owner (CONTACT_TO). This is awaited on purpose: a
    // serverless function can be frozen as soon as the response is sent, which
    // would silently drop a fire-and-forget email. sendMail resolves with a
    // result instead of throwing, and the message is already stored, so a mail
    // problem never turns the visitor's submission into an error.
    await sendContactNotification(contact);

    res.status(201).json({ message: 'Message received', contact });
  } catch (err) { next(err); }
};

export const getContactMessages = async (req, res, next) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, skip: (pageNum - 1) * limitNum, take: limitNum }),
      prisma.contactMessage.count(),
    ]);
    res.json({ messages, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) { next(err); }
};

export const markContactRead = async (req, res, next) => {
  try {
    await prisma.contactMessage.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.json({ message: 'Marked as read' });
  } catch (err) { next(err); }
};

export const deleteContactMessage = async (req, res, next) => {
  try {
    await prisma.contactMessage.delete({ where: { id: req.params.id } });
    res.json({ message: 'Message deleted' });
  } catch (err) { next(err); }
};
