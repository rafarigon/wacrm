"use client";

import type { Lead } from "@/types";
import {
  Building2,
  Calendar,
  Flame,
  Handshake,
  Mail,
  MessageCircle,
  Phone,
  Snowflake,
  StickyNote,
} from "lucide-react";
import {
  LEAD_ETAPAS,
  TEMPERATURAS,
  fmtDataCurta,
  temperatura,
  waLink,
} from "@/lib/leads";
import { useWhatsAppNav } from "./use-whatsapp-nav";

interface LeadCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  isOverlay?: boolean;
}

// O card inteiro é clicável (abre a edição), mas telefone, e-mail e o
// botão WhatsApp são links reais — stopPropagation para não abrir o
// form junto. Não pode ser <button> como o DealCard: <a> dentro de
// <button> é HTML inválido e quebra a hidratação.
export function LeadCard({ lead, onEdit, isOverlay }: LeadCardProps) {
  const temp = temperatura(lead.score);
  const tempMeta = TEMPERATURAS[temp];
  const etapa = LEAD_ETAPAS.find((e) => e.id === lead.etapa);
  const wa = waLink(lead);
  const openWhatsApp = useWhatsAppNav();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isOverlay && onEdit(lead)}
      onKeyDown={(e) => {
        if (!isOverlay && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onEdit(lead);
        }
      }}
      className={`group relative w-full cursor-pointer rounded-xl border bg-slate-800/70 p-3 text-left shadow-sm transition-all ${tempMeta.border} ${
        isOverlay
          ? "shadow-xl"
          : "hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-lg"
      }`}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: etapa?.color ?? "#94a3b8" }}
      />

      <div className="flex items-start justify-between gap-2 pl-1">
        <h4 className="flex-1 truncate text-sm font-semibold text-white">
          {lead.nome}
        </h4>
        <span
          title={tempMeta.label}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tempMeta.pill}`}
        >
          {temp === "frio" ? (
            <Snowflake className="h-3 w-3" />
          ) : (
            <Flame className="h-3 w-3" />
          )}
          {lead.score}%
        </span>
        {lead.notas && (
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
        )}
      </div>

      {lead.telefone && (
        <a
          href={wa ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            void openWhatsApp(lead.telefone, wa);
          }}
          className="mt-2 flex items-center gap-2 pl-1 text-xs text-slate-300 hover:text-primary"
          title="Abrir conversa"
        >
          <Phone className="h-3 w-3 shrink-0 text-slate-500" />
          <span className="truncate">{lead.telefone}</span>
        </a>
      )}

      {lead.email && (
        <a
          href={`mailto:${lead.email}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-1.5 flex items-center gap-2 pl-1 text-xs text-slate-300 hover:text-primary"
          title="Enviar e-mail"
        >
          <Mail className="h-3 w-3 shrink-0 text-slate-500" />
          <span className="truncate">{lead.email}</span>
        </a>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 pl-1">
        {lead.imovel ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.imovel}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
          <Calendar className="h-3 w-3" />
          {fmtDataCurta(lead.data_visita ?? lead.created_at)}
        </span>
      </div>

      {lead.corretor_nome && (
        <div
          title={`Lead do Portal do Corretor — ${lead.corretor_nome}`}
          className="mt-2 flex items-center gap-1.5 pl-1 text-[10.5px] text-slate-500"
        >
          <Handshake className="h-3 w-3 shrink-0" />
          <span className="truncate">via {lead.corretor_nome}</span>
        </div>
      )}

      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            void openWhatsApp(lead.telefone, wa);
          }}
          className="mt-3 flex items-center justify-center gap-2 rounded-full border border-slate-600 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
        >
          <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
          WhatsApp
        </a>
      )}
    </div>
  );
}
