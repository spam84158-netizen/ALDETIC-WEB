# Vérification téléphonique : options et coûts pour la Côte d'Ivoire (recherche du 13/11/2026)

Aucun service n'est activé. Les tarifs ci-dessous viennent de pages publiques ; ils changent et DOIVENT être reconfirmés sur le tableau de bord du prestataire avant tout choix. Les montants en USD sont par SMS envoyé.

| Option | Tarif relevé | Source / fiabilité | Remarques |
|---|---|---|---|
| Plivo (par opérateur) | Orange 0,30 ; MTN 0,3312 ; Moov 0,50 ; KoZ 0,08 ; autres 0,2644 | Page officielle Plivo, tarifs CI | Facturation prépayée, crédits d'essai à l'inscription |
| Prelude (vérification OTP) | SMS ≈ 0,2278 € ; Telegram ≈ 0,012 € | Page pays Prelude | Telegram ≈ 19 fois moins cher que le SMS, mais l'utilisateur doit avoir Telegram |
| Twilio | Page officielle non lisible lors de ma recherche ; des comparateurs tiers indiquent entre 0,24 et 0,44 | Tiers, non confirmé | À lire sur twilio.com/sms/pricing/ci |
| Infobip | ≈ 0,24 (comparateur tiers) | Tiers, non confirmé | Devis sur demande |
| Orange Developer « SMS Côte d'Ivoire » | Forfaits SMS achetés avec une carte SIM Orange | developer.orange.com/apis/sms-ci | Tarif exact non relevé ; à vérifier : accepte-t-il l'envoi vers MTN/Moov ? |
| Opérateurs locaux directs (Orange, MTN, Moov) | 5 à 50 FCFA par SMS selon un comparateur tiers | Tiers, non confirmé | Contrat entreprise, enregistrement de l'expéditeur ARTCI (≈ 3 semaines selon un guide tiers) |
| Africa's Talking | Tarif CI non retrouvé | — | Couverture africaine directe ; prix à demander |

## Constat
Un SMS vers la Côte d'Ivoire coûte en général de l'ordre de 0,15 à 0,50 USD chez les agrégateurs internationaux, soit plusieurs centaines de FCFA par vérification. Pour une plateforme gratuite à l'inscription, c'est le principal poste de coût et un vecteur d'abus (envois en masse) : les limites d'envoi de la migration 002 (30 s entre deux envois, 5 par heure par compte) restent indispensables.

## Ma recommandation (à valider par vous)
1. Essayer d'abord Orange Developer (local, forfaits en FCFA) et demander les conditions pour MTN/Moov ; 2. Plivo en repli (tarifs publics par opérateur, prépayé donc plafonnable) ; 3. Étudier l'OTP par Telegram/WhatsApp en complément pour réduire le coût. Dans tous les cas : compte prépayé avec plafond bas, aucune carte bancaire enregistrée pour le test.

Le code est prêt : `phone-otp` accepte un prestataire dès que son adaptateur est ajouté dans `SUPPORTED_PROVIDERS` ; le choix et l'activation restent à votre décision.
