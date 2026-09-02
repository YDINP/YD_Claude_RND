-- Custom SQL migration file, put your code below! ----
-- ledger는 append-only여야 한다 (UPDATE/DELETE 금지).
-- 애플리케이션 코드가 실수로라도 원장을 고치지 못하도록 DB 레벨에서 강제한다.
CREATE OR REPLACE FUNCTION ledger_prevent_update_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: % on ledger is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ledger_append_only ON "ledger";
--> statement-breakpoint
CREATE TRIGGER ledger_append_only
  BEFORE UPDATE OR DELETE ON "ledger"
  FOR EACH ROW
  EXECUTE FUNCTION ledger_prevent_update_delete();
