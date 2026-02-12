-- Step 15: Insert default cashout fee setting
INSERT INTO system_settings (key, value, description)
VALUES ('cashout_fee_percentage', '10.00', 'Percentual de taxa para resgate de DuelCoins')
ON CONFLICT (key) DO NOTHING;