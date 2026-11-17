import { Router } from 'express';
import { register, login, adminLogin, logout, refreshToken, forgotPassword, resetPassword, verifyOTP, resendOTP, googleAuth, appleAuth, getMe, updateProfile, changePassword, deleteAccount, requestPhoneOTP, verifyPhoneOTP, getVerificationConfig } from '../controllers/auth.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter, emailLimiter, phoneLimiter, apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public: which verification channels are actually available on this deployment.
router.get('/verification/config', apiLimiter, getVerificationConfig);

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/admin-login', authLimiter, adminLogin);
router.post('/logout', authenticate, logout);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', authLimiter, emailLimiter, forgotPassword);
router.post('/reset-password', authLimiter, emailLimiter, resetPassword);
router.post('/verify-otp', authLimiter, emailLimiter, verifyOTP);
router.post('/resend-otp', authLimiter, emailLimiter, resendOTP);
// SMS / phone OTP (authenticated: the code is tied to the signed-in account).
router.post('/phone/send-otp', authenticate, authLimiter, phoneLimiter, requestPhoneOTP);
router.post('/phone/verify-otp', authenticate, authLimiter, verifyPhoneOTP);
router.post('/google', authLimiter, googleAuth);
router.post('/apple', authLimiter, appleAuth);
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);
router.delete('/account', authenticate, deleteAccount);

export default router;
