// Base 3D provider interface — all backends implement this

export interface GenerationOptions {
  result_format: "GLB" | "FBX" | "OBJ" | "STL" | "USDZ" | "MP4";
  enable_pbr: boolean;
  enable_geometry: boolean;
  extra?: Record<string, unknown>;
}

export interface JobResult {
  job_id: string;
}

export interface StatusResult {
  status: "PROCESSING" | "DONE" | "FAILED" | "UNKNOWN" | string;
  model_url: string | null;
  file_type: string | null;
  raw: Record<string, unknown>;
}

export interface Base3DProvider {
  /** Human-readable name, e.g. "hunyuan", "tripo" */
  readonly name: string;

  /** Submit a text-to-3D generation job. Returns the provider job ID. */
  submit(prompt: string, options: GenerationOptions): Promise<JobResult>;

  /** Poll the status of a previously submitted job. */
  pollStatus(jobId: string): Promise<StatusResult>;

  /** Download the generated model to a local path. */
  download(modelUrl: string, destPath: string): Promise<void>;
}
