-- Trigram similarity (word_similarity) ranks "did you mean" candidates, so a misspelt search reaches older tasks.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
