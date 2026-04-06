WITH ranked_groups AS (
  SELECT
    id,
    name,
    FIRST_VALUE(id) OVER (
      PARTITION BY name
      ORDER BY created_at ASC, id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY name
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM public.featured_groups
),
duplicate_groups AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked_groups
  WHERE row_num > 1
)
INSERT INTO public.menu_featured_groups (menu_id, featured_group_id, display_order)
SELECT
  mfg.menu_id,
  dg.keep_id,
  mfg.display_order
FROM public.menu_featured_groups AS mfg
JOIN duplicate_groups AS dg ON dg.duplicate_id = mfg.featured_group_id
ON CONFLICT (menu_id, featured_group_id) DO UPDATE
SET display_order = LEAST(public.menu_featured_groups.display_order, EXCLUDED.display_order);

WITH ranked_groups AS (
  SELECT
    id,
    name,
    FIRST_VALUE(id) OVER (
      PARTITION BY name
      ORDER BY created_at ASC, id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY name
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM public.featured_groups
),
duplicate_groups AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked_groups
  WHERE row_num > 1
)
INSERT INTO public.featured_slots (
  featured_group_id,
  item_id,
  sell_note,
  display_order,
  confirmed_at,
  confirmed_by
)
SELECT
  dg.keep_id,
  fs.item_id,
  fs.sell_note,
  fs.display_order,
  fs.confirmed_at,
  fs.confirmed_by
FROM public.featured_slots AS fs
JOIN duplicate_groups AS dg ON dg.duplicate_id = fs.featured_group_id
ON CONFLICT (featured_group_id, item_id) DO UPDATE
SET
  sell_note = CASE
    WHEN public.featured_slots.sell_note = '' AND EXCLUDED.sell_note <> '' THEN EXCLUDED.sell_note
    ELSE public.featured_slots.sell_note
  END,
  display_order = LEAST(public.featured_slots.display_order, EXCLUDED.display_order),
  confirmed_at = COALESCE(public.featured_slots.confirmed_at, EXCLUDED.confirmed_at),
  confirmed_by = COALESCE(public.featured_slots.confirmed_by, EXCLUDED.confirmed_by);

WITH ranked_groups AS (
  SELECT
    id,
    name,
    ROW_NUMBER() OVER (
      PARTITION BY name
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM public.featured_groups
)
DELETE FROM public.featured_groups AS fg
USING ranked_groups AS rg
WHERE fg.id = rg.id
  AND rg.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS featured_groups_name_key
  ON public.featured_groups (name);
