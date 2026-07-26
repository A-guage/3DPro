// Scene-related types shared across layers

export interface SceneObjectInput {
  object_id?: string;
  label?: string;
  description?: string;
  priority?: number;
  estimated_size?: { x?: number; y?: number; z?: number };
  default_position?: { x?: number; y?: number; z?: number };
}

export interface SceneRequest {
  description: string;
  quality?: "low" | "medium" | "high";
  session_id?: string;
  user_id?: string;
  objects?: SceneObjectInput[];
}

export interface ObjectRequest {
  prompt: string;
  session_id?: string;
}
