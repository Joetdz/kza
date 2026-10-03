-- Phase 2 (feuille de route KZion) — relie StoreOrder à son ManualOrder, pour que le
-- statut de la boutique et le mouvement de stock passent enfin par le même chemin.
-- Additive uniquement : nullable, aucune donnée existante touchée.

ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS manual_order_id uuid UNIQUE REFERENCES manual_orders(id);
