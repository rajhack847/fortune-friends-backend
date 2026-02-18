import db from '../config/database.js';

// Get home settings
export const getHomeSettings = async (req, res) => {
  try {
    const dbg = `[DEBUG] getHomeSettings request ip=${req.ip} headers=${JSON.stringify({host: req.headers.host, referer: req.headers.referer, forwarded: req.headers['x-forwarded-for']})}`;
    console.log(dbg);
    const [rows] = await db.query(
      'SELECT * FROM home_settings WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
    );
    
    if (rows.length === 0) {
      // Return default settings if none exist
      return res.json({
        success: true,
        data: {
          hero_title: 'Welcome to Fortune Friends',
          hero_subtitle: 'Friends Who Bring Fortune',
          hero_description: 'Join the most exciting lottery experience!',
          welcome_message: 'Welcome to Fortune Friends - where dreams come true!',
          announcement: '',
          features: [],
          how_it_works: [],
          contact_email: 'contact@fortunefriends.com',
          contact_phone: '+91 98765 43210'
        }
      });
    }
    
    // Parse JSON fields
    const settings = rows[0];
    if (settings.features && typeof settings.features === 'string') {
      settings.features = JSON.parse(settings.features);
    }
    if (settings.how_it_works && typeof settings.how_it_works === 'string') {
      settings.how_it_works = JSON.parse(settings.how_it_works);
    }
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get home settings error:', error?.stack || error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch home settings',
      error: error?.message || String(error)
    });
  }
};

// Update home settings (Admin only)
export const updateHomeSettings = async (req, res) => {
  try {
    const {
      hero_title,
      hero_subtitle,
      hero_description,
      welcome_message,
      announcement,
      features,
      how_it_works,
      terms_conditions,
      about_us,
      contact_email,
      contact_phone
    } = req.body;
    
    const adminId = req.admin.id;
    
    // Validation
    if (!hero_title || !hero_subtitle) {
      return res.status(400).json({
        success: false,
        message: 'Hero title and subtitle are required'
      });
    }
    
    // Convert arrays to JSON strings
    const featuresJson = typeof features === 'string' ? features : JSON.stringify(features || []);
    const howItWorksJson = typeof how_it_works === 'string' ? how_it_works : JSON.stringify(how_it_works || []);
    
    // Check if settings exist
    const [existing] = await db.query('SELECT id FROM home_settings LIMIT 1');
    
    if (existing.length > 0) {
      // Update existing
      await db.query(
        `UPDATE home_settings 
         SET hero_title = ?, hero_subtitle = ?, hero_description = ?, 
             welcome_message = ?, announcement = ?, features = ?, 
             how_it_works = ?, terms_conditions = ?, about_us = ?,
             contact_email = ?, contact_phone = ?,
             updated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          hero_title, hero_subtitle, hero_description,
          welcome_message, announcement, featuresJson,
          howItWorksJson, terms_conditions, about_us,
          contact_email, contact_phone,
          adminId, existing[0].id
        ]
      );
    } else {
      // Insert new
      await db.query(
        `INSERT INTO home_settings 
         (hero_title, hero_subtitle, hero_description, welcome_message, 
          announcement, features, how_it_works, terms_conditions, about_us,
          contact_email, contact_phone, updated_by, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          hero_title, hero_subtitle, hero_description,
          welcome_message, announcement, featuresJson,
          howItWorksJson, terms_conditions, about_us,
          contact_email, contact_phone, adminId
        ]
      );
    }
    
    res.json({
      success: true,
      message: 'Home settings updated successfully'
    });
  } catch (error) {
    console.error('Update home settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update home settings'
    });
  }
};
