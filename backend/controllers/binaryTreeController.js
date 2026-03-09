import pool from '../config/database.js';
import { creditCoins, ensureWallet } from './walletController.js';

// Place a user in the binary tree under their sponsor
// Auto-placement: fills left first, then right (BFS order)
export const placeInBinaryTree = async (connection, userId, sponsorId) => {
  // Check if user is already in the tree
  const [existing] = await connection.query(
    'SELECT id FROM binary_tree WHERE user_id = ?', [userId]
  );
  if (existing.length > 0) return existing[0];

  // If no sponsor, this user becomes a root node
  if (!sponsorId) {
    const [result] = await connection.query(
      `INSERT INTO binary_tree (user_id, sponsor_id, parent_id, position)
       VALUES (?, NULL, NULL, NULL)`,
      [userId]
    );
    return { id: result.insertId, user_id: userId };
  }

  // Ensure sponsor has a node in the tree
  const [sponsorNode] = await connection.query(
    'SELECT * FROM binary_tree WHERE user_id = ?', [sponsorId]
  );

  if (sponsorNode.length === 0) {
    // Sponsor not in tree yet, place them first as root
    await connection.query(
      `INSERT INTO binary_tree (user_id, sponsor_id, parent_id, position)
       VALUES (?, NULL, NULL, NULL)`,
      [sponsorId]
    );
  }

  // Find the placement position using BFS from sponsor's node
  const parentInfo = await findPlacementPosition(connection, sponsorId);

  const [result] = await connection.query(
    `INSERT INTO binary_tree (user_id, sponsor_id, parent_id, position)
     VALUES (?, ?, ?, ?)`,
    [userId, sponsorId, parentInfo.parentId, parentInfo.position]
  );

  // Update parent's child pointer
  if (parentInfo.position === 'left') {
    await connection.query(
      'UPDATE binary_tree SET left_child_id = ? WHERE user_id = ?',
      [userId, parentInfo.parentId]
    );
  } else {
    await connection.query(
      'UPDATE binary_tree SET right_child_id = ? WHERE user_id = ?',
      [userId, parentInfo.parentId]
    );
  }

  // Update counts up the tree
  await updateAncestorCounts(connection, parentInfo.parentId, parentInfo.position);

  return { id: result.insertId, user_id: userId };
};

// BFS to find first available position in binary tree starting from a user
async function findPlacementPosition(connection, startUserId) {
  const queue = [startUserId];

  while (queue.length > 0) {
    const currentUserId = queue.shift();

    const [node] = await connection.query(
      'SELECT * FROM binary_tree WHERE user_id = ?', [currentUserId]
    );

    if (node.length === 0) continue;
    const current = node[0];

    // Check left first
    if (!current.left_child_id) {
      return { parentId: currentUserId, position: 'left' };
    }

    // Then check right
    if (!current.right_child_id) {
      return { parentId: currentUserId, position: 'right' };
    }

    // Both filled, add children to queue
    queue.push(current.left_child_id);
    queue.push(current.right_child_id);
  }

  // Fallback (should not happen in normal flow)
  return { parentId: startUserId, position: 'left' };
}

// Walk up the tree and increment left_count or right_count
async function updateAncestorCounts(connection, parentUserId, side) {
  let currentUserId = parentUserId;
  let childSide = side;

  while (currentUserId) {
    const field = childSide === 'left' ? 'left_count' : 'right_count';
    await connection.query(
      `UPDATE binary_tree SET ${field} = ${field} + 1 WHERE user_id = ?`,
      [currentUserId]
    );

    // Move up to this node's parent
    const [parentNode] = await connection.query(
      'SELECT parent_id, position FROM binary_tree WHERE user_id = ?',
      [currentUserId]
    );

    if (parentNode.length === 0 || !parentNode[0].parent_id) break;

    childSide = parentNode[0].position;
    currentUserId = parentNode[0].parent_id;
  }
}

// Process commission split when a payment is approved
// ₹100 joining: Company ₹50, Direct bonus ₹10, Binary pair ₹20, Reserve ₹20
export const processCommissions = async (connection, userId, paymentId) => {
  // Get system settings
  const [settings] = await connection.query(
    "SELECT setting_key, setting_value FROM system_settings"
  );
  const config = {};
  settings.forEach(s => { config[s.setting_key] = parseFloat(s.setting_value); });

  const directBonus = config.direct_bonus || 10;
  const binaryPairBonus = config.binary_pair_bonus || 20;

  // 1. Direct bonus: credit to sponsor
  const [treeNode] = await connection.query(
    'SELECT sponsor_id FROM binary_tree WHERE user_id = ?', [userId]
  );

  if (treeNode.length > 0 && treeNode[0].sponsor_id) {
    const sponsorId = treeNode[0].sponsor_id;
    await ensureWallet(connection, sponsorId);
    await creditCoins(connection, sponsorId, directBonus, 'direct_bonus',
      `Direct referral bonus for user joining`, paymentId);
  }

  // 2. Update sales volume and check binary pairs up the tree
  await updateSalesAndCheckPairs(connection, userId, binaryPairBonus, paymentId);
};

