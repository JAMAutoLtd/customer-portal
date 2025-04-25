-- Generated Seed Data --

-- Data for orders
INSERT INTO "public"."orders" ("id", "user_id", "vehicle_id", "repair_order_number", "address_id", "earliest_available_time", "notes", "invoice") VALUES
  (1, '00000000-0000-0000-0000-000000000111', 14, 'RO-1744911731498-2', 15, '2025-04-17 17:42:11', 'Generated test order 1', NULL),
  (2, '00000000-0000-0000-0000-000000000148', 29, 'RO-1744911731498-3', 52, '2025-04-17 17:42:11', 'Generated test order 2', NULL),
  (3, '00000000-0000-0000-0000-000000000112', 31, 'RO-1744911731498-4', 16, '2025-04-17 17:42:11', 'Generated test order 3', NULL),
  (4, '00000000-0000-0000-0000-000000000119', 6, 'RO-1744911731498-5', 23, '2025-04-17 17:42:11', 'Generated test order 4', NULL),
  (5, '00000000-0000-0000-0000-000000000109', 40, 'RO-1744911731498-6', 13, '2025-04-17 17:42:11', 'Generated test order 5', NULL),
  (6, '00000000-0000-0000-0000-000000000142', 30, 'RO-1744911731498-7', 46, '2025-04-17 17:42:11', 'Generated test order 6', NULL),
  (7, '00000000-0000-0000-0000-000000000129', 19, 'RO-1744911731498-8', 33, '2025-04-17 17:42:11', 'Generated test order 7', NULL),
  (8, '00000000-0000-0000-0000-000000000141', 7, 'RO-1744911731498-9', 45, '2025-04-21 20:35:06', 'Generated test order 8', NULL),
  (9, '00000000-0000-0000-0000-000000000129', 20, 'RO-1744911731498-10', 33, '2025-04-21 15:42:32', 'Generated test order 9', NULL),
  (10, '00000000-0000-0000-0000-000000000118', 3, 'RO-1744911731498-11', 22, '2025-04-17 17:42:11', 'Generated test order 10', NULL),
  (11, '00000000-0000-0000-0000-000000000102', 31, 'RO-1744911731498-12', 6, '2025-04-20 00:12:37', 'Generated test order 11', NULL),
  (12, '00000000-0000-0000-0000-000000000109', 23, 'RO-1744911731498-13', 13, '2025-04-17 17:42:11', 'Generated test order 12', NULL),
  (13, '00000000-0000-0000-0000-000000000110', 16, 'RO-1744911731498-14', 14, '2025-04-17 17:42:11', 'Generated test order 13', NULL),
  (14, '00000000-0000-0000-0000-000000000140', 21, 'RO-1744911731498-15', 44, '2025-04-17 17:42:11', 'Generated test order 14', NULL),
  (15, '00000000-0000-0000-0000-000000000142', 39, 'RO-1744911731498-16', 46, '2025-04-21 01:27:11', 'Generated test order 15', NULL),
  (16, '00000000-0000-0000-0000-000000000105', 8, 'RO-1744911731498-17', 9, '2025-04-17 17:42:11', 'Generated test order 16', NULL),
  (17, '00000000-0000-0000-0000-000000000117', 12, 'RO-1744911731498-18', 21, '2025-04-17 17:42:11', 'Generated test order 17', NULL),
  (18, '00000000-0000-0000-0000-000000000113', 6, 'RO-1744911731498-19', 17, '2025-04-17 17:42:11', 'Generated test order 18', NULL),
  (19, '00000000-0000-0000-0000-000000000104', 21, 'RO-1744911731498-20', 8, '2025-04-17 17:42:11', 'Generated test order 19', NULL);

-- Data for order_services
INSERT INTO "public"."order_services" ("order_id", "service_id") VALUES
  (1, 18),
  (2, 4),
  (3, 8),
  (4, 9),
  (5, 17),
  (6, 8),
  (6, 1),
  (7, 9),
  (8, 10),
  (9, 10),
  (10, 17),
  (11, 5),
  (12, 1),
  (13, 1),
  (14, 6),
  (15, 19),
  (16, 10),
  (17, 5),
  (18, 9),
  (19, 16);

