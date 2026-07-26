import sys
import io
# Windows GBK 编码修复：强制 stdout/stderr 使用 UTF-8
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from typing import List, Optional
from pathlib import Path
from pydantic import BaseModel, Field
import re
from urllib.parse import quote
import requests
import json
import os
from dotenv import load_dotenv

# Load .env file
load_dotenv(Path(__file__).parent / ".env")

from hunyuan_client import create_3d_job, get_3d_job_status
from deepseek_client import DEEPSEEK_API_KEY
from schemas import (
    UserRequest,
    Generate3DResponse,
    TaskStatusResponse,
    GenerateSceneRequest,
    GenerateSceneResponse,
    SceneStatusResponse,
    SceneHistoryItem,
    HistoryDetail,
    ImportToEngineRequest,
    ImportToEngineResponse,
    ImportToUnityRequest,
    ImportToUnityResponse,
    ChatSessionSaveRequest,
    ChatSessionResponse,
    SessionDetailResponse,
    GenerateObjectRequest,
)
from scene_generator import generate_scene, refresh_scene_status, download_scene_file, download_object_file
from history_models import (
    init_db, 
    get_history_list, 
    get_history_detail,
    save_chat_session,
    get_chat_sessions,
    get_session_detail,
    delete_chat_session,
    rename_chat_session,
    create_object_record,
    update_object_status,
    get_object_record,
)
from ue_integration import ue_integration, execute_ue_command, check_bridge_status, mcp_import_model

app = FastAPI(title="3D 场景生成器 API")

# 全局存储最近一次 Agent 的 cwd（UE 项目目录）
_current_cwd: Optional[str] = None

# 全局存储最近一次 Agent 的 cwd（UE 项目目录）
_current_cwd: Optional[str] = None

# 全局存储最近一次 Agent 的 cwd（UE 项目目录）
_current_cwd: Optional[str] = None

# 全局存储最近一次 Agent 的 cwd（UE 项目目录）
_current_cwd: Optional[str] = None


@app.on_event("startup")
def on_startup() -> None:
    init_db()


# ===== ChatSession API =====

