-- Encryption backfill and key rotation rewrite stored values in place
-- (plaintext -> ciphertext, old key -> current key). The data does not
-- change, so neither should updated_at: the maintenance job sets
-- revualy.maintenance = 'on' for its own transactions and the trigger
-- leaves updated_at alone. Every other writer is unaffected.
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('revualy.maintenance', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
