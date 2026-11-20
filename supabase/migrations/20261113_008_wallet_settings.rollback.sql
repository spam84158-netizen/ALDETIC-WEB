begin; delete from public.platform_settings where key in ('withdraw_fee','withdraw_min','deposit_min','payment_methods','bank_instructions'); commit;
