alter table public.orders add column if not exists whatsapp_message_id text;
create unique index if not exists orders_whatsapp_message_id_unique on public.orders (whatsapp_message_id) where whatsapp_message_id is not null;
update public.orders
set whatsapp_message_id = 'wamid.HBgMOTE3ODk5MDgyNzkyFQIAEhgWM0VCMEE0NjRDRDI3NEU5QjgxOThBOQA='
where id = 100 and whatsapp_message_id is null;
