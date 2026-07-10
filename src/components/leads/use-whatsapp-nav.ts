"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { phonesMatch } from "@/lib/whatsapp/phone-utils";

/**
 * Clique no WhatsApp de um lead: abre a conversa interna do inbox quando
 * ela existe (deep-link /inbox?c=<id>, o mesmo do dashboard), e só cai no
 * wa.me para leads que nunca conversaram pelo número conectado.
 *
 * A busca do contato segue o padrão do findExistingContact: pré-filtro
 * SQL pelo sufixo de 8 dígitos + phonesMatch estrito em JS, tolerante às
 * diferenças de formato (nacional vs +55).
 */
export function useWhatsAppNav() {
  const router = useRouter();

  return async (telefone: string | null, fallback: string | null) => {
    const digits = (telefone ?? "").replace(/\D/g, "");
    if (digits) {
      const suffix = digits.length >= 8 ? digits.slice(-8) : digits;
      const supabase = createClient();
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, phone")
        .like("phone", `%${suffix}`)
        .limit(10);
      const contact = (contacts ?? []).find(
        (c) => c.phone && phonesMatch(c.phone, telefone!),
      );
      if (contact) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contact.id)
          .maybeSingle();
        if (conv?.id) {
          router.push(`/inbox?c=${conv.id}`);
          return;
        }
      }
    }
    if (fallback) window.open(fallback, "_blank", "noopener,noreferrer");
  };
}
