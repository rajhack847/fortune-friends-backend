import pool from '../config/database.js';

export const logAdminAction = (action, entityType = null) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    
    res.json = function (body) {
      // Log only successful actions
      if (body.success !== false) {
        const adminId = req.admin?.id || null;
        const entityId = body.data?.id || req.params?.id || null;
        const details = {
          method: req.method,
          path: req.path,
          body: req.body,
          params: req.params,
          query: req.query
        };
        
        pool.query(
          `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            adminId,
            action,
            entityType,
            entityId,
            JSON.stringify(details),
            req.ip,
            req.get('user-agent')
          ]
        ).catch(err => console.error('Audit log error:', err));
      }
      
      return originalJson(body);
    };
    
    next();
  };
};
