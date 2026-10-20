-- The runner registers a preflighted plan: retain explicit unique body IDs first,
-- reserve all existing codes, then assign deterministic unused numbers.
-- Existing non-null codes and all original Markdown are preserved.
UPDATE requirements
SET requirement_code = legacy_requirement_code(id)
WHERE requirement_code IS NULL;