@app.post("/api/sessions", response_model=dict)
async def api_save_session(request: ChatSessionSaveRequest):
    try:
        save_chat_session(
            session_id=request.session_id,
            user_id=request.user_id,
            title=request.title,
            messages=request.messages
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions", response_model=List[ChatSessionResponse])
async def api_get_sessions(user_id: str = Query(...)):
    try:
        sessions = get_chat_sessions(user_id)
        return [
            ChatSessionResponse(
                session_id=s.session_id,
                title=s.title,
                created_at=s.created_at.isoformat(),
                updated_at=s.updated_at.isoformat()
            )
            for s in sessions
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}", response_model=SessionDetailResponse)
async def api_session_detail(request: Request, session_id: str):
    try:
        detail = get_session_detail(session_id)

        session_info = detail.get("session")
        if session_info and isinstance(session_info, dict):
            created_at = session_info.get("created_at")
            updated_at = session_info.get("updated_at")
            if hasattr(created_at, "isoformat"):
                session_info["created_at"] = created_at.isoformat()
            if hasattr(updated_at, "isoformat"):
                session_info["updated_at"] = updated_at.isoformat()

        scenes_payload = []
        for scene in detail.get("scenes", []):
            scenes_payload.append(
                {
                    "scene_id": getattr(scene, "scene_id", None),
                    "session_id": getattr(scene, "session_id", None),
                    "user_id": getattr(scene, "user_id", None),
                    "description": getattr(scene, "description", None),
                    "quality": getattr(scene, "quality", None),
                    "status": getattr(scene, "status", None),
                    "model_url": getattr(scene, "model_url", None),
                    "error_message": getattr(scene, "error_message", None),
                    "created_at": scene.created_at.isoformat() if hasattr(scene.created_at, "isoformat") else scene.created_at,
                    "updated_at": scene.updated_at.isoformat() if hasattr(scene.updated_at, "isoformat") else scene.updated_at,
                }
            )

        objects_payload = []
        for obj in detail.get("objects", []):
            model_url = getattr(obj, "model_url", None)
            if model_url:
                model_url = str(request.url_for("api_object_file", object_id=obj.object_id))
            objects_payload.append(
                {
                    "object_id": getattr(obj, "object_id", None),
                    "object_name": getattr(obj, "object_name", None),
                    "status": getattr(obj, "status", None),
                    "model_url": model_url,
                    "created_at": obj.created_at.isoformat() if hasattr(obj.created_at, "isoformat") else obj.created_at,
                    "session_id": getattr(obj, "session_id", None),
                    "scene_id": getattr(obj, "scene_id", None),
                }
            )

        return {
            "session": session_info,
            "scenes": scenes_payload,
            "objects": objects_payload,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/sessions/{session_id}", response_model=dict)
async def api_delete_session(session_id: str):
    try:
        deleted = delete_chat_session(session_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/sessions/{session_id}/title", response_model=dict)
async def api_rename_session(session_id: str, body: dict):
    try:
        new_title = body.get("new_title")
        updated = rename_chat_session(session_id, new_title)
        if not updated:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== 物品生成 API =====

@app.post("/api/generate-object", response_model=dict)
async def api_generate_object(request: GenerateObjectRequest):
    """
    创建单个 3D 物品生成任务。
    """
    try:
        # 调用混元生3D接口
        task_id = create_3d_job(
            prompt=f"{request.name}: {request.description}",
            result_format="FBX"
        )
        
        # 记录到数据库，关联 Session
        create_object_record(
            session_id=request.session_id,
            object_id=task_id,
            object_name=request.name,
            status="processing"
        )
        
        return {"task_id": task_id, "status": "processing"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/object-status/{object_id}", response_model=dict)
async def api_object_status(request: Request, object_id: str):
    """
    查询单个物品生成状态。
    """
    try:
        status_data = get_3d_job_status(object_id)
        raw_status = status_data["status"]
        model_url = status_data.get("model_url")
        
        status_map = {
            "DONE": "ready",
            "PROCESSING": "processing",
            "FAILED": "failed"
        }
        
        final_status = status_map.get(raw_status.upper(), "processing")
        
        # 更新数据库
        update_object_status(object_id, final_status, model_url)

        proxy_url = None
        if final_status == "ready" and model_url:
            proxy_url = str(request.url_for("api_object_file", object_id=object_id))
        
        return {
            "object_id": object_id,
            "status": final_status,
            "model_url": proxy_url or model_url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/object-file/{object_id}")
async def api_object_file(object_id: str, download: bool = Query(False)):
    record = get_object_record(object_id)
    if not record:
        raise HTTPException(status_code=404, detail="Object record not found")

    storage_dir = Path(__file__).resolve().parent / "storage" / "object_files"
    storage_dir.mkdir(parents=True, exist_ok=True)

    def detect_format_and_ext(file_path: Path) -> tuple[str, str]:
        with file_path.open("rb") as f:
            header = f.read(24)
        if header[:20] == b"Kaydara FBX Binary  ":
            return ("model/fbx", ".fbx")
        if header[:3] == b"FBX":
            return ("model/fbx", ".fbx")
        if header[:4] == b"\x89GL":
            return ("model/gltf-binary", ".glb")
        if header[:4] == b"OBJ":
            return ("model/obj", ".obj")
        if header[:4] == b"STL":
            return ("model/stl", ".stl")
        return ("application/octet-stream", ".bin")

    raw_name = (getattr(record, "object_name", None) or object_id).strip()
    safe_name = re.sub(r'[\\/:*?"<>|]+', "_", raw_name)
    safe_name = safe_name.replace("\n", " ").replace("\r", " ").strip()
    if not safe_name:
        safe_name = object_id
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", safe_name).strip("_")
    if not ascii_name:
        ascii_name = object_id

    local_path = getattr(record, "local_path", None)

    def _detect_ext_from_url(url: str) -> str:
        url_lower = url.lower().split("?")[0]
        for e in ("fbx", "glb", "gltf", "obj", "stl", "usdz"):
            if url_lower.endswith("." + e):
                return "." + e
        return ".fbx"

    def _find_cached_file(object_id_: str) -> Path | None:
        for ext in (".cached", ".fbx", ".glb", ".gltf", ".obj", ".stl"):
            p = storage_dir / f"{object_id_}{ext}"
            if p.exists() and p.stat().st_size > 0:
                return p
        return None

    file_path = None
    if local_path and os.path.exists(local_path):
        file_path = Path(local_path)
    else:
        cached_file = _find_cached_file(object_id)
        if cached_file:
            file_path = cached_file
    if not file_path and record.model_url:
        url = str(record.model_url).strip()
        tmp_path = storage_dir / f"{object_id}.part"
        try:
            upstream = requests.get(url, stream=True, timeout=60)
            if upstream.ok:
                with tmp_path.open("wb") as f:
                    for chunk in upstream.iter_content(chunk_size=1024 * 256):
                        if chunk:
                            f.write(chunk)
                detected_ext = _detect_ext_from_url(url)
                cached_path = storage_dir / f"{object_id}{detected_ext}"
                tmp_path.replace(cached_path)
                file_path = cached_path
        except Exception:
            pass
        finally:
            upstream.close()

    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Model file not found locally")

    detected_ext = ""
    detected_media = "application/octet-stream"
    detected_ext, detected_media = detect_format_and_ext(file_path)

    ascii_filename = f"{ascii_name}{detected_ext}"
    filename_star = quote(ascii_filename, safe="")

    headers = {
        "Content-Disposition": f'{"attachment" if download else "inline"}; filename="{ascii_filename}"; filename*=UTF-8\'\'{filename_star}',
    }
    return FileResponse(
        path=str(file_path),
        media_type=detected_media,
        headers=headers,
    )


# 允许前端跨域（默认允许本地开发前端）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "3D 场景生成器 API"}


# ===== 兼容旧的 /generate-3d 接口（可选保留） =====

@app.post("/generate-3d", response_model=Generate3DResponse)
async def generate_3d_model(request: UserRequest) -> Generate3DResponse:
    """
    创建腾讯混元生3D极速版任务（兼容旧接口）。

    文档参考：
    - https://cloud.tencent.com/document/product/1804/123463
    """
    try:
        task_id = create_3d_job(
            prompt=request.text,
            result_format=request.result_format or "FBX",
            enable_pbr=request.enable_pbr,
            enable_geometry=request.enable_geometry,
        )
        return Generate3DResponse(task_id=task_id, status="processing")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/task-status/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str) -> TaskStatusResponse:
    """
    查询腾讯混元生3D极速版任务状态（兼容旧接口）。

    文档参考：
    - https://cloud.tencent.com/document/product/1804/123464
    """
    try:
        status_data = get_3d_job_status(task_id)
        raw_status = status_data["status"]

        if raw_status.upper() == "DONE":
            return TaskStatusResponse(status="ready", model_url=status_data.get("model_url"))

        return TaskStatusResponse(status=raw_status.lower(), model_url=status_data.get("model_url"))

    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


# ===== 按 needs 需求定义的新接口 =====

@app.post("/api/generate-scene", response_model=GenerateSceneResponse)
async def api_generate_scene(body: GenerateSceneRequest) -> GenerateSceneResponse:
    """
    一键生成完整 3D 场景任务。

    流程：
    1. 使用 DeepSeek 优化中文场景描述
    2. 调用腾讯混元生3D极速版创建 3D 任务（GLB）
    3. 返回 scene_id，前端据此轮询状态并下载模型
    """
    try:
        task = generate_scene(description=body.description, quality=body.quality, user_id=body.user_id)
        return GenerateSceneResponse(
            scene_id=task.scene_id,
            status=task.status,
            estimated_time=task.estimated_time,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/status/{scene_id}", response_model=SceneStatusResponse)
async def api_scene_status(request: Request, scene_id: str) -> SceneStatusResponse:
    """
    查看场景生成状态。

    返回示例：
    {
      "scene_id": "abc123",
      "status": "processing" | "ready" | "failed",
      "model_url": "https://..."
    }
    """
    try:
        task = refresh_scene_status(scene_id)
        model_url = None
        if task.status == "ready":
            model_url = str(request.url_for("api_download_scene", scene_id=scene_id))
            task.model_url = model_url
        objects = []
        current_object = None
        for obj in task.objects:
            objects.append(
                {
                    "object_id": obj.object_id,
                    "status": obj.status,
                    "model_url": obj.model_url,
                }
            )
            if current_object is None and obj.status == "processing":
                current_object = obj.object_id
        return SceneStatusResponse(
            scene_id=task.scene_id,
            status=task.status,
            model_url=model_url,
            error_message=task.error_message,
            progress=task.progress,
            objects=objects,
            current_object=current_object,
        )
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/history", response_model=list[SceneHistoryItem])
async def api_history_list(user_id: str = Query(...)) -> list[SceneHistoryItem]:
    try:
        records = get_history_list(user_id=user_id, limit=20)
        return [
            SceneHistoryItem(
                scene_id=r.scene_id,
                description=r.description,
                quality=r.quality,
                status=r.status,
                model_url=r.model_url,
                error_message=r.error_message,
                created_at=r.created_at.isoformat(),
                updated_at=r.updated_at.isoformat(),
            )
            for r in records
        ]
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/history/{scene_id}", response_model=HistoryDetail)
async def api_history_detail(scene_id: str) -> HistoryDetail:
    try:
        scene, objects = get_history_detail(scene_id)
        if scene is None:
            raise HTTPException(status_code=404, detail="Scene history not found")
        return HistoryDetail(
            scene=SceneHistoryItem(
                scene_id=scene.scene_id,
                description=scene.description,
                quality=scene.quality,
                status=scene.status,
                model_url=scene.model_url,
                error_message=scene.error_message,
                created_at=scene.created_at.isoformat(),
                updated_at=scene.updated_at.isoformat(),
            ),
            objects=[
                {
                    "object_id": o.object_id,
                    "status": o.status,
                    "model_url": o.model_url,
                }
                for o in objects
            ],
        )
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/download/{scene_id}")
async def api_download_scene(scene_id: str) -> FileResponse:
    """
    下载生成好的 GLB 模型文件。
    """
    try:
        return download_scene_file(scene_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/objects/{scene_id}/{object_id}")
async def api_download_object(scene_id: str, object_id: str) -> FileResponse:
    try:
        return download_object_file(scene_id, object_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


# ===== UE 集成 API =====

@app.post("/api/import-to-ue", response_model=ImportToEngineResponse)
async def api_import_to_ue(request: ImportToEngineRequest) -> ImportToEngineResponse:
    """
    将生成的 3D 场景导入到 UE 项目

    请求体:
    - sceneUrl: 场景文件 URL
    - sceneId: 场景 ID
    - enginePath: UE 项目路径（可选）

    响应:
    - success: 是否成功
    - message: 结果消息
    - filePath: 导入的文件路径
    """
    try:
        result = ue_integration.import_scene_to_ue(
            scene_url=request.sceneUrl,
            scene_id=request.sceneId,
            ue_path=request.enginePath
        )

        return ImportToEngineResponse(
            success=result["success"],
            message=result["message"],
            filePath=result.get("filePath")
        )

    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


# 兼容旧的 Unity 路由
@app.post("/api/import-to-unity", response_model=ImportToUnityResponse)
async def api_import_to_unity_compat(request: ImportToUnityRequest) -> ImportToUnityResponse:
    """兼容旧接口，实际调用 UE 导入"""
    return await api_import_to_ue(ImportToEngineRequest(
        sceneUrl=request.sceneUrl,
        sceneId=request.sceneId,
        enginePath=request.enginePath,
    ))


@app.post("/api/generate-engine-script")
async def api_generate_engine_script(request: dict) -> dict:
    """
    生成 UE 蓝图/Python 脚本提示

    请求体:
    - sceneDescription: 场景描述
    - quality: 生成质量
    - scriptType: 脚本类型（scene_controller, object_behavior）
    """
    try:
        scene_description = request.get("sceneDescription", "")
        quality = request.get("quality", "medium")
        script_type = request.get("scriptType", "scene_controller")

        # UE 使用 Python Editor Scripting 或蓝图
        script_templates = {
            "scene_controller": '''import unreal

def setup_scene():
    """UE 场景控制器脚本"""
    editor_level_lib = unreal.EditorLevelLibrary()
    editor_asset_lib = unreal.EditorAssetLibrary()
    
    # 获取当前关卡
    current_level = editor_level_lib.get_current_level()
    print(f"当前关卡: {current_level.get_name()}")
    
    # 设置游戏模式
    print("场景已初始化")

setup_scene()
''',
            "object_behavior": '''import unreal

def setup_actor():
    """UE 对象行为脚本"""
    editor_level_lib = unreal.EditorLevelLibrary()
    selected_actors = editor_level_lib.get_selected_level_actors()
    
    for actor in selected_actors:
        print(f"已选择: {actor.get_name()}")
        # 添加组件或修改属性

setup_actor()
'''
        }

        script_content = script_templates.get(
            script_type,
            script_templates["scene_controller"]
        )

        return {
            "success": True,
            "scriptType": script_type,
            "content": script_content,
            "fileName": f"{script_type}.py"
        }

    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


# 兼容旧的 Unity 脚本生成路由
@app.post("/api/generate-unity-script")
async def api_generate_unity_script_compat(request: dict) -> dict:
    """兼容旧接口"""
    return await api_generate_engine_script(request)


@app.get("/api/ue-status")
async def api_ue_status() -> dict:
    """
    检查 UE 插件和项目状态
    """
    try:
        info = ue_integration.get_project_info()
        return info
    except Exception as e:  # noqa: BLE001
        return {
            "project_found": False,
            "plugin_available": False,
            "message": f"检查失败: {str(e)}"
        }


# 兼容旧路由
@app.get("/api/unity-status")
async def api_unity_status_compat() -> dict:
    """兼容旧接口"""
    return await api_ue_status()


class ConsoleErrorsRequest(BaseModel):
    log_type: str = "Error"
    clear_after_read: bool = True


@app.post("/api/ue/console-errors")
async def api_ue_console_errors(request: ConsoleErrorsRequest) -> dict:
    """
    获取 UE 输出日志中的错误和警告

    UE 优势：即使有编译错误，日志文件仍然可读。

    请求体:
    - log_type: "Error"(仅错误), "Warning"(仅警告), "All"(全部)，默认 "Error"
    - clear_after_read: UE 日志文件是追加模式，此参数对文件读取无效，仅对插件API有效

    响应:
    - success: 是否成功获取
    - has_errors: 是否有错误
    - errors: 错误列表 [{type, message, file, line}]
    - has_warnings: 是否有警告
    - warnings: 警告列表
    - error_count: 错误数量
    - warning_count: 警告数量
    - source: 数据来源 ("ue_plugin" 或 "output_log")
    """
    try:
        result = ue_integration.get_output_log_errors(
            log_type=request.log_type,
        )
        return result

    except Exception as e:  # noqa: BLE001
        return {
            "success": False,
            "has_errors": False,
            "errors": [],
            "has_warnings": False,
            "warnings": [],
            "error_count": 0,
            "warning_count": 0,
            "message": f"获取 UE 日志失败: {str(e)}"
        }


# 兼容旧路由
@app.post("/api/unity/console-errors")
async def api_unity_console_errors_compat(request: ConsoleErrorsRequest) -> dict:
    """兼容旧接口"""
    return await api_ue_console_errors(request)


# ===== UE 命令桥接 API =====

class UEExecutePythonRequest(BaseModel):
    code: str = Field(..., description="要在 UE 中执行的 Python 代码")
    ue_project_path: Optional[str] = Field(None, description="UE 项目 .uproject 文件路径（可选，不填则自动搜索）")
    timeout: int = Field(300, description="等待执行结果的最大时间（秒，默认300）")


@app.post("/api/ue/execute-python")
async def api_ue_execute_python(request: UEExecutePythonRequest) -> dict:
    """
    通过命令桥接在 UE 中自动执行 Python 代码。

    前置条件：UE 编辑器中需要先运行 ue_command_bridge.py 启动命令桥接。

    请求体：
    - code: Python 代码字符串
    - ue_project_path: UE 项目路径（可选）
    - timeout: 超时时间（秒，默认 60）

    响应：
    - success: 是否成功
    - output: 执行输出
    - error: 错误信息
    - execution_time: 执行耗时（秒）
    """
    try:
        result = execute_ue_command(
            python_code=request.code,
            ue_project_path=request.ue_project_path,
            timeout=request.timeout,
        )
        return result
    except Exception as e:
        return {
            "success": False,
            "output": "",
            "error": str(e),
            "execution_time": 0,
        }


@app.get("/api/ue/bridge-status")
async def api_ue_bridge_status() -> dict:
    """
    检查 UE 命令桥接是否正在运行。
    """
    return check_bridge_status()


@app.post("/api/ue/diagnose")
async def api_ue_diagnose() -> dict:
    """
    通过桥接在 UE 中运行环境诊断代码，返回资产系统和场景状态。
    Agent 可以调用此接口来了解 UE 中有哪些可用资产、当前场景有什么物体。
    """
    diagnostic_code = """
import json as _json

info = {}

# 1. 项目信息
try:
    info["project"] = unreal.Paths.project_dir()
    info["project_name"] = unreal.Paths.get_base_filename()
except Exception as e:
    info["project_error"] = str(e)

# 2. 资产注册表状态
try:
    ar = unreal.AssetRegistryHelpers.get_asset_registry()
    info["asset_registry_ready"] = not ar.is_loading_assets()
    info["asset_count"] = ar.get_assets_count()
except Exception as e:
    info["asset_registry_error"] = str(e)

# 3. 当前关卡和场景中的 Actor
try:
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    current_level = les.get_current_level()
    if current_level:
        actors = unreal.EditorLevelLibrary.get_all_level_actors()
        info["level_name"] = current_level.get_outer().get_name()
        info["actor_count"] = len(actors)
        info["actors"] = []
        for a in actors[:50]:  # 最多返回50个
            info["actors"].append({
                "name": a.get_name(),
                "class": a.get_class().get_name(),
                "location": str(a.get_actor_location()),
            })
except Exception as e:
    info["level_error"] = str(e)

# 4. Content 目录结构（仅顶层）
try:
    ar2 = unreal.AssetRegistryHelpers.get_asset_registry()
    dirs = ar2.get_all_root_content_paths()
    info["content_dirs"] = sorted([str(d) for d in dirs])[:30]
except Exception as e:
    info["content_dirs_error"] = str(e)

# 5. Imports 目录下的资产（模型导入目录）
try:
    ar3 = unreal.AssetRegistryHelpers.get_asset_registry()
    imports_assets = ar3.get_assets_by_path(unreal.DirectoryPath("/Game/Imports"), recursive=True, include_folder=False)
    info["imports_assets"] = [str(a.asset_path) for a in imports_assets]
    info["imports_count"] = len(imports_assets)
except Exception as e:
    info["imports_error"] = str(e)

print(_json.dumps(info, ensure_ascii=False, indent=2, default=str))
"""
    result = execute_ue_command(python_code=diagnostic_code, timeout=30)
    if result["success"] and result["output"]:
        try:
            # 尝试从输出中解析 JSON 诊断结果
            lines = result["output"].strip().split("\n")
            # 找到 JSON 部分
            json_lines = []
            in_json = False
            for line in lines:
                if line.strip().startswith("{"):
                    in_json = True
                if in_json:
                    json_lines.append(line)
                if line.strip().endswith("}"):
                    break
            if json_lines:
                diag = json.loads("\n".join(json_lines))
                return {
                    "success": True,
                    "diagnosis": diag,
                    "raw_output": result["output"],
                }
        except json.JSONDecodeError:
            pass
    return {
        "success": False,
        "diagnosis": None,
        "error": result.get("error", "诊断执行失败"),
        "raw_output": result.get("output", ""),
    }


# ===== Chat Proxy API (DeepSeek) =====
from typing import Optional, List
from deepseek_client import DEEPSEEK_API_KEY

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "deepseek-chat"
    temperature: float = 0.7
    max_tokens: int = 4000

class ChatResponse(BaseModel):
    content: str
    reasoning: Optional[str] = None
    success: bool = True
    error: Optional[str] = None

@app.post("/api/chat", response_model=ChatResponse)
async def api_chat(request: ChatRequest) -> ChatResponse:
    """
    DeepSeek 聊天代理接口 - 前端无需 API Key
    """
    if not DEEPSEEK_API_KEY:
        return ChatResponse(
            content="",
            success=False,
            error="DeepSeek API Key not configured. Please set DEEPSEEK_API_KEY in .env file"
        )
    
    try:
        import json
        url = "https://api.deepseek.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": request.model,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "stream": False,
        }
        
        resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=120)
        resp.raise_for_status()
        data = resp.json()
        
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        reasoning = data.get("choices", [{}])[0].get("message", {}).get("reasoning_content")
        
        return ChatResponse(
            content=content,
            reasoning=reasoning,
            success=True
        )
    except Exception as e:
        return ChatResponse(
            content="",
            success=False,
            error=str(e)
        )


@app.get("/api/config")
async def api_config() -> dict:
    """
    返回前端配置信息
    """
    return {
        "deepseekConfigured": bool(DEEPSEEK_API_KEY),
        "tencentConfigured": bool(os.getenv("TENCENT_SECRET_ID") and os.getenv("TENCENT_SECRET_KEY")),
        "agentEnabled": os.getenv("AGENT_ENABLED", "true").lower() == "true",
    }


# ===== Agent Proxy API (SSE) =====

AGENT_SERVICE_URL = os.getenv("AGENT_SERVICE_URL", "http://localhost:3001")

class AgentSessionRequest(BaseModel):
    sessionId: Optional[str] = None
    cwd: Optional[str] = None

class AgentChatRequest(BaseModel):
    sessionId: str
    message: str
    cwd: Optional[str] = None


@app.post("/api/agent/session")
async def agent_create_session(request: AgentSessionRequest):
    """创建 Agent 会话"""
    try:
        resp = requests.post(
            f"{AGENT_SERVICE_URL}/api/session",
            json={"sessionId": request.sessionId, "cwd": request.cwd},
            timeout=30
        )
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent service error: {str(e)}")


@app.post("/api/agent/chat")
async def agent_chat(request: AgentChatRequest):
    """与 Agent 对话 - SSE 事件流"""
    global _current_cwd
    print(f"\n[Backend] >>>> agent_chat START")
    print(f"[Backend] sessionId: {request.sessionId}")
    print(f"[Backend] message: '{request.message[:50]}{'...' if len(request.message) > 50 else ''}'")
    print(f"[Backend] cwd: {request.cwd}")
    if request.cwd:
        _current_cwd = request.cwd
        print(f"[Backend] Updated _current_cwd to: {_current_cwd}")
    print(f"[Backend] Agent URL: {AGENT_SERVICE_URL}/api/chat")

    # 检查 PiAgent 服务是否可用
    try:
        health_resp = requests.get(f"{AGENT_SERVICE_URL}/health", timeout=5)
        if health_resp.status_code != 200:
            print(f"[Backend] ERROR Agent service health check failed: {health_resp.status_code}")
            raise HTTPException(status_code=503, detail="Agent service is not available")
        print(f"[Backend] OK Agent service health: {health_resp.json()}")
    except Exception as e:
        print(f"[Backend] ERROR Cannot connect to Agent service: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Cannot connect to Agent service at {AGENT_SERVICE_URL}: {str(e)}")

    try:
        print(f"[Backend] Calling Agent service...")

        def generate():
            with requests.post(
                f"{AGENT_SERVICE_URL}/api/chat",
                json={"sessionId": request.sessionId, "message": request.message, "cwd": request.cwd},
                stream=True,
                timeout=300  # 5 minutes timeout for long-running agent tasks
            ) as resp:
                print(f"[Backend] Agent response status: {resp.status_code}")
                if resp.status_code != 200:
                    print(f"[Backend] Agent error: {resp.text}")
                    yield f"data: {json.dumps({'type': 'error', 'error': f'Agent service returned {resp.status_code}'})}\n\n"
                    return

                line_count = 0
                for line in resp.iter_lines():
                    if line:
                        line_count += 1
                        if line_count <= 3:  # 只打印前3行
                            print(f"[Backend] SSE line {line_count}: {line[:100]}")
                        yield line.decode('utf-8') + '\n'

                print(f"[Backend] SSE complete, {line_count} lines")

        return StreamingResponse(generate(), media_type="text/event-stream")
    except Exception as e:
        print(f"[Backend] EXCEPTION: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Agent service error: {str(e)}")
    finally:
        print(f"[Backend] <<<< agent_chat END\n")


@app.get("/api/agent/tools")
async def agent_get_tools():
    """获取可用工具列表"""
    try:
        resp = requests.get(f"{AGENT_SERVICE_URL}/api/tools", timeout=10)
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent service error: {str(e)}")


@app.post("/api/agent/steer")
async def agent_steer(request: dict):
    """中断/引导 Agent（软转向）"""
    try:
        resp = requests.post(
            f"{AGENT_SERVICE_URL}/api/steer",
            json=request,
            timeout=10
        )
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent service error: {str(e)}")


@app.post("/api/agent/abort")
async def agent_abort(request: dict):
    """强制停止 Agent（立即中断）"""
    try:
        resp = requests.post(
            f"{AGENT_SERVICE_URL}/api/abort",
            json=request,
            timeout=10
        )
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent service error: {str(e)}")


@app.delete("/api/agent/session/{session_id}")
async def agent_delete_session(session_id: str):
    """删除 Agent 会话"""
    try:
        resp = requests.delete(f"{AGENT_SERVICE_URL}/api/session/{session_id}", timeout=10)
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent service error: {str(e)}")


@app.get("/api/agent/health")
async def agent_health():
    """检查 Agent 服务状态"""
    try:
        resp = requests.get(f"{AGENT_SERVICE_URL}/health", timeout=5)
        return resp.json()
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ===== 模型资产库 API =====

class ModelAssetListRequest(BaseModel):
    status: Optional[str] = None  # 过滤状态: ready, processing, failed
    session_id: Optional[str] = None  # 过滤会话
    keyword: Optional[str] = None  # 搜索名称关键词
    limit: int = 50


@app.post("/api/asset-library/list")
async def api_asset_library_list(request: ModelAssetListRequest) -> dict:
    """
    查询本地模型资产库，列出可用的 3D 模型。

    返回所有已生成且状态为 ready 的模型，支持按名称搜索、按会话过滤。

    响应:
    - total: 总数
    - models: [{object_id, object_name, status, model_url, created_at, session_id}]
    """
    try:
        from sqlmodel import Session as DBSession, select
        from history_models import SceneObjectRecord, engine

        with DBSession(engine) as db:
            query = select(SceneObjectRecord).order_by(SceneObjectRecord.created_at.desc())

            # 按状态过滤（默认只返回 ready）
            target_status = request.status or "ready"
            query = query.where(SceneObjectRecord.status == target_status)

            # 按会话过滤
            if request.session_id:
                query = query.where(SceneObjectRecord.session_id == request.session_id)

            # 按名称关键词搜索
            if request.keyword:
                from sqlalchemy import or_
                kw = f"%{request.keyword}%"
                query = query.where(
                    or_(
                        SceneObjectRecord.object_name.ilike(kw),
                        SceneObjectRecord.object_id.ilike(kw),
                    )
                )

            query = query.limit(request.limit)
            records = db.exec(query).all()

            models = []
            for r in records:
                lp = getattr(r, "local_path", None)
                models.append({
                    "object_id": r.object_id,
                    "object_name": r.object_name or r.object_id,
                    "status": r.status,
                    "model_url": r.model_url,
                    "local_path": lp if lp and os.path.exists(lp) else None,
                    "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                    "session_id": r.session_id,
                })

            return {
                "success": True,
                "total": len(models),
                "models": models,
            }
    except Exception as e:
        return {"success": False, "total": 0, "models": [], "message": str(e)}


class ImportModelToUERequest(BaseModel):
    model_name: Optional[str] = Field(None, description="模型名称，自动搜索匹配")
    object_id: Optional[str] = Field(None, description="模型 ID（与 model_name 二选一）")
    ue_project_path: Optional[str] = Field(None, description="UE 项目 .uproject 文件路径")


@app.post("/api/asset-library/import-to-ue")
async def api_asset_import_to_ue(request: ImportModelToUERequest) -> dict:
    """
    将模型文件复制到 UE 项目目录中。

    无需 UE 插件，直接通过文件系统操作：
    1. 从数据库找到模型
    2. 确保模型文件在本地缓存中
    3. 复制到 UE 项目的 Content/Imports 目录
    4. UE 编辑器会自动检测新文件并提示导入

    响应:
    - success: 是否成功
    - message: 结果消息
    - dest_path: 目标文件路径
    """
    import shutil

    print(f"[ImportToUE] Step 2a: api_asset_import_to_ue called")
    try:
        # === 1. 确定要导入的模型 ===
        target_object_id = request.object_id
        print(f"[ImportToUE] Step 2b: target_object_id={target_object_id}, model_name={request.model_name}")

        if not target_object_id and request.model_name:
            from sqlmodel import Session as DBSession, select
            from history_models import SceneObjectRecord, engine

            with DBSession(engine) as db:
                query = select(SceneObjectRecord).where(
                    SceneObjectRecord.status == "ready"
                ).where(
                    SceneObjectRecord.object_name.ilike(f"%{request.model_name}%")
                ).order_by(SceneObjectRecord.created_at.desc()).limit(5)
                records = db.exec(query).all()

            if not records:
                return {"success": False, "message": f"未找到匹配 \"{request.model_name}\" 的已就绪模型"}

            target_object_id = records[0].object_id
            if len(records) > 1:
                names = [f"  - {r.object_name} [{r.object_id}]" for r in records]
                return {
                    "success": False,
                    "message": f"找到 {len(records)} 个匹配模型，请指定具体模型：\n" + "\n".join(names),
                    "candidates": [{"object_id": r.object_id, "object_name": r.object_name} for r in records],
                }

        if not target_object_id:
            return {"success": False, "message": "请提供 model_name 或 object_id"}

        record = get_object_record(target_object_id)
        if not record:
            return {"success": False, "message": f"模型 {target_object_id} 不存在于资产库中"}

        if record.status != "ready":
            return {"success": False, "message": f"模型 {record.object_name} 状态为 {record.status}，尚未生成完成"}

        object_name = record.object_name or target_object_id

        # === 2. 确保模型文件在本地缓存中（优先使用 local_path，与 /api/object-file/ 保持一致） ===
        storage_dir = Path(__file__).resolve().parent / "storage" / "object_files"
        storage_dir.mkdir(parents=True, exist_ok=True)

        file_path = None
        local_path = getattr(record, "local_path", None)
        cached_path = storage_dir / f"{target_object_id}.cached"

        # 优先级1: 使用数据库记录的 local_path
        if local_path and os.path.exists(local_path):
            file_path = Path(local_path)
            print(f"[ImportToUE] Using local_path: {local_path}")
        # 优先级2: 使用 .cached 缓存文件
        elif cached_path.exists() and cached_path.stat().st_size > 0:
            file_path = cached_path
            print(f"[ImportToUE] Using cached file: {cached_path}")
        # 优先级3: 尝试从 model_url 下载（URL 可能已过期）
        elif record.model_url:
            import requests as req
            url = str(record.model_url).strip()
            tmp_path = storage_dir / f"{target_object_id}.part"
            print(f"[ImportToUE] Downloading from model_url: {url}")
            try:
                resp = req.get(url, stream=True, timeout=120)
                if resp.status_code == 200:
                    with tmp_path.open("wb") as f:
                        for chunk in resp.iter_content(chunk_size=1024 * 256):
                            if chunk:
                                f.write(chunk)
                    tmp_path.replace(cached_path)
                    file_path = cached_path
                    print(f"[ImportToUE] Downloaded and cached to {cached_path}")
                else:
                    return {"success": False, "message": f"下载模型文件失败 (HTTP {resp.status_code})，模型 URL 可能已过期"}
            except Exception as e:
                return {"success": False, "message": f"下载模型文件失败: {str(e)}"}
            finally:
                if tmp_path.exists():
                    tmp_path.unlink()

        if not file_path or not file_path.exists():
            return {"success": False, "message": f"模型文件未找到：local_path={local_path}, cached={'存在' if cached_path.exists() else '不存在'}, model_url={'有' if record.model_url else '无'}"}

        # === 3. 查找 UE 项目路径 ===
        ue_project_path = request.ue_project_path
        if not ue_project_path:
            # 优先使用 Agent 最近一次的 cwd
            if _current_cwd:
                ue_project_path = _current_cwd
                print(f"[ImportToUE] Using _current_cwd as ue_project_path: {_current_cwd}")
            else:
                ue_project_path = ue_integration.find_ue_project_path()
        if not ue_project_path:
            return {
                "success": False,
                "message": "未找到 UE 项目。请确认 UE 编辑器已打开，或在前端设置中配置工作目录(UE项目路径)。",
            }

        # 如果 ue_project_path 是一个 .uproject 文件，则取其所在目录；如果是一个目录，则直接使用该目录
        p = Path(ue_project_path)
        if p.is_file() and p.suffix == '.uproject':
            project_dir = p.parent
        else:
            project_dir = p

        # === 4. 复制文件到 UE 项目 Content/Imports/{safe_name} 目录 ===
        
        # Translate Chinese name to English for filename
        import hashlib
        import requests
        
        def translate_to_english(text: str) -> str:
            """Translate Chinese text to English using DeepSeek API"""
            try:
                from deepseek_client import DEEPSEEK_API_KEY
                if not DEEPSEEK_API_KEY:
                    return text
                
                url = "https://api.deepseek.com/v1/chat/completions"
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
                }
                payload = {
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "Translate the following Chinese text to English. Return only the translated text, no explanations."},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 50
                }
                response = requests.post(url, headers=headers, json=payload, timeout=5)
                if response.status_code == 200:
                    result = response.json()
                    return result.get("choices", [{}])[0].get("message", {}).get("content", text).strip()
            except Exception as e:
                print(f"Translation failed: {e}")
            return text
        
        # Translate object name to English
        english_name = translate_to_english(object_name)
        
        # Generate safe filename - use English name with unique suffix
        # Create base name from translated English name (remove invalid chars)
        base_name = re.sub(r'[\\/:*?"<>|]+', "_", english_name)
        base_name = re.sub(r'[^a-zA-Z0-9_.-]+', "_", base_name)
        base_name = re.sub(r'_+', "_", base_name).strip("_.-")
        
        # If base name is empty, use object ID
        if not base_name:
            base_name = f"model_{target_object_id[:8]}"
        
        # Add unique suffix to avoid conflicts
        hash_suffix = hashlib.md5((object_name + target_object_id).encode('utf-8')).hexdigest()[:8]
        safe_name = f"{base_name}_{hash_suffix}"
        
        import_dir = project_dir / "Content" / "Imports" / safe_name
        import_dir.mkdir(parents=True, exist_ok=True)

        def _detect_file_ext(fp: Path) -> str:
            try:
                with fp.open("rb") as fh:
                    header = fh.read(24)
                if header[:20] == b"Kaydara FBX Binary  " or header[:3] == b"FBX":
                    return ".fbx"
                if header[:4] == b"\x89GL":
                    return ".glb"
                if header[:4] == b"OBJ":
                    return ".obj"
                if header[:4] == b"STL":
                    return ".stl"
            except Exception:
                pass
            return fp.suffix or ".bin"

        dest_ext = _detect_file_ext(file_path)
        dest_filename = f"{safe_name}{dest_ext}"
        dest_path = import_dir / dest_filename

        shutil.copy2(str(file_path), str(dest_path))
        file_size_kb = dest_path.stat().st_size / 1024

        print(f"[ImportToUE] Step 2c: Copied to {dest_path} ({file_size_kb:.1f} KB)")

        # === 5. 通过 MCP 导入到 UE ===
        print(f"[ImportToUE] Step 2d: Calling mcp_import_model(source_path={dest_path}, dest=/Game/Imports/{safe_name}, asset={safe_name})")
        import_result = mcp_import_model(
            source_path=str(dest_path),
            destination_path=f"/Game/Imports/{safe_name}",
            asset_name=safe_name
        )
        print(f"[ImportToUE] Step 2e: mcp_import_model result: {import_result}")

        return {
            "success": import_result.get("success", False),
            "message": import_result.get("message", "导入完成"),
            "object_name": object_name,
            "file_path": str(dest_path),
            "file_size_kb": round(file_size_kb, 1),
            "ue_project": str(project_dir),
            "import_dir": str(import_dir),
            "ue_asset_path": import_result.get("ue_asset_path"),
            "auto_imported": import_result.get("success", False),
        }
    except Exception as e:
        print(f"[ImportToUE] Step 2 ERROR: {e}")
        return {"success": False, "message": f"导入失败: {str(e)}"}


class DownloadAndImportRequest(BaseModel):
    model_url: Optional[str] = Field(None, description="模型文件的 URL（与 object_id 二选一）")
    object_id: Optional[str] = Field(None, description="资产库中的模型 ID（与 model_url 二选一，优先使用本地路径）")
    model_name: str = Field(..., description="模型名称（英文，用于 UE 资产路径）")
    destination_path: str = Field("/Game/imported", description="UE Content 中的目标路径")


@app.post("/api/asset-library/download-and-import")
async def api_download_and_import(request: DownloadAndImportRequest) -> dict:
    """
    下载 3D 模型并导入到 UE 项目。

    完整流程：
    1. 获取模型文件（优先使用本地路径，避免 URL 过期）
    2. 复制到 UE 项目 Content/Imports 目录
    3. 通过 UE 命令桥接自动导入为资产

    支持两种模式：
    - 传入 object_id：从资产库数据库获取本地文件（推荐，URL 不过期）
    - 传入 model_url：从外部 URL 下载
    """
    import requests as req
    import re
    from pathlib import Path

    try:
        safe_name = re.sub(r'[^a-zA-Z0-9_]', '_', request.model_name)
        safe_name = re.sub(r'_+', '_', safe_name).strip('_')
        if not safe_name:
            safe_name = "ImportedModel"

        temp_dir = Path(__file__).resolve().parent / "storage" / "temp"
        temp_dir.mkdir(parents=True, exist_ok=True)

        source_path = None

        def _detect_ext_from_url(url: str) -> str:
            url_lower = url.lower().split("?")[0]
            for e in ("fbx", "glb", "gltf", "obj", "stl", "usdz"):
                if url_lower.endswith("." + e):
                    return "." + e
            return ".fbx"

        def _detect_ext_from_header(fp: Path) -> str:
            try:
                with fp.open("rb") as fh:
                    header = fh.read(24)
                if header[:20] == b"Kaydara FBX Binary  " or header[:3] == b"FBX":
                    return ".fbx"
                if header[:4] == b"\x89GL":
                    return ".glb"
                if header[:4] == b"OBJ":
                    return ".obj"
                if header[:4] == b"STL":
                    return ".stl"
            except Exception:
                pass
            return fp.suffix or ".fbx"

        def _find_cached(object_id_: str) -> Path | None:
            storage = Path(__file__).resolve().parent / "storage" / "object_files"
            for ext in (".cached", ".fbx", ".glb", ".gltf", ".obj", ".stl"):
                p = storage / f"{object_id_}{ext}"
                if p.exists() and p.stat().st_size > 0:
                    return p
            return None

        # 模式1: 通过 object_id 从资产库获取（优先使用 local_path）
        if request.object_id:
            record = get_object_record(request.object_id)
            if not record:
                return {"success": False, "message": f"模型 {request.object_id} 不存在于资产库中"}

            lp = getattr(record, "local_path", None)
            cached_file = _find_cached(request.object_id)

            if lp and os.path.exists(lp):
                source_path = Path(lp)
                print(f"[DownloadAndImport] Using local_path from DB: {lp}")
            elif cached_file:
                source_path = cached_file
                print(f"[DownloadAndImport] Using cached file: {cached_file}")
            elif record.model_url:
                url = str(record.model_url).strip()
                file_ext = _detect_ext_from_url(url)
                temp_path = temp_dir / f"{safe_name}{file_ext}"
                print(f"[DownloadAndImport] Downloading from model_url: {url}")
                response = req.get(url, stream=True, timeout=120)
                response.raise_for_status()
                with open(temp_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                source_path = temp_path
            else:
                return {"success": False, "message": f"模型 {record.object_name} 无可用文件（local_path 和 model_url 均为空）"}

        # 模式2: 从外部 URL 下载
        elif request.model_url:
            file_ext = _detect_ext_from_url(request.model_url)
            temp_path = temp_dir / f"{safe_name}{file_ext}"
            print(f"[DownloadAndImport] Downloading from URL: {request.model_url}")
            response = req.get(request.model_url, stream=True, timeout=120)
            response.raise_for_status()
            with open(temp_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            source_path = temp_path

        else:
            return {"success": False, "message": "请提供 object_id 或 model_url"}

        if not source_path or not source_path.exists():
            return {"success": False, "message": "未能获取到模型文件"}

        file_size_kb = source_path.stat().st_size / 1024
        file_ext = _detect_ext_from_header(source_path)
        print(f"[DownloadAndImport] Source: {source_path} ({file_size_kb:.1f} KB, ext={file_ext})")

        ue_project_path = ue_integration.find_ue_project_path()
        if not ue_project_path:
            return {
                "success": False,
                "message": "未找到 UE 项目。请确认 UE 编辑器已打开。",
            }

        p = Path(ue_project_path)
        if p.is_file() and p.suffix == '.uproject':
            project_dir = p.parent
        else:
            project_dir = p
            
        import_dir = project_dir / "Content" / "Imports" / safe_name
        import_dir.mkdir(parents=True, exist_ok=True)

        dest_path = import_dir / f"{safe_name}{file_ext}"
        shutil.copy2(str(source_path), str(dest_path))
        print(f"[DownloadAndImport] Copied to {dest_path}")

        # If user did not specify destination_path, default to /Game/Imports/{safe_name}
        dest_in_ue = request.destination_path
        if not dest_in_ue or dest_in_ue == "/Game/Imports":
            dest_in_ue = f"/Game/Imports/{safe_name}"

        import_result = mcp_import_model(
            source_path=str(dest_path),
            destination_path=dest_in_ue,
            asset_name=safe_name
        )

        return {
            "success": import_result.get("success", False),
            "message": import_result.get("message", "下载并导入完成"),
            "file_path": str(dest_path),
            "file_size_kb": round(file_size_kb, 1),
            "asset_name": safe_name,
            "ue_asset_path": import_result.get("ue_asset_path"),
        }

    except req.exceptions.Timeout:
        return {"success": False, "message": "下载超时，请重试或使用更小的模型"}
    except Exception as e:
        print(f"[DownloadAndImport] Error: {e}")
        return {"success": False, "message": f"下载/导入失败: {str(e)}"}
