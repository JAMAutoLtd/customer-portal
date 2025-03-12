-- Drop all tables in correct order (respecting foreign key constraints)
DROP TABLE IF EXISTS FleetVehiclesEquipmentJunction;
DROP TABLE IF EXISTS ServEquipJunction;
DROP TABLE IF EXISTS JobsServicesJunction;
DROP TABLE IF EXISTS OrdersServicesJunction;
DROP TABLE IF EXISTS Equipment;
DROP TABLE IF EXISTS Keys;
DROP TABLE IF EXISTS Jobs;
DROP TABLE IF EXISTS OrderUploads;
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS Services;
DROP TABLE IF EXISTS UserAddressesJunction;
DROP TABLE IF EXISTS Technicians;
DROP TABLE IF EXISTS FleetVehicles;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Addresses;

-- Drop the enum type
DROP TYPE IF EXISTS customer_type; 