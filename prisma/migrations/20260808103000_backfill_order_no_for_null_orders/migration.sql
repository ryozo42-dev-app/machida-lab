WITH existing_max AS (
  SELECT
    to_char(order_date, 'YYYYMMDD') AS order_date_key,
    COALESCE(
      MAX(
        CASE
          WHEN order_no ~ '^ORD-[0-9]{8}-[0-9]{3}$' THEN CAST(RIGHT(order_no, 3) AS INTEGER)
          ELSE NULL
        END
      ),
      0
    ) AS max_seq
  FROM orders
  GROUP BY to_char(order_date, 'YYYYMMDD')
),
targets AS (
  SELECT
    o.id,
    to_char(o.order_date, 'YYYYMMDD') AS order_date_key,
    ROW_NUMBER() OVER (
      PARTITION BY to_char(o.order_date, 'YYYYMMDD')
      ORDER BY o.id
    ) AS row_num
  FROM orders o
  WHERE o.order_no IS NULL
),
assignments AS (
  SELECT
    t.id,
    CONCAT(
      'ORD-',
      t.order_date_key,
      '-',
      LPAD((COALESCE(e.max_seq, 0) + t.row_num)::text, 3, '0')
    ) AS generated_order_no
  FROM targets t
  LEFT JOIN existing_max e
    ON e.order_date_key = t.order_date_key
)
UPDATE orders o
SET order_no = a.generated_order_no
FROM assignments a
WHERE o.id = a.id
  AND o.order_no IS NULL;