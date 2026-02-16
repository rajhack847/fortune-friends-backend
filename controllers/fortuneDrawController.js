import pool from '../config/database.js';
import { selectWinner, calculateUserWeight, getAllEligibleUsers } from '../utils/fortuneDrawAlgorithm.js';
import fs from 'fs';
import path from 'path';

const _reqLogPath = path.join(process.cwd(), 'backend', 'logs', 'request-debug.log');
const _appendReqLog = (msg) => {
  try {
    fs.appendFileSync(_reqLogPath, `${new Date().toISOString()} ${msg}\n`);
  } catch (err) {
    console.error('Failed to write request-debug log:', err && (err.stack || err));
  }
};

export const getActiveLottery = async (req, res) => {
  try {
    const dbg = `[DEBUG] getActiveLottery request ip=${req.ip} headers=${JSON.stringify({host: req.headers.host, referer: req.headers.referer, forwarded: req.headers['x-forwarded-for']})}`;
    console.log(dbg);
    _appendReqLog(dbg);
    const [events] = await pool.query(
      'SELECT * FROM fortune_draw_events WHERE status = ? ORDER BY ticket_price ASC',
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
    console.error('Get active lottery error:', error?.stack || error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch active lottery',
      error: error?.message || String(error) 
    });
  }
};

export const getLotteryStats = async (req, res) => {
  try {
    const { fortuneDrawEventId } = req.params;
    
    const [stats] = await pool.query(
      'SELECT * FROM fortune_draw_statistics WHERE id = ?',
      [fortuneDrawEventId]
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
    const { fortuneDrawEventId } = req.params;
    
    // Get user weight
    const userWeight = await calculateUserWeight(userId, fortuneDrawEventId);
    
    // Get all eligible users
    const eligibleUserIds = await getAllEligibleUsers(fortuneDrawEventId);
    
    // Calculate total weight
    let totalWeight = 0;
    for (const uid of eligibleUserIds) {
      const weight = await calculateUserWeight(uid, fortuneDrawEventId);
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
    const { fortuneDrawEventId } = req.params;
    const adminId = req.admin.id;
    
    // Verify lottery event exists and is active
    const [events] = await connection.query(
      'SELECT * FROM fortune_draw_events WHERE id = ? AND status = ?',
      [fortuneDrawEventId, 'active']
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
      'SELECT * FROM winners WHERE fortune_draw_event_id = ?',
      [fortuneDrawEventId]
    );
    
    if (existingWinner.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Winner has already been drawn for this lottery' 
      });
    }
    
    await connection.beginTransaction();
    
    // Select winner using weighted algorithm
    const winnerResult = await selectWinner(fortuneDrawEventId);
    
    // Get winner's first approved ticket
    const [winnerTickets] = await connection.query(
      `SELECT t.* FROM tickets t
       JOIN payments p ON t.payment_id = p.id
       WHERE t.user_id = ? AND t.fortune_draw_event_id = ? AND p.status = 'approved' AND t.status = 'active'
       ORDER BY t.created_at ASC
       LIMIT 1`,
      [winnerResult.winnerId, fortuneDrawEventId]
    );
    
    if (winnerTickets.length === 0) {
      throw new Error('Winner ticket not found');
    }
    
    const winningTicket = winnerTickets[0];
    
    // Insert winner record
    await connection.query(
      `INSERT INTO winners (fortune_draw_event_id, user_id, ticket_id, prize_amount, announced_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [fortuneDrawEventId, winnerResult.winnerId, winningTicket.id, event.prize_amount]
    );
    
    // Update lottery event status
    await connection.query(
      'UPDATE fortune_draw_events SET status = ? WHERE id = ?',
      ['drawn', fortuneDrawEventId]
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
    const dbg = `[DEBUG] getWinners request ip=${req.ip} qs=${JSON.stringify(req.query)} headers=${JSON.stringify({host: req.headers.host, referer: req.headers.referer})}`;
    console.log(dbg);
    _appendReqLog(dbg);
    const { fortuneDrawEventId } = req.query;
    
    let query = `
      SELECT w.*, u.name, u.mobile, u.email, u.user_id,
             t.ticket_number, le.name as lottery_name, le.draw_date
      FROM winners w
      JOIN users u ON w.user_id = u.id
      JOIN tickets t ON w.ticket_id = t.id
      JOIN fortune_draw_events le ON w.fortune_draw_event_id = le.id
    `;
    
    const params = [];
    
    if (fortuneDrawEventId) {
      query += ' WHERE w.fortune_draw_event_id = ?';
      params.push(fortuneDrawEventId);
    }
    
    query += ' ORDER BY w.announced_at DESC';
    
    const [winners] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: winners
    });
  } catch (error) {
    console.error('Get winners error:', error && (error.stack || error));
    _appendReqLog(`[ERROR] getWinners error: ${error && (error.stack || error)}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch winners',
      error: error.message 
    });
  }
};
