"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Lead, LeadEtapa } from "@/types";
import { LEAD_ETAPAS, LEAD_ORIGENS, TEMPERATURAS, temperatura } from "@/lib/leads";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Flame, Loader2, Snowflake, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface LeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
  defaultEtapa?: LeadEtapa;
  onSaved: () => void;
}

const selectClass =
  "h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary";

// timestamptz → valor de <input type="datetime-local"> no fuso local
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeadForm({
  open,
  onOpenChange,
  lead,
  defaultEtapa,
  onSaved,
}: LeadFormProps) {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [imovel, setImovel] = useState("");
  const [origem, setOrigem] = useState("");
  const [score, setScore] = useState(100);
  const [etapa, setEtapa] = useState<LeadEtapa>("novo");
  const [dataVisita, setDataVisita] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync prop-driven dos campos a cada abertura (mesmo padrão do DealForm).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (lead) {
      setNome(lead.nome);
      setTelefone(lead.telefone ?? "");
      setEmail(lead.email ?? "");
      setImovel(lead.imovel ?? "");
      setOrigem(lead.origem ?? "");
      setScore(lead.score);
      setEtapa(lead.etapa);
      setDataVisita(toLocalInput(lead.data_visita));
      setNotas(lead.notas ?? "");
    } else {
      setNome("");
      setTelefone("");
      setEmail("");
      setImovel("");
      setOrigem("");
      setScore(100);
      setEtapa(defaultEtapa ?? "novo");
      setDataVisita("");
      setNotas("");
    }
  }, [open, lead, defaultEtapa]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSave() {
    if (!nome.trim()) {
      toast.error("Informe o nome do lead");
      return;
    }
    setSaving(true);
    const payload = {
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      email: email.trim() || null,
      imovel: imovel.trim() || null,
      origem: origem || null,
      score,
      etapa,
      data_visita: dataVisita ? new Date(dataVisita).toISOString() : null,
      notas: notas.trim() || null,
    };

    if (lead) {
      const { error } = await supabase
        .from("leads")
        .update(payload)
        .eq("id", lead.id);
      setSaving(false);
      if (error) {
        toast.error("Não foi possível salvar o lead");
        return;
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !accountId) {
        toast.error("Sessão sem conta vinculada — entre de novo.");
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from("leads")
        .insert({ ...payload, user_id: user.id, account_id: accountId });
      setSaving(false);
      if (error) {
        toast.error("Não foi possível criar o lead");
        return;
      }
    }

    toast.success(lead ? "Lead atualizado" : "Lead criado");
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!lead) return;
    setDeleting(true);
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    setDeleting(false);
    if (error) {
      toast.error("Não foi possível excluir o lead");
      return;
    }
    toast.success("Lead excluído");
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  const temp = temperatura(score);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-slate-700 bg-slate-900 p-0 text-slate-200 sm:max-w-lg"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-slate-700/50 p-4">
            <SheetTitle className="text-white">
              {lead ? "Editar lead" : "Novo lead"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid gap-2">
              <Label className="text-slate-300">Nome *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do cliente"
                className="border-slate-700 bg-slate-800 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-slate-300">Telefone (WhatsApp)</Label>
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(54) 99999-0000"
                  className="border-slate-700 bg-slate-800 text-white"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-300">E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="border-slate-700 bg-slate-800 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-slate-300">Imóvel de interesse</Label>
                <Input
                  value={imovel}
                  onChange={(e) => setImovel(e.target.value)}
                  placeholder="Joaquim 101"
                  className="border-slate-700 bg-slate-800 text-white"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-300">Origem</Label>
                <select
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Selecione...</option>
                  {LEAD_ORIGENS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-slate-300">
                Temperatura do lead — {score}%
              </Label>
              <div className="flex gap-2">
                {(Object.keys(TEMPERATURAS) as (keyof typeof TEMPERATURAS)[]).map(
                  (t) => {
                    const meta = TEMPERATURAS[t];
                    const ativo = temp === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setScore(meta.score)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                          ativo
                            ? `${meta.pill} border-current`
                            : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {t === "frio" ? (
                          <Snowflake className="h-3.5 w-3.5" />
                        ) : (
                          <Flame className="h-3.5 w-3.5" />
                        )}
                        {meta.label}
                      </button>
                    );
                  },
                )}
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
                className="accent-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-slate-300">Etapa</Label>
                <select
                  value={etapa}
                  onChange={(e) => setEtapa(e.target.value as LeadEtapa)}
                  className={selectClass}
                >
                  {LEAD_ETAPAS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-300">Visita agendada</Label>
                <Input
                  type="datetime-local"
                  value={dataVisita}
                  onChange={(e) => setDataVisita(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-white [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-slate-300">Notas</Label>
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observações sobre o lead..."
                className="min-h-20 border-slate-700 bg-slate-800 text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-700/50 p-4">
            {lead ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Confirmar exclusão"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    className="text-slate-400"
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Excluir
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-slate-400"
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                {lead ? "Salvar" : "Criar lead"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
