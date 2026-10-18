-- Default settings: one source of truth for constants that used to be hard-coded in every app (spec B.3, A.7).
insert into public.settings (key, value) values
  ('product', '{
    "name": "Mek-Rider",
    "model": "MRTF01",
    "price": 22500,
    "competitorPrice": 14000,
    "vat": 21,
    "shiftHours": 8,
    "workDaysPerYear": 230,
    "forkRetractedMm": 1198,
    "forkExtendedMm": 1998,
    "extendSeconds": 4,
    "retractSeconds": 2,
    "widthMm": 785,
    "capacityKg": 2000,
    "palletsPerTrip": 2,
    "speedEmptyKmh": 12,
    "speedLoadedKmh": 10,
    "quoteValidDays": 30,
    "contactEmail": "info@mek-mover.nl"
  }'::jsonb),
  ('kans', '{"A": 75, "B": 50}'::jsonb),
  ('weights', '{
    "palletFlows": 30,
    "volume": 20,
    "multiDrop": 15,
    "growth": 15,
    "distance": 10,
    "family": 5,
    "dataQuality": 5
  }'::jsonb),
  ('home', '{"postcode": "5705", "label": "Helmond", "lat": 51.4793, "lng": 5.6570, "serviceRadiusKm": 150}'::jsonb),
  ('caps', '{"apifyMonthUsd": 50, "claudeMonthUsd": 50}'::jsonb),
  ('requalify', '{"seenDays": 30, "reviewGrowthPct": 20, "maxAgeDays": 90}'::jsonb)
on conflict (key) do nothing;
