-- Add image_url column to fortune_draw_events table
ALTER TABLE fortune_draw_events 
ADD COLUMN image_url VARCHAR(500) DEFAULT NULL COMMENT 'URL of the car/prize image';
