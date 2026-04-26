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
      customers: {
        Row: {
          created_at: string | null
          id: string
          last_follow_at: string | null
          name: string | null
          owner_id: string | null
          phone: string | null
          source: string | null
          status: string | null
          tags: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_follow_at?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          tags?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_follow_at?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          tags?: Json | null
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
        ]
      }
      departments: {
        Row: {
          code: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: string
          name?: string
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
          role: string | null
          status: string | null
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
          role?: string | null
          status?: string | null
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
          role?: string | null
          status?: string | null
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
        }
        Insert: {
          action: string
          approver_id?: string | null
          comment?: string | null
          created_at?: string
          expense_request_id: string
          id?: string
          step: string
        }
        Update: {
          action?: string
          approver_id?: string | null
          comment?: string | null
          created_at?: string
          expense_request_id?: string
          id?: string
          step?: string
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
        ]
      }
      expense_request_items: {
        Row: {
          amount: number
          category: string
          created_at: string
          evidence_images: Json
          expense_request_id: string
          id: string
          invoice_no: string | null
          occurred_at: string | null
          remark: string | null
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          evidence_images?: Json
          expense_request_id: string
          id?: string
          invoice_no?: string | null
          occurred_at?: string | null
          remark?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          evidence_images?: Json
          expense_request_id?: string
          id?: string
          invoice_no?: string | null
          occurred_at?: string | null
          remark?: string | null
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
          resource?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          base_salary: number | null
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          salary_type: string | null
          sort: number | null
          status: number | null
          updated_at: string | null
        }
        Insert: {
          base_salary?: number | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          salary_type?: string | null
          sort?: number | null
          status?: number | null
          updated_at?: string | null
        }
        Update: {
          base_salary?: number | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          salary_type?: string | null
          sort?: number | null
          status?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
        ]
      }
      project_members: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          employee_id: string
          id: string
          is_primary: boolean
          project_id: string
          role_code: string
          role_name: string | null
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean
          project_id: string
          role_code: string
          role_name?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean
          project_id?: string
          role_code?: string
          role_name?: string | null
          sort_order?: number
          updated_at?: string | null
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
        }
        Relationships: [
          {
            foreignKeyName: "properties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      get_home_dashboard_stats: { Args: never; Returns: Json }
      get_project_create_page_data: { Args: never; Returns: Json }
      get_project_log_calendar: {
        Args: { project_uuid: string; timezone_name?: string }
        Returns: {
          count: number
          date: string
          node_name: string | null
          stage_code: string | null
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
