CREATE TABLE chat_token_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  endpoint text NOT NULL,  -- 'chat', 'greeting', 'title'
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own usage" ON chat_token_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users can insert own usage" ON chat_token_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);
