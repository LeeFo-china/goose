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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_call_logs: {
        Row: {
          billable: boolean
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
          request_id: string | null
          scene_code: string
          source: string | null
          status: string
          tenant_id: string | null
          total_tokens: number | null
        }
        Insert: {
          billable?: boolean
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
          request_id?: string | null
          scene_code: string
          source?: string | null
          status: string
          tenant_id?: string | null
          total_tokens?: number | null
        }
        Update: {
          billable?: boolean
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
          claimed_at: string | null
          created_at: string | null
          customer_origin: string
          douyin_screenshot_images: string[]
          id: string
          last_follow_at: string | null
          name: string | null
          owner_id: string | null
          phone: string | null
          self_registered_at: string | null
          source: string | null
          status: string | null
          tags: Json | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string | null
          customer_origin?: string
          douyin_screenshot_images?: string[]
          id?: string
          last_follow_at?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          self_registered_at?: string | null
          source?: string | null
          status?: string | null
          tags?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          created_at?: string | null
          customer_origin?: string
          douyin_screenshot_images?: string[]
          id?: string
          last_follow_at?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          self_registered_at?: string | null
          source?: string | null
          status?: string | null
          tags?: Json | null
          tenant_id?: string | null
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
          created_at: string | null
          department_code: string
          enabled: boolean
          id: string
          post_code: string
          sort: number
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_code: string
          enabled?: boolean
          id?: string
          post_code: string
          sort?: number
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_code?: string
          enabled?: boolean
          id?: string
          post_code?: string
          sort?: number
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_post_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
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
          department_id: string | null
          id: string
          last_login_time: string | null
          name: string | null
          phone: string | null
          post_id: string | null
          status: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string | null
          department_id?: string | null
          id?: string
          last_login_time?: string | null
          name?: string | null
          phone?: string | null
          post_id?: string | null
          status?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string | null
          department_id?: string | null
          id?: string
          last_login_time?: string | null
          name?: string | null
          phone?: string | null
          post_id?: string | null
          status?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
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
      expense_request_approval_chains: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          assignee_id: string
          assignee_name_snapshot: string | null
          comment: string | null
          created_at: string
          expense_request_id: string
          id: string
          required_permission: string
          sort_order: number
          status: string
          step: string
          step_name: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          assignee_id: string
          assignee_name_snapshot?: string | null
          comment?: string | null
          created_at?: string
          expense_request_id: string
          id?: string
          required_permission: string
          sort_order: number
          status?: string
          step: string
          step_name: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          assignee_id?: string
          assignee_name_snapshot?: string | null
          comment?: string | null
          created_at?: string
          expense_request_id?: string
          id?: string
          required_permission?: string
          sort_order?: number
          status?: string
          step?: string
          step_name?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_request_approval_chains_acted_by_fkey"
            columns: ["acted_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_request_approval_chains_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_request_approval_chains_expense_request_id_fkey"
            columns: ["expense_request_id"]
            isOneToOne: false
            referencedRelation: "expense_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_request_approval_chains_tenant_id_fkey"
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
          id: string
          is_builtin: boolean
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
          id?: string
          is_builtin?: boolean
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
          id?: string
          is_builtin?: boolean
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
          created_at: string | null
          current_step: string
          current_step_role: string | null
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
          created_at?: string | null
          current_step?: string
          current_step_role?: string | null
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
          created_at?: string | null
          current_step?: string
          current_step_role?: string | null
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
          updated_at?: string
          wechat_account?: string | null
        }
        Relationships: []
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
          pay_date: string | null
          project_id: string | null
          status: string | null
          type: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          evidence_images?: Json | null
          handled_by?: string | null
          id?: string
          pay_date?: string | null
          project_id?: string | null
          status?: string | null
          type?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          evidence_images?: Json | null
          handled_by?: string | null
          id?: string
          pay_date?: string | null
          project_id?: string | null
          status?: string | null
          type?: string | null
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
          source: string
          status: string
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
          source?: string
          status?: string
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
          source?: string
          status?: string
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
          required: boolean
          result: string | null
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
          required?: boolean
          result?: string | null
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
          required?: boolean
          result?: string | null
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
          required: boolean
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
          required?: boolean
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
          required?: boolean
          sort_order?: number
          standard?: string
          status?: string
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_acceptance_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_acceptance_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_acceptance_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          stage_code: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          stage_code: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
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
          template_version: number
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
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
          template_version?: number
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
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
          created_at: string | null
          customer_id: string | null
          designer_id: string | null
          id: string
          name: string | null
          property_id: string | null
          signed_amount: number | null
          start_date: string | null
          status: string | null
          style_tags: Json
          supervisor_id: string | null
          tenant_id: string | null
          updated_at: string
          visibility_status: string
        }
        Insert: {
          address?: string | null
          budget?: number | null
          created_at?: string | null
          customer_id?: string | null
          designer_id?: string | null
          id?: string
          name?: string | null
          property_id?: string | null
          signed_amount?: number | null
          start_date?: string | null
          status?: string | null
          style_tags?: Json
          supervisor_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          visibility_status?: string
        }
        Update: {
          address?: string | null
          budget?: number | null
          created_at?: string | null
          customer_id?: string | null
          designer_id?: string | null
          id?: string
          name?: string | null
          property_id?: string | null
          signed_amount?: number | null
          start_date?: string | null
          status?: string | null
          style_tags?: Json
          supervisor_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          visibility_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
            foreignKeyName: "projects_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          area: number | null
          building_info: string | null
          community: string
          created_at: string | null
          customer_id: string | null
          id: string
          latitude: number | null
          layout: string | null
          longitude: number | null
          tenant_id: string | null
        }
        Insert: {
          area?: number | null
          building_info?: string | null
          community: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          latitude?: number | null
          layout?: string | null
          longitude?: number | null
          tenant_id?: string | null
        }
        Update: {
          area?: number | null
          building_info?: string | null
          community?: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          latitude?: number | null
          layout?: string | null
          longitude?: number | null
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
          channel_mode: string | null
          created_at: string
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
          channel_mode?: string | null
          created_at?: string
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
          channel_mode?: string | null
          created_at?: string
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
          billing_duration_seconds: number | null
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
          billing_duration_seconds?: number | null
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
          billing_duration_seconds?: number | null
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
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
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
      wechat_identities: {
        Row: {
          auth_user_id: string
          created_at: string
          openid: string
          unionid: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          openid: string
          unionid?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          openid?: string
          unionid?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      all_public_tables: {
        Row: {
          table_catalog: unknown
          table_name: unknown
          table_schema: unknown
          table_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_platform_lead: {
        Args: {
          p_assigned_note?: string
          p_lead_id: string
          p_operator_employee_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      bind_customer_from_tenant_share: {
        Args: { p_auth_user_id: string; p_phone: string; p_share_token: string }
        Returns: Json
      }
      claim_next_social_video_transcription:
        | {
            Args: never
            Returns: {
              asr_task_id: string | null
              audio_duration_seconds: number | null
              audio_file_size_bytes: number | null
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
      create_auth_for_employee: { Args: { emp_id: string }; Returns: string }
      find_auth_user_by_openid: {
        Args: { p_openid: string }
        Returns: {
          email: string
          id: string
          openid: string
          unionid: string
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
      get_project_create_page_data: { Args: never; Returns: Json }
      get_project_log_calendar: {
        Args: { project_uuid: string; timezone_name?: string }
        Returns: {
          count: number
          date: string
          node_name: string
          stage_code: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      recalculate_project_referral: {
        Args: { p_project_id: string }
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
  public: {
    Enums: {},
  },
} as const
