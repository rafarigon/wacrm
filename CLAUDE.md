@AGENTS.md

---

# Personalização RR Incorporações (fork rafarigon/wacrm)

CRM da RR — produção em **https://quitto-crm.vercel.app** (projeto Vercel `quitto-crm`; domínios `crm-rr.vercel.app`/`rr-crm.vercel.app` pertencem a OUTROS times — não usar). Supabase **"WA CRM"** `fdqitgcbkgzennwzwgyk` (mesma org da RR; free tier PAUSA por inatividade — reativar via MCP `restore_project` se INACTIVE). Preview local: porta 5599 (launch.json no diretório principal do Claude). Fluxo: editar → `npm run typecheck` + `npx eslint` + `npm run build` → testar no preview → commit/push → `npx vercel --prod --yes`.

## Módulo Leads (personalização, 06/07/2026)
- Página `/leads` (`src/app/(dashboard)/leads/page.tsx`, componentes em `src/components/leads/`, helpers em `src/lib/leads.ts`): visões **Funil** (Kanban dnd-kit, mesma mecânica do PipelineBoard), **Agenda** (agrupada por dia de `data_visita`) e **Lista**; filtros de período (corte calculado no handler — `Date.now()` no render viola `react-hooks/purity`) e de imóvel (distinct dos leads).
- Tabela `leads` (migração `023_leads.sql`, aplicada): etapas fixas novo/atendimento/visita/proposta/vendido/perdido (constante `LEAD_ETAPAS`, não é tabela), score 0-100 (≥85 quente / ≥50 morno / frio), RLS `is_account_member(account_id, 'agent')` padrão da migração 017.
- Card: telefone → link `wa.me` com texto "Olá {nome}, vi que você se interessou pelo *{imóvel}*..."; e-mail → `mailto:`. Card é `<div role="button">` e NÃO `<button>` (links aninhados em button quebram hidratação).
- Login de teste: rafael.rigon+crm.teste@gmail.com, admin na conta do Rafael (criado via SQL — campos de token de auth.users como string vazia, senão "Database error querying schema"; senha compartilhada na sessão de 06/07/2026). Dados atuais são seeds de exemplo (Joaquim 101).
- **Sync com o Portal do Corretor (06/07/2026, mão única portal→CRM)**: visitas/leads criados pelos corretores parceiros no portal (tabela `corretor_visitas` do banco da RR `nwxesykrptzfdrrjtfou`) chegam aqui automaticamente via trigger `corretor_sync_wacrm` DAQUELE banco (pg_net + service key deste projeto no Vault de lá, secret `wacrm_service_key`; upsert por `external_id`, delete propaga; etapas mapeadas lead→novo, agendada/realizada→visita, venda→vendido, cancelada→perdido). Cards/lista mostram "via {corretor_nome}". NUNCA criar sync reverso — leads do CRM não podem aparecer no portal. Editar aqui um lead sincronizado é sobrescrito no próximo update do corretor (fonte da verdade = portal). Se este projeto estiver pausado, o sync falha silenciosamente (sem retry) — manter ativo.
- Pendências: e-mails de auth (confirmação/reset) usam o SMTP padrão do Supabase e o Site URL do projeto WA CRM — conferir em Auth → URL Configuration se for convidar mais usuários; WhatsApp Business API (inbox/broadcasts) não configurada (`META_APP_SECRET` placeholder).
