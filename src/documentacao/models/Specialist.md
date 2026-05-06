# Tabela `specialists`

**Propósito:** vitrine técnica e operativa das tarólogas: reputação cached, dados de PIX para repasses, estado em tempo quase-real e travamento contra corrida de duas compras paralelas sob a mesma profissional.

---

| Campo | Tipo | Nulo | Observação |
|-------|------|------|------------|
| `id` | UUID | Não | PK. |
| `user_id` | UUID | Não | FK única ao `users` com papel TARÓLOGA. |
| `display_name`, `bio`, `avatar_url`, `cover_image_url` | String/Text | UX vitrine. |
| `chave_pix`, `chave_pix_type`, `titular_pix_nome` | String | Necessários para payouts. |
| `status` | Enum | Online / Atendimento / Ausente / Offline. |
| `reserved_by_client_id`, `reserved_until` | UUID/Date | Trava corrida até ~8 min antes do pagamento. |
| Métricas `rating_average_cached`, `reviews_count_cached`, `sessions_completed_cached` | Numéricos | Atualização assíncrona. |
| `vitrine_ordem`, `accepts_queue_any` | Ordering & filas. |
| `commission_percent_default` | DECIMAL | Base comissão até contratos extras. |
| `agora_uid`, `intelbras_ramal`, `chatwoot_inbox_id` | Integrações tecnológicas. |
| `is_blocked`, `blocked_reason` | Travas administrativas. |
