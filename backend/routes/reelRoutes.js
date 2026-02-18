// Reels feature removed. This router is intentionally disabled.
import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
	res.status(410).json({ success: false, message: 'Reels feature removed' });
});

export default router;
