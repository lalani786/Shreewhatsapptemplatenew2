-- Migration to increase whatsapp-media bucket limit to 100MB and ensure video/mp4, video/webm, video/quicktime are allowed
UPDATE storage.buckets
SET 
  file_size_limit = 104857600, -- 100MB limit for high-definition video ads
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
WHERE id = 'whatsapp-media';
