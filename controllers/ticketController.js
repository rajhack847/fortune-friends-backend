import pool from '../config/database.js';

export const getUserTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fortuneDrawEventId } = req.query;
    
    let query = `
      SELECT t.*, p.status as payment_status, p.amount, le.name as lottery_name, le.draw_date
      FROM tickets t
      JOIN payments p ON t.payment_id = p.id
      JOIN fortune_draw_events le ON t.fortune_draw_event_id = le.id
      WHERE t.user_id = ?
    `;
    
    const params = [userId];
    
    if (fortuneDrawEventId) {
      query += ' AND t.fortune_draw_event_id = ?';
      params.push(fortuneDrawEventId);
    }
    
    query += ' ORDER BY t.created_at DESC';
    
    const [tickets] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tickets',
      error: error.message 
    });
  }
};

export const getTicketStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fortuneDrawEventId } = req.query;
    
    const params = [userId];
    let eventCondition = '';
    
    if (fortuneDrawEventId) {
      eventCondition = ' AND t.fortune_draw_event_id = ?';
      params.push(fortuneDrawEventId);
    }
    
    const [stats] = await pool.query(
      `SELECT 
        COUNT(DISTINCT t.id) as total_tickets,
        COUNT(DISTINCT CASE WHEN p.status = 'approved' THEN t.id END) as approved_tickets,
        COUNT(DISTINCT CASE WHEN p.status = 'pending' THEN t.id END) as pending_tickets,
        COUNT(DISTINCT CASE WHEN p.status = 'rejected' THEN t.id END) as rejected_tickets,
        SUM(CASE WHEN p.status = 'approved' THEN p.amount ELSE 0 END) as total_spent
       FROM tickets t
       JOIN payments p ON t.payment_id = p.id
       WHERE t.user_id = ?${eventCondition}`,
      params
    );
    
    res.json({
      success: true,
      data: stats[0]
    });
  } catch (error) {
    console.error('Get ticket stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch ticket statistics',
      error: error.message 
    });
  }
};
