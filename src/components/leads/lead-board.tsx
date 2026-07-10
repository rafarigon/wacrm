"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Lead, LeadEtapa } from "@/types";
import { LEAD_ETAPAS } from "@/lib/leads";
import { LeadCard } from "./lead-card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface LeadBoardProps {
  leads: Lead[];
  onLeadMoved: (leadId: string, etapa: LeadEtapa) => void;
  onAddLead: (etapa: LeadEtapa) => void;
  onEditLead: (lead: Lead) => void;
}

// Kanban do funil de leads — mesma mecânica do PipelineBoard
// (colunas droppable, cards draggable, snap horizontal no mobile),
// mas com etapas fixas em vez de stages por pipeline.
export function LeadBoard({
  leads,
  onLeadMoved,
  onAddLead,
  onEditLead,
}: LeadBoardProps) {
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  const leadsPorEtapa = useMemo(() => {
    const map = new Map<LeadEtapa, Lead[]>();
    for (const etapa of LEAD_ETAPAS) map.set(etapa.id, []);
    for (const lead of leads) map.get(lead.etapa)?.push(lead);
    return map;
  }, [leads]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeLead = activeLeadId
    ? (leads.find((l) => l.id === activeLeadId) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveLeadId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLeadId(null);
    const { active, over } = event;
    if (!over) return;
    const leadId = String(active.id);
    const etapa = String(over.id) as LeadEtapa;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.etapa === etapa) return;
    if (!LEAD_ETAPAS.some((e) => e.id === etapa)) return;
    onLeadMoved(leadId, etapa);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLeadId(null)}
    >
      <div className="pipeline-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:snap-none">
        {LEAD_ETAPAS.map((etapa) => (
          <EtapaColumn
            key={etapa.id}
            etapa={etapa}
            leads={leadsPorEtapa.get(etapa.id) ?? []}
            onAddLead={onAddLead}
            onEditLead={onEditLead}
          />
        ))}
      </div>

      <DragOverlay
        dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
      >
        {activeLead ? (
          <div className="opacity-90">
            <LeadCard lead={activeLead} onEdit={() => {}} isOverlay />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .pipeline-scroll {
          scroll-behavior: smooth;
        }
        @media (hover: none), (pointer: coarse) {
          .pipeline-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .pipeline-scroll {
            scrollbar-width: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .pipeline-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgb(51 65 85) transparent;
          }
          .pipeline-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .pipeline-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb {
            background-color: rgb(51 65 85);
            border-radius: 9999px;
          }
        }
      `}</style>
    </DndContext>
  );
}

function EtapaColumn({
  etapa,
  leads,
  onAddLead,
  onEditLead,
}: {
  etapa: (typeof LEAD_ETAPAS)[number];
  leads: Lead[];
  onAddLead: (etapa: LeadEtapa) => void;
  onEditLead: (lead: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });

  return (
    <div className="flex w-[85vw] min-w-[260px] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border border-gray-200 bg-gray-50/80 p-4 lg:w-auto lg:max-w-none lg:flex-1 lg:basis-[260px] lg:shrink lg:snap-none">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 truncate text-sm font-semibold text-gray-900">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: etapa.color }}
          />
          {etapa.label}
        </h3>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700">
          {leads.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-all ${
          isOver
            ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2"
            : ""
        }`}
      >
        {leads.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-10 text-xs text-gray-400">
            Arraste um lead para cá
          </div>
        ) : (
          leads.map((lead) => (
            <DraggableLeadCard key={lead.id} lead={lead} onEdit={onEditLead} />
          ))
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddLead(etapa.id)}
        className="mt-3 w-full justify-start border border-dashed border-gray-200 bg-transparent text-gray-500 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
      >
        <Plus className="mr-1 h-3 w-3" />
        Novo lead
      </Button>
    </div>
  );
}

function DraggableLeadCard({
  lead,
  onEdit,
}: {
  lead: Lead;
  onEdit: (lead: Lead) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
    >
      <LeadCard lead={lead} onEdit={onEdit} />
    </div>
  );
}
