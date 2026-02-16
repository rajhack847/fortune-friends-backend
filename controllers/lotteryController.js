import pool from '../config/database.js';
import { selectWinner, calculateUserWeight, getAllEligibleUsers } from '../utils/lotteryAlgorithm.js';

export const getActiveLottery = async (req, res) => {
  try {
    const [events] = await pool.query(
      'SELECT * FROM lottery_events WHERE status = ? ORDER BY ticket_price ASC',
      ['active']
    );
    
    if (events.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No active lottery event found' 
      });
    }
    
    // Return all active lotteries
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Get active lottery error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch active lottery',
      error: error.message 
    });
  }
};

export const getLotteryStats = async (req, res) => {
  try {
    const { lotteryEventId } = req.params;
    
    const [stats] = await pool.query(
      'SELECT * FROM lottery_statistics WHERE id = ?',
      [lotteryEventId]
    );
    
    if (stats.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lottery event not found' 
      });
    }
    
    res.json({
      success: true,
      data: stats[0]
    });
  } catch (error) {
    console.error('Get lottery stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch lottery statistics',
      error: error.message 
    });
  }
};

export const getUserWinningChance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lotteryEventId } = req.params;
    
    // Get user weight
    const userWeight = await calculateUserWeight(userId, lotteryEventId);
    
    // Get all eligible users
    const eligibleUserIds = await getAllEligibleUsers(lotteryEventId);
    
    // Calculate total weight
    let totalWeight = 0;
    for (const uid of eligibleUserIds) {
      const weight = await calculateUserWeight(uid, lotteryEventId);
      totalWeight += weight.totalWeight;
    }
    
    const winningChance = totalWeight > 0 
      ? ((userWeight.totalWeight / totalWeight) * 100).toFixed(4)
      : 0;
    
    res.json({
      success: true,
      data: {
        baseEntries: userWeight.baseEntries,
        bonusEntries: userWeight.bonusEntries,
        totalEntries: userWeight.totalWeight,
        totalParticipants: eligibleUserIds.length,
        totalWeightPool: totalWeight,
        winningChance: `${winningChance}%`
      }
    });
  } catch (error) {
    console.error('Get winning chance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to calculate winning chance',
      error: error.message 
    });
  }
};

export const drawWinner = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { lotteryEventId } = req.params;
    const adminId = req.admin.id;
    
    // Verify lottery event exists and is active
    const [events] = await connection.query(
      'SELECT * FROM lottery_events WHERE id = ? AND status = ?',
      [lotteryEventId, 'active']
    );
    
    if (events.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lottery event not found or not active' 
      });
    }
    
    const event = events[0];
    
    // Check if winner already exists
    const [existingWinner] = await connection.query(
      'SELECT * FROM winners WHERE lottery_event_id = ?',
      [lotteryEventId]
    );
    
    if (existingWinner.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Winner has already been drawn for this lottery' 
      });
    }
    
    await connection.beginTransaction();
    
    // Select winner using weighted algorithm
    const winnerResult = await selectWinner(lotteryEventId);
    
    // Get winner's first approved ticket
    const [winnerTickets] = await connection.query(
      `SELECT t.* FROM tickets t
       JOIN payments p ON t.payment_id = p.id
       WHERE t.user_id = ? AND t.lottery_event_id = ? AND p.status = 'approved' AND t.status = 'active'
       ORDER BY t.created_at ASC
       LIMIT 1`,
      [winnerResult.winnerId, lotteryEventId]
    );
    
    if (winnerTickets.length === 0) {
      throw new Error('Winner ticket not found');
    }
    
    const winningTicket = winnerTickets[0];
    
    // Insert winner record
    await connection.query(
      `INSERT INTO winners (lottery_event_id, user_id, ticket_id, prize_amount, announced_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [lotteryEventId, winnerResult.winnerId, winningTicket.id, event.prize_amount]
    );
    
    // Update lottery event status
    await connection.query(
      'UPDATE lottery_events SET status = ? WHERE id = ?',
      ['drawn', lotteryEventId]
    );
    
    // Mark winning ticket
    await connection.query(
      'UPDATE tickets SET status = ? WHERE id = ?',
      ['winner', winningTicket.id]
    );
    
    // Get winner details
    const [winnerDetails] = await connection.query(
      'SELECT * FROM users WHERE id = ?',
      [winnerResult.winnerId]
    );
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Winner drawn successfully',
      data: {
        winner: winnerDetails[0],
        ticket: winningTicket,
        prizeAmount: event.prize_amount,
        statistics: winnerResult
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Draw winner error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to draw winner',
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

export const getWinners = async (req, res) => {
  try {
    const { lotteryEventId } = req.query;
    
    let query = `
      SELECT w.*, u.name, u.mobile, u.email, u.user_id,
             t.ticket_number, le.name as lottery_name, le.draw_date
      FROM winners w
      JOIN users u ON w.user_id = u.id
      JOIN tickets t ON w.ticket_id = t.id
      JOIN lottery_events le ON w.lottery_event_id = le.id
    `;
    
    const params = [];
    
    if (lotteryEventId) {
      query += ' WHERE w.lottery_event_id = ?';
      params.push(lotteryEventId);
    }
    
    query += ' ORDER BY w.announced_at DESC';
    
    const [winners] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: winners
    });
  } catch (error) {
    console.error('Get winners error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch winners',
      error: error.message 
    });
  }
};
