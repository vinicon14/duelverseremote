-- Garantir que a tabela live_duels envia dados completos no realtime
ALTER TABLE live_duels REPLICA IDENTITY FULL;