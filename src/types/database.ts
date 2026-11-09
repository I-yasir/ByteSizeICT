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
      admins: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          last_login_at: string | null
          password_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      admissions: {
        Row: {
          amount_bdt: number | null
          created_at: string
          duplicate_flags: Json
          email: string
          id: string
          kind: Database["public"]["Enums"]["admission_kind"]
          mobile: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          plan_id: string | null
          reject_reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["admission_status"]
          student_id: string | null
          submitter_ip: unknown
          trx_id: string
          trx_id_normalized: string | null
          updated_at: string
        }
        Insert: {
          amount_bdt?: number | null
          created_at?: string
          duplicate_flags?: Json
          email: string
          id?: string
          kind: Database["public"]["Enums"]["admission_kind"]
          mobile: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          plan_id?: string | null
          reject_reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["admission_status"]
          student_id?: string | null
          submitter_ip?: unknown
          trx_id: string
          trx_id_normalized?: string | null
          updated_at?: string
        }
        Update: {
          amount_bdt?: number | null
          created_at?: string
          duplicate_flags?: Json
          email?: string
          id?: string
          kind?: Database["public"]["Enums"]["admission_kind"]
          mobile?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          plan_id?: string | null
          reject_reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["admission_status"]
          student_id?: string | null
          submitter_ip?: unknown
          trx_id?: string
          trx_id_normalized?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admissions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_answers: {
        Row: {
          attempt_id: string
          client_seq: number
          is_correct: boolean | null
          is_marked: boolean
          question_id: string
          selected_option: Database["public"]["Enums"]["option_key"] | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          client_seq?: number
          is_correct?: boolean | null
          is_marked?: boolean
          question_id: string
          selected_option?: Database["public"]["Enums"]["option_key"] | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          client_seq?: number
          is_correct?: boolean | null
          is_marked?: boolean
          question_id?: string
          selected_option?: Database["public"]["Enums"]["option_key"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "paper_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_admin_id: string | null
          actor_student_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          meta: Json
        }
        Insert: {
          action: string
          actor_admin_id?: string | null
          actor_student_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          meta?: Json
        }
        Update: {
          action?: string
          actor_admin_id?: string | null
          actor_student_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_admin_id_fkey"
            columns: ["actor_admin_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_student_id_fkey"
            columns: ["actor_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          created_at: string
          id: string
          name_bn: string
          name_en: string
          number: number
          sort_order: number
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_bn: string
          name_en: string
          number: number
          sort_order?: number
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name_bn?: string
          name_en?: string
          number?: number
          sort_order?: number
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_assignees: {
        Row: {
          exam_id: string
          student_id: string
        }
        Insert: {
          exam_id: string
          student_id: string
        }
        Update: {
          exam_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_assignees_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_assignees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          correct_count: number | null
          created_at: string
          deadline_at: string
          exam_id: string
          id: string
          incorrect_count: number | null
          is_late: boolean
          last_question_index: number
          option_order: Json
          question_order: string[]
          score: number | null
          skipped_count: number | null
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at: string | null
          tab_switch_count: number
          updated_at: string
        }
        Insert: {
          correct_count?: number | null
          created_at?: string
          deadline_at: string
          exam_id: string
          id?: string
          incorrect_count?: number | null
          is_late?: boolean
          last_question_index?: number
          option_order?: Json
          question_order: string[]
          score?: number | null
          skipped_count?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at?: string | null
          tab_switch_count?: number
          updated_at?: string
        }
        Update: {
          correct_count?: number | null
          created_at?: string
          deadline_at?: string
          exam_id?: string
          id?: string
          incorrect_count?: number | null
          is_late?: boolean
          last_question_index?: number
          option_order?: Json
          question_order?: string[]
          score?: number | null
          skipped_count?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id?: string
          submitted_at?: string | null
          tab_switch_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          exam_id: string
          position: number
          question_id: string
        }
        Insert: {
          exam_id: string
          position: number
          question_id: string
        }
        Update: {
          exam_id?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "paper_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          access_mode: Database["public"]["Enums"]["access_mode"]
          allow_mark_for_review: boolean
          answers_publish_at: string | null
          audience: Database["public"]["Enums"]["exam_audience"]
          chapter_label: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_featured: boolean
          is_sample: boolean
          late_until: string | null
          live_ends_at: string | null
          marks_per_question: number
          negative_mark: number
          published_at: string | null
          question_count: number
          rank_late_attempts: boolean
          results_publish_at: string | null
          show_option_stats: boolean
          shuffle_options: boolean
          shuffle_questions: boolean
          starts_at: string | null
          status: Database["public"]["Enums"]["exam_status"]
          subject_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          access_mode?: Database["public"]["Enums"]["access_mode"]
          allow_mark_for_review?: boolean
          answers_publish_at?: string | null
          audience?: Database["public"]["Enums"]["exam_audience"]
          chapter_label?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_featured?: boolean
          is_sample?: boolean
          late_until?: string | null
          live_ends_at?: string | null
          marks_per_question?: number
          negative_mark?: number
          published_at?: string | null
          question_count?: number
          rank_late_attempts?: boolean
          results_publish_at?: string | null
          show_option_stats?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          subject_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          access_mode?: Database["public"]["Enums"]["access_mode"]
          allow_mark_for_review?: boolean
          answers_publish_at?: string | null
          audience?: Database["public"]["Enums"]["exam_audience"]
          chapter_label?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_featured?: boolean
          is_sample?: boolean
          late_until?: string | null
          live_ends_at?: string | null
          marks_per_question?: number
          negative_mark?: number
          published_at?: string | null
          question_count?: number
          rank_late_attempts?: boolean
          results_publish_at?: string | null
          show_option_stats?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          subject_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          done_at: string | null
          id: number
          kind: Database["public"]["Enums"]["outbox_kind"]
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          status: Database["public"]["Enums"]["outbox_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          done_at?: string | null
          id?: never
          kind: Database["public"]["Enums"]["outbox_kind"]
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          status?: Database["public"]["Enums"]["outbox_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          done_at?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["outbox_kind"]
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          status?: Database["public"]["Enums"]["outbox_status"]
        }
        Relationships: []
      }
      payment_accounts: {
        Row: {
          account_holder: string | null
          account_label: string | null
          account_number: string
          created_at: string
          id: string
          instructions_bn: string | null
          instructions_en: string | null
          is_active: boolean
          method: Database["public"]["Enums"]["payment_method"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_label?: string | null
          account_number: string
          created_at?: string
          id?: string
          instructions_bn?: string | null
          instructions_en?: string | null
          is_active?: boolean
          method: Database["public"]["Enums"]["payment_method"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_label?: string | null
          account_number?: string
          created_at?: string
          id?: string
          instructions_bn?: string | null
          instructions_en?: string | null
          is_active?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          code: string
          created_at: string
          duration_days: number | null
          features: Json
          fixed_expires_at: string | null
          id: string
          is_active: boolean
          is_highlighted: boolean
          name_bn: string
          name_en: string
          price_bdt: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          duration_days?: number | null
          features?: Json
          fixed_expires_at?: string | null
          id?: string
          is_active?: boolean
          is_highlighted?: boolean
          name_bn: string
          name_en: string
          price_bdt: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          duration_days?: number | null
          features?: Json
          fixed_expires_at?: string | null
          id?: string
          is_active?: boolean
          is_highlighted?: boolean
          name_bn?: string
          name_en?: string
          price_bdt?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      question_import_batches: {
        Row: {
          admin_id: string
          created_at: string
          expires_at: string
          id: string
          rows: Json
          summary: Json
        }
        Insert: {
          admin_id: string
          created_at?: string
          expires_at?: string
          id?: string
          rows: Json
          summary: Json
        }
        Update: {
          admin_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          rows?: Json
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "question_import_batches_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          chapter_id: string
          content_hash: string
          correct_option: Database["public"]["Enums"]["option_key"]
          correct_rate: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          explanation: string | null
          explanation_image_path: string | null
          id: string
          option_a: string
          option_a_image_path: string | null
          option_b: string
          option_b_image_path: string | null
          option_c: string
          option_c_image_path: string | null
          option_d: string
          option_d_image_path: string | null
          status: Database["public"]["Enums"]["content_status"]
          stem: string
          stem_image_path: string | null
          times_answered: number
          times_correct: number
          times_used: number
          topic_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chapter_id: string
          content_hash?: string
          correct_option: Database["public"]["Enums"]["option_key"]
          correct_rate?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          explanation?: string | null
          explanation_image_path?: string | null
          id?: string
          option_a?: string
          option_a_image_path?: string | null
          option_b?: string
          option_b_image_path?: string | null
          option_c?: string
          option_c_image_path?: string | null
          option_d?: string
          option_d_image_path?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          stem: string
          stem_image_path?: string | null
          times_answered?: number
          times_correct?: number
          times_used?: number
          topic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chapter_id?: string
          content_hash?: string
          correct_option?: Database["public"]["Enums"]["option_key"]
          correct_rate?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          explanation?: string | null
          explanation_image_path?: string | null
          id?: string
          option_a?: string
          option_a_image_path?: string | null
          option_b?: string
          option_b_image_path?: string | null
          option_c?: string
          option_c_image_path?: string | null
          option_d?: string
          option_d_image_path?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          stem?: string
          stem_image_path?: string | null
          times_answered?: number
          times_correct?: number
          times_used?: number
          topic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          bucket: string
          created_at: string
          id: number
          subject: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          subject: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          subject?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          admin_id: string | null
          created_at: string
          expires_at: string
          id: string
          ip: unknown
          last_seen_at: string
          remember: boolean
          revoke_reason: string | null
          revoked_at: string | null
          student_id: string | null
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip?: unknown
          last_seen_at?: string
          remember?: boolean
          revoke_reason?: string | null
          revoked_at?: string | null
          student_id?: string | null
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip?: unknown
          last_seen_at?: string
          remember?: boolean
          revoke_reason?: string | null
          revoked_at?: string | null
          student_id?: string | null
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          access_expires_at: string
          access_starts_at: string
          admin_label: string | null
          admin_note: string | null
          created_at: string
          credentials_sent_at: string | null
          credentials_status: Database["public"]["Enums"]["credentials_status"]
          display_name: string | null
          email: string
          id: string
          last_login_at: string | null
          mobile: string
          must_change_pin: boolean
          pin_hash: string
          pin_updated_at: string
          plan_id: string | null
          status: Database["public"]["Enums"]["student_status"]
          status_changed_at: string | null
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          access_expires_at: string
          access_starts_at: string
          admin_label?: string | null
          admin_note?: string | null
          created_at?: string
          credentials_sent_at?: string | null
          credentials_status?: Database["public"]["Enums"]["credentials_status"]
          display_name?: string | null
          email: string
          id?: string
          last_login_at?: string | null
          mobile: string
          must_change_pin?: boolean
          pin_hash: string
          pin_updated_at?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          access_expires_at?: string
          access_starts_at?: string
          admin_label?: string | null
          admin_note?: string | null
          created_at?: string
          credentials_sent_at?: string | null
          credentials_status?: Database["public"]["Enums"]["credentials_status"]
          display_name?: string | null
          email?: string
          id?: string
          last_login_at?: string | null
          mobile?: string
          must_change_pin?: boolean
          pin_hash?: string
          pin_updated_at?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_plan_fk"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          id: string
          name_bn: string
          name_en: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_bn: string
          name_en: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name_bn?: string
          name_en?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          name_bn: string
          name_en: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          name_bn: string
          name_en: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          name_bn?: string
          name_en?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      paper_questions: {
        Row: {
          id: string | null
          option_a: string | null
          option_a_image_path: string | null
          option_b: string | null
          option_b_image_path: string | null
          option_c: string | null
          option_c_image_path: string | null
          option_d: string | null
          option_d_image_path: string | null
          stem: string | null
          stem_image_path: string | null
        }
        Insert: {
          id?: string | null
          option_a?: string | null
          option_a_image_path?: string | null
          option_b?: string | null
          option_b_image_path?: string | null
          option_c?: string | null
          option_c_image_path?: string | null
          option_d?: string | null
          option_d_image_path?: string | null
          stem?: string | null
          stem_image_path?: string | null
        }
        Update: {
          id?: string | null
          option_a?: string | null
          option_a_image_path?: string | null
          option_b?: string | null
          option_b_image_path?: string | null
          option_c?: string | null
          option_c_image_path?: string | null
          option_d?: string | null
          option_d_image_path?: string | null
          stem?: string | null
          stem_image_path?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_set_student_pin: {
        Args: {
          p_action: string
          p_admin_id: string
          p_pin_hash: string
          p_student_id: string
        }
        Returns: undefined
      }
      admin_update_student_access: {
        Args: {
          p_admin_id: string
          p_days: number
          p_expires_at: string
          p_op: string
          p_reason: string
          p_student_ids: string[]
        }
        Returns: number
      }
      apply_answer_changes: {
        Args: {
          p_attempt: Database["public"]["Tables"]["exam_attempts"]["Row"]
          p_changes: Json
        }
        Returns: number
      }
      approve_admission: {
        Args: {
          p_admin_id: string
          p_admission_id: string
          p_amount_bdt: number
          p_expires_at: string
          p_note: string
          p_pin_hash: string
          p_plan_id: string
          p_starts_at: string
        }
        Returns: {
          email: string
          kind: Database["public"]["Enums"]["admission_kind"]
          mobile: string
          student_id: string
        }[]
      }
      attempt_rank: {
        Args: { p_attempt_id: string }
        Returns: {
          highest: number
          participants: number
          rank_position: number
        }[]
      }
      claim_outbox: {
        Args: {
          p_kinds?: Database["public"]["Enums"]["outbox_kind"][]
          p_limit: number
        }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          done_at: string | null
          id: number
          kind: Database["public"]["Enums"]["outbox_kind"]
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          status: Database["public"]["Enums"]["outbox_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_outbox: {
        Args: { p_error?: string; p_id: number; p_ok: boolean }
        Returns: undefined
      }
      content_hashes: {
        Args: { p_items: Json }
        Returns: {
          hash: string
          idx: number
        }[]
      }
      delete_questions: {
        Args: { p_admin: string; p_ids: string[] }
        Returns: {
          image_paths: string[]
          mode: string
          question_id: string
        }[]
      }
      enforce_session_limit: {
        Args: { p_max: number; p_student_id: string }
        Returns: number
      }
      exam_phase: {
        Args: { at?: string; e: Database["public"]["Tables"]["exams"]["Row"] }
        Returns: string
      }
      exam_question_stats: {
        Args: { p_exam_id: string }
        Returns: {
          a: number
          b: number
          c: number
          correct_pct: number
          d: number
          question_id: string
          skipped: number
          total: number
        }[]
      }
      exam_summary: {
        Args: { p_exam_id: string }
        Returns: {
          avg_score: number
          late_participants: number
          max_score: number
          min_score: number
          participants: number
        }[]
      }
      finalize_attempt_if_overdue: {
        Args: { p_attempt_id: string }
        Returns: undefined
      }
      finalize_overdue_attempts: { Args: never; Returns: number }
      kick_outbox: { Args: never; Returns: number }
      log_audit: {
        Args: {
          p_action: string
          p_actor: Database["public"]["Enums"]["actor_type"]
          p_admin?: string
          p_after?: Json
          p_before?: Json
          p_entity_id?: string
          p_entity_type: string
          p_meta?: Json
          p_student?: string
        }
        Returns: undefined
      }
      log_audit_admin: {
        Args: {
          p_action: string
          p_admin: string
          p_after?: Json
          p_before?: Json
          p_entity_id: string
          p_entity_type: string
          p_meta?: Json
        }
        Returns: undefined
      }
      question_content_hash: {
        Args: {
          p_a: string
          p_b: string
          p_c: string
          p_d: string
          p_stem: string
        }
        Returns: string
      }
      random_option_order: { Args: never; Returns: string }
      reject_admission: {
        Args: {
          p_admin_id: string
          p_admission_id: string
          p_reason: string
          p_send_email: boolean
        }
        Returns: undefined
      }
      revoke_sessions: {
        Args: {
          p_admin_id?: string
          p_except_session?: string
          p_reason: string
          p_student_id?: string
        }
        Returns: number
      }
      save_answers: {
        Args: {
          p_attempt_id: string
          p_changes: Json
          p_last_index?: number
          p_student_id: string
        }
        Returns: number
      }
      score_attempt: {
        Args: {
          p_attempt_id: string
          p_final: Database["public"]["Enums"]["attempt_status"]
        }
        Returns: undefined
      }
      set_exam_audience: {
        Args: {
          p_audience: Database["public"]["Enums"]["exam_audience"]
          p_exam_id: string
          p_student_ids: string[]
        }
        Returns: number
      }
      set_exam_questions: {
        Args: { p_exam_id: string; p_question_ids: string[] }
        Returns: number
      }
      start_attempt: {
        Args: { p_exam_id: string; p_student_id: string }
        Returns: string
      }
      student_access_state: {
        Args: {
          at?: string
          s: Database["public"]["Tables"]["students"]["Row"]
        }
        Returns: string
      }
      student_exam_cards: {
        Args: { p_student_id: string }
        Returns: {
          access_mode: Database["public"]["Enums"]["access_mode"]
          attempt_id: string
          attempt_status: Database["public"]["Enums"]["attempt_status"]
          card_status: string
          chapter_label: string
          duration_minutes: number
          exam_id: string
          is_late: boolean
          late_until: string
          live_ends_at: string
          negative_mark: number
          phase: string
          question_count: number
          score: number
          starts_at: string
          title: string
          total_marks: number
        }[]
      }
      student_is_assigned: {
        Args: {
          p_exam: Database["public"]["Tables"]["exams"]["Row"]
          p_student_id: string
        }
        Returns: boolean
      }
      submit_admission: {
        Args: {
          p_email: string
          p_ip: unknown
          p_method: Database["public"]["Enums"]["payment_method"]
          p_mobile: string
          p_plan_id: string
          p_trx: string
        }
        Returns: string
      }
      submit_attempt: {
        Args: {
          p_attempt_id: string
          p_auto: boolean
          p_changes: Json
          p_student_id: string
        }
        Returns: string
      }
    }
    Enums: {
      access_mode: "fixed" | "window" | "always"
      actor_type: "admin" | "student" | "system"
      admission_kind: "new" | "renewal"
      admission_status: "pending" | "approved" | "rejected"
      attempt_status: "in_progress" | "submitted" | "auto_submitted"
      content_status: "draft" | "active" | "archived"
      credentials_status: "pending" | "sent" | "failed"
      exam_audience: "all_active" | "selected"
      exam_status: "draft" | "published" | "archived"
      option_key: "A" | "B" | "C" | "D"
      outbox_kind:
        | "email_renewal"
        | "email_rejection"
        | "email_admin_alert"
        | "sheet_admission_append"
        | "sheet_admission_update"
        | "sheet_student_upsert"
        | "sheet_result_append"
      outbox_status: "pending" | "processing" | "done" | "failed"
      payment_method: "bkash" | "nagad" | "rocket" | "bank"
      student_status: "active" | "suspended" | "cancelled"
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
    Enums: {
      access_mode: ["fixed", "window", "always"],
      actor_type: ["admin", "student", "system"],
      admission_kind: ["new", "renewal"],
      admission_status: ["pending", "approved", "rejected"],
      attempt_status: ["in_progress", "submitted", "auto_submitted"],
      content_status: ["draft", "active", "archived"],
      credentials_status: ["pending", "sent", "failed"],
      exam_audience: ["all_active", "selected"],
      exam_status: ["draft", "published", "archived"],
      option_key: ["A", "B", "C", "D"],
      outbox_kind: [
        "email_renewal",
        "email_rejection",
        "email_admin_alert",
        "sheet_admission_append",
        "sheet_admission_update",
        "sheet_student_upsert",
        "sheet_result_append",
      ],
      outbox_status: ["pending", "processing", "done", "failed"],
      payment_method: ["bkash", "nagad", "rocket", "bank"],
      student_status: ["active", "suspended", "cancelled"],
    },
  },
} as const

