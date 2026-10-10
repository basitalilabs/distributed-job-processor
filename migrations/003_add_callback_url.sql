-- Optional URL to notify when a job reaches a final state (decision 010)
ALTER TABLE jobs ADD COLUMN callback_url TEXT;
