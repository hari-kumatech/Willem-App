-- English version of the assessment texts, shown when the UI language is English.
-- The Dutch texts stay in waarom / aanpak / score_reasons / risks.
-- Shape: { "waarom": text, "aanpak": text, "reasons": [text, …] (same order as score_reasons), "risks": [text, …] }
alter table public.companies add column if not exists texts_en jsonb;
