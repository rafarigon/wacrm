"use client";

import type { Lead } from "@/types";
import { LEAD_ETAPAS, waLink } from "@/lib/leads";
import { Building2, CalendarDays, MessageCircle } from "lucide-react";

interface LeadAgendaProps {
  leads: Lead[];
  onEditLead: (lead: Lead) => void;
}

// Agenda de visitas: só leads com data_visita, agrupados por dia.
export function LeadAgenda({ leads, onEditLead }: LeadAgendaProps) {
  const comVisita = leads
    .filter((l) => l.data_visita)
    .sort(
      (a, b) =>
        new Date(a.data_visita!).getTime() - new Date(b.data_visita!).getTime(),
    );

  if (comVisita.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 py-16 text-center">
        <CalendarDays className="mb-3 h-8 w-8 text-slate-600" />
        <p className="text-sm font-medium text-slate-300">
          Nenhuma visita agendada
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Defina a data da visita no cadastro do lead para vê-la aqui.
        </p>
      </div>
    );
  }

  const porDia = new Map<string, Lead[]>();
  for (const lead of comVisita) {
    const dia = new Date(lead.data_visita!).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(lead);
  }

  return (
    <div className="space-y-6">
      {[...porDia.entries()].map(([dia, doDia]) => (
        <div key={dia}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 first-letter:uppercase">
            {dia}
          </h3>
          <div className="space-y-2">
            {doDia.map((lead) => {
              const etapa = LEAD_ETAPAS.find((e) => e.id === lead.etapa);
              const wa = waLink(lead);
              const hora = new Date(lead.data_visita!).toLocaleTimeString(
                "pt-BR",
                { hour: "2-digit", minute: "2-digit" },
              );
              return (
                <div
                  key={lead.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onEditLead(lead)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onEditLead(lead);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition-colors hover:border-slate-700 hover:bg-slate-900"
                >
                  <span className="w-12 shrink-0 text-sm font-bold text-white">
                    {hora}
                  </span>
                  <span
                    aria-hidden
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: etapa?.color ?? "#94a3b8" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {lead.nome}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-slate-400">
                      {lead.imovel && (
                        <>
                          <Building2 className="h-3 w-3" />
                          <span className="truncate">{lead.imovel}</span>
                        </>
                      )}
                      {lead.telefone && (
                        <span className="truncate">· {lead.telefone}</span>
                      )}
                    </p>
                  </div>
                  <span className="hidden shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300 sm:inline">
                    {etapa?.label}
                  </span>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Chamar no WhatsApp"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700 text-emerald-500 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
