const { Router } = require('express');
const authController = require('./auth.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.get('/me', authMiddleware, authController.getMe);
router.patch('/me', authMiddleware, authController.patchMe);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
