import express from 'express';
import {
  getMyBinaryTree,
  getBinaryTreeStats
} from '../controllers/binaryTreeController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

router.get('/my-tree', authenticateUser, getMyBinaryTree);
router.get('/stats', authenticateUser, getBinaryTreeStats);

export default router;
