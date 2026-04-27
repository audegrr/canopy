export type Workspace = {
  id: string
  name: string
  icon: string
  owner_id: string
  created_at: string
}

export type Page = {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  icon: string
  cover_url: string
  content: any
  position: number
  is_database: boolean
  owner_id: string
  link_permission: 'none' | 'view' | 'edit'
  created_at: string
  updated_at: string
}

export type SharedPage = {
  id: string
  title: string
  icon: string
  owner_id: string
  permission: 'view' | 'edit'
  parent_id: string | null
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