-- Data for jobs
INSERT INTO "public"."jobs" ("id", "order_id", "assigned_technician", "address_id", "priority", "status", "requested_time", "estimated_sched", "job_duration", "notes", "service_id", "fixed_assignment", "fixed_schedule_time", "technician_notes") VALUES
  (1, 1, NULL, 15, 10, 'queued', NULL, NULL, 74, 'Generated job 1 for order 1, service: Adding Spare Keys', 18, FALSE, NULL, NULL),
  (2, 2, NULL, 52, 5, 'queued', NULL, NULL, 110, 'Generated job 2 for order 2, service: Blind Spot Monitor', 4, FALSE, NULL, NULL),
  (3, 3, NULL, 16, 1, 'queued', NULL, NULL, 55, 'Generated job 3 for order 3, service: BCM', 8, FALSE, NULL, NULL),
  (4, 4, NULL, 23, 5, 'queued', NULL, NULL, 47, 'Generated job 4 for order 4, service: Airbag Module Reset', 9, FALSE, NULL, NULL),
  (5, 5, NULL, 13, 10, 'queued', NULL, NULL, 37, 'Generated job 5 for order 5, service: All Keys Lost', 17, FALSE, NULL, NULL),
  (6, 6, NULL, 46, 7, 'queued', NULL, NULL, 41, 'Generated job 6 for order 6, service: BCM', 8, FALSE, NULL, NULL),
  (7, 6, NULL, 46, 6, 'queued', NULL, NULL, 36, 'Generated job 7 for order 6, service: Front Radar', 1, FALSE, NULL, NULL),
  (8, 7, NULL, 33, 3, 'queued', NULL, NULL, 74, 'Generated job 8 for order 7, service: Airbag Module Reset', 9, FALSE, NULL, NULL),
  (9, 8, NULL, 45, 1, 'queued', NULL, NULL, 86, 'Generated job 9 for order 8, service: Instrument Cluster', 10, FALSE, NULL, NULL),
  (10, 9, NULL, 33, 4, 'queued', NULL, NULL, 46, 'Generated job 10 for order 9, service: Instrument Cluster', 10, FALSE, '2025-04-21 07:32:50', NULL),
  (11, 10, NULL, 22, 8, 'queued', NULL, NULL, 114, 'Generated job 11 for order 10, service: All Keys Lost', 17, FALSE, NULL, NULL),
  (12, 11, NULL, 6, 1, 'queued', NULL, NULL, 65, 'Generated job 12 for order 11, service: Parking Assist Sensor', 5, FALSE, NULL, NULL),
  (13, 12, NULL, 13, 6, 'queued', NULL, NULL, 106, 'Generated job 13 for order 12, service: Front Radar', 1, FALSE, NULL, NULL),
  (14, 13, NULL, 14, 10, 'queued', NULL, NULL, 116, 'Generated job 14 for order 13, service: Front Radar', 1, FALSE, NULL, NULL),
  (15, 14, NULL, 44, 3, 'queued', NULL, NULL, 37, 'Generated job 15 for order 14, service: ECM', 6, FALSE, NULL, NULL),
  (16, 15, NULL, 46, 5, 'queued', NULL, NULL, 47, 'Generated job 16 for order 15, service: Diagnostic or Wiring', 19, FALSE, NULL, NULL),
  (17, 16, NULL, 9, 10, 'queued', NULL, NULL, 98, 'Generated job 17 for order 16, service: Instrument Cluster', 10, FALSE, NULL, NULL),
  (18, 17, NULL, 21, 8, 'queued', NULL, NULL, 51, 'Generated job 18 for order 17, service: Parking Assist Sensor', 5, FALSE, NULL, NULL),
  (19, 18, NULL, 17, 9, NULL, NULL, NULL, 35, 'Generated job 19 for order 18, service: Airbag Module Reset', 9, FALSE, NULL, NULL),
  (20, 19, NULL, 8, 6, 'queued', NULL, NULL, 103, 'Generated job 20 for order 19, service: Immobilizer R&R', 16, FALSE, '2025-04-22 10:44:54', NULL);

-- No data generated for technician_availability_exceptions
-- Data for van_equipment
INSERT INTO "public"."van_equipment" ("van_id", "equipment_id") VALUES
  (1, 6),
  (2, 6),
  (3, 6),
  (4, 6),
  (1, 8),
  (2, 8),
  (3, 7),
  (4, 5),
  (3, 9),
  (3, 38),
  (3, 14),
  (2, 36),
  (2, 12),
  (2, 29),
  (3, 23),
  (3, 20),
  (1, 11),
  (3, 33),
  (3, 19),
  (2, 18),
  (2, 10),
  (1, 28),
  (1, 13),
  (2, 37);

