"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lead, LeadEtapa } from "@/types";
import { LeadBoard } from "@/components/leads/lead-board";
import { LeadAgenda } from "@/components/leads/lead-agenda";
import { LeadList } from "@/components/leads/lead-list";
import { LeadForm } from "@/components/leads/lead-form";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  Kanban,
  List,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

type Visao = "funil" | "agenda" | "lista";

const PERIODOS = [
  { id: "todos", label: "Todos os períodos", dias: null },
  { id: "hoje", label: "Hoje", dias: 1 },
  { id: "7d", label: "Últimos 7 dias", dias: 7 },
  { id: "30d", label: "Últimos 30 dias", dias: 30 },
  { id: "90d", label: "Últimos 90 dias", dias: 90 },
] as const;

const selectPill =
  "h-9 rounded-full border border-slate-700 bg-slate-900 px-4 pr-8 text-xs font-medium text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-primary";

export default function LeadsPage() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [visao, setVisao] = useState<Visao>("funil");
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("todos");
  // Corte calculado na troca do filtro (Date.now() é impuro para o render)
  const [corte, setCorte] = useState<number | null>(null);
  const [imovel, setImovel] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [leadEmEdicao, setLeadEmEdicao] = useState<Lead | null>(null);
  const [etapaInicial, setEtapaInicial] = useState<LeadEtapa | undefined>();

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Não foi possível carregar os leads");
      return;
    }
    setLeads((data ?? []) as Lead[]);
  }, [supabase]);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      await carregar();
      if (!cancelled) setCarregando(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, carregar]);

  // Filtros: período (created_at) + imóvel de interesse
  const imoveis = useMemo(
    () =>
      [...new Set(leads.map((l) => l.imovel).filter(Boolean))].sort() as string[],
    [leads],
  );

  const filtrados = useMemo(
    () =>
      leads.filter((l) => {
        if (corte && new Date(l.created_at).getTime() < corte) return false;
        if (imovel && l.imovel !== imovel) return false;
        return true;
      }),
    [leads, corte, imovel],
  );

  const trocarPeriodo = (id: (typeof PERIODOS)[number]["id"]) => {
    setPeriodo(id);
    const p = PERIODOS.find((x) => x.id === id);
    setCorte(p?.dias != null ? Date.now() - p.dias * 24 * 60 * 60 * 1000 : null);
  };

  // Movimento no Kanban / troca de etapa na lista — otimista com rollback
  const moverLead = useCallback(
    async (leadId: string, etapa: LeadEtapa) => {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, etapa } : l)),
      );
      const { error } = await supabase
        .from("leads")
        .update({ etapa })
        .eq("id", leadId);
      if (error) {
        toast.error("Não foi possível mover o lead");
        carregar();
      }
    },
    [supabase, carregar],
  );

  const abrirNovo = (etapa?: LeadEtapa) => {
    setLeadEmEdicao(null);
    setEtapaInicial(etapa);
    setFormAberto(true);
  };

  const abrirEdicao = (lead: Lead) => {
    setLeadEmEdicao(lead);
    setEtapaInicial(undefined);
    setFormAberto(true);
  };

  const VISOES: { id: Visao; label: string; Icon: typeof Kanban }[] = [
    { id: "funil", label: "Funil", Icon: Kanban },
    { id: "agenda", label: "Agenda", Icon: CalendarDays },
    { id: "lista", label: "Lista", Icon: List },
  ];

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Leads</h1>
          <p className="text-sm text-slate-400">
            {filtrados.length} lead{filtrados.length === 1 ? "" : "s"} capturado
            {filtrados.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => abrirNovo()}>
          <Plus className="mr-1 h-4 w-4" />
          Novo Lead
        </Button>
      </div>

      {/* Filtros em pill, como no layout de referência */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={periodo}
          onChange={(e) =>
            trocarPeriodo(e.target.value as (typeof PERIODOS)[number]["id"])
          }
          className={selectPill}
        >
          {PERIODOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={imovel}
          onChange={(e) => setImovel(e.target.value)}
          className={selectPill}
        >
          <option value="">Todos os imóveis</option>
          {imoveis.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>

      {/* Alternador de visão: Funil | Agenda | Lista */}
      <div className="mb-5 inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1">
        {VISOES.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setVisao(id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              visao === id
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="py-20 text-center text-sm text-slate-400">
          Carregando leads...
        </div>
      ) : (
        <>
          {visao === "funil" && (
            <LeadBoard
              leads={filtrados}
              onLeadMoved={moverLead}
              onAddLead={abrirNovo}
              onEditLead={abrirEdicao}
            />
          )}
          {visao === "agenda" && (
            <LeadAgenda leads={filtrados} onEditLead={abrirEdicao} />
          )}
          {visao === "lista" && (
            <LeadList
              leads={filtrados}
              onEditLead={abrirEdicao}
              onEtapaChange={moverLead}
            />
          )}
        </>
      )}

      <LeadForm
        open={formAberto}
        onOpenChange={setFormAberto}
        lead={leadEmEdicao}
        defaultEtapa={etapaInicial}
        onSaved={carregar}
      />
    </div>
  );
}
