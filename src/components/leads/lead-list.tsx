"use client";

import type { Lead, LeadEtapa } from "@/types";
import {
  LEAD_ETAPAS,
  TEMPERATURAS,
  fmtDataCurta,
  temperatura,
  waLink,
} from "@/lib/leads";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Flame, Snowflake } from "lucide-react";

interface LeadListProps {
  leads: Lead[];
  onEditLead: (lead: Lead) => void;
  onEtapaChange: (leadId: string, etapa: LeadEtapa) => void;
}

export function LeadList({ leads, onEditLead, onEtapaChange }: LeadListProps) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 py-16 text-center text-sm text-slate-400">
        Nenhum lead neste filtro.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-800 hover:bg-transparent">
            <TableHead className="text-slate-400">Nome</TableHead>
            <TableHead className="text-slate-400">Contato</TableHead>
            <TableHead className="text-slate-400">Imóvel</TableHead>
            <TableHead className="text-slate-400">Origem</TableHead>
            <TableHead className="text-slate-400">Score</TableHead>
            <TableHead className="text-slate-400">Etapa</TableHead>
            <TableHead className="text-right text-slate-400">Criado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const temp = temperatura(lead.score);
            const tempMeta = TEMPERATURAS[temp];
            const wa = waLink(lead);
            return (
              <TableRow
                key={lead.id}
                onClick={() => onEditLead(lead)}
                className="cursor-pointer border-slate-800 hover:bg-slate-800/50"
              >
                <TableCell className="font-medium text-white">
                  {lead.nome}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5 text-xs">
                    {lead.telefone && (
                      <a
                        href={wa ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-300 hover:text-emerald-400"
                        title="Chamar no WhatsApp"
                      >
                        {lead.telefone}
                      </a>
                    )}
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-400 hover:text-primary"
                      >
                        {lead.email}
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-slate-300">
                  {lead.imovel ?? "—"}
                </TableCell>
                <TableCell className="text-slate-400">
                  {lead.origem ?? "—"}
                </TableCell>
                <TableCell>
                  <span
                    title={tempMeta.label}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tempMeta.pill}`}
                  >
                    {temp === "frio" ? (
                      <Snowflake className="h-3 w-3" />
                    ) : (
                      <Flame className="h-3 w-3" />
                    )}
                    {lead.score}%
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <select
                    value={lead.etapa}
                    onChange={(e) =>
                      onEtapaChange(lead.id, e.target.value as LeadEtapa)
                    }
                    className="h-8 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs text-white outline-none focus:border-primary"
                  >
                    {LEAD_ETAPAS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="text-right text-xs text-slate-500">
                  {fmtDataCurta(lead.created_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
