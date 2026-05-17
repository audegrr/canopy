export type TiptapMark = {
  type: string
  attrs?: Record<string, unknown>
}

export type TiptapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: TiptapMark[]
  text?: string
}

export type TiptapContent = TiptapNode[] | { type: 'doc'; content: TiptapNode[] }

export type Workspace = {
  id: string
  name: string
  icon: string
  owner_id: string
  created_at: string
  accent_color?: string
}

export type Page = {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  icon: string
  cover_url: string
  content: TiptapContent
  position: number
  is_database: boolean
  owner_id: string
  link_permission: 'none' | 'view' | 'edit'
  created_at: string
  updated_at: string
  deleted_at?: string | null
  is_locked?: boolean
  view_count?: number
}

export type SharedPage = {
  id: string
  title: string
  icon: string
  owner_id: string
  owner_name?: string | null
  permission: 'view' | 'edit'
  parent_id: string | null
  is_database?: boolean
}

export type DbField = {
  id: string
  page_id: string
  name: string
  type: 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'checkbox' | 'relation' | 'rollup' | 'url' | 'email' | 'phone'
  options: any[]
  relation_page_id: string | null
  rollup_field_id: string | null
  rollup_relation: string | null
  rollup_field: string | null
  rollup_fn: string | null
  relation_column_id: string | null
  position: number
  hidden_from_viewers?: boolean
}

export type DbRecord = {
  id: string
  page_id: string
  data: Record<string, any>
  position: number
  created_at: string
}

export type User = {
  id: string
  email: string
  name: string
}

export type MemberWorkspace = Workspace & {
  _memberRole: 'member' | 'viewer' | 'owner'
}

export type WsMember = {
  id: string
  workspace_id: string
  user_id: string
  role: 'member' | 'viewer' | 'owner'
  profile: { id: string; email: string; full_name: string | null } | null
}

export type Notification = {
  id: string
  user_id: string
  type: string
  title: string
  body?: string
  read: boolean
  created_at: string
  data?: {
    page_id?: string
    workspace_id?: string
    workspace_name?: string
    [key: string]: unknown
  }
}
