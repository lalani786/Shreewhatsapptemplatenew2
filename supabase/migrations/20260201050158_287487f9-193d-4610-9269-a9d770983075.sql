-- Create storage bucket for WhatsApp media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
);

-- Allow authenticated users to upload to the bucket
CREATE POLICY "Authenticated users can upload whatsapp media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

-- Allow public read access for WhatsApp to fetch the images
CREATE POLICY "Public can view whatsapp media"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'whatsapp-media');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete their whatsapp media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'whatsapp-media');