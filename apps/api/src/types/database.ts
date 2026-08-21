export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _backup_departments_20260527: {
        Row: {
          code: string | null
          created_at: string | null
          id: string | null
          name: string | null
          tenant_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          tenant_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      _backup_tenant_department_legacy_20260527: {
        Row: {
          code: string | null
          id: string | null
          legacy_department_id: string | null
          tenant_id: string | null
        }
        Insert: {
          code?: string | null
          id?: string | null
          legacy_department_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          code?: string | null
          id?: string | null
          legacy_department_id?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      administrative_areas: {
        Row: {
          adcode: string
          created_at: string
          full_name: string
          level: string
          name: string
          parent_adcode: string | null
          raw_payload: Json | null
          sort_order: number
          source: string
          source_version: string | null
          status: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          adcode: string
          created_at?: string
          full_name: string
          level: string
          name: string
          parent_adcode?: string | null
          raw_payload?: Json | null
          sort_order?: number
          source?: string
          source_version?: string | null
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          adcode?: string
          created_at?: string
          full_name?: string
          level?: string
          name?: string
          parent_adcode?: string | null
          raw_payload?: Json | null
          sort_order?: number
          source?: string
          source_version?: string | null
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "administrative_areas_parent_fkey"
            columns: ["parent_adcode"]
            isOneToOne: false
            referencedRelation: "administrative_areas"
            referencedColumns: ["adcode"]
          },
        ]
      }
      ai_call_logs: {
        Row: {
          billable: boolean
          cached_input_tokens: number | null
          completion_tokens: number | null
          cost_estimate: number | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          model_code: string | null
          model_name: string | null
          prompt_tokens: number | null
          provider_code: string | null
          raw_usage: Json | null
          reasoning_tokens: number | null
          request_id: string | null
          scene_code: string
          source: string | null
          status: string
          tenant_id: string | null
          total_tokens: number | null
        }
        Insert: {
          billable?: boolean
          cached_input_tokens?: number | null
          completion_tokens?: number | null
          cost_estimate?: number | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          model_code?: string | null
          model_name?: string | null
          prompt_tokens?: number | null
          provider_code?: string | null
          raw_usage?: Json | null
          reasoning_tokens?: number | null
          request_id?: string | null
          scene_code: string
          source?: string | null
          status: string
          tenant_id?: string | null
          total_tokens?: number | null
        }
        Update: {
          billable?: boolean
          cached_input_tokens?: number | null
          completion_tokens?: number | null
          cost_estimate?: number | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          model_code?: string | null
          model_name?: string | null
          prompt_tokens?: number | null
          provider_code?: string | null
          raw_usage?: Json | null
          reasoning_tokens?: number | null
          request_id?: string | null
          scene_code?: string
          source?: string | null
          status?: string
          tenant_id?: string | null
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ai_call_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_decoration_qa_suggestion_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          id: string
          project_id: string | null
          questions: Json
          scene: string
          source: string
          updated_at: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          id?: string
          project_id?: string | null
          questions: Json
          scene: string
          source?: string
          updated_at?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          project_id?: string | null
          questions?: Json
          scene?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_models: {
        Row: {
          code: string
          created_at: string
          id: string
          model_name: string
          name: string
          provider_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          model_name: string
          name: string
          provider_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          model_name?: string
          name?: string
          provider_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key_setting_key: string | null
          code: string
          created_at: string
          endpoint_url: string | null
          id: string
          name: string
          provider_type: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          api_key_setting_key?: string | null
          code: string
          created_at?: string
          endpoint_url?: string | null
          id?: string
          name: string
          provider_type: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          api_key_setting_key?: string | null
          code?: string
          created_at?: string
          endpoint_url?: string | null
          id?: string
          name?: string
          provider_type?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_scene_routes: {
        Row: {
          created_at: string
          fallback_model_id: string | null
          id: string
          name: string
          primary_model_id: string | null
          response_format: string | null
          scene_code: string
          status: string
          temperature: number | null
          timeout_ms: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fallback_model_id?: string | null
          id?: string
          name: string
          primary_model_id?: string | null
          response_format?: string | null
          scene_code: string
          status?: string
          temperature?: number | null
          timeout_ms?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fallback_model_id?: string | null
          id?: string
          name?: string
          primary_model_id?: string | null
          response_format?: string | null
          scene_code?: string
          status?: string
          temperature?: number | null
          timeout_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_scene_routes_fallback_model_id_fkey"
            columns: ["fallback_model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_scene_routes_primary_model_id_fkey"
            columns: ["primary_model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          logo_file_id: string
          published_at: string | null
          published_display_name: string | null
          published_logo_file_id: string | null
          published_version: number | null
          scope: string
          status: string
          tenant_id: string | null
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          logo_file_id: string
          published_at?: string | null
          published_display_name?: string | null
          published_logo_file_id?: string | null
          published_version?: number | null
          scope: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          logo_file_id?: string
          published_at?: string | null
          published_display_name?: string | null
          published_logo_file_id?: string | null
          published_version?: number | null
          scope?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_logo_file_id_fkey"
            columns: ["logo_file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profiles_published_logo_file_id_fkey"
            columns: ["published_logo_file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "brand_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profiles_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_access_logs: {
        Row: {
          action: string
          camera_id: string
          control_action: string | null
          created_at: string
          error_message: string | null
          id: string
          ip: string | null
          project_id: string
          result: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          camera_id: string
          control_action?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ip?: string | null
          project_id: string
          result?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          camera_id?: string
          control_action?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ip?: string | null
          project_id?: string
          result?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "camera_access_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "camera_access_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_brands: {
        Row: {
          code: string
          created_at: string
          created_by_employee_id: string
          id: string
          legal_name: string | null
          logo_file_id: string | null
          mapped_platform_brand_id: string | null
          name: string
          owner_tenant_id: string | null
          ownership_scope: string
          sort_order: number
          status: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by_employee_id: string
          id?: string
          legal_name?: string | null
          logo_file_id?: string | null
          mapped_platform_brand_id?: string | null
          name: string
          owner_tenant_id?: string | null
          ownership_scope?: string
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by_employee_id?: string
          id?: string
          legal_name?: string | null
          logo_file_id?: string | null
          mapped_platform_brand_id?: string | null
          name?: string
          owner_tenant_id?: string | null
          ownership_scope?: string
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_brands_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_brands_logo_file_id_fkey"
            columns: ["logo_file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_brands_mapped_platform_brand_id_fkey"
            columns: ["mapped_platform_brand_id"]
            isOneToOne: false
            referencedRelation: "catalog_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_brands_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "catalog_brands_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_brands_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          code: string
          created_at: string
          created_by_employee_id: string
          full_name: string
          id: string
          is_leaf: boolean
          level: number
          mapped_platform_category_id: string | null
          name: string
          owner_tenant_id: string | null
          ownership_scope: string
          parent_id: string | null
          sort_order: number
          status: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by_employee_id: string
          full_name: string
          id?: string
          is_leaf?: boolean
          level: number
          mapped_platform_category_id?: string | null
          name: string
          owner_tenant_id?: string | null
          ownership_scope?: string
          parent_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by_employee_id?: string
          full_name?: string
          id?: string
          is_leaf?: boolean
          level?: number
          mapped_platform_category_id?: string | null
          name?: string
          owner_tenant_id?: string | null
          ownership_scope?: string
          parent_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_mapped_platform_category_id_fkey"
            columns: ["mapped_platform_category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "catalog_categories_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_spec_definitions: {
        Row: {
          category_id: string
          code: string
          created_at: string
          created_by_employee_id: string
          enum_options: Json
          id: string
          is_filterable: boolean
          is_required: boolean
          name: string
          owner_tenant_id: string | null
          ownership_scope: string
          participates_in_sku_name: boolean
          sort_order: number
          source_platform_spec_id: string | null
          status: string
          unit_dimension: string | null
          updated_at: string
          updated_by_employee_id: string
          value_type: string
          version: number
        }
        Insert: {
          category_id: string
          code: string
          created_at?: string
          created_by_employee_id: string
          enum_options?: Json
          id?: string
          is_filterable?: boolean
          is_required?: boolean
          name: string
          owner_tenant_id?: string | null
          ownership_scope?: string
          participates_in_sku_name?: boolean
          sort_order?: number
          source_platform_spec_id?: string | null
          status?: string
          unit_dimension?: string | null
          updated_at?: string
          updated_by_employee_id: string
          value_type: string
          version?: number
        }
        Update: {
          category_id?: string
          code?: string
          created_at?: string
          created_by_employee_id?: string
          enum_options?: Json
          id?: string
          is_filterable?: boolean
          is_required?: boolean
          name?: string
          owner_tenant_id?: string | null
          ownership_scope?: string
          participates_in_sku_name?: boolean
          sort_order?: number
          source_platform_spec_id?: string | null
          status?: string
          unit_dimension?: string | null
          updated_at?: string
          updated_by_employee_id?: string
          value_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_spec_definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_spec_definitions_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_spec_definitions_owner_tenant_id_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "catalog_spec_definitions_owner_tenant_id_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_spec_definitions_source_platform_spec_id_fkey"
            columns: ["source_platform_spec_id"]
            isOneToOne: false
            referencedRelation: "catalog_spec_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_spec_definitions_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_unit_suggestions: {
        Row: {
          approved_catalog_unit_id: string | null
          created_at: string
          id: string
          reason: string | null
          review_remark: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          status: string
          submitted_by_employee_id: string
          suggested_code: string
          suggested_name: string
          suggested_symbol: string
          tenant_id: string
          unit_dimension: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_catalog_unit_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          submitted_by_employee_id: string
          suggested_code: string
          suggested_name: string
          suggested_symbol: string
          tenant_id: string
          unit_dimension: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_catalog_unit_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          submitted_by_employee_id?: string
          suggested_code?: string
          suggested_name?: string
          suggested_symbol?: string
          tenant_id?: string
          unit_dimension?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_unit_suggestions_approved_catalog_unit_id_fkey"
            columns: ["approved_catalog_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_unit_suggestions_created_by_employee_id_fkey"
            columns: ["submitted_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_unit_suggestions_processed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_unit_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "catalog_unit_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_units: {
        Row: {
          base_unit_id: string | null
          code: string
          conversion_factor: number
          created_at: string
          created_by_employee_id: string
          id: string
          name: string
          sort_order: number
          status: string
          symbol: string
          unit_dimension: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          base_unit_id?: string | null
          code: string
          conversion_factor?: number
          created_at?: string
          created_by_employee_id: string
          id?: string
          name: string
          sort_order?: number
          status?: string
          symbol: string
          unit_dimension?: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          base_unit_id?: string | null
          code?: string
          conversion_factor?: number
          created_at?: string
          created_by_employee_id?: string
          id?: string
          name?: string
          sort_order?: number
          status?: string
          symbol?: string
          unit_dimension?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_units_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_units_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_units_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_appointment_reward_campaigns: {
        Row: {
          achieved_at: string | null
          appointment_name: string | null
          appointment_phone: string | null
          appointment_time: string | null
          campaign_id: string
          campaign_type: string
          closed_at: string | null
          closed_reason: string | null
          created_at: string
          customer_id: string
          id: string
          project_id: string
          reward_claim_channel: string | null
          reward_claim_code: string | null
          reward_claim_status: string
          reward_claim_voucher_token: string | null
          reward_claimed_at: string | null
          reward_claimed_by_employee_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          appointment_name?: string | null
          appointment_phone?: string | null
          appointment_time?: string | null
          campaign_id: string
          campaign_type?: string
          closed_at?: string | null
          closed_reason?: string | null
          created_at?: string
          customer_id: string
          id?: string
          project_id: string
          reward_claim_channel?: string | null
          reward_claim_code?: string | null
          reward_claim_status?: string
          reward_claim_voucher_token?: string | null
          reward_claimed_at?: string | null
          reward_claimed_by_employee_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          appointment_name?: string | null
          appointment_phone?: string | null
          appointment_time?: string | null
          campaign_id?: string
          campaign_type?: string
          closed_at?: string | null
          closed_reason?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          project_id?: string
          reward_claim_channel?: string | null
          reward_claim_code?: string | null
          reward_claim_status?: string
          reward_claim_voucher_token?: string | null
          reward_claimed_at?: string | null
          reward_claimed_by_employee_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_appointment_reward_c_reward_claimed_by_employee_i_fkey"
            columns: ["reward_claimed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_appointment_reward_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_appointment_reward_campaigns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_appointment_reward_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_follow_up_comments: {
        Row: {
          author_employee_id: string
          content: string
          created_at: string
          follow_up_id: string
          id: string
          images: string[]
          parent_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          author_employee_id: string
          content: string
          created_at?: string
          follow_up_id: string
          id?: string
          images?: string[]
          parent_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          author_employee_id?: string
          content?: string
          created_at?: string
          follow_up_id?: string
          id?: string
          images?: string[]
          parent_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_follow_up_comments_author_employee_id_fkey"
            columns: ["author_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_follow_up_comments_follow_up_id_fkey"
            columns: ["follow_up_id"]
            isOneToOne: false
            referencedRelation: "customer_follow_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_follow_up_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "customer_follow_up_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_follow_ups: {
        Row: {
          content: string
          created_at: string | null
          customer_id: string | null
          employee_id: string | null
          id: string
          next_follow_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          customer_id?: string | null
          employee_id?: string | null
          id?: string
          next_follow_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          customer_id?: string | null
          employee_id?: string | null
          id?: string
          next_follow_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_follow_ups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_follow_ups_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_log_share_assists: {
        Row: {
          campaign_id: string
          created_at: string
          helper_auth_user_id: string | null
          helper_avatar: string | null
          helper_device_id: string | null
          helper_ip: string | null
          helper_name: string | null
          helper_openid: string | null
          id: string
          invalid_reason: string | null
          is_valid: boolean
          risk_level: string
          share_token: string
          source: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          helper_auth_user_id?: string | null
          helper_avatar?: string | null
          helper_device_id?: string | null
          helper_ip?: string | null
          helper_name?: string | null
          helper_openid?: string | null
          id?: string
          invalid_reason?: string | null
          is_valid?: boolean
          risk_level?: string
          share_token: string
          source: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          helper_auth_user_id?: string | null
          helper_avatar?: string | null
          helper_device_id?: string | null
          helper_ip?: string | null
          helper_name?: string | null
          helper_openid?: string | null
          id?: string
          invalid_reason?: string | null
          is_valid?: boolean
          risk_level?: string
          share_token?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_log_share_assists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "customer_log_share_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_log_share_campaigns: {
        Row: {
          achieved_at: string | null
          assist_count: number
          assist_uv: number
          campaign_id: string | null
          campaign_type: string
          channel: string | null
          closed_reason: string | null
          config_id: string | null
          created_at: string
          customer_id: string
          id: string
          latest_assisted_at: string | null
          latest_opened_at: string | null
          log_id: string
          poster_generated_at: string | null
          poster_saved_at: string | null
          project_id: string
          reward_claim_channel: string | null
          reward_claim_code: string | null
          reward_claim_instruction: string | null
          reward_claim_requested_at: string | null
          reward_claim_status: string
          reward_claim_voucher_expires_at: string | null
          reward_claim_voucher_token: string | null
          reward_claimed_at: string | null
          reward_claimed_by_employee_id: string | null
          reward_remark: string | null
          reward_title: string | null
          share_token: string
          status: string
          target_assist_count: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          achieved_at?: string | null
          assist_count?: number
          assist_uv?: number
          campaign_id?: string | null
          campaign_type?: string
          channel?: string | null
          closed_reason?: string | null
          config_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          latest_assisted_at?: string | null
          latest_opened_at?: string | null
          log_id: string
          poster_generated_at?: string | null
          poster_saved_at?: string | null
          project_id: string
          reward_claim_channel?: string | null
          reward_claim_code?: string | null
          reward_claim_instruction?: string | null
          reward_claim_requested_at?: string | null
          reward_claim_status?: string
          reward_claim_voucher_expires_at?: string | null
          reward_claim_voucher_token?: string | null
          reward_claimed_at?: string | null
          reward_claimed_by_employee_id?: string | null
          reward_remark?: string | null
          reward_title?: string | null
          share_token: string
          status?: string
          target_assist_count?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          achieved_at?: string | null
          assist_count?: number
          assist_uv?: number
          campaign_id?: string | null
          campaign_type?: string
          channel?: string | null
          closed_reason?: string | null
          config_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          latest_assisted_at?: string | null
          latest_opened_at?: string | null
          log_id?: string
          poster_generated_at?: string | null
          poster_saved_at?: string | null
          project_id?: string
          reward_claim_channel?: string | null
          reward_claim_code?: string | null
          reward_claim_instruction?: string | null
          reward_claim_requested_at?: string | null
          reward_claim_status?: string
          reward_claim_voucher_expires_at?: string | null
          reward_claim_voucher_token?: string | null
          reward_claimed_at?: string | null
          reward_claimed_by_employee_id?: string | null
          reward_remark?: string | null
          reward_title?: string | null
          share_token?: string
          status?: string
          target_assist_count?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_log_share_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_log_share_campaigns_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "project_share_campaign_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_log_share_campaigns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_log_share_campaigns_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "project_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_log_share_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_log_share_campaigns_reward_claimed_by_employee_id_fkey"
            columns: ["reward_claimed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_log_share_opens: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          share_token: string
          source: string
          visitor_auth_user_id: string | null
          visitor_device_id: string | null
          visitor_ip: string | null
          visitor_openid: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          share_token: string
          source: string
          visitor_auth_user_id?: string | null
          visitor_device_id?: string | null
          visitor_ip?: string | null
          visitor_openid?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          share_token?: string
          source?: string
          visitor_auth_user_id?: string | null
          visitor_device_id?: string | null
          visitor_ip?: string | null
          visitor_openid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_log_share_opens_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "customer_log_share_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_phone_access_logs: {
        Row: {
          action: string
          auth_user_id: string | null
          created_at: string
          customer_id: string
          employee_id: string | null
          id: string
          ip_address: string | null
          openid: string | null
          permission_code: string | null
          permission_scope: string | null
          phone_masked: string | null
          reason: string | null
          request_id: string | null
          scene: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          auth_user_id?: string | null
          created_at?: string
          customer_id: string
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          openid?: string | null
          permission_code?: string | null
          permission_scope?: string | null
          phone_masked?: string | null
          reason?: string | null
          request_id?: string | null
          scene?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          auth_user_id?: string | null
          created_at?: string
          customer_id?: string
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          openid?: string | null
          permission_code?: string | null
          permission_scope?: string | null
          phone_masked?: string | null
          reason?: string | null
          request_id?: string | null
          scene?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_phone_access_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_phone_access_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_project_log_shares: {
        Row: {
          action: string
          created_at: string
          customer_id: string
          id: string
          log_id: string
          project_id: string
          selected_copy_id: string | null
          selected_copy_text: string | null
        }
        Insert: {
          action: string
          created_at?: string
          customer_id: string
          id?: string
          log_id: string
          project_id: string
          selected_copy_id?: string | null
          selected_copy_text?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          customer_id?: string
          id?: string
          log_id?: string
          project_id?: string
          selected_copy_id?: string | null
          selected_copy_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_project_log_shares_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_project_log_shares_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "project_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_project_log_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_ticket_actions: {
        Row: {
          action: string
          content: string | null
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          operator_auth_user_id: string | null
          operator_employee_id: string | null
          tenant_id: string
          ticket_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          content?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          operator_auth_user_id?: string | null
          operator_employee_id?: string | null
          tenant_id: string
          ticket_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          content?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          operator_auth_user_id?: string | null
          operator_employee_id?: string | null
          tenant_id?: string
          ticket_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_ticket_actions_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_ticket_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_service_ticket_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_ticket_actions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "customer_service_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_tickets: {
        Row: {
          assigned_employee_id: string | null
          category: string
          closed_at: string | null
          content: string
          created_at: string
          customer_id: string
          id: string
          images: Json
          priority: string
          project_id: string | null
          resolved_at: string | null
          status: string
          tenant_id: string
          ticket_no: string
          title: string | null
          updated_at: string
        }
        Insert: {
          assigned_employee_id?: string | null
          category?: string
          closed_at?: string | null
          content: string
          created_at?: string
          customer_id: string
          id?: string
          images?: Json
          priority?: string
          project_id?: string | null
          resolved_at?: string | null
          status?: string
          tenant_id: string
          ticket_no: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          assigned_employee_id?: string | null
          category?: string
          closed_at?: string | null
          content?: string
          created_at?: string
          customer_id?: string
          id?: string
          images?: Json
          priority?: string
          project_id?: string | null
          resolved_at?: string | null
          status?: string
          tenant_id?: string
          ticket_no?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_tickets_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_service_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_sources: {
        Row: {
          assigned_at: string | null
          assigned_by_employee_id: string | null
          created_at: string
          customer_id: string
          douyin_measurement_appointment_id: string | null
          id: string
          marketing_lead_id: string | null
          metadata: Json
          platform_lead_id: string | null
          related_id: string | null
          related_type: string | null
          share_link_id: string | null
          source: string
          source_employee_id: string | null
          source_label: string | null
          tenant_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by_employee_id?: string | null
          created_at?: string
          customer_id: string
          douyin_measurement_appointment_id?: string | null
          id?: string
          marketing_lead_id?: string | null
          metadata?: Json
          platform_lead_id?: string | null
          related_id?: string | null
          related_type?: string | null
          share_link_id?: string | null
          source: string
          source_employee_id?: string | null
          source_label?: string | null
          tenant_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by_employee_id?: string | null
          created_at?: string
          customer_id?: string
          douyin_measurement_appointment_id?: string | null
          id?: string
          marketing_lead_id?: string | null
          metadata?: Json
          platform_lead_id?: string | null
          related_id?: string | null
          related_type?: string | null
          share_link_id?: string | null
          source?: string
          source_employee_id?: string | null
          source_label?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_sources_assigned_by_employee_id_fkey"
            columns: ["assigned_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sources_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sources_marketing_lead_tenant_fkey"
            columns: ["marketing_lead_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_sources_measurement_appointment_tenant_fkey"
            columns: ["douyin_measurement_appointment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "douyin_measurement_appointments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_sources_platform_lead_id_fkey"
            columns: ["platform_lead_id"]
            isOneToOne: false
            referencedRelation: "platform_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sources_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "tenant_share_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sources_source_employee_id_fkey"
            columns: ["source_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wechat_pay_smoke_notifications: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          notify_id: string
          processed: boolean
          processed_at: string | null
          raw_payload: Json
          resource_type: string | null
          signature_valid: boolean
          smoke_order_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          notify_id: string
          processed?: boolean
          processed_at?: string | null
          raw_payload?: Json
          resource_type?: string | null
          signature_valid?: boolean
          smoke_order_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          notify_id?: string
          processed?: boolean
          processed_at?: string | null
          raw_payload?: Json
          resource_type?: string | null
          signature_valid?: boolean
          smoke_order_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_wechat_pay_smoke_notifications_smoke_order_id_fkey"
            columns: ["smoke_order_id"]
            isOneToOne: false
            referencedRelation: "customer_wechat_pay_smoke_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wechat_pay_smoke_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_wechat_pay_smoke_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wechat_pay_smoke_orders: {
        Row: {
          amount_fen: number
          closed_at: string | null
          created_at: string
          currency: string
          customer_id: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          latest_notification_id: string | null
          metadata: Json
          out_trade_no: string
          paid_amount_fen: number
          paid_at: string | null
          payer_openid: string
          payment_config_id: string | null
          prepay_id: string | null
          status: string
          tenant_id: string
          trade_state: string | null
          trade_state_desc: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_fen?: number
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          latest_notification_id?: string | null
          metadata?: Json
          out_trade_no: string
          paid_amount_fen?: number
          paid_at?: string | null
          payer_openid: string
          payment_config_id?: string | null
          prepay_id?: string | null
          status?: string
          tenant_id: string
          trade_state?: string | null
          trade_state_desc?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_fen?: number
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          latest_notification_id?: string | null
          metadata?: Json
          out_trade_no?: string
          paid_amount_fen?: number
          paid_at?: string | null
          payer_openid?: string
          payment_config_id?: string | null
          prepay_id?: string | null
          status?: string
          tenant_id?: string
          trade_state?: string | null
          trade_state_desc?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_wechat_pay_smoke_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wechat_pay_smoke_orders_payment_config_id_fkey"
            columns: ["payment_config_id"]
            isOneToOne: false
            referencedRelation: "tenant_payment_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wechat_pay_smoke_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customer_wechat_pay_smoke_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          avatar: string | null
          claimed_at: string | null
          created_at: string | null
          customer_origin: string
          douyin_screenshot_images: string[]
          id: string
          last_follow_at: string | null
          name: string | null
          owner_id: string | null
          phone: string | null
          property_id: string | null
          self_registered_at: string | null
          source: string | null
          status: string | null
          tags: Json | null
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar?: string | null
          claimed_at?: string | null
          created_at?: string | null
          customer_origin?: string
          douyin_screenshot_images?: string[]
          id?: string
          last_follow_at?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          property_id?: string | null
          self_registered_at?: string | null
          source?: string | null
          status?: string | null
          tags?: Json | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar?: string | null
          claimed_at?: string | null
          created_at?: string | null
          customer_origin?: string
          douyin_screenshot_images?: string[]
          id?: string
          last_follow_at?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          property_id?: string | null
          self_registered_at?: string | null
          source?: string | null
          status?: string | null
          tags?: Json | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      department_post_rules: {
        Row: {
          alias_name: string | null
          created_at: string | null
          department_code: string
          enabled: boolean
          id: string
          post_code: string
          sort: number
          tenant_department_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          alias_name?: string | null
          created_at?: string | null
          department_code: string
          enabled?: boolean
          id?: string
          post_code: string
          sort?: number
          tenant_department_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          alias_name?: string | null
          created_at?: string | null
          department_code?: string
          enabled?: boolean
          id?: string
          post_code?: string
          sort?: number
          tenant_department_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_post_rules_tenant_department_id_fkey"
            columns: ["tenant_department_id"]
            isOneToOne: false
            referencedRelation: "tenant_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_post_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "department_post_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      department_templates: {
        Row: {
          code: string
          created_at: string
          default_name: string
          description: string | null
          enabled: boolean
          id: string
          sort: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_name: string
          description?: string | null
          enabled?: boolean
          id?: string
          sort?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_name?: string
          description?: string | null
          enabled?: boolean
          id?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      departments_retired_20260527: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_authorization_event_deliveries: {
        Row: {
          authorization_code_digest: string | null
          authorizer_appid: string | null
          claim_expires_at: string | null
          claim_token: string | null
          completed_at: string | null
          component_appid: string
          created_at: string
          event_key: string
          event_name: string
          occurred_at: string
          processing_state: string
          updated_at: string
        }
        Insert: {
          authorization_code_digest?: string | null
          authorizer_appid?: string | null
          claim_expires_at?: string | null
          claim_token?: string | null
          completed_at?: string | null
          component_appid: string
          created_at?: string
          event_key: string
          event_name: string
          occurred_at: string
          processing_state?: string
          updated_at?: string
        }
        Update: {
          authorization_code_digest?: string | null
          authorizer_appid?: string | null
          claim_expires_at?: string | null
          claim_token?: string | null
          completed_at?: string | null
          component_appid?: string
          created_at?: string
          event_key?: string
          event_name?: string
          occurred_at?: string
          processing_state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_authorization_event_deliveries_component_appid_fkey"
            columns: ["component_appid"]
            isOneToOne: false
            referencedRelation: "douyin_third_party_components"
            referencedColumns: ["component_appid"]
          },
        ]
      }
      douyin_authorization_event_subject_leases: {
        Row: {
          active_event_key: string | null
          active_event_name: string | null
          active_occurred_at: string | null
          authorizer_appid: string
          claim_expires_at: string | null
          claim_token: string | null
          component_appid: string
          created_at: string
          updated_at: string
        }
        Insert: {
          active_event_key?: string | null
          active_event_name?: string | null
          active_occurred_at?: string | null
          authorizer_appid: string
          claim_expires_at?: string | null
          claim_token?: string | null
          component_appid: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          active_event_key?: string | null
          active_event_name?: string | null
          active_occurred_at?: string | null
          authorizer_appid?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          component_appid?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_authorization_event_subject_leases_component_appid_fkey"
            columns: ["component_appid"]
            isOneToOne: false
            referencedRelation: "douyin_third_party_components"
            referencedColumns: ["component_appid"]
          },
        ]
      }
      douyin_budget_estimates: {
        Row: {
          ai_analysis: Json | null
          ai_attempt_count: number
          ai_claimed_at: string | null
          ai_last_error_code: string | null
          ai_model: string | null
          ai_provider: string | null
          ai_status: string
          created_at: string
          douyin_miniapp_installation_id: string
          estimate_no: string
          expires_at: string
          id: string
          pricing_version_id: string
          request_ip_hash: string
          request_payload: Json
          result_payload: Json
          subject_hash: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_attempt_count?: number
          ai_claimed_at?: string | null
          ai_last_error_code?: string | null
          ai_model?: string | null
          ai_provider?: string | null
          ai_status?: string
          created_at?: string
          douyin_miniapp_installation_id: string
          estimate_no: string
          expires_at: string
          id?: string
          pricing_version_id: string
          request_ip_hash: string
          request_payload: Json
          result_payload: Json
          subject_hash: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_attempt_count?: number
          ai_claimed_at?: string | null
          ai_last_error_code?: string | null
          ai_model?: string | null
          ai_provider?: string | null
          ai_status?: string
          created_at?: string
          douyin_miniapp_installation_id?: string
          estimate_no?: string
          expires_at?: string
          id?: string
          pricing_version_id?: string
          request_ip_hash?: string
          request_payload?: Json
          result_payload?: Json
          subject_hash?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_budget_estimates_installation_owner_fkey"
            columns: ["douyin_miniapp_installation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "douyin_miniapp_installations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_budget_estimates_pricing_owner_fkey"
            columns: ["pricing_version_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "douyin_budget_pricing_versions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_budget_estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_budget_estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_budget_pricing_items: {
        Row: {
          category_code: string
          condition_payload: Json
          created_at: string
          id: string
          item_code: string
          label: string
          maximum_amount: number
          minimum_amount: number
          pricing_version_id: string
          sort_order: number
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          category_code: string
          condition_payload?: Json
          created_at?: string
          id?: string
          item_code: string
          label: string
          maximum_amount: number
          minimum_amount: number
          pricing_version_id: string
          sort_order: number
          status?: string
          unit: string
          updated_at?: string
        }
        Update: {
          category_code?: string
          condition_payload?: Json
          created_at?: string
          id?: string
          item_code?: string
          label?: string
          maximum_amount?: number
          minimum_amount?: number
          pricing_version_id?: string
          sort_order?: number
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_budget_pricing_items_pricing_version_id_fkey"
            columns: ["pricing_version_id"]
            isOneToOne: false
            referencedRelation: "douyin_budget_pricing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_budget_pricing_versions: {
        Row: {
          created_at: string
          created_by_employee_id: string
          currency: string
          disclaimer: string
          effective_from: string
          effective_to: string | null
          id: string
          status: string
          tenant_id: string
          updated_at: string
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by_employee_id: string
          currency?: string
          disclaimer: string
          effective_from: string
          effective_to?: string | null
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
          version_no: number
        }
        Update: {
          created_at?: string
          created_by_employee_id?: string
          currency?: string
          disclaimer?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "douyin_budget_pricing_versions_creator_tenant_fkey"
            columns: ["created_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_budget_pricing_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_budget_pricing_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_lead_follow_ups: {
        Row: {
          create_idempotency_key: string
          create_request_hash: string
          created_at: string
          douyin_measurement_appointment_id: string
          employee_id: string
          follow_up_type: string
          id: string
          marketing_lead_id: string
          next_follow_up_at: string | null
          result: string
          summary: string
          tenant_id: string
        }
        Insert: {
          create_idempotency_key: string
          create_request_hash: string
          created_at?: string
          douyin_measurement_appointment_id: string
          employee_id: string
          follow_up_type: string
          id?: string
          marketing_lead_id: string
          next_follow_up_at?: string | null
          result: string
          summary: string
          tenant_id: string
        }
        Update: {
          create_idempotency_key?: string
          create_request_hash?: string
          created_at?: string
          douyin_measurement_appointment_id?: string
          employee_id?: string
          follow_up_type?: string
          id?: string
          marketing_lead_id?: string
          next_follow_up_at?: string | null
          result?: string
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_lead_follow_ups_appointment_tenant_fkey"
            columns: ["douyin_measurement_appointment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "douyin_measurement_appointments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_lead_follow_ups_employee_tenant_fkey"
            columns: ["employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_lead_follow_ups_lead_tenant_fkey"
            columns: ["marketing_lead_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_lead_follow_ups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_lead_follow_ups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_lead_workflow_operations: {
        Row: {
          action: string
          actor_employee_id: string
          created_at: string
          id: string
          idempotency_key: string
          marketing_lead_id: string
          request_hash: string
          result_payload: Json
          tenant_id: string
        }
        Insert: {
          action: string
          actor_employee_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          marketing_lead_id: string
          request_hash: string
          result_payload: Json
          tenant_id: string
        }
        Update: {
          action?: string
          actor_employee_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          marketing_lead_id?: string
          request_hash?: string
          result_payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_lead_workflow_operations_actor_tenant_fkey"
            columns: ["actor_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_lead_workflow_operations_lead_tenant_fkey"
            columns: ["marketing_lead_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_lead_workflow_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_lead_workflow_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_measurement_appointments: {
        Row: {
          appointment_no: string
          assigned_at: string | null
          assigned_employee_id: string | null
          budget_estimate_id: string | null
          community: string
          confirmed_visit_at: string | null
          create_idempotency_key: string
          create_request_hash: string
          created_at: string
          customer_id: string | null
          douyin_miniapp_installation_id: string
          existing_customer_linked_at_submit: boolean
          id: string
          marketing_lead_id: string
          preferred_visit_date: string
          preferred_visit_period: string
          recent_pending_appointment_exists: boolean
          sms_verification_code_id: string
          source_snapshot: Json
          status: string
          tenant_id: string
          updated_at: string
          updated_existing: boolean
          version: number
        }
        Insert: {
          appointment_no: string
          assigned_at?: string | null
          assigned_employee_id?: string | null
          budget_estimate_id?: string | null
          community: string
          confirmed_visit_at?: string | null
          create_idempotency_key: string
          create_request_hash: string
          created_at?: string
          customer_id?: string | null
          douyin_miniapp_installation_id: string
          existing_customer_linked_at_submit: boolean
          id?: string
          marketing_lead_id: string
          preferred_visit_date: string
          preferred_visit_period: string
          recent_pending_appointment_exists: boolean
          sms_verification_code_id: string
          source_snapshot?: Json
          status?: string
          tenant_id: string
          updated_at?: string
          updated_existing: boolean
          version?: number
        }
        Update: {
          appointment_no?: string
          assigned_at?: string | null
          assigned_employee_id?: string | null
          budget_estimate_id?: string | null
          community?: string
          confirmed_visit_at?: string | null
          create_idempotency_key?: string
          create_request_hash?: string
          created_at?: string
          customer_id?: string | null
          douyin_miniapp_installation_id?: string
          existing_customer_linked_at_submit?: boolean
          id?: string
          marketing_lead_id?: string
          preferred_visit_date?: string
          preferred_visit_period?: string
          recent_pending_appointment_exists?: boolean
          sms_verification_code_id?: string
          source_snapshot?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_existing?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "douyin_measurement_appointments_assignee_tenant_fkey"
            columns: ["assigned_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_measurement_appointments_customer_tenant_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_measurement_appointments_estimate_tenant_fkey"
            columns: ["budget_estimate_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "douyin_budget_estimates"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_measurement_appointments_installation_tenant_fkey"
            columns: ["douyin_miniapp_installation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "douyin_miniapp_installations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_measurement_appointments_lead_tenant_fkey"
            columns: ["marketing_lead_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "douyin_measurement_appointments_sms_verification_code_id_fkey"
            columns: ["sms_verification_code_id"]
            isOneToOne: true
            referencedRelation: "sms_verification_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "douyin_measurement_appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_measurement_appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_miniapp_authorization_intents: {
        Row: {
          authorization_code_digest: string | null
          authorizer_appid: string | null
          completed_at: string | null
          component_appid: string
          created_at: string
          expires_at: string
          failure_code: string | null
          id: string
          intent_digest: string
          requested_by_employee_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          authorization_code_digest?: string | null
          authorizer_appid?: string | null
          completed_at?: string | null
          component_appid: string
          created_at?: string
          expires_at: string
          failure_code?: string | null
          id?: string
          intent_digest: string
          requested_by_employee_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          authorization_code_digest?: string | null
          authorizer_appid?: string | null
          completed_at?: string | null
          component_appid?: string
          created_at?: string
          expires_at?: string
          failure_code?: string | null
          id?: string
          intent_digest?: string
          requested_by_employee_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_miniapp_authorization_inte_requested_by_employee_id_fkey"
            columns: ["requested_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "douyin_miniapp_authorization_intents_component_appid_fkey"
            columns: ["component_appid"]
            isOneToOne: false
            referencedRelation: "douyin_third_party_components"
            referencedColumns: ["component_appid"]
          },
          {
            foreignKeyName: "douyin_miniapp_authorization_intents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_miniapp_authorization_intents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_miniapp_deployable_templates: {
        Row: {
          channel: string
          confirmed_at: string
          confirmed_by_employee_id: string | null
          created_at: string
          description: string
          id: string
          is_current: boolean
          source_draft_id: string
          template_app_id: string
          template_id: string
          template_version: string
        }
        Insert: {
          channel?: string
          confirmed_at?: string
          confirmed_by_employee_id?: string | null
          created_at?: string
          description: string
          id?: string
          is_current?: boolean
          source_draft_id: string
          template_app_id: string
          template_id: string
          template_version: string
        }
        Update: {
          channel?: string
          confirmed_at?: string
          confirmed_by_employee_id?: string | null
          created_at?: string
          description?: string
          id?: string
          is_current?: boolean
          source_draft_id?: string
          template_app_id?: string
          template_id?: string
          template_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_miniapp_deployable_templat_confirmed_by_employee_id_fkey"
            columns: ["confirmed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_miniapp_installations: {
        Row: {
          access_token_ciphertext: string | null
          access_token_expires_at: string | null
          access_token_iv: string | null
          access_token_key_version: string | null
          access_token_tag: string | null
          authorization_event_occurred_at: string | null
          authorization_status: string
          authorizer_appid: string
          component_appid: string
          created_at: string
          deployment_key: string | null
          id: string
          installation_kind: string
          last_audited_at: string | null
          last_released_at: string | null
          last_submitted_at: string | null
          permission_snapshot: Json
          refresh_token_ciphertext: string | null
          refresh_token_expires_at: string | null
          refresh_token_iv: string | null
          refresh_token_key_version: string | null
          refresh_token_tag: string | null
          revoked_at: string | null
          runtime_config: Json
          template_id: string | null
          template_release_id: string | null
          template_version: string | null
          tenant_id: string | null
          token_refresh_claim_expires_at: string | null
          token_refresh_claim_token: string | null
          token_refresh_last_error: string | null
          updated_at: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          access_token_iv?: string | null
          access_token_key_version?: string | null
          access_token_tag?: string | null
          authorization_event_occurred_at?: string | null
          authorization_status?: string
          authorizer_appid: string
          component_appid: string
          created_at?: string
          deployment_key?: string | null
          id?: string
          installation_kind?: string
          last_audited_at?: string | null
          last_released_at?: string | null
          last_submitted_at?: string | null
          permission_snapshot?: Json
          refresh_token_ciphertext?: string | null
          refresh_token_expires_at?: string | null
          refresh_token_iv?: string | null
          refresh_token_key_version?: string | null
          refresh_token_tag?: string | null
          revoked_at?: string | null
          runtime_config?: Json
          template_id?: string | null
          template_release_id?: string | null
          template_version?: string | null
          tenant_id?: string | null
          token_refresh_claim_expires_at?: string | null
          token_refresh_claim_token?: string | null
          token_refresh_last_error?: string | null
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          access_token_iv?: string | null
          access_token_key_version?: string | null
          access_token_tag?: string | null
          authorization_event_occurred_at?: string | null
          authorization_status?: string
          authorizer_appid?: string
          component_appid?: string
          created_at?: string
          deployment_key?: string | null
          id?: string
          installation_kind?: string
          last_audited_at?: string | null
          last_released_at?: string | null
          last_submitted_at?: string | null
          permission_snapshot?: Json
          refresh_token_ciphertext?: string | null
          refresh_token_expires_at?: string | null
          refresh_token_iv?: string | null
          refresh_token_key_version?: string | null
          refresh_token_tag?: string | null
          revoked_at?: string | null
          runtime_config?: Json
          template_id?: string | null
          template_release_id?: string | null
          template_version?: string | null
          tenant_id?: string | null
          token_refresh_claim_expires_at?: string | null
          token_refresh_claim_token?: string | null
          token_refresh_last_error?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_miniapp_installations_component_appid_fkey"
            columns: ["component_appid"]
            isOneToOne: false
            referencedRelation: "douyin_third_party_components"
            referencedColumns: ["component_appid"]
          },
          {
            foreignKeyName: "douyin_miniapp_installations_template_release_owner_fkey"
            columns: ["template_release_id", "id"]
            isOneToOne: false
            referencedRelation: "douyin_miniapp_releases"
            referencedColumns: ["id", "installation_id"]
          },
          {
            foreignKeyName: "douyin_miniapp_installations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_miniapp_installations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_miniapp_lead_submissions: {
        Row: {
          already_submitted: boolean
          created_at: string
          douyin_miniapp_installation_id: string
          id: string
          idempotency_key: string
          marketing_lead_id: string
          message: string
          request_digest: string
          sms_verification_code_id: string
          tenant_id: string
          updated_existing: boolean
        }
        Insert: {
          already_submitted: boolean
          created_at?: string
          douyin_miniapp_installation_id: string
          id?: string
          idempotency_key: string
          marketing_lead_id: string
          message: string
          request_digest: string
          sms_verification_code_id: string
          tenant_id: string
          updated_existing: boolean
        }
        Update: {
          already_submitted?: boolean
          created_at?: string
          douyin_miniapp_installation_id?: string
          id?: string
          idempotency_key?: string
          marketing_lead_id?: string
          message?: string
          request_digest?: string
          sms_verification_code_id?: string
          tenant_id?: string
          updated_existing?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "douyin_lead_submissions_installation_id_fkey"
            columns: ["douyin_miniapp_installation_id"]
            isOneToOne: false
            referencedRelation: "douyin_miniapp_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "douyin_miniapp_lead_submissions_marketing_lead_id_fkey"
            columns: ["marketing_lead_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "douyin_miniapp_lead_submissions_sms_verification_code_id_fkey"
            columns: ["sms_verification_code_id"]
            isOneToOne: true
            referencedRelation: "sms_verification_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "douyin_miniapp_lead_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_miniapp_lead_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_miniapp_releases: {
        Row: {
          audit_host_names: string[]
          audit_note: string | null
          audit_result: Json | null
          audited_at: string | null
          channel: string
          created_at: string
          description: string
          douyin_log_id: string | null
          ext_json: Json
          id: string
          installation_id: string
          operation_claim_expires_at: string | null
          operation_claim_token: string | null
          operation_name: string | null
          platform_operator_id: string
          released_at: string | null
          status: string
          submitted_at: string | null
          template_id: string
          template_version: string
          test_qr_url: string | null
          updated_at: string
        }
        Insert: {
          audit_host_names?: string[]
          audit_note?: string | null
          audit_result?: Json | null
          audited_at?: string | null
          channel?: string
          created_at?: string
          description: string
          douyin_log_id?: string | null
          ext_json: Json
          id?: string
          installation_id: string
          operation_claim_expires_at?: string | null
          operation_claim_token?: string | null
          operation_name?: string | null
          platform_operator_id: string
          released_at?: string | null
          status?: string
          submitted_at?: string | null
          template_id: string
          template_version: string
          test_qr_url?: string | null
          updated_at?: string
        }
        Update: {
          audit_host_names?: string[]
          audit_note?: string | null
          audit_result?: Json | null
          audited_at?: string | null
          channel?: string
          created_at?: string
          description?: string
          douyin_log_id?: string | null
          ext_json?: Json
          id?: string
          installation_id?: string
          operation_claim_expires_at?: string | null
          operation_claim_token?: string | null
          operation_name?: string | null
          platform_operator_id?: string
          released_at?: string | null
          status?: string
          submitted_at?: string | null
          template_id?: string
          template_version?: string
          test_qr_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_miniapp_releases_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "douyin_miniapp_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "douyin_miniapp_releases_platform_operator_id_fkey"
            columns: ["platform_operator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_project_public_profiles: {
        Row: {
          budget_band: string | null
          created_at: string
          id: string
          project_id: string
          public_description: string
          public_image_urls: string[]
          public_title: string
          publication_status: string
          style_tags: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          budget_band?: string | null
          created_at?: string
          id?: string
          project_id: string
          public_description: string
          public_image_urls?: string[]
          public_title: string
          publication_status?: string
          style_tags?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          budget_band?: string | null
          created_at?: string
          id?: string
          project_id?: string
          public_description?: string
          public_image_urls?: string[]
          public_title?: string
          publication_status?: string
          style_tags?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "douyin_project_public_profiles_project_tenant_fkey"
            columns: ["tenant_id", "project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "douyin_project_public_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "douyin_project_public_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      douyin_third_party_components: {
        Row: {
          access_token_ciphertext: string | null
          access_token_expires_at: string | null
          access_token_iv: string | null
          access_token_key_version: string | null
          access_token_tag: string | null
          component_appid: string
          component_ticket_ciphertext: string | null
          component_ticket_iv: string | null
          component_ticket_key_version: string | null
          component_ticket_received_at: string | null
          component_ticket_tag: string | null
          created_at: string
          status: string
          token_refresh_claim_expires_at: string | null
          token_refresh_claim_token: string | null
          token_refresh_last_error: string | null
          updated_at: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          access_token_iv?: string | null
          access_token_key_version?: string | null
          access_token_tag?: string | null
          component_appid: string
          component_ticket_ciphertext?: string | null
          component_ticket_iv?: string | null
          component_ticket_key_version?: string | null
          component_ticket_received_at?: string | null
          component_ticket_tag?: string | null
          created_at?: string
          status?: string
          token_refresh_claim_expires_at?: string | null
          token_refresh_claim_token?: string | null
          token_refresh_last_error?: string | null
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          access_token_iv?: string | null
          access_token_key_version?: string | null
          access_token_tag?: string | null
          component_appid?: string
          component_ticket_ciphertext?: string | null
          component_ticket_iv?: string | null
          component_ticket_key_version?: string | null
          component_ticket_received_at?: string | null
          component_ticket_tag?: string | null
          created_at?: string
          status?: string
          token_refresh_claim_expires_at?: string | null
          token_refresh_claim_token?: string | null
          token_refresh_last_error?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employee_permission_overrides: {
        Row: {
          access_scope: string | null
          created_at: string
          effect: string
          employee_id: string
          id: string
          permission_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          access_scope?: string | null
          created_at?: string
          effect: string
          employee_id: string
          id?: string
          permission_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          access_scope?: string | null
          created_at?: string
          effect?: string
          employee_id?: string
          id?: string
          permission_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permission_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_permission_overrides_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_personalization_rules: {
        Row: {
          content_json: Json
          created_at: string
          created_by: string | null
          employee_id: string | null
          ends_at: string | null
          id: string
          post_id: string | null
          priority: number
          role_code: string | null
          scene: string
          starts_at: string | null
          status: string
          tenant_department_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_json?: Json
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          ends_at?: string | null
          id?: string
          post_id?: string | null
          priority?: number
          role_code?: string | null
          scene: string
          starts_at?: string | null
          status?: string
          tenant_department_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_json?: Json
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          ends_at?: string | null
          id?: string
          post_id?: string | null
          priority?: number
          role_code?: string | null
          scene?: string
          starts_at?: string | null
          status?: string
          tenant_department_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_personalization_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_personalization_rules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_personalization_rules_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_personalization_rules_tenant_department_id_fkey"
            columns: ["tenant_department_id"]
            isOneToOne: false
            referencedRelation: "tenant_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_personalization_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "employee_personalization_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_personalization_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_roles: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          role_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_roles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          admin_auth_version: number
          avatar: string | null
          created_at: string | null
          id: string
          last_login_time: string | null
          name: string | null
          phone: string | null
          post_id: string | null
          status: string | null
          tenant_department_id: string | null
          tenant_id: string | null
          user_id: string | null
          version: number
        }
        Insert: {
          admin_auth_version?: number
          avatar?: string | null
          created_at?: string | null
          id?: string
          last_login_time?: string | null
          name?: string | null
          phone?: string | null
          post_id?: string | null
          status?: string | null
          tenant_department_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
          version?: number
        }
        Update: {
          admin_auth_version?: number
          avatar?: string | null
          created_at?: string | null
          id?: string
          last_login_time?: string | null
          name?: string | null
          phone?: string | null
          post_id?: string | null
          status?: string | null
          tenant_department_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_department_id_fkey"
            columns: ["tenant_department_id"]
            isOneToOne: false
            referencedRelation: "tenant_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_request_approvals: {
        Row: {
          action: string
          approval_round: number
          approver_id: string | null
          comment: string | null
          created_at: string
          expense_request_id: string
          id: string
          step: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          approval_round?: number
          approver_id?: string | null
          comment?: string | null
          created_at?: string
          expense_request_id: string
          id?: string
          step: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          approval_round?: number
          approver_id?: string | null
          comment?: string | null
          created_at?: string
          expense_request_id?: string
          id?: string
          step?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_request_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_request_approvals_expense_request_id_fkey"
            columns: ["expense_request_id"]
            isOneToOne: false
            referencedRelation: "expense_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_request_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "expense_request_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_request_categories: {
        Row: {
          code: string
          created_at: string
          department_codes: Json
          description: string | null
          id: string
          is_builtin: boolean
          is_default: boolean
          mode_codes: Json
          name: string
          remark: string | null
          sort: number
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_codes?: Json
          description?: string | null
          id?: string
          is_builtin?: boolean
          is_default?: boolean
          mode_codes?: Json
          name: string
          remark?: string | null
          sort?: number
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_codes?: Json
          description?: string | null
          id?: string
          is_builtin?: boolean
          is_default?: boolean
          mode_codes?: Json
          name?: string
          remark?: string | null
          sort?: number
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_request_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "expense_request_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_request_items: {
        Row: {
          amount: number
          category: string
          category_code: string | null
          category_remark: string | null
          created_at: string
          evidence_images: Json
          expense_request_id: string
          id: string
          invoice_no: string | null
          occurred_at: string | null
          remark: string | null
          tenant_id: string | null
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          amount: number
          category: string
          category_code?: string | null
          category_remark?: string | null
          created_at?: string
          evidence_images?: Json
          expense_request_id: string
          id?: string
          invoice_no?: string | null
          occurred_at?: string | null
          remark?: string | null
          tenant_id?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          category?: string
          category_code?: string | null
          category_remark?: string | null
          created_at?: string
          evidence_images?: Json
          expense_request_id?: string
          id?: string
          invoice_no?: string | null
          occurred_at?: string | null
          remark?: string | null
          tenant_id?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_request_items_expense_request_id_fkey"
            columns: ["expense_request_id"]
            isOneToOne: false
            referencedRelation: "expense_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_request_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "expense_request_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_request_settlements: {
        Row: {
          created_at: string
          evidence_images: Json
          expense_request_id: string
          id: string
          method: string
          paid_amount: number
          paid_at: string
          paid_by: string | null
          payee_account: string | null
          payee_bank: string | null
          payee_name: string
          remark: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_images?: Json
          expense_request_id: string
          id?: string
          method: string
          paid_amount: number
          paid_at: string
          paid_by?: string | null
          payee_account?: string | null
          payee_bank?: string | null
          payee_name: string
          remark?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_images?: Json
          expense_request_id?: string
          id?: string
          method?: string
          paid_amount?: number
          paid_at?: string
          paid_by?: string | null
          payee_account?: string | null
          payee_bank?: string | null
          payee_name?: string
          remark?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_request_settlements_expense_request_id_fkey"
            columns: ["expense_request_id"]
            isOneToOne: true
            referencedRelation: "expense_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_request_settlements_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_request_settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "expense_request_settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_requests: {
        Row: {
          amount: number
          approved_at: string | null
          assignee_id: string | null
          audit_log: Json | null
          cancelled_at: string | null
          category: string | null
          completed_at: string | null
          cost_category_id: string | null
          created_at: string | null
          employee_id: string
          evidence_images: Json | null
          id: string
          mode: string
          payment_id: string | null
          project_id: string | null
          reason: string | null
          rejected_at: string | null
          rejected_reason: string | null
          request_no: string | null
          status: string
          submitted_at: string | null
          tenant_id: string | null
          title: string | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          assignee_id?: string | null
          audit_log?: Json | null
          cancelled_at?: string | null
          category?: string | null
          completed_at?: string | null
          cost_category_id?: string | null
          created_at?: string | null
          employee_id: string
          evidence_images?: Json | null
          id?: string
          mode: string
          payment_id?: string | null
          project_id?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          request_no?: string | null
          status?: string
          submitted_at?: string | null
          tenant_id?: string | null
          title?: string | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          assignee_id?: string | null
          audit_log?: Json | null
          cancelled_at?: string | null
          category?: string | null
          completed_at?: string | null
          cost_category_id?: string | null
          created_at?: string | null
          employee_id?: string
          evidence_images?: Json | null
          id?: string
          mode?: string
          payment_id?: string | null
          project_id?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          request_no?: string | null
          status?: string
          submitted_at?: string | null
          tenant_id?: string | null
          title?: string | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_requests_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_requests_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "expense_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      external_referrers: {
        Row: {
          alipay_account: string | null
          bank_account: string | null
          bank_name: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          remark: string | null
          status: string
          tenant_id: string
          updated_at: string
          wechat_account: string | null
        }
        Insert: {
          alipay_account?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          remark?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          wechat_account?: string | null
        }
        Update: {
          alipay_account?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          remark?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          wechat_account?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_referrers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "external_referrers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ezviz_access_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      finance_closing_periods: {
        Row: {
          closed_at: string | null
          closed_by_employee_id: string | null
          created_at: string
          id: string
          notes: string | null
          period_month: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by_employee_id: string | null
          snapshot_json: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by_employee_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_month: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by_employee_id?: string | null
          snapshot_json?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by_employee_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_month?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by_employee_id?: string | null
          snapshot_json?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_closing_periods_closed_by_employee_id_fkey"
            columns: ["closed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_closing_periods_reopened_by_employee_id_fkey"
            columns: ["reopened_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_closing_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "finance_closing_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_cost_categories: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_system: boolean
          metadata: Json
          name: string
          sort_order: number
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          metadata?: Json
          name: string
          sort_order?: number
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          metadata?: Json
          name?: string
          sort_order?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_cost_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_cost_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "finance_cost_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_cost_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_ledger_entries: {
        Row: {
          amount: number
          cost_category_id: string | null
          cost_category_updated_at: string | null
          cost_category_updated_by: string | null
          created_at: string
          currency: string
          direction: string
          entry_type: string
          expense_request_id: string | null
          expense_settlement_id: string | null
          handled_by: string | null
          id: string
          legacy_payment_ledger_marked_at: string | null
          legacy_payment_ledger_marked_by: string | null
          legacy_payment_ledger_reason: string | null
          metadata: Json
          occurred_at: string
          payment_id: string | null
          payment_link_previous_payment_id: string | null
          payment_link_reason: string | null
          payment_linked_at: string | null
          payment_linked_by: string | null
          project_id: string | null
          source_id: string
          source_type: string
          summary: string | null
          tenant_id: string
          updated_at: string
          workflow_task_id: string | null
        }
        Insert: {
          amount: number
          cost_category_id?: string | null
          cost_category_updated_at?: string | null
          cost_category_updated_by?: string | null
          created_at?: string
          currency?: string
          direction: string
          entry_type: string
          expense_request_id?: string | null
          expense_settlement_id?: string | null
          handled_by?: string | null
          id?: string
          legacy_payment_ledger_marked_at?: string | null
          legacy_payment_ledger_marked_by?: string | null
          legacy_payment_ledger_reason?: string | null
          metadata?: Json
          occurred_at?: string
          payment_id?: string | null
          payment_link_previous_payment_id?: string | null
          payment_link_reason?: string | null
          payment_linked_at?: string | null
          payment_linked_by?: string | null
          project_id?: string | null
          source_id: string
          source_type: string
          summary?: string | null
          tenant_id: string
          updated_at?: string
          workflow_task_id?: string | null
        }
        Update: {
          amount?: number
          cost_category_id?: string | null
          cost_category_updated_at?: string | null
          cost_category_updated_by?: string | null
          created_at?: string
          currency?: string
          direction?: string
          entry_type?: string
          expense_request_id?: string | null
          expense_settlement_id?: string | null
          handled_by?: string | null
          id?: string
          legacy_payment_ledger_marked_at?: string | null
          legacy_payment_ledger_marked_by?: string | null
          legacy_payment_ledger_reason?: string | null
          metadata?: Json
          occurred_at?: string
          payment_id?: string | null
          payment_link_previous_payment_id?: string | null
          payment_link_reason?: string | null
          payment_linked_at?: string | null
          payment_linked_by?: string | null
          project_id?: string | null
          source_id?: string
          source_type?: string
          summary?: string | null
          tenant_id?: string
          updated_at?: string
          workflow_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_ledger_entries_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_cost_category_updated_by_fkey"
            columns: ["cost_category_updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_expense_request_id_fkey"
            columns: ["expense_request_id"]
            isOneToOne: false
            referencedRelation: "expense_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_expense_settlement_id_fkey"
            columns: ["expense_settlement_id"]
            isOneToOne: false
            referencedRelation: "expense_request_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_legacy_payment_ledger_marked_by_fkey"
            columns: ["legacy_payment_ledger_marked_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_payment_linked_by_fkey"
            columns: ["payment_linked_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_workflow_task_id_fkey"
            columns: ["workflow_task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_monthly_difference_resolutions: {
        Row: {
          created_at: string
          handled_at: string
          handled_by: string | null
          id: string
          month: string
          note: string | null
          project_id: string | null
          source_id: string
          source_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          handled_at?: string
          handled_by?: string | null
          id?: string
          month: string
          note?: string | null
          project_id?: string | null
          source_id: string
          source_type: string
          status: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          handled_at?: string
          handled_by?: string | null
          id?: string
          month?: string
          note?: string | null
          project_id?: string | null
          source_id?: string
          source_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_monthly_difference_resolutions_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_monthly_difference_resolutions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_monthly_difference_resolutions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "finance_monthly_difference_resolutions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reconciliation_exception_actions: {
        Row: {
          action: string
          actor_employee_id: string | null
          created_at: string
          exception_code: string
          exception_fingerprint: string
          id: string
          project_id: string | null
          remark: string
          subject_id: string | null
          subject_type: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_employee_id?: string | null
          created_at?: string
          exception_code: string
          exception_fingerprint: string
          id?: string
          project_id?: string | null
          remark: string
          subject_id?: string | null
          subject_type: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_employee_id?: string | null
          created_at?: string
          exception_code?: string
          exception_fingerprint?: string
          id?: string
          project_id?: string | null
          remark?: string
          subject_id?: string | null
          subject_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_reconciliation_exception_actions_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reconciliation_exception_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reconciliation_exception_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "finance_reconciliation_exception_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_assets: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          file_size: number | null
          file_url: string
          height: number | null
          id: string
          mime_type: string | null
          tenant_id: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url: string
          height?: number | null
          id?: string
          mime_type?: string | null
          tenant_id?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          tenant_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaign_project_scopes: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          project_id: string
          scope_mode: string
          tenant_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          project_id: string
          scope_mode: string
          tenant_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          project_id?: string
          scope_mode?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_project_scopes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_project_scopes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_project_scopes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_campaign_project_scopes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaign_templates: {
        Row: {
          campaign_type: string
          config_payload: Json
          created_at: string
          created_by_employee_id: string | null
          default_target_scope_type: string
          description: string | null
          enabled: boolean
          id: string
          is_builtin: boolean
          name: string
          reward_claim_channel: string | null
          reward_claim_instruction: string | null
          reward_remark: string | null
          reward_title: string | null
          status: string
          updated_at: string
          updated_by_employee_id: string | null
        }
        Insert: {
          campaign_type: string
          config_payload?: Json
          created_at?: string
          created_by_employee_id?: string | null
          default_target_scope_type?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_builtin?: boolean
          name: string
          reward_claim_channel?: string | null
          reward_claim_instruction?: string | null
          reward_remark?: string | null
          reward_title?: string | null
          status?: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Update: {
          campaign_type?: string
          config_payload?: Json
          created_at?: string
          created_by_employee_id?: string | null
          default_target_scope_type?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_builtin?: boolean
          name?: string
          reward_claim_channel?: string | null
          reward_claim_instruction?: string | null
          reward_remark?: string | null
          reward_title?: string | null
          status?: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_templates_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_templates_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          auto_close_on_expire: boolean
          campaign_type: string
          config_payload: Json
          created_at: string
          created_by_employee_id: string | null
          enabled: boolean
          id: string
          name: string
          reward_claim_channel: string | null
          reward_claim_instruction: string | null
          reward_remark: string | null
          reward_title: string | null
          status: string
          target_scope_type: string
          template_id: string | null
          template_snapshot: Json | null
          tenant_id: string | null
          updated_at: string
          updated_by_employee_id: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          auto_close_on_expire?: boolean
          campaign_type: string
          config_payload?: Json
          created_at?: string
          created_by_employee_id?: string | null
          enabled?: boolean
          id?: string
          name: string
          reward_claim_channel?: string | null
          reward_claim_instruction?: string | null
          reward_remark?: string | null
          reward_title?: string | null
          status?: string
          target_scope_type?: string
          template_id?: string | null
          template_snapshot?: Json | null
          tenant_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          auto_close_on_expire?: boolean
          campaign_type?: string
          config_payload?: Json
          created_at?: string
          created_by_employee_id?: string | null
          enabled?: boolean
          id?: string
          name?: string
          reward_claim_channel?: string | null
          reward_claim_instruction?: string | null
          reward_remark?: string | null
          reward_title?: string | null
          status?: string
          target_scope_type?: string
          template_id?: string | null
          template_snapshot?: Json | null
          tenant_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_events: {
        Row: {
          block_id: string | null
          created_at: string
          customer_id: string | null
          douyin_miniapp_installation_id: string | null
          event_name: string
          id: string
          page_id: string | null
          page_version_id: string | null
          payload: Json
          request_ip: string | null
          source: string
          subject_hash: string | null
          tenant_id: string | null
          user_agent: string | null
          wx_openid: string | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          customer_id?: string | null
          douyin_miniapp_installation_id?: string | null
          event_name: string
          id?: string
          page_id?: string | null
          page_version_id?: string | null
          payload?: Json
          request_ip?: string | null
          source?: string
          subject_hash?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          wx_openid?: string | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          customer_id?: string | null
          douyin_miniapp_installation_id?: string | null
          event_name?: string
          id?: string
          page_id?: string | null
          page_version_id?: string | null
          payload?: Json
          request_ip?: string | null
          source?: string
          subject_hash?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          wx_openid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_events_douyin_miniapp_installation_id_fkey"
            columns: ["douyin_miniapp_installation_id"]
            isOneToOne: false
            referencedRelation: "douyin_miniapp_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "marketing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_events_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "marketing_page_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          assigned_at: string | null
          assigned_employee_id: string | null
          city: string | null
          community: string | null
          created_at: string
          customer_id: string | null
          douyin_miniapp_installation_id: string | null
          follow_remark: string | null
          followed_at: string | null
          followed_by: string | null
          form_data: Json
          id: string
          lead_status: string
          name: string | null
          page_id: string | null
          page_version_id: string | null
          phone: string | null
          request_ip: string | null
          source: string
          tenant_id: string | null
          user_agent: string | null
          version: number
          wx_openid: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_employee_id?: string | null
          city?: string | null
          community?: string | null
          created_at?: string
          customer_id?: string | null
          douyin_miniapp_installation_id?: string | null
          follow_remark?: string | null
          followed_at?: string | null
          followed_by?: string | null
          form_data?: Json
          id?: string
          lead_status?: string
          name?: string | null
          page_id?: string | null
          page_version_id?: string | null
          phone?: string | null
          request_ip?: string | null
          source?: string
          tenant_id?: string | null
          user_agent?: string | null
          version?: number
          wx_openid?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_employee_id?: string | null
          city?: string | null
          community?: string | null
          created_at?: string
          customer_id?: string | null
          douyin_miniapp_installation_id?: string | null
          follow_remark?: string | null
          followed_at?: string | null
          followed_by?: string | null
          form_data?: Json
          id?: string
          lead_status?: string
          name?: string | null
          page_id?: string | null
          page_version_id?: string | null
          phone?: string | null
          request_ip?: string | null
          source?: string
          tenant_id?: string | null
          user_agent?: string | null
          version?: number
          wx_openid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_assignee_tenant_fkey"
            columns: ["assigned_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "marketing_leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_douyin_miniapp_installation_id_fkey"
            columns: ["douyin_miniapp_installation_id"]
            isOneToOne: false
            referencedRelation: "douyin_miniapp_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_followed_by_fkey"
            columns: ["followed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "marketing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "marketing_page_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_page_versions: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          page_id: string
          published_at: string | null
          schema_version: number
          status: string
          tenant_id: string | null
          version_no: number
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id: string
          published_at?: string | null
          schema_version?: number
          status?: string
          tenant_id?: string | null
          version_no: number
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id?: string
          published_at?: string | null
          schema_version?: number
          status?: string
          tenant_id?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_page_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_page_versions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "marketing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_page_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_page_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_pages: {
        Row: {
          cover_image: string | null
          created_at: string
          created_by: string | null
          description: string | null
          display_scene: string
          end_at: string | null
          id: string
          published_at: string | null
          published_by: string | null
          published_version_id: string | null
          slug: string
          sort_order: number
          start_at: string | null
          status: string
          tenant_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_scene?: string
          end_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          published_version_id?: string | null
          slug: string
          sort_order?: number
          start_at?: string | null
          status?: string
          tenant_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_scene?: string
          end_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          published_version_id?: string | null
          slug?: string
          sort_order?: number
          start_at?: string | null
          status?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_pages_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_pages_published_version_id_fkey"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "marketing_page_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "marketing_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          content: string
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          recipient_employee_id: string
          scene: string
          status: string
          target_id: string | null
          target_type: string | null
          target_url: string | null
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_employee_id: string
          scene: string
          status?: string
          target_id?: string | null
          target_type?: string | null
          target_url?: string | null
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_employee_id?: string
          scene?: string
          status?: string
          target_id?: string | null
          target_type?: string | null
          target_url?: string | null
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_employee_id_fkey"
            columns: ["recipient_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_recognitions: {
        Row: {
          actor_employee_id: string | null
          actor_visitor_id: string | null
          billable_units: number
          created_at: string
          dedupe_key: string
          document_type: string
          duration_ms: number | null
          expires_at: string
          file_checksum: string | null
          file_object_id: string
          id: string
          idempotency_key: string
          processed_at: string | null
          processing_deadline_at: string | null
          provider: string
          provider_action: string
          provider_error_code: string | null
          provider_error_message_safe: string | null
          provider_request_id: string | null
          provider_started_at: string | null
          quality: Json
          request_ip_hash: string | null
          result_ciphertext: string | null
          result_summary: Json
          scene: string
          scope_type: string
          status: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string | null
          updated_at: string
          warnings: Json
        }
        Insert: {
          actor_employee_id?: string | null
          actor_visitor_id?: string | null
          billable_units?: number
          created_at?: string
          dedupe_key: string
          document_type: string
          duration_ms?: number | null
          expires_at?: string
          file_checksum?: string | null
          file_object_id: string
          id?: string
          idempotency_key: string
          processed_at?: string | null
          processing_deadline_at?: string | null
          provider?: string
          provider_action: string
          provider_error_code?: string | null
          provider_error_message_safe?: string | null
          provider_request_id?: string | null
          provider_started_at?: string | null
          quality?: Json
          request_ip_hash?: string | null
          result_ciphertext?: string | null
          result_summary?: Json
          scene: string
          scope_type?: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string | null
          updated_at?: string
          warnings?: Json
        }
        Update: {
          actor_employee_id?: string | null
          actor_visitor_id?: string | null
          billable_units?: number
          created_at?: string
          dedupe_key?: string
          document_type?: string
          duration_ms?: number | null
          expires_at?: string
          file_checksum?: string | null
          file_object_id?: string
          id?: string
          idempotency_key?: string
          processed_at?: string | null
          processing_deadline_at?: string | null
          provider?: string
          provider_action?: string
          provider_error_code?: string | null
          provider_error_message_safe?: string | null
          provider_request_id?: string | null
          provider_started_at?: string | null
          quality?: Json
          request_ip_hash?: string | null
          result_ciphertext?: string | null
          result_summary?: Json
          scene?: string
          scope_type?: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string | null
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ocr_recognitions_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_recognitions_file_object_id_fkey"
            columns: ["file_object_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_recognitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ocr_recognitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_tenant_policies: {
        Row: {
          allowed_document_types: string[]
          created_at: string
          daily_limit: number | null
          enabled: boolean
          enabled_at: string | null
          remark: string | null
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string | null
        }
        Insert: {
          allowed_document_types?: string[]
          created_at?: string
          daily_limit?: number | null
          enabled?: boolean
          enabled_at?: string | null
          remark?: string | null
          tenant_id: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Update: {
          allowed_document_types?: string[]
          created_at?: string
          daily_limit?: number | null
          enabled?: boolean
          enabled_at?: string | null
          remark?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_tenant_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ocr_tenant_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_tenant_policies_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_script_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          executed_by_employee_id: string | null
          exit_code: number | null
          finished_at: string | null
          id: string
          reason: string | null
          script_key: string
          script_label: string
          started_at: string
          status: string
          stderr: string | null
          stdout: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          executed_by_employee_id?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          reason?: string | null
          script_key: string
          script_label: string
          started_at?: string
          status: string
          stderr?: string | null
          stdout?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          executed_by_employee_id?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          reason?: string | null
          script_key?: string
          script_label?: string
          started_at?: string
          status?: string
          stderr?: string | null
          stdout?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_script_runs_executed_by_employee_id_fkey"
            columns: ["executed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_commission_ledger: {
        Row: {
          available_at: string | null
          base_amount_fen: number
          blocked_reason: string | null
          commission_amount_fen: number
          commission_rate_bps: number
          created_at: string
          failure_reason: string | null
          id: string
          partner_id: string
          revenue_event_id: string
          revenue_type: string
          settlement_batch_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          available_at?: string | null
          base_amount_fen: number
          blocked_reason?: string | null
          commission_amount_fen: number
          commission_rate_bps: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          partner_id: string
          revenue_event_id: string
          revenue_type: string
          settlement_batch_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          available_at?: string | null
          base_amount_fen?: number
          blocked_reason?: string | null
          commission_amount_fen?: number
          commission_rate_bps?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          partner_id?: string
          revenue_event_id?: string
          revenue_type?: string
          settlement_batch_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_commission_ledger_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commission_ledger_revenue_event_id_fkey"
            columns: ["revenue_event_id"]
            isOneToOne: false
            referencedRelation: "platform_revenue_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commission_ledger_settlement_batch_fk"
            columns: ["settlement_batch_id"]
            isOneToOne: false
            referencedRelation: "partner_settlement_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_settlement_batches: {
        Row: {
          batch_no: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by_employee_id: string | null
          partner_id: string
          payment_proof_url: string | null
          payment_reference: string | null
          period_end: string
          period_start: string
          remark: string | null
          reviewed_by_employee_id: string | null
          settlement_method: string
          status: string
          total_amount_fen: number
          updated_at: string
        }
        Insert: {
          batch_no: string
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by_employee_id?: string | null
          partner_id: string
          payment_proof_url?: string | null
          payment_reference?: string | null
          period_end: string
          period_start: string
          remark?: string | null
          reviewed_by_employee_id?: string | null
          settlement_method?: string
          status?: string
          total_amount_fen?: number
          updated_at?: string
        }
        Update: {
          batch_no?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by_employee_id?: string | null
          partner_id?: string
          payment_proof_url?: string | null
          payment_reference?: string | null
          period_end?: string
          period_start?: string
          remark?: string | null
          reviewed_by_employee_id?: string | null
          settlement_method?: string
          status?: string
          total_amount_fen?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_settlement_batches_paid_by_employee_id_fkey"
            columns: ["paid_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_settlement_batches_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_settlement_batches_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_settlement_items: {
        Row: {
          amount_fen: number
          batch_id: string
          created_at: string
          id: string
          ledger_id: string
          revenue_event_id: string
        }
        Insert: {
          amount_fen: number
          batch_id: string
          created_at?: string
          id?: string
          ledger_id: string
          revenue_event_id: string
        }
        Update: {
          amount_fen?: number
          batch_id?: string
          created_at?: string
          id?: string
          ledger_id?: string
          revenue_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_settlement_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "partner_settlement_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_settlement_items_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "partner_commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_settlement_items_revenue_event_id_fkey"
            columns: ["revenue_event_id"]
            isOneToOne: false
            referencedRelation: "platform_revenue_events"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          created_at: string | null
          evidence_images: Json | null
          handled_by: string | null
          id: string
          out_trade_no: string | null
          pay_date: string | null
          payment_channel: string
          project_id: string | null
          provider: string | null
          provider_transaction_id: string | null
          remark: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          type: string | null
          workflow_task_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          evidence_images?: Json | null
          handled_by?: string | null
          id?: string
          out_trade_no?: string | null
          pay_date?: string | null
          payment_channel?: string
          project_id?: string | null
          provider?: string | null
          provider_transaction_id?: string | null
          remark?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          type?: string | null
          workflow_task_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          evidence_images?: Json | null
          handled_by?: string | null
          id?: string
          out_trade_no?: string | null
          pay_date?: string | null
          payment_channel?: string
          project_id?: string | null
          provider?: string | null
          provider_transaction_id?: string | null
          remark?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          type?: string | null
          workflow_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workflow_task_id_fkey"
            columns: ["workflow_task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          id: string
          module: string
          name: string
          resource: string
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          module: string
          name: string
          resource: string
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          module?: string
          name?: string
          resource?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      phone_identity_login_candidates: {
        Row: {
          binding_state: string
          created_at: string
          customer_id: string | null
          display_snapshot: Json
          employee_id: string | null
          id: string
          partner_id: string | null
          partner_member_id: string | null
          session_id: string
          target_mode: string
          tenant_id: string | null
        }
        Insert: {
          binding_state: string
          created_at?: string
          customer_id?: string | null
          display_snapshot: Json
          employee_id?: string | null
          id: string
          partner_id?: string | null
          partner_member_id?: string | null
          session_id: string
          target_mode: string
          tenant_id?: string | null
        }
        Update: {
          binding_state?: string
          created_at?: string
          customer_id?: string | null
          display_snapshot?: Json
          employee_id?: string | null
          id?: string
          partner_id?: string | null
          partner_member_id?: string | null
          session_id?: string
          target_mode?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_identity_login_candidates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_identity_login_candidates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_identity_login_candidates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_identity_login_candidates_partner_member_id_fkey"
            columns: ["partner_member_id"]
            isOneToOne: false
            referencedRelation: "platform_partner_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_identity_login_candidates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "phone_identity_login_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_identity_login_candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "phone_identity_login_candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_identity_login_sessions: {
        Row: {
          auth_user_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          openid_hash: string
          selected_candidate_id: string | null
          selection_token_hash: string | null
          share_context: Json
          sms_verification_code_id: string
          status: string
          updated_at: string
          verified_phone: string
        }
        Insert: {
          auth_user_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          openid_hash: string
          selected_candidate_id?: string | null
          selection_token_hash?: string | null
          share_context?: Json
          sms_verification_code_id: string
          status?: string
          updated_at?: string
          verified_phone: string
        }
        Update: {
          auth_user_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          openid_hash?: string
          selected_candidate_id?: string | null
          selection_token_hash?: string | null
          share_context?: Json
          sms_verification_code_id?: string
          status?: string
          updated_at?: string
          verified_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_identity_login_sessions_selected_candidate_fkey"
            columns: ["id", "selected_candidate_id"]
            isOneToOne: false
            referencedRelation: "phone_identity_login_candidates"
            referencedColumns: ["session_id", "id"]
          },
          {
            foreignKeyName: "phone_identity_login_sessions_sms_verification_code_id_fkey"
            columns: ["sms_verification_code_id"]
            isOneToOne: true
            referencedRelation: "sms_verification_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_asset_categories: {
        Row: {
          asset_id: string
          category_id: string
          created_at: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          category_id: string
          created_at?: string
          sort_order?: number
        }
        Update: {
          asset_id?: string
          category_id?: string
          created_at?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "picture_asset_categories_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "picture_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picture_asset_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "picture_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_asset_comment_images: {
        Row: {
          comment_id: string
          created_at: string
          file_object_id: string
          id: string
          sort_order: number
          status: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          file_object_id: string
          id?: string
          sort_order?: number
          status?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          file_object_id?: string
          id?: string
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "picture_asset_comment_images_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "picture_asset_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picture_asset_comment_images_file_object_id_fkey"
            columns: ["file_object_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_asset_comments: {
        Row: {
          asset_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          status: string
          updated_at: string
          visitor_id: string
        }
        Insert: {
          asset_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          status?: string
          updated_at?: string
          visitor_id: string
        }
        Update: {
          asset_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          status?: string
          updated_at?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picture_asset_comments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "picture_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_asset_favorites: {
        Row: {
          asset_id: string
          created_at: string
          visitor_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          visitor_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picture_asset_favorites_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "picture_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_asset_likes: {
        Row: {
          asset_id: string
          created_at: string
          visitor_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          visitor_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picture_asset_likes_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "picture_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_asset_share_events: {
        Row: {
          asset_id: string
          channel: string
          created_at: string
          id: string
          visitor_id: string | null
        }
        Insert: {
          asset_id: string
          channel: string
          created_at?: string
          id?: string
          visitor_id?: string | null
        }
        Update: {
          asset_id?: string
          channel?: string
          created_at?: string
          id?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "picture_asset_share_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "picture_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_asset_variants: {
        Row: {
          asset_id: string
          created_at: string
          file_object_id: string
          file_size: number
          height: number | null
          id: string
          mime_type: string
          object_key: string
          variant: string
          width: number | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          file_object_id: string
          file_size?: number
          height?: number | null
          id?: string
          mime_type: string
          object_key: string
          variant: string
          width?: number | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          file_object_id?: string
          file_size?: number
          height?: number | null
          id?: string
          mime_type?: string
          object_key?: string
          variant?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "picture_asset_variants_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "picture_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picture_asset_variants_file_object_id_fkey"
            columns: ["file_object_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_assets: {
        Row: {
          checksum: string | null
          comment_count: number
          created_at: string
          deleted_at: string | null
          description: string | null
          dominant_color: string | null
          favorite_count: number
          height: number | null
          id: string
          like_count: number
          original_filename: string | null
          share_count: number
          sort_order: number
          source: string
          status: string
          title: string
          updated_at: string
          width: number | null
        }
        Insert: {
          checksum?: string | null
          comment_count?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          dominant_color?: string | null
          favorite_count?: number
          height?: number | null
          id?: string
          like_count?: number
          original_filename?: string | null
          share_count?: number
          sort_order?: number
          source?: string
          status?: string
          title: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          checksum?: string | null
          comment_count?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          dominant_color?: string | null
          favorite_count?: number
          height?: number | null
          id?: string
          like_count?: number
          original_filename?: string | null
          share_count?: number
          sort_order?: number
          source?: string
          status?: string
          title?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      picture_categories: {
        Row: {
          cover_asset_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          cover_asset_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          cover_asset_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picture_categories_cover_asset_id_fkey"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "picture_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picture_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "picture_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_addon_products: {
        Row: {
          amount_fen: number | null
          code: string
          created_at: string
          enabled: boolean
          entitlement_code: string
          id: string
          name: string
          purchase_mode: string
          purchase_notes: string
          refund_policy: string
          term_years: number
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        Insert: {
          amount_fen?: number | null
          code: string
          created_at?: string
          enabled?: boolean
          entitlement_code: string
          id?: string
          name: string
          purchase_mode?: string
          purchase_notes: string
          refund_policy: string
          term_years?: number
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Update: {
          amount_fen?: number | null
          code?: string
          created_at?: string
          enabled?: boolean
          entitlement_code?: string
          id?: string
          name?: string
          purchase_mode?: string
          purchase_notes?: string
          refund_policy?: string
          term_years?: number
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_addon_products_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_logs: {
        Row: {
          action: string
          actor_employee_id: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          metadata: Json
          request_id: string | null
          resource_id: string | null
          resource_label: string | null
          resource_type: string
          status: string
          summary: string | null
          target_tenant_id: string | null
        }
        Insert: {
          action: string
          actor_employee_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          request_id?: string | null
          resource_id?: string | null
          resource_label?: string | null
          resource_type: string
          status?: string
          summary?: string | null
          target_tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_employee_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          request_id?: string | null
          resource_id?: string | null
          resource_label?: string | null
          resource_type?: string
          status?: string
          summary?: string | null
          target_tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "platform_audit_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_credit_recharge_products: {
        Row: {
          amount_fen: number
          bonus_credits: number
          code: string
          created_at: string
          created_by_employee_id: string | null
          credits: number
          enabled: boolean
          id: string
          metadata: Json
          sort_order: number
          title: string
          updated_at: string
          updated_by_employee_id: string | null
        }
        Insert: {
          amount_fen: number
          bonus_credits?: number
          code: string
          created_at?: string
          created_by_employee_id?: string | null
          credits: number
          enabled?: boolean
          id?: string
          metadata?: Json
          sort_order?: number
          title: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Update: {
          amount_fen?: number
          bonus_credits?: number
          code?: string
          created_at?: string
          created_by_employee_id?: string | null
          credits?: number
          enabled?: boolean
          id?: string
          metadata?: Json
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_credit_recharge_products_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_credit_recharge_products_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_file_objects: {
        Row: {
          bucket: string
          checksum: string | null
          created_at: string
          created_by_auth_user_id: string | null
          created_by_employee_id: string | null
          deleted_at: string | null
          height: number | null
          id: string
          legacy_path: string | null
          legacy_url: string | null
          metadata: Json
          mime_type: string
          object_key: string
          original_name: string | null
          owner_id: string | null
          owner_type: string
          owner_visitor_id: string | null
          provider: string
          public_url: string | null
          region: string | null
          scene: string
          size_bytes: number
          status: string
          tenant_id: string | null
          updated_at: string
          visibility: string
          width: number | null
        }
        Insert: {
          bucket: string
          checksum?: string | null
          created_at?: string
          created_by_auth_user_id?: string | null
          created_by_employee_id?: string | null
          deleted_at?: string | null
          height?: number | null
          id?: string
          legacy_path?: string | null
          legacy_url?: string | null
          metadata?: Json
          mime_type: string
          object_key: string
          original_name?: string | null
          owner_id?: string | null
          owner_type: string
          owner_visitor_id?: string | null
          provider?: string
          public_url?: string | null
          region?: string | null
          scene: string
          size_bytes?: number
          status?: string
          tenant_id?: string | null
          updated_at?: string
          visibility?: string
          width?: number | null
        }
        Update: {
          bucket?: string
          checksum?: string | null
          created_at?: string
          created_by_auth_user_id?: string | null
          created_by_employee_id?: string | null
          deleted_at?: string | null
          height?: number | null
          id?: string
          legacy_path?: string | null
          legacy_url?: string | null
          metadata?: Json
          mime_type?: string
          object_key?: string
          original_name?: string | null
          owner_id?: string | null
          owner_type?: string
          owner_visitor_id?: string | null
          provider?: string
          public_url?: string | null
          region?: string | null
          scene?: string
          size_bytes?: number
          status?: string
          tenant_id?: string | null
          updated_at?: string
          visibility?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_file_objects_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_file_objects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "platform_file_objects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_lead_assign_logs: {
        Row: {
          action: string
          assigned_customer_id: string | null
          created_at: string
          dedupe_result: string | null
          id: string
          note: string | null
          operator_employee_id: string | null
          platform_lead_id: string
          target_tenant_id: string | null
        }
        Insert: {
          action: string
          assigned_customer_id?: string | null
          created_at?: string
          dedupe_result?: string | null
          id?: string
          note?: string | null
          operator_employee_id?: string | null
          platform_lead_id: string
          target_tenant_id?: string | null
        }
        Update: {
          action?: string
          assigned_customer_id?: string | null
          created_at?: string
          dedupe_result?: string | null
          id?: string
          note?: string | null
          operator_employee_id?: string | null
          platform_lead_id?: string
          target_tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_lead_assign_logs_assigned_customer_id_fkey"
            columns: ["assigned_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_lead_assign_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_lead_assign_logs_platform_lead_id_fkey"
            columns: ["platform_lead_id"]
            isOneToOne: false
            referencedRelation: "platform_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_lead_assign_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "platform_lead_assign_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_leads: {
        Row: {
          area: number | null
          assigned_at: string | null
          assigned_by_employee_id: string | null
          assigned_customer_id: string | null
          assigned_note: string | null
          assigned_tenant_id: string | null
          auth_user_id: string | null
          budget: string | null
          city: string | null
          community: string | null
          created_at: string
          description: string | null
          id: string
          name: string | null
          phone: string
          project_id: string | null
          source: string
          source_context: Json
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          area?: number | null
          assigned_at?: string | null
          assigned_by_employee_id?: string | null
          assigned_customer_id?: string | null
          assigned_note?: string | null
          assigned_tenant_id?: string | null
          auth_user_id?: string | null
          budget?: string | null
          city?: string | null
          community?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string | null
          phone: string
          project_id?: string | null
          source?: string
          source_context?: Json
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          area?: number | null
          assigned_at?: string | null
          assigned_by_employee_id?: string | null
          assigned_customer_id?: string | null
          assigned_note?: string | null
          assigned_tenant_id?: string | null
          auth_user_id?: string | null
          budget?: string | null
          city?: string | null
          community?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string | null
          phone?: string
          project_id?: string | null
          source?: string
          source_context?: Json
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_leads_assigned_by_employee_id_fkey"
            columns: ["assigned_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_leads_assigned_customer_id_fkey"
            columns: ["assigned_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_leads_assigned_tenant_id_fkey"
            columns: ["assigned_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "platform_leads_assigned_tenant_id_fkey"
            columns: ["assigned_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "platform_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_partner_applications: {
        Row: {
          applicant_name: string
          application_no: string
          business_description: string | null
          contact_name: string
          converted_partner_id: string | null
          created_at: string
          id: string
          message: string | null
          metadata: Json
          phone: string
          region_codes: string[]
          region_name: string | null
          resource_description: string | null
          review_remark: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          source_channel: string
          source_url: string | null
          status: string
          subject_type: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          applicant_name: string
          application_no: string
          business_description?: string | null
          contact_name: string
          converted_partner_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          phone: string
          region_codes?: string[]
          region_name?: string | null
          resource_description?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          source_channel?: string
          source_url?: string | null
          status?: string
          subject_type: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          applicant_name?: string
          application_no?: string
          business_description?: string | null
          contact_name?: string
          converted_partner_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          phone?: string
          region_codes?: string[]
          region_name?: string | null
          resource_description?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          source_channel?: string
          source_url?: string | null
          status?: string
          subject_type?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_partner_applications_converted_partner_id_fkey"
            columns: ["converted_partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_partner_applications_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_partner_invite_codes: {
        Row: {
          approved_count: number
          campaign_code: string | null
          code: string
          created_at: string
          created_by_employee_id: string | null
          expires_at: string | null
          id: string
          partner_id: string
          region_code: string | null
          scan_count: number
          status: string
          submitted_count: number
          updated_at: string
        }
        Insert: {
          approved_count?: number
          campaign_code?: string | null
          code: string
          created_at?: string
          created_by_employee_id?: string | null
          expires_at?: string | null
          id?: string
          partner_id: string
          region_code?: string | null
          scan_count?: number
          status?: string
          submitted_count?: number
          updated_at?: string
        }
        Update: {
          approved_count?: number
          campaign_code?: string | null
          code?: string
          created_at?: string
          created_by_employee_id?: string | null
          expires_at?: string | null
          id?: string
          partner_id?: string
          region_code?: string | null
          scan_count?: number
          status?: string
          submitted_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_partner_invite_codes_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_partner_invite_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_partner_levels: {
        Row: {
          code: string
          created_at: string
          effective_at: string
          expired_at: string | null
          id: string
          lead_service_fee_commission_bps: number
          lead_service_fee_default_rate_bps: number
          name: string
          requirements: Json
          settlement_cycle: string
          settlement_method: string
          sort_order: number
          status: string
          tenant_recharge_commission_bps: number
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          effective_at?: string
          expired_at?: string | null
          id?: string
          lead_service_fee_commission_bps: number
          lead_service_fee_default_rate_bps?: number
          name: string
          requirements?: Json
          settlement_cycle?: string
          settlement_method?: string
          sort_order?: number
          status?: string
          tenant_recharge_commission_bps: number
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          effective_at?: string
          expired_at?: string | null
          id?: string
          lead_service_fee_commission_bps?: number
          lead_service_fee_default_rate_bps?: number
          name?: string
          requirements?: Json
          settlement_cycle?: string
          settlement_method?: string
          sort_order?: number
          status?: string
          tenant_recharge_commission_bps?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      platform_partner_member_rebind_requests: {
        Row: {
          applicant_name: string | null
          created_at: string
          id: string
          member_id: string
          new_auth_user_id: string
          old_auth_user_id: string
          partner_id: string
          phone: string
          reason: string | null
          review_comment: string | null
          reviewed_at: string | null
          reviewer_employee_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applicant_name?: string | null
          created_at?: string
          id?: string
          member_id: string
          new_auth_user_id: string
          old_auth_user_id: string
          partner_id: string
          phone: string
          reason?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewer_employee_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_name?: string | null
          created_at?: string
          id?: string
          member_id?: string
          new_auth_user_id?: string
          old_auth_user_id?: string
          partner_id?: string
          phone?: string
          reason?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewer_employee_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_partner_member_rebind_reques_reviewer_employee_id_fkey"
            columns: ["reviewer_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_partner_member_rebind_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "platform_partner_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_partner_member_rebind_requests_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_partner_members: {
        Row: {
          auth_user_id: string | null
          created_at: string
          created_by_employee_id: string | null
          id: string
          name: string
          partner_id: string
          phone: string
          remark: string | null
          role: string
          status: string
          updated_at: string
          updated_by_employee_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          name: string
          partner_id: string
          phone: string
          remark?: string | null
          role?: string
          status?: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          name?: string
          partner_id?: string
          phone?: string
          remark?: string | null
          role?: string
          status?: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_partner_members_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_partner_members_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_partners: {
        Row: {
          contact_name: string
          contract_status: string
          created_at: string
          created_by_employee_id: string | null
          id: string
          level_id: string
          name: string
          phone: string
          region_codes: string[]
          region_version: number
          remark: string | null
          settlement_account: Json
          settlement_account_status: string
          status: string
          subject_type: string
          updated_at: string
          updated_by_employee_id: string | null
        }
        Insert: {
          contact_name: string
          contract_status?: string
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          level_id: string
          name: string
          phone: string
          region_codes?: string[]
          region_version?: number
          remark?: string | null
          settlement_account?: Json
          settlement_account_status?: string
          status?: string
          subject_type: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Update: {
          contact_name?: string
          contract_status?: string
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          level_id?: string
          name?: string
          phone?: string
          region_codes?: string[]
          region_version?: number
          remark?: string | null
          settlement_account?: Json
          settlement_account_status?: string
          status?: string
          subject_type?: string
          updated_at?: string
          updated_by_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_partners_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_partners_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "platform_partner_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_partners_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_configs: {
        Row: {
          app_id: string | null
          created_at: string
          created_by_employee_id: string | null
          enabled_channels: string[]
          encrypted_config_ref: string | null
          id: string
          last_validated_at: string | null
          last_validation_error_code: string | null
          last_validation_error_message: string | null
          last_validation_request_id: string | null
          merchant_id: string | null
          merchant_mode: string
          merchant_name: string | null
          notify_url: string | null
          principal_type: string
          profile_code: string
          provider: string
          recharge_guard_version: number
          risk_switches: Json
          secret_bundle_revision: string | null
          serial_no: string | null
          status: string
          sub_app_id: string | null
          sub_merchant_id: string | null
          updated_at: string
          updated_by_employee_id: string | null
          validation_status: string
        }
        Insert: {
          app_id?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          enabled_channels?: string[]
          encrypted_config_ref?: string | null
          id?: string
          last_validated_at?: string | null
          last_validation_error_code?: string | null
          last_validation_error_message?: string | null
          last_validation_request_id?: string | null
          merchant_id?: string | null
          merchant_mode?: string
          merchant_name?: string | null
          notify_url?: string | null
          principal_type?: string
          profile_code?: string
          provider?: string
          recharge_guard_version?: number
          risk_switches?: Json
          secret_bundle_revision?: string | null
          serial_no?: string | null
          status?: string
          sub_app_id?: string | null
          sub_merchant_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          validation_status?: string
        }
        Update: {
          app_id?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          enabled_channels?: string[]
          encrypted_config_ref?: string | null
          id?: string
          last_validated_at?: string | null
          last_validation_error_code?: string | null
          last_validation_error_message?: string | null
          last_validation_request_id?: string | null
          merchant_id?: string | null
          merchant_mode?: string
          merchant_name?: string | null
          notify_url?: string | null
          principal_type?: string
          profile_code?: string
          provider?: string
          recharge_guard_version?: number
          risk_switches?: Json
          secret_bundle_revision?: string | null
          serial_no?: string | null
          status?: string
          sub_app_id?: string | null
          sub_merchant_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_payment_configs_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_payment_configs_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_revenue_events: {
        Row: {
          binding_id: string | null
          commission_rate_bps: number
          confirmed_at: string | null
          created_at: string
          created_by_employee_id: string | null
          gross_amount_fen: number
          id: string
          metadata: Json
          paid_amount_fen: number
          paid_at: string | null
          partner_id: string | null
          partner_level_id: string | null
          refundable_until: string | null
          revenue_amount_fen: number
          revenue_type: string
          service_fee_rate_bps: number | null
          source_id: string
          source_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          binding_id?: string | null
          commission_rate_bps: number
          confirmed_at?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          gross_amount_fen: number
          id?: string
          metadata?: Json
          paid_amount_fen?: number
          paid_at?: string | null
          partner_id?: string | null
          partner_level_id?: string | null
          refundable_until?: string | null
          revenue_amount_fen: number
          revenue_type: string
          service_fee_rate_bps?: number | null
          source_id: string
          source_type: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          binding_id?: string | null
          commission_rate_bps?: number
          confirmed_at?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          gross_amount_fen?: number
          id?: string
          metadata?: Json
          paid_amount_fen?: number
          paid_at?: string | null
          partner_id?: string | null
          partner_level_id?: string | null
          refundable_until?: string | null
          revenue_amount_fen?: number
          revenue_type?: string
          service_fee_rate_bps?: number | null
          source_id?: string
          source_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_revenue_events_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "tenant_partner_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_revenue_events_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_revenue_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_revenue_events_partner_level_id_fkey"
            columns: ["partner_level_id"]
            isOneToOne: false
            referencedRelation: "platform_partner_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_revenue_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "platform_revenue_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_service_product_versions: {
        Row: {
          amount_fen: number
          id: string
          list_amount_fen: number
          product_id: string
          published_at: string
          published_by_employee_id: string | null
          service_scope: Json
          term_years: number
          terms_content: string
          terms_version: number
          title: string
          version: number
        }
        Insert: {
          amount_fen: number
          id?: string
          list_amount_fen: number
          product_id: string
          published_at?: string
          published_by_employee_id?: string | null
          service_scope: Json
          term_years: number
          terms_content: string
          terms_version: number
          title: string
          version: number
        }
        Update: {
          amount_fen?: number
          id?: string
          list_amount_fen?: number
          product_id?: string
          published_at?: string
          published_by_employee_id?: string | null
          service_scope?: Json
          term_years?: number
          terms_content?: string
          terms_version?: number
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_service_product_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "platform_service_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_service_product_versions_published_by_employee_id_fkey"
            columns: ["published_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_service_products: {
        Row: {
          amount_fen: number
          code: string
          created_at: string
          created_by_employee_id: string | null
          id: string
          list_amount_fen: number
          published_version_id: string | null
          service_scope: Json
          sort_order: number
          status: string
          term_years: number
          terms_content: string
          terms_version: number
          title: string
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        Insert: {
          amount_fen: number
          code: string
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          list_amount_fen: number
          published_version_id?: string | null
          service_scope?: Json
          sort_order?: number
          status?: string
          term_years: number
          terms_content: string
          terms_version?: number
          title: string
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Update: {
          amount_fen?: number
          code?: string
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          list_amount_fen?: number
          published_version_id?: string | null
          service_scope?: Json
          sort_order?: number
          status?: string
          term_years?: number
          terms_content?: string
          terms_version?: number
          title?: string
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_service_products_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_service_products_published_version_fkey"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "platform_service_product_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_service_products_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_service_trial_operations_state: {
        Row: {
          cutover_at: string
          singleton: boolean
        }
        Insert: {
          cutover_at: string
          singleton?: boolean
        }
        Update: {
          cutover_at?: string
          singleton?: boolean
        }
        Relationships: []
      }
      platform_service_trial_policies: {
        Row: {
          allow_repeat: boolean
          change_reason: string | null
          created_at: string
          created_by_employee_id: string | null
          grace_days: number
          guided_scope: Json
          id: string
          is_current: boolean
          max_extension_count: number
          max_extension_days: number
          max_grace_days: number
          max_schedule_days: number
          max_trial_days: number
          reapply_cooldown_days: number
          reminder_days: number[]
          standard_scope: Json
          trial_days: number
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        Insert: {
          allow_repeat?: boolean
          change_reason?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          grace_days?: number
          guided_scope: Json
          id?: string
          is_current?: boolean
          max_extension_count?: number
          max_extension_days?: number
          max_grace_days?: number
          max_schedule_days?: number
          max_trial_days?: number
          reapply_cooldown_days?: number
          reminder_days?: number[]
          standard_scope: Json
          trial_days?: number
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Update: {
          allow_repeat?: boolean
          change_reason?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          grace_days?: number
          guided_scope?: Json
          id?: string
          is_current?: boolean
          max_extension_count?: number
          max_extension_days?: number
          max_grace_days?: number
          max_schedule_days?: number
          max_trial_days?: number
          reapply_cooldown_days?: number
          reminder_days?: number[]
          standard_scope?: Json
          trial_days?: number
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_service_trial_policies_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_service_trial_policies_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_virtual_goods_operations: {
        Row: {
          channel_id: string
          failure_code: string | null
          failure_summary: string | null
          finished_at: string | null
          id: string
          last_queried_at: string | null
          mapping_id: string
          normalized_result: Json
          phase: string
          product_id: string
          product_version: number
          request_id: string | null
          request_snapshot_hash: string
          started_at: string
          state: string
        }
        Insert: {
          channel_id: string
          failure_code?: string | null
          failure_summary?: string | null
          finished_at?: string | null
          id?: string
          last_queried_at?: string | null
          mapping_id: string
          normalized_result?: Json
          phase: string
          product_id: string
          product_version: number
          request_id?: string | null
          request_snapshot_hash: string
          started_at?: string
          state: string
        }
        Update: {
          channel_id?: string
          failure_code?: string | null
          failure_summary?: string | null
          finished_at?: string | null
          id?: string
          last_queried_at?: string | null
          mapping_id?: string
          normalized_result?: Json
          phase?: string
          product_id?: string
          product_version?: number
          request_id?: string | null
          request_snapshot_hash?: string
          started_at?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_virtual_goods_operations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "platform_virtual_payment_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_goods_operations_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "platform_virtual_product_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_goods_operations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "platform_virtual_products"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_virtual_payment_channels: {
        Row: {
          app_id: string
          created_at: string
          created_by_employee_id: string
          encrypted_secret_ref: string
          environment: string
          id: string
          message_auth_status: string
          offer_id: string
          provider: string
          secret_revision: number
          status: string
          updated_at: string
          updated_by_employee_id: string
          version: number
          virtual_merchant_id: string
        }
        Insert: {
          app_id: string
          created_at?: string
          created_by_employee_id: string
          encrypted_secret_ref: string
          environment: string
          id?: string
          message_auth_status?: string
          offer_id: string
          provider: string
          secret_revision: number
          status?: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
          virtual_merchant_id: string
        }
        Update: {
          app_id?: string
          created_at?: string
          created_by_employee_id?: string
          encrypted_secret_ref?: string
          environment?: string
          id?: string
          message_auth_status?: string
          offer_id?: string
          provider?: string
          secret_revision?: number
          status?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
          virtual_merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_virtual_payment_channels_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_payment_channels_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_virtual_payment_products: {
        Row: {
          addon_product_id: string
          app_id: string
          created_at: string
          created_by: string | null
          encrypted_secret_ref: string
          environment: string
          expected_amount_fen: number
          goods_quantity: number
          id: string
          item_url: string | null
          offer_id: string
          provider: string
          provider_product_id: string
          secret_revision: number
          status: string
          updated_at: string
          updated_by: string | null
          validated_at: string | null
          validation_status: string
          version: number
          virtual_merchant_id: string
        }
        Insert: {
          addon_product_id: string
          app_id: string
          created_at?: string
          created_by?: string | null
          encrypted_secret_ref: string
          environment: string
          expected_amount_fen: number
          goods_quantity?: number
          id?: string
          item_url?: string | null
          offer_id: string
          provider?: string
          provider_product_id: string
          secret_revision: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          validated_at?: string | null
          validation_status?: string
          version?: number
          virtual_merchant_id: string
        }
        Update: {
          addon_product_id?: string
          app_id?: string
          created_at?: string
          created_by?: string | null
          encrypted_secret_ref?: string
          environment?: string
          expected_amount_fen?: number
          goods_quantity?: number
          id?: string
          item_url?: string | null
          offer_id?: string
          provider?: string
          provider_product_id?: string
          secret_revision?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          validated_at?: string | null
          validation_status?: string
          version?: number
          virtual_merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_virtual_payment_products_addon_product_id_fkey"
            columns: ["addon_product_id"]
            isOneToOne: false
            referencedRelation: "platform_addon_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_payment_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_payment_products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_virtual_product_grant_rules: {
        Row: {
          benefit_type: string
          created_at: string
          duration_unit: string | null
          duration_value: number | null
          entitlement_code: string
          expiry_mode: string
          expiry_unit: string | null
          expiry_value: number | null
          grant_amount: number | null
          product_id: string
          updated_at: string
          version: number
        }
        Insert: {
          benefit_type: string
          created_at?: string
          duration_unit?: string | null
          duration_value?: number | null
          entitlement_code: string
          expiry_mode: string
          expiry_unit?: string | null
          expiry_value?: number | null
          grant_amount?: number | null
          product_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          benefit_type?: string
          created_at?: string
          duration_unit?: string | null
          duration_value?: number | null
          entitlement_code?: string
          expiry_mode?: string
          expiry_unit?: string | null
          expiry_value?: number | null
          grant_amount?: number | null
          product_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_virtual_product_grant_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "platform_virtual_products"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_virtual_product_mappings: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          last_error_code: string | null
          last_error_summary: string | null
          last_operation_id: string | null
          last_request_id: string | null
          product_id: string
          provider_product_id: string
          publish_state: string
          remote_snapshot: Json
          synced_product_version: number | null
          updated_at: string
          upload_state: string
          validation_status: string
          version: number
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          last_error_code?: string | null
          last_error_summary?: string | null
          last_operation_id?: string | null
          last_request_id?: string | null
          product_id: string
          provider_product_id: string
          publish_state?: string
          remote_snapshot?: Json
          synced_product_version?: number | null
          updated_at?: string
          upload_state?: string
          validation_status?: string
          version?: number
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          last_error_code?: string | null
          last_error_summary?: string | null
          last_operation_id?: string | null
          last_request_id?: string | null
          product_id?: string
          provider_product_id?: string
          publish_state?: string
          remote_snapshot?: Json
          synced_product_version?: number | null
          updated_at?: string
          upload_state?: string
          validation_status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_virtual_product_mappings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "platform_virtual_payment_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_product_mappings_last_operation_fkey"
            columns: ["last_operation_id"]
            isOneToOne: false
            referencedRelation: "platform_virtual_goods_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "platform_virtual_products"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_virtual_products: {
        Row: {
          amount_fen: number
          code: string
          created_at: string
          created_by_employee_id: string
          currency: string
          id: string
          image_file_id: string | null
          name: string
          product_type: string
          purchase_notes: string
          refund_template: string
          status: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          amount_fen: number
          code: string
          created_at?: string
          created_by_employee_id: string
          currency?: string
          id?: string
          image_file_id?: string | null
          name: string
          product_type: string
          purchase_notes?: string
          refund_template: string
          status?: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          amount_fen?: number
          code?: string
          created_at?: string
          created_by_employee_id?: string
          currency?: string
          id?: string
          image_file_id?: string | null
          name?: string
          product_type?: string
          purchase_notes?: string
          refund_template?: string
          status?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_virtual_products_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_products_image_file_id_fkey"
            columns: ["image_file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_virtual_products_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          base_salary: number | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          salary_type: string | null
          sort: number | null
          status: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          base_salary?: number | null
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          salary_type?: string | null
          sort?: number | null
          status?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          base_salary?: number | null
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          salary_type?: string | null
          sort?: number | null
          status?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_acceptance_actions: {
        Row: {
          acceptance_id: string
          action: string
          comment: string | null
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          operator_id: string | null
          operator_type: string
          tenant_id: string | null
          to_status: string
        }
        Insert: {
          acceptance_id: string
          action: string
          comment?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          operator_id?: string | null
          operator_type: string
          tenant_id?: string | null
          to_status: string
        }
        Update: {
          acceptance_id?: string
          action?: string
          comment?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          operator_id?: string | null
          operator_type?: string
          tenant_id?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_acceptance_actions_acceptance_id_fkey"
            columns: ["acceptance_id"]
            isOneToOne: false
            referencedRelation: "project_acceptances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_acceptance_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_acceptance_items: {
        Row: {
          acceptance_id: string
          allow_not_applicable: boolean
          category: string | null
          created_at: string
          id: string
          images: Json
          photo_max_count: number
          photo_min_count: number
          photo_required: boolean
          rectification_images: Json
          rectification_remark: string | null
          remark: string | null
          remark_required_on_fail: boolean
          required: boolean
          result: string | null
          section_id: string | null
          sort_order: number
          standard: string
          template_item_id: string | null
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          acceptance_id: string
          allow_not_applicable?: boolean
          category?: string | null
          created_at?: string
          id?: string
          images?: Json
          photo_max_count?: number
          photo_min_count?: number
          photo_required?: boolean
          rectification_images?: Json
          rectification_remark?: string | null
          remark?: string | null
          remark_required_on_fail?: boolean
          required?: boolean
          result?: string | null
          section_id?: string | null
          sort_order?: number
          standard: string
          template_item_id?: string | null
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          acceptance_id?: string
          allow_not_applicable?: boolean
          category?: string | null
          created_at?: string
          id?: string
          images?: Json
          photo_max_count?: number
          photo_min_count?: number
          photo_required?: boolean
          rectification_images?: Json
          rectification_remark?: string | null
          remark?: string | null
          remark_required_on_fail?: boolean
          required?: boolean
          result?: string | null
          section_id?: string | null
          sort_order?: number
          standard?: string
          template_item_id?: string | null
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_acceptance_items_acceptance_id_fkey"
            columns: ["acceptance_id"]
            isOneToOne: false
            referencedRelation: "project_acceptances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "project_acceptance_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "project_acceptance_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_acceptance_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_acceptance_open_tickets: {
        Row: {
          acceptance_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          expire_at: string
          id: string
          last_verified_at: string | null
          link_type: string | null
          link_url: string | null
          phone: string
          project_id: string
          scene: string
          send_error: string | null
          send_status: string | null
          sent_at: string | null
          status: string
          tenant_id: string | null
          ticket: string
          updated_at: string
          used_at: string | null
          verify_count: number
        }
        Insert: {
          acceptance_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          expire_at: string
          id?: string
          last_verified_at?: string | null
          link_type?: string | null
          link_url?: string | null
          phone: string
          project_id: string
          scene?: string
          send_error?: string | null
          send_status?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
          ticket: string
          updated_at?: string
          used_at?: string | null
          verify_count?: number
        }
        Update: {
          acceptance_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          expire_at?: string
          id?: string
          last_verified_at?: string | null
          link_type?: string | null
          link_url?: string | null
          phone?: string
          project_id?: string
          scene?: string
          send_error?: string | null
          send_status?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
          ticket?: string
          updated_at?: string
          used_at?: string | null
          verify_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_acceptance_open_tickets_acceptance_id_fkey"
            columns: ["acceptance_id"]
            isOneToOne: false
            referencedRelation: "project_acceptances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_open_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_open_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_open_tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_open_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_acceptance_open_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_acceptance_template_items: {
        Row: {
          allow_not_applicable: boolean
          category: string | null
          created_at: string
          id: string
          input_type: string
          options: Json | null
          photo_max_count: number
          photo_min_count: number
          photo_required: boolean
          remark_required_on_fail: boolean
          required: boolean
          section_id: string | null
          sort_order: number
          standard: string
          status: string
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          allow_not_applicable?: boolean
          category?: string | null
          created_at?: string
          id?: string
          input_type?: string
          options?: Json | null
          photo_max_count?: number
          photo_min_count?: number
          photo_required?: boolean
          remark_required_on_fail?: boolean
          required?: boolean
          section_id?: string | null
          sort_order?: number
          standard: string
          status?: string
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          allow_not_applicable?: boolean
          category?: string | null
          created_at?: string
          id?: string
          input_type?: string
          options?: Json | null
          photo_max_count?: number
          photo_min_count?: number
          photo_required?: boolean
          remark_required_on_fail?: boolean
          required?: boolean
          section_id?: string | null
          sort_order?: number
          standard?: string
          status?: string
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_acceptance_template_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "project_acceptance_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptance_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_acceptance_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_acceptance_template_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          sort_order: number
          status: string
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          status?: string
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          status?: string
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_acceptance_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_acceptance_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_acceptance_templates: {
        Row: {
          acceptance_type: string
          created_at: string
          description: string | null
          id: string
          is_builtin: boolean
          name: string
          project_type: string | null
          sort_order: number
          stage_code: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          acceptance_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_builtin?: boolean
          name: string
          project_type?: string | null
          sort_order?: number
          stage_code: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          acceptance_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
          project_type?: string | null
          sort_order?: number
          stage_code?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      project_acceptances: {
        Row: {
          acceptance_type: string
          completed_at: string | null
          created_at: string
          customer_confirmed_at: string | null
          customer_id: string | null
          id: string
          initiator_id: string
          project_id: string
          reject_reason: string | null
          reject_source: string | null
          rejected_at: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          stage_code: string
          status: string
          submitted_at: string | null
          summary: string | null
          template_id: string | null
          template_snapshot: Json | null
          template_version: number
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          acceptance_type?: string
          completed_at?: string | null
          created_at?: string
          customer_confirmed_at?: string | null
          customer_id?: string | null
          id?: string
          initiator_id: string
          project_id: string
          reject_reason?: string | null
          reject_source?: string | null
          rejected_at?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          stage_code: string
          status?: string
          submitted_at?: string | null
          summary?: string | null
          template_id?: string | null
          template_snapshot?: Json | null
          template_version?: number
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          acceptance_type?: string
          completed_at?: string | null
          created_at?: string
          customer_confirmed_at?: string | null
          customer_id?: string | null
          id?: string
          initiator_id?: string
          project_id?: string
          reject_reason?: string | null
          reject_source?: string | null
          rejected_at?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          stage_code?: string
          status?: string
          submitted_at?: string | null
          summary?: string | null
          template_id?: string | null
          template_snapshot?: Json | null
          template_version?: number
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_acceptances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptances_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptances_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_acceptance_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_acceptances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cameras: {
        Row: {
          can_control: boolean
          can_view: boolean
          capabilities: Json
          channel_no: number
          cover_url: string | null
          created_at: string
          deleted_at: string | null
          id: string
          last_status_checked_at: string | null
          last_status_error: string | null
          name: string
          play_protocol: string
          position: string | null
          project_id: string
          remark: string | null
          sort_order: number
          status: string
          tenant_id: string | null
          updated_at: string
          vendor: string
          vendor_channel_code: string | null
          vendor_channel_id: string | null
          vendor_device_code: string | null
          vendor_device_serial: string
          video_encrypted: boolean
        }
        Insert: {
          can_control?: boolean
          can_view?: boolean
          capabilities?: Json
          channel_no?: number
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_status_checked_at?: string | null
          last_status_error?: string | null
          name: string
          play_protocol?: string
          position?: string | null
          project_id: string
          remark?: string | null
          sort_order?: number
          status?: string
          tenant_id?: string | null
          updated_at?: string
          vendor?: string
          vendor_channel_code?: string | null
          vendor_channel_id?: string | null
          vendor_device_code?: string | null
          vendor_device_serial: string
          video_encrypted?: boolean
        }
        Update: {
          can_control?: boolean
          can_view?: boolean
          capabilities?: Json
          channel_no?: number
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_status_checked_at?: string | null
          last_status_error?: string | null
          name?: string
          play_protocol?: string
          position?: string | null
          project_id?: string
          remark?: string | null
          sort_order?: number
          status?: string
          tenant_id?: string | null
          updated_at?: string
          vendor?: string
          vendor_channel_code?: string | null
          vendor_channel_id?: string | null
          vendor_device_code?: string | null
          vendor_device_serial?: string
          video_encrypted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_cameras_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cameras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_cameras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cost_budgets: {
        Row: {
          budget_amount: number
          cost_category_id: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          project_id: string
          remark: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          warning_threshold_percent: number
        }
        Insert: {
          budget_amount?: number
          cost_category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          project_id: string
          remark?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          warning_threshold_percent?: number
        }
        Update: {
          budget_amount?: number
          cost_category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          remark?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          warning_threshold_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_budgets_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_cost_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_budgets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cost_commitments: {
        Row: {
          amount: number
          available_amount_snapshot: number
          budget_amount_snapshot: number
          consumed_at: string | null
          cost_category_id: string
          created_at: string
          created_by_employee_id: string
          expense_amount_snapshot: number
          id: string
          other_commitment_amount_snapshot: number
          project_id: string
          recognized_amount: number
          release_reason: string | null
          released_at: string | null
          released_by_employee_id: string | null
          source_id: string
          source_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          available_amount_snapshot: number
          budget_amount_snapshot: number
          consumed_at?: string | null
          cost_category_id: string
          created_at?: string
          created_by_employee_id: string
          expense_amount_snapshot: number
          id?: string
          other_commitment_amount_snapshot: number
          project_id: string
          recognized_amount?: number
          release_reason?: string | null
          released_at?: string | null
          released_by_employee_id?: string | null
          source_id: string
          source_type?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          available_amount_snapshot?: number
          budget_amount_snapshot?: number
          consumed_at?: string | null
          cost_category_id?: string
          created_at?: string
          created_by_employee_id?: string
          expense_amount_snapshot?: number
          id?: string
          other_commitment_amount_snapshot?: number
          project_id?: string
          recognized_amount?: number
          release_reason?: string | null
          released_at?: string | null
          released_by_employee_id?: string | null
          source_id?: string
          source_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_commitments_category_tenant_fkey"
            columns: ["cost_category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_commitments_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_commitments_project_tenant_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_commitments_released_by_employee_id_fkey"
            columns: ["released_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_commitments_source_tenant_fkey"
            columns: ["source_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_requisitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_commitments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_cost_commitments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cost_events: {
        Row: {
          accepted_quantity: number
          amount: number
          cost_category_id: string
          created_at: string
          created_by_employee_id: string
          currency: string
          id: string
          occurred_at: string
          project_id: string
          purchase_requisition_id: string | null
          source_id: string
          source_type: string
          supplier_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          supplier_purchase_order_receipt_id: string
          supplier_purchase_order_receipt_item_id: string
          tenant_id: string
          tenant_supplier_id: string
        }
        Insert: {
          accepted_quantity: number
          amount: number
          cost_category_id: string
          created_at?: string
          created_by_employee_id: string
          currency?: string
          id?: string
          occurred_at: string
          project_id: string
          purchase_requisition_id?: string | null
          source_id: string
          source_type?: string
          supplier_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          supplier_purchase_order_receipt_id: string
          supplier_purchase_order_receipt_item_id: string
          tenant_id: string
          tenant_supplier_id: string
        }
        Update: {
          accepted_quantity?: number
          amount?: number
          cost_category_id?: string
          created_at?: string
          created_by_employee_id?: string
          currency?: string
          id?: string
          occurred_at?: string
          project_id?: string
          purchase_requisition_id?: string | null
          source_id?: string
          source_type?: string
          supplier_id?: string
          supplier_purchase_order_id?: string
          supplier_purchase_order_item_id?: string
          supplier_purchase_order_receipt_id?: string
          supplier_purchase_order_receipt_item_id?: string
          tenant_id?: string
          tenant_supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_events_category_tenant_fkey"
            columns: ["cost_category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_events_created_employee_tenant_fkey"
            columns: ["created_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_events_item_tenant_order_fkey"
            columns: [
              "supplier_purchase_order_item_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_items"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "project_cost_events_order_tenant_supplier_fkey"
            columns: ["supplier_purchase_order_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_orders"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "project_cost_events_project_tenant_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_events_receipt_item_tenant_chain_fkey"
            columns: [
              "supplier_purchase_order_receipt_item_id",
              "tenant_id",
              "supplier_purchase_order_receipt_id",
              "supplier_purchase_order_id",
              "supplier_purchase_order_item_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_receipt_items"
            referencedColumns: [
              "id",
              "tenant_id",
              "receipt_id",
              "supplier_purchase_order_id",
              "supplier_purchase_order_item_id",
            ]
          },
          {
            foreignKeyName: "project_cost_events_receipt_tenant_order_fkey"
            columns: [
              "supplier_purchase_order_receipt_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_receipts"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "project_cost_events_relationship_tenant_supplier_fkey"
            columns: ["tenant_supplier_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "project_cost_events_requisition_tenant_fkey"
            columns: ["purchase_requisition_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_requisitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_cost_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_log_comments: {
        Row: {
          author_id: string
          author_type: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          images: string[]
          log_id: string
          parent_id: string | null
          rating: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          author_id: string
          author_type: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          images?: string[]
          log_id: string
          parent_id?: string | null
          rating?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          author_type?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          images?: string[]
          log_id?: string
          parent_id?: string | null
          rating?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_log_comments_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "project_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_log_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_log_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_log_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_log_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_logs: {
        Row: {
          content: string | null
          created_at: string
          employee_id: string
          id: string
          images: Json | null
          node_name: string | null
          project_id: string
          stage_code: string | null
          tenant_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          employee_id: string
          id?: string
          images?: Json | null
          node_name?: string | null
          project_id: string
          stage_code?: string | null
          tenant_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          images?: Json | null
          node_name?: string | null
          project_id?: string
          stage_code?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_member_role_post_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          post_code: string
          role_code: string
          sort: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          post_code: string
          role_code: string
          sort?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          post_code?: string
          role_code?: string
          sort?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_member_role_post_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_member_role_post_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          deleted_at: string | null
          employee_id: string
          id: string
          is_primary: boolean
          project_id: string
          role_code: string
          role_name: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean
          project_id: string
          role_code: string
          role_name?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean
          project_id?: string
          role_code?: string
          role_name?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_procedure_assignment_logs: {
        Row: {
          action: string
          after_snapshot: Json
          assignment_id: string
          before_snapshot: Json | null
          created_at: string
          id: string
          operator_employee_id: string | null
          project_id: string
          reason: string | null
          tenant_id: string
          workflow_instance_id: string
          workflow_instance_node_id: string | null
        }
        Insert: {
          action: string
          after_snapshot: Json
          assignment_id: string
          before_snapshot?: Json | null
          created_at?: string
          id?: string
          operator_employee_id?: string | null
          project_id: string
          reason?: string | null
          tenant_id: string
          workflow_instance_id: string
          workflow_instance_node_id?: string | null
        }
        Update: {
          action?: string
          after_snapshot?: Json
          assignment_id?: string
          before_snapshot?: Json | null
          created_at?: string
          id?: string
          operator_employee_id?: string | null
          project_id?: string
          reason?: string | null
          tenant_id?: string
          workflow_instance_id?: string
          workflow_instance_node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_procedure_assignment_log_workflow_instance_node_id_fkey"
            columns: ["workflow_instance_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignment_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "project_procedure_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignment_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignment_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignment_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_procedure_assignment_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignment_logs_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      project_procedure_assignments: {
        Row: {
          adjust_reason: string | null
          adjusted_at: string | null
          adjusted_by_employee_id: string | null
          assignee_employee_id: string
          completed_at: string | null
          completed_by_employee_id: string | null
          created_at: string
          id: string
          node_key: string
          planned_duration_days: number
          planned_end_date: string | null
          planned_start_date: string
          project_id: string
          stage_code: string
          started_at: string
          started_by_employee_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          workflow_instance_id: string
          workflow_instance_node_id: string | null
        }
        Insert: {
          adjust_reason?: string | null
          adjusted_at?: string | null
          adjusted_by_employee_id?: string | null
          assignee_employee_id: string
          completed_at?: string | null
          completed_by_employee_id?: string | null
          created_at?: string
          id?: string
          node_key: string
          planned_duration_days: number
          planned_end_date?: string | null
          planned_start_date: string
          project_id: string
          stage_code: string
          started_at?: string
          started_by_employee_id?: string | null
          status: string
          tenant_id: string
          updated_at?: string
          workflow_instance_id: string
          workflow_instance_node_id?: string | null
        }
        Update: {
          adjust_reason?: string | null
          adjusted_at?: string | null
          adjusted_by_employee_id?: string | null
          assignee_employee_id?: string
          completed_at?: string | null
          completed_by_employee_id?: string | null
          created_at?: string
          id?: string
          node_key?: string
          planned_duration_days?: number
          planned_end_date?: string | null
          planned_start_date?: string
          project_id?: string
          stage_code?: string
          started_at?: string
          started_by_employee_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          workflow_instance_id?: string
          workflow_instance_node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_procedure_assignments_adjusted_by_employee_id_fkey"
            columns: ["adjusted_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignments_assignee_employee_id_fkey"
            columns: ["assignee_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignments_completed_by_employee_id_fkey"
            columns: ["completed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignments_started_by_employee_id_fkey"
            columns: ["started_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_procedure_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignments_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_procedure_assignments_workflow_instance_node_id_fkey"
            columns: ["workflow_instance_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_receivable_allocations: {
        Row: {
          allocated_at: string
          allocated_by: string | null
          amount: number
          created_at: string
          id: string
          metadata: Json
          payment_id: string
          project_id: string
          receivable_plan_id: string
          reverse_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          source_id: string | null
          source_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allocated_at?: string
          allocated_by?: string | null
          amount: number
          created_at?: string
          id?: string
          metadata?: Json
          payment_id: string
          project_id: string
          receivable_plan_id: string
          reverse_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allocated_at?: string
          allocated_by?: string | null
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json
          payment_id?: string
          project_id?: string
          receivable_plan_id?: string
          reverse_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_receivable_allocations_allocated_by_fkey"
            columns: ["allocated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_allocations_receivable_plan_id_fkey"
            columns: ["receivable_plan_id"]
            isOneToOne: false
            referencedRelation: "project_receivable_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_allocations_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_receivable_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_receivable_events: {
        Row: {
          after_snapshot: Json | null
          before_snapshot: Json | null
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          next_follow_up_at: string | null
          note: string | null
          project_id: string
          receivable_plan_id: string
          tenant_id: string
          title: string
        }
        Insert: {
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          next_follow_up_at?: string | null
          note?: string | null
          project_id: string
          receivable_plan_id: string
          tenant_id: string
          title: string
        }
        Update: {
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          next_follow_up_at?: string | null
          note?: string | null
          project_id?: string
          receivable_plan_id?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_receivable_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_events_receivable_plan_id_fkey"
            columns: ["receivable_plan_id"]
            isOneToOne: false
            referencedRelation: "project_receivable_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_receivable_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_receivable_plans: {
        Row: {
          amount: number
          canceled_at: string | null
          canceled_by: string | null
          canceled_reason: string | null
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          latest_follow_up_at: string | null
          latest_follow_up_note: string | null
          metadata: Json
          next_follow_up_at: string | null
          owner_employee_id: string | null
          paid_amount: number
          payment_type: string
          project_id: string
          source_id: string | null
          source_type: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
          workflow_instance_id: string | null
          workflow_node_key: string | null
        }
        Insert: {
          amount: number
          canceled_at?: string | null
          canceled_by?: string | null
          canceled_reason?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          latest_follow_up_at?: string | null
          latest_follow_up_note?: string | null
          metadata?: Json
          next_follow_up_at?: string | null
          owner_employee_id?: string | null
          paid_amount?: number
          payment_type: string
          project_id: string
          source_id?: string | null
          source_type: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          workflow_instance_id?: string | null
          workflow_node_key?: string | null
        }
        Update: {
          amount?: number
          canceled_at?: string | null
          canceled_by?: string | null
          canceled_reason?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          latest_follow_up_at?: string | null
          latest_follow_up_note?: string | null
          metadata?: Json
          next_follow_up_at?: string | null
          owner_employee_id?: string | null
          paid_amount?: number
          payment_type?: string
          project_id?: string
          source_id?: string | null
          source_type?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          workflow_instance_id?: string | null
          workflow_node_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_receivable_plans_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_plans_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "project_receivable_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receivable_plans_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      project_referrals: {
        Row: {
          base_amount: number | null
          calculated_at: string | null
          commission_amount: number | null
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          paid_evidence_images: Json
          paid_remark: string | null
          project_id: string
          rate_bps: number
          recalculated_at: string | null
          referrer_id: string
          remark: string | null
          status: string
          updated_at: string
        }
        Insert: {
          base_amount?: number | null
          calculated_at?: string | null
          commission_amount?: number | null
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_evidence_images?: Json
          paid_remark?: string | null
          project_id: string
          rate_bps: number
          recalculated_at?: string | null
          referrer_id: string
          remark?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          base_amount?: number | null
          calculated_at?: string | null
          commission_amount?: number | null
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_evidence_images?: Json
          paid_remark?: string | null
          project_id?: string
          rate_bps?: number
          recalculated_at?: string | null
          referrer_id?: string
          remark?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_referrals_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_referrals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "external_referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_share_campaign_configs: {
        Row: {
          allow_create_when_existing_active: boolean
          auto_close_on_expire: boolean
          config_mode: string
          config_status: string
          created_at: string
          created_by_employee_id: string | null
          default_display_subtitle: string | null
          default_display_title: string | null
          enabled: boolean
          id: string
          project_id: string
          reward_claim_channel: string | null
          reward_claim_instruction: string | null
          reward_remark: string | null
          reward_title: string | null
          target_assist_count: number
          template_id: string | null
          updated_at: string
          updated_by_employee_id: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          allow_create_when_existing_active?: boolean
          auto_close_on_expire?: boolean
          config_mode?: string
          config_status?: string
          created_at?: string
          created_by_employee_id?: string | null
          default_display_subtitle?: string | null
          default_display_title?: string | null
          enabled?: boolean
          id?: string
          project_id: string
          reward_claim_channel?: string | null
          reward_claim_instruction?: string | null
          reward_remark?: string | null
          reward_title?: string | null
          target_assist_count?: number
          template_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          allow_create_when_existing_active?: boolean
          auto_close_on_expire?: boolean
          config_mode?: string
          config_status?: string
          created_at?: string
          created_by_employee_id?: string | null
          default_display_subtitle?: string | null
          default_display_title?: string | null
          enabled?: boolean
          id?: string
          project_id?: string
          reward_claim_channel?: string | null
          reward_claim_instruction?: string | null
          reward_remark?: string | null
          reward_title?: string | null
          target_assist_count?: number
          template_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_share_campaign_configs_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_share_campaign_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_share_campaign_configs_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          budget: number | null
          construction_workflow_definition_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          name: string | null
          property_id: string | null
          signed_amount: number | null
          start_date: string | null
          status: string | null
          style_tags: Json
          tenant_id: string | null
          updated_at: string
          visibility_status: string
        }
        Insert: {
          address?: string | null
          budget?: number | null
          construction_workflow_definition_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          name?: string | null
          property_id?: string | null
          signed_amount?: number | null
          start_date?: string | null
          status?: string | null
          style_tags?: Json
          tenant_id?: string | null
          updated_at?: string
          visibility_status?: string
        }
        Update: {
          address?: string | null
          budget?: number | null
          construction_workflow_definition_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          name?: string | null
          property_id?: string | null
          signed_amount?: number | null
          start_date?: string | null
          status?: string | null
          style_tags?: Json
          tenant_id?: string | null
          updated_at?: string
          visibility_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_construction_workflow_definition_id_fkey"
            columns: ["construction_workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          adcode: string | null
          area: number | null
          building_info: string | null
          city: string | null
          community: string
          created_at: string | null
          customer_id: string | null
          district: string | null
          id: string
          latitude: number | null
          layout: string | null
          location_confidence: number | null
          location_confirmed_at: string | null
          location_source: string | null
          location_status: string
          longitude: number | null
          province: string | null
          tenant_id: string | null
        }
        Insert: {
          adcode?: string | null
          area?: number | null
          building_info?: string | null
          city?: string | null
          community: string
          created_at?: string | null
          customer_id?: string | null
          district?: string | null
          id?: string
          latitude?: number | null
          layout?: string | null
          location_confidence?: number | null
          location_confirmed_at?: string | null
          location_source?: string | null
          location_status?: string
          longitude?: number | null
          province?: string | null
          tenant_id?: string | null
        }
        Update: {
          adcode?: string | null
          area?: number | null
          building_info?: string | null
          city?: string | null
          community?: string
          created_at?: string | null
          customer_id?: string | null
          district?: string | null
          id?: string
          latitude?: number | null
          layout?: string | null
          location_confidence?: number | null
          location_confirmed_at?: string | null
          location_source?: string | null
          location_status?: string
          longitude?: number | null
          province?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          access_scope: string
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          access_scope?: string
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          access_scope?: string
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content_entries: {
        Row: {
          content_type: string
          created_at: string
          id: string
          published_at: string | null
          published_version_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          content_type: string
          created_at?: string
          id?: string
          published_at?: string | null
          published_version_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          published_at?: string | null
          published_version_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_content_published_version_fk"
            columns: ["id", "published_version_id"]
            isOneToOne: false
            referencedRelation: "site_content_versions"
            referencedColumns: ["entry_id", "id"]
          },
        ]
      }
      site_content_versions: {
        Row: {
          canonical_url: string | null
          content_blocks: Json
          cover_file_id: string | null
          created_at: string
          created_by: string | null
          entry_id: string
          id: string
          metadata: Json
          seo_description: string | null
          seo_title: string | null
          summary: string | null
          title: string
          version_no: number
        }
        Insert: {
          canonical_url?: string | null
          content_blocks?: Json
          cover_file_id?: string | null
          created_at?: string
          created_by?: string | null
          entry_id: string
          id?: string
          metadata?: Json
          seo_description?: string | null
          seo_title?: string | null
          summary?: string | null
          title: string
          version_no: number
        }
        Update: {
          canonical_url?: string | null
          content_blocks?: Json
          cover_file_id?: string | null
          created_at?: string
          created_by?: string | null
          entry_id?: string
          id?: string
          metadata?: Json
          seo_description?: string | null
          seo_title?: string | null
          summary?: string | null
          title?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_content_versions_cover_file_id_fkey"
            columns: ["cover_file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_content_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_content_versions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "site_content_admin_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_content_versions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "site_content_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      site_preview_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          entry_id: string
          expires_at: string
          id: string
          token_hash: string
          version_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          entry_id: string
          expires_at: string
          id?: string
          token_hash: string
          version_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          entry_id?: string
          expires_at?: string
          id?: string
          token_hash?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_preview_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_preview_tokens_version_fk"
            columns: ["entry_id", "version_id"]
            isOneToOne: false
            referencedRelation: "site_content_versions"
            referencedColumns: ["entry_id", "id"]
          },
        ]
      }
      sms_send_logs: {
        Row: {
          billed: boolean
          billed_at: string | null
          billing_event_id: string | null
          channel_mode: string | null
          created_at: string
          delivery_status: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          phone_hash: string
          phone_masked: string
          provider: string
          provider_code: string | null
          provider_message: string | null
          purpose: string
          request_id: string | null
          sms_count: number
          status: string
          template_code: string | null
          tenant_id: string | null
        }
        Insert: {
          billed?: boolean
          billed_at?: string | null
          billing_event_id?: string | null
          channel_mode?: string | null
          created_at?: string
          delivery_status?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          phone_hash: string
          phone_masked: string
          provider: string
          provider_code?: string | null
          provider_message?: string | null
          purpose: string
          request_id?: string | null
          sms_count?: number
          status: string
          template_code?: string | null
          tenant_id?: string | null
        }
        Update: {
          billed?: boolean
          billed_at?: string | null
          billing_event_id?: string | null
          channel_mode?: string | null
          created_at?: string
          delivery_status?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          phone_hash?: string
          phone_masked?: string
          provider?: string
          provider_code?: string | null
          provider_message?: string | null
          purpose?: string
          request_id?: string | null
          sms_count?: number
          status?: string
          template_code?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_send_logs_billing_event_id_fkey"
            columns: ["billing_event_id"]
            isOneToOne: false
            referencedRelation: "tenant_billing_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_send_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "sms_send_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_verification_codes: {
        Row: {
          code: string
          created_at: string
          expired_at: string
          id: string
          phone: string
          request_device: string | null
          request_ip: string | null
          scene: string
          status: string
          verified_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expired_at: string
          id?: string
          phone: string
          request_device?: string | null
          request_ip?: string | null
          scene: string
          status?: string
          verified_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expired_at?: string
          id?: string
          phone?: string
          request_device?: string | null
          request_ip?: string | null
          scene?: string
          status?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      social_video_scripts: {
        Row: {
          caption_options: Json
          cover_text_options: Json
          created_at: string
          duration_seconds: number
          error_code: string | null
          error_message: string | null
          goal: string
          hook: string
          id: string
          model_name: string | null
          model_provider: string | null
          platform: string
          prompt_version: string
          raw_payload: Json | null
          rewritten_copy: string
          shooting_script: Json
          source_text_length: number
          status: string
          style: string
          target_platform: string
          tenant_id: string | null
          tips: Json
          title: string
          transcription_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          caption_options?: Json
          cover_text_options?: Json
          created_at?: string
          duration_seconds: number
          error_code?: string | null
          error_message?: string | null
          goal: string
          hook: string
          id?: string
          model_name?: string | null
          model_provider?: string | null
          platform: string
          prompt_version: string
          raw_payload?: Json | null
          rewritten_copy: string
          shooting_script?: Json
          source_text_length?: number
          status?: string
          style: string
          target_platform?: string
          tenant_id?: string | null
          tips?: Json
          title: string
          transcription_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          caption_options?: Json
          cover_text_options?: Json
          created_at?: string
          duration_seconds?: number
          error_code?: string | null
          error_message?: string | null
          goal?: string
          hook?: string
          id?: string
          model_name?: string | null
          model_provider?: string | null
          platform?: string
          prompt_version?: string
          raw_payload?: Json | null
          rewritten_copy?: string
          shooting_script?: Json
          source_text_length?: number
          status?: string
          style?: string
          target_platform?: string
          tenant_id?: string | null
          tips?: Json
          title?: string
          transcription_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_video_scripts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "social_video_scripts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_video_scripts_transcription_id_fkey"
            columns: ["transcription_id"]
            isOneToOne: false
            referencedRelation: "social_video_transcriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      social_video_transcriptions: {
        Row: {
          asr_task_id: string | null
          audio_duration_seconds: number | null
          audio_file_size_bytes: number | null
          billable: boolean
          billed_at: string | null
          billing_charged: boolean
          billing_charged_at: string | null
          billing_correlation_id: string | null
          billing_duration_seconds: number | null
          billing_event_id: string | null
          billing_frozen_credits: number
          billing_minutes: number | null
          billing_source: string | null
          completed_at: string | null
          created_at: string
          created_by_auth_user_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          input_hash: string
          media_file_size_bytes: number | null
          normalized_url: string
          platform: string
          progress: number
          provider: string | null
          provider_actor_id: string | null
          provider_dataset_id: string | null
          provider_run_id: string | null
          raw_payload: Json | null
          resolved_audio_url: string | null
          resolved_video_url: string | null
          segments: Json
          source_url: string
          status: string
          tenant_id: string | null
          text: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          asr_task_id?: string | null
          audio_duration_seconds?: number | null
          audio_file_size_bytes?: number | null
          billable?: boolean
          billed_at?: string | null
          billing_charged?: boolean
          billing_charged_at?: string | null
          billing_correlation_id?: string | null
          billing_duration_seconds?: number | null
          billing_event_id?: string | null
          billing_frozen_credits?: number
          billing_minutes?: number | null
          billing_source?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_auth_user_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_hash: string
          media_file_size_bytes?: number | null
          normalized_url: string
          platform: string
          progress?: number
          provider?: string | null
          provider_actor_id?: string | null
          provider_dataset_id?: string | null
          provider_run_id?: string | null
          raw_payload?: Json | null
          resolved_audio_url?: string | null
          resolved_video_url?: string | null
          segments?: Json
          source_url: string
          status?: string
          tenant_id?: string | null
          text?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          asr_task_id?: string | null
          audio_duration_seconds?: number | null
          audio_file_size_bytes?: number | null
          billable?: boolean
          billed_at?: string | null
          billing_charged?: boolean
          billing_charged_at?: string | null
          billing_correlation_id?: string | null
          billing_duration_seconds?: number | null
          billing_event_id?: string | null
          billing_frozen_credits?: number
          billing_minutes?: number | null
          billing_source?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_auth_user_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_hash?: string
          media_file_size_bytes?: number | null
          normalized_url?: string
          platform?: string
          progress?: number
          provider?: string | null
          provider_actor_id?: string | null
          provider_dataset_id?: string | null
          provider_run_id?: string | null
          raw_payload?: Json | null
          resolved_audio_url?: string | null
          resolved_video_url?: string | null
          segments?: Json
          source_url?: string
          status?: string
          tenant_id?: string | null
          text?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_video_transcriptions_billing_event_id_fkey"
            columns: ["billing_event_id"]
            isOneToOne: false
            referencedRelation: "tenant_billing_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_video_transcriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "social_video_transcriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_addresses: {
        Row: {
          address_detail: string
          address_type: string
          city: string | null
          created_at: string
          created_by_employee_id: string
          district: string | null
          id: string
          is_default: boolean
          latitude: number | null
          longitude: number | null
          province: string | null
          region_code: string
          status: string
          supplier_id: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          address_detail: string
          address_type: string
          city?: string | null
          created_at?: string
          created_by_employee_id: string
          district?: string | null
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          province?: string | null
          region_code: string
          status?: string
          supplier_id: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          address_detail?: string
          address_type?: string
          city?: string | null
          created_at?: string
          created_by_employee_id?: string
          district?: string | null
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          province?: string | null
          region_code?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_addresses_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_addresses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_addresses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_addresses_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_command_events: {
        Row: {
          actor_employee_id: string
          actor_user_id: string
          command: string
          created_at: string
          from_state: Json
          id: string
          idempotency_key: string
          reason: string | null
          resource_id: string
          resource_type: string
          result_version: number
          tenant_id: string | null
          to_state: Json
        }
        Insert: {
          actor_employee_id: string
          actor_user_id: string
          command: string
          created_at?: string
          from_state?: Json
          id?: string
          idempotency_key: string
          reason?: string | null
          resource_id: string
          resource_type: string
          result_version: number
          tenant_id?: string | null
          to_state?: Json
        }
        Update: {
          actor_employee_id?: string
          actor_user_id?: string
          command?: string
          created_at?: string
          from_state?: Json
          id?: string
          idempotency_key?: string
          reason?: string | null
          resource_id?: string
          resource_type?: string
          result_version?: number
          tenant_id?: string | null
          to_state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "supplier_command_events_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_command_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_command_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          contact_type: string
          created_at: string
          created_by_employee_id: string
          email: string | null
          id: string
          is_primary: boolean
          is_public: boolean
          name: string
          phone: string | null
          status: string
          supplier_id: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          contact_type: string
          created_at?: string
          created_by_employee_id: string
          email?: string | null
          id?: string
          is_primary?: boolean
          is_public?: boolean
          name: string
          phone?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          contact_type?: string
          created_at?: string
          created_by_employee_id?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          is_public?: boolean
          name?: string
          phone?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contracts: {
        Row: {
          contract_no: string
          created_at: string
          created_by_employee_id: string
          document_file_id: string
          id: string
          invoice_required_before_payment: boolean
          lifecycle_status: string
          name: string
          settlement_term_days: number
          tenant_id: string
          tenant_supplier_id: string
          updated_at: string
          updated_by_employee_id: string
          valid_from: string
          valid_until: string
          version: number
        }
        Insert: {
          contract_no: string
          created_at?: string
          created_by_employee_id: string
          document_file_id: string
          id?: string
          invoice_required_before_payment?: boolean
          lifecycle_status?: string
          name: string
          settlement_term_days?: number
          tenant_id: string
          tenant_supplier_id: string
          updated_at?: string
          updated_by_employee_id: string
          valid_from: string
          valid_until: string
          version?: number
        }
        Update: {
          contract_no?: string
          created_at?: string
          created_by_employee_id?: string
          document_file_id?: string
          id?: string
          invoice_required_before_payment?: boolean
          lifecycle_status?: string
          name?: string
          settlement_term_days?: number
          tenant_id?: string
          tenant_supplier_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          valid_from?: string
          valid_until?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contracts_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_document_file_id_fkey"
            columns: ["document_file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_tenant_supplier_id_fkey"
            columns: ["tenant_supplier_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_tenant_supplier_tenant_fkey"
            columns: ["tenant_supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_contracts_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payable_events: {
        Row: {
          accepted_quantity: number
          amount: number
          cost_category_id: string
          created_at: string
          created_by_employee_id: string
          currency: string
          due_at: string
          id: string
          invoice_required_before_payment: boolean
          occurred_at: string
          project_id: string
          purchase_requisition_id: string | null
          source_id: string
          source_type: string
          supplier_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          supplier_purchase_order_receipt_id: string
          supplier_purchase_order_receipt_item_id: string
          tenant_id: string
          tenant_supplier_id: string
        }
        Insert: {
          accepted_quantity: number
          amount: number
          cost_category_id: string
          created_at?: string
          created_by_employee_id: string
          currency?: string
          due_at: string
          id?: string
          invoice_required_before_payment: boolean
          occurred_at: string
          project_id: string
          purchase_requisition_id?: string | null
          source_id: string
          source_type?: string
          supplier_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          supplier_purchase_order_receipt_id: string
          supplier_purchase_order_receipt_item_id: string
          tenant_id: string
          tenant_supplier_id: string
        }
        Update: {
          accepted_quantity?: number
          amount?: number
          cost_category_id?: string
          created_at?: string
          created_by_employee_id?: string
          currency?: string
          due_at?: string
          id?: string
          invoice_required_before_payment?: boolean
          occurred_at?: string
          project_id?: string
          purchase_requisition_id?: string | null
          source_id?: string
          source_type?: string
          supplier_id?: string
          supplier_purchase_order_id?: string
          supplier_purchase_order_item_id?: string
          supplier_purchase_order_receipt_id?: string
          supplier_purchase_order_receipt_item_id?: string
          tenant_id?: string
          tenant_supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payable_events_category_tenant_fkey"
            columns: ["cost_category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_created_employee_tenant_fkey"
            columns: ["created_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_item_tenant_order_fkey"
            columns: [
              "supplier_purchase_order_item_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_items"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_order_tenant_supplier_fkey"
            columns: ["supplier_purchase_order_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_orders"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_project_tenant_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_receipt_item_tenant_chain_fkey"
            columns: [
              "supplier_purchase_order_receipt_item_id",
              "tenant_id",
              "supplier_purchase_order_receipt_id",
              "supplier_purchase_order_id",
              "supplier_purchase_order_item_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_receipt_items"
            referencedColumns: [
              "id",
              "tenant_id",
              "receipt_id",
              "supplier_purchase_order_id",
              "supplier_purchase_order_item_id",
            ]
          },
          {
            foreignKeyName: "supplier_payable_events_receipt_tenant_order_fkey"
            columns: [
              "supplier_purchase_order_receipt_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_receipts"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_relationship_tenant_supplier_fkey"
            columns: ["tenant_supplier_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_requisition_tenant_fkey"
            columns: ["purchase_requisition_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_requisitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payable_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payable_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_payable_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          payable_event_id: string
          payment_request_allocation_id: string
          payment_request_id: string
          supplier_payment_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payable_event_id: string
          payment_request_allocation_id: string
          payment_request_id: string
          supplier_payment_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payable_event_id?: string
          payment_request_allocation_id?: string
          payment_request_id?: string
          supplier_payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_allocations_payable_tenant_fkey"
            columns: ["payable_event_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_payable_events"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_payment_tenant_fkey"
            columns: ["supplier_payment_id", "tenant_id", "payment_request_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id", "tenant_id", "payment_request_id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_request_payable_tenant_fkey"
            columns: [
              "payment_request_allocation_id",
              "tenant_id",
              "payment_request_id",
              "payable_event_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_payment_request_allocations"
            referencedColumns: [
              "id",
              "tenant_id",
              "payment_request_id",
              "payable_event_id",
            ]
          },
          {
            foreignKeyName: "supplier_payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_request_allocations: {
        Row: {
          created_at: string
          id: string
          paid_amount: number
          payable_event_id: string
          payment_request_id: string
          requested_amount: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          paid_amount?: number
          payable_event_id: string
          payment_request_id: string
          requested_amount: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          paid_amount?: number
          payable_event_id?: string
          payment_request_id?: string
          requested_amount?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_request_allocations_payable_tenant_fkey"
            columns: ["payable_event_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_payable_events"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_request_allocations_request_tenant_fkey"
            columns: ["payment_request_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_payment_requests"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_request_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_request_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_requests: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_employee_id: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by_employee_id: string | null
          created_at: string
          created_by_employee_id: string
          currency: string
          id: string
          paid_amount: number
          project_id: string
          reason: string
          remark: string | null
          request_no: string
          requested_amount: number
          review_remark: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          status: string
          submitted_at: string | null
          submitted_by_employee_id: string | null
          supplier_id: string
          tenant_id: string
          tenant_supplier_id: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_employee_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_employee_id?: string | null
          created_at?: string
          created_by_employee_id: string
          currency?: string
          id?: string
          paid_amount?: number
          project_id: string
          reason: string
          remark?: string | null
          request_no?: string
          requested_amount?: number
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by_employee_id?: string | null
          supplier_id: string
          tenant_id: string
          tenant_supplier_id: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_employee_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_employee_id?: string | null
          created_at?: string
          created_by_employee_id?: string
          currency?: string
          id?: string
          paid_amount?: number
          project_id?: string
          reason?: string
          remark?: string | null
          request_no?: string
          requested_amount?: number
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by_employee_id?: string | null
          supplier_id?: string
          tenant_id?: string
          tenant_supplier_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_requests_cancelled_employee_tenant_fkey"
            columns: ["cancelled_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_closed_employee_tenant_fkey"
            columns: ["closed_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_created_employee_tenant_fkey"
            columns: ["created_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_project_tenant_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_relationship_scope_fkey"
            columns: ["tenant_supplier_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_reviewed_employee_tenant_fkey"
            columns: ["reviewed_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_submitted_employee_tenant_fkey"
            columns: ["submitted_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_requests_updated_employee_tenant_fkey"
            columns: ["updated_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          confirmed_by_employee_id: string
          created_at: string
          currency: string
          evidence_images: Json
          id: string
          idempotency_key: string
          paid_at: string
          payment_method: string
          payment_no: string
          payment_reference: string
          payment_request_id: string
          project_id: string
          remark: string | null
          supplier_id: string
          tenant_id: string
          tenant_supplier_id: string
        }
        Insert: {
          amount: number
          confirmed_by_employee_id: string
          created_at?: string
          currency?: string
          evidence_images: Json
          id: string
          idempotency_key: string
          paid_at: string
          payment_method: string
          payment_no?: string
          payment_reference: string
          payment_request_id: string
          project_id: string
          remark?: string | null
          supplier_id: string
          tenant_id: string
          tenant_supplier_id: string
        }
        Update: {
          amount?: number
          confirmed_by_employee_id?: string
          created_at?: string
          currency?: string
          evidence_images?: Json
          id?: string
          idempotency_key?: string
          paid_at?: string
          payment_method?: string
          payment_no?: string
          payment_reference?: string
          payment_request_id?: string
          project_id?: string
          remark?: string | null
          supplier_id?: string
          tenant_id?: string
          tenant_supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_confirmed_employee_tenant_fkey"
            columns: ["confirmed_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payments_project_tenant_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payments_relationship_scope_fkey"
            columns: ["tenant_supplier_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_payments_request_scope_fkey"
            columns: [
              "payment_request_id",
              "tenant_id",
              "project_id",
              "tenant_supplier_id",
              "supplier_id",
              "currency",
            ]
            isOneToOne: false
            referencedRelation: "supplier_payment_requests"
            referencedColumns: [
              "id",
              "tenant_id",
              "project_id",
              "tenant_supplier_id",
              "supplier_id",
              "currency",
            ]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_price_list_items: {
        Row: {
          acting_employee_id: string
          acting_tenant_id: string
          base_unit_conversion: number
          base_unit_id: string
          created_at: string
          created_by_employee_id: string
          id: string
          maximum_quantity: number | null
          minimum_quantity: number
          operation_source: string
          proxy_reason: string | null
          purchase_unit_id: string
          supplier_id: string
          supplier_price_list_id: string
          supplier_product_id: string | null
          supplier_sku_id: string
          tax_inclusive: boolean
          tax_rate: number
          tenant_id: string
          unit_price: number
          updated_at: string
          updated_by_employee_id: string
        }
        Insert: {
          acting_employee_id: string
          acting_tenant_id: string
          base_unit_conversion: number
          base_unit_id: string
          created_at?: string
          created_by_employee_id: string
          id?: string
          maximum_quantity?: number | null
          minimum_quantity?: number
          operation_source?: string
          proxy_reason?: string | null
          purchase_unit_id: string
          supplier_id: string
          supplier_price_list_id: string
          supplier_product_id?: string | null
          supplier_sku_id: string
          tax_inclusive?: boolean
          tax_rate?: number
          tenant_id: string
          unit_price: number
          updated_at?: string
          updated_by_employee_id: string
        }
        Update: {
          acting_employee_id?: string
          acting_tenant_id?: string
          base_unit_conversion?: number
          base_unit_id?: string
          created_at?: string
          created_by_employee_id?: string
          id?: string
          maximum_quantity?: number | null
          minimum_quantity?: number
          operation_source?: string
          proxy_reason?: string | null
          purchase_unit_id?: string
          supplier_id?: string
          supplier_price_list_id?: string
          supplier_product_id?: string | null
          supplier_sku_id?: string
          tax_inclusive?: boolean
          tax_rate?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          updated_by_employee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_items_list_supplier_fkey"
            columns: ["supplier_price_list_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_lists"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_price_items_list_tenant_supplier_fkey"
            columns: ["supplier_price_list_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_lists"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_price_items_product_supplier_fkey"
            columns: ["supplier_product_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_price_items_sku_supplier_fkey"
            columns: ["supplier_sku_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_skus"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_acting_employee_id_fkey"
            columns: ["acting_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_acting_tenant_id_fkey"
            columns: ["acting_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_acting_tenant_id_fkey"
            columns: ["acting_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_items_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_price_lists: {
        Row: {
          acting_employee_id: string
          acting_tenant_id: string
          created_at: string
          created_by_employee_id: string
          currency: string
          effective_from: string
          effective_until: string | null
          id: string
          lifecycle_status: string
          name: string
          operation_source: string
          price_list_code: string
          proxy_reason: string | null
          published_at: string | null
          row_version: number
          scope_type: string
          supersedes_price_list_id: string | null
          supplier_id: string
          tenant_id: string
          tenant_supplier_id: string | null
          updated_at: string
          updated_by_employee_id: string
          version_number: number
        }
        Insert: {
          acting_employee_id: string
          acting_tenant_id: string
          created_at?: string
          created_by_employee_id: string
          currency?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          lifecycle_status?: string
          name: string
          operation_source?: string
          price_list_code: string
          proxy_reason?: string | null
          published_at?: string | null
          row_version?: number
          scope_type?: string
          supersedes_price_list_id?: string | null
          supplier_id: string
          tenant_id: string
          tenant_supplier_id?: string | null
          updated_at?: string
          updated_by_employee_id: string
          version_number: number
        }
        Update: {
          acting_employee_id?: string
          acting_tenant_id?: string
          created_at?: string
          created_by_employee_id?: string
          currency?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          lifecycle_status?: string
          name?: string
          operation_source?: string
          price_list_code?: string
          proxy_reason?: string | null
          published_at?: string | null
          row_version?: number
          scope_type?: string
          supersedes_price_list_id?: string | null
          supplier_id?: string
          tenant_id?: string
          tenant_supplier_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_lists_acting_employee_id_fkey"
            columns: ["acting_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_lists_acting_tenant_id_fkey"
            columns: ["acting_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_price_lists_acting_tenant_id_fkey"
            columns: ["acting_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_lists_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_lists_relationship_fkey"
            columns: ["tenant_supplier_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_price_lists_supersedes_supplier_fkey"
            columns: ["supersedes_price_list_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_lists"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_price_lists_supersedes_tenant_fkey"
            columns: ["supersedes_price_list_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_lists"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_price_lists_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_lists_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_lists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_price_lists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_lists_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          acting_employee_id: string
          acting_tenant_id: string | null
          brand_id: string
          category_id: string
          created_at: string
          created_by_employee_id: string
          description: string | null
          id: string
          name: string
          operation_source: string
          owner_tenant_id: string | null
          ownership_scope: string | null
          product_code: string
          proxy_reason: string | null
          status: string
          supplier_id: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          acting_employee_id: string
          acting_tenant_id?: string | null
          brand_id: string
          category_id: string
          created_at?: string
          created_by_employee_id: string
          description?: string | null
          id?: string
          name: string
          operation_source?: string
          owner_tenant_id?: string | null
          ownership_scope?: string | null
          product_code: string
          proxy_reason?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          acting_employee_id?: string
          acting_tenant_id?: string | null
          brand_id?: string
          category_id?: string
          created_at?: string
          created_by_employee_id?: string
          description?: string | null
          id?: string
          name?: string
          operation_source?: string
          owner_tenant_id?: string | null
          ownership_scope?: string | null
          product_code?: string
          proxy_reason?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_acting_employee_id_fkey"
            columns: ["acting_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_acting_tenant_id_fkey"
            columns: ["acting_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_products_acting_tenant_id_fkey"
            columns: ["acting_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "catalog_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_products_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_order_fulfillments: {
        Row: {
          accepted_quantity: number
          accepted_subtotal_amount: number
          accepted_tax_amount: number
          accepted_total_amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_employee_id: string | null
          cancelled_by_user_id: string | null
          confirmation_remark: string | null
          confirmed_at: string
          confirmed_by_employee_id: string
          confirmed_by_user_id: string
          created_at: string
          id: string
          ordered_quantity: number
          received_quantity: number
          rejected_quantity: number
          shipped_quantity: number
          status: string
          supplier_purchase_order_id: string
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          accepted_quantity?: number
          accepted_subtotal_amount?: number
          accepted_tax_amount?: number
          accepted_total_amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_employee_id?: string | null
          cancelled_by_user_id?: string | null
          confirmation_remark?: string | null
          confirmed_at: string
          confirmed_by_employee_id: string
          confirmed_by_user_id: string
          created_at?: string
          id?: string
          ordered_quantity?: number
          received_quantity?: number
          rejected_quantity?: number
          shipped_quantity?: number
          status?: string
          supplier_purchase_order_id: string
          tenant_id: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          accepted_quantity?: number
          accepted_subtotal_amount?: number
          accepted_tax_amount?: number
          accepted_total_amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_employee_id?: string | null
          cancelled_by_user_id?: string | null
          confirmation_remark?: string | null
          confirmed_at?: string
          confirmed_by_employee_id?: string
          confirmed_by_user_id?: string
          created_at?: string
          id?: string
          ordered_quantity?: number
          received_quantity?: number
          rejected_quantity?: number
          shipped_quantity?: number
          status?: string
          supplier_purchase_order_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_order_fulfillme_cancelled_by_employee_id_fkey"
            columns: ["cancelled_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_fulfillme_confirmed_by_employee_id_fkey"
            columns: ["confirmed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_fulfillment_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_fulfillments_order_tenant_fkey"
            columns: ["supplier_purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_fulfillments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_fulfillments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_order_item_fulfillments: {
        Row: {
          accepted_quantity: number
          accepted_subtotal_amount: number
          accepted_tax_amount: number
          accepted_total_amount: number
          created_at: string
          id: string
          ordered_quantity: number
          received_quantity: number
          rejected_quantity: number
          shipped_quantity: number
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_quantity?: number
          accepted_subtotal_amount?: number
          accepted_tax_amount?: number
          accepted_total_amount?: number
          created_at?: string
          id?: string
          ordered_quantity: number
          received_quantity?: number
          rejected_quantity?: number
          shipped_quantity?: number
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_quantity?: number
          accepted_subtotal_amount?: number
          accepted_tax_amount?: number
          accepted_total_amount?: number
          created_at?: string
          id?: string
          ordered_quantity?: number
          received_quantity?: number
          rejected_quantity?: number
          shipped_quantity?: number
          supplier_purchase_order_fulfillment_id?: string
          supplier_purchase_order_id?: string
          supplier_purchase_order_item_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_order_item_fulfillments_item_fkey"
            columns: [
              "supplier_purchase_order_item_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_items"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_item_fulfillments_parent_fkey"
            columns: [
              "supplier_purchase_order_fulfillment_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_fulfillments"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_item_fulfillments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_item_fulfillments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_order_items: {
        Row: {
          base_unit_code_snapshot: string
          base_unit_conversion: number
          base_unit_id: string
          base_unit_name_snapshot: string
          base_unit_symbol_snapshot: string
          cost_category_id: string | null
          created_at: string
          id: string
          line_no: number
          model_snapshot: string | null
          price_effective_from_snapshot: string
          price_effective_until_snapshot: string | null
          price_list_code_snapshot: string
          price_list_version_snapshot: number
          product_code_snapshot: string
          product_name_snapshot: string
          purchase_unit_code_snapshot: string
          purchase_unit_id: string
          purchase_unit_name_snapshot: string
          purchase_unit_symbol_snapshot: string
          quantity: number
          sku_code_snapshot: string
          sku_name_snapshot: string
          specification_snapshot: string | null
          subtotal_amount: number
          supplier_id: string
          supplier_price_list_id: string
          supplier_price_list_item_id: string
          supplier_product_id: string
          supplier_purchase_order_id: string
          supplier_sku_id: string
          tax_amount: number
          tax_inclusive: boolean
          tax_rate: number
          tenant_id: string
          total_amount: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          base_unit_code_snapshot: string
          base_unit_conversion: number
          base_unit_id: string
          base_unit_name_snapshot: string
          base_unit_symbol_snapshot: string
          cost_category_id?: string | null
          created_at?: string
          id?: string
          line_no: number
          model_snapshot?: string | null
          price_effective_from_snapshot: string
          price_effective_until_snapshot?: string | null
          price_list_code_snapshot: string
          price_list_version_snapshot: number
          product_code_snapshot: string
          product_name_snapshot: string
          purchase_unit_code_snapshot: string
          purchase_unit_id: string
          purchase_unit_name_snapshot: string
          purchase_unit_symbol_snapshot: string
          quantity: number
          sku_code_snapshot: string
          sku_name_snapshot: string
          specification_snapshot?: string | null
          subtotal_amount: number
          supplier_id: string
          supplier_price_list_id: string
          supplier_price_list_item_id: string
          supplier_product_id: string
          supplier_purchase_order_id: string
          supplier_sku_id: string
          tax_amount: number
          tax_inclusive: boolean
          tax_rate: number
          tenant_id: string
          total_amount: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          base_unit_code_snapshot?: string
          base_unit_conversion?: number
          base_unit_id?: string
          base_unit_name_snapshot?: string
          base_unit_symbol_snapshot?: string
          cost_category_id?: string | null
          created_at?: string
          id?: string
          line_no?: number
          model_snapshot?: string | null
          price_effective_from_snapshot?: string
          price_effective_until_snapshot?: string | null
          price_list_code_snapshot?: string
          price_list_version_snapshot?: number
          product_code_snapshot?: string
          product_name_snapshot?: string
          purchase_unit_code_snapshot?: string
          purchase_unit_id?: string
          purchase_unit_name_snapshot?: string
          purchase_unit_symbol_snapshot?: string
          quantity?: number
          sku_code_snapshot?: string
          sku_name_snapshot?: string
          specification_snapshot?: string | null
          subtotal_amount?: number
          supplier_id?: string
          supplier_price_list_id?: string
          supplier_price_list_item_id?: string
          supplier_product_id?: string
          supplier_purchase_order_id?: string
          supplier_sku_id?: string
          tax_amount?: number
          tax_inclusive?: boolean
          tax_rate?: number
          tenant_id?: string
          total_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_order_items_cost_category_tenant_fkey"
            columns: ["cost_category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_order_supplier_fkey"
            columns: ["supplier_purchase_order_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_orders"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_order_tenant_fkey"
            columns: ["supplier_purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_price_list_supplier_fkey"
            columns: ["supplier_price_list_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_lists"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_product_supplier_fkey"
            columns: ["supplier_product_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_sku_supplier_fkey"
            columns: ["supplier_sku_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_skus"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_supplier_price_list_item_id_fkey"
            columns: ["supplier_price_list_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_order_receipt_items: {
        Row: {
          accepted_quantity: number
          created_at: string
          id: string
          receipt_id: string
          rejected_quantity: number
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          tenant_id: string
          variance_reason: string | null
        }
        Insert: {
          accepted_quantity?: number
          created_at?: string
          id?: string
          receipt_id: string
          rejected_quantity?: number
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          tenant_id: string
          variance_reason?: string | null
        }
        Update: {
          accepted_quantity?: number
          created_at?: string
          id?: string
          receipt_id?: string
          rejected_quantity?: number
          supplier_purchase_order_fulfillment_id?: string
          supplier_purchase_order_id?: string
          supplier_purchase_order_item_id?: string
          tenant_id?: string
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_order_receipt_items_item_fkey"
            columns: [
              "supplier_purchase_order_item_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_items"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_receipt_items_parent_fkey"
            columns: [
              "receipt_id",
              "tenant_id",
              "supplier_purchase_order_fulfillment_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_receipts"
            referencedColumns: [
              "id",
              "tenant_id",
              "supplier_purchase_order_fulfillment_id",
              "supplier_purchase_order_id",
            ]
          },
          {
            foreignKeyName: "supplier_purchase_order_receipt_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_receipt_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_order_receipts: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          receipt_no: string
          received_at: string
          received_by_employee_id: string
          remark: string | null
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id: string
          receipt_no: string
          received_at: string
          received_by_employee_id: string
          remark?: string | null
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          receipt_no?: string
          received_at?: string
          received_by_employee_id?: string
          remark?: string | null
          supplier_purchase_order_fulfillment_id?: string
          supplier_purchase_order_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_order_receipts_parent_fkey"
            columns: [
              "supplier_purchase_order_fulfillment_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_fulfillments"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_receipts_received_by_employee_id_fkey"
            columns: ["received_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_order_shipment_items: {
        Row: {
          created_at: string
          id: string
          quantity: number
          shipment_id: string
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity: number
          shipment_id: string
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity?: number
          shipment_id?: string
          supplier_purchase_order_fulfillment_id?: string
          supplier_purchase_order_id?: string
          supplier_purchase_order_item_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_order_shipment_items_item_fkey"
            columns: [
              "supplier_purchase_order_item_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_items"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_shipment_items_parent_fkey"
            columns: [
              "shipment_id",
              "tenant_id",
              "supplier_purchase_order_fulfillment_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_shipments"
            referencedColumns: [
              "id",
              "tenant_id",
              "supplier_purchase_order_fulfillment_id",
              "supplier_purchase_order_id",
            ]
          },
          {
            foreignKeyName: "supplier_purchase_order_shipment_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_shipment_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_order_shipments: {
        Row: {
          carrier_name: string | null
          created_at: string
          created_by_employee_id: string
          created_by_user_id: string
          id: string
          remark: string | null
          shipment_no: string
          shipped_at: string
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          tenant_id: string
          tracking_no: string | null
        }
        Insert: {
          carrier_name?: string | null
          created_at?: string
          created_by_employee_id: string
          created_by_user_id: string
          id: string
          remark?: string | null
          shipment_no: string
          shipped_at: string
          supplier_purchase_order_fulfillment_id: string
          supplier_purchase_order_id: string
          tenant_id: string
          tracking_no?: string | null
        }
        Update: {
          carrier_name?: string | null
          created_at?: string
          created_by_employee_id?: string
          created_by_user_id?: string
          id?: string
          remark?: string | null
          shipment_no?: string
          shipped_at?: string
          supplier_purchase_order_fulfillment_id?: string
          supplier_purchase_order_id?: string
          tenant_id?: string
          tracking_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_order_shipments_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_shipments_parent_fkey"
            columns: [
              "supplier_purchase_order_fulfillment_id",
              "tenant_id",
              "supplier_purchase_order_id",
            ]
            isOneToOne: false
            referencedRelation: "supplier_purchase_order_fulfillments"
            referencedColumns: ["id", "tenant_id", "supplier_purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_order_shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_orders: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_employee_id: string | null
          commercial_snapshot_source: string
          created_at: string
          created_by_employee_id: string
          currency: string
          expected_delivery_date: string | null
          id: string
          invoice_required_before_payment_snapshot: boolean
          order_no: string
          priced_at: string
          project_id: string
          purchase_requisition_id: string | null
          remark: string | null
          settlement_term_days_snapshot: number
          status: string
          submitted_at: string | null
          submitted_by_employee_id: string | null
          subtotal_amount: number
          supplier_id: string
          tax_amount: number
          tenant_id: string
          tenant_supplier_id: string
          total_amount: number
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_employee_id?: string | null
          commercial_snapshot_source: string
          created_at?: string
          created_by_employee_id: string
          currency?: string
          expected_delivery_date?: string | null
          id: string
          invoice_required_before_payment_snapshot: boolean
          order_no: string
          priced_at: string
          project_id: string
          purchase_requisition_id?: string | null
          remark?: string | null
          settlement_term_days_snapshot: number
          status?: string
          submitted_at?: string | null
          submitted_by_employee_id?: string | null
          subtotal_amount?: number
          supplier_id: string
          tax_amount?: number
          tenant_id: string
          tenant_supplier_id: string
          total_amount?: number
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_employee_id?: string | null
          commercial_snapshot_source?: string
          created_at?: string
          created_by_employee_id?: string
          currency?: string
          expected_delivery_date?: string | null
          id?: string
          invoice_required_before_payment_snapshot?: boolean
          order_no?: string
          priced_at?: string
          project_id?: string
          purchase_requisition_id?: string | null
          remark?: string | null
          settlement_term_days_snapshot?: number
          status?: string
          submitted_at?: string | null
          submitted_by_employee_id?: string | null
          subtotal_amount?: number
          supplier_id?: string
          tax_amount?: number
          tenant_id?: string
          tenant_supplier_id?: string
          total_amount?: number
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_orders_cancelled_by_employee_id_fkey"
            columns: ["cancelled_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_relationship_tenant_fkey"
            columns: ["tenant_supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_requisition_tenant_fkey"
            columns: ["purchase_requisition_id", "tenant_id", "id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_requisitions"
            referencedColumns: ["id", "tenant_id", "purchase_order_id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_submitted_by_employee_id_fkey"
            columns: ["submitted_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_orders_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_requisition_items: {
        Row: {
          base_unit_code_snapshot: string
          base_unit_conversion: number
          base_unit_id: string
          base_unit_name_snapshot: string
          base_unit_symbol_snapshot: string
          cost_category_id: string
          created_at: string
          id: string
          line_no: number
          line_subtotal_amount: number
          line_tax_amount: number
          line_total_amount: number
          model_snapshot: string | null
          price_effective_from_snapshot: string
          price_effective_until_snapshot: string | null
          price_list_code_snapshot: string
          price_list_version_snapshot: number
          product_code_snapshot: string
          product_name_snapshot: string
          purchase_requisition_id: string
          purchase_unit_code_snapshot: string
          purchase_unit_id: string
          purchase_unit_name_snapshot: string
          purchase_unit_symbol_snapshot: string
          quantity: number
          sku_code_snapshot: string
          sku_name_snapshot: string
          specification_snapshot: string | null
          supplier_price_list_id: string
          supplier_price_list_item_id: string
          supplier_product_id: string
          supplier_sku_id: string
          tax_inclusive: boolean
          tax_rate: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          base_unit_code_snapshot: string
          base_unit_conversion: number
          base_unit_id: string
          base_unit_name_snapshot: string
          base_unit_symbol_snapshot: string
          cost_category_id: string
          created_at?: string
          id?: string
          line_no: number
          line_subtotal_amount: number
          line_tax_amount: number
          line_total_amount: number
          model_snapshot?: string | null
          price_effective_from_snapshot: string
          price_effective_until_snapshot?: string | null
          price_list_code_snapshot: string
          price_list_version_snapshot: number
          product_code_snapshot: string
          product_name_snapshot: string
          purchase_requisition_id: string
          purchase_unit_code_snapshot: string
          purchase_unit_id: string
          purchase_unit_name_snapshot: string
          purchase_unit_symbol_snapshot: string
          quantity: number
          sku_code_snapshot: string
          sku_name_snapshot: string
          specification_snapshot?: string | null
          supplier_price_list_id: string
          supplier_price_list_item_id: string
          supplier_product_id: string
          supplier_sku_id: string
          tax_inclusive: boolean
          tax_rate: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          base_unit_code_snapshot?: string
          base_unit_conversion?: number
          base_unit_id?: string
          base_unit_name_snapshot?: string
          base_unit_symbol_snapshot?: string
          cost_category_id?: string
          created_at?: string
          id?: string
          line_no?: number
          line_subtotal_amount?: number
          line_tax_amount?: number
          line_total_amount?: number
          model_snapshot?: string | null
          price_effective_from_snapshot?: string
          price_effective_until_snapshot?: string | null
          price_list_code_snapshot?: string
          price_list_version_snapshot?: number
          product_code_snapshot?: string
          product_name_snapshot?: string
          purchase_requisition_id?: string
          purchase_unit_code_snapshot?: string
          purchase_unit_id?: string
          purchase_unit_name_snapshot?: string
          purchase_unit_symbol_snapshot?: string
          quantity?: number
          sku_code_snapshot?: string
          sku_name_snapshot?: string
          specification_snapshot?: string | null
          supplier_price_list_id?: string
          supplier_price_list_item_id?: string
          supplier_product_id?: string
          supplier_sku_id?: string
          tax_inclusive?: boolean
          tax_rate?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_requisition__supplier_price_list_item_id_fkey"
            columns: ["supplier_price_list_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_category_tenant_fkey"
            columns: ["cost_category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_parent_tenant_fkey"
            columns: ["purchase_requisition_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_requisitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_supplier_price_list_id_fkey"
            columns: ["supplier_price_list_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_supplier_sku_id_fkey"
            columns: ["supplier_sku_id"]
            isOneToOne: false
            referencedRelation: "supplier_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisition_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_requisitions: {
        Row: {
          budget_status: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_employee_id: string | null
          created_at: string
          created_by_employee_id: string
          currency: string
          expected_delivery_date: string | null
          id: string
          priced_at: string
          project_id: string
          purchase_order_id: string | null
          reason: string
          remark: string | null
          request_no: string
          review_remark: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          status: string
          submitted_at: string | null
          submitted_by_employee_id: string | null
          subtotal_amount: number
          supplier_id: string
          tax_amount: number
          tenant_id: string
          tenant_supplier_id: string
          total_amount: number
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          budget_status?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_employee_id?: string | null
          created_at?: string
          created_by_employee_id: string
          currency?: string
          expected_delivery_date?: string | null
          id?: string
          priced_at: string
          project_id: string
          purchase_order_id?: string | null
          reason: string
          remark?: string | null
          request_no?: string
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by_employee_id?: string | null
          subtotal_amount?: number
          supplier_id: string
          tax_amount?: number
          tenant_id: string
          tenant_supplier_id: string
          total_amount?: number
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          budget_status?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_employee_id?: string | null
          created_at?: string
          created_by_employee_id?: string
          currency?: string
          expected_delivery_date?: string | null
          id?: string
          priced_at?: string
          project_id?: string
          purchase_order_id?: string | null
          reason?: string
          remark?: string | null
          request_no?: string
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by_employee_id?: string | null
          subtotal_amount?: number
          supplier_id?: string
          tax_amount?: number
          tenant_id?: string
          tenant_supplier_id?: string
          total_amount?: number
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_requisitions_cancelled_by_employee_id_fkey"
            columns: ["cancelled_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_order_tenant_fkey"
            columns: ["purchase_order_id", "tenant_id", "id"]
            isOneToOne: false
            referencedRelation: "supplier_purchase_orders"
            referencedColumns: ["id", "tenant_id", "purchase_requisition_id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_project_tenant_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_relationship_tenant_fkey"
            columns: ["tenant_supplier_id", "tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id", "tenant_id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_submitted_by_employee_id_fkey"
            columns: ["submitted_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_requisitions_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_qualification_types: {
        Row: {
          applicable_supplier_types: string[]
          blocks_new_orders: boolean
          code: string
          created_at: string
          id: string
          is_required: boolean
          name: string
          sort_order: number
          status: string
          updated_at: string
          version: number
          warning_days: number
        }
        Insert: {
          applicable_supplier_types?: string[]
          blocks_new_orders?: boolean
          code: string
          created_at?: string
          id?: string
          is_required?: boolean
          name: string
          sort_order?: number
          status?: string
          updated_at?: string
          version?: number
          warning_days?: number
        }
        Update: {
          applicable_supplier_types?: string[]
          blocks_new_orders?: boolean
          code?: string
          created_at?: string
          id?: string
          is_required?: boolean
          name?: string
          sort_order?: number
          status?: string
          updated_at?: string
          version?: number
          warning_days?: number
        }
        Relationships: []
      }
      supplier_qualifications: {
        Row: {
          certificate_no: string | null
          created_at: string
          created_by_employee_id: string
          document_file_id: string
          id: string
          qualification_type_id: string
          rejection_reason: string | null
          supplier_id: string
          updated_at: string
          updated_by_employee_id: string
          valid_from: string | null
          valid_until: string | null
          verification_status: string
          verified_at: string | null
          verified_by_employee_id: string | null
          version: number
        }
        Insert: {
          certificate_no?: string | null
          created_at?: string
          created_by_employee_id: string
          document_file_id: string
          id?: string
          qualification_type_id: string
          rejection_reason?: string | null
          supplier_id: string
          updated_at?: string
          updated_by_employee_id: string
          valid_from?: string | null
          valid_until?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by_employee_id?: string | null
          version?: number
        }
        Update: {
          certificate_no?: string | null
          created_at?: string
          created_by_employee_id?: string
          document_file_id?: string
          id?: string
          qualification_type_id?: string
          rejection_reason?: string | null
          supplier_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          valid_from?: string | null
          valid_until?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by_employee_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_qualifications_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_qualifications_document_file_id_fkey"
            columns: ["document_file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_qualifications_qualification_type_id_fkey"
            columns: ["qualification_type_id"]
            isOneToOne: false
            referencedRelation: "supplier_qualification_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_qualifications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_qualifications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_qualifications_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_qualifications_verified_by_employee_id_fkey"
            columns: ["verified_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_service_regions: {
        Row: {
          created_at: string
          created_by_employee_id: string
          id: string
          region_code: string
          region_level: string
          status: string
          supplier_id: string
          updated_at: string
          updated_by_employee_id: string
          valid_from: string | null
          valid_until: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by_employee_id: string
          id?: string
          region_code: string
          region_level: string
          status?: string
          supplier_id: string
          updated_at?: string
          updated_by_employee_id: string
          valid_from?: string | null
          valid_until?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by_employee_id?: string
          id?: string
          region_code?: string
          region_level?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          valid_from?: string | null
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_service_regions_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_service_regions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_service_regions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_service_regions_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_sku_unit_conversions: {
        Row: {
          created_at: string
          created_by_employee_id: string
          factor: number
          from_unit_id: string
          id: string
          status: string
          supplier_sku_id: string
          to_unit_id: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by_employee_id: string
          factor: number
          from_unit_id: string
          id?: string
          status?: string
          supplier_sku_id: string
          to_unit_id: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by_employee_id?: string
          factor?: number
          from_unit_id?: string
          id?: string
          status?: string
          supplier_sku_id?: string
          to_unit_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_sku_unit_conversions_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sku_unit_conversions_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sku_unit_conversions_supplier_sku_id_fkey"
            columns: ["supplier_sku_id"]
            isOneToOne: false
            referencedRelation: "supplier_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sku_unit_conversions_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sku_unit_conversions_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_skus: {
        Row: {
          acting_employee_id: string
          acting_tenant_id: string | null
          base_unit_conversion: number
          base_unit_id: string
          batch_managed: boolean
          color_managed: boolean
          created_at: string
          created_by_employee_id: string
          id: string
          model: string | null
          name: string
          operation_source: string
          owner_tenant_id: string | null
          ownership_scope: string | null
          proxy_reason: string | null
          purchase_unit_id: string
          serial_managed: boolean
          sku_code: string
          spec_values: Json | null
          specification: string | null
          status: string
          supplier_id: string
          supplier_product_id: string
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          acting_employee_id: string
          acting_tenant_id?: string | null
          base_unit_conversion: number
          base_unit_id: string
          batch_managed?: boolean
          color_managed?: boolean
          created_at?: string
          created_by_employee_id: string
          id?: string
          model?: string | null
          name: string
          operation_source?: string
          owner_tenant_id?: string | null
          ownership_scope?: string | null
          proxy_reason?: string | null
          purchase_unit_id: string
          serial_managed?: boolean
          sku_code: string
          spec_values?: Json | null
          specification?: string | null
          status?: string
          supplier_id: string
          supplier_product_id: string
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          acting_employee_id?: string
          acting_tenant_id?: string | null
          base_unit_conversion?: number
          base_unit_id?: string
          batch_managed?: boolean
          color_managed?: boolean
          created_at?: string
          created_by_employee_id?: string
          id?: string
          model?: string | null
          name?: string
          operation_source?: string
          owner_tenant_id?: string | null
          ownership_scope?: string | null
          proxy_reason?: string | null
          purchase_unit_id?: string
          serial_managed?: boolean
          sku_code?: string
          spec_values?: Json | null
          specification?: string | null
          status?: string
          supplier_id?: string
          supplier_product_id?: string
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_skus_acting_employee_id_fkey"
            columns: ["acting_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_skus_acting_tenant_id_fkey"
            columns: ["acting_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_skus_acting_tenant_id_fkey"
            columns: ["acting_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_skus_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_skus_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_skus_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "supplier_skus_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_skus_product_supplier_fkey"
            columns: ["supplier_product_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supplier_skus_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "catalog_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_skus_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_skus_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_skus_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          blacklist_reason: string | null
          blacklisted_at: string | null
          blacklisted_by_employee_id: string | null
          code: string
          created_at: string
          created_by_employee_id: string
          id: string
          legal_name: string
          legal_representative_name: string | null
          name: string
          onboarding_status: string
          operational_status: string
          owner_tenant_id: string | null
          ownership_scope: string
          registered_address_text: string | null
          review_remark: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          supplier_type: string
          unified_social_credit_code: string | null
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          blacklist_reason?: string | null
          blacklisted_at?: string | null
          blacklisted_by_employee_id?: string | null
          code: string
          created_at?: string
          created_by_employee_id: string
          id?: string
          legal_name: string
          legal_representative_name?: string | null
          name: string
          onboarding_status?: string
          operational_status?: string
          owner_tenant_id?: string | null
          ownership_scope?: string
          registered_address_text?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          supplier_type: string
          unified_social_credit_code?: string | null
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          blacklist_reason?: string | null
          blacklisted_at?: string | null
          blacklisted_by_employee_id?: string | null
          code?: string
          created_at?: string
          created_by_employee_id?: string
          id?: string
          legal_name?: string
          legal_representative_name?: string | null
          name?: string
          onboarding_status?: string
          operational_status?: string
          owner_tenant_id?: string | null
          ownership_scope?: string
          registered_address_text?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          supplier_type?: string
          unified_social_credit_code?: string | null
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_blacklisted_by_employee_id_fkey"
            columns: ["blacklisted_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "suppliers_owner_tenant_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      system_setting_change_logs: {
        Row: {
          changed_by_employee_id: string | null
          created_at: string
          id: string
          new_value_text: string | null
          old_value_text: string | null
          setting_key: string
          tenant_id: string | null
        }
        Insert: {
          changed_by_employee_id?: string | null
          created_at?: string
          id?: string
          new_value_text?: string | null
          old_value_text?: string | null
          setting_key: string
          tenant_id?: string | null
        }
        Update: {
          changed_by_employee_id?: string | null
          created_at?: string
          id?: string
          new_value_text?: string | null
          old_value_text?: string | null
          setting_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_setting_change_logs_changed_by_employee_id_fkey"
            columns: ["changed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_setting_change_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "system_setting_change_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          group_code: string
          id: string
          is_secret: boolean
          key: string
          name: string
          status: string
          tenant_id: string | null
          updated_at: string
          updated_by_employee_id: string | null
          value_text: string | null
          value_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_code: string
          id?: string
          is_secret?: boolean
          key: string
          name: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          value_text?: string | null
          value_type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          group_code?: string
          id?: string
          is_secret?: boolean
          key?: string
          name?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string | null
          value_text?: string | null
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_settings_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_addon_orders: {
        Row: {
          amount_fen: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          close_reason: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          expected_guard_version: number
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string
          metadata: Json
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_appid: string
          payment_config_id: string
          payment_expires_at: string
          payment_mchid: string
          prepay_id: string | null
          product_code: string
          product_id: string
          product_name: string
          purchase_notes: string
          refund_policy: string
          status: string
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_fen: number
          channel?: string
          close_attempt_count?: number
          close_claim_expires_at?: string | null
          close_claim_token?: string | null
          close_last_error?: string | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          created_by: string
          entitlement_code: string
          entitlement_event_id?: string | null
          expected_guard_version: number
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          order_no: string
          out_trade_no: string
          paid_amount_fen?: number | null
          paid_at?: string | null
          payer_openid: string
          payment_appid: string
          payment_config_id: string
          payment_expires_at: string
          payment_mchid: string
          prepay_id?: string | null
          product_code: string
          product_id: string
          product_name: string
          purchase_notes: string
          refund_policy: string
          status?: string
          tenant_id: string
          term_years: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_fen?: number
          channel?: string
          close_attempt_count?: number
          close_claim_expires_at?: string | null
          close_claim_token?: string | null
          close_last_error?: string | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          entitlement_code?: string
          entitlement_event_id?: string | null
          expected_guard_version?: number
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          order_no?: string
          out_trade_no?: string
          paid_amount_fen?: number | null
          paid_at?: string | null
          payer_openid?: string
          payment_appid?: string
          payment_config_id?: string
          payment_expires_at?: string
          payment_mchid?: string
          prepay_id?: string | null
          product_code?: string
          product_id?: string
          product_name?: string
          purchase_notes?: string
          refund_policy?: string
          status?: string
          tenant_id?: string
          term_years?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_addon_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_addon_orders_entitlement_event_identity_fkey"
            columns: ["entitlement_event_id", "tenant_id", "entitlement_code"]
            isOneToOne: false
            referencedRelation: "tenant_entitlement_events"
            referencedColumns: ["id", "tenant_id", "entitlement_code"]
          },
          {
            foreignKeyName: "tenant_addon_orders_payment_config_id_fkey"
            columns: ["payment_config_id"]
            isOneToOne: false
            referencedRelation: "platform_payment_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_addon_orders_product_identity_fkey"
            columns: ["product_id", "product_code"]
            isOneToOne: false
            referencedRelation: "platform_addon_products"
            referencedColumns: ["id", "code"]
          },
          {
            foreignKeyName: "tenant_addon_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_addon_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_addon_wechat_notifications: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          notify_id: string
          order_id: string
          processed: boolean
          processed_at: string | null
          raw_payload: Json
          resource_type: string
          signature_valid: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          notify_id: string
          order_id: string
          processed?: boolean
          processed_at?: string | null
          raw_payload?: Json
          resource_type: string
          signature_valid?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          notify_id?: string
          order_id?: string
          processed?: boolean
          processed_at?: string | null
          raw_payload?: Json
          resource_type?: string
          signature_valid?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_addon_wechat_notifications_order_identity_fkey"
            columns: ["order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_addon_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_addon_wechat_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_addon_wechat_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_billing_events: {
        Row: {
          billable_units: number
          created_at: string
          credits: number
          failure_code: string | null
          failure_message: string | null
          id: string
          metric_code: string
          model: string | null
          pricing_rule_id: string | null
          pricing_snapshot: Json
          provider: string | null
          provider_request_id: string | null
          raw_usage: Json
          scene_code: string | null
          settled_at: string | null
          source_id: string
          source_sub_id: string | null
          source_type: string
          status: string
          tenant_id: string
          unit_name: string
          unit_price_credits: number
          updated_at: string
        }
        Insert: {
          billable_units: number
          created_at?: string
          credits: number
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          metric_code: string
          model?: string | null
          pricing_rule_id?: string | null
          pricing_snapshot?: Json
          provider?: string | null
          provider_request_id?: string | null
          raw_usage?: Json
          scene_code?: string | null
          settled_at?: string | null
          source_id: string
          source_sub_id?: string | null
          source_type: string
          status?: string
          tenant_id: string
          unit_name: string
          unit_price_credits: number
          updated_at?: string
        }
        Update: {
          billable_units?: number
          created_at?: string
          credits?: number
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          metric_code?: string
          model?: string | null
          pricing_rule_id?: string | null
          pricing_snapshot?: Json
          provider?: string | null
          provider_request_id?: string | null
          raw_usage?: Json
          scene_code?: string | null
          settled_at?: string | null
          source_id?: string
          source_sub_id?: string | null
          source_type?: string
          status?: string
          tenant_id?: string
          unit_name?: string
          unit_price_credits?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_billing_plans: {
        Row: {
          code: string
          created_at: string
          enabled: boolean
          id: string
          metadata: Json
          monthly_fee_credits: number
          name: string
          period: string
          reminder_days_before_due: number
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          enabled?: boolean
          id?: string
          metadata?: Json
          monthly_fee_credits: number
          name: string
          period?: string
          reminder_days_before_due?: number
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          enabled?: boolean
          id?: string
          metadata?: Json
          monthly_fee_credits?: number
          name?: string
          period?: string
          reminder_days_before_due?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      tenant_billing_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          last_invoice_id: string | null
          lock_reason: string | null
          locked_at: string | null
          metadata: Json
          next_charge_at: string
          plan_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          last_invoice_id?: string | null
          lock_reason?: string | null
          locked_at?: string | null
          metadata?: Json
          next_charge_at: string
          plan_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          last_invoice_id?: string | null
          lock_reason?: string | null
          locked_at?: string | null
          metadata?: Json
          next_charge_at?: string
          plan_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_billing_subscriptions_last_invoice_tenant_fkey"
            columns: ["last_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscription_invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_billing_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "tenant_billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_billing_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_billing_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_credit_accounts: {
        Row: {
          balance_credits: number
          created_at: string
          expires_at: string | null
          frozen_credits: number
          id: string
          is_test: boolean
          last_activity_at: string | null
          last_recharged_at: string | null
          status: string
          tenant_id: string
          total_consumed_credits: number
          total_granted_credits: number
          total_recharged_credits: number
          updated_at: string
        }
        Insert: {
          balance_credits?: number
          created_at?: string
          expires_at?: string | null
          frozen_credits?: number
          id?: string
          is_test?: boolean
          last_activity_at?: string | null
          last_recharged_at?: string | null
          status?: string
          tenant_id: string
          total_consumed_credits?: number
          total_granted_credits?: number
          total_recharged_credits?: number
          updated_at?: string
        }
        Update: {
          balance_credits?: number
          created_at?: string
          expires_at?: string | null
          frozen_credits?: number
          id?: string
          is_test?: boolean
          last_activity_at?: string | null
          last_recharged_at?: string | null
          status?: string
          tenant_id?: string
          total_consumed_credits?: number
          total_granted_credits?: number
          total_recharged_credits?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credit_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_credit_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_credit_ledger: {
        Row: {
          account_id: string
          balance_after: number
          change_credits: number
          correlation_id: string | null
          created_at: string
          direction: string
          event_type: string
          frozen_after: number
          id: string
          operator_user_id: string | null
          pricing_snapshot: Json
          remark: string | null
          source_id: string | null
          source_no: string | null
          source_type: string | null
          tenant_id: string
        }
        Insert: {
          account_id: string
          balance_after: number
          change_credits: number
          correlation_id?: string | null
          created_at?: string
          direction: string
          event_type: string
          frozen_after: number
          id?: string
          operator_user_id?: string | null
          pricing_snapshot?: Json
          remark?: string | null
          source_id?: string | null
          source_no?: string | null
          source_type?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string
          balance_after?: number
          change_credits?: number
          correlation_id?: string | null
          created_at?: string
          direction?: string
          event_type?: string
          frozen_after?: number
          id?: string
          operator_user_id?: string | null
          pricing_snapshot?: Json
          remark?: string | null
          source_id?: string | null
          source_no?: string | null
          source_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credit_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "tenant_credit_account_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_credit_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "tenant_credit_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_credit_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_credit_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_credit_orders: {
        Row: {
          amount_fen: number
          bonus_credits: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          credits: number
          id: string
          idempotency_key: string | null
          latest_notification_id: string | null
          metadata: Json
          order_no: string
          out_trade_no: string | null
          package_code: string | null
          paid_amount_fen: number
          paid_at: string | null
          payment_config_id: string | null
          payment_expires_at: string | null
          prepay_id: string | null
          refund_amount_fen: number | null
          refund_requested_at: string | null
          refund_status: string | null
          refunded_at: string | null
          remark: string | null
          status: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_fen: number
          bonus_credits?: number
          channel: string
          close_attempt_count?: number
          close_claim_expires_at?: string | null
          close_claim_token?: string | null
          close_last_error?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          credits: number
          id?: string
          idempotency_key?: string | null
          latest_notification_id?: string | null
          metadata?: Json
          order_no: string
          out_trade_no?: string | null
          package_code?: string | null
          paid_amount_fen?: number
          paid_at?: string | null
          payment_config_id?: string | null
          payment_expires_at?: string | null
          prepay_id?: string | null
          refund_amount_fen?: number | null
          refund_requested_at?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          remark?: string | null
          status: string
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_fen?: number
          bonus_credits?: number
          channel?: string
          close_attempt_count?: number
          close_claim_expires_at?: string | null
          close_claim_token?: string | null
          close_last_error?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          credits?: number
          id?: string
          idempotency_key?: string | null
          latest_notification_id?: string | null
          metadata?: Json
          order_no?: string
          out_trade_no?: string | null
          package_code?: string | null
          paid_amount_fen?: number
          paid_at?: string | null
          payment_config_id?: string | null
          payment_expires_at?: string | null
          prepay_id?: string | null
          refund_amount_fen?: number | null
          refund_requested_at?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          remark?: string | null
          status?: string
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credit_orders_payment_config_id_fkey"
            columns: ["payment_config_id"]
            isOneToOne: false
            referencedRelation: "platform_payment_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_credit_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_credit_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_credit_refund_requests: {
        Row: {
          created_at: string
          failure_message: string | null
          id: string
          idempotency_key: string
          metadata: Json
          order_id: string
          out_refund_no: string | null
          reason: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_last_checked_at: string | null
          reconcile_last_error: string | null
          reconcile_next_at: string | null
          refund_amount_fen: number | null
          refunded_at: string | null
          request_no: string
          requested_amount_fen: number
          requested_by_employee_id: string | null
          requested_credits: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          wechat_refund_id: string | null
        }
        Insert: {
          created_at?: string
          failure_message?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          order_id: string
          out_refund_no?: string | null
          reason: string
          reconcile_attempt_count?: number
          reconcile_claim_expires_at?: string | null
          reconcile_claim_token?: string | null
          reconcile_last_checked_at?: string | null
          reconcile_last_error?: string | null
          reconcile_next_at?: string | null
          refund_amount_fen?: number | null
          refunded_at?: string | null
          request_no: string
          requested_amount_fen: number
          requested_by_employee_id?: string | null
          requested_credits: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          wechat_refund_id?: string | null
        }
        Update: {
          created_at?: string
          failure_message?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          order_id?: string
          out_refund_no?: string | null
          reason?: string
          reconcile_attempt_count?: number
          reconcile_claim_expires_at?: string | null
          reconcile_claim_token?: string | null
          reconcile_last_checked_at?: string | null
          reconcile_last_error?: string | null
          reconcile_next_at?: string | null
          refund_amount_fen?: number | null
          refunded_at?: string | null
          request_no?: string
          requested_amount_fen?: number
          requested_by_employee_id?: string | null
          requested_credits?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          wechat_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credit_refund_requests_order_tenant_fkey"
            columns: ["order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_credit_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_credit_refund_requests_requested_by_employee_id_fkey"
            columns: ["requested_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_credit_refund_requests_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_credit_refund_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_credit_refund_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_credit_wechat_notifications: {
        Row: {
          created_at: string
          credit_order_id: string | null
          error_message: string | null
          event_type: string
          id: string
          notify_id: string
          processed: boolean
          processed_at: string | null
          raw_payload: Json
          resource_type: string | null
          signature_valid: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_order_id?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          notify_id: string
          processed?: boolean
          processed_at?: string | null
          raw_payload?: Json
          resource_type?: string | null
          signature_valid?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_order_id?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          notify_id?: string
          processed?: boolean
          processed_at?: string | null
          raw_payload?: Json
          resource_type?: string | null
          signature_valid?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credit_wechat_notifications_credit_order_id_fkey"
            columns: ["credit_order_id"]
            isOneToOne: false
            referencedRelation: "tenant_credit_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_credit_wechat_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_credit_wechat_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_departments: {
        Row: {
          alias_name: string
          code: string
          created_at: string
          enabled: boolean
          id: string
          manager_employee_id: string | null
          sort: number
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alias_name: string
          code: string
          created_at?: string
          enabled?: boolean
          id?: string
          manager_employee_id?: string | null
          sort?: number
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alias_name?: string
          code?: string
          created_at?: string
          enabled?: boolean
          id?: string
          manager_employee_id?: string | null
          sort?: number
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_departments_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_departments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "department_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_devices: {
        Row: {
          bound_camera_id: string | null
          bound_project_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          device_type: string | null
          id: string
          last_synced_at: string | null
          metadata: Json
          raw_status: string | null
          source_project_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vendor: string
          vendor_channel_code: string | null
          vendor_channel_id: string | null
          vendor_channel_name: string | null
          vendor_device_code: string | null
          vendor_device_name: string | null
          vendor_device_serial: string
        }
        Insert: {
          bound_camera_id?: string | null
          bound_project_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          device_type?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          raw_status?: string | null
          source_project_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vendor: string
          vendor_channel_code?: string | null
          vendor_channel_id?: string | null
          vendor_channel_name?: string | null
          vendor_device_code?: string | null
          vendor_device_name?: string | null
          vendor_device_serial: string
        }
        Update: {
          bound_camera_id?: string | null
          bound_project_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          device_type?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          raw_status?: string | null
          source_project_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vendor?: string
          vendor_channel_code?: string | null
          vendor_channel_id?: string | null
          vendor_channel_name?: string | null
          vendor_device_code?: string | null
          vendor_device_name?: string | null
          vendor_device_serial?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_devices_bound_camera_id_fkey"
            columns: ["bound_camera_id"]
            isOneToOne: false
            referencedRelation: "project_cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_devices_bound_project_id_fkey"
            columns: ["bound_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_devices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_devices_source_project_id_fkey"
            columns: ["source_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_devices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_entitlement_events: {
        Row: {
          actor_employee_id: string | null
          actor_user_id: string | null
          created_at: string
          entitlement_code: string
          entitlement_id: string
          event_type: string
          id: string
          new_value: Json
          old_value: Json
          reason: string | null
          reverses_event_id: string | null
          source_id: string | null
          source_type: string
          tenant_id: string
        }
        Insert: {
          actor_employee_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          entitlement_code: string
          entitlement_id: string
          event_type: string
          id?: string
          new_value: Json
          old_value: Json
          reason?: string | null
          reverses_event_id?: string | null
          source_id?: string | null
          source_type: string
          tenant_id: string
        }
        Update: {
          actor_employee_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          entitlement_code?: string
          entitlement_id?: string
          event_type?: string
          id?: string
          new_value?: Json
          old_value?: Json
          reason?: string | null
          reverses_event_id?: string | null
          source_id?: string | null
          source_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_entitlement_events_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_entitlement_events_entitlement_identity_fkey"
            columns: ["entitlement_id", "tenant_id", "entitlement_code"]
            isOneToOne: false
            referencedRelation: "tenant_entitlements"
            referencedColumns: ["id", "tenant_id", "entitlement_code"]
          },
          {
            foreignKeyName: "tenant_entitlement_events_reverses_event_id_fkey"
            columns: ["reverses_event_id"]
            isOneToOne: false
            referencedRelation: "tenant_entitlement_events"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_entitlements: {
        Row: {
          created_at: string
          entitlement_code: string
          expires_at: string
          id: string
          source_id: string | null
          source_type: string
          starts_at: string
          status: string
          suspend_reason: string | null
          suspended_at: string | null
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          entitlement_code: string
          expires_at: string
          id?: string
          source_id?: string | null
          source_type: string
          starts_at: string
          status?: string
          suspend_reason?: string | null
          suspended_at?: string | null
          tenant_id: string
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          entitlement_code?: string
          expires_at?: string
          id?: string
          source_id?: string | null
          source_type?: string
          starts_at?: string
          status?: string
          suspend_reason?: string | null
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by_employee_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_entitlements_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_application_reviews: {
        Row: {
          actor_employee_id: string | null
          actor_partner_member_id: string | null
          actor_type: string
          actor_visitor_id: string | null
          after_partner_assist_status: string | null
          after_status: string | null
          application_id: string
          before_partner_assist_status: string | null
          before_status: string | null
          created_at: string
          decision: string
          id: string
          metadata: Json
          remark: string | null
          required_fields: string[]
          review_stage: string
        }
        Insert: {
          actor_employee_id?: string | null
          actor_partner_member_id?: string | null
          actor_type: string
          actor_visitor_id?: string | null
          after_partner_assist_status?: string | null
          after_status?: string | null
          application_id: string
          before_partner_assist_status?: string | null
          before_status?: string | null
          created_at?: string
          decision: string
          id?: string
          metadata?: Json
          remark?: string | null
          required_fields?: string[]
          review_stage: string
        }
        Update: {
          actor_employee_id?: string | null
          actor_partner_member_id?: string | null
          actor_type?: string
          actor_visitor_id?: string | null
          after_partner_assist_status?: string | null
          after_status?: string | null
          application_id?: string
          before_partner_assist_status?: string | null
          before_status?: string | null
          created_at?: string
          decision?: string
          id?: string
          metadata?: Json
          remark?: string | null
          required_fields?: string[]
          review_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_application_revi_actor_partner_member_id_fkey"
            columns: ["actor_partner_member_id"]
            isOneToOne: false
            referencedRelation: "platform_partner_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_application_reviews_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_application_reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "tenant_onboarding_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_applications: {
        Row: {
          address: string
          address_city: string
          address_district: string | null
          address_latitude: number | null
          address_longitude: number | null
          address_province: string | null
          address_region_code: string
          admin_name: string
          admin_phone: string
          application_no: string
          attribution_source_type: string | null
          business_license_file_id: string
          candidate_match_reason: string | null
          candidate_partner_id: string | null
          candidate_snapshot: Json
          company_name: string
          consented_at: string
          converted_tenant_id: string | null
          created_at: string
          final_partner_id: string | null
          id: string
          idempotency_key: string
          invite_code_id: string | null
          onboarding_terms_version: string
          partner_assist_due_at: string | null
          partner_assist_requested_at: string | null
          partner_assist_status: string
          privacy_policy_version: string
          review_remark: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          service_region_codes: string[]
          source_channel: string
          status: string
          unified_social_credit_code: string
          updated_at: string
          version: number
          visitor_context_id: string | null
          visitor_id: string
          withdrawn_at: string | null
        }
        Insert: {
          address: string
          address_city: string
          address_district?: string | null
          address_latitude?: number | null
          address_longitude?: number | null
          address_province?: string | null
          address_region_code: string
          admin_name: string
          admin_phone: string
          application_no: string
          attribution_source_type?: string | null
          business_license_file_id: string
          candidate_match_reason?: string | null
          candidate_partner_id?: string | null
          candidate_snapshot?: Json
          company_name: string
          consented_at: string
          converted_tenant_id?: string | null
          created_at?: string
          final_partner_id?: string | null
          id?: string
          idempotency_key: string
          invite_code_id?: string | null
          onboarding_terms_version: string
          partner_assist_due_at?: string | null
          partner_assist_requested_at?: string | null
          partner_assist_status?: string
          privacy_policy_version: string
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          service_region_codes: string[]
          source_channel: string
          status?: string
          unified_social_credit_code: string
          updated_at?: string
          version?: number
          visitor_context_id?: string | null
          visitor_id: string
          withdrawn_at?: string | null
        }
        Update: {
          address?: string
          address_city?: string
          address_district?: string | null
          address_latitude?: number | null
          address_longitude?: number | null
          address_province?: string | null
          address_region_code?: string
          admin_name?: string
          admin_phone?: string
          application_no?: string
          attribution_source_type?: string | null
          business_license_file_id?: string
          candidate_match_reason?: string | null
          candidate_partner_id?: string | null
          candidate_snapshot?: Json
          company_name?: string
          consented_at?: string
          converted_tenant_id?: string | null
          created_at?: string
          final_partner_id?: string | null
          id?: string
          idempotency_key?: string
          invite_code_id?: string | null
          onboarding_terms_version?: string
          partner_assist_due_at?: string | null
          partner_assist_requested_at?: string | null
          partner_assist_status?: string
          privacy_policy_version?: string
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          service_region_codes?: string[]
          source_channel?: string
          status?: string
          unified_social_credit_code?: string
          updated_at?: string
          version?: number
          visitor_context_id?: string | null
          visitor_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_applications_business_license_file_id_fkey"
            columns: ["business_license_file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_applications_candidate_partner_id_fkey"
            columns: ["candidate_partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_applications_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_onboarding_applications_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_applications_final_partner_id_fkey"
            columns: ["final_partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_applications_invite_code_id_fkey"
            columns: ["invite_code_id"]
            isOneToOne: false
            referencedRelation: "platform_partner_invite_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_applications_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_applications_visitor_context_id_fkey"
            columns: ["visitor_context_id"]
            isOneToOne: false
            referencedRelation: "user_location_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_notification_deliveries: {
        Row: {
          application_id: string
          application_version: number
          attempt_count: number
          channel: string
          claim_expires_at: string | null
          claim_token: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          application_version: number
          attempt_count?: number
          channel?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          application_version?: number
          attempt_count?: number
          channel?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_notification_deliveries_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "tenant_onboarding_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_panorama_assets: {
        Row: {
          capture_direction: string | null
          created_at: string
          created_by_auth_user_id: string | null
          created_by_employee_id: string | null
          customer_id: string | null
          deleted_at: string | null
          description: string | null
          error_code: string | null
          error_message: string | null
          expected_angle_step: number | null
          height: number | null
          horizontal_angle_of_view: number | null
          id: string
          input_count: number
          input_total_bytes: number
          latest_job_id: string | null
          manifest_path: string | null
          metadata: Json
          output_projection: string | null
          panorama_path: string | null
          preview_path: string | null
          project_id: string | null
          property_id: string | null
          quality_score: number | null
          shooting_mode: string
          source_type: string
          status: string
          storage_bucket: string
          storage_provider: string
          storage_region: string | null
          tenant_id: string
          tile_base_path: string | null
          title: string
          updated_at: string
          vertical_angle_of_view: number | null
          vertical_offset: number | null
          width: number | null
        }
        Insert: {
          capture_direction?: string | null
          created_at?: string
          created_by_auth_user_id?: string | null
          created_by_employee_id?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          description?: string | null
          error_code?: string | null
          error_message?: string | null
          expected_angle_step?: number | null
          height?: number | null
          horizontal_angle_of_view?: number | null
          id?: string
          input_count?: number
          input_total_bytes?: number
          latest_job_id?: string | null
          manifest_path?: string | null
          metadata?: Json
          output_projection?: string | null
          panorama_path?: string | null
          preview_path?: string | null
          project_id?: string | null
          property_id?: string | null
          quality_score?: number | null
          shooting_mode?: string
          source_type?: string
          status?: string
          storage_bucket?: string
          storage_provider?: string
          storage_region?: string | null
          tenant_id: string
          tile_base_path?: string | null
          title: string
          updated_at?: string
          vertical_angle_of_view?: number | null
          vertical_offset?: number | null
          width?: number | null
        }
        Update: {
          capture_direction?: string | null
          created_at?: string
          created_by_auth_user_id?: string | null
          created_by_employee_id?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          description?: string | null
          error_code?: string | null
          error_message?: string | null
          expected_angle_step?: number | null
          height?: number | null
          horizontal_angle_of_view?: number | null
          id?: string
          input_count?: number
          input_total_bytes?: number
          latest_job_id?: string | null
          manifest_path?: string | null
          metadata?: Json
          output_projection?: string | null
          panorama_path?: string | null
          preview_path?: string | null
          project_id?: string | null
          property_id?: string | null
          quality_score?: number | null
          shooting_mode?: string
          source_type?: string
          status?: string
          storage_bucket?: string
          storage_provider?: string
          storage_region?: string | null
          tenant_id?: string
          tile_base_path?: string | null
          title?: string
          updated_at?: string
          vertical_angle_of_view?: number | null
          vertical_offset?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_panorama_assets_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_panorama_assets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_panorama_assets_latest_job_id_fkey"
            columns: ["latest_job_id"]
            isOneToOne: false
            referencedRelation: "tenant_panorama_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_panorama_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_panorama_assets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_panorama_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_panorama_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_panorama_jobs: {
        Row: {
          asset_id: string
          attempt: number
          completed_at: string | null
          created_at: string
          created_by_auth_user_id: string | null
          created_by_employee_id: string | null
          error_code: string | null
          error_detail: Json
          error_message: string | null
          id: string
          input_metadata: Json
          input_paths: Json
          job_type: string
          output: Json
          priority: number
          quality_score: number | null
          queued_at: string
          started_at: string | null
          status: string
          tenant_id: string
          timeout_at: string | null
          updated_at: string
          worker_options: Json
        }
        Insert: {
          asset_id: string
          attempt?: number
          completed_at?: string | null
          created_at?: string
          created_by_auth_user_id?: string | null
          created_by_employee_id?: string | null
          error_code?: string | null
          error_detail?: Json
          error_message?: string | null
          id?: string
          input_metadata?: Json
          input_paths?: Json
          job_type: string
          output?: Json
          priority?: number
          quality_score?: number | null
          queued_at?: string
          started_at?: string | null
          status?: string
          tenant_id: string
          timeout_at?: string | null
          updated_at?: string
          worker_options?: Json
        }
        Update: {
          asset_id?: string
          attempt?: number
          completed_at?: string | null
          created_at?: string
          created_by_auth_user_id?: string | null
          created_by_employee_id?: string | null
          error_code?: string | null
          error_detail?: Json
          error_message?: string | null
          id?: string
          input_metadata?: Json
          input_paths?: Json
          job_type?: string
          output?: Json
          priority?: number
          quality_score?: number | null
          queued_at?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          timeout_at?: string | null
          updated_at?: string
          worker_options?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tenant_panorama_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "tenant_panorama_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_panorama_jobs_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_panorama_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_panorama_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_partner_bindings: {
        Row: {
          bound_at: string
          change_reason: string | null
          changed_by_employee_id: string | null
          created_at: string
          id: string
          invite_code_id: string | null
          partner_id: string
          source_id: string | null
          source_type: string
          status: string
          tenant_id: string
          unbound_at: string | null
          updated_at: string
        }
        Insert: {
          bound_at?: string
          change_reason?: string | null
          changed_by_employee_id?: string | null
          created_at?: string
          id?: string
          invite_code_id?: string | null
          partner_id: string
          source_id?: string | null
          source_type: string
          status?: string
          tenant_id: string
          unbound_at?: string | null
          updated_at?: string
        }
        Update: {
          bound_at?: string
          change_reason?: string | null
          changed_by_employee_id?: string | null
          created_at?: string
          id?: string
          invite_code_id?: string | null
          partner_id?: string
          source_id?: string | null
          source_type?: string
          status?: string
          tenant_id?: string
          unbound_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_partner_bindings_changed_by_employee_id_fkey"
            columns: ["changed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_partner_bindings_invite_code_id_fkey"
            columns: ["invite_code_id"]
            isOneToOne: false
            referencedRelation: "platform_partner_invite_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_partner_bindings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "platform_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_partner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_partner_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_configs: {
        Row: {
          app_id: string | null
          appid_binding_message: string | null
          appid_binding_state: string
          applyment_business_code: string | null
          applyment_id: string | null
          applyment_state: string
          applyment_state_message: string | null
          created_at: string
          created_by_employee_id: string | null
          disabled_at: string | null
          enabled_at: string | null
          enabled_channels: Json
          encrypted_config_ref: string | null
          id: string
          last_validated_at: string | null
          merchant_id: string | null
          merchant_mode: string
          merchant_name: string | null
          notify_url: string | null
          opened_at: string | null
          platform_payment_config_id: string | null
          principal_type: string
          provider: string
          risk_switches: Json
          serial_no: string | null
          settlement_account_summary: string | null
          status: string
          sub_app_id: string | null
          sub_merchant_id: string | null
          suspended_at: string | null
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string | null
          validation_status: string
        }
        Insert: {
          app_id?: string | null
          appid_binding_message?: string | null
          appid_binding_state?: string
          applyment_business_code?: string | null
          applyment_id?: string | null
          applyment_state?: string
          applyment_state_message?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          disabled_at?: string | null
          enabled_at?: string | null
          enabled_channels?: Json
          encrypted_config_ref?: string | null
          id?: string
          last_validated_at?: string | null
          merchant_id?: string | null
          merchant_mode: string
          merchant_name?: string | null
          notify_url?: string | null
          opened_at?: string | null
          platform_payment_config_id?: string | null
          principal_type?: string
          provider: string
          risk_switches?: Json
          serial_no?: string | null
          settlement_account_summary?: string | null
          status?: string
          sub_app_id?: string | null
          sub_merchant_id?: string | null
          suspended_at?: string | null
          tenant_id: string
          updated_at?: string
          updated_by_employee_id?: string | null
          validation_status?: string
        }
        Update: {
          app_id?: string | null
          appid_binding_message?: string | null
          appid_binding_state?: string
          applyment_business_code?: string | null
          applyment_id?: string | null
          applyment_state?: string
          applyment_state_message?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          disabled_at?: string | null
          enabled_at?: string | null
          enabled_channels?: Json
          encrypted_config_ref?: string | null
          id?: string
          last_validated_at?: string | null
          merchant_id?: string | null
          merchant_mode?: string
          merchant_name?: string | null
          notify_url?: string | null
          opened_at?: string | null
          platform_payment_config_id?: string | null
          principal_type?: string
          provider?: string
          risk_switches?: Json
          serial_no?: string | null
          settlement_account_summary?: string | null
          status?: string
          sub_app_id?: string | null
          sub_merchant_id?: string | null
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by_employee_id?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_configs_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_payment_configs_platform_payment_config_id_fkey"
            columns: ["platform_payment_config_id"]
            isOneToOne: false
            referencedRelation: "platform_payment_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_payment_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_payment_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_payment_configs_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_pricing_rules: {
        Row: {
          created_at: string
          effective_at: string
          enabled: boolean
          expires_at: string | null
          id: string
          metric_code: string
          min_charge_credits: number
          model_code: string | null
          priority: number
          provider_code: string | null
          rule_group_id: string | null
          scene_code: string | null
          tenant_id: string | null
          unit_name: string
          unit_price_credits: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          effective_at?: string
          enabled?: boolean
          expires_at?: string | null
          id?: string
          metric_code: string
          min_charge_credits?: number
          model_code?: string | null
          priority?: number
          provider_code?: string | null
          rule_group_id?: string | null
          scene_code?: string | null
          tenant_id?: string | null
          unit_name: string
          unit_price_credits: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          effective_at?: string
          enabled?: boolean
          expires_at?: string | null
          id?: string
          metric_code?: string
          min_charge_credits?: number
          model_code?: string | null
          priority?: number
          provider_code?: string | null
          rule_group_id?: string | null
          scene_code?: string | null
          tenant_id?: string | null
          unit_name?: string
          unit_price_credits?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_pricing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_pricing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_acceptance_preparations: {
        Row: {
          acceptance_due_at: string | null
          created_at: string
          id: string
          prepared_at: string
          prepared_by_employee_id: string
          service_order_id: string
          status: string
          submitted_at: string | null
          summary: string
          tenant_id: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          acceptance_due_at?: string | null
          created_at?: string
          id?: string
          prepared_at?: string
          prepared_by_employee_id: string
          service_order_id: string
          status?: string
          submitted_at?: string | null
          summary: string
          tenant_id: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          acceptance_due_at?: string | null
          created_at?: string
          id?: string
          prepared_at?: string
          prepared_by_employee_id?: string
          service_order_id?: string
          status?: string
          submitted_at?: string | null
          summary?: string
          tenant_id?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_acceptance_preparat_prepared_by_employee_id_fkey"
            columns: ["prepared_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_acceptance_preparations_order_identity_fkey"
            columns: ["service_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_acceptance_preparations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_acceptance_preparations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_acceptance_preparations_work_order_identity_fkey"
            columns: ["work_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_work_orders"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_areas: {
        Row: {
          adcode: string | null
          center_latitude: number | null
          center_longitude: number | null
          city: string
          created_at: string
          district: string | null
          id: string
          priority: number
          province: string | null
          service_radius_km: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          adcode?: string | null
          center_latitude?: number | null
          center_longitude?: number | null
          city: string
          created_at?: string
          district?: string | null
          id?: string
          priority?: number
          province?: string | null
          service_radius_km?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          adcode?: string | null
          center_latitude?: number | null
          center_longitude?: number | null
          city?: string
          created_at?: string
          district?: string | null
          id?: string
          priority?: number
          province?: string | null
          service_radius_km?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_contract_periods: {
        Row: {
          accepted_at: string
          adjustment_reason: string | null
          contract_id: string
          created_at: string
          ends_at: string
          id: string
          metadata: Json
          original_ends_at: string
          original_starts_at: string
          refund_request_id: string | null
          service_order_id: string
          starts_at: string
          status: string
          tenant_id: string
          term_years: number
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at: string
          adjustment_reason?: string | null
          contract_id: string
          created_at?: string
          ends_at: string
          id?: string
          metadata?: Json
          original_ends_at: string
          original_starts_at: string
          refund_request_id?: string | null
          service_order_id: string
          starts_at: string
          status?: string
          tenant_id: string
          term_years: number
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string
          adjustment_reason?: string | null
          contract_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          metadata?: Json
          original_ends_at?: string
          original_starts_at?: string
          refund_request_id?: string | null
          service_order_id?: string
          starts_at?: string
          status?: string
          tenant_id?: string
          term_years?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_contract_periods_contract_identity_fkey"
            columns: ["contract_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_contracts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_contract_periods_order_identity_fkey"
            columns: ["service_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_contract_periods_refund_identity_fkey"
            columns: ["refund_request_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_refund_requests"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_contracts: {
        Row: {
          created_at: string
          id: string
          last_period_id: string | null
          service_end_at: string
          service_family: string
          service_start_at: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_period_id?: string | null
          service_end_at: string
          service_family?: string
          service_start_at: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_period_id?: string | null
          service_end_at?: string
          service_family?: string
          service_start_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_contracts_last_period_fkey"
            columns: ["last_period_id", "id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_contract_periods"
            referencedColumns: ["id", "contract_id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_fulfillment_attachments: {
        Row: {
          created_at: string
          created_by_employee_id: string
          file_id: string
          file_name: string | null
          fulfillment_record_id: string | null
          id: string
          mime_type: string | null
          service_order_id: string
          size_bytes: number | null
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by_employee_id: string
          file_id: string
          file_name?: string | null
          fulfillment_record_id?: string | null
          id?: string
          mime_type?: string | null
          service_order_id: string
          size_bytes?: number | null
          tenant_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by_employee_id?: string
          file_id?: string
          file_name?: string | null
          fulfillment_record_id?: string | null
          id?: string
          mime_type?: string | null
          service_order_id?: string
          size_bytes?: number | null
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_fulfillment_attachme_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_attachments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "platform_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_attachments_order_identity_fkey"
            columns: ["service_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_attachments_record_identity_fkey"
            columns: ["fulfillment_record_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_fulfillment_records"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_attachments_work_order_identity_fkey"
            columns: ["work_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_work_orders"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_fulfillment_records: {
        Row: {
          content: string
          created_at: string
          created_by_employee_id: string
          id: string
          occurred_at: string
          record_type: string
          service_order_id: string
          tenant_id: string
          title: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by_employee_id: string
          id?: string
          occurred_at: string
          record_type: string
          service_order_id: string
          tenant_id: string
          title: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by_employee_id?: string
          id?: string
          occurred_at?: string
          record_type?: string
          service_order_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_fulfillment_records_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_records_order_identity_fkey"
            columns: ["service_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_fulfillment_records_work_order_identity_fkey"
            columns: ["work_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_work_orders"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_order_shipping_reports: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_attempt_key: string | null
          provider_request_id: string | null
          request_payload: Json
          service_order_id: string
          source: string
          status: string
          succeeded_at: string | null
          tenant_id: string
          updated_at: string
          wechat_errcode: number | null
          wechat_errmsg: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_attempt_key?: string | null
          provider_request_id?: string | null
          request_payload?: Json
          service_order_id: string
          source: string
          status?: string
          succeeded_at?: string | null
          tenant_id: string
          updated_at?: string
          wechat_errcode?: number | null
          wechat_errmsg?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_attempt_key?: string | null
          provider_request_id?: string | null
          request_payload?: Json
          service_order_id?: string
          source?: string
          status?: string
          succeeded_at?: string | null
          tenant_id?: string
          updated_at?: string
          wechat_errcode?: number | null
          wechat_errmsg?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_order_shipping_r_service_order_id_tenant_id_fkey"
            columns: ["service_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_orders: {
        Row: {
          amount_fen: number
          cancel_claim_expires_at: string | null
          cancel_idempotency_key: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by_employee_id: string | null
          created_at: string
          created_by_employee_id: string
          id: string
          idempotency_key: string | null
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_config_guard_version: number
          payment_config_id: string
          payment_expires_at: string
          payment_status: string
          prepay_id: string | null
          pricing_version: number
          product_code: string
          product_id: string
          product_snapshot: Json
          product_version_id: string
          service_access_terminated_at: string | null
          service_access_terminated_by_employee_id: string | null
          service_access_termination_reason: string | null
          service_status: string
          source_trial_id: string | null
          tenant_id: string
          term_years: number
          terms_accepted_at: string
          terms_version: number
          transaction_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          amount_fen: number
          cancel_claim_expires_at?: string | null
          cancel_idempotency_key?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_employee_id?: string | null
          created_at?: string
          created_by_employee_id: string
          id?: string
          idempotency_key?: string | null
          order_no: string
          out_trade_no: string
          paid_amount_fen?: number | null
          paid_at?: string | null
          payer_openid: string
          payment_config_guard_version: number
          payment_config_id: string
          payment_expires_at: string
          payment_status?: string
          prepay_id?: string | null
          pricing_version: number
          product_code: string
          product_id: string
          product_snapshot: Json
          product_version_id: string
          service_access_terminated_at?: string | null
          service_access_terminated_by_employee_id?: string | null
          service_access_termination_reason?: string | null
          service_status?: string
          source_trial_id?: string | null
          tenant_id: string
          term_years: number
          terms_accepted_at: string
          terms_version: number
          transaction_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          amount_fen?: number
          cancel_claim_expires_at?: string | null
          cancel_idempotency_key?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_employee_id?: string | null
          created_at?: string
          created_by_employee_id?: string
          id?: string
          idempotency_key?: string | null
          order_no?: string
          out_trade_no?: string
          paid_amount_fen?: number | null
          paid_at?: string | null
          payer_openid?: string
          payment_config_guard_version?: number
          payment_config_id?: string
          payment_expires_at?: string
          payment_status?: string
          prepay_id?: string | null
          pricing_version?: number
          product_code?: string
          product_id?: string
          product_snapshot?: Json
          product_version_id?: string
          service_access_terminated_at?: string | null
          service_access_terminated_by_employee_id?: string | null
          service_access_termination_reason?: string | null
          service_status?: string
          source_trial_id?: string | null
          tenant_id?: string
          term_years?: number
          terms_accepted_at?: string
          terms_version?: number
          transaction_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_orders_access_terminator_employee_fkey"
            columns: ["service_access_terminated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_orders_closed_by_employee_tenant_fkey"
            columns: ["closed_by_employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_orders_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_orders_payment_config_id_fkey"
            columns: ["payment_config_id"]
            isOneToOne: false
            referencedRelation: "platform_payment_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "platform_service_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_orders_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "platform_service_product_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_orders_source_trial_tenant_fkey"
            columns: ["source_trial_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_trials"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_provider_profiles: {
        Row: {
          address: string | null
          address_city: string | null
          address_district: string | null
          address_latitude: number | null
          address_longitude: number | null
          address_province: string | null
          address_region_code: string | null
          created_at: string
          id: string
          introduction: string | null
          public_name: string | null
          public_phone: string | null
          published_at: string | null
          review_remark: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          status: string
          submitted_at: string | null
          suspended_at: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          address?: string | null
          address_city?: string | null
          address_district?: string | null
          address_latitude?: number | null
          address_longitude?: number | null
          address_province?: string | null
          address_region_code?: string | null
          created_at?: string
          id?: string
          introduction?: string | null
          public_name?: string | null
          public_phone?: string | null
          published_at?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          submitted_at?: string | null
          suspended_at?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          address?: string | null
          address_city?: string | null
          address_district?: string | null
          address_latitude?: number | null
          address_longitude?: number | null
          address_province?: string | null
          address_region_code?: string | null
          created_at?: string
          id?: string
          introduction?: string | null
          public_name?: string | null
          public_phone?: string | null
          published_at?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          status?: string
          submitted_at?: string | null
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_provider_profiles_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_provider_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_provider_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_refund_requests: {
        Row: {
          created_at: string
          created_by_employee_id: string
          id: string
          idempotency_key: string
          out_refund_no: string | null
          provider_checked_at: string | null
          provider_checked_by_employee_id: string | null
          provider_out_refund_no: string | null
          provider_refund_amount_fen: number | null
          provider_refund_status: string | null
          provider_wechat_refund_id: string | null
          reason: string
          refund_amount_fen: number | null
          refunded_at: string | null
          refunded_by_employee_id: string | null
          review_remark: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          service_order_id: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
          wechat_refund_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_employee_id: string
          id?: string
          idempotency_key: string
          out_refund_no?: string | null
          provider_checked_at?: string | null
          provider_checked_by_employee_id?: string | null
          provider_out_refund_no?: string | null
          provider_refund_amount_fen?: number | null
          provider_refund_status?: string | null
          provider_wechat_refund_id?: string | null
          reason: string
          refund_amount_fen?: number | null
          refunded_at?: string | null
          refunded_by_employee_id?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          service_order_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          wechat_refund_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_employee_id?: string
          id?: string
          idempotency_key?: string
          out_refund_no?: string | null
          provider_checked_at?: string | null
          provider_checked_by_employee_id?: string | null
          provider_out_refund_no?: string | null
          provider_refund_amount_fen?: number | null
          provider_refund_status?: string | null
          provider_wechat_refund_id?: string | null
          reason?: string
          refund_amount_fen?: number | null
          refunded_at?: string | null
          refunded_by_employee_id?: string | null
          review_remark?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          service_order_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          wechat_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_refund_requests_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_refund_requests_order_identity_fkey"
            columns: ["service_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_refund_requests_provider_checked_by_employee_fke"
            columns: ["provider_checked_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_refund_requests_refunded_by_employee_fkey"
            columns: ["refunded_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_refund_requests_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_refund_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_refund_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_trial_commands: {
        Row: {
          actor_employee_id: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          request_hash: string
          result_envelope: Json
          scope_key: string
          tenant_id: string | null
          trial_id: string | null
        }
        Insert: {
          actor_employee_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          request_hash: string
          result_envelope: Json
          scope_key: string
          tenant_id?: string | null
          trial_id?: string | null
        }
        Update: {
          actor_employee_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          request_hash?: string
          result_envelope?: Json
          scope_key?: string
          tenant_id?: string | null
          trial_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_trial_commands_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trial_commands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_trial_commands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trial_commands_trial_identity_fkey"
            columns: ["trial_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_trials"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_trial_events: {
        Row: {
          actor_employee_id: string | null
          created_at: string
          event_key: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          occurred_at: string
          reason: string | null
          tenant_id: string
          to_status: string | null
          trial_id: string
        }
        Insert: {
          actor_employee_id?: string | null
          created_at?: string
          event_key: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          reason?: string | null
          tenant_id: string
          to_status?: string | null
          trial_id: string
        }
        Update: {
          actor_employee_id?: string | null
          created_at?: string
          event_key?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          reason?: string | null
          tenant_id?: string
          to_status?: string | null
          trial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_trial_events_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trial_events_trial_identity_fkey"
            columns: ["trial_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_trials"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_trial_followups: {
        Row: {
          cancel_idempotency_key: string | null
          cancel_request_hash: string | null
          canceled_at: string | null
          canceled_by_employee_id: string | null
          create_idempotency_key: string
          create_request_hash: string
          created_at: string
          created_by_employee_id: string
          follow_up_type: string
          id: string
          next_follow_up_at: string | null
          result: string
          status: string
          summary: string
          tenant_id: string
          trial_id: string
        }
        Insert: {
          cancel_idempotency_key?: string | null
          cancel_request_hash?: string | null
          canceled_at?: string | null
          canceled_by_employee_id?: string | null
          create_idempotency_key: string
          create_request_hash: string
          created_at?: string
          created_by_employee_id: string
          follow_up_type: string
          id?: string
          next_follow_up_at?: string | null
          result: string
          status?: string
          summary: string
          tenant_id: string
          trial_id: string
        }
        Update: {
          cancel_idempotency_key?: string | null
          cancel_request_hash?: string | null
          canceled_at?: string | null
          canceled_by_employee_id?: string | null
          create_idempotency_key?: string
          create_request_hash?: string
          created_at?: string
          created_by_employee_id?: string
          follow_up_type?: string
          id?: string
          next_follow_up_at?: string | null
          result?: string
          status?: string
          summary?: string
          tenant_id?: string
          trial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_trial_followups_canceled_by_employee_id_fkey"
            columns: ["canceled_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trial_followups_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trial_followups_trial_identity_fkey"
            columns: ["trial_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_trials"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_trial_notification_deliveries: {
        Row: {
          attempt_count: number
          completed_lease_token: string | null
          created_at: string
          due_at: string
          event_type: string
          id: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          notification_id: string | null
          recipient_employee_id: string
          retry_at: string | null
          sent_at: string | null
          source: string
          status: string
          target_date: string
          tenant_id: string
          trial_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_lease_token?: string | null
          created_at?: string
          due_at: string
          event_type: string
          id?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          notification_id?: string | null
          recipient_employee_id: string
          retry_at?: string | null
          sent_at?: string | null
          source: string
          status?: string
          target_date: string
          tenant_id: string
          trial_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_lease_token?: string | null
          created_at?: string
          due_at?: string
          event_type?: string
          id?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          notification_id?: string | null
          recipient_employee_id?: string
          retry_at?: string | null
          sent_at?: string | null
          source?: string
          status?: string
          target_date?: string
          tenant_id?: string
          trial_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_trial_notification_de_recipient_employee_id_fkey"
            columns: ["recipient_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trial_notification_deliveri_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trial_notification_deliveries_trial_identity_fke"
            columns: ["trial_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_trials"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_trials: {
        Row: {
          activated_at: string | null
          application_reason: string | null
          assignee_employee_id: string | null
          contact_name: string | null
          contact_phone: string | null
          converted_at: string | null
          converted_order_id: string | null
          created_at: string
          enterprise_identity_hash: string
          expected_project_count: number | null
          expected_user_count: number | null
          extension_count: number
          grace_ends_at: string | null
          grant_reason: string | null
          granted_at: string | null
          granted_by_employee_id: string | null
          id: string
          policy_snapshot: Json
          requested_at: string | null
          requested_by_employee_id: string | null
          review_decision: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_employee_id: string | null
          scope_snapshot: Json
          source: string
          starts_at: string | null
          status: string
          tenant_id: string
          trial_ends_at: string | null
          trial_type: string
          updated_at: string
          version: number
          withdraw_reason: string | null
          withdrawn_at: string | null
          withdrawn_by_employee_id: string | null
        }
        Insert: {
          activated_at?: string | null
          application_reason?: string | null
          assignee_employee_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          enterprise_identity_hash: string
          expected_project_count?: number | null
          expected_user_count?: number | null
          extension_count?: number
          grace_ends_at?: string | null
          grant_reason?: string | null
          granted_at?: string | null
          granted_by_employee_id?: string | null
          id?: string
          policy_snapshot: Json
          requested_at?: string | null
          requested_by_employee_id?: string | null
          review_decision?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_employee_id?: string | null
          scope_snapshot: Json
          source: string
          starts_at?: string | null
          status: string
          tenant_id: string
          trial_ends_at?: string | null
          trial_type: string
          updated_at?: string
          version?: number
          withdraw_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by_employee_id?: string | null
        }
        Update: {
          activated_at?: string | null
          application_reason?: string | null
          assignee_employee_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          enterprise_identity_hash?: string
          expected_project_count?: number | null
          expected_user_count?: number | null
          extension_count?: number
          grace_ends_at?: string | null
          grant_reason?: string | null
          granted_at?: string | null
          granted_by_employee_id?: string | null
          id?: string
          policy_snapshot?: Json
          requested_at?: string | null
          requested_by_employee_id?: string | null
          review_decision?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_employee_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_employee_id?: string | null
          scope_snapshot?: Json
          source?: string
          starts_at?: string | null
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          trial_type?: string
          updated_at?: string
          version?: number
          withdraw_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_trials_assignee_employee_id_fkey"
            columns: ["assignee_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trials_converted_order_identity_fkey"
            columns: ["converted_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_trials_granted_by_employee_id_fkey"
            columns: ["granted_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trials_requested_by_employee_id_fkey"
            columns: ["requested_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trials_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trials_revoked_by_employee_id_fkey"
            columns: ["revoked_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_trials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_trials_withdrawn_by_employee_id_fkey"
            columns: ["withdrawn_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_wechat_notifications: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          notify_id: string
          order_id: string | null
          out_trade_no: string | null
          payload: Json
          processed: boolean
          processed_at: string | null
          tenant_id: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          notify_id: string
          order_id?: string | null
          out_trade_no?: string | null
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          tenant_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          notify_id?: string
          order_id?: string | null
          out_trade_no?: string | null
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          tenant_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_wechat_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_wechat_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_wechat_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_work_order_events: {
        Row: {
          action: string
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          operator_employee_id: string
          remark: string | null
          service_order_id: string
          tenant_id: string
          to_status: string | null
          work_order_id: string
        }
        Insert: {
          action: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          operator_employee_id: string
          remark?: string | null
          service_order_id: string
          tenant_id: string
          to_status?: string | null
          work_order_id: string
        }
        Update: {
          action?: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          operator_employee_id?: string
          remark?: string | null
          service_order_id?: string
          tenant_id?: string
          to_status?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_work_order_events_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_work_order_events_order_identity_fkey"
            columns: ["service_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_work_order_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_work_order_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_work_order_events_work_order_identity_fkey"
            columns: ["work_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_work_orders"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_service_work_orders: {
        Row: {
          assigned_at: string | null
          assignee_employee_id: string | null
          created_at: string
          created_by_employee_id: string | null
          id: string
          order_no: string
          service_order_id: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          assigned_at?: string | null
          assignee_employee_id?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          order_no: string
          service_order_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_at?: string | null
          assignee_employee_id?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          order_no?: string
          service_order_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_work_orders_assignee_employee_id_fkey"
            columns: ["assignee_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_work_orders_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_service_work_orders_order_identity_fkey"
            columns: ["service_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_service_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_work_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_service_work_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_share_links: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          metadata: Json
          share_employee_id: string
          source: string
          status: string
          target_id: string | null
          target_type: string
          tenant_id: string
          token: string
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json
          share_employee_id: string
          source?: string
          status?: string
          target_id?: string | null
          target_type?: string
          tenant_id: string
          token: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json
          share_employee_id?: string
          source?: string
          status?: string
          target_id?: string | null
          target_type?: string
          tenant_id?: string
          token?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_share_links_share_employee_id_fkey"
            columns: ["share_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_share_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_share_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscription_invoices: {
        Row: {
          amount_credits: number
          created_at: string
          due_at: string
          failure_code: string | null
          failure_message: string | null
          id: string
          ledger_id: string | null
          metadata: Json
          paid_at: string | null
          period_end: string
          period_start: string
          plan_id: string
          reminded_at: string | null
          reminder_due_at: string
          status: string
          subscription_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_credits: number
          created_at?: string
          due_at: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          ledger_id?: string | null
          metadata?: Json
          paid_at?: string | null
          period_end: string
          period_start: string
          plan_id: string
          reminded_at?: string | null
          reminder_due_at: string
          status?: string
          subscription_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_credits?: number
          created_at?: string
          due_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          ledger_id?: string | null
          metadata?: Json
          paid_at?: string | null
          period_end?: string
          period_start?: string
          plan_id?: string
          reminded_at?: string | null
          reminder_due_at?: string
          status?: string
          subscription_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscription_invoices_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "tenant_credit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscription_invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "tenant_billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscription_invoices_subscription_tenant_fkey"
            columns: ["subscription_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_billing_subscriptions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscription_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscription_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_supplier_code_counters: {
        Row: {
          next_value: number
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          next_value: number
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          next_value?: number
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_supplier_code_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_supplier_code_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_supplier_code_registry: {
        Row: {
          abandoned_at: string | null
          actor_employee_id: string | null
          actor_user_id: string | null
          consumed_at: string | null
          created_at: string
          display_code: string
          id: string
          idempotency_key: string | null
          normalized_code: string
          request_digest: Json | null
          source: string
          status: string
          tenant_id: string
          tenant_supplier_id: string | null
        }
        Insert: {
          abandoned_at?: string | null
          actor_employee_id?: string | null
          actor_user_id?: string | null
          consumed_at?: string | null
          created_at?: string
          display_code: string
          id?: string
          idempotency_key?: string | null
          normalized_code: string
          request_digest?: Json | null
          source: string
          status: string
          tenant_id: string
          tenant_supplier_id?: string | null
        }
        Update: {
          abandoned_at?: string | null
          actor_employee_id?: string | null
          actor_user_id?: string | null
          consumed_at?: string | null
          created_at?: string
          display_code?: string
          id?: string
          idempotency_key?: string | null
          normalized_code?: string
          request_digest?: Json | null
          source?: string
          status?: string
          tenant_id?: string
          tenant_supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_supplier_code_registry_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_supplier_code_registry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_supplier_code_registry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_supplier_code_registry_tenant_supplier_id_fkey"
            columns: ["tenant_supplier_id"]
            isOneToOne: false
            referencedRelation: "tenant_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_supplier_settings: {
        Row: {
          created_at: string
          enabled_at: string | null
          enabled_by_employee_id: string | null
          module_enabled: boolean
          ownership_reads_enabled: boolean
          private_catalog_writes_enabled: boolean
          private_supplier_writes_enabled: boolean
          procurement_snapshot_v1_enabled: boolean
          require_active_contract_for_new_order: boolean
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          enabled_at?: string | null
          enabled_by_employee_id?: string | null
          module_enabled?: boolean
          ownership_reads_enabled?: boolean
          private_catalog_writes_enabled?: boolean
          private_supplier_writes_enabled?: boolean
          procurement_snapshot_v1_enabled?: boolean
          require_active_contract_for_new_order?: boolean
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          enabled_at?: string | null
          enabled_by_employee_id?: string | null
          module_enabled?: boolean
          ownership_reads_enabled?: boolean
          private_catalog_writes_enabled?: boolean
          private_supplier_writes_enabled?: boolean
          procurement_snapshot_v1_enabled?: boolean
          require_active_contract_for_new_order?: boolean
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_supplier_settings_enabled_by_employee_id_fkey"
            columns: ["enabled_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_supplier_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_supplier_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_suppliers: {
        Row: {
          created_at: string
          created_by_employee_id: string
          credit_limit_minor: number
          default_currency: string
          default_tax_inclusive: boolean
          ended_at: string | null
          id: string
          internal_supplier_code: string
          invoice_required_before_payment: boolean
          relationship_status: string
          remark: string | null
          settlement_term_days: number
          started_at: string | null
          supplier_id: string
          tenant_id: string
          tenant_owner_employee_id: string | null
          updated_at: string
          updated_by_employee_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by_employee_id: string
          credit_limit_minor?: number
          default_currency?: string
          default_tax_inclusive?: boolean
          ended_at?: string | null
          id?: string
          internal_supplier_code: string
          invoice_required_before_payment?: boolean
          relationship_status?: string
          remark?: string | null
          settlement_term_days?: number
          started_at?: string | null
          supplier_id: string
          tenant_id: string
          tenant_owner_employee_id?: string | null
          updated_at?: string
          updated_by_employee_id: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by_employee_id?: string
          credit_limit_minor?: number
          default_currency?: string
          default_tax_inclusive?: boolean
          ended_at?: string | null
          id?: string
          internal_supplier_code?: string
          invoice_required_before_payment?: boolean
          relationship_status?: string
          remark?: string | null
          settlement_term_days?: number
          started_at?: string | null
          supplier_id?: string
          tenant_id?: string
          tenant_owner_employee_id?: string | null
          updated_at?: string
          updated_by_employee_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_suppliers_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "platform_supplier_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_suppliers_tenant_owner_employee_id_fkey"
            columns: ["tenant_owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_suppliers_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_template_applications: {
        Row: {
          applied_at: string
          applied_by_employee_id: string | null
          created_at: string
          id: string
          result: Json
          template_code: string
          template_id: string | null
          template_version: string
          tenant_id: string
        }
        Insert: {
          applied_at?: string
          applied_by_employee_id?: string | null
          created_at?: string
          id?: string
          result?: Json
          template_code: string
          template_id?: string | null
          template_version: string
          tenant_id: string
        }
        Update: {
          applied_at?: string
          applied_by_employee_id?: string | null
          created_at?: string
          id?: string
          result?: Json
          template_code?: string
          template_id?: string | null
          template_version?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_template_applications_applied_by_employee_id_fkey"
            columns: ["applied_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_template_applications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tenant_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_template_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_template_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_templates: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          payload: Json
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          payload?: Json
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          payload?: Json
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      tenant_usage_daily: {
        Row: {
          ai_call_count: number
          ai_completion_tokens: number
          ai_failure_count: number
          ai_missing_token_count: number
          ai_prompt_tokens: number
          ai_success_count: number
          ai_total_tokens: number
          calculated_at: string
          created_at: string
          id: string
          sms_disabled_count: number
          sms_failure_count: number
          sms_mock_count: number
          sms_send_count: number
          sms_success_count: number
          social_video_duration_seconds: number
          social_video_missing_duration_count: number
          social_video_transcription_count: number
          tenant_id: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          ai_call_count?: number
          ai_completion_tokens?: number
          ai_failure_count?: number
          ai_missing_token_count?: number
          ai_prompt_tokens?: number
          ai_success_count?: number
          ai_total_tokens?: number
          calculated_at?: string
          created_at?: string
          id?: string
          sms_disabled_count?: number
          sms_failure_count?: number
          sms_mock_count?: number
          sms_send_count?: number
          sms_success_count?: number
          social_video_duration_seconds?: number
          social_video_missing_duration_count?: number
          social_video_transcription_count?: number
          tenant_id: string
          updated_at?: string
          usage_date: string
        }
        Update: {
          ai_call_count?: number
          ai_completion_tokens?: number
          ai_failure_count?: number
          ai_missing_token_count?: number
          ai_prompt_tokens?: number
          ai_success_count?: number
          ai_total_tokens?: number
          calculated_at?: string
          created_at?: string
          id?: string
          sms_disabled_count?: number
          sms_failure_count?: number
          sms_mock_count?: number
          sms_send_count?: number
          sms_success_count?: number
          social_video_duration_seconds?: number
          social_video_missing_duration_count?: number
          social_video_transcription_count?: number
          tenant_id?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_usage_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_virtual_addon_orders: {
        Row: {
          amount_fen: number
          config_version: number
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          environment: string
          failure_code: string | null
          failure_message: string | null
          fulfillment_status: string
          id: string
          idempotency_key: string
          offer_id: string
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_expires_at: string
          payment_request_attempt_revision: number
          payment_request_claim_expires_at: string | null
          payment_request_claim_token: string | null
          payment_request_claimed_at: string | null
          payment_request_issued_at: string | null
          payment_status: string
          product_code: string
          product_id: string
          product_name: string
          provider_delivery_attempt_count: number
          provider_delivery_attempt_key: string | null
          provider_delivery_last_error: string | null
          provider_delivery_last_error_code: string | null
          provider_delivery_provided_at: string | null
          provider_delivery_request_id: string | null
          provider_delivery_status: string
          provider_order_no: string | null
          provider_order_type: number | null
          provider_product_id: string
          purchase_notes: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_completion_kind: string | null
          reconcile_last_checked_at: string | null
          reconcile_last_error: string | null
          reconcile_last_error_code: string | null
          reconcile_last_provider_status: number | null
          reconcile_next_at: string | null
          reconcile_query_paid_amount_fen: number | null
          reconcile_query_paid_at: string | null
          reconcile_query_provider_order_no: string | null
          reconcile_query_transaction_id: string | null
          refund_policy: string
          refund_status: string
          requested_platform: string
          secret_revision: number
          settlement_channel: string | null
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_fen: number
          config_version: number
          created_at?: string
          created_by: string
          entitlement_code: string
          entitlement_event_id?: string | null
          environment: string
          failure_code?: string | null
          failure_message?: string | null
          fulfillment_status?: string
          id?: string
          idempotency_key: string
          offer_id: string
          order_no: string
          out_trade_no: string
          paid_amount_fen?: number | null
          paid_at?: string | null
          payer_openid: string
          payment_expires_at: string
          payment_request_attempt_revision?: number
          payment_request_claim_expires_at?: string | null
          payment_request_claim_token?: string | null
          payment_request_claimed_at?: string | null
          payment_request_issued_at?: string | null
          payment_status?: string
          product_code: string
          product_id: string
          product_name: string
          provider_delivery_attempt_count?: number
          provider_delivery_attempt_key?: string | null
          provider_delivery_last_error?: string | null
          provider_delivery_last_error_code?: string | null
          provider_delivery_provided_at?: string | null
          provider_delivery_request_id?: string | null
          provider_delivery_status?: string
          provider_order_no?: string | null
          provider_order_type?: number | null
          provider_product_id: string
          purchase_notes: string
          reconcile_attempt_count?: number
          reconcile_claim_expires_at?: string | null
          reconcile_claim_token?: string | null
          reconcile_completion_kind?: string | null
          reconcile_last_checked_at?: string | null
          reconcile_last_error?: string | null
          reconcile_last_error_code?: string | null
          reconcile_last_provider_status?: number | null
          reconcile_next_at?: string | null
          reconcile_query_paid_amount_fen?: number | null
          reconcile_query_paid_at?: string | null
          reconcile_query_provider_order_no?: string | null
          reconcile_query_transaction_id?: string | null
          refund_policy: string
          refund_status?: string
          requested_platform?: string
          secret_revision: number
          settlement_channel?: string | null
          tenant_id: string
          term_years?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_fen?: number
          config_version?: number
          created_at?: string
          created_by?: string
          entitlement_code?: string
          entitlement_event_id?: string | null
          environment?: string
          failure_code?: string | null
          failure_message?: string | null
          fulfillment_status?: string
          id?: string
          idempotency_key?: string
          offer_id?: string
          order_no?: string
          out_trade_no?: string
          paid_amount_fen?: number | null
          paid_at?: string | null
          payer_openid?: string
          payment_expires_at?: string
          payment_request_attempt_revision?: number
          payment_request_claim_expires_at?: string | null
          payment_request_claim_token?: string | null
          payment_request_claimed_at?: string | null
          payment_request_issued_at?: string | null
          payment_status?: string
          product_code?: string
          product_id?: string
          product_name?: string
          provider_delivery_attempt_count?: number
          provider_delivery_attempt_key?: string | null
          provider_delivery_last_error?: string | null
          provider_delivery_last_error_code?: string | null
          provider_delivery_provided_at?: string | null
          provider_delivery_request_id?: string | null
          provider_delivery_status?: string
          provider_order_no?: string | null
          provider_order_type?: number | null
          provider_product_id?: string
          purchase_notes?: string
          reconcile_attempt_count?: number
          reconcile_claim_expires_at?: string | null
          reconcile_claim_token?: string | null
          reconcile_completion_kind?: string | null
          reconcile_last_checked_at?: string | null
          reconcile_last_error?: string | null
          reconcile_last_error_code?: string | null
          reconcile_last_provider_status?: number | null
          reconcile_next_at?: string | null
          reconcile_query_paid_amount_fen?: number | null
          reconcile_query_paid_at?: string | null
          reconcile_query_provider_order_no?: string | null
          reconcile_query_transaction_id?: string | null
          refund_policy?: string
          refund_status?: string
          requested_platform?: string
          secret_revision?: number
          settlement_channel?: string | null
          tenant_id?: string
          term_years?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_virtual_addon_orders_created_employee_tenant_fkey"
            columns: ["created_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_orders_entitlement_event_identity_fkey"
            columns: ["entitlement_event_id", "tenant_id", "entitlement_code"]
            isOneToOne: false
            referencedRelation: "tenant_entitlement_events"
            referencedColumns: ["id", "tenant_id", "entitlement_code"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_orders_product_identity_fkey"
            columns: ["product_id", "product_code"]
            isOneToOne: false
            referencedRelation: "platform_addon_products"
            referencedColumns: ["id", "code"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_virtual_addon_refunds: {
        Row: {
          amount_fen: number
          apple_receipt_hash: string | null
          compensation_entitlement_event_id: string | null
          compensation_last_error: string | null
          compensation_status: string
          created_at: string
          evidence_summary: string
          failed_at: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          last_error_summary: string | null
          order_id: string
          platform_mode: string
          provider_refund_id: string | null
          provider_refund_no: string | null
          provider_refund_started_at: string | null
          provider_refund_succeeded_at: string | null
          provider_refund_transaction_id: string | null
          provider_request_id: string | null
          purchase_entitlement_event_id: string
          reason: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_next_at: string | null
          refund_no: string
          rejected_at: string | null
          request_source: string
          requested_by: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          succeeded_at: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          amount_fen: number
          apple_receipt_hash?: string | null
          compensation_entitlement_event_id?: string | null
          compensation_last_error?: string | null
          compensation_status?: string
          created_at?: string
          evidence_summary?: string
          failed_at?: string | null
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          last_error_summary?: string | null
          order_id: string
          platform_mode: string
          provider_refund_id?: string | null
          provider_refund_no?: string | null
          provider_refund_started_at?: string | null
          provider_refund_succeeded_at?: string | null
          provider_refund_transaction_id?: string | null
          provider_request_id?: string | null
          purchase_entitlement_event_id: string
          reason: string
          reconcile_attempt_count?: number
          reconcile_claim_expires_at?: string | null
          reconcile_claim_token?: string | null
          reconcile_next_at?: string | null
          refund_no: string
          rejected_at?: string | null
          request_source: string
          requested_by?: string | null
          reviewed_by?: string | null
          status: string
          submitted_at?: string | null
          succeeded_at?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          amount_fen?: number
          apple_receipt_hash?: string | null
          compensation_entitlement_event_id?: string | null
          compensation_last_error?: string | null
          compensation_status?: string
          created_at?: string
          evidence_summary?: string
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          last_error_summary?: string | null
          order_id?: string
          platform_mode?: string
          provider_refund_id?: string | null
          provider_refund_no?: string | null
          provider_refund_started_at?: string | null
          provider_refund_succeeded_at?: string | null
          provider_refund_transaction_id?: string | null
          provider_request_id?: string | null
          purchase_entitlement_event_id?: string
          reason?: string
          reconcile_attempt_count?: number
          reconcile_claim_expires_at?: string | null
          reconcile_claim_token?: string | null
          reconcile_next_at?: string | null
          refund_no?: string
          rejected_at?: string | null
          request_source?: string
          requested_by?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          succeeded_at?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_virtual_addon_refunds_compensation_entitlement_even_fkey"
            columns: ["compensation_entitlement_event_id"]
            isOneToOne: true
            referencedRelation: "tenant_entitlement_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "tenant_virtual_addon_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_refunds_purchase_entitlement_event_id_fkey"
            columns: ["purchase_entitlement_event_id"]
            isOneToOne: false
            referencedRelation: "tenant_entitlement_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_refunds_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_virtual_addon_refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_wechat_pay_applyment_events: {
        Row: {
          applyment_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          message: string | null
          metadata: Json
          operator_employee_id: string | null
          tenant_id: string
          to_status: string | null
        }
        Insert: {
          applyment_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          operator_employee_id?: string | null
          tenant_id: string
          to_status?: string | null
        }
        Update: {
          applyment_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          operator_employee_id?: string | null
          tenant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_wechat_pay_applyment_events_applyment_id_fkey"
            columns: ["applyment_id"]
            isOneToOne: false
            referencedRelation: "tenant_wechat_pay_applyments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyment_events_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_wechat_pay_applyment_media: {
        Row: {
          applyment_id: string
          category: string
          created_at: string
          id: string
          media_id: string
          mime_type: string
          object_key: string
          request_id: string | null
          sha256: string
          size_bytes: number
          tenant_id: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          applyment_id: string
          category: string
          created_at?: string
          id?: string
          media_id: string
          mime_type: string
          object_key: string
          request_id?: string | null
          sha256: string
          size_bytes: number
          tenant_id: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          applyment_id?: string
          category?: string
          created_at?: string
          id?: string
          media_id?: string
          mime_type?: string
          object_key?: string
          request_id?: string | null
          sha256?: string
          size_bytes?: number
          tenant_id?: string
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_wechat_pay_applyment_media_applyment_id_fkey"
            columns: ["applyment_id"]
            isOneToOne: false
            referencedRelation: "tenant_wechat_pay_applyments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyment_media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyment_media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_wechat_pay_applyments: {
        Row: {
          activated_at: string | null
          appid_binding_message: string | null
          appid_binding_state: string
          application_no: string
          applyment_business_code: string | null
          applyment_id: string | null
          applyment_state: string
          applyment_state_message: string | null
          approved_at: string | null
          attachments: Json
          audit_detail: Json
          business_scene_description: string | null
          contact_address: string | null
          contact_identity_doc_type: string | null
          contact_identity_period_begin: string | null
          contact_identity_period_end: string | null
          contact_type: string | null
          created_at: string
          created_by_employee_id: string | null
          draft_epoch: number
          draft_revision: number
          has_sensitive_payload: boolean
          id: string
          identity_address_masked: string | null
          identity_doc_type: string | null
          identity_period_begin: string | null
          identity_period_end: string | null
          last_wechat_request_id: string | null
          last_wechat_synced_at: string | null
          legal_representative_name: string | null
          license_address: string | null
          license_code: string | null
          license_name: string | null
          license_period_begin: string | null
          license_period_end: string | null
          merchant_short_name: string | null
          opened_at: string | null
          payment_config_id: string | null
          qualification_type: string | null
          rejected_at: string | null
          rejected_reason: string | null
          remark: string | null
          reviewed_by_employee_id: string | null
          sensitive_payload_ciphertext: string | null
          sensitive_payload_updated_at: string | null
          sensitive_payload_version: number | null
          service_phone: string | null
          settlement_account_name: string | null
          settlement_account_number_masked: string | null
          settlement_account_summary: string | null
          settlement_account_type: string | null
          settlement_bank_branch_id: string | null
          settlement_bank_full_name: string | null
          settlement_bank_name: string | null
          settlement_id: string | null
          sign_url: string | null
          status: string
          sub_appid: string | null
          sub_mchid: string | null
          subject_type: string | null
          submission_attempt_count: number
          submission_claimed_at: string | null
          submitted_at: string | null
          super_admin_email: string | null
          super_admin_name: string | null
          super_admin_phone_masked: string | null
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string | null
          wechat_applyment_state_raw: string | null
        }
        Insert: {
          activated_at?: string | null
          appid_binding_message?: string | null
          appid_binding_state?: string
          application_no: string
          applyment_business_code?: string | null
          applyment_id?: string | null
          applyment_state?: string
          applyment_state_message?: string | null
          approved_at?: string | null
          attachments?: Json
          audit_detail?: Json
          business_scene_description?: string | null
          contact_address?: string | null
          contact_identity_doc_type?: string | null
          contact_identity_period_begin?: string | null
          contact_identity_period_end?: string | null
          contact_type?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          draft_epoch?: number
          draft_revision?: number
          has_sensitive_payload?: boolean
          id?: string
          identity_address_masked?: string | null
          identity_doc_type?: string | null
          identity_period_begin?: string | null
          identity_period_end?: string | null
          last_wechat_request_id?: string | null
          last_wechat_synced_at?: string | null
          legal_representative_name?: string | null
          license_address?: string | null
          license_code?: string | null
          license_name?: string | null
          license_period_begin?: string | null
          license_period_end?: string | null
          merchant_short_name?: string | null
          opened_at?: string | null
          payment_config_id?: string | null
          qualification_type?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          remark?: string | null
          reviewed_by_employee_id?: string | null
          sensitive_payload_ciphertext?: string | null
          sensitive_payload_updated_at?: string | null
          sensitive_payload_version?: number | null
          service_phone?: string | null
          settlement_account_name?: string | null
          settlement_account_number_masked?: string | null
          settlement_account_summary?: string | null
          settlement_account_type?: string | null
          settlement_bank_branch_id?: string | null
          settlement_bank_full_name?: string | null
          settlement_bank_name?: string | null
          settlement_id?: string | null
          sign_url?: string | null
          status?: string
          sub_appid?: string | null
          sub_mchid?: string | null
          subject_type?: string | null
          submission_attempt_count?: number
          submission_claimed_at?: string | null
          submitted_at?: string | null
          super_admin_email?: string | null
          super_admin_name?: string | null
          super_admin_phone_masked?: string | null
          tenant_id: string
          updated_at?: string
          updated_by_employee_id?: string | null
          wechat_applyment_state_raw?: string | null
        }
        Update: {
          activated_at?: string | null
          appid_binding_message?: string | null
          appid_binding_state?: string
          application_no?: string
          applyment_business_code?: string | null
          applyment_id?: string | null
          applyment_state?: string
          applyment_state_message?: string | null
          approved_at?: string | null
          attachments?: Json
          audit_detail?: Json
          business_scene_description?: string | null
          contact_address?: string | null
          contact_identity_doc_type?: string | null
          contact_identity_period_begin?: string | null
          contact_identity_period_end?: string | null
          contact_type?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          draft_epoch?: number
          draft_revision?: number
          has_sensitive_payload?: boolean
          id?: string
          identity_address_masked?: string | null
          identity_doc_type?: string | null
          identity_period_begin?: string | null
          identity_period_end?: string | null
          last_wechat_request_id?: string | null
          last_wechat_synced_at?: string | null
          legal_representative_name?: string | null
          license_address?: string | null
          license_code?: string | null
          license_name?: string | null
          license_period_begin?: string | null
          license_period_end?: string | null
          merchant_short_name?: string | null
          opened_at?: string | null
          payment_config_id?: string | null
          qualification_type?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          remark?: string | null
          reviewed_by_employee_id?: string | null
          sensitive_payload_ciphertext?: string | null
          sensitive_payload_updated_at?: string | null
          sensitive_payload_version?: number | null
          service_phone?: string | null
          settlement_account_name?: string | null
          settlement_account_number_masked?: string | null
          settlement_account_summary?: string | null
          settlement_account_type?: string | null
          settlement_bank_branch_id?: string | null
          settlement_bank_full_name?: string | null
          settlement_bank_name?: string | null
          settlement_id?: string | null
          sign_url?: string | null
          status?: string
          sub_appid?: string | null
          sub_mchid?: string | null
          subject_type?: string | null
          submission_attempt_count?: number
          submission_claimed_at?: string | null
          submitted_at?: string | null
          super_admin_email?: string | null
          super_admin_name?: string | null
          super_admin_phone_masked?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by_employee_id?: string | null
          wechat_applyment_state_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_wechat_pay_applyments_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyments_payment_config_id_fkey"
            columns: ["payment_config_id"]
            isOneToOne: false
            referencedRelation: "tenant_payment_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyments_reviewed_by_employee_id_fkey"
            columns: ["reviewed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_wechat_pay_applyments_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          address_adcode: string | null
          address_city: string | null
          address_confidence: number | null
          address_confirmed_at: string | null
          address_district: string | null
          address_latitude: number | null
          address_longitude: number | null
          address_poi_id: string | null
          address_province: string | null
          address_source: string | null
          address_title: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          slug: string
          status: string
          unified_social_credit_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_adcode?: string | null
          address_city?: string | null
          address_confidence?: number | null
          address_confirmed_at?: string | null
          address_district?: string | null
          address_latitude?: number | null
          address_longitude?: number | null
          address_poi_id?: string | null
          address_province?: string | null
          address_source?: string | null
          address_title?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
          unified_social_credit_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_adcode?: string | null
          address_city?: string | null
          address_confidence?: number | null
          address_confirmed_at?: string | null
          address_district?: string | null
          address_latitude?: number | null
          address_longitude?: number | null
          address_poi_id?: string | null
          address_province?: string | null
          address_source?: string | null
          address_title?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          unified_social_credit_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_auth_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip: string | null
          metadata: Json
          openid_hash: string | null
          operator_user_id: string | null
          platform: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip?: string | null
          metadata?: Json
          openid_hash?: string | null
          operator_user_id?: string | null
          platform?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
          openid_hash?: string | null
          operator_user_id?: string | null
          platform?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_business_memberships: {
        Row: {
          created_at: string
          id: string
          identity_id: string
          identity_type: string
          is_default: boolean
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          identity_id: string
          identity_type: string
          is_default?: boolean
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          identity_id?: string
          identity_type?: string
          is_default?: boolean
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_business_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "user_business_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_location_contexts: {
        Row: {
          accuracy: number | null
          adcode: string | null
          auth_user_id: string | null
          city: string | null
          confirmed_at: string | null
          created_at: string
          district: string | null
          expires_at: string
          fallback_reason: string | null
          id: string
          latitude: number | null
          longitude: number | null
          matched_tenants: Json
          province: string | null
          recommended_tenant_id: string | null
          selected_tenant_id: string | null
          selection_status: string
          source: string
          updated_at: string
          visitor_id: string | null
        }
        Insert: {
          accuracy?: number | null
          adcode?: string | null
          auth_user_id?: string | null
          city?: string | null
          confirmed_at?: string | null
          created_at?: string
          district?: string | null
          expires_at: string
          fallback_reason?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          matched_tenants?: Json
          province?: string | null
          recommended_tenant_id?: string | null
          selected_tenant_id?: string | null
          selection_status?: string
          source?: string
          updated_at?: string
          visitor_id?: string | null
        }
        Update: {
          accuracy?: number | null
          adcode?: string | null
          auth_user_id?: string | null
          city?: string | null
          confirmed_at?: string | null
          created_at?: string
          district?: string | null
          expires_at?: string
          fallback_reason?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          matched_tenants?: Json
          province?: string | null
          recommended_tenant_id?: string | null
          selected_tenant_id?: string | null
          selection_status?: string
          source?: string
          updated_at?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_location_contexts_recommended_tenant_id_fkey"
            columns: ["recommended_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "user_location_contexts_recommended_tenant_id_fkey"
            columns: ["recommended_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_location_contexts_selected_tenant_id_fkey"
            columns: ["selected_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "user_location_contexts_selected_tenant_id_fkey"
            columns: ["selected_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_oauth_identities: {
        Row: {
          bound_at: string
          created_at: string
          id: string
          openid: string
          platform: string
          status: string
          unbound_at: string | null
          unionid: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bound_at?: string
          created_at?: string
          id?: string
          openid: string
          platform: string
          status?: string
          unbound_at?: string | null
          unionid?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bound_at?: string
          created_at?: string
          id?: string
          openid?: string
          platform?: string
          status?: string
          unbound_at?: string | null
          unionid?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          auth_user_id: string
          avatar_path: string | null
          created_at: string
          nickname: string | null
          profile_completed_at: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_path?: string | null
          created_at?: string
          nickname?: string | null
          profile_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_path?: string | null
          created_at?: string
          nickname?: string | null
          profile_completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      visitor_project_follows: {
        Row: {
          created_at: string
          project_id: string
          verified_phone: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          verified_phone: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          verified_phone?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_project_follows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_mini_session_credentials: {
        Row: {
          created_at: string
          encrypted_session_key: string
          encryption_key_version: number
          id: string
          invalidated_at: string | null
          last_used_at: string | null
          oauth_identity_id: string
          obtained_at: string
          openid_hash: string
          session_revision: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_session_key: string
          encryption_key_version: number
          id?: string
          invalidated_at?: string | null
          last_used_at?: string | null
          oauth_identity_id: string
          obtained_at?: string
          openid_hash: string
          session_revision?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_session_key?: string
          encryption_key_version?: number
          id?: string
          invalidated_at?: string | null
          last_used_at?: string | null
          oauth_identity_id?: string
          obtained_at?: string
          openid_hash?: string
          session_revision?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_mini_session_credentials_oauth_identity_id_fkey"
            columns: ["oauth_identity_id"]
            isOneToOne: false
            referencedRelation: "user_oauth_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_pay_settlement_rules: {
        Row: {
          created_at: string
          id: string
          label: string
          qualification_type: string
          rate_label: string
          requires_special_qualification: boolean
          settlement_cycle_label: string
          settlement_id: string
          sort_order: number
          status: string
          subject_type: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          qualification_type: string
          rate_label?: string
          requires_special_qualification?: boolean
          settlement_cycle_label?: string
          settlement_id: string
          sort_order?: number
          status?: string
          subject_type: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          qualification_type?: string
          rate_label?: string
          requires_special_qualification?: boolean
          settlement_cycle_label?: string
          settlement_id?: string
          sort_order?: number
          status?: string
          subject_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      wechat_payment_notifications: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          notify_id: string
          order_id: string | null
          processed: boolean
          processed_at: string | null
          raw_payload: Json
          resource_type: string | null
          signature_valid: boolean
          summary: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          notify_id: string
          order_id?: string | null
          processed?: boolean
          processed_at?: string | null
          raw_payload?: Json
          resource_type?: string | null
          signature_valid?: boolean
          summary?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          notify_id?: string
          order_id?: string | null
          processed?: boolean
          processed_at?: string | null
          raw_payload?: Json
          resource_type?: string | null
          signature_valid?: boolean
          summary?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_payment_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wechat_payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_payment_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "wechat_payment_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_payment_orders: {
        Row: {
          amount: number
          closed_at: string | null
          created_at: string
          created_by_employee_id: string | null
          currency: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          latest_notification_id: string | null
          metadata: Json
          out_trade_no: string
          paid_amount: number
          paid_at: string | null
          payer_openid: string | null
          payment_config_id: string | null
          payment_id: string | null
          prepay_id: string | null
          project_id: string
          receivable_plan_id: string | null
          status: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
          workflow_instance_id: string | null
          workflow_task_id: string | null
        }
        Insert: {
          amount: number
          closed_at?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          latest_notification_id?: string | null
          metadata?: Json
          out_trade_no: string
          paid_amount?: number
          paid_at?: string | null
          payer_openid?: string | null
          payment_config_id?: string | null
          payment_id?: string | null
          prepay_id?: string | null
          project_id: string
          receivable_plan_id?: string | null
          status?: string
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string
          workflow_instance_id?: string | null
          workflow_task_id?: string | null
        }
        Update: {
          amount?: number
          closed_at?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          latest_notification_id?: string | null
          metadata?: Json
          out_trade_no?: string
          paid_amount?: number
          paid_at?: string | null
          payer_openid?: string | null
          payment_config_id?: string | null
          payment_id?: string | null
          prepay_id?: string | null
          project_id?: string
          receivable_plan_id?: string | null
          status?: string
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string
          workflow_instance_id?: string | null
          workflow_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wechat_payment_orders_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_payment_orders_payment_config_id_fkey"
            columns: ["payment_config_id"]
            isOneToOne: false
            referencedRelation: "tenant_payment_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_payment_orders_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_payment_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_payment_orders_receivable_plan_id_fkey"
            columns: ["receivable_plan_id"]
            isOneToOne: false
            referencedRelation: "project_receivable_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_payment_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "wechat_payment_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_payment_orders_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_payment_orders_workflow_task_id_fkey"
            columns: ["workflow_task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_rebind_requests: {
        Row: {
          applicant_name: string | null
          community_hint: string | null
          created_at: string
          id: string
          new_auth_user_id: string
          old_auth_user_id: string | null
          phone: string
          project_hint: string | null
          remark: string | null
          review_comment: string | null
          reviewed_at: string | null
          reviewer_employee_id: string | null
          status: string
          target_customer_id: string | null
          target_employee_id: string | null
          target_role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          applicant_name?: string | null
          community_hint?: string | null
          created_at?: string
          id?: string
          new_auth_user_id: string
          old_auth_user_id?: string | null
          phone: string
          project_hint?: string | null
          remark?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewer_employee_id?: string | null
          status?: string
          target_customer_id?: string | null
          target_employee_id?: string | null
          target_role: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          applicant_name?: string | null
          community_hint?: string | null
          created_at?: string
          id?: string
          new_auth_user_id?: string
          old_auth_user_id?: string | null
          phone?: string
          project_hint?: string | null
          remark?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewer_employee_id?: string | null
          status?: string
          target_customer_id?: string | null
          target_employee_id?: string | null
          target_role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_rebind_requests_reviewer_employee_id_fkey"
            columns: ["reviewer_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_rebind_requests_target_customer_id_fkey"
            columns: ["target_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_rebind_requests_target_employee_id_fkey"
            columns: ["target_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_rebind_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "wechat_rebind_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_virtual_payment_notifications: {
        Row: {
          actual_price_fen: number | null
          attach: string | null
          authentication_method: string
          authentication_status: string
          created_at: string
          environment: string
          event_key: string
          event_type: string
          id: string
          last_error_code: string | null
          last_error_summary: string | null
          msg_type: string
          normalized_payload: Json
          openid_hash: string | null
          order_id: string | null
          orig_price_fen: number | null
          out_trade_no: string | null
          paid_at: string | null
          payload_sha256: string
          processed_at: string | null
          provider_created_at: number
          provider_order_no: string | null
          provider_product_id: string | null
          quantity: number | null
          received_at: string
          recipient_original_id: string
          request_id: string | null
          result_summary: Json
          retry_count: number
          sender_id_hash: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          actual_price_fen?: number | null
          attach?: string | null
          authentication_method: string
          authentication_status: string
          created_at?: string
          environment: string
          event_key: string
          event_type: string
          id?: string
          last_error_code?: string | null
          last_error_summary?: string | null
          msg_type: string
          normalized_payload?: Json
          openid_hash?: string | null
          order_id?: string | null
          orig_price_fen?: number | null
          out_trade_no?: string | null
          paid_at?: string | null
          payload_sha256: string
          processed_at?: string | null
          provider_created_at: number
          provider_order_no?: string | null
          provider_product_id?: string | null
          quantity?: number | null
          received_at?: string
          recipient_original_id: string
          request_id?: string | null
          result_summary?: Json
          retry_count?: number
          sender_id_hash: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_price_fen?: number | null
          attach?: string | null
          authentication_method?: string
          authentication_status?: string
          created_at?: string
          environment?: string
          event_key?: string
          event_type?: string
          id?: string
          last_error_code?: string | null
          last_error_summary?: string | null
          msg_type?: string
          normalized_payload?: Json
          openid_hash?: string | null
          order_id?: string | null
          orig_price_fen?: number | null
          out_trade_no?: string | null
          paid_at?: string | null
          payload_sha256?: string
          processed_at?: string | null
          provider_created_at?: number
          provider_order_no?: string | null
          provider_product_id?: string | null
          quantity?: number | null
          received_at?: string
          recipient_original_id?: string
          request_id?: string | null
          result_summary?: Json
          retry_count?: number
          sender_id_hash?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_virtual_payment_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "tenant_virtual_addon_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_virtual_refund_event_inbox: {
        Row: {
          decision_code: number | null
          event_key: string
          event_type: string
          id: string
          order_id: string | null
          out_trade_no: string
          payload_sha256: string
          processed_at: string
          provider_created_at: number
          provider_reference_hash: string
          provider_result_code: number | null
          received_at: string
          recipient_original_id: string
          refund_id: string | null
          request_id: string | null
          result_summary: Json
          sender_id_hash: string
        }
        Insert: {
          decision_code?: number | null
          event_key: string
          event_type: string
          id?: string
          order_id?: string | null
          out_trade_no: string
          payload_sha256: string
          processed_at?: string
          provider_created_at: number
          provider_reference_hash: string
          provider_result_code?: number | null
          received_at?: string
          recipient_original_id: string
          refund_id?: string | null
          request_id?: string | null
          result_summary?: Json
          sender_id_hash: string
        }
        Update: {
          decision_code?: number | null
          event_key?: string
          event_type?: string
          id?: string
          order_id?: string | null
          out_trade_no?: string
          payload_sha256?: string
          processed_at?: string
          provider_created_at?: number
          provider_reference_hash?: string
          provider_result_code?: number | null
          received_at?: string
          recipient_original_id?: string
          refund_id?: string | null
          request_id?: string | null
          result_summary?: Json
          sender_id_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_virtual_refund_event_inbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "tenant_virtual_addon_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_virtual_refund_event_inbox_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "tenant_virtual_addon_refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_definition_bindings: {
        Row: {
          created_at: string
          definition_id: string
          id: string
          is_default: boolean
          selectable: boolean
          subject_type: string
          tenant_id: string
          updated_at: string
          workflow_purpose: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          id?: string
          is_default?: boolean
          selectable?: boolean
          subject_type: string
          tenant_id: string
          updated_at?: string
          workflow_purpose: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          id?: string
          is_default?: boolean
          selectable?: boolean
          subject_type?: string
          tenant_id?: string
          updated_at?: string
          workflow_purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_definition_bindings_definition_tenant_fkey"
            columns: ["definition_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "workflow_definition_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_definition_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_definitions: {
        Row: {
          active_version_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          workflow_key: string
        }
        Insert: {
          active_version_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          workflow_key: string
        }
        Update: {
          active_version_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          workflow_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_definitions_active_version_id_fkey"
            columns: ["active_version_id", "id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id", "definition_id"]
          },
          {
            foreignKeyName: "workflow_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_definitions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_edges: {
        Row: {
          condition: Json
          created_at: string
          definition_id: string
          id: string
          label: string | null
          priority: number
          source_node_id: string
          target_node_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          condition?: Json
          created_at?: string
          definition_id: string
          id?: string
          label?: string | null
          priority?: number
          source_node_id: string
          target_node_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          condition?: Json
          created_at?: string
          definition_id?: string
          id?: string
          label?: string | null
          priority?: number
          source_node_id?: string
          target_node_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_edges_definition_tenant_fkey"
            columns: ["definition_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "workflow_edges_source_node_definition_fkey"
            columns: ["source_node_id", "definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id", "definition_id"]
          },
          {
            foreignKeyName: "workflow_edges_target_node_definition_fkey"
            columns: ["target_node_id", "definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id", "definition_id"]
          },
          {
            foreignKeyName: "workflow_edges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_edges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instance_nodes: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          definition_id: string
          id: string
          input: Json
          instance_id: string
          node_id: string
          node_key: string
          node_snapshot: Json
          node_type: string
          output: Json
          started_at: string
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          definition_id: string
          id?: string
          input?: Json
          instance_id: string
          node_id: string
          node_key: string
          node_snapshot: Json
          node_type: string
          output?: Json
          started_at?: string
          started_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          definition_id?: string
          id?: string
          input?: Json
          instance_id?: string
          node_id?: string
          node_key?: string
          node_snapshot?: Json
          node_type?: string
          output?: Json
          started_at?: string
          started_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instance_nodes_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instance_nodes_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instance_nodes_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instance_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_instance_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instances: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          completed_at: string | null
          completed_by: string | null
          context: Json
          created_at: string
          current_node_id: string | null
          current_node_key: string | null
          current_node_snapshot: Json | null
          definition_id: string
          id: string
          started_at: string
          started_by: string | null
          status: string
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          context?: Json
          created_at?: string
          current_node_id?: string | null
          current_node_key?: string | null
          current_node_snapshot?: Json | null
          definition_id: string
          id?: string
          started_at?: string
          started_by?: string | null
          status?: string
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          context?: Json
          created_at?: string
          current_node_id?: string | null
          current_node_key?: string | null
          current_node_snapshot?: Json | null
          definition_id?: string
          id?: string
          started_at?: string
          started_by?: string | null
          status?: string
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_definition_tenant_fkey"
            columns: ["definition_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "workflow_instances_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_version_definition_fkey"
            columns: ["version_id", "definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id", "definition_id"]
          },
        ]
      }
      workflow_nodes: {
        Row: {
          business_kind: string | null
          config: Json
          created_at: string
          definition_id: string
          description: string | null
          id: string
          node_key: string
          node_type: string
          position: Json
          sort_order: number
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          business_kind?: string | null
          config?: Json
          created_at?: string
          definition_id: string
          description?: string | null
          id?: string
          node_key: string
          node_type: string
          position?: Json
          sort_order?: number
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          business_kind?: string | null
          config?: Json
          created_at?: string
          definition_id?: string
          description?: string | null
          id?: string
          node_key?: string
          node_type?: string
          position?: Json
          sort_order?: number
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_nodes_definition_tenant_fkey"
            columns: ["definition_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "workflow_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_subject_states: {
        Row: {
          created_at: string
          current_business_kind: string | null
          current_node_key: string | null
          current_node_title: string | null
          definition_id: string | null
          id: string
          instance_id: string | null
          instance_status: string | null
          pending_task_count: number
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_business_kind?: string | null
          current_node_key?: string | null
          current_node_title?: string | null
          definition_id?: string | null
          id?: string
          instance_id?: string | null
          instance_status?: string | null
          pending_task_count?: number
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_business_kind?: string | null
          current_node_key?: string | null
          current_node_title?: string | null
          definition_id?: string | null
          id?: string
          instance_id?: string | null
          instance_status?: string | null
          pending_task_count?: number
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_subject_states_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_subject_states_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_subject_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_subject_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_tasks: {
        Row: {
          assignee_employee_id: string | null
          assignee_permission_code: string | null
          assignee_role_code: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          definition_id: string
          due_at: string | null
          id: string
          instance_id: string
          instance_node_id: string | null
          node_id: string
          node_key: string
          node_type: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
          version_id: string
        }
        Insert: {
          assignee_employee_id?: string | null
          assignee_permission_code?: string | null
          assignee_role_code?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          definition_id: string
          due_at?: string | null
          id?: string
          instance_id: string
          instance_node_id?: string | null
          node_id: string
          node_key: string
          node_type: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          version_id: string
        }
        Update: {
          assignee_employee_id?: string | null
          assignee_permission_code?: string | null
          assignee_role_code?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          definition_id?: string
          due_at?: string | null
          id?: string
          instance_id?: string
          instance_node_id?: string | null
          node_id?: string
          node_key?: string
          node_type?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_tasks_assignee_employee_id_fkey"
            columns: ["assignee_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_instance_node_id_fkey"
            columns: ["instance_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_transition_logs: {
        Row: {
          action: string
          actor_employee_id: string | null
          context: Json
          created_at: string
          definition_id: string
          edge_id: string | null
          id: string
          instance_id: string
          source_node_id: string | null
          source_node_key: string | null
          target_node_id: string | null
          target_node_key: string | null
          tenant_id: string
          version_id: string
        }
        Insert: {
          action: string
          actor_employee_id?: string | null
          context?: Json
          created_at?: string
          definition_id: string
          edge_id?: string | null
          id?: string
          instance_id: string
          source_node_id?: string | null
          source_node_key?: string | null
          target_node_id?: string | null
          target_node_key?: string | null
          tenant_id: string
          version_id: string
        }
        Update: {
          action?: string
          actor_employee_id?: string | null
          context?: Json
          created_at?: string
          definition_id?: string
          edge_id?: string | null
          id?: string
          instance_id?: string
          source_node_id?: string | null
          source_node_key?: string | null
          target_node_id?: string | null
          target_node_key?: string | null
          tenant_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_transition_logs_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transition_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transition_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_transition_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_versions: {
        Row: {
          created_at: string
          definition_id: string
          id: string
          published_at: string
          published_by: string | null
          snapshot: Json
          status: string
          tenant_id: string
          validation_result: Json
          version_label: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          definition_id: string
          id?: string
          published_at?: string
          published_by?: string | null
          snapshot: Json
          status?: string
          tenant_id: string
          validation_result?: Json
          version_label?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          definition_id?: string
          id?: string
          published_at?: string
          published_by?: string | null
          snapshot?: Json
          status?: string
          tenant_id?: string
          validation_result?: Json
          version_label?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_definition_tenant_fkey"
            columns: ["definition_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "workflow_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "workflow_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      platform_ocr_tenant_policy_overview: {
        Row: {
          allowed_document_types: string[] | null
          configured: boolean | null
          created_at: string | null
          daily_limit: number | null
          enabled: boolean | null
          enabled_at: string | null
          remark: string | null
          tenant_id: string | null
          tenant_name: string | null
          tenant_slug: string | null
          tenant_status: string | null
          updated_at: string | null
          updated_by_employee_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_tenant_policies_updated_by_employee_id_fkey"
            columns: ["updated_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_supplier_directory: {
        Row: {
          code: string | null
          created_at: string | null
          id: string | null
          legal_name: string | null
          name: string | null
          onboarding_status: string | null
          operational_status: string | null
          qualification_health: string | null
          supplier_type: string | null
          unified_social_credit_code: string | null
          updated_at: string | null
          version: number | null
        }
        Relationships: []
      }
      site_content_admin_list: {
        Row: {
          content_type: string | null
          created_at: string | null
          id: string | null
          published_at: string | null
          published_version_id: string | null
          slug: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_content_published_version_fk"
            columns: ["id", "published_version_id"]
            isOneToOne: false
            referencedRelation: "site_content_versions"
            referencedColumns: ["entry_id", "id"]
          },
        ]
      }
      tenant_credit_account_balances: {
        Row: {
          available_credits: number | null
          balance_credits: number | null
          created_at: string | null
          expires_at: string | null
          frozen_credits: number | null
          id: string | null
          is_test: boolean | null
          last_activity_at: string | null
          last_recharged_at: string | null
          status: string | null
          tenant_id: string | null
          total_consumed_credits: number | null
          total_granted_credits: number | null
          total_recharged_credits: number | null
          updated_at: string | null
        }
        Insert: {
          available_credits?: never
          balance_credits?: number | null
          created_at?: string | null
          expires_at?: string | null
          frozen_credits?: number | null
          id?: string | null
          is_test?: boolean | null
          last_activity_at?: string | null
          last_recharged_at?: string | null
          status?: string | null
          tenant_id?: string | null
          total_consumed_credits?: number | null
          total_granted_credits?: number | null
          total_recharged_credits?: number | null
          updated_at?: string | null
        }
        Update: {
          available_credits?: never
          balance_credits?: number | null
          created_at?: string | null
          expires_at?: string | null
          frozen_credits?: number | null
          id?: string | null
          is_test?: boolean | null
          last_activity_at?: string | null
          last_recharged_at?: string | null
          status?: string | null
          tenant_id?: string | null
          total_consumed_credits?: number | null
          total_granted_credits?: number | null
          total_recharged_credits?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credit_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "platform_ocr_tenant_policy_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_credit_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abandon_tenant_supplier_code_reservations: {
        Args: { p_limit?: number }
        Returns: number
      }
      activate_douyin_budget_pricing_version: {
        Args: {
          p_expected_updated_at: string
          p_pricing_version_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      activate_wechat_pay_applyment_config: {
        Args: {
          p_applyment_id: string
          p_employee_id: string
          p_expected_updated_at: string
          p_platform_payment_config_id: string
        }
        Returns: string
      }
      allocate_tenant_supplier_code: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_idempotency_key: string
          p_tenant_id: string
        }
        Returns: Json
      }
      append_douyin_lead_follow_up: {
        Args: {
          p_actor_employee_id: string
          p_appointment_id: string
          p_appointment_status: string
          p_confirmed_visit_at: string
          p_expected_version: number
          p_follow_up_type: string
          p_idempotency_key: string
          p_marketing_lead_id: string
          p_next_follow_up_at: string
          p_result: string
          p_summary: string
          p_tenant_id: string
        }
        Returns: Json
      }
      apply_tenant_entitlement_action: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_entitlement_code: string
          p_expected_version: number
          p_reason: string
          p_tenant_id: string
          p_term_years: number
        }
        Returns: {
          created_at: string
          entitlement_code: string
          expires_at: string
          id: string
          source_id: string | null
          source_type: string
          starts_at: string
          status: string
          suspend_reason: string | null
          suspended_at: string | null
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "tenant_entitlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_platform_partner_member_rebind_request: {
        Args: {
          p_comment?: string
          p_request_id: string
          p_reviewer_employee_id: string
        }
        Returns: {
          request_id: string
          status: string
        }[]
      }
      approve_tenant_onboarding_application: {
        Args: {
          p_application_id: string
          p_attribution_source_type?: string
          p_expected_version: number
          p_final_partner_id?: string
          p_review_remark?: string
          p_reviewer_employee_id: string
          p_tenant_slug: string
        }
        Returns: Json
      }
      archive_douyin_budget_pricing_version: {
        Args: {
          p_expected_updated_at: string
          p_pricing_version_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      archive_platform_role: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_role_id: string
        }
        Returns: Json
      }
      archive_site_content: {
        Args: { p_actor_id: string; p_entry_id: string }
        Returns: {
          content_type: string
          created_at: string
          id: string
          published_at: string | null
          published_version_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "site_content_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_branding_virtual_payment_order_current: {
        Args: {
          p_mapping: Database["public"]["Tables"]["platform_virtual_payment_products"]["Row"]
          p_order: Database["public"]["Tables"]["tenant_virtual_addon_orders"]["Row"]
          p_product: Database["public"]["Tables"]["platform_addon_products"]["Row"]
        }
        Returns: undefined
      }
      assert_platform_catalog_actor: {
        Args: { p_actor_employee_id: string; p_actor_user_id: string }
        Returns: undefined
      }
      assert_platform_operator_actor: {
        Args: { p_actor_employee_id: string }
        Returns: undefined
      }
      assert_platform_supplier: {
        Args: { p_supplier_id: string }
        Returns: undefined
      }
      assert_supplier_price_runtime_actor: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      assert_supplier_price_scope: {
        Args: {
          p_actor_employee_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      assert_supplier_price_v2_context: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_supplier_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: undefined
      }
      assert_supplier_product_v2_context: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_ownership_scope: string
          p_supplier_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: undefined
      }
      assert_supplier_proxy_scope: {
        Args: {
          p_actor_employee_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      assert_supplier_purchase_order_actor: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      assert_tenant_supplier_actor: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      assign_douyin_lead: {
        Args: {
          p_actor_employee_id: string
          p_assigned_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_marketing_lead_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      assign_platform_lead: {
        Args: {
          p_assigned_note?: string
          p_lead_id: string
          p_operator_employee_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      attach_douyin_authorization_event_code_digest: {
        Args: { p_authorization_code_digest: string; p_event_key: string }
        Returns: boolean
      }
      begin_phone_identity_selection: {
        Args: {
          p_auth_user_id: string
          p_candidates: Json
          p_now: string
          p_openid_hash: string
          p_selection_token_hash: string
          p_session_id: string
          p_share_context: Json
        }
        Returns: {
          status: string
        }[]
      }
      billing_apply_wechat_recharge_refund_callback_state: {
        Args: {
          p_checked_at: string
          p_metadata: Json
          p_out_refund_no: string
          p_refund_request_id: string
          p_status: string
        }
        Returns: boolean
      }
      billing_begin_wechat_recharge_refund: {
        Args: {
          p_now: string
          p_out_refund_no: string
          p_refund_request_id: string
        }
        Returns: Json
      }
      billing_charge_credits: {
        Args: {
          p_change_credits: number
          p_correlation_id?: string
          p_event_type: string
          p_operator_user_id?: string
          p_pricing_snapshot?: Json
          p_remark?: string
          p_source_id?: string
          p_source_type?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      billing_charge_subscription_invoice: {
        Args: { p_invoice_id: string; p_operator_user_id?: string }
        Returns: Json
      }
      billing_claim_expired_recharge_orders: {
        Args: {
          p_excluded_ids?: string[]
          p_lease_seconds: number
          p_limit: number
        }
        Returns: {
          amount_fen: number
          bonus_credits: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          credits: number
          id: string
          idempotency_key: string | null
          latest_notification_id: string | null
          metadata: Json
          order_no: string
          out_trade_no: string | null
          package_code: string | null
          paid_amount_fen: number
          paid_at: string | null
          payment_config_id: string | null
          payment_expires_at: string | null
          prepay_id: string | null
          refund_amount_fen: number | null
          refund_requested_at: string | null
          refund_status: string | null
          refunded_at: string | null
          remark: string | null
          status: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_credit_orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      billing_claim_wechat_recharge_refunds: {
        Args: {
          p_claim_token: string
          p_lease_seconds: number
          p_limit: number
          p_now: string
        }
        Returns: {
          id: string
          order_id: string
          out_refund_no: string
          reason: string
          reconcile_attempt_count: number
          refund_amount_fen: number
          requested_amount_fen: number
          tenant_id: string
          wechat_refund_id: string
        }[]
      }
      billing_close_wechat_recharge_refund: {
        Args: {
          p_checked_at: string
          p_claim_token: string
          p_metadata: Json
          p_refund_request_id: string
        }
        Returns: boolean
      }
      billing_confirm_claimed_wechat_recharge_refund: {
        Args: {
          p_claim_token: string
          p_metadata: Json
          p_out_refund_no: string
          p_refund_amount_fen: number
          p_refund_request_id: string
          p_refunded_at: string
          p_wechat_refund_id: string
        }
        Returns: Json
      }
      billing_confirm_wechat_recharge: {
        Args: {
          p_metadata?: Json
          p_notification_id: string
          p_order_id: string
          p_paid_amount_fen: number
          p_paid_at: string
          p_transaction_id: string
        }
        Returns: Json
      }
      billing_confirm_wechat_recharge_and_recover: {
        Args: {
          p_metadata?: Json
          p_notification_id: string
          p_order_id: string
          p_paid_amount_fen: number
          p_paid_at: string
          p_transaction_id: string
        }
        Returns: Json
      }
      billing_confirm_wechat_recharge_core: {
        Args: {
          p_metadata?: Json
          p_notification_id: string
          p_order_id: string
          p_paid_amount_fen: number
          p_paid_at: string
          p_transaction_id: string
        }
        Returns: Json
      }
      billing_confirm_wechat_recharge_refund: {
        Args: {
          p_metadata?: Json
          p_notification_id: string
          p_out_refund_no: string
          p_refund_amount_fen: number
          p_refund_request_id: string
          p_refunded_at: string
          p_wechat_refund_id: string
        }
        Returns: Json
      }
      billing_create_pending_wechat_recharge_order: {
        Args: {
          p_amount_fen: number
          p_bonus_credits: number
          p_created_by: string
          p_credits: number
          p_expected_guard_version: number
          p_idempotency_key: string
          p_metadata?: Json
          p_order_no: string
          p_out_trade_no: string
          p_package_code: string
          p_payment_config_id: string
          p_payment_expires_at: string
          p_tenant_id: string
        }
        Returns: {
          amount_fen: number
          bonus_credits: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          credits: number
          id: string
          idempotency_key: string | null
          latest_notification_id: string | null
          metadata: Json
          order_no: string
          out_trade_no: string | null
          package_code: string | null
          paid_amount_fen: number
          paid_at: string | null
          payment_config_id: string | null
          payment_expires_at: string | null
          prepay_id: string | null
          refund_amount_fen: number | null
          refund_requested_at: string | null
          refund_status: string | null
          refunded_at: string | null
          remark: string | null
          status: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_credit_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      billing_ensure_account: { Args: { p_tenant_id: string }; Returns: Json }
      billing_ensure_subscription_invoices: {
        Args: { p_limit?: number; p_now?: string }
        Returns: Json
      }
      billing_freeze_credits: {
        Args: {
          p_change_credits: number
          p_correlation_id?: string
          p_event_type: string
          p_remark?: string
          p_source_id?: string
          p_source_type?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      billing_manual_recharge: {
        Args: {
          p_amount_fen: number
          p_bonus_credits?: number
          p_credits: number
          p_idempotency_key?: string
          p_metadata?: Json
          p_operator_user_id?: string
          p_remark?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      billing_recover_subscription_after_recharge: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      billing_renew_recharge_close_claim: {
        Args: {
          p_claim_token: string
          p_lease_seconds: number
          p_order_id: string
        }
        Returns: {
          amount_fen: number
          bonus_credits: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          credits: number
          id: string
          idempotency_key: string | null
          latest_notification_id: string | null
          metadata: Json
          order_no: string
          out_trade_no: string | null
          package_code: string | null
          paid_amount_fen: number
          paid_at: string | null
          payment_config_id: string | null
          payment_expires_at: string | null
          prepay_id: string | null
          refund_amount_fen: number | null
          refund_requested_at: string | null
          refund_status: string | null
          refunded_at: string | null
          remark: string | null
          status: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_credit_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      billing_reschedule_wechat_recharge_refund: {
        Args: {
          p_checked_at: string
          p_claim_token: string
          p_last_error: string
          p_metadata: Json
          p_reconcile_next_at: string
          p_refund_amount_fen: number
          p_refund_request_id: string
          p_wechat_refund_id: string
        }
        Returns: boolean
      }
      billing_settle_event: {
        Args: {
          p_billing_event_id: string
          p_correlation_id?: string
          p_operator_user_id?: string
        }
        Returns: Json
      }
      billing_unfreeze_credits: {
        Args: {
          p_change_credits: number
          p_correlation_id?: string
          p_event_type: string
          p_remark?: string
          p_source_id?: string
          p_source_type?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      bind_customer_from_tenant_share: {
        Args: { p_auth_user_id: string; p_phone: string; p_share_token: string }
        Returns: Json
      }
      bind_douyin_miniapp_installation: {
        Args: {
          p_authorizer_appid: string
          p_deployment_key: string
          p_runtime_config: Json
          p_tenant_id: string
        }
        Returns: {
          access_token_ciphertext: string | null
          access_token_expires_at: string | null
          access_token_iv: string | null
          access_token_key_version: string | null
          access_token_tag: string | null
          authorization_event_occurred_at: string | null
          authorization_status: string
          authorizer_appid: string
          component_appid: string
          created_at: string
          deployment_key: string | null
          id: string
          installation_kind: string
          last_audited_at: string | null
          last_released_at: string | null
          last_submitted_at: string | null
          permission_snapshot: Json
          refresh_token_ciphertext: string | null
          refresh_token_expires_at: string | null
          refresh_token_iv: string | null
          refresh_token_key_version: string | null
          refresh_token_tag: string | null
          revoked_at: string | null
          runtime_config: Json
          template_id: string | null
          template_release_id: string | null
          template_version: string | null
          tenant_id: string | null
          token_refresh_claim_expires_at: string | null
          token_refresh_claim_token: string | null
          token_refresh_last_error: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "douyin_miniapp_installations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      branding_assert_virtual_cutover_ready: { Args: never; Returns: boolean }
      branding_begin_virtual_payment_delivery_retry: {
        Args: {
          p_attempt_key: string
          p_claim_token: string
          p_order_id: string
        }
        Returns: boolean
      }
      branding_claim_expired_addon_orders: {
        Args: {
          p_excluded_ids?: string[]
          p_lease_seconds: number
          p_limit: number
        }
        Returns: {
          amount_fen: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          close_reason: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          expected_guard_version: number
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string
          metadata: Json
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_appid: string
          payment_config_id: string
          payment_expires_at: string
          payment_mchid: string
          prepay_id: string | null
          product_code: string
          product_id: string
          product_name: string
          purchase_notes: string
          refund_policy: string
          status: string
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_addon_orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      branding_claim_legacy_pending_orders: {
        Args: { p_lease_seconds: number; p_limit: number }
        Returns: {
          amount_fen: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          close_reason: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          expected_guard_version: number
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string
          metadata: Json
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_appid: string
          payment_config_id: string
          payment_expires_at: string
          payment_mchid: string
          prepay_id: string | null
          product_code: string
          product_id: string
          product_name: string
          purchase_notes: string
          refund_policy: string
          status: string
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_addon_orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      branding_claim_virtual_addon_payment_request: {
        Args: {
          p_created_by: string
          p_order_id: string
          p_payer_openid: string
          p_tenant_id: string
        }
        Returns: {
          amount_fen: number
          config_version: number
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          environment: string
          failure_code: string | null
          failure_message: string | null
          fulfillment_status: string
          id: string
          idempotency_key: string
          offer_id: string
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_expires_at: string
          payment_request_attempt_revision: number
          payment_request_claim_expires_at: string | null
          payment_request_claim_token: string | null
          payment_request_claimed_at: string | null
          payment_request_issued_at: string | null
          payment_status: string
          product_code: string
          product_id: string
          product_name: string
          provider_delivery_attempt_count: number
          provider_delivery_attempt_key: string | null
          provider_delivery_last_error: string | null
          provider_delivery_last_error_code: string | null
          provider_delivery_provided_at: string | null
          provider_delivery_request_id: string | null
          provider_delivery_status: string
          provider_order_no: string | null
          provider_order_type: number | null
          provider_product_id: string
          purchase_notes: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_completion_kind: string | null
          reconcile_last_checked_at: string | null
          reconcile_last_error: string | null
          reconcile_last_error_code: string | null
          reconcile_last_provider_status: number | null
          reconcile_next_at: string | null
          reconcile_query_paid_amount_fen: number | null
          reconcile_query_paid_at: string | null
          reconcile_query_provider_order_no: string | null
          reconcile_query_transaction_id: string | null
          refund_policy: string
          refund_status: string
          requested_platform: string
          secret_revision: number
          settlement_channel: string | null
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_virtual_addon_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      branding_claim_virtual_addon_refund_submission: {
        Args: { p_lease_seconds?: number; p_refund_id: string }
        Returns: {
          amount_fen: number
          apple_receipt_hash: string | null
          compensation_entitlement_event_id: string | null
          compensation_last_error: string | null
          compensation_status: string
          created_at: string
          evidence_summary: string
          failed_at: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          last_error_summary: string | null
          order_id: string
          platform_mode: string
          provider_refund_id: string | null
          provider_refund_no: string | null
          provider_refund_started_at: string | null
          provider_refund_succeeded_at: string | null
          provider_refund_transaction_id: string | null
          provider_request_id: string | null
          purchase_entitlement_event_id: string
          reason: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_next_at: string | null
          refund_no: string
          rejected_at: string | null
          request_source: string
          requested_by: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          succeeded_at: string | null
          tenant_id: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_virtual_addon_refunds"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      branding_claim_virtual_payment_reconciliation_batch: {
        Args: { p_lease_seconds: number; p_limit: number }
        Returns: {
          amount_fen: number
          entitlement_event_id: string
          environment: string
          fulfillment_status: string
          id: string
          offer_id: string
          out_trade_no: string
          paid_amount_fen: number
          paid_at: string
          payer_openid: string
          payment_expires_at: string
          payment_request_issued_at: string
          payment_status: string
          provider_delivery_attempt_count: number
          provider_delivery_attempt_key: string
          provider_delivery_last_error: string
          provider_delivery_last_error_code: string
          provider_delivery_provided_at: string
          provider_delivery_request_id: string
          provider_delivery_status: string
          provider_order_no: string
          provider_product_id: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string
          reconcile_claim_token: string
          reconcile_completion_kind: string
          reconcile_last_checked_at: string
          reconcile_last_error: string
          reconcile_last_error_code: string
          reconcile_last_provider_status: number
          reconcile_next_at: string
          reconcile_query_paid_amount_fen: number
          reconcile_query_paid_at: string
          reconcile_query_provider_order_no: string
          reconcile_query_transaction_id: string
          secret_revision: number
          tenant_id: string
          transaction_id: string
        }[]
      }
      branding_claim_virtual_refund_reconciliation_batch: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          amount_fen: number
          attempt_count: number
          claim_expires_at: string
          claim_token: string
          compensation_status: string
          environment: string
          order_id: string
          out_trade_no: string
          payer_openid: string
          platform_mode: string
          provider_order_no: string
          refund_id: string
          refund_status: string
          secret_revision: number
        }[]
      }
      branding_close_unpaid_virtual_payment_reconciliation: {
        Args: {
          p_claim_token: string
          p_official_status: number
          p_order_id: string
        }
        Returns: boolean
      }
      branding_compensate_virtual_addon_refund: {
        Args: { p_refund_id: string }
        Returns: {
          compensation_entitlement_event_id: string
          compensation_status: string
          refund_id: string
        }[]
      }
      branding_confirm_addon_purchase: {
        Args: {
          p_appid: string
          p_mchid: string
          p_metadata?: Json
          p_notification_id: string
          p_order_id: string
          p_out_trade_no: string
          p_paid_amount_fen: number
          p_paid_at: string
          p_transaction_id: string
        }
        Returns: Json
      }
      branding_confirm_virtual_addon_purchase: {
        Args: {
          p_actual_price_fen: number
          p_allow_late_closed_recovery: boolean
          p_attach: string
          p_currency: string
          p_environment: string
          p_event_type: string
          p_msg_type: string
          p_notification_id: string
          p_openid: string
          p_order_id: string
          p_orig_price_fen: number
          p_out_trade_no: string
          p_paid_at: string
          p_provider_created_at: number
          p_provider_order_no: string
          p_provider_product_id: string
          p_quantity: number
          p_recipient_original_id: string
          p_sender_id_hash: string
          p_source: string
          p_successful_state: boolean
          p_transaction_id: string
        }
        Returns: Json
      }
      branding_create_addon_order: {
        Args: {
          p_amount_fen: number
          p_created_by: string
          p_entitlement_code: string
          p_expected_guard_version: number
          p_idempotency_key: string
          p_metadata?: Json
          p_order_no: string
          p_out_trade_no: string
          p_payer_openid: string
          p_payment_appid: string
          p_payment_config_id: string
          p_payment_expires_at: string
          p_payment_mchid: string
          p_product_code: string
          p_product_id: string
          p_product_name: string
          p_purchase_notes: string
          p_refund_policy: string
          p_tenant_id: string
          p_term_years: number
        }
        Returns: {
          amount_fen: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          close_reason: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          expected_guard_version: number
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string
          metadata: Json
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_appid: string
          payment_config_id: string
          payment_expires_at: string
          payment_mchid: string
          prepay_id: string | null
          product_code: string
          product_id: string
          product_name: string
          purchase_notes: string
          refund_policy: string
          status: string
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_addon_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      branding_create_virtual_addon_order: {
        Args: {
          p_created_by: string
          p_idempotency_key: string
          p_payer_openid: string
          p_requested_platform: string
          p_tenant_id: string
          p_virtual_product_id: string
        }
        Returns: {
          amount_fen: number
          config_version: number
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          environment: string
          failure_code: string | null
          failure_message: string | null
          fulfillment_status: string
          id: string
          idempotency_key: string
          offer_id: string
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_expires_at: string
          payment_request_attempt_revision: number
          payment_request_claim_expires_at: string | null
          payment_request_claim_token: string | null
          payment_request_claimed_at: string | null
          payment_request_issued_at: string | null
          payment_status: string
          product_code: string
          product_id: string
          product_name: string
          provider_delivery_attempt_count: number
          provider_delivery_attempt_key: string | null
          provider_delivery_last_error: string | null
          provider_delivery_last_error_code: string | null
          provider_delivery_provided_at: string | null
          provider_delivery_request_id: string | null
          provider_delivery_status: string
          provider_order_no: string | null
          provider_order_type: number | null
          provider_product_id: string
          purchase_notes: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_completion_kind: string | null
          reconcile_last_checked_at: string | null
          reconcile_last_error: string | null
          reconcile_last_error_code: string | null
          reconcile_last_provider_status: number | null
          reconcile_next_at: string | null
          reconcile_query_paid_amount_fen: number | null
          reconcile_query_paid_at: string | null
          reconcile_query_provider_order_no: string | null
          reconcile_query_transaction_id: string | null
          refund_policy: string
          refund_status: string
          requested_platform: string
          secret_revision: number
          settlement_channel: string | null
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_virtual_addon_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      branding_create_virtual_addon_refund: {
        Args: {
          p_evidence_summary: string
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
          p_requested_by: string
        }
        Returns: {
          amount_fen: number
          apple_receipt_hash: string | null
          compensation_entitlement_event_id: string | null
          compensation_last_error: string | null
          compensation_status: string
          created_at: string
          evidence_summary: string
          failed_at: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          last_error_summary: string | null
          order_id: string
          platform_mode: string
          provider_refund_id: string | null
          provider_refund_no: string | null
          provider_refund_started_at: string | null
          provider_refund_succeeded_at: string | null
          provider_refund_transaction_id: string | null
          provider_request_id: string | null
          purchase_entitlement_event_id: string
          reason: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_next_at: string | null
          refund_no: string
          rejected_at: string | null
          request_source: string
          requested_by: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          succeeded_at: string | null
          tenant_id: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_virtual_addon_refunds"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      branding_finalize_virtual_addon_payment_request: {
        Args: {
          p_claim_token: string
          p_created_by: string
          p_order_id: string
          p_payer_openid: string
          p_tenant_id: string
        }
        Returns: {
          amount_fen: number
          config_version: number
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          environment: string
          failure_code: string | null
          failure_message: string | null
          fulfillment_status: string
          id: string
          idempotency_key: string
          offer_id: string
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_expires_at: string
          payment_request_attempt_revision: number
          payment_request_claim_expires_at: string | null
          payment_request_claim_token: string | null
          payment_request_claimed_at: string | null
          payment_request_issued_at: string | null
          payment_status: string
          product_code: string
          product_id: string
          product_name: string
          provider_delivery_attempt_count: number
          provider_delivery_attempt_key: string | null
          provider_delivery_last_error: string | null
          provider_delivery_last_error_code: string | null
          provider_delivery_provided_at: string | null
          provider_delivery_request_id: string | null
          provider_delivery_status: string
          provider_order_no: string | null
          provider_order_type: number | null
          provider_product_id: string
          purchase_notes: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_completion_kind: string | null
          reconcile_last_checked_at: string | null
          reconcile_last_error: string | null
          reconcile_last_error_code: string | null
          reconcile_last_provider_status: number | null
          reconcile_next_at: string | null
          reconcile_query_paid_amount_fen: number | null
          reconcile_query_paid_at: string | null
          reconcile_query_provider_order_no: string | null
          reconcile_query_transaction_id: string | null
          refund_policy: string
          refund_status: string
          requested_platform: string
          secret_revision: number
          settlement_channel: string | null
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_virtual_addon_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      branding_finalize_virtual_payment_reconciliation: {
        Args: {
          p_claim_token: string
          p_delivery_attempt_key: string
          p_official_status: number
          p_order_id: string
          p_paid_amount_fen: number
          p_paid_at: string
          p_provider_order_no: string
          p_transaction_id: string
        }
        Returns: boolean
      }
      branding_finalize_virtual_refund_reconciliation: {
        Args: {
          p_claim_token: string
          p_left_fee_fen: number
          p_official_status: number
          p_refund_fee_fen: number
          p_refund_id: string
        }
        Returns: {
          amount_fen: number
          apple_receipt_hash: string | null
          compensation_entitlement_event_id: string | null
          compensation_last_error: string | null
          compensation_status: string
          created_at: string
          evidence_summary: string
          failed_at: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          last_error_summary: string | null
          order_id: string
          platform_mode: string
          provider_refund_id: string | null
          provider_refund_no: string | null
          provider_refund_started_at: string | null
          provider_refund_succeeded_at: string | null
          provider_refund_transaction_id: string | null
          provider_request_id: string | null
          purchase_entitlement_event_id: string
          reason: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_next_at: string | null
          refund_no: string
          rejected_at: string | null
          request_source: string
          requested_by: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          succeeded_at: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "tenant_virtual_addon_refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      branding_get_entitlement_order_detail: {
        Args: { p_order_id: string; p_tenant_id: string }
        Returns: Json
      }
      branding_get_platform_addon_order_audit: {
        Args: { p_order_id: string }
        Returns: Json
      }
      branding_get_virtual_addon_refund_detail: {
        Args: { p_refund_id: string }
        Returns: Json
      }
      branding_get_virtual_product_management_snapshot: {
        Args: never
        Returns: Json
      }
      branding_get_virtual_refund_order_context: {
        Args: { p_order_id: string }
        Returns: Json
      }
      branding_list_entitlement_orders: {
        Args: {
          p_created_from?: string
          p_created_to?: string
          p_fulfillment_status?: string
          p_keyword?: string
          p_page?: number
          p_page_size?: number
          p_payment_channel?: string
          p_payment_status?: string
          p_refund_status?: string
          p_tenant_id?: string
        }
        Returns: {
          amount_fen: number
          closed_at: string
          count_only: boolean
          created_at: string
          entitlement_expires_at: string
          entitlement_source: string
          entitlement_source_id: string
          entitlement_starts_at: string
          entitlement_status: string
          failure_code: string
          fulfillment_status: string
          id: string
          order_no: string
          paid_at: string
          payment_channel: string
          payment_expires_at: string
          payment_platform: string
          payment_status: string
          product_code: string
          product_name: string
          refund_status: string
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          term_years: number
          total_count: number
          updated_at: string
        }[]
      }
      branding_list_virtual_addon_refunds: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_status?: string
          p_tenant_id?: string
        }
        Returns: Json[]
      }
      branding_manage_virtual_product_configuration: {
        Args: {
          p_actor_employee_id: string
          p_expected_product_version: number
          p_product_patch: Json
          p_virtual_product_patch: Json
        }
        Returns: Json
      }
      branding_manage_virtual_product_configuration_without_item_url: {
        Args: {
          p_actor_employee_id: string
          p_expected_product_version: number
          p_product_patch: Json
          p_virtual_product_patch: Json
        }
        Returns: Json
      }
      branding_mark_virtual_addon_refund_submitted: {
        Args: {
          p_claim_token: string
          p_provider_refund_id: string
          p_provider_request_id: string
          p_refund_id: string
        }
        Returns: {
          amount_fen: number
          apple_receipt_hash: string | null
          compensation_entitlement_event_id: string | null
          compensation_last_error: string | null
          compensation_status: string
          created_at: string
          evidence_summary: string
          failed_at: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          last_error_summary: string | null
          order_id: string
          platform_mode: string
          provider_refund_id: string | null
          provider_refund_no: string | null
          provider_refund_started_at: string | null
          provider_refund_succeeded_at: string | null
          provider_refund_transaction_id: string | null
          provider_request_id: string | null
          purchase_entitlement_event_id: string
          reason: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_next_at: string | null
          refund_no: string
          rejected_at: string | null
          request_source: string
          requested_by: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          succeeded_at: string | null
          tenant_id: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_virtual_addon_refunds"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      branding_mark_virtual_payment_delivery: {
        Args: {
          p_attempt_key: string
          p_claim_token: string
          p_delivery_status: string
          p_error_code: string
          p_error_summary: string
          p_order_id: string
          p_provider_request_id: string
        }
        Returns: boolean
      }
      branding_mark_virtual_refund_reconciliation_conflict: {
        Args: {
          p_claim_token: string
          p_error_code: string
          p_refund_id: string
        }
        Returns: boolean
      }
      branding_prepare_successful_query_reconciliation: {
        Args: {
          p_actual_price_fen: number
          p_attach: string
          p_claim_token: string
          p_currency: string
          p_environment: string
          p_official_status: number
          p_openid: string
          p_order_id: string
          p_orig_price_fen: number
          p_out_trade_no: string
          p_paid_at: string
          p_provider_order_no: string
          p_provider_order_type: number
          p_provider_product_id: string
          p_quantity: number
          p_transaction_id: string
        }
        Returns: boolean
      }
      branding_process_virtual_ios_refund_inquiry: {
        Args: {
          p_bundle_id: string
          p_channel_bill_hash: string
          p_order_time: string
          p_out_trade_no: string
          p_provide_status: number
          p_provider_created_at: number
          p_provider_product_id: string
          p_quantity: number
          p_recipient_original_id: string
          p_refund_request_reason: string
          p_refund_time: string
          p_request_id?: string
          p_sender_id_hash: string
        }
        Returns: {
          evidence: string
          notification_id: string
          result_code: number
          result_info: string
        }[]
      }
      branding_process_virtual_refund_notification: {
        Args: {
          p_local_refund_no: string
          p_openid_hash: string
          p_out_trade_no: string
          p_provider_created_at: number
          p_provider_order_id: string
          p_provider_refund_id: string
          p_provider_refund_transaction_id: string
          p_provider_result_code: number
          p_provider_result_message: string
          p_recipient_original_id: string
          p_refund_fee_fen: number
          p_refund_started_at: string
          p_refund_succeeded_at: string
          p_request_id?: string
          p_retry_times: number
          p_sender_id_hash: string
          p_successful: boolean
        }
        Returns: {
          compensation_status: string
          notification_id: string
          refund_id: string
          refund_status: string
        }[]
      }
      branding_record_apple_virtual_order_type_from_refund_fact: {
        Args: {
          p_environment: string
          p_left_fee_fen: number
          p_official_status: number
          p_order_fee_fen: number
          p_order_id: string
          p_out_trade_no: string
          p_paid_fee_fen: number
          p_provider_order_no: string
          p_provider_order_type: number
          p_refund_fee_fen: number
        }
        Returns: boolean
      }
      branding_record_virtual_order_type_fact: {
        Args: {
          p_environment: string
          p_left_fee_fen: number
          p_official_status: number
          p_order_fee_fen: number
          p_order_id: string
          p_out_trade_no: string
          p_paid_fee_fen: number
          p_provider_order_no: string
          p_provider_order_type: number
        }
        Returns: boolean
      }
      branding_release_virtual_addon_payment_request_claim: {
        Args: {
          p_claim_token: string
          p_created_by: string
          p_order_id: string
          p_payer_openid: string
          p_tenant_id: string
        }
        Returns: {
          amount_fen: number
          config_version: number
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          environment: string
          failure_code: string | null
          failure_message: string | null
          fulfillment_status: string
          id: string
          idempotency_key: string
          offer_id: string
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_expires_at: string
          payment_request_attempt_revision: number
          payment_request_claim_expires_at: string | null
          payment_request_claim_token: string | null
          payment_request_claimed_at: string | null
          payment_request_issued_at: string | null
          payment_status: string
          product_code: string
          product_id: string
          product_name: string
          provider_delivery_attempt_count: number
          provider_delivery_attempt_key: string | null
          provider_delivery_last_error: string | null
          provider_delivery_last_error_code: string | null
          provider_delivery_provided_at: string | null
          provider_delivery_request_id: string | null
          provider_delivery_status: string
          provider_order_no: string | null
          provider_order_type: number | null
          provider_product_id: string
          purchase_notes: string
          reconcile_attempt_count: number
          reconcile_claim_expires_at: string | null
          reconcile_claim_token: string | null
          reconcile_completion_kind: string | null
          reconcile_last_checked_at: string | null
          reconcile_last_error: string | null
          reconcile_last_error_code: string | null
          reconcile_last_provider_status: number | null
          reconcile_next_at: string | null
          reconcile_query_paid_amount_fen: number | null
          reconcile_query_paid_at: string | null
          reconcile_query_provider_order_no: string | null
          reconcile_query_transaction_id: string | null
          refund_policy: string
          refund_status: string
          requested_platform: string
          secret_revision: number
          settlement_channel: string | null
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_virtual_addon_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      branding_release_virtual_addon_refund_submission_claim: {
        Args: { p_claim_token: string; p_refund_id: string }
        Returns: boolean
      }
      branding_renew_addon_close_claim: {
        Args: {
          p_claim_token: string
          p_lease_seconds: number
          p_order_id: string
        }
        Returns: {
          amount_fen: number
          channel: string
          close_attempt_count: number
          close_claim_expires_at: string | null
          close_claim_token: string | null
          close_last_error: string | null
          close_reason: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          entitlement_code: string
          entitlement_event_id: string | null
          expected_guard_version: number
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string
          metadata: Json
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_appid: string
          payment_config_id: string
          payment_expires_at: string
          payment_mchid: string
          prepay_id: string | null
          product_code: string
          product_id: string
          product_name: string
          purchase_notes: string
          refund_policy: string
          status: string
          tenant_id: string
          term_years: number
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_addon_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      branding_renew_virtual_addon_refund_submission_claim: {
        Args: {
          p_claim_token: string
          p_lease_seconds?: number
          p_refund_id: string
        }
        Returns: boolean
      }
      branding_reschedule_virtual_payment_reconciliation: {
        Args: {
          p_claim_token: string
          p_error_code: string
          p_error_summary: string
          p_next_at: string
          p_official_status: number
          p_order_id: string
        }
        Returns: boolean
      }
      branding_reschedule_virtual_refund_reconciliation: {
        Args: {
          p_claim_token: string
          p_error_code: string
          p_error_summary: string
          p_next_at: string
          p_refund_id: string
        }
        Returns: boolean
      }
      branding_set_virtual_product_configuration_validation: {
        Args: {
          p_addon_product_id: string
          p_environment: string
          p_expected_mapping_version: number
          p_expected_product_version: number
          p_updated_by: string
          p_validated_at: string
          p_validation_status: string
        }
        Returns: {
          addon_product_id: string
          app_id: string
          created_at: string
          created_by: string | null
          encrypted_secret_ref: string
          environment: string
          expected_amount_fen: number
          goods_quantity: number
          id: string
          item_url: string | null
          offer_id: string
          provider: string
          provider_product_id: string
          secret_revision: number
          status: string
          updated_at: string
          updated_by: string | null
          validated_at: string | null
          validation_status: string
          version: number
          virtual_merchant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_virtual_payment_products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_supplier_payment_request: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_payment_request_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      cancel_supplier_purchase_order: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      cancel_supplier_purchase_order_fulfillment_v1: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      cancel_supplier_purchase_requisition: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason: string
          p_requisition_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      cancel_workflow_instance: {
        Args: {
          p_actor_employee_id: string
          p_context: Json
          p_definition_id: string
          p_instance_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      claim_douyin_authorization_event: {
        Args: {
          p_authorizer_appid: string
          p_component_appid: string
          p_event_key: string
          p_event_name: string
          p_occurred_at: string
        }
        Returns: {
          claim_expires_at: string
          claim_state: string
          claim_token: string
        }[]
      }
      claim_douyin_authorizer_token_force_refresh: {
        Args: {
          p_expected_access_token_ciphertext: string
          p_installation_id: string
        }
        Returns: {
          claim_expires_at: string
          claim_token: string
        }[]
      }
      claim_douyin_authorizer_token_refresh: {
        Args: { p_installation_id: string }
        Returns: {
          claim_expires_at: string
          claim_token: string
        }[]
      }
      claim_douyin_budget_ai_analysis: {
        Args: {
          p_douyin_miniapp_installation_id: string
          p_estimate_id: string
          p_retry: boolean
          p_subject_hash: string
          p_tenant_id: string
        }
        Returns: Json
      }
      claim_douyin_component_token_refresh: {
        Args: { p_component_appid: string }
        Returns: {
          claim_expires_at: string
          claim_token: string
        }[]
      }
      claim_douyin_miniapp_release_operation: {
        Args: {
          p_claim_expires_at: string
          p_claim_token: string
          p_expected_statuses: string[]
          p_operation_name: string
          p_operator_id: string
          p_release_id: string
        }
        Returns: {
          claim_expires_at: string
          claim_token: string
          recovery_required: boolean
          release_id: string
        }[]
      }
      claim_next_social_video_transcription:
        | {
            Args: never
            Returns: {
              asr_task_id: string | null
              audio_duration_seconds: number | null
              audio_file_size_bytes: number | null
              billable: boolean
              billed_at: string | null
              billing_charged: boolean
              billing_charged_at: string | null
              billing_correlation_id: string | null
              billing_duration_seconds: number | null
              billing_event_id: string | null
              billing_frozen_credits: number
              billing_minutes: number | null
              billing_source: string | null
              completed_at: string | null
              created_at: string
              created_by_auth_user_id: string | null
              error_code: string | null
              error_message: string | null
              id: string
              input_hash: string
              media_file_size_bytes: number | null
              normalized_url: string
              platform: string
              progress: number
              provider: string | null
              provider_actor_id: string | null
              provider_dataset_id: string | null
              provider_run_id: string | null
              raw_payload: Json | null
              resolved_audio_url: string | null
              resolved_video_url: string | null
              segments: Json
              source_url: string
              status: string
              tenant_id: string | null
              text: string | null
              title: string | null
              updated_at: string
            }[]
            SetofOptions: {
              from: "*"
              to: "social_video_transcriptions"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: { p_stale_before?: string }
            Returns: {
              asr_task_id: string | null
              audio_duration_seconds: number | null
              audio_file_size_bytes: number | null
              billable: boolean
              billed_at: string | null
              billing_charged: boolean
              billing_charged_at: string | null
              billing_correlation_id: string | null
              billing_duration_seconds: number | null
              billing_event_id: string | null
              billing_frozen_credits: number
              billing_minutes: number | null
              billing_source: string | null
              completed_at: string | null
              created_at: string
              created_by_auth_user_id: string | null
              error_code: string | null
              error_message: string | null
              id: string
              input_hash: string
              media_file_size_bytes: number | null
              normalized_url: string
              platform: string
              progress: number
              provider: string | null
              provider_actor_id: string | null
              provider_dataset_id: string | null
              provider_run_id: string | null
              raw_payload: Json | null
              resolved_audio_url: string | null
              resolved_video_url: string | null
              segments: Json
              source_url: string
              status: string
              tenant_id: string | null
              text: string | null
              title: string | null
              updated_at: string
            }[]
            SetofOptions: {
              from: "*"
              to: "social_video_transcriptions"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      claim_phone_identity_login_verification: {
        Args: {
          p_auth_user_id: string
          p_code: string
          p_expires_at: string
          p_now: string
          p_openid_hash: string
          p_phone: string
        }
        Returns: {
          session_id: string
          status: string
        }[]
      }
      claim_platform_partner_member_binding: {
        Args: { p_auth_user_id: string; p_code: string; p_phone: string }
        Returns: {
          member_id: string
          status: string
        }[]
      }
      claim_tenant_douyin_authorization_intent: {
        Args: { p_authorization_code_digest: string; p_intent_digest: string }
        Returns: {
          authorizer_appid: string
          claim_state: string
          component_appid: string
          expires_at: string
          intent_id: string
          tenant_id: string
        }[]
      }
      claim_tenant_onboarding_notification: {
        Args: {
          p_application_id: string
          p_delivery_id: string
          p_lease_seconds: number
          p_max_attempts: number
          p_now: string
        }
        Returns: {
          application_id: string
          application_version: number
          attempt_count: number
          channel: string
          claim_expires_at: string | null
          claim_token: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_onboarding_notification_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_tenant_wechat_pay_applyment_draft_session: {
        Args: {
          p_applyment_id: string
          p_employee_id: string
          p_tenant_id: string
        }
        Returns: number
      }
      claim_wechat_pay_applyment_submission: {
        Args: { p_applyment_id: string; p_employee_id: string }
        Returns: {
          activated_at: string | null
          appid_binding_message: string | null
          appid_binding_state: string
          application_no: string
          applyment_business_code: string | null
          applyment_id: string | null
          applyment_state: string
          applyment_state_message: string | null
          approved_at: string | null
          attachments: Json
          audit_detail: Json
          business_scene_description: string | null
          contact_address: string | null
          contact_identity_doc_type: string | null
          contact_identity_period_begin: string | null
          contact_identity_period_end: string | null
          contact_type: string | null
          created_at: string
          created_by_employee_id: string | null
          draft_epoch: number
          draft_revision: number
          has_sensitive_payload: boolean
          id: string
          identity_address_masked: string | null
          identity_doc_type: string | null
          identity_period_begin: string | null
          identity_period_end: string | null
          last_wechat_request_id: string | null
          last_wechat_synced_at: string | null
          legal_representative_name: string | null
          license_address: string | null
          license_code: string | null
          license_name: string | null
          license_period_begin: string | null
          license_period_end: string | null
          merchant_short_name: string | null
          opened_at: string | null
          payment_config_id: string | null
          qualification_type: string | null
          rejected_at: string | null
          rejected_reason: string | null
          remark: string | null
          reviewed_by_employee_id: string | null
          sensitive_payload_ciphertext: string | null
          sensitive_payload_updated_at: string | null
          sensitive_payload_version: number | null
          service_phone: string | null
          settlement_account_name: string | null
          settlement_account_number_masked: string | null
          settlement_account_summary: string | null
          settlement_account_type: string | null
          settlement_bank_branch_id: string | null
          settlement_bank_full_name: string | null
          settlement_bank_name: string | null
          settlement_id: string | null
          sign_url: string | null
          status: string
          sub_appid: string | null
          sub_mchid: string | null
          subject_type: string | null
          submission_attempt_count: number
          submission_claimed_at: string | null
          submitted_at: string | null
          super_admin_email: string | null
          super_admin_name: string | null
          super_admin_phone_masked: string | null
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string | null
          wechat_applyment_state_raw: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_wechat_pay_applyments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_supplier_payment_request: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_payment_request_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      command_supplier_price_item_v2: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_payload: Json
          p_price_list_id: string
          p_supplier_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      command_supplier_price_list_v2: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_new_price_list_id: string
          p_payload: Json
          p_price_list_id: string
          p_supplier_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      command_supplier_product_v2: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_ownership_scope: string
          p_payload: Json
          p_product_id: string
          p_supplier_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      command_supplier_sku_v2: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_ownership_scope: string
          p_payload: Json
          p_sku_id: string
          p_supplier_id: string
          p_supplier_product_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      complete_douyin_authorization_event: {
        Args: {
          p_access_token_ciphertext: string
          p_access_token_expires_at: string
          p_access_token_iv: string
          p_access_token_key_version: string
          p_access_token_tag: string
          p_authorizer_appid: string
          p_claim_token: string
          p_component_appid: string
          p_event_key: string
          p_event_name: string
          p_occurred_at: string
          p_permissions: Json
          p_refresh_token_ciphertext: string
          p_refresh_token_expires_at: string
          p_refresh_token_iv: string
          p_refresh_token_key_version: string
          p_refresh_token_tag: string
        }
        Returns: boolean
      }
      complete_douyin_authorizer_token_refresh: {
        Args: {
          p_access_token_ciphertext: string
          p_access_token_expires_at: string
          p_access_token_iv: string
          p_access_token_key_version: string
          p_access_token_tag: string
          p_claim_token: string
          p_installation_id: string
          p_refresh_token_ciphertext: string
          p_refresh_token_expires_at: string
          p_refresh_token_iv: string
          p_refresh_token_key_version: string
          p_refresh_token_tag: string
        }
        Returns: boolean
      }
      complete_douyin_budget_ai_analysis: {
        Args: {
          p_ai_analysis: Json
          p_ai_model: string
          p_ai_provider: string
          p_attempt_count: number
          p_claimed_at: string
          p_douyin_miniapp_installation_id: string
          p_estimate_id: string
          p_subject_hash: string
          p_tenant_id: string
        }
        Returns: Json
      }
      complete_douyin_component_token_refresh: {
        Args: {
          p_access_token_ciphertext: string
          p_access_token_expires_at: string
          p_access_token_iv: string
          p_access_token_key_version: string
          p_access_token_tag: string
          p_claim_token: string
          p_component_appid: string
        }
        Returns: boolean
      }
      complete_douyin_revocation_event: {
        Args: {
          p_authorizer_appid: string
          p_claim_token: string
          p_component_appid: string
          p_event_key: string
          p_occurred_at: string
        }
        Returns: boolean
      }
      complete_douyin_ticket_event: {
        Args: {
          p_claim_token: string
          p_component_appid: string
          p_event_key: string
          p_received_at: string
          p_ticket_ciphertext: string
          p_ticket_iv: string
          p_ticket_key_version: string
          p_ticket_tag: string
        }
        Returns: boolean
      }
      complete_douyin_unsupported_event: {
        Args: { p_claim_token: string; p_event_key: string }
        Returns: boolean
      }
      complete_tenant_douyin_authorization_intent: {
        Args: {
          p_access_token_ciphertext?: string
          p_access_token_expires_at?: string
          p_access_token_iv?: string
          p_access_token_key_version?: string
          p_access_token_tag?: string
          p_authorization_code_digest: string
          p_authorizer_appid: string
          p_deployment_key: string
          p_intent_id: string
          p_permissions?: Json
          p_refresh_token_ciphertext?: string
          p_refresh_token_expires_at?: string
          p_refresh_token_iv?: string
          p_refresh_token_key_version?: string
          p_refresh_token_tag?: string
          p_runtime_config: Json
        }
        Returns: {
          authorization_code_digest: string | null
          authorizer_appid: string | null
          completed_at: string | null
          component_appid: string
          created_at: string
          expires_at: string
          failure_code: string | null
          id: string
          intent_digest: string
          requested_by_employee_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "douyin_miniapp_authorization_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_workflow_instance_node: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_definition_id: string
          p_instance_id: string
          p_node_key: string
          p_output: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      confirm_douyin_deployable_template: {
        Args: {
          p_actor_employee_id: string
          p_channel: string
          p_description: string
          p_source_draft_id: string
          p_template_app_id: string
          p_template_id: string
          p_template_version: string
        }
        Returns: {
          channel: string
          confirmed_at: string
          confirmed_by_employee_id: string | null
          created_at: string
          description: string
          id: string
          is_current: boolean
          source_draft_id: string
          template_app_id: string
          template_id: string
          template_version: string
        }
        SetofOptions: {
          from: "*"
          to: "douyin_miniapp_deployable_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_supplier_payment: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_allocations: Json
          p_evidence_images: Json
          p_expected_version: number
          p_idempotency_key: string
          p_paid_at: string
          p_payment_id: string
          p_payment_method: string
          p_payment_reference: string
          p_payment_request_id: string
          p_remark: string
          p_tenant_id: string
        }
        Returns: Json
      }
      confirm_supplier_purchase_order_fulfillment: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_confirmed_at: string
          p_expected_order_version: number
          p_idempotency_key: string
          p_order_id: string
          p_remark: string
          p_tenant_id: string
        }
        Returns: Json
      }
      consume_tenant_supplier_code: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_allocation_id: string
          p_code_source: string
          p_creation_idempotency_key: string
          p_internal_supplier_code: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: string
      }
      convert_douyin_lead_to_customer: {
        Args: {
          p_actor_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_marketing_lead_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      convert_supplier_purchase_requisition: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_purchase_order_id: string
          p_requisition_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      convert_supplier_purchase_requisition_commercial_v1: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_purchase_order_id: string
          p_requisition_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      copy_platform_category_specs: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_platform_category_id: string
          p_tenant_category_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_catalog_brand: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_brand_id: string
          p_code: string
          p_idempotency_key: string
          p_legal_name: string
          p_logo_file_id: string
          p_name: string
          p_sort_order: number
          p_status: string
        }
        Returns: Json
      }
      create_catalog_category: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_category_id: string
          p_code: string
          p_idempotency_key: string
          p_level: number
          p_name: string
          p_parent_id: string
          p_sort_order: number
          p_status: string
        }
        Returns: Json
      }
      create_catalog_spec_definition: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_category_id: string
          p_code: string
          p_enum_options: Json
          p_idempotency_key: string
          p_is_filterable: boolean
          p_is_required: boolean
          p_name: string
          p_participates_in_sku_name: boolean
          p_sort_order: number
          p_spec_definition_id: string
          p_status: string
          p_tenant_id: string
          p_unit_dimension: string
          p_value_type: string
        }
        Returns: Json
      }
      create_catalog_unit:
        | {
            Args: {
              p_actor_employee_id: string
              p_actor_user_id: string
              p_base_unit_id: string
              p_code: string
              p_conversion_factor: string
              p_idempotency_key: string
              p_name: string
              p_sort_order: number
              p_status: string
              p_symbol: string
              p_unit_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_employee_id: string
              p_actor_user_id: string
              p_base_unit_id: string
              p_code: string
              p_conversion_factor: string
              p_idempotency_key: string
              p_name: string
              p_sort_order: number
              p_status: string
              p_symbol: string
              p_unit_dimension: string
              p_unit_id: string
            }
            Returns: Json
          }
      create_douyin_budget_estimate: {
        Args: {
          p_douyin_miniapp_installation_id: string
          p_estimate_no: string
          p_expires_at: string
          p_pricing_version_id: string
          p_request_ip_hash: string
          p_request_payload: Json
          p_result_payload: Json
          p_subject_hash: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_douyin_budget_pricing_draft: {
        Args: {
          p_created_by_employee_id: string
          p_disclaimer: string
          p_effective_from: string
          p_effective_to: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_douyin_template_development_installation: {
        Args: {
          p_authorizer_appid: string
          p_component_appid: string
          p_runtime_config: Json
          p_tenant_id: string
        }
        Returns: {
          access_token_ciphertext: string | null
          access_token_expires_at: string | null
          access_token_iv: string | null
          access_token_key_version: string | null
          access_token_tag: string | null
          authorization_event_occurred_at: string | null
          authorization_status: string
          authorizer_appid: string
          component_appid: string
          created_at: string
          deployment_key: string | null
          id: string
          installation_kind: string
          last_audited_at: string | null
          last_released_at: string | null
          last_submitted_at: string | null
          permission_snapshot: Json
          refresh_token_ciphertext: string | null
          refresh_token_expires_at: string | null
          refresh_token_iv: string | null
          refresh_token_key_version: string | null
          refresh_token_tag: string | null
          revoked_at: string | null
          runtime_config: Json
          template_id: string | null
          template_release_id: string | null
          template_version: string | null
          tenant_id: string | null
          token_refresh_claim_expires_at: string | null
          token_refresh_claim_token: string | null
          token_refresh_last_error: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "douyin_miniapp_installations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_platform_operator: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_idempotency_key: string
          p_name: string
          p_phone: string
          p_role_ids: string[]
          p_status?: string
        }
        Returns: Json
      }
      create_platform_role: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_description?: string
          p_idempotency_key: string
          p_name: string
          p_permission_ids?: string[]
        }
        Returns: Json
      }
      create_platform_supplier: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_code: string
          p_expected_version: number
          p_idempotency_key: string
          p_legal_name: string
          p_name: string
          p_supplier_id: string
          p_supplier_type: string
          p_unified_social_credit_code: string
        }
        Returns: Json
      }
      create_platform_supplier_product: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_brand_id: string
          p_category_id: string
          p_description: string
          p_idempotency_key: string
          p_name: string
          p_product_code: string
          p_product_id: string
          p_supplier_id: string
        }
        Returns: Json
      }
      create_platform_supplier_sku: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_idempotency_key: string
          p_model: string
          p_name: string
          p_purchase_unit_id: string
          p_sku_code: string
          p_sku_id: string
          p_specification: string
          p_supplier_id: string
          p_supplier_product_id: string
        }
        Returns: Json
      }
      create_project_log_fast: {
        Args: {
          p_content: string
          p_employee_id: string
          p_images?: Json
          p_node_name: string
          p_project_id: string
          p_project_log_scope?: string
          p_stage_code: string
          p_tenant_department_id?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_site_content_entry_with_version: {
        Args: {
          p_actor_id: string
          p_canonical_url: string
          p_content_blocks: Json
          p_content_type: string
          p_cover_file_id: string
          p_metadata: Json
          p_seo_description: string
          p_seo_title: string
          p_slug: string
          p_summary: string
          p_title: string
        }
        Returns: Json
      }
      create_supplier_address: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_address_detail: string
          p_address_id: string
          p_address_type: string
          p_city: string
          p_district: string
          p_idempotency_key: string
          p_is_default: boolean
          p_latitude: number
          p_longitude: number
          p_province: string
          p_region_code: string
          p_status: string
          p_supplier_id: string
        }
        Returns: Json
      }
      create_supplier_address_guarded: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_address_detail: string
          p_address_id: string
          p_address_type: string
          p_city: string
          p_district: string
          p_idempotency_key: string
          p_is_default: boolean
          p_latitude: number
          p_longitude: number
          p_province: string
          p_region_code: string
          p_status: string
          p_supplier_id: string
        }
        Returns: Json
      }
      create_supplier_contact: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_contact_id: string
          p_contact_type: string
          p_email: string
          p_idempotency_key: string
          p_is_primary: boolean
          p_is_public: boolean
          p_name: string
          p_phone: string
          p_status: string
          p_supplier_id: string
        }
        Returns: Json
      }
      create_supplier_contact_guarded: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_contact_id: string
          p_contact_type: string
          p_email: string
          p_idempotency_key: string
          p_is_primary: boolean
          p_is_public: boolean
          p_name: string
          p_phone: string
          p_status: string
          p_supplier_id: string
        }
        Returns: Json
      }
      create_supplier_contract: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_contract_id: string
          p_contract_no: string
          p_document_file_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_invoice_required_before_payment: boolean
          p_name: string
          p_settlement_term_days: number
          p_tenant_id: string
          p_tenant_supplier_id: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: Json
      }
      create_supplier_onboarding: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_legal_name: string
          p_legal_representative_name: string
          p_license_file_id: string
          p_license_valid_from: string
          p_license_valid_until: string
          p_name: string
          p_ocr_recognition_id: string
          p_primary_contact_email: string
          p_primary_contact_name: string
          p_primary_contact_phone: string
          p_registered_address_text: string
          p_supplier_id: string
          p_supplier_type: string
          p_unified_social_credit_code: string
        }
        Returns: Json
      }
      create_supplier_price_list: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_currency: string
          p_effective_from: string
          p_effective_until: string
          p_idempotency_key: string
          p_name: string
          p_price_list_code: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_supplier_price_list_pre_actor_binding_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_currency: string
          p_effective_from: string
          p_effective_until: string
          p_idempotency_key: string
          p_name: string
          p_price_list_code: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_supplier_price_list_version: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_new_price_list_id: string
          p_proxy_reason: string
          p_source_price_list_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_supplier_price_list_version_pre_actor_binding_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_new_price_list_id: string
          p_proxy_reason: string
          p_source_price_list_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_supplier_price_list_version_pre_v2_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_new_price_list_id: string
          p_proxy_reason: string
          p_source_price_list_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_supplier_product: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_brand_id: string
          p_category_id: string
          p_description: string
          p_idempotency_key: string
          p_name: string
          p_product_code: string
          p_product_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_supplier_purchase_order_from_requisition: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_delivery_date: string
          p_items: Json
          p_order_id: string
          p_project_id: string
          p_purchase_requisition_id: string
          p_remark: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      create_supplier_purchase_order_receipt: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_fulfillment_version: number
          p_idempotency_key: string
          p_items: Json
          p_order_id: string
          p_receipt_id: string
          p_receipt_no: string
          p_received_at: string
          p_remark: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_supplier_purchase_order_receipt_fulfillment_v1: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_fulfillment_version: number
          p_idempotency_key: string
          p_items: Json
          p_order_id: string
          p_receipt_id: string
          p_receipt_no: string
          p_received_at: string
          p_remark: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_supplier_purchase_order_shipment: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_carrier_name: string
          p_expected_fulfillment_version: number
          p_idempotency_key: string
          p_items: Json
          p_order_id: string
          p_remark: string
          p_shipment_id: string
          p_shipment_no: string
          p_shipped_at: string
          p_tenant_id: string
          p_tracking_no: string
        }
        Returns: Json
      }
      create_supplier_qualification: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_certificate_no: string
          p_document_file_id: string
          p_idempotency_key: string
          p_qualification_id: string
          p_qualification_type_id: string
          p_supplier_id: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: Json
      }
      create_supplier_qualification_guarded: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_certificate_no: string
          p_document_file_id: string
          p_idempotency_key: string
          p_qualification_id: string
          p_qualification_type_id: string
          p_supplier_id: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: Json
      }
      create_supplier_qualification_type: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_applicable_supplier_types: string[]
          p_blocks_new_orders: boolean
          p_code: string
          p_idempotency_key: string
          p_is_required: boolean
          p_name: string
          p_qualification_type_id: string
          p_sort_order: number
          p_status: string
          p_warning_days: number
        }
        Returns: Json
      }
      create_supplier_service_region: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_idempotency_key: string
          p_region_code: string
          p_region_id: string
          p_region_level: string
          p_status: string
          p_supplier_id: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: Json
      }
      create_supplier_service_region_guarded: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_idempotency_key: string
          p_region_code: string
          p_region_id: string
          p_region_level: string
          p_status: string
          p_supplier_id: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: Json
      }
      create_supplier_sku: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_batch_managed: boolean
          p_color_managed: boolean
          p_idempotency_key: string
          p_model: string
          p_name: string
          p_product_id: string
          p_proxy_reason: string
          p_purchase_unit_id: string
          p_serial_managed: boolean
          p_sku_code: string
          p_sku_id: string
          p_specification: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_tenant_catalog_brand: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_brand_id: string
          p_code: string
          p_idempotency_key: string
          p_legal_name: string
          p_logo_file_id: string
          p_mapped_platform_brand_id: string
          p_name: string
          p_sort_order: number
          p_status: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_tenant_catalog_category: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_category_id: string
          p_code: string
          p_idempotency_key: string
          p_mapped_platform_category_id: string
          p_name: string
          p_parent_id: string
          p_sort_order: number
          p_status: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_tenant_douyin_authorization_intent: {
        Args: {
          p_component_appid: string
          p_expires_at: string
          p_intent_digest: string
          p_requested_by_employee_id: string
          p_tenant_id: string
        }
        Returns: {
          authorization_code_digest: string | null
          authorizer_appid: string | null
          completed_at: string | null
          component_appid: string
          created_at: string
          expires_at: string
          failure_code: string | null
          id: string
          intent_digest: string
          requested_by_employee_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "douyin_miniapp_authorization_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_tenant_private_supplier: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_address: Json
          p_allocation_id: string
          p_code_source: string
          p_idempotency_key: string
          p_internal_supplier_code: string
          p_legal_name: string
          p_name: string
          p_primary_contact: Json
          p_supplier_type: string
          p_tenant_id: string
          p_unified_social_credit_code: string
        }
        Returns: Json
      }
      create_tenant_private_supplier_guarded: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_address: Json
          p_allocation_id: string
          p_code_source: string
          p_idempotency_key: string
          p_internal_supplier_code: string
          p_legal_name: string
          p_name: string
          p_primary_contact: Json
          p_supplier_type: string
          p_tenant_id: string
          p_unified_social_credit_code: string
        }
        Returns: Json
      }
      create_tenant_shared_supplier_relationship: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_allocation_id: string
          p_code_source: string
          p_idempotency_key: string
          p_internal_supplier_code: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_tenant_supplier: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_supplier_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      create_tenant_wechat_pay_applyment: {
        Args: { p_applyment: Json; p_audit_metadata: Json }
        Returns: string
      }
      delete_supplier_price_list_item: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      delete_supplier_price_list_item_pre_actor_binding_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      delete_supplier_price_list_item_pre_v2_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      douyin_budget_ai_estimate_snapshot: {
        Args: {
          p_estimate: Database["public"]["Tables"]["douyin_budget_estimates"]["Row"]
        }
        Returns: Json
      }
      douyin_budget_json_integer_in_range: {
        Args: { p_maximum: number; p_minimum: number; p_value: Json }
        Returns: boolean
      }
      douyin_budget_pricing_version_payload: {
        Args: { p_pricing_version_id: string; p_tenant_id: string }
        Returns: Json
      }
      douyin_measurement_estimate_snapshot: {
        Args: {
          p_estimate: Database["public"]["Tables"]["douyin_budget_estimates"]["Row"]
          p_now: string
        }
        Returns: Json
      }
      douyin_measurement_source_metadata: {
        Args: {
          p_appointment: Database["public"]["Tables"]["douyin_measurement_appointments"]["Row"]
        }
        Returns: Json
      }
      douyin_public_image_urls_are_valid: {
        Args: { p_urls: string[] }
        Returns: boolean
      }
      enable_douyin_miniapp_installation: {
        Args: { p_installation_id: string }
        Returns: {
          access_token_ciphertext: string | null
          access_token_expires_at: string | null
          access_token_iv: string | null
          access_token_key_version: string | null
          access_token_tag: string | null
          authorization_event_occurred_at: string | null
          authorization_status: string
          authorizer_appid: string
          component_appid: string
          created_at: string
          deployment_key: string | null
          id: string
          installation_kind: string
          last_audited_at: string | null
          last_released_at: string | null
          last_submitted_at: string | null
          permission_snapshot: Json
          refresh_token_ciphertext: string | null
          refresh_token_expires_at: string | null
          refresh_token_iv: string | null
          refresh_token_key_version: string | null
          refresh_token_tag: string | null
          revoked_at: string | null
          runtime_config: Json
          template_id: string | null
          template_release_id: string | null
          template_version: string | null
          tenant_id: string | null
          token_refresh_claim_expires_at: string | null
          token_refresh_claim_token: string | null
          token_refresh_last_error: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "douyin_miniapp_installations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_platform_super_admin_survives: {
        Args: { p_target_employee_id: string }
        Returns: undefined
      }
      expire_tenant_entitlement_if_due: {
        Args: { p_entitlement_code: string; p_now: string; p_tenant_id: string }
        Returns: {
          created_at: string
          entitlement_code: string
          expires_at: string
          id: string
          source_id: string | null
          source_type: string
          starts_at: string
          status: string
          suspend_reason: string | null
          suspended_at: string | null
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "tenant_entitlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_tenant_onboarding_partner_assists: {
        Args: { p_cutoff: string; p_partner_id?: string }
        Returns: {
          application_id: string
        }[]
      }
      fail_douyin_authorizer_token_refresh: {
        Args: {
          p_claim_token: string
          p_installation_id: string
          p_last_refresh_error_code: string
        }
        Returns: boolean
      }
      fail_douyin_budget_ai_analysis: {
        Args: {
          p_attempt_count: number
          p_claimed_at: string
          p_douyin_miniapp_installation_id: string
          p_error_code: string
          p_estimate_id: string
          p_subject_hash: string
          p_tenant_id: string
        }
        Returns: Json
      }
      fail_douyin_component_token_refresh: {
        Args: {
          p_claim_token: string
          p_component_appid: string
          p_last_refresh_error_code: string
        }
        Returns: boolean
      }
      fail_tenant_douyin_authorization_intent: {
        Args: { p_failure_code: string; p_intent_id: string }
        Returns: boolean
      }
      finalize_phone_identity_selection: {
        Args: { p_candidate_id: string; p_now: string; p_session_id: string }
        Returns: {
          status: string
        }[]
      }
      finalize_tenant_onboarding_notification_failed: {
        Args: {
          p_application_id: string
          p_claim_token: string
          p_delivery_id: string
          p_last_error: string
        }
        Returns: {
          application_id: string
          application_version: number
          attempt_count: number
          channel: string
          claim_expires_at: string | null
          claim_token: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_onboarding_notification_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      finalize_tenant_onboarding_notification_sent: {
        Args: {
          p_application_id: string
          p_claim_token: string
          p_delivery_id: string
          p_sent_at: string
        }
        Returns: {
          application_id: string
          application_version: number
          attempt_count: number
          channel: string
          claim_expires_at: string | null
          claim_token: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_onboarding_notification_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      find_auth_user_by_email: {
        Args: { p_email: string }
        Returns: {
          email: string
          id: string
        }[]
      }
      get_customer_project_construction_stage_bootstrap: {
        Args: {
          p_customer_id: string
          p_project_id: string
          p_tenant_id: string
        }
        Returns: {
          acceptance_rows: Json
          latest_log_rows: Json
          log_rows: Json
          project: Json
        }[]
      }
      get_customer_project_recent_log_summaries: {
        Args: {
          p_customer_id: string
          p_per_project?: number
          p_project_ids: string[]
        }
        Returns: {
          average_rating: number
          comment_count: number
          cover_image_path: string
          created_at: string
          employee_avatar: string
          employee_id: string
          employee_name: string
          id: string
          image_count: number
          node_name: string
          project_id: string
          rating_count: number
          stage_code: string
        }[]
      }
      get_douyin_authorization_event_state: {
        Args: { p_event_key: string }
        Returns: string
      }
      get_employee_permission_context_fast: {
        Args: { p_employee_id: string }
        Returns: {
          employee: Json
          overrides: Json
          role_permissions: Json
          roles: Json
        }[]
      }
      get_employee_project_detail_bootstrap_data: {
        Args: {
          p_log_limit?: number
          p_project_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_or_create_and_claim_douyin_miniapp_release_upload: {
        Args: {
          p_channel: string
          p_claim_expires_at: string
          p_claim_token: string
          p_description: string
          p_ext_json: Json
          p_installation_id: string
          p_operator_id: string
          p_template_id: string
          p_template_version: string
        }
        Returns: {
          audit_host_names: string[]
          audit_note: string
          audit_result: Json
          audited_at: string
          channel: string
          created_at: string
          description: string
          douyin_log_id: string
          ext_json: Json
          id: string
          installation_id: string
          operation_claim_expires_at: string
          operation_claim_token: string
          operation_name: string
          platform_operator_id: string
          recovery_required: boolean
          released_at: string
          status: string
          submitted_at: string
          template_id: string
          template_version: string
          test_qr_url: string
          updated_at: string
        }[]
      }
      get_partner_dashboard_monthly_summary: {
        Args: { p_end_at: string; p_partner_id: string; p_start_at: string }
        Returns: {
          available_commission_amount_fen: number
          commission_amount_fen: number
          paid_amount_fen: number
          paid_settlement_amount_fen: number
          revenue_amount_fen: number
          revenue_event_count: number
          settled_commission_amount_fen: number
          settlement_batch_count: number
          settlement_total_amount_fen: number
          tenant_count: number
        }[]
      }
      get_platform_command_idempotent_result: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      get_project_log_calendar: {
        Args: { project_uuid: string; timezone_name?: string }
        Returns: {
          count: number
          date: string
          node_name: string
          stage_code: string
        }[]
      }
      get_project_operational_risk_page: {
        Args: {
          p_keyword?: string
          p_page?: number
          p_page_size?: number
          p_risk_type?: string
          p_severity?: string
          p_tenant_id: string
          p_timezone_name?: string
        }
        Returns: Json
      }
      get_project_receivable_summary: {
        Args: { p_project_id: string; p_tenant_id: string; p_today?: string }
        Returns: {
          contract_amount: number
          overdue_amount: number
          overdue_count: number
          paid_amount: number
          receivable_amount: number
          remaining_amount: number
        }[]
      }
      get_supplier_payables_by_ids: {
        Args: {
          p_payable_event_ids: string[]
          p_tenant_id: string
          p_visible_project_ids: string[]
        }
        Returns: Json
      }
      get_supplier_payment_request_detail: {
        Args: { p_payment_request_id: string; p_tenant_id: string }
        Returns: Json
      }
      get_supplier_purchase_order_financial_summary: {
        Args: { p_supplier_purchase_order_id: string; p_tenant_id: string }
        Returns: Json
      }
      get_tenant_supplier_order_eligibility: {
        Args: {
          p_checked_at: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      get_tenant_supplier_order_eligibility_set: {
        Args: {
          p_checked_at: string
          p_tenant_id: string
          p_tenant_supplier_id?: string
        }
        Returns: {
          blocking_reasons: string[]
          checked_at: string
          contract_health: string
          eligible: boolean
          supplier_id: string
          supplier_version: number
          tenant_id: string
          tenant_supplier_id: string
          tenant_supplier_version: number
        }[]
      }
      get_visitor_picture_asset_navigation: {
        Args: {
          p_asset_id: string
          p_category_id: string
          p_direction: string
          p_limit: number
        }
        Returns: {
          asset: Json
          context: Json
          nav_position: string
        }[]
      }
      get_wechat_mini_session_credential: {
        Args: {
          p_oauth_identity_id: string
          p_openid: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          encrypted_session_key: string
          encryption_key_version: number
          id: string
          invalidated_at: string | null
          last_used_at: string | null
          oauth_identity_id: string
          obtained_at: string
          openid_hash: string
          session_revision: number
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wechat_mini_session_credentials"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_workflow_version_running_instance_counts: {
        Args: {
          p_definition_id: string
          p_tenant_id: string
          p_version_ids: string[]
        }
        Returns: {
          running_instance_count: number
          version_id: string
        }[]
      }
      increment_platform_partner_invite_code_counts: {
        Args: {
          p_approved_count?: number
          p_invite_code_id: string
          p_scan_count?: number
          p_submitted_count?: number
        }
        Returns: undefined
      }
      initialize_default_decoration_tenant: {
        Args: {
          p_admin_name: string
          p_admin_phone: string
          p_operator_employee_id?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      invalidate_wechat_mini_session_credential: {
        Args: {
          p_credential_id: string
          p_openid: string
          p_session_revision: number
          p_user_id: string
        }
        Returns: {
          created_at: string
          encrypted_session_key: string
          encryption_key_version: number
          id: string
          invalidated_at: string | null
          last_used_at: string | null
          oauth_identity_id: string
          obtained_at: string
          openid_hash: string
          session_revision: number
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wechat_mini_session_credentials"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_valid_douyin_budget_pricing_item: {
        Args: { p_item: Json }
        Returns: boolean
      }
      is_valid_douyin_measurement_source_metadata: {
        Args: { p_metadata: Json }
        Returns: boolean
      }
      list_accessible_project_workflow_tasks: {
        Args: {
          p_employee_id?: string
          p_limit?: number
          p_permission_codes?: string[]
          p_project_ids?: string[]
          p_role_codes?: string[]
          p_tenant_id: string
        }
        Returns: {
          assignee_employee: Json
          assignee_employee_id: string
          assignee_permission_code: string
          assignee_role_code: string
          completed_at: string
          completed_by: string
          created_at: string
          definition_id: string
          due_at: string
          id: string
          instance: Json
          instance_id: string
          instance_node_id: string
          node_id: string
          node_key: string
          node_type: string
          status: string
          tenant_id: string
          title: string
          total_count: number
          updated_at: string
          version_id: string
        }[]
      }
      list_accessible_workflow_tasks: {
        Args: {
          p_employee_id?: string
          p_instance_id?: string
          p_page?: number
          p_page_size?: number
          p_permission_codes?: string[]
          p_role_codes?: string[]
          p_status?: string
          p_subject_id?: string
          p_subject_type?: string
          p_tenant_id: string
        }
        Returns: {
          assignee_employee: Json
          assignee_employee_id: string
          assignee_permission_code: string
          assignee_role_code: string
          completed_at: string
          completed_by: string
          created_at: string
          definition_id: string
          due_at: string
          id: string
          instance: Json
          instance_id: string
          instance_node_id: string
          node_id: string
          node_key: string
          node_type: string
          status: string
          tenant_id: string
          title: string
          total_count: number
          updated_at: string
          version_id: string
        }[]
      }
      list_available_suppliers_for_tenant: {
        Args: {
          p_keyword?: string
          p_page?: number
          p_page_size?: number
          p_tenant_id: string
        }
        Returns: Json
      }
      list_catalog_unit_suggestions: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_page?: number
          p_page_size?: number
          p_status?: string
          p_tenant_id?: string
        }
        Returns: Json
      }
      list_customer_home_projects: {
        Args: {
          p_customer_id: string
          p_page?: number
          p_page_size?: number
          p_recent_logs_per_project?: number
          p_tenant_id: string
        }
        Returns: {
          address: string
          budget: number
          id: string
          name: string
          property: Json
          property_id: string
          recent_logs: Json
          start_date: string
          status: string
          style_tags: Json
          tenant_id: string
        }[]
      }
      list_customer_project_acceptance_summaries: {
        Args: {
          p_customer_id: string
          p_page?: number
          p_page_size?: number
          p_project_id: string
          p_stage_code?: string
          p_status?: string
          p_tenant_id: string
        }
        Returns: {
          acceptance_type: string
          completed_at: string
          created_at: string
          customer_confirmed_at: string
          customer_id: string
          id: string
          initiator_id: string
          project_id: string
          project_valid: boolean
          reject_reason: string
          reject_source: string
          rejected_at: string
          reviewed_at: string
          reviewer_id: string
          stage_code: string
          status: string
          submitted_at: string
          summary: string
          template_id: string
          template_snapshot: Json
          template_version: number
          tenant_id: string
          title: string
          updated_at: string
        }[]
      }
      list_customer_project_detail_logs: {
        Args: {
          p_customer_id: string
          p_page_size?: number
          p_project_id: string
          p_tenant_id: string
        }
        Returns: {
          comment_count: number
          content: string
          created_at: string
          employee_avatar: string
          employee_id: string
          employee_name: string
          id: string
          images: Json
          my_rating: number
          node_name: string
          project_id: string
          rating_count: number
          rating_sum: number
          stage_code: string
        }[]
      }
      list_employee_login_bindings: {
        Args: { p_employee_ids: string[] }
        Returns: {
          auth_user_id: string
          employee_id: string
          has_admin_web: boolean
          has_wechat_mini: boolean
          wechat_openid_masked: string
        }[]
      }
      list_latest_finance_reconciliation_exception_actions: {
        Args: { p_fingerprints: string[]; p_tenant_id: string }
        Returns: {
          action: string
          actor_employee_id: string
          actor_employee_name: string
          created_at: string
          exception_code: string
          exception_fingerprint: string
          id: string
          project_id: string
          remark: string
          subject_id: string
          subject_type: string
          tenant_id: string
        }[]
      }
      list_project_cost_commitment_totals: {
        Args: { p_project_id: string; p_tenant_id: string }
        Returns: Json
      }
      list_project_cost_expense_totals: {
        Args: { p_project_id: string; p_tenant_id: string }
        Returns: Json
      }
      list_supplier_accounting_legacy_gaps: {
        Args: { p_page: number; p_page_size: number; p_tenant_id: string }
        Returns: {
          gap_type: string
          reason: string
          supplier_purchase_order_id: string
          supplier_purchase_order_item_id: string
          supplier_purchase_order_receipt_item_id: string
          total_count: number
        }[]
      }
      list_supplier_payable_filter_options: {
        Args: {
          p_keyword?: string
          p_page?: number
          p_page_size?: number
          p_tenant_id: string
          p_type?: string
          p_visible_project_ids?: string[]
        }
        Returns: Json
      }
      list_supplier_payables: {
        Args: {
          p_due_from?: string
          p_due_to?: string
          p_page?: number
          p_page_size?: number
          p_project_id?: string
          p_purchase_order_id?: string
          p_status?: string
          p_tenant_id: string
          p_tenant_supplier_id?: string
          p_visible_project_ids?: string[]
        }
        Returns: Json
      }
      list_supplier_payment_request_payments: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_payment_request_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      list_supplier_payment_requests: {
        Args: {
          p_created_from?: string
          p_created_to?: string
          p_keyword?: string
          p_page?: number
          p_page_size?: number
          p_project_id?: string
          p_status?: string
          p_tenant_id: string
          p_tenant_supplier_id?: string
          p_visible_project_ids?: string[]
        }
        Returns: Json
      }
      list_supplier_purchase_order_supplier_options: {
        Args: {
          p_checked_at: string
          p_keyword?: string
          p_page?: number
          p_page_size?: number
          p_tenant_id: string
        }
        Returns: Json
      }
      list_tenant_service_provider_publications: {
        Args: { p_keyword: string; p_status: string }
        Returns: {
          address_city: string
          address_district: string
          area_count: number
          public_name: string
          public_phone: string
          status: string
          submitted_at: string
          tenant_id: string
          tenant_name: string
          updated_at: string
          version: number
        }[]
      }
      list_tenant_suppliers_for_tenant: {
        Args: {
          p_checked_at?: string
          p_eligible?: boolean
          p_keyword?: string
          p_page?: number
          p_page_size?: number
          p_relationship_status?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      list_visitor_local_service_providers: {
        Args: { p_region_codes: string[] }
        Returns: {
          address: string
          address_city: string
          address_district: string
          address_latitude: number
          address_longitude: number
          address_province: string
          address_region_code: string
          introduction: string
          matched_region_code: string
          public_name: string
          public_phone: string
          tenant_id: string
        }[]
      }
      list_visitor_picture_assets: {
        Args: { p_category_id: string; p_page: number; p_page_size: number }
        Returns: {
          asset: Json
          total_count: number
        }[]
      }
      list_wechat_login_memberships: {
        Args: { p_user_id: string }
        Returns: {
          customer_claimed_at: string
          customer_id: string
          customer_name: string
          customer_origin: string
          customer_phone: string
          customer_user_id: string
          employee_avatar: string
          employee_id: string
          employee_name: string
          employee_post_id: string
          employee_status: string
          employee_tenant_department_id: string
          employee_user_id: string
          identity_id: string
          identity_type: string
          is_default: boolean
          membership_id: string
          post_name: string
          status: string
          tenant_department_alias_name: string
          tenant_department_code: string
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          tenant_status: string
          user_id: string
        }[]
      }
      lock_project_cost_budget_scope: {
        Args: { p_project_id: string; p_tenant_id: string }
        Returns: undefined
      }
      lock_tenant_onboarding_employee_phones: {
        Args: { p_phones: string[] }
        Returns: undefined
      }
      mark_douyin_lead_invalid: {
        Args: {
          p_actor_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_marketing_lead_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      mutate_platform_supplier: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason?: string
          p_supplier_id: string
        }
        Returns: Json
      }
      mutate_platform_supplier_guarded: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason?: string
          p_supplier_id: string
        }
        Returns: Json
      }
      mutate_supplier_contract: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_contract_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason?: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      mutate_supplier_product: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_product_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      mutate_supplier_product_pre_v2_unsafe: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_product_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      mutate_supplier_sku: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_proxy_reason: string
          p_sku_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      mutate_supplier_sku_for_product: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_product_id: string
          p_proxy_reason: string
          p_sku_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      mutate_supplier_sku_for_product_pre_v2_unsafe: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_product_id: string
          p_proxy_reason: string
          p_sku_id: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      mutate_tenant_onboarding_platform_review: {
        Args: {
          p_action: string
          p_application_id: string
          p_candidate_snapshot: Json
          p_expected_version: number
          p_now: string
          p_partner_id: string
          p_remark: string
          p_required_fields: string[]
          p_reviewer_employee_id: string
        }
        Returns: Json
      }
      mutate_tenant_supplier: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason?: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      normalize_platform_operator_role_ids: {
        Args: { p_role_ids: string[] }
        Returns: string[]
      }
      ocr_claim_visitor_recognition: {
        Args: {
          p_actor_visitor_id: string
          p_daily_limit: number
          p_expires_at: string
          p_file_checksum: string
          p_file_object_id: string
          p_global_concurrency_limit: number
          p_idempotency_key: string
          p_ip_window_limit: number
          p_ip_window_seconds: number
          p_now: string
          p_processing_deadline_at: string
          p_request_ip_hash: string
          p_visitor_concurrency_limit: number
        }
        Returns: Json
      }
      picture_asset_set_favorite: {
        Args: { p_asset_id: string; p_favorited: boolean; p_visitor_id: string }
        Returns: {
          asset_id: string
          favorite_count: number
          favorited: boolean
        }[]
      }
      picture_asset_set_like: {
        Args: { p_asset_id: string; p_liked: boolean; p_visitor_id: string }
        Returns: {
          asset_id: string
          like_count: number
          liked: boolean
        }[]
      }
      platform_begin_virtual_goods_operation: {
        Args: {
          p_mapping_id: string
          p_phase: string
          p_product_version: number
          p_request_snapshot_hash: string
        }
        Returns: {
          channel_id: string
          failure_code: string | null
          failure_summary: string | null
          finished_at: string | null
          id: string
          last_queried_at: string | null
          mapping_id: string
          normalized_result: Json
          phase: string
          product_id: string
          product_version: number
          request_id: string | null
          request_snapshot_hash: string
          started_at: string
          state: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_virtual_goods_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_create_virtual_product: {
        Args: {
          p_actor_employee_id: string
          p_grant_rule: Json
          p_product: Json
        }
        Returns: Json
      }
      platform_finish_virtual_goods_operation: {
        Args: {
          p_failure_code: string
          p_failure_summary: string
          p_normalized_result: Json
          p_operation_id: string
          p_request_id: string
          p_state: string
          p_synced_product_version: number
        }
        Returns: Json
      }
      platform_manage_annual_virtual_payment_compatibility: {
        Args: {
          p_actor_employee_id: string
          p_expected_product_version: number
          p_purchase_mode: string
          p_virtual_product_patch: Json
        }
        Returns: Json
      }
      platform_service_assign_work_order: {
        Args: {
          p_assignee_employee_id: string
          p_expected_version: number
          p_metadata?: Json
          p_operator_employee_id: string
          p_remark?: string
          p_work_order_id: string
        }
        Returns: Json
      }
      platform_service_begin_order_shipping_report_attempt: {
        Args: {
          p_attempt_key: string
          p_attempted_at: string
          p_request_payload: Json
          p_service_order_id: string
          p_source: string
          p_tenant_id: string
        }
        Returns: {
          attempt_count: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_attempt_key: string | null
          provider_request_id: string | null
          request_payload: Json
          service_order_id: string
          source: string
          status: string
          succeeded_at: string | null
          tenant_id: string
          updated_at: string
          wechat_errcode: number | null
          wechat_errmsg: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenant_service_order_shipping_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_service_cancel_pending_order: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_order_id: string
          p_require_missing_prepay?: boolean
          p_tenant_id: string
        }
        Returns: Json
      }
      platform_service_claim_pending_order_cancel: {
        Args: {
          p_closed_by_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      platform_service_close_refund_execution: {
        Args: {
          p_metadata?: Json
          p_operator_employee_id: string
          p_out_refund_no: string
          p_out_trade_no: string
          p_payment_config_guard_version: number
          p_payment_config_id: string
          p_refund_amount_fen: number
          p_refund_request_id: string
          p_service_order_id: string
          p_transaction_id: string
          p_wechat_refund_id: string
        }
        Returns: Json
      }
      platform_service_confirm_overdue_acceptance: {
        Args: {
          p_expected_version: number
          p_metadata?: Json
          p_operator_employee_id: string
          p_remark?: string
          p_work_order_id: string
        }
        Returns: Json
      }
      platform_service_confirm_payment: {
        Args: {
          p_metadata?: Json
          p_notification_id: string
          p_order_id: string
          p_paid_amount_fen: number
          p_paid_at: string
          p_transaction_id: string
        }
        Returns: Json
      }
      platform_service_confirm_refund: {
        Args: {
          p_metadata?: Json
          p_operator_employee_id: string
          p_out_refund_no: string
          p_out_trade_no: string
          p_payment_config_guard_version: number
          p_payment_config_id: string
          p_refund_amount_fen: number
          p_refund_request_id: string
          p_refunded_at: string
          p_service_order_id: string
          p_transaction_id: string
          p_wechat_refund_id: string
        }
        Returns: Json
      }
      platform_service_create_pending_order: {
        Args: {
          p_amount_fen: number
          p_created_by_employee_id: string
          p_idempotency_key: string
          p_order_no: string
          p_out_trade_no: string
          p_payer_openid: string
          p_payment_config_guard_version: number
          p_payment_config_id: string
          p_payment_expires_at: string
          p_pricing_version: number
          p_product_code: string
          p_product_id: string
          p_product_snapshot: Json
          p_product_version_id: string
          p_required_channel?: string
          p_source_trial_id?: string
          p_tenant_id: string
          p_term_years: number
          p_terms_accepted_at: string
          p_terms_version: number
        }
        Returns: {
          amount_fen: number
          cancel_claim_expires_at: string | null
          cancel_idempotency_key: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by_employee_id: string | null
          created_at: string
          created_by_employee_id: string
          id: string
          idempotency_key: string | null
          order_no: string
          out_trade_no: string
          paid_amount_fen: number | null
          paid_at: string | null
          payer_openid: string
          payment_config_guard_version: number
          payment_config_id: string
          payment_expires_at: string
          payment_status: string
          prepay_id: string | null
          pricing_version: number
          product_code: string
          product_id: string
          product_snapshot: Json
          product_version_id: string
          service_access_terminated_at: string | null
          service_access_terminated_by_employee_id: string | null
          service_access_termination_reason: string | null
          service_status: string
          source_trial_id: string | null
          tenant_id: string
          term_years: number
          terms_accepted_at: string
          terms_version: number
          transaction_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "tenant_service_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_service_finish_order_shipping_report_attempt: {
        Args: {
          p_attempt_key: string
          p_finished_at: string
          p_provider_request_id: string
          p_report_id: string
          p_status: string
          p_wechat_errcode: number
          p_wechat_errmsg: string
        }
        Returns: {
          attempt_count: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_attempt_key: string | null
          provider_request_id: string | null
          request_payload: Json
          service_order_id: string
          source: string
          status: string
          succeeded_at: string | null
          tenant_id: string
          updated_at: string
          wechat_errcode: number | null
          wechat_errmsg: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenant_service_order_shipping_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_service_lock_order: {
        Args: { p_service_order_id: string }
        Returns: undefined
      }
      platform_service_lock_refund_operator: {
        Args: { p_operator_employee_id: string }
        Returns: undefined
      }
      platform_service_publish_product_version: {
        Args: {
          p_amount_fen: number
          p_expected_version: number
          p_list_amount_fen: number
          p_product_id: string
          p_published_by_employee_id: string
          p_service_scope: Json
          p_term_years: number
          p_terms_content: string
          p_terms_version: number
          p_title: string
        }
        Returns: {
          amount_fen: number
          id: string
          list_amount_fen: number
          product_id: string
          published_at: string
          published_by_employee_id: string | null
          service_scope: Json
          term_years: number
          terms_content: string
          terms_version: number
          title: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "platform_service_product_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_service_request_refund_review: {
        Args: {
          p_created_by_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      platform_service_review_refund_request: {
        Args: {
          p_decision: string
          p_expected_version: number
          p_operator_employee_id: string
          p_refund_request_id: string
          p_review_remark?: string
        }
        Returns: Json
      }
      platform_service_transition_work_order: {
        Args: {
          p_expected_version: number
          p_metadata?: Json
          p_operator_employee_id: string
          p_remark?: string
          p_to_status: string
          p_work_order_id: string
        }
        Returns: Json
      }
      platform_service_trial_access_facts: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      platform_service_trial_apply: {
        Args: {
          p_actor_employee_id: string
          p_application_reason: string
          p_contact_name: string
          p_contact_phone: string
          p_expected_project_count: number
          p_expected_user_count: number
          p_idempotency_key: string
          p_tenant_id: string
        }
        Returns: Json
      }
      platform_service_trial_assign: {
        Args: {
          p_actor_employee_id: string
          p_assignee_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_trial_id: string
        }
        Returns: Json
      }
      platform_service_trial_cancel_follow_up: {
        Args: {
          p_actor_employee_id: string
          p_follow_up_id: string
          p_idempotency_key: string
          p_tenant_id: string
          p_trial_id: string
        }
        Returns: Json
      }
      platform_service_trial_claim_notification_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          delivery_id: string
          event_type: string
          grace_ends_at: string
          lease_token: string
          recipient_employee_id: string
          source: string
          starts_at: string
          tenant_id: string
          trial_ends_at: string
          trial_id: string
          trial_status: string
        }[]
      }
      platform_service_trial_command_snapshot: {
        Args: {
          p_trial: Database["public"]["Tables"]["tenant_service_trials"]["Row"]
        }
        Returns: Json
      }
      platform_service_trial_complete_notification_delivery: {
        Args: {
          p_delivery_id: string
          p_lease_token: string
          p_notification_id: string
        }
        Returns: Json
      }
      platform_service_trial_create_follow_up: {
        Args: {
          p_actor_employee_id: string
          p_follow_up_type: string
          p_idempotency_key: string
          p_next_follow_up_at: string
          p_result: string
          p_status: string
          p_summary: string
          p_tenant_id: string
          p_trial_id: string
        }
        Returns: Json
      }
      platform_service_trial_enqueue_due_notifications: {
        Args: { p_now: string }
        Returns: number
      }
      platform_service_trial_extend: {
        Args: {
          p_actor_employee_id: string
          p_allow_override?: boolean
          p_expected_version: number
          p_extension_days: number
          p_idempotency_key: string
          p_reason: string
          p_trial_id: string
        }
        Returns: Json
      }
      platform_service_trial_fail_notification_delivery: {
        Args: {
          p_delivery_id: string
          p_error_code: string
          p_lease_token: string
        }
        Returns: Json
      }
      platform_service_trial_grant: {
        Args: {
          p_actor_employee_id: string
          p_allow_override?: boolean
          p_assignee_employee_id?: string
          p_grace_days?: number
          p_idempotency_key: string
          p_reason: string
          p_scope: Json
          p_starts_at?: string
          p_tenant_id: string
          p_trial_days?: number
          p_trial_type: string
        }
        Returns: Json
      }
      platform_service_trial_list: {
        Args: {
          p_applied_from?: string
          p_applied_to?: string
          p_assignee_employee_id?: string
          p_expires_from?: string
          p_expires_to?: string
          p_keyword?: string
          p_now?: string
          p_page?: number
          p_page_size?: number
          p_platform?: boolean
          p_source?: string
          p_status?: string
          p_tenant_id?: string
          p_trial_type?: string
        }
        Returns: Json
      }
      platform_service_trial_lock_platform_actor: {
        Args: {
          p_actor_employee_id: string
          p_required_permission_codes: string[]
        }
        Returns: undefined
      }
      platform_service_trial_lock_tenant_actor: {
        Args: {
          p_actor_employee_id: string
          p_required_permission_codes: string[]
          p_tenant_id: string
        }
        Returns: undefined
      }
      platform_service_trial_lock_verified_enterprise_identity: {
        Args: { p_expected_hash: string; p_tenant_id: string }
        Returns: undefined
      }
      platform_service_trial_normalize_effective_status: {
        Args: { p_now: string; p_tenant_id: string; p_trial_id: string }
        Returns: {
          activated_at: string | null
          application_reason: string | null
          assignee_employee_id: string | null
          contact_name: string | null
          contact_phone: string | null
          converted_at: string | null
          converted_order_id: string | null
          created_at: string
          enterprise_identity_hash: string
          expected_project_count: number | null
          expected_user_count: number | null
          extension_count: number
          grace_ends_at: string | null
          grant_reason: string | null
          granted_at: string | null
          granted_by_employee_id: string | null
          id: string
          policy_snapshot: Json
          requested_at: string | null
          requested_by_employee_id: string | null
          review_decision: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by_employee_id: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_employee_id: string | null
          scope_snapshot: Json
          source: string
          starts_at: string | null
          status: string
          tenant_id: string
          trial_ends_at: string | null
          trial_type: string
          updated_at: string
          version: number
          withdraw_reason: string | null
          withdrawn_at: string | null
          withdrawn_by_employee_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenant_service_trials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_service_trial_platform_summary: {
        Args: { p_now?: string }
        Returns: Json
      }
      platform_service_trial_replay_command: {
        Args: {
          p_idempotency_key: string
          p_request_hash: string
          p_scope_key: string
        }
        Returns: Json
      }
      platform_service_trial_review: {
        Args: {
          p_actor_employee_id: string
          p_allow_override?: boolean
          p_assignee_employee_id?: string
          p_decision: string
          p_expected_version: number
          p_grace_days?: number
          p_idempotency_key: string
          p_reason: string
          p_scope?: Json
          p_starts_at?: string
          p_trial_days?: number
          p_trial_id: string
          p_trial_type?: string
        }
        Returns: Json
      }
      platform_service_trial_revoke: {
        Args: {
          p_actor_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason: string
          p_trial_id: string
        }
        Returns: Json
      }
      platform_service_trial_scope_valid: {
        Args: { p_scope: Json }
        Returns: boolean
      }
      platform_service_trial_store_command: {
        Args: {
          p_actor_employee_id: string
          p_idempotency_key: string
          p_request_hash: string
          p_result_envelope: Json
          p_scope_key: string
          p_tenant_id: string
          p_trial_id: string
        }
        Returns: Json
      }
      platform_service_trial_update_policy: {
        Args: {
          p_actor_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_policy: Json
          p_reason: string
        }
        Returns: Json
      }
      platform_service_trial_withdraw: {
        Args: {
          p_actor_employee_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason: string
          p_tenant_id: string
          p_trial_id: string
        }
        Returns: Json
      }
      platform_service_upsert_acceptance_preparation: {
        Args: {
          p_acceptance_due_at?: string
          p_prepared_by_employee_id: string
          p_status: string
          p_summary: string
          p_work_order_id: string
        }
        Returns: Json
      }
      platform_transition_virtual_product: {
        Args: {
          p_actor_employee_id: string
          p_expected_version: number
          p_product_id: string
          p_target_status: string
        }
        Returns: Json
      }
      platform_update_virtual_product: {
        Args: {
          p_actor_employee_id: string
          p_expected_version: number
          p_grant_rule_patch: Json
          p_product_id: string
          p_product_patch: Json
        }
        Returns: Json
      }
      platform_virtual_provider_product_id: { Args: never; Returns: string }
      prune_douyin_authorization_event_deliveries: {
        Args: { p_before: string; p_limit?: number }
        Returns: number
      }
      publish_brand_profile: {
        Args: {
          p_actor_employee_id: string
          p_expected_version: number
          p_scope: string
          p_tenant_id: string
        }
        Returns: {
          created_at: string
          display_name: string
          id: string
          logo_file_id: string
          published_at: string | null
          published_display_name: string | null
          published_logo_file_id: string | null
          published_version: number | null
          scope: string
          status: string
          tenant_id: string | null
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "brand_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_site_content: {
        Args: { p_actor_id: string; p_entry_id: string; p_version_id: string }
        Returns: {
          content_type: string
          created_at: string
          id: string
          published_at: string | null
          published_version_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "site_content_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_supplier_price_list: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      publish_supplier_price_list_pre_actor_binding_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      publish_supplier_price_list_pre_v2_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      publish_tenant_service_provider: {
        Args: {
          p_expected_version: number
          p_review_remark: string
          p_reviewer_employee_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      publish_workflow_definition:
        | {
            Args: {
              p_definition_id: string
              p_published_by: string
              p_snapshot: Json
              p_tenant_id: string
              p_updated_by: string
              p_validation_result: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_definition_id: string
              p_expected_updated_at: string
              p_published_by: string
              p_snapshot: Json
              p_tenant_id: string
              p_updated_by: string
              p_validation_result: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_definition_id: string
              p_expected_updated_at: string
              p_published_by: string
              p_snapshot: Json
              p_tenant_id: string
              p_updated_by: string
              p_validation_result: Json
              p_version_label: string
            }
            Returns: Json
          }
      purge_phone_identity_login_sessions: {
        Args: { p_before: string; p_limit?: number }
        Returns: number
      }
      rebuild_workflow_subject_runtime: {
        Args: {
          p_actor_employee_id: string
          p_context: Json
          p_definition_id: string
          p_delete_completed_instances?: boolean
          p_dry_run?: boolean
          p_project_status?: string
          p_reason: string
          p_subject_id: string
          p_subject_type: string
          p_tenant_id: string
        }
        Returns: Json
      }
      recalculate_project_referral: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      record_supplier_payment_command_result: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_command: string
          p_idempotency_key: string
          p_request: Json
          p_resource_id: string
          p_resource_type: string
          p_result: Json
          p_result_version: number
          p_tenant_id: string
        }
        Returns: Json
      }
      release_phone_identity_selection: {
        Args: { p_candidate_id: string; p_now: string; p_session_id: string }
        Returns: {
          status: string
        }[]
      }
      replace_douyin_budget_pricing_items: {
        Args: {
          p_expected_updated_at: string
          p_items: Json
          p_pricing_version_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      replace_platform_operator_roles: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_operator_id: string
          p_role_ids: string[]
        }
        Returns: Json
      }
      replace_platform_role_permissions: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_permission_ids: string[]
          p_role_id: string
        }
        Returns: Json
      }
      replace_supplier_sku_unit_conversions: {
        Args: {
          p_acting_tenant_id: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_edges: Json
          p_expected_sku_version: number
          p_idempotency_key: string
          p_supplier_sku_id: string
        }
        Returns: Json
      }
      replace_supplier_sku_unit_conversions_pre_visibility_unsafe: {
        Args: {
          p_acting_tenant_id: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_edges: Json
          p_expected_sku_version: number
          p_idempotency_key: string
          p_supplier_sku_id: string
        }
        Returns: Json
      }
      replace_supplier_sku_unit_conversions_v2: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_edges: Json
          p_expected_sku_version: number
          p_idempotency_key: string
          p_ownership_scope: string
          p_supplier_id: string
          p_supplier_product_id: string
          p_supplier_sku_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      replace_supplier_sku_unit_conversions_v3: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_base_unit_id: string
          p_edges: Json
          p_expected_sku_version: number
          p_idempotency_key: string
          p_ownership_scope: string
          p_purchase_unit_id: string
          p_supplier_id: string
          p_supplier_product_id: string
          p_supplier_sku_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      replace_workflow_draft_graph: {
        Args: {
          p_definition_id: string
          p_edges: Json
          p_nodes: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      replay_supplier_payment_command_result: {
        Args: { p_result: Json }
        Returns: Json
      }
      require_valid_brand_logo_file: {
        Args: { p_logo_file_id: string; p_tenant_id: string }
        Returns: {
          bucket: string
          checksum: string | null
          created_at: string
          created_by_auth_user_id: string | null
          created_by_employee_id: string | null
          deleted_at: string | null
          height: number | null
          id: string
          legacy_path: string | null
          legacy_url: string | null
          metadata: Json
          mime_type: string
          object_key: string
          original_name: string | null
          owner_id: string | null
          owner_type: string
          owner_visitor_id: string | null
          provider: string
          public_url: string | null
          region: string | null
          scene: string
          size_bytes: number
          status: string
          tenant_id: string | null
          updated_at: string
          visibility: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_file_objects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_phone_identity_selection: {
        Args: {
          p_auth_user_id: string
          p_candidate_id: string
          p_now: string
          p_openid_hash: string
          p_selection_token_hash: string
        }
        Returns: {
          customer_id: string
          employee_id: string
          partner_id: string
          partner_member_id: string
          session_id: string
          status: string
          target_mode: string
          tenant_id: string
          verified_phone: string
        }[]
      }
      reserve_sms_verification_code: {
        Args: {
          p_code: string
          p_expired_at: string
          p_phone: string
          p_request_device: string
          p_request_ip: string
          p_request_ip_limit: number
          p_scene: string
          p_since: string
        }
        Returns: {
          limited_dimension: string
          reservation_id: string
          reserved: boolean
        }[]
      }
      resolve_supplier_price_sku: {
        Args: { p_sku_id: string; p_supplier_id: string; p_tenant_id: string }
        Returns: {
          base_unit_conversion: number
          base_unit_id: string
          product_status: string
          purchase_unit_id: string
          sku_status: string
          supplier_product_id: string
        }[]
      }
      resolve_supplier_purchase_order_catalog: {
        Args: {
          p_keyword?: string
          p_page?: number
          p_page_size?: number
          p_priced_at: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      resolve_tenant_onboarding_region_paths: {
        Args: { p_service_region_codes: string[] }
        Returns: {
          adcode: string
          depth: number
          level: string
          name: string
          service_code: string
        }[]
      }
      resolve_wechat_login_state_by_openid: {
        Args: { p_openid: string }
        Returns: {
          active_oauth_id: string
          auth_user_id: string
          customer_claimed_at: string
          customer_id: string
          customer_name: string
          customer_origin: string
          customer_phone: string
          customer_user_id: string
          employee_avatar: string
          employee_id: string
          employee_name: string
          employee_post_id: string
          employee_status: string
          employee_tenant_department_id: string
          employee_user_id: string
          identity_id: string
          identity_type: string
          is_default: boolean
          membership_id: string
          oauth_unionid: string
          post_name: string
          status: string
          tenant_department_alias_name: string
          tenant_department_code: string
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          tenant_status: string
          user_id: string
        }[]
      }
      retire_supplier_price_list: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      retire_supplier_price_list_pre_actor_binding_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      retire_supplier_price_list_pre_v2_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_price_list_id: string
          p_proxy_reason: string
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      return_tenant_service_provider_to_draft: {
        Args: {
          p_expected_version: number
          p_review_remark: string
          p_reviewer_employee_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      review_catalog_unit_suggestion: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_approved_catalog_unit_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_review_remark: string
          p_suggestion_id: string
        }
        Returns: Json
      }
      review_supplier_payment_request: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_payment_request_id: string
          p_remark: string
          p_tenant_id: string
        }
        Returns: Json
      }
      review_supplier_purchase_requisition: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_remark: string
          p_requisition_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      review_supplier_qualification: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_qualification_id: string
          p_reason?: string
          p_supplier_id: string
          p_verification_status: string
        }
        Returns: Json
      }
      review_supplier_qualification_guarded: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_qualification_id: string
          p_reason?: string
          p_supplier_id: string
          p_verification_status: string
        }
        Returns: Json
      }
      revoke_platform_operator_sessions: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_operator_id: string
        }
        Returns: Json
      }
      revoke_wechat_mini_session_credentials: {
        Args: { p_oauth_identity_id: string }
        Returns: {
          created_at: string
          encrypted_session_key: string
          encryption_key_version: number
          id: string
          invalidated_at: string | null
          last_used_at: string | null
          oauth_identity_id: string
          obtained_at: string
          openid_hash: string
          session_revision: number
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wechat_mini_session_credentials"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rollback_site_content: {
        Args: { p_actor_id: string; p_entry_id: string; p_version_id: string }
        Returns: {
          content_type: string
          created_at: string
          id: string
          published_at: string | null
          published_version_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "site_content_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotate_wechat_mini_session_credential: {
        Args: {
          p_encrypted_session_key: string
          p_encryption_key_version: number
          p_oauth_identity_id: string
          p_openid: string
          p_openid_hash: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          encrypted_session_key: string
          encryption_key_version: number
          id: string
          invalidated_at: string | null
          last_used_at: string | null
          oauth_identity_id: string
          obtained_at: string
          openid_hash: string
          session_revision: number
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wechat_mini_session_credentials"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      save_brand_profile_draft: {
        Args: {
          p_actor_employee_id: string
          p_display_name: string
          p_expected_version: number
          p_logo_file_id: string
          p_scope: string
          p_tenant_id: string
        }
        Returns: {
          created_at: string
          display_name: string
          id: string
          logo_file_id: string
          published_at: string | null
          published_display_name: string | null
          published_logo_file_id: string | null
          published_version: number | null
          scope: string
          status: string
          tenant_id: string | null
          updated_at: string
          updated_by_employee_id: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "brand_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_project_cost_budgets: {
        Args: {
          p_employee_id: string
          p_items: Json
          p_project_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      save_supplier_payment_request_draft: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_allocations: Json
          p_expected_version: number
          p_idempotency_key: string
          p_payment_request_id: string
          p_project_id: string
          p_reason: string
          p_remark: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      save_supplier_purchase_order_draft: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_delivery_date: string
          p_expected_version: number
          p_idempotency_key: string
          p_items: Json
          p_order_id: string
          p_project_id: string
          p_purchase_requisition_id?: string
          p_remark: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      save_supplier_purchase_order_draft_v1: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_delivery_date: string
          p_expected_version: number
          p_idempotency_key: string
          p_items: Json
          p_order_id: string
          p_project_id: string
          p_remark: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      save_supplier_purchase_requisition_draft: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_delivery_date: string
          p_expected_version: number
          p_idempotency_key: string
          p_items: Json
          p_project_id: string
          p_reason: string
          p_remark: string
          p_requisition_id: string
          p_tenant_id: string
          p_tenant_supplier_id: string
        }
        Returns: Json
      }
      search_finance_project_risk_ids: {
        Args: {
          p_budget_configured?: boolean
          p_has_unallocated_expense?: boolean
          p_keyword?: string
          p_max_projected_budget_gross_margin?: number
          p_min_budget_usage_ratio?: number
          p_overdue?: boolean
          p_page?: number
          p_page_size?: number
          p_risk_flag?: string
          p_risk_level?: string
          p_status?: string
          p_tenant_id: string
        }
        Returns: {
          project_id: string
          total_count: number
        }[]
      }
      set_tenant_supplier_module: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_module_enabled: boolean
          p_reason?: string
          p_require_active_contract_for_new_order: boolean
          p_tenant_id: string
        }
        Returns: Json
      }
      set_tenant_supplier_rollout_settings: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_module_enabled: boolean
          p_ownership_reads_enabled: boolean
          p_private_catalog_writes_enabled: boolean
          p_private_supplier_writes_enabled: boolean
          p_procurement_snapshot_v1_enabled: boolean
          p_reason?: string
          p_require_active_contract_for_new_order: boolean
          p_tenant_id: string
        }
        Returns: Json
      }
      start_workflow_instance: {
        Args: {
          p_context: Json
          p_definition_id: string
          p_started_by: string
          p_subject_id: string
          p_subject_type: string
          p_tenant_id: string
        }
        Returns: Json
      }
      submit_douyin_measurement_appointment: {
        Args: {
          p_attribution: Json
          p_budget_estimate_id: string
          p_community: string
          p_consented_at: string
          p_demand: string
          p_douyin_miniapp_installation_id: string
          p_idempotency_key: string
          p_name: string
          p_phone: string
          p_preferred_visit_date: string
          p_preferred_visit_period: string
          p_privacy_policy_version: string
          p_request_ip: string
          p_sms_code: string
          p_subject_hash: string
          p_tenant_id: string
          p_user_agent: string
        }
        Returns: Json
      }
      submit_douyin_miniapp_lead: {
        Args: {
          p_area: number
          p_attribution: Json
          p_budget: string
          p_community: string
          p_consented_at: string
          p_demand: string
          p_douyin_miniapp_installation_id: string
          p_idempotency_key: string
          p_name: string
          p_phone: string
          p_privacy_policy_version: string
          p_request_digest: string
          p_request_ip: string
          p_sms_code: string
          p_start_time: string
          p_subject_hash: string
          p_tenant_id: string
          p_user_agent: string
        }
        Returns: {
          already_submitted: boolean
          lead_id: string
          message: string
          updated_existing: boolean
        }[]
      }
      submit_supplier_payment_request: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_payment_request_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      submit_supplier_purchase_order: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_order_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      submit_supplier_purchase_requisition: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_requisition_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      submit_tenant_catalog_unit_suggestion: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_idempotency_key: string
          p_reason: string
          p_suggested_code: string
          p_suggested_name: string
          p_suggested_symbol: string
          p_suggestion_id: string
          p_tenant_id: string
          p_unit_dimension: string
        }
        Returns: Json
      }
      submit_tenant_onboarding_application: {
        Args: {
          p_application: Json
          p_now: string
          p_sms_code_id: string
          p_sms_phone: string
        }
        Returns: {
          application_id: string
          created: boolean
        }[]
      }
      submit_tenant_onboarding_partner_assist: {
        Args: {
          p_application_id: string
          p_decision: string
          p_expected_version: number
          p_now: string
          p_partner_id: string
          p_partner_member_id: string
          p_remark: string
        }
        Returns: Json
      }
      submit_tenant_service_provider_profile: {
        Args: { p_expected_version: number; p_tenant_id: string }
        Returns: Json
      }
      submit_tenant_wechat_pay_applyment: {
        Args: {
          p_applyment_id: string
          p_employee_id: string
          p_expected_updated_at: string
          p_idempotency_key: string
          p_remark: string
          p_tenant_id: string
        }
        Returns: string
      }
      supplement_tenant_onboarding_application: {
        Args: {
          p_application_id: string
          p_candidate_match_reason: string
          p_candidate_partner_id: string
          p_candidate_snapshot: Json
          p_expected_version: number
          p_now: string
          p_partner_assist_due_at: string
          p_partner_assist_requested_at: string
          p_partner_assist_status: string
          p_patch: Json
          p_replace_candidate: boolean
          p_visitor_id: string
        }
        Returns: {
          application_id: string
        }[]
      }
      supplier_payment_request_to_jsonb: {
        Args: {
          p_request: Database["public"]["Tables"]["supplier_payment_requests"]["Row"]
        }
        Returns: Json
      }
      supplier_payment_to_jsonb: {
        Args: {
          p_payment: Database["public"]["Tables"]["supplier_payments"]["Row"]
        }
        Returns: Json
      }
      supplier_purchase_order_snapshot: {
        Args: {
          p_order: Database["public"]["Tables"]["supplier_purchase_orders"]["Row"]
        }
        Returns: Json
      }
      supplier_purchase_requisition_to_jsonb: {
        Args: {
          p_requisition: Database["public"]["Tables"]["supplier_purchase_requisitions"]["Row"]
        }
        Returns: Json
      }
      supplier_sku_spec_value_is_valid: {
        Args: {
          definition: Database["public"]["Tables"]["catalog_spec_definitions"]["Row"]
          p_value: Json
        }
        Returns: boolean
      }
      suspend_tenant_service_provider: {
        Args: {
          p_expected_version: number
          p_review_remark: string
          p_reviewer_employee_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      sync_douyin_miniapp_release_metadata: {
        Args: {
          p_claim_token: string
          p_installation_id: string
          p_release_id: string
        }
        Returns: boolean
      }
      sync_user_oauth_identity: {
        Args: {
          p_openid: string
          p_platform: string
          p_unionid?: string
          p_user_id: string
        }
        Returns: {
          bound_at: string
          created_at: string
          id: string
          openid: string
          platform: string
          status: string
          unbound_at: string
          unionid: string
          updated_at: string
          user_id: string
        }[]
      }
      tenant_service_decide_acceptance: {
        Args: {
          p_decision: string
          p_expected_work_order_version: number
          p_metadata?: Json
          p_operator_employee_id: string
          p_remark?: string
          p_service_order_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      tenant_service_ensure_contract_period: {
        Args: {
          p_accepted_at: string
          p_service_order_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      touch_wechat_mini_session_credential: {
        Args: {
          p_credential_id: string
          p_openid: string
          p_session_revision: number
          p_user_id: string
        }
        Returns: boolean
      }
      transition_platform_operator_status: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_operator_id: string
          p_target_status: string
        }
        Returns: Json
      }
      unbind_platform_partner_member_binding: {
        Args: {
          p_auth_user_id: string
          p_code: string
          p_member_id: string
          p_partner_id: string
        }
        Returns: {
          member_id: string
          status: string
        }[]
      }
      update_catalog_spec_definition: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_category_id: string
          p_code: string
          p_enum_options: Json
          p_expected_version: number
          p_idempotency_key: string
          p_is_filterable: boolean
          p_is_required: boolean
          p_name: string
          p_participates_in_sku_name: boolean
          p_sort_order: number
          p_spec_definition_id: string
          p_status: string
          p_tenant_id: string
          p_unit_dimension: string
          p_value_type: string
        }
        Returns: Json
      }
      update_platform_operator: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_name?: string
          p_operator_id: string
          p_phone?: string
          p_status?: string
        }
        Returns: Json
      }
      update_platform_role: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_description?: string
          p_expected_version: number
          p_idempotency_key: string
          p_name?: string
          p_role_id: string
        }
        Returns: Json
      }
      update_tenant_catalog_brand: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_brand_id: string
          p_code: string
          p_expected_version: number
          p_idempotency_key: string
          p_legal_name: string
          p_logo_file_id: string
          p_mapped_platform_brand_id: string
          p_name: string
          p_sort_order: number
          p_status: string
          p_tenant_id: string
        }
        Returns: Json
      }
      update_tenant_catalog_category: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_category_id: string
          p_code: string
          p_expected_version: number
          p_idempotency_key: string
          p_mapped_platform_category_id: string
          p_name: string
          p_parent_id: string
          p_sort_order: number
          p_status: string
          p_tenant_id: string
        }
        Returns: Json
      }
      update_tenant_private_supplier_master: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_legal_name: string
          p_name: string
          p_supplier_type: string
          p_tenant_id: string
          p_tenant_supplier_id: string
          p_unified_social_credit_code: string
          p_unified_social_credit_code_provided: boolean
        }
        Returns: Json
      }
      update_tenant_private_supplier_master_guarded: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_legal_name: string
          p_name: string
          p_supplier_type: string
          p_tenant_id: string
          p_tenant_supplier_id: string
          p_unified_social_credit_code: string
          p_unified_social_credit_code_provided: boolean
        }
        Returns: Json
      }
      update_tenant_service_provider_profile: {
        Args: { p_expected_version: number; p_patch: Json; p_tenant_id: string }
        Returns: Json
      }
      update_tenant_wechat_pay_applyment_draft: {
        Args: {
          p_applyment_id: string
          p_audit_metadata: Json
          p_employee_id: string
          p_epoch: number
          p_patch: Json
          p_revision: number
          p_tenant_id: string
        }
        Returns: string
      }
      upsert_douyin_project_public_profile: {
        Args: {
          p_budget_band: string
          p_project_id: string
          p_public_description: string
          p_public_image_urls: string[]
          p_public_title: string
          p_publication_status: string
          p_style_tags: string[]
          p_tenant_id: string
        }
        Returns: Json
      }
      upsert_platform_payment_secret_setting: {
        Args: {
          p_changed_by_employee_id: string
          p_description: string
          p_expected_updated_at: string
          p_group_code: string
          p_name: string
          p_setting_key: string
          p_status: string
          p_value_text: string
          p_value_type: string
        }
        Returns: {
          created_at: string
          description: string | null
          group_code: string
          id: string
          is_secret: boolean
          key: string
          name: string
          status: string
          tenant_id: string | null
          updated_at: string
          updated_by_employee_id: string | null
          value_text: string | null
          value_type: string
        }
        SetofOptions: {
          from: "*"
          to: "system_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_supplier_price_list_item: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_price_list_id: string
          p_proxy_reason: string
          p_sku_id: string
          p_supplier_id: string
          p_tax_inclusive: boolean
          p_tax_rate: number
          p_tenant_id: string
          p_unit_price: number
        }
        Returns: Json
      }
      upsert_supplier_price_list_item_pre_actor_binding_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_price_list_id: string
          p_proxy_reason: string
          p_sku_id: string
          p_supplier_id: string
          p_tax_inclusive: boolean
          p_tax_rate: number
          p_tenant_id: string
          p_unit_price: number
        }
        Returns: Json
      }
      upsert_supplier_price_list_item_pre_v2_unsafe: {
        Args: {
          p_actor_employee_id: string
          p_actor_user_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_price_list_id: string
          p_proxy_reason: string
          p_sku_id: string
          p_supplier_id: string
          p_tax_inclusive: boolean
          p_tax_rate: number
          p_tenant_id: string
          p_unit_price: number
        }
        Returns: Json
      }
      upsert_tenant_service_provider_area: {
        Args: {
          p_area: Json
          p_area_id: string
          p_expected_profile_version: number
          p_tenant_id: string
        }
        Returns: Json
      }
      validate_supplier_sku_unit_conversion_graph: {
        Args: { p_edges: Json; p_supplier_sku_id: string }
        Returns: number
      }
      validate_supplier_sku_unit_conversion_graph_pre_precision_unsaf: {
        Args: { p_edges: Json; p_supplier_sku_id: string }
        Returns: number
      }
      validate_supplier_sku_unit_conversion_graph_v2: {
        Args: {
          p_base_unit_id: string
          p_edges: Json
          p_purchase_unit_id: string
        }
        Returns: number
      }
      verify_wechat_customer_bootstrap: {
        Args: {
          p_customer_id?: string
          p_employee_id?: string
          p_openid: string
          p_page?: number
          p_page_size?: number
          p_recent_logs_per_project?: number
          p_tenant_id?: string
          p_user_id: string
        }
        Returns: {
          customer_context: Json
          customer_membership_matched: boolean
          employee_membership_matched: boolean
          employee_user_matched: boolean
          home_projects: Json
          oauth_matched: boolean
          user_profile: Json
        }[]
      }
      verify_wechat_identity_binding: {
        Args: {
          p_customer_id?: string
          p_employee_id?: string
          p_openid: string
          p_tenant_id?: string
          p_user_id: string
        }
        Returns: {
          customer_context: Json
          customer_membership_matched: boolean
          employee_membership_matched: boolean
          employee_user_matched: boolean
          oauth_matched: boolean
          user_profile: Json
        }[]
      }
      wechat_accept_virtual_payment_notification: {
        Args: {
          p_actual_price_fen: number
          p_attach: string
          p_environment: string
          p_event_type: string
          p_msg_type: string
          p_openid_hash: string
          p_orig_price_fen: number
          p_out_trade_no: string
          p_paid_at: string
          p_provider_created_at: number
          p_provider_order_no: string
          p_provider_product_id: string
          p_quantity: number
          p_recipient_original_id: string
          p_request_id: string
          p_sender_id_hash: string
          p_transaction_id: string
        }
        Returns: Json
      }
      wechat_mark_virtual_payment_notification_failed: {
        Args: {
          p_error_code: string
          p_error_summary: string
          p_notification_id: string
          p_order_id: string
        }
        Returns: Json
      }
      wechat_mark_virtual_payment_notification_processed: {
        Args: {
          p_entitlement_event_id: string
          p_entitlement_status: string
          p_fulfilled: boolean
          p_notification_id: string
          p_order_id: string
          p_payment_recorded: boolean
        }
        Returns: Json
      }
      wechat_pay_create_pending_service_provider_order: {
        Args: {
          p_amount: number
          p_created_by_employee_id: string
          p_expected_platform_guard_version: number
          p_expected_tenant_config_updated_at: string
          p_metadata?: Json
          p_out_trade_no: string
          p_payer_openid: string
          p_payment_config_id: string
          p_platform_payment_config_id: string
          p_project_id: string
          p_receivable_plan_id: string
          p_tenant_id: string
          p_workflow_instance_id: string
          p_workflow_task_id: string
        }
        Returns: {
          amount: number
          closed_at: string | null
          created_at: string
          created_by_employee_id: string | null
          currency: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          latest_notification_id: string | null
          metadata: Json
          out_trade_no: string
          paid_amount: number
          paid_at: string | null
          payer_openid: string | null
          payment_config_id: string | null
          payment_id: string | null
          prepay_id: string | null
          project_id: string
          receivable_plan_id: string | null
          status: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
          workflow_instance_id: string | null
          workflow_task_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "wechat_payment_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      withdraw_tenant_onboarding_application: {
        Args: {
          p_application_id: string
          p_expected_version: number
          p_now: string
          p_reason: string
          p_visitor_id: string
        }
        Returns: {
          application_id: string
        }[]
      }
      workflow_edge_condition_matches: {
        Args: { p_condition: Json; p_output: Json }
        Returns: boolean
      }
      write_platform_command_audit: {
        Args: {
          p_action: string
          p_actor_employee_id: string
          p_actor_user_id: string
          p_idempotency_key: string
          p_resource_id: string
          p_resource_label: string
          p_resource_type: string
          p_result: Json
          p_summary: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
