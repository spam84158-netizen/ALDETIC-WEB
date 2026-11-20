#!/usr/bin/env bash
# Copiez ce fichier en scripts/secrets.sh, remplacez chaque valeur, exécutez, puis SUPPRIMEZ scripts/secrets.sh.
# Prérequis : supabase login && supabase link --project-ref nogdmnojpsdjfaapsrhe
set -euo pipefail
supabase secrets set \
  GROQ_API_KEY="REMPLACER" \
  CEREBRAS_API_KEY="REMPLACER" \
  GEMINI_API_KEY="REMPLACER" \
  MISTRAL_API_KEY="REMPLACER" \
  OPENROUTER_API_KEY="REMPLACER" \
  CLOUDFLARE_API_TOKEN="REMPLACER" \
  CLOUDFLARE_ACCOUNT_ID="3ebba3f1b497ff2948f2b3ce32af93ae" \
  PAYMENT_PROVIDER="flutterwave" \
  FLW_SECRET_KEY="REMPLACER_par_la_cle_secrete_de_TEST_Flutterwave" \
  FLW_WEBHOOK_HASH="REMPLACER_par_un_texte_secret_que_vous_choisissez" \
  APP_URL="https://aldetic-web.publicpages.workers.dev"
# Le téléphone fonctionne en simulation gratuite ; aucun secret SMS ou OTP_PEPPER requis.
supabase functions deploy phone-otp ai-gateway wallet-api wallet-admin
# Le webhook est appelé par Flutterwave sans connexion membre : il se vérifie lui-même (signature + revérification).
supabase functions deploy payment-webhook --no-verify-jwt
