WITH ranked_customer_ratings AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY log_id, author_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS row_num
  FROM public.project_log_comments
  WHERE author_type = 'customer'
    AND parent_id IS NULL
    AND rating IS NOT NULL
    AND deleted_at IS NULL
)
UPDATE public.project_log_comments AS comments
SET rating = NULL
FROM ranked_customer_ratings AS ranked
WHERE comments.id = ranked.id
  AND ranked.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_log_comments_customer_rating_unique
ON public.project_log_comments(log_id, author_id)
WHERE author_type = 'customer'
  AND parent_id IS NULL
  AND rating IS NOT NULL
  AND deleted_at IS NULL;
