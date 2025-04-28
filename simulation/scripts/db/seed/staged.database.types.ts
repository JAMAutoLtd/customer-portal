export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  auth: {
    Tables: {
      audit_log_entries: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string | null
          ip_address: string
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          id: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Relationships: []
      }
      flow_state: {
        Row: {
          auth_code: string
          auth_code_issued_at: string | null
          authentication_method: string
          code_challenge: string
          code_challenge_method: Database["auth"]["Enums"]["code_challenge_method"]
          created_at: string | null
          id: string
          provider_access_token: string | null
          provider_refresh_token: string | null
          provider_type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_code: string
          auth_code_issued_at?: string | null
          authentication_method: string
          code_challenge: string
          code_challenge_method: Database["auth"]["Enums"]["code_challenge_method"]
          created_at?: string | null
          id: string
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_code?: string
          auth_code_issued_at?: string | null
          authentication_method?: string
          code_challenge?: string
          code_challenge_method?: Database["auth"]["Enums"]["code_challenge_method"]
          created_at?: string | null
          id?: string
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: Json
          last_sign_in_at: string | null
          provider: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data: Json
          last_sign_in_at?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data?: Json
          last_sign_in_at?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          created_at: string | null
          id: string
          raw_base_config: string | null
          updated_at: string | null
          uuid: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Relationships: []
      }
      mfa_amr_claims: {
        Row: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Update: {
          authentication_method?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_amr_claims_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_challenges: {
        Row: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code: string | null
          verified_at: string | null
          web_authn_session_data: Json | null
        }
        Insert: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Update: {
          created_at?: string
          factor_id?: string
          id?: string
          ip_address?: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_challenges_auth_factor_id_fkey"
            columns: ["factor_id"]
            isOneToOne: false
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_factors: {
        Row: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name: string | null
          id: string
          last_challenged_at: string | null
          phone: string | null
          secret: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid: string | null
          web_authn_credential: Json | null
        }
        Insert: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id: string
          last_challenged_at?: string | null
          phone?: string | null
          secret?: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Update: {
          created_at?: string
          factor_type?: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id?: string
          last_challenged_at?: string | null
          phone?: string | null
          secret?: string | null
          status?: Database["auth"]["Enums"]["factor_status"]
          updated_at?: string
          user_id?: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      one_time_tokens: {
        Row: {
          created_at: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relates_to?: string
          token_hash?: string
          token_type?: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_time_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refresh_tokens: {
        Row: {
          created_at: string | null
          id: number
          instance_id: string | null
          parent: string | null
          revoked: boolean | null
          session_id: string | null
          token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refresh_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_providers: {
        Row: {
          attribute_mapping: Json | null
          created_at: string | null
          entity_id: string
          id: string
          metadata_url: string | null
          metadata_xml: string
          name_id_format: string | null
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id: string
          id: string
          metadata_url?: string | null
          metadata_xml: string
          name_id_format?: string | null
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id?: string
          id?: string
          metadata_url?: string | null
          metadata_xml?: string
          name_id_format?: string | null
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_providers_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_relay_states: {
        Row: {
          created_at: string | null
          flow_state_id: string | null
          for_email: string | null
          id: string
          redirect_to: string | null
          request_id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id: string
          redirect_to?: string | null
          request_id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id?: string
          redirect_to?: string | null
          request_id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_relay_states_flow_state_id_fkey"
            columns: ["flow_state_id"]
            isOneToOne: false
            referencedRelation: "flow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saml_relay_states_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          version: string
        }
        Insert: {
          version: string
        }
        Update: {
          version?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          aal: Database["auth"]["Enums"]["aal_level"] | null
          created_at: string | null
          factor_id: string | null
          id: string
          ip: unknown | null
          not_after: string | null
          refreshed_at: string | null
          tag: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id: string
          ip?: unknown | null
          not_after?: string | null
          refreshed_at?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id?: string
          ip?: unknown | null
          not_after?: string | null
          refreshed_at?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_domains_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_providers: {
        Row: {
          created_at: string | null
          id: string
          resource_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      email: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      jwt: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      uid: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      aal_level: "aal1" | "aal2" | "aal3"
      code_challenge_method: "s256" | "plain"
      factor_status: "unverified" | "verified"
      factor_type: "totp" | "webauthn" | "phone"
      one_time_token_type:
        | "confirmation_token"
        | "reauthentication_token"
        | "recovery_token"
        | "email_change_token_new"
        | "email_change_token_current"
        | "phone_change_token"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
  auth: {
    Enums: {
      aal_level: ["aal1", "aal2", "aal3"],
      code_challenge_method: ["s256", "plain"],
      factor_status: ["unverified", "verified"],
      factor_type: ["totp", "webauthn", "phone"],
      one_time_token_type: [
        "confirmation_token",
        "reauthentication_token",
        "recovery_token",
        "email_change_token_new",
        "email_change_token_current",
        "phone_change_token",
      ],
    },
  },
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
