import pool from '../config/database.js';

/**
 * Weighted Lottery Draw Algorithm
 * 
 * Formula:
 * - Base entries = Number of approved tickets purchased
 * - Bonus entries = Number of successful paid referrals
 * - Total weight = Base entries + Bonus entries
 * 
 * Higher weight = Higher probability of winning
 */

export const calculateUserWeight = async (userId, lotteryEventId) => {
  try {
    // Get approved tickets count
    const [ticketResult] = await pool.query(
      `SELECT COUNT(*) as ticket_count 
       FROM tickets t
       JOIN payments p ON t.payment_id = p.id
       WHERE t.user_id = ? AND t.lottery_event_id = ? AND p.status = 'approved' AND t.status = 'active'`,
      [userId, lotteryEventId]
    );
    
    const baseEntries = ticketResult[0].ticket_count || 0;
    
    // Get paid referrals count
    const [referralResult] = await pool.query(
      `SELECT COUNT(*) as referral_count 
       FROM referrals 
       WHERE referrer_id = ? AND payment_status = 'paid'`,
      [userId]
    );
    
    const bonusEntries = referralResult[0].referral_count || 0;
    
    return {
      userId,
      baseEntries,
      bonusEntries,
      totalWeight: baseEntries + bonusEntries
    };
  } catch (error) {
    console.error('Error calculating user weight:', error);
    throw error;
  }
};

export const getAllEligibleUsers = async (lotteryEventId) => {
  try {
    // Get all users with at least one approved ticket
    const [users] = await pool.query(
      `SELECT DISTINCT t.user_id
       FROM tickets t
       JOIN payments p ON t.payment_id = p.id
       WHERE t.lottery_event_id = ? AND p.status = 'approved' AND t.status = 'active'`,
      [lotteryEventId]
    );
    
    return users.map(u => u.user_id);
  } catch (error) {
    console.error('Error getting eligible users:', error);
    throw error;
  }
};

export const selectWinner = async (lotteryEventId) => {
  try {
    // Get all eligible users
    const userIds = await getAllEligibleUsers(lotteryEventId);
    
    if (userIds.length === 0) {
      throw new Error('No eligible participants for the lottery');
    }
    
    // Calculate weights for all users
    const userWeights = await Promise.all(
      userIds.map(userId => calculateUserWeight(userId, lotteryEventId))
    );
    
    // Filter out users with zero weight
    const eligibleUsers = userWeights.filter(u => u.totalWeight > 0);
    
    if (eligibleUsers.length === 0) {
      throw new Error('No users with valid entries');
    }
    
    // Calculate total weight
    const totalWeight = eligibleUsers.reduce((sum, u) => sum + u.totalWeight, 0);
    
    // Weighted random selection
    const random = Math.random() * totalWeight;
    let cumulativeWeight = 0;
    let winner = null;
    
    for (const user of eligibleUsers) {
      cumulativeWeight += user.totalWeight;
      if (random <= cumulativeWeight) {
        winner = user;
        break;
      }
    }
    
    // Fallback to last user (should never happen)
    if (!winner) {
      winner = eligibleUsers[eligibleUsers.length - 1];
    }
    
    return {
      winnerId: winner.userId,
      baseEntries: winner.baseEntries,
      bonusEntries: winner.bonusEntries,
      totalWeight: winner.totalWeight,
      totalParticipants: eligibleUsers.length,
      totalWeightPool: totalWeight,
      winningProbability: ((winner.totalWeight / totalWeight) * 100).toFixed(2) + '%'
    };
  } catch (error) {
    console.error('Error selecting winner:', error);
    throw error;
  }
};

export const calculateWinningChance = (baseEntries, bonusEntries, totalWeight) => {
  const userWeight = baseEntries + bonusEntries;
  if (totalWeight === 0 || userWeight === 0) return 0;
  return ((userWeight / totalWeight) * 100).toFixed(2);
};
