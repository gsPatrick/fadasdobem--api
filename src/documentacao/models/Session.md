# Tabela `sessions`

**Propósito:** registrar consultas ao vivo, métricas de cronômetro e snapshots financeiros imutáveis após liquidação.

---

## Monetário (DECIMAL estrito onde aplicável)

| Campo | Escala observada |
|-------|------------------|
| `minute_price_applied_snapshot` | `DECIMAL(14,4)` |
| `specialist_commission_pct_snapshot` | `DECIMAL(14,4)` — percentuais armazenados com 4 casas |
| `total_cost`, `platform_fee_amount_snapshot`, `specialist_commission_amount_snapshot` | `DECIMAL(14,4)` |

## Cronômetro (tempo)

`free_minutes_used` / `paid_minutes_used` usam `DECIMAL(10,4)` (tempo granular, não BRL monetário estrito conforme modelo).

## Motivo operacional do encerramento

`ended_reason_code` ENUM (ex.: `CLIENT_DISCONNECT`, `TIMEOUT`, `BALANCE_ZERO`, `HARD_CUT_BALANCE_ZERO`, ...) exposto também em código via `Session.SESSION_END_REASONS`.

## Magic link seguro

`magic_link_token` tem unicidade apenas para linhas ativas onde o token existe (`sessions_magic_token_deleted_null_uidx`).
