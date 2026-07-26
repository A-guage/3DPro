// Tencent Hunyuan 3D provider — Node.js port of hunyuan_client.py
// SDK reference: tencentcloud-sdk-nodejs CommonClient

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig } from "../config.js";
import type { Base3DProvider, GenerationOptions, JobResult, StatusResult } from "./base.js";
import { logApiCall, logApiResult, logApiError, debug, warn } from "../mcp/logger.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Lazy-loaded SDK
let _CommonClient: any = null;

async function loadSdk() {
  if (_CommonClient) return;
  const mod = await import("tencentcloud-sdk-nodejs/tencentcloud/common/common_client.js");
  _CommonClient = (mod as any).CommonClient;
}

export class HunyuanProvider implements Base3DProvider {
  readonly name = "hunyuan";
  private client: any = null;

  private async getClient(): Promise<any> {
    if (this.client) return this.client;

    const config = loadConfig();
    const hc = config.providers.hunyuan;
    if (!hc) throw new Error("Hunyuan provider not configured in config.yaml");

    await loadSdk();

    debug("hunyuan", `Creating client: endpoint=${hc.endpoint} version=${hc.version} region=${hc.region}`);

    // CommonClient(endpoint, version, { credential, region })
    this.client = new _CommonClient(
      hc.endpoint,  // "ai3d.tencentcloudapi.com"
      hc.version,   // "2025-05-13"
      {
        credential: {
          secretId: hc.secretId,
          secretKey: hc.secretKey,
        },
        region: hc.region,  // "ap-guangzhou"
      },
    );

    debug("hunyuan", "Client created successfully");
    return this.client;
  }

  private async callApi(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = await this.getClient();
    logApiCall("hunyuan", action, params);
    const t0 = Date.now();

    try {
      const resp: Record<string, unknown> = await client.request(action, params);
      logApiResult("hunyuan", action, resp, Date.now() - t0);
      return resp;
    } catch (err: any) {
      logApiError("hunyuan", action, err, Date.now() - t0);
      throw err;
    }
  }

  async submit(prompt: string, options: GenerationOptions): Promise<JobResult> {
    const config = loadConfig();
    const hc = config.providers.hunyuan!;
    const params: Record<string, unknown> = {
      Prompt: prompt,
      ResultFormat: options.result_format,
      EnablePBR: options.enable_pbr,
      EnableGeometry: options.enable_geometry,
      ...options.extra,
    };

    debug("hunyuan", `Submit: prompt="${prompt.slice(0, 80)}..." format=${options.result_format} PBR=${options.enable_pbr}`);

    const resp = await this.callApi(hc.createAction, params);
    const jobId = resp.JobId as string | undefined;
    if (!jobId) {
      warn("hunyuan", `Submit response missing JobId`, resp);
      throw new Error(`Submit response missing JobId: ${JSON.stringify(resp)}`);
    }

    debug("hunyuan", `Submit success: JobId=${jobId}`);
    return { job_id: jobId };
  }

  async pollStatus(jobId: string): Promise<StatusResult> {
    const config = loadConfig();
    const hc = config.providers.hunyuan!;
    const resp = await this.callApi(hc.statusAction, { JobId: jobId });

    const status = (resp.Status as string) ?? "UNKNOWN";
    const errorMessage = resp.ErrorMessage as string | undefined;
    const resultFiles = (resp.ResultFile3Ds as Array<Record<string, string>>) ?? [];

    let modelUrl: string | null = null;
    let fileType: string | null = null;

    for (const file of resultFiles) {
      fileType = file.Type ?? fileType;
      if (file.Url) {
        modelUrl = file.Url;
        break;
      }
    }
    if (!modelUrl && resultFiles.length > 0) {
      modelUrl = resultFiles[0].Url ?? null;
    }

    debug("hunyuan", `PollStatus: JobId=${jobId} status=${status} files=${resultFiles.length} url=${modelUrl ?? "none"} error=${errorMessage ?? "none"}`);

    return {
      status,
      model_url: modelUrl,
      file_type: fileType,
      raw: { ...resp, error_message: errorMessage },
    };
  }

  async download(modelUrl: string, destPath: string): Promise<void> {
    const dir = dirname(destPath);
    mkdirSync(dir, { recursive: true });

    debug("hunyuan", `Download: url=${modelUrl.slice(0, 100)}... dest=${destPath}`);
    const t0 = Date.now();

    const resp = await fetch(modelUrl);
    if (!resp.ok) {
      warn("hunyuan", `Download failed: ${resp.status} ${resp.statusText}`);
      throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    writeFileSync(destPath, buffer);

    debug("hunyuan", `Download complete: ${buffer.length} bytes in ${Date.now() - t0}ms → ${destPath}`);
  }
}
