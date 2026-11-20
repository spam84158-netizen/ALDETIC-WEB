import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { ok: false, error: "Méthode non autorisée." });

  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const profile = typeof body.profile === "string" ? body.profile.trim().slice(0, 100) : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";

    if (!/^\S+@\S+\.\S+$/.test(email)) return reply(400, { ok: false, error: "Adresse e-mail invalide." });
    if (name.length < 2) return reply(400, { ok: false, error: "Nom invalide." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return reply(500, { ok: false, error: "Configuration serveur Supabase incomplète." });

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { error: insertError } = await db.from("applications").insert({
      email,
      offer_id: null,
      status: "received",
    });
    if (insertError) {
      console.error("Application insert failed:", insertError.message);
      return reply(500, { ok: false, error: "Enregistrement de la candidature impossible." });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const notifyEmail = Deno.env.get("NOTIFY_EMAIL");
    const fromEmail = Deno.env.get("FROM_EMAIL");
    if (!resendKey || !notifyEmail || !fromEmail) {
      console.error("Resend secrets missing: RESEND_API_KEY, NOTIFY_EMAIL or FROM_EMAIL.");
      return reply(200, { ok: true, notified: false, message: "Candidature enregistrée, notification e-mail non configurée." });
    }

    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [notifyEmail],
        reply_to: email,
        subject: `Nouvelle candidature Aldetic — ${name}`,
        text: `Nouvelle candidature reçue sur Aldetic.\n\nNom : ${name}\nE-mail : ${email}\nProfil : ${profile || "Non précisé"}\n\nMessage :\n${message || "Aucun message"}\n`,
      }),
    });

    if (!mail.ok) {
      const details = await mail.text();
      console.error("Resend error:", mail.status, details.slice(0, 500));
      return reply(200, { ok: true, notified: false, message: "Candidature enregistrée, mais l'e-mail de notification n'a pas été envoyé." });
    }

    return reply(200, { ok: true, notified: true, message: "Candidature enregistrée et notification envoyée." });
  } catch (error) {
    console.error("notify-application error:", error);
    return reply(400, { ok: false, error: "Requête invalide ou erreur serveur." });
  }
});