// Add to sales volume and check for new binary pairs
async function updateSalesAndCheckPairs(connection, userId, pairBonus, paymentId) {
  // Get the joining fee as the sales volume to add
  const [settings] = await connection.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'joining_fee'"
  );
  const joiningFee = settings.length > 0 ? parseFloat(settings[0].setting_value) : 100;

  // Walk up the tree from new user's parent
  const [node] = await connection.query(
    'SELECT parent_id, position FROM binary_tree WHERE user_id = ?', [userId]
  );

  if (node.length === 0 || !node[0].parent_id) return;

  let currentUserId = node[0].parent_id;
  let childSide = node[0].position;

  while (currentUserId) {
    // Add to the appropriate sales volume
    const salesField = childSide === 'left' ? 'left_sales' : 'right_sales';
    await connection.query(
      `UPDATE binary_tree SET ${salesField} = ${salesField} + ? WHERE user_id = ?`,
      [joiningFee, currentUserId]
    );

    // Check for new pairs: a pair = min(left_count, right_count) > pairs_matched
    const [current] = await connection.query(
      'SELECT left_count, right_count, pairs_matched FROM binary_tree WHERE user_id = ?',
      [currentUserId]
    );

    if (current.length > 0) {
      const maxPairs = Math.min(current[0].left_count, current[0].right_count);
      const newPairs = maxPairs - current[0].pairs_matched;

      if (newPairs > 0) {
        // Award binary pair bonus for each new pair
        await ensureWallet(connection, currentUserId);
        const totalBonus = newPairs * pairBonus;
        await creditCoins(connection, currentUserId, totalBonus, 'binary_pair',
          `Binary pair bonus (${newPairs} new pair${newPairs > 1 ? 's' : ''})`, paymentId);

        // Update pairs_matched
        await connection.query(
          'UPDATE binary_tree SET pairs_matched = ? WHERE user_id = ?',
          [maxPairs, currentUserId]
        );
      }
    }

    // Move up
    const [parentNode] = await connection.query(
      'SELECT parent_id, position FROM binary_tree WHERE user_id = ?',
      [currentUserId]
    );
    if (parentNode.length === 0 || !parentNode[0].parent_id) break;
    childSide = parentNode[0].position;
    currentUserId = parentNode[0].parent_id;
  }
}

// GET /api/binary-tree/my-tree - Get user's binary tree
export const getMyBinaryTree = async (req, res) => {
  try {
    const userId = req.user.id;
    const depth = Math.min(parseInt(req.query.depth) || 3, 5);

    const tree = await buildTreeFromUser(userId, depth);

    // Get user's own node stats
    const [myNode] = await pool.query(
      'SELECT * FROM binary_tree WHERE user_id = ?', [userId]
    );

    res.json({
      success: true,
      data: {
        node: myNode.length > 0 ? myNode[0] : null,
        tree
      }
    });
  } catch (error) {
    console.error('Get my binary tree error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch binary tree' });
  }
};

// Build a tree structure for visualization
async function buildTreeFromUser(userId, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return null;

  const [nodes] = await pool.query(
    `SELECT bt.*, u.name, u.user_id as user_code, u.mobile, u.email
     FROM binary_tree bt
     JOIN users u ON bt.user_id = u.id
     WHERE bt.user_id = ?`,
    [userId]
  );

  if (nodes.length === 0) return null;

  const node = nodes[0];
  const result = {
    userId: node.user_id,
    userCode: node.user_code,
    name: node.name,
    position: node.position,
    leftCount: node.left_count,
    rightCount: node.right_count,
    leftSales: node.left_sales,
    rightSales: node.right_sales,
    pairsMatched: node.pairs_matched,
    left: null,
    right: null
  };

  if (node.left_child_id) {
    result.left = await buildTreeFromUser(node.left_child_id, maxDepth, currentDepth + 1);
  }
  if (node.right_child_id) {
    result.right = await buildTreeFromUser(node.right_child_id, maxDepth, currentDepth + 1);
  }

  return result;
}

// GET /api/binary-tree/stats - Binary tree stats for user
export const getBinaryTreeStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [myNode] = await pool.query(
      'SELECT * FROM binary_tree WHERE user_id = ?', [userId]
    );

    if (myNode.length === 0) {
      return res.json({
        success: true,
        data: {
          inTree: false,
          leftCount: 0, rightCount: 0,
          leftSales: 0, rightSales: 0,
          pairsMatched: 0,
          directReferrals: 0
        }
      });
    }

    const node = myNode[0];

    // Count direct referrals (sponsored by this user)
    const [directCount] = await pool.query(
      'SELECT COUNT(*) as total FROM binary_tree WHERE sponsor_id = ?',
      [userId]
    );

    res.json({
      success: true,
      data: {
        inTree: true,
        leftCount: node.left_count,
        rightCount: node.right_count,
        leftSales: node.left_sales,
        rightSales: node.right_sales,
        pairsMatched: node.pairs_matched,
        directReferrals: directCount[0].total
      }
    });
  } catch (error) {
    console.error('Get binary tree stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch binary tree stats' });
  }
};

// GET /api/admin/binary-tree/:userId - Admin view of any user's tree
export const getAdminBinaryTree = async (req, res) => {
  try {
    const { userId } = req.params;
    const depth = Math.min(parseInt(req.query.depth) || 4, 6);

    const tree = await buildTreeFromUser(parseInt(userId), depth);

    const [myNode] = await pool.query(
      'SELECT * FROM binary_tree WHERE user_id = ?', [userId]
    );

    res.json({
      success: true,
      data: {
        node: myNode.length > 0 ? myNode[0] : null,
        tree
      }
    });
  } catch (error) {
    console.error('Admin get binary tree error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch binary tree' });
  }
};
