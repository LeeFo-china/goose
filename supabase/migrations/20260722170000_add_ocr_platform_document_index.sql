-- Keep the paginated platform OCR document-type filter on an indexed sort path.

CREATE INDEX IF NOT EXISTS ocr_recognitions_document_created_idx
ON public.ocr_recognitions(document_type, created_at DESC);
