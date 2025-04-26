export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      adas_equipment_requirements: {
        Row: {
          equipment_model: string
          has_adas_service: boolean
          id: number
          service_id: number
          ymm_id: number
        }
        Insert: {
          equipment_model: string
          has_adas_service?: boolean
          id?: number
          service_id: number
          ymm_id: number
        }
        Update: {
          equipment_model?: string
          has_adas_service?: boolean
          id?: number
          service_id?: number
          ymm_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "adas_equipment_data_ymm_id_fkey"
            columns: ["ymm_id"]
            isOneToOne: false
            referencedRelation: "ymm_ref"
            referencedColumns: ["ymm_id"]
          },
          {
            foreignKeyName: "adas_equipment_requirements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          id: number
          lat: number | null
          lng: number | null
          street_address: string
        }
        Insert: {
          id?: number
          lat?: number | null
          lng?: number | null
          street_address: string
        }
        Update: {
          id?: number
          lat?: number | null
          lng?: number | null
          street_address?: string
        }
        Relationships: []
      }
      airbag_equipment_requirements: {
        Row: {
          equipment_model: string
          id: number
          service_id: number
          ymm_id: number
        }
        Insert: {
          equipment_model?: string
          id?: number
          service_id: number
          ymm_id: number
        }
        Update: {
          equipment_model?: string
          id?: number
          service_id?: number
          ymm_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "airbag_equipment_requirements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airbag_equipment_requirements_ymm_id_fkey"
            columns: ["ymm_id"]
            isOneToOne: false
            referencedRelation: "ymm_ref"
            referencedColumns: ["ymm_id"]
          },
        ]
      }
      customer_vehicles: {
        Row: {
          id: number
          make: string
          model: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          id?: number
          make: string
          model?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          id?: number
          make?: string
          model?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
      diag_equipment_requirements: {
        Row: {
          equipment_model: string
          id: number
          service_id: number
          ymm_id: number
        }
        Insert: {
          equipment_model?: string
          id?: number
          service_id: number
          ymm_id: number
        }
        Update: {
          equipment_model?: string
          id?: number
          service_id?: number
          ymm_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "diag_equipment_requirements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diag_equipment_requirements_ymm_id_fkey"
            columns: ["ymm_id"]
            isOneToOne: false
            referencedRelation: "ymm_ref"
            referencedColumns: ["ymm_id"]
          },
        ]
      }
      equipment: {
        Row: {
          equipment_type: Database["public"]["Enums"]["service_category"] | null
          id: number
          model: string | null
        }
        Insert: {
          equipment_type?:
            | Database["public"]["Enums"]["service_category"]
            | null
          id?: number
          model?: string | null
        }
        Update: {
          equipment_type?:
            | Database["public"]["Enums"]["service_category"]
            | null
          id?: number
          model?: string | null
        }
        Relationships: []
      }
      immo_equipment_requirements: {
        Row: {
          equipment_model: string
          id: number
          service_id: number
          ymm_id: number
        }
        Insert: {
          equipment_model?: string
          id?: number
          service_id: number
          ymm_id: number
        }
        Update: {
          equipment_model?: string
          id?: number
          service_id?: number
          ymm_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "immo_equipment_requirements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "immo_equipment_requirements_ymm_id_fkey"
            columns: ["ymm_id"]
            isOneToOne: false
            referencedRelation: "ymm_ref"
            referencedColumns: ["ymm_id"]
          },
        ]
      }
      jobs: {
        Row: {
          address_id: number | null
          assigned_technician: number | null
          estimated_sched: string | null
          fixed_assignment: boolean
          fixed_schedule_time: string | null
          id: number
          job_duration: number | null
          notes: string | null
          order_id: number | null
          priority: number | null
          requested_time: string | null
          service_id: number | null
          status: Database["public"]["Enums"]["job_status"]
          technician_notes: string | null
        }
        Insert: {
          address_id?: number | null
          assigned_technician?: number | null
          estimated_sched?: string | null
          fixed_assignment?: boolean
          fixed_schedule_time?: string | null
          id?: number
          job_duration?: number | null
          notes?: string | null
          order_id?: number | null
          priority?: number | null
          requested_time?: string | null
          service_id?: number | null
          status: Database["public"]["Enums"]["job_status"]
          technician_notes?: string | null
        }
        Update: {
          address_id?: number | null
          assigned_technician?: number | null
          estimated_sched?: string | null
          fixed_assignment?: boolean
          fixed_schedule_time?: string | null
          id?: number
          job_duration?: number | null
          notes?: string | null
          order_id?: number | null
          priority?: number | null
          requested_time?: string | null
          service_id?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          technician_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_technician_fkey"
            columns: ["assigned_technician"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      keys: {
        Row: {
          fcc_id: string | null
          min_quantity: number
          part_number: string | null
          purchase_price: number | null
          quantity: number
          sale_price: number | null
          sku_id: string
          supplier: string | null
        }
        Insert: {
          fcc_id?: string | null
          min_quantity: number
          part_number?: string | null
          purchase_price?: number | null
          quantity: number
          sale_price?: number | null
          sku_id: string
          supplier?: string | null
        }
        Update: {
          fcc_id?: string | null
          min_quantity?: number
          part_number?: string | null
          purchase_price?: number | null
          quantity?: number
          sale_price?: number | null
          sku_id?: string
          supplier?: string | null
        }
        Relationships: []
      }
      order_services: {
        Row: {
          order_id: number
          service_id: number
        }
        Insert: {
          order_id: number
          service_id: number
        }
        Update: {
          order_id?: number
          service_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_services_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      order_uploads: {
        Row: {
          file_name: string
          file_type: string | null
          file_url: string
          id: number
          order_id: number | null
          uploaded_at: string | null
        }
        Insert: {
          file_name: string
          file_type?: string | null
          file_url: string
          id?: number
          order_id?: number | null
          uploaded_at?: string | null
        }
        Update: {
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: number
          order_id?: number | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_uploads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: number | null
          earliest_available_time: string | null
          id: number
          invoice: number | null
          notes: string | null
          repair_order_number: string | null
          user_id: string | null
          vehicle_id: number | null
        }
        Insert: {
          address_id?: number | null
          earliest_available_time?: string | null
          id?: number
          invoice?: number | null
          notes?: string | null
          repair_order_number?: string | null
          user_id?: string | null
          vehicle_id?: number | null
        }
        Update: {
          address_id?: number | null
          earliest_available_time?: string | null
          id?: number
          invoice?: number | null
          notes?: string | null
          repair_order_number?: string | null
          user_id?: string | null
          vehicle_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      prog_equipment_requirements: {
        Row: {
          equipment_model: string
          id: number
          service_id: number
          ymm_id: number
        }
        Insert: {
          equipment_model?: string
          id?: number
          service_id: number
          ymm_id: number
        }
        Update: {
          equipment_model?: string
          id?: number
          service_id?: number
          ymm_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "prog_equipment_requirements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prog_equipment_requirements_ymm_id_fkey"
            columns: ["ymm_id"]
            isOneToOne: false
            referencedRelation: "ymm_ref"
            referencedColumns: ["ymm_id"]
          },
        ]
      }
      services: {
        Row: {
          id: number
          service_category:
            | Database["public"]["Enums"]["service_category"]
            | null
          service_name: string
          slug: string | null
        }
        Insert: {
          id?: number
          service_category?:
            | Database["public"]["Enums"]["service_category"]
            | null
          service_name: string
          slug?: string | null
        }
        Update: {
          id?: number
          service_category?:
            | Database["public"]["Enums"]["service_category"]
            | null
          service_name?: string
          slug?: string | null
        }
        Relationships: []
      }
      technician_availability_exceptions: {
        Row: {
          created_at: string | null
          date: string
          end_time: string | null
          exception_type: Database["public"]["Enums"]["availability_exception_type"]
          id: number
          is_available: boolean
          reason: string | null
          start_time: string | null
          technician_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time?: string | null
          exception_type: Database["public"]["Enums"]["availability_exception_type"]
          id?: number
          is_available: boolean
          reason?: string | null
          start_time?: string | null
          technician_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string | null
          exception_type?: Database["public"]["Enums"]["availability_exception_type"]
          id?: number
          is_available?: boolean
          reason?: string | null
          start_time?: string | null
          technician_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technician_availability_exceptions_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_default_hours: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: number
          is_available: boolean | null
          start_time: string
          technician_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: number
          is_available?: boolean | null
          start_time: string
          technician_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: number
          is_available?: boolean | null
          start_time?: string
          technician_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technician_default_hours_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          assigned_van_id: number | null
          id: number
          user_id: string | null
          workload: number | null
        }
        Insert: {
          assigned_van_id?: number | null
          id?: number
          user_id?: string | null
          workload?: number | null
        }
        Update: {
          assigned_van_id?: number | null
          id?: number
          user_id?: string | null
          workload?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "technicians_assigned_van_id_fkey"
            columns: ["assigned_van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technicians_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_addresses: {
        Row: {
          address_id: number
          user_id: string
        }
        Insert: {
          address_id: number
          user_id: string
        }
        Update: {
          address_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_addresses_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          customer_type: Database["public"]["Enums"]["customer_type"]
          full_name: string
          home_address_id: number | null
          id: string
          is_admin: boolean | null
          phone: string | null
        }
        Insert: {
          customer_type: Database["public"]["Enums"]["customer_type"]
          full_name: string
          home_address_id?: number | null
          id: string
          is_admin?: boolean | null
          phone?: string | null
        }
        Update: {
          customer_type?: Database["public"]["Enums"]["customer_type"]
          full_name?: string
          home_address_id?: number | null
          id?: string
          is_admin?: boolean | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_home_address_id_fkey"
            columns: ["home_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      van_equipment: {
        Row: {
          equipment_id: number
          van_id: number
        }
        Insert: {
          equipment_id: number
          van_id: number
        }
        Update: {
          equipment_id?: number
          van_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicle_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_equipment_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      vans: {
        Row: {
          id: number
          last_service: string | null
          lat: number | null
          lng: number | null
          next_service: string | null
          onestepgps_device_id: string | null
          vin: string | null
        }
        Insert: {
          id?: number
          last_service?: string | null
          lat?: number | null
          lng?: number | null
          next_service?: string | null
          onestepgps_device_id?: string | null
          vin?: string | null
        }
        Update: {
          id?: number
          last_service?: string | null
          lat?: number | null
          lng?: number | null
          next_service?: string | null
          onestepgps_device_id?: string | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_vin_fkey"
            columns: ["vin"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["vin"]
          },
        ]
      }
      ymm_ref: {
        Row: {
          make: string
          model: string
          year: number
          ymm_id: number
        }
        Insert: {
          make: string
          model: string
          year: number
          ymm_id?: number
        }
        Update: {
          make?: string
          model?: string
          year?: number
          ymm_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_id_by_email: {
        Args: { user_email: string }
        Returns: string
      }
    }
    Enums: {
      availability_exception_type: "time_off" | "custom_hours"
      customer_type: "residential" | "commercial" | "insurance"
      job_status:
        | "pending_review"
        | "queued"
        | "en_route"
        | "pending_revisit"
        | "completed"
        | "cancelled"
        | "paid"
        | "in_progress"
        | "fixed_time"
      service_category: "adas" | "airbag" | "immo" | "prog" | "diag"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      availability_exception_type: ["time_off", "custom_hours"],
      customer_type: ["residential", "commercial", "insurance"],
      job_status: [
        "pending_review",
        "queued",
        "en_route",
        "pending_revisit",
        "completed",
        "cancelled",
        "paid",
        "in_progress",
        "fixed_time",
      ],
      service_category: ["adas", "airbag", "immo", "prog", "diag"],
    },
  },
} as const
