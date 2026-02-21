-- Add pdf_s3_key column to final_emrs table to store the S3 key of the generated PDF
ALTER TABLE public.final_emrs ADD COLUMN IF NOT EXISTS pdf_s3_key TEXT;
