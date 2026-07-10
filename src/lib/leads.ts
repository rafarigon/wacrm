import type { LeadEtapa } from "@/types";

// Etapas fixas do funil imobiliário — cores seguem a linguagem do
// pipeline board (dot colorido por coluna).
export const LEAD_ETAPAS: { id: LeadEtapa; label: string; color: string }[] = [
  { id: "novo", label: "Novo Lead", color: "#eab308" },
  { id: "atendimento", label: "Em Atendimento", color: "#3b82f6" },
  { id: "visita", label: "Visita Agendada", color: "#8b5cf6" },
  { id: "proposta", label: "Proposta", color: "#f97316" },
  { id: "vendido", label: "Vendido", color: "#22c55e" },
  { id: "perdido", label: "Perdido", color: "#64748b" },
];

export const LEAD_ORIGENS = [
  "Instagram",
  "Facebook",
  "Site",
  "Portais imobiliários",
  "Indicação",
  "WhatsApp",
  "Placa / fachada",
  "Outro",
];

export type Temperatura = "quente" | "morno" | "frio";

export function temperatura(score: number): Temperatura {
  if (score >= 85) return "quente";
  if (score >= 50) return "morno";
  return "frio";
}

export const TEMPERATURAS: Record<
  Temperatura,
  { label: string; score: number; pill: string; border: string }
> = {
  quente: {
    label: "Quente",
    score: 100,
    pill: "bg-amber-500/15 text-amber-600",
    border: "border-amber-500/40",
  },
  morno: {
    label: "Morno",
    score: 70,
    pill: "bg-yellow-500/15 text-yellow-700",
    border: "border-yellow-500/30",
  },
  frio: {
    label: "Frio",
    score: 40,
    pill: "bg-sky-500/15 text-sky-600",
    border: "border-gray-200",
  },
};

/** Link wa.me com a mensagem do print: menciona o imóvel de interesse. */
export function waLink(lead: {
  nome: string;
  telefone: string | null;
  imovel: string | null;
}): string | null {
  const digits = (lead.telefone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // Sem DDI (10-11 dígitos = DDD + número BR), assume Brasil.
  const full = digits.length <= 11 ? `55${digits}` : digits;
  const primeiro = lead.nome.trim().split(/\s+/)[0] || "";
  const texto = lead.imovel
    ? `Olá ${primeiro}, vi que você se interessou pelo *${lead.imovel}*. Como posso te ajudar?`
    : `Olá ${primeiro}, tudo bem? Como posso te ajudar?`;
  return `https://wa.me/${full}?text=${encodeURIComponent(texto)}`;
}

export function fmtDataCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
