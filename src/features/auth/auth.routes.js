const { Router } = require('express');
const authController = require('./auth.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const {
  loginRegisterIpLimiter,
  loginEmailLimiter,
  registerDailyIpLimiter,
  forgotPasswordEmailHourLimiter,
  forgotPasswordIpDayLimiter,
} = require('../../middlewares/rateLimit.middleware');

const router = Router();

router.post(
  '/register',
  loginRegisterIpLimiter,
  loginEmailLimiter,
  registerDailyIpLimiter,
  authController.register
);
router.post('/login', loginRegisterIpLimiter, loginEmailLimiter, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post(
  '/forgot-password',
  forgotPasswordEmailHourLimiter,
  forgotPasswordIpDayLimiter,
  authController.forgotPassword
);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email', authController.verifyEmail);

router.get('/me', authMiddleware, authController.getMe);
router.patch('/me', authMiddleware, authController.patchMe);
router.post('/logout', authMiddleware, authController.logout);
router.post('/resend-verification', authMiddleware, authController.resendVerification);

module.exports = router;
