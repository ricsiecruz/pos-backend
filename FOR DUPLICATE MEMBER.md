-- Step 1: Identify duplicate members
SELECT name, COUNT(*) as count
FROM members
GROUP BY name
HAVING COUNT(*) > 1;

-- Assume the duplicates are found, and you decide to keep the member with id = 1 and remove the one with id = 2.

-- Step 2: Update the sales table
UPDATE sales
SET customer = (SELECT name FROM members WHERE id = 1)
WHERE customer = (SELECT name FROM members WHERE id = 2);

-- Step 3: Delete the duplicate member
DELETE FROM members
WHERE id = 2;
