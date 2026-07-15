export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
            referencedRelation: "tenants"
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
          id: string
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
          id?: string
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
          id?: string
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
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
        }
        Insert: {
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
        }
        Update: {
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
          metadata: Json
          occurred_at: string
          payment_id: string | null
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
          metadata?: Json
          occurred_at?: string
          payment_id?: string | null
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
          metadata?: Json
          occurred_at?: string
          payment_id?: string | null
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
            foreignKeyName: "finance_ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
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
          event_name: string
          id: string
          page_id: string | null
          page_version_id: string | null
          payload: Json
          request_ip: string | null
          tenant_id: string | null
          user_agent: string | null
          wx_openid: string | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          customer_id?: string | null
          event_name: string
          id?: string
          page_id?: string | null
          page_version_id?: string | null
          payload?: Json
          request_ip?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          wx_openid?: string | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          customer_id?: string | null
          event_name?: string
          id?: string
          page_id?: string | null
          page_version_id?: string | null
          payload?: Json
          request_ip?: string | null
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
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          city: string | null
          community: string | null
          created_at: string
          customer_id: string | null
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
          wx_openid: string | null
        }
        Insert: {
          city?: string | null
          community?: string | null
          created_at?: string
          customer_id?: string | null
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
          wx_openid?: string | null
        }
        Update: {
          city?: string | null
          community?: string | null
          created_at?: string
          customer_id?: string | null
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
          wx_openid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
            referencedRelation: "tenants"
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
      platform_audit_logs: {
        Row: {
          action: string
          actor_employee_id: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
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
          metadata?: Json
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
          metadata?: Json
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
            referencedRelation: "tenants"
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
          owner_visitor_id: string | null
          owner_type: string
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
          owner_visitor_id?: string | null
          owner_type: string
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
          owner_visitor_id?: string | null
          owner_type?: string
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
            referencedRelation: "tenants"
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
            foreignKeyName: "project_receivable_allocations_tenant_id_fkey"
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
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          metadata: Json
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
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          metadata?: Json
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
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          metadata?: Json
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
            foreignKeyName: "project_receivable_plans_created_by_fkey"
            columns: ["created_by"]
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
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
            referencedRelation: "tenants"
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
          created_at: string
          created_by: string | null
          credits: number
          id: string
          idempotency_key: string | null
          metadata: Json
          order_no: string
          package_code: string | null
          paid_at: string | null
          remark: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_fen: number
          bonus_credits?: number
          channel: string
          created_at?: string
          created_by?: string | null
          credits: number
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          order_no: string
          package_code?: string | null
          paid_at?: string | null
          remark?: string | null
          status: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_fen?: number
          bonus_credits?: number
          channel?: string
          created_at?: string
          created_by?: string | null
          credits?: number
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          order_no?: string
          package_code?: string | null
          paid_at?: string | null
          remark?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credit_orders_tenant_id_fkey"
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
          business_scene_description: string | null
          contact_address: string | null
          created_at: string
          created_by_employee_id: string | null
          id: string
          legal_representative_name: string | null
          license_code: string | null
          license_name: string | null
          merchant_short_name: string
          opened_at: string | null
          payment_config_id: string | null
          rejected_at: string | null
          rejected_reason: string | null
          remark: string | null
          reviewed_by_employee_id: string | null
          settlement_account_number_masked: string | null
          settlement_account_name: string | null
          settlement_account_summary: string | null
          settlement_account_type: string | null
          settlement_bank_branch_id: string | null
          settlement_bank_full_name: string | null
          settlement_bank_name: string | null
          status: string
          sub_appid: string | null
          sub_mchid: string | null
          submitted_at: string | null
          super_admin_email: string | null
          super_admin_name: string | null
          super_admin_phone_masked: string | null
          tenant_id: string
          updated_at: string
          updated_by_employee_id: string | null
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
          business_scene_description?: string | null
          contact_address?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          legal_representative_name?: string | null
          license_code?: string | null
          license_name?: string | null
          merchant_short_name: string
          opened_at?: string | null
          payment_config_id?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          remark?: string | null
          reviewed_by_employee_id?: string | null
          settlement_account_number_masked?: string | null
          settlement_account_name?: string | null
          settlement_account_summary?: string | null
          settlement_account_type?: string | null
          settlement_bank_branch_id?: string | null
          settlement_bank_full_name?: string | null
          settlement_bank_name?: string | null
          status?: string
          sub_appid?: string | null
          sub_mchid?: string | null
          submitted_at?: string | null
          super_admin_email?: string | null
          super_admin_name?: string | null
          super_admin_phone_masked?: string | null
          tenant_id: string
          updated_at?: string
          updated_by_employee_id?: string | null
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
          business_scene_description?: string | null
          contact_address?: string | null
          created_at?: string
          created_by_employee_id?: string | null
          id?: string
          legal_representative_name?: string | null
          license_code?: string | null
          license_name?: string | null
          merchant_short_name?: string
          opened_at?: string | null
          payment_config_id?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          remark?: string | null
          reviewed_by_employee_id?: string | null
          settlement_account_number_masked?: string | null
          settlement_account_name?: string | null
          settlement_account_summary?: string | null
          settlement_account_type?: string | null
          settlement_bank_branch_id?: string | null
          settlement_bank_full_name?: string | null
          settlement_bank_name?: string | null
          status?: string
          sub_appid?: string | null
          sub_mchid?: string | null
          submitted_at?: string | null
          super_admin_email?: string | null
          super_admin_name?: string | null
          super_admin_phone_masked?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by_employee_id?: string | null
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
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
            referencedRelation: "tenants"
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
            foreignKeyName: "tenant_onboarding_application_reviews_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_application_reviews_actor_partner_member_id_fkey"
            columns: ["actor_partner_member_id"]
            isOneToOne: false
            referencedRelation: "platform_partner_members"
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
            referencedRelation: "tenants"
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
            referencedRelation: "tenants"
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
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
            referencedRelation: "tenants"
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
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
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
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
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
      assign_platform_lead: {
        Args: {
          p_assigned_note?: string
          p_lead_id: string
          p_operator_employee_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      billing_charge_credits: {
        Args: {
          p_change_credits: number
          p_correlation_id?: string
          p_event_type: string
          p_pricing_snapshot?: Json
          p_remark?: string
          p_source_id?: string
          p_source_type?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      billing_ensure_account: { Args: { p_tenant_id: string }; Returns: Json }
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
      expire_tenant_onboarding_partner_assists: {
        Args: { p_cutoff: string; p_partner_id?: string }
        Returns: {
          application_id: string
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
      initialize_default_decoration_tenant: {
        Args: {
          p_admin_name: string
          p_admin_phone: string
          p_operator_employee_id?: string
          p_tenant_id: string
        }
        Returns: Json
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
      get_project_log_calendar: {
        Args: { project_uuid: string; timezone_name?: string }
        Returns: {
          count: number
          date: string
          node_name: string
          stage_code: string
        }[]
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
      list_tenant_service_provider_publications: {
        Args: { p_keyword: string; p_status: string }
        Returns: {
          address_city: string | null
          address_district: string | null
          area_count: number
          public_name: string | null
          public_phone: string | null
          status: string
          submitted_at: string | null
          tenant_id: string
          tenant_name: string
          updated_at: string
          version: number
        }[]
      }
      list_visitor_local_service_providers: {
        Args: { p_region_codes: string[] }
        Returns: {
          address: string | null
          address_city: string | null
          address_district: string | null
          address_latitude: number | null
          address_longitude: number | null
          address_province: string | null
          address_region_code: string | null
          introduction: string | null
          matched_region_code: string
          public_name: string
          public_phone: string
          tenant_id: string
        }[]
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
      return_tenant_service_provider_to_draft: {
        Args: {
          p_expected_version: number
          p_review_remark: string
          p_reviewer_employee_id: string
          p_tenant_id: string
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
      suspend_tenant_service_provider: {
        Args: {
          p_expected_version: number
          p_review_remark: string
          p_reviewer_employee_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      update_tenant_service_provider_profile: {
        Args: {
          p_expected_version: number
          p_patch: Json
          p_tenant_id: string
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
      replace_workflow_draft_graph: {
        Args: {
          p_definition_id: string
          p_edges: Json
          p_nodes: Json
          p_tenant_id: string
        }
        Returns: Json
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
      workflow_edge_condition_matches: {
        Args: { p_condition: Json; p_output: Json }
        Returns: boolean
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
