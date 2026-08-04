BEGIN;

WITH required_products(code) AS (
  VALUES
    ('platform_service_1y'),
    ('platform_service_2y'),
    ('platform_service_3y')
),
published_versions AS (
  SELECT
    product.id AS product_id,
    version.id AS version_id
  FROM public.platform_service_products AS product
  JOIN required_products
    ON required_products.code = product.code
  JOIN public.platform_service_product_versions AS version
    ON version.product_id = product.id
   AND version.version = 1
)
UPDATE public.platform_service_products AS product
SET published_version_id = published_versions.version_id,
    updated_at = now()
FROM published_versions
WHERE product.id = published_versions.product_id
  AND product.published_version_id IS DISTINCT FROM published_versions.version_id;

DO $$
BEGIN
  IF EXISTS (
    WITH required_products(code) AS (
      VALUES
        ('platform_service_1y'),
        ('platform_service_2y'),
        ('platform_service_3y')
    )
    SELECT 1
    FROM required_products
    LEFT JOIN public.platform_service_products AS product
      ON product.code = required_products.code
    LEFT JOIN public.platform_service_product_versions AS version
      ON version.id = product.published_version_id
     AND version.product_id = product.id
     AND version.version = 1
    WHERE product.id IS NULL
       OR product.status <> 'enabled'
       OR product.published_version_id IS NULL
       OR version.id IS NULL
  ) THEN
    RAISE EXCEPTION 'PLATFORM_SERVICE_SEED_PUBLISHED_VERSION_MISSING';
  END IF;
END;
$$;

COMMIT;
