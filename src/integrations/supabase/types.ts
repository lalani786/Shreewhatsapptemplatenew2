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
  public: {
    Tables: {
      analytics_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_type: string
          id: string
          message_id: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      api_credentials: {
        Row: {
          created_at: string
          elevenlabs_api_key: string | null
          fal_key: string | null
          gemini_api_key: string | null
          id: string
          leonardo_api_key: string | null
          meta_app_id: string | null
          nvidia_api_key: string | null
          pexels_api_key: string | null
          stability_api_key: string | null
          updated_at: string
          user_id: string
          whatsapp_access_token: string | null
          whatsapp_api_version: string | null
          whatsapp_business_account_id: string | null
          whatsapp_phone_id: string | null
        }
        Insert: {
          created_at?: string
          elevenlabs_api_key?: string | null
          fal_key?: string | null
          gemini_api_key?: string | null
          id?: string
          leonardo_api_key?: string | null
          meta_app_id?: string | null
          nvidia_api_key?: string | null
          pexels_api_key?: string | null
          stability_api_key?: string | null
          updated_at?: string
          user_id: string
          whatsapp_access_token?: string | null
          whatsapp_api_version?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_id?: string | null
        }
        Update: {
          created_at?: string
          elevenlabs_api_key?: string | null
          fal_key?: string | null
          gemini_api_key?: string | null
          id?: string
          leonardo_api_key?: string | null
          meta_app_id?: string | null
          nvidia_api_key?: string | null
          pexels_api_key?: string | null
          stability_api_key?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_access_token?: string | null
          whatsapp_api_version?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_id?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          contact_ids: string[] | null
          created_at: string
          delivered_count: number | null
          id: string
          message_content: string
          name: string
          read_count: number | null
          scheduled_at: string | null
          sent_count: number | null
          social_platforms: string[] | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_ids?: string[] | null
          created_at?: string
          delivered_count?: number | null
          id?: string
          message_content: string
          name: string
          read_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          social_platforms?: string[] | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_ids?: string[] | null
          created_at?: string
          delivered_count?: number | null
          id?: string
          message_content?: string
          name?: string
          read_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          social_platforms?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      edge_functions: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          name: string
          source_code: string | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          name: string
          source_code?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          name?: string
          source_code?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          contact_id: string | null
          content: string
          created_at: string
          direction: string
          id: string
          message_type: string
          status: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          content: string
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          status?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          content?: string
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_videos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          slug: string
          storage_path: string | null
          title: string
          user_id: string
          video_url: string
          view_count: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          slug: string
          storage_path?: string | null
          title: string
          user_id: string
          video_url: string
          view_count?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          slug?: string
          storage_path?: string | null
          title?: string
          user_id?: string
          video_url?: string
          view_count?: number
        }
        Relationships: []
      }
      social_media_credentials: {
        Row: {
          created_at: string | null
          facebook_page_access_token: string | null
          facebook_page_id: string | null
          id: string
          instagram_access_token: string | null
          instagram_business_account_id: string | null
          instagram_user_id: string | null
          telegram_bot_token: string | null
          telegram_channel_id: string | null
          updated_at: string | null
          user_id: string
          x_access_token: string | null
          x_access_token_secret: string | null
          x_api_key: string | null
          x_api_secret: string | null
          x_bearer_token: string | null
          youtube_access_token: string | null
          youtube_channel_id: string | null
          youtube_channel_name: string | null
          youtube_refresh_token: string | null
        }
        Insert: {
          created_at?: string | null
          facebook_page_access_token?: string | null
          facebook_page_id?: string | null
          id?: string
          instagram_access_token?: string | null
          instagram_business_account_id?: string | null
          instagram_user_id?: string | null
          telegram_bot_token?: string | null
          telegram_channel_id?: string | null
          updated_at?: string | null
          user_id: string
          x_access_token?: string | null
          x_access_token_secret?: string | null
          x_api_key?: string | null
          x_api_secret?: string | null
          x_bearer_token?: string | null
          youtube_access_token?: string | null
          youtube_channel_id?: string | null
          youtube_channel_name?: string | null
          youtube_refresh_token?: string | null
        }
        Update: {
          created_at?: string | null
          facebook_page_access_token?: string | null
          facebook_page_id?: string | null
          id?: string
          instagram_access_token?: string | null
          instagram_business_account_id?: string | null
          instagram_user_id?: string | null
          telegram_bot_token?: string | null
          telegram_channel_id?: string | null
          updated_at?: string | null
          user_id?: string
          x_access_token?: string | null
          x_access_token_secret?: string | null
          x_api_key?: string | null
          x_api_secret?: string | null
          x_bearer_token?: string | null
          youtube_access_token?: string | null
          youtube_channel_id?: string | null
          youtube_channel_name?: string | null
          youtube_refresh_token?: string | null
        }
        Relationships: []
      }
      social_media_posts: {
        Row: {
          campaign_id: string | null
          comments_count: number | null
          content: string | null
          created_at: string | null
          error_message: string | null
          id: string
          likes_count: number | null
          media_type: string | null
          media_url: string | null
          platform: string
          platform_post_id: string | null
          platform_url: string | null
          post_type: string | null
          posted_at: string | null
          scheduled_for: string | null
          shares_count: number | null
          status: string
          user_id: string
          views_count: number | null
        }
        Insert: {
          campaign_id?: string | null
          comments_count?: number | null
          content?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          platform: string
          platform_post_id?: string | null
          platform_url?: string | null
          post_type?: string | null
          posted_at?: string | null
          scheduled_for?: string | null
          shares_count?: number | null
          status?: string
          user_id: string
          views_count?: number | null
        }
        Update: {
          campaign_id?: string | null
          comments_count?: number | null
          content?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          platform?: string
          platform_post_id?: string | null
          platform_url?: string | null
          post_type?: string | null
          posted_at?: string | null
          scheduled_for?: string | null
          shares_count?: number | null
          status?: string
          user_id?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_media_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          business_type: string | null
          category: string | null
          content: string
          created_at: string
          id: string
          image_prompt: string | null
          name: string
          occasion: string | null
          user_id: string
        }
        Insert: {
          business_type?: string | null
          category?: string | null
          content: string
          created_at?: string
          id?: string
          image_prompt?: string | null
          name: string
          occasion?: string | null
          user_id: string
        }
        Update: {
          business_type?: string | null
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          image_prompt?: string | null
          name?: string
          occasion?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      social_media_analytics: {
        Row: {
          failed_posts: number | null
          platform: string | null
          post_date: string | null
          successful_posts: number | null
          total_comments: number | null
          total_likes: number | null
          total_posts: number | null
          total_shares: number | null
          total_views: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
