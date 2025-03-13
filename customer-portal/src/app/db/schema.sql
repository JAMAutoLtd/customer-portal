-- Create ENUM type for CustomerType
CREATE TYPE customer_type AS ENUM ('residential', 'commercial', 'insurance');

-- Create tables with proper constraints and types
CREATE TABLE Addresses (
    AddressId SERIAL PRIMARY KEY,
    StreetAddress VARCHAR(255) NOT NULL,
    Lat DECIMAL(9,6),
    Lng DECIMAL(9,6)
);

CREATE TABLE Users (
    UserId SERIAL PRIMARY KEY,
    Username VARCHAR(100) UNIQUE NOT NULL,
    PasswordHash VARCHAR(100) NOT NULL,
    FullName VARCHAR(100) NOT NULL,
    Email VARCHAR(100) UNIQUE NOT NULL,
    Phone VARCHAR(100),
    HomeAddressId INTEGER REFERENCES Addresses(AddressId) ON DELETE RESTRICT,
    IsAdmin BOOLEAN DEFAULT FALSE,
    CustomerType customer_type NOT NULL,
    AuthId UUID UNIQUE
);

CREATE TABLE FleetVehicles (
    FleetVehicleId SERIAL PRIMARY KEY,
    LastService TIMESTAMP WITH TIME ZONE,
    NextService TIMESTAMP WITH TIME ZONE
);

CREATE TABLE Technicians (
    TechnicianId SERIAL PRIMARY KEY,
    UserId INTEGER REFERENCES Users(UserId) ON DELETE RESTRICT,
    AssignedVanId INTEGER REFERENCES FleetVehicles(FleetVehicleId) ON DELETE SET NULL,
    Workload INTEGER CHECK (Workload >= 0)
);

CREATE TABLE UserAddressesJunction (
    UserId INTEGER REFERENCES Users(UserId) ON DELETE CASCADE,
    AddressId INTEGER REFERENCES Addresses(AddressId) ON DELETE CASCADE,
    PRIMARY KEY (UserId, AddressId)
);

CREATE TABLE Orders (
    OrderId SERIAL PRIMARY KEY,
    UserId INTEGER REFERENCES Users(UserId) ON DELETE RESTRICT,
    VIN VARCHAR(17),
    YMM VARCHAR(100),
    RepairOrderNumber VARCHAR(50),
    AddressId INTEGER REFERENCES Addresses(AddressId) ON DELETE RESTRICT,
    EarliestAvailableTime TIMESTAMP WITH TIME ZONE,
    Notes TEXT,
    Invoice INTEGER
);

CREATE TABLE OrderUploads (
    UploadId SERIAL PRIMARY KEY,
    OrderId INTEGER REFERENCES Orders(OrderId) ON DELETE CASCADE,
    FileName VARCHAR(255) NOT NULL,
    FileType VARCHAR(100),
    FileUrl TEXT NOT NULL,
    UploadedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Services (
    ServiceId SERIAL PRIMARY KEY,
    ServiceName VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE OrdersServicesJunction (
    OrderId INTEGER REFERENCES Orders(OrderId) ON DELETE CASCADE,
    ServiceId INTEGER REFERENCES Services(ServiceId) ON DELETE CASCADE,
    PRIMARY KEY (OrderId, ServiceId)
);

CREATE TABLE Jobs (
    JobId SERIAL PRIMARY KEY,
    OrderId INTEGER REFERENCES Orders(OrderId) ON DELETE RESTRICT,
    AssignedTechnician INTEGER REFERENCES Technicians(TechnicianId) ON DELETE RESTRICT,
    AddressId INTEGER REFERENCES Addresses(AddressId) ON DELETE RESTRICT,
    Priority INTEGER CHECK (Priority >= 0),
    Status VARCHAR(50) NOT NULL,
    RequestedTime TIMESTAMP WITH TIME ZONE,
    EstimatedSched TIMESTAMP WITH TIME ZONE,
    JobDuration INTEGER CHECK (JobDuration > 0),
    VIN VARCHAR(17),
    YMM VARCHAR(100),
    Notes TEXT
);

CREATE TABLE JobsServicesJunction (
    JobId INTEGER REFERENCES Jobs(JobId) ON DELETE CASCADE,
    ServReq INTEGER REFERENCES Services(ServiceId) ON DELETE CASCADE,
    PRIMARY KEY (JobId, ServReq)
);

CREATE TABLE Keys (
    SkuId VARCHAR(50) PRIMARY KEY,
    Quantity INTEGER NOT NULL CHECK (Quantity >= 0),
    MinQuantity INTEGER NOT NULL CHECK (MinQuantity >= 0),
    PartNumber VARCHAR(50),
    PurchasePrice DECIMAL(10,2),
    SalePrice DECIMAL(10,2),
    Supplier VARCHAR(100),
    FccId VARCHAR(50)
);

CREATE TABLE Equipment (
    EquipmentId SERIAL PRIMARY KEY,
    EquipmentName VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE ServEquipJunction (
    ServiceId INTEGER REFERENCES Services(ServiceId) ON DELETE CASCADE,
    EquipmentId INTEGER REFERENCES Equipment(EquipmentId) ON DELETE CASCADE,
    PRIMARY KEY (ServiceId, EquipmentId)
);

CREATE TABLE FleetVehiclesEquipmentJunction (
    FleetVehicleId INTEGER REFERENCES FleetVehicles(FleetVehicleId) ON DELETE CASCADE,
    EquipmentId INTEGER REFERENCES Equipment(EquipmentId) ON DELETE CASCADE,
    PRIMARY KEY (FleetVehicleId, EquipmentId)
);

-- Create indexes for frequently accessed columns
CREATE INDEX idx_users_email ON Users(Email);
CREATE INDEX idx_jobs_status ON Jobs(Status);
CREATE INDEX idx_jobs_estimated_sched ON Jobs(EstimatedSched);
CREATE INDEX idx_addresses_coords ON Addresses(Lat, Lng);