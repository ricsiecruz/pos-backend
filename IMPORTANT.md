UPDATE sales
SET load = computer
WHERE computer IS NOT NULL;

ALTER TABLE sales
ALTER COLUMN computer TYPE TEXT
USING computer::TEXT;
