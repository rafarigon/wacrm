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
import { useWhatsAppNav } from "./use-whatsapp-nav";

interface LeadListProps {
  leads: Lead[];
  onEditLead: (lead: Lead) => void;
  onEtapaChange: (leadId: string, etapa: LeadEtapa) => void;
}

export function LeadList({ leads, onEditLead, onEtapaChange }: LeadListProps) {
  const openWhatsApp = useWhatsAppNav();
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50/80 py-16 text-center text-sm text-gray-500">
        Nenhum lead neste filtro.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50/80">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 hover:bg-transparent">
            <TableHead className="text-gray-500">Nome</TableHead>
            <TableHead className="text-gray-500">Contato</TableHead>
            <TableHead className="text-gray-500">Imóvel</TableHead>
            <TableHead className="text-gray-500">Origem</TableHead>
            <TableHead className="text-gray-500">Score</TableHead>
            <TableHead className="text-gray-500">Etapa</TableHead>
            <TableHead className="text-right text-gray-500">Criado</TableHead>
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
                className="cursor-pointer border-gray-200 hover:bg-gray-50"
              >
                <TableCell className="font-medium text-gray-900">
                  {lead.nome}
                  {lead.corretor_nome && (
                    <div className="text-[10.5px] font-normal text-gray-400">
                      via {lead.corretor_nome}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5 text-xs">
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
                        className="text-gray-700 hover:text-emerald-600"
                        title="Abrir conversa"
                      >
                        {lead.telefone}
                      </a>
                    )}
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-500 hover:text-primary"
                      >
                        {lead.email}
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-gray-700">
                  {lead.imovel ?? "—"}
                </TableCell>
                <TableCell className="text-gray-500">
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
                    className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-primary"
                  >
                    {LEAD_ETAPAS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="text-right text-xs text-gray-400">
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
