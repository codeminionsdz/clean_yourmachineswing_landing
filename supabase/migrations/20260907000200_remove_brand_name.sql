update public.products
set brand = 'ACME',
    description = 'ACME model 320 overlock machine.',
    updated_at = now()
where slug = 'acme-model-320';
