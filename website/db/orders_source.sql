-- Classify existing and future orders by origin without changing current order workflows.
alter table public.orders add column if not exists source text not null default 'whatsapp';
alter table public.orders add constraint orders_source_check check (source in ('whatsapp', 'store'));
create index if not exists orders_source_created_at_idx on public.orders(source, created_at desc);
