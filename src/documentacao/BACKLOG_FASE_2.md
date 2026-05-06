# Backlog — Fase 2 (Auth / segurança) — Issues pendentes

Registo de refinamentos relativos ao `build-admin.html` e hardening complementar.

## ISSUE-Auth-01 · R11 — Integrar reCAPTCHA v3 (Google)

- Validar score ≥ 0,5 nos endpoints públicos (`/login`, `/register`, `/forgot-password`, eventualmente `/reset-password`).
- Fallback para desafío explícito se `RECAPTCHA_BYPASS=false` em produção.

## ISSUE-Auth-02 · R14 — Atualização mensal dos domínios descartáveis

- Pipeline (cron ou GH Action) que merge novo ficheiro em `src/config/disposableEmails.config.js` ou ingestão externa (`DISPOSABLE_LIST_URL`).
- Smoke test automatizado.

## ISSUE-Auth-03 · R6 — Quotas finas de “esqueci senha”

- Já implementado: 3 pedidos/hora por e-mail e 10/dia por IP.
- Falta: “10 envios por dia por origem” com chave composta adicional se a spec distinguir `origem` ≠ IP; *cooldown* de 60s entre reenvios por e-mail (persistido em Redis ou tabela).

## ISSUE-Auth-04 · R10 — Limite “30 verificações/min por origem” (lookup e-mail)

- Endpoint dedicado `GET /auth/check-email` (debounce no cliente) com limiter específico.

## ISSUE-Auth-05 · R8 — Sessão & cookies

- Hoje: JWT stateless (access + refresh). O spec descreve cookie `httpOnly` + expiração por inatividade 30 min com excepção de consulta ativa.
- Avaliar BFF com cookies ou rotação de refresh mais agressiva + *idle timeout* no cliente.

## ISSUE-Auth-06 · R8 — E-mail “novo dispositivo”

- Disparar template após `AUTH_LOGIN_SUCCESS` quando o `UserDevice` for novo `findOrCreate` com `created === true`.

## ISSUE-Auth-07 · R12 — Re-aceite de termos após nova versão

- Banner obrigatório: flag em `users` ou tabela `terms_acceptances`; bloquear compras até aceitar versão atual.

## ISSUE-Auth-08 · R15 — Retenção 12 meses e visualização Gestora

- Política de purga/partição em `audit_logs`; UI painel apenas leitura.
- Correlação com `correlation_id` distribuído.

## ISSUE-Audit-01 · FK opcional em `audit_logs.admin_id`

- Migrar Postgres se `NOT NULL` ainda existir em bases antigas; garantir índices em `occurred_at` + `action`.

## ISSUE-Device-01 · `push_token` obrigatório legacy

- Ajustar dados existentes onde `push_token NOT NULL`; backfill placeholders `web:*` onde aplicável.
