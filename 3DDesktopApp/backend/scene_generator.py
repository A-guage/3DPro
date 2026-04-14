import os
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any

import requests
from fastapi import HTTPException
from starlette.responses import FileResponse

from deepseek_client import refine_scene_prompt, plan_scene_objects, compose_scene_layout
from hunyuan_client import create_3d_job, get_3d_job_status
from history_models import create_scene_history, update_scene_status, SceneObjectRecord, replace_scene_objects


def _get_media_type(ext: str) -> str:
    ext = ext.lower().lstrip(".")
    mapping = {
        "glb": "model/gltf-binary",
        "fbx": "model/fbx",
        "obj": "model/obj",
        "stl": "model/stl",
        "usdz": "model/vnd.usdz+zip",
    }
    return mapping.get(ext, "application/octet-stream")


@dataclass
class SceneObjectTask:
    object_id: str
    description: str
    label: str
    estimated_size: Dict[str, float]
    default_position: Dict[str, float]
    priority: int
    job_id: Optional[str] = None
    status: str = "pending"
    model_url: Optional[str] = None
    local_path: Optional[str] = None
    file_type: Optional[str] = None


@dataclass
class SceneCompositionObject:
    object_id: str
    position: Dict[str, float]
    rotation: Dict[str, float]
    scale: Dict[str, float]


@dataclass
class SceneComposition:
    objects: List[SceneCompositionObject] = field(default_factory=list)


@dataclass
class SceneTask:
    scene_id: str
    description: str
    quality: str
    status: str = "processing"
    estimated_time: int = 30
    model_url: Optional[str] = None
    local_path: Optional[str] = None
    objects: List[SceneObjectTask] = field(default_factory=list)
    composition: Optional[SceneComposition] = None
    error_message: Optional[str] = None
    progress: int = 0


SCENE_TASKS: Dict[str, SceneTask] = {}


def _has_running_jobs() -> bool:
    for task in SCENE_TASKS.values():
        for obj in task.objects:
            if obj.status == "processing":
                return True
    return False


def _ensure_storage_dir(scene_id: str) -> str:
    base_dir = os.path.join("storage", "scenes", scene_id, "models")
    os.makedirs(base_dir, exist_ok=True)
    return base_dir


def generate_scene(description: str, quality: str = "medium", user_id: Optional[str] = None) -> SceneTask:
    if quality not in {"low", "medium", "high"}:
        quality = "medium"
    scene_id = str(uuid.uuid4())
    planning = plan_scene_objects(description=description, quality=quality)
    objects_raw: List[Dict[str, Any]] = planning.get("objects", [])
    objects: List[SceneObjectTask] = []
    for index, obj in enumerate(objects_raw, start=1):
        object_id = str(obj.get("object_id") or f"obj_{index:03d}")
        label = str(obj.get("label") or "object.generic")
        description_text = str(obj.get("description") or description)
        estimated_size_raw = obj.get("estimated_size") or {}
        default_position_raw = obj.get("default_position") or {}
        estimated_size = {
            "x": float(estimated_size_raw.get("x", 1.0)),
            "y": float(estimated_size_raw.get("y", 1.0)),
            "z": float(estimated_size_raw.get("z", 1.0)),
        }
        default_position = {
            "x": float(default_position_raw.get("x", 0.0)),
            "y": float(default_position_raw.get("y", 0.0)),
            "z": float(default_position_raw.get("z", 0.0)),
        }
        priority = int(obj.get("priority") or index)
        objects.append(
            SceneObjectTask(
                object_id=object_id,
                description=description_text,
                label=label,
                estimated_size=estimated_size,
                default_position=default_position,
                priority=priority,
                job_id=None,
                status="pending",
            )
        )
    task = SceneTask(
        scene_id=scene_id,
        description=description,
        quality=quality,
        status="processing",
        estimated_time=30,
        objects=objects,
        progress=5,
    )
    SCENE_TASKS[scene_id] = task
    create_scene_history(scene_id=scene_id, user_id=user_id, description=description, quality=quality)
    _start_next_object_job(task)
    return task


def _start_next_object_job(task: SceneTask) -> None:
    if _has_running_jobs():
        return
    pending_objects = sorted(task.objects, key=lambda o: o.priority)
    for obj in pending_objects:
        if obj.status != "pending" or obj.job_id is not None:
            continue
        try:
            optimized_prompt = refine_scene_prompt(obj.description, quality=task.quality)
            enable_pbr = task.quality in {"medium", "high"}
            enable_geometry = False
            job_id = create_3d_job(
                prompt=optimized_prompt,
                result_format="FBX",
                enable_pbr=enable_pbr,
                enable_geometry=enable_geometry,
            )
            obj.job_id = job_id
            obj.status = "processing"
        except RuntimeError as exc:
            message = str(exc)
            if "RequestLimitExceeded.JobNumExceed" in message:
                obj.job_id = None
                obj.status = "pending"
                return
            raise
        return


def _refresh_object_status(scene_id: str, obj: SceneObjectTask) -> None:
    if not obj.job_id or obj.status in {"ready", "failed"}:
        return
    status_data = get_3d_job_status(obj.job_id)
    status = str(status_data.get("status", "")).upper()
    model_url = status_data.get("model_url")
    file_type = status_data.get("file_type")
    if model_url:
        obj.model_url = model_url
    if file_type:
        obj.file_type = file_type
    success_statuses = {"DONE", "SUCCEED", "SUCCESS", "FINISHED", "COMPLETED"}
    failure_statuses = {"FAILED", "ERROR", "CANCELED", "CANCELLED"}
    if status in success_statuses or (model_url and status not in failure_statuses):
        obj.status = "ready"
        if model_url and not obj.local_path:
            try:
                _download_object_model(scene_id, obj)
            except Exception:
                pass
    elif status in failure_statuses:
        obj.status = "failed"
    else:
        obj.status = "processing"


def _download_object_model(scene_id: str, obj: SceneObjectTask) -> None:
    base_dir = _ensure_storage_dir(scene_id)

    def _detect_ext(url: str = "", fallback: str = "fbx") -> str:
        if obj.file_type:
            candidate = obj.file_type.lower().strip(".")
            if candidate in ("glb", "gltf", "fbx", "obj", "stl", "usdz"):
                return candidate
        if url:
            url_lower = url.lower().split("?")[0]
            for e in ("fbx", "glb", "gltf", "obj", "stl", "usdz"):
                if url_lower.endswith("." + e):
                    return e
        return fallback

    ext = _detect_ext(obj.model_url or "")
    filename = f"{obj.object_id}.{ext}"
    local_path = os.path.join(base_dir, filename)

    def _set_and_return(p: str) -> None:
        obj.local_path = p

    # 优先级1: 数据库 SceneObjectRecord 的 local_path
    try:
        from history_models import get_object_record
        db_record = get_object_record(obj.object_id)
        if db_record and getattr(db_record, "local_path", None) and os.path.exists(db_record.local_path):
            _set_and_return(db_record.local_path)
            return
    except Exception:
        pass

    # 优先级2: 场景存储目录中的本地文件
    if os.path.exists(local_path):
        _set_and_return(local_path)
        return

    # 优先级3: 已缓存的 obj.local_path
    if obj.local_path and os.path.exists(obj.local_path):
        return

    # 优先级4: 从 model_url 下载（URL 可能已过期）
    if not obj.model_url:
        raise HTTPException(status_code=500, detail=f"Model URL not available for object {obj.object_id}")
    resp = requests.get(obj.model_url, stream=True, timeout=60)
    resp.raise_for_status()
    with open(local_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    _set_and_return(local_path)


def _ensure_composition(task: SceneTask) -> None:
    if task.composition is not None:
        return
    objects_info: List[Dict[str, Any]] = []
    for obj in task.objects:
        objects_info.append(
            {
                "object_id": obj.object_id,
                "label": obj.label,
                "estimated_size": obj.estimated_size,
                "default_position": obj.default_position,
            }
        )
    data = compose_scene_layout(objects_info)
    composition_objects: List[SceneCompositionObject] = []
    raw_objects = data.get("scene_composition", {}).get("objects", [])
    for raw in raw_objects:
        object_id = str(raw.get("object_id"))
        position_raw = raw.get("position") or {}
        rotation_raw = raw.get("rotation") or {}
        scale_raw = raw.get("scale") or {}
        position = {
            "x": float(position_raw.get("x", 0.0)),
            "y": float(position_raw.get("y", 0.0)),
            "z": float(position_raw.get("z", 0.0)),
        }
        rotation = {
            "x": float(rotation_raw.get("x", 0.0)),
            "y": float(rotation_raw.get("y", 0.0)),
            "z": float(rotation_raw.get("z", 0.0)),
        }
        scale = {
            "x": float(scale_raw.get("x", 1.0)),
            "y": float(scale_raw.get("y", 1.0)),
            "z": float(scale_raw.get("z", 1.0)),
        }
        composition_objects.append(
            SceneCompositionObject(
                object_id=object_id,
                position=position,
                rotation=rotation,
                scale=scale,
            )
        )
    task.composition = SceneComposition(objects=composition_objects)


def refresh_scene_status(scene_id: str) -> SceneTask:
    task = SCENE_TASKS.get(scene_id)
    if not task:
        raise HTTPException(status_code=404, detail="Scene not found")
    if task.status in {"ready", "failed"}:
        update_scene_status(
            scene_id=scene_id,
            status=task.status,
            model_url=task.model_url,
            error_message=task.error_message,
        )
        return task
    total = len(task.objects)
    if total == 0:
        task.status = "failed"
        task.error_message = "No objects planned for scene"
        task.progress = 0
        update_scene_status(
            scene_id=scene_id,
            status=task.status,
            error_message=task.error_message,
        )
        return task
    completed = 0
    failed = False
    has_processing = False
    has_started = False
    objects_for_history: List[SceneObjectRecord] = []
    for obj in task.objects:
        _refresh_object_status(scene_id, obj)
        objects_for_history.append(
            SceneObjectRecord(
                scene_id=scene_id,
                object_id=obj.object_id,
                status=obj.status,
                model_url=obj.model_url,
                local_path=obj.local_path,
            )
        )
        if obj.status == "ready":
            completed += 1
        if obj.status == "failed":
            failed = True
        if obj.status == "processing":
            has_processing = True
        if obj.job_id:
            has_started = True
    replace_scene_objects(scene_id, objects_for_history)
    if failed:
        task.status = "failed"
        task.error_message = "One or more objects failed to generate"
        task.progress = int(100 * completed / total)
        update_scene_status(
            scene_id=scene_id,
            status=task.status,
            error_message=task.error_message,
        )
        return task
    if completed < total:
        if not has_processing:
            _start_next_object_job(task)
        task.status = "processing"
        base_progress = 20 if has_started else 0
        task.progress = base_progress + int(60 * completed / total)
        if task.progress > 90:
            task.progress = 90
        update_scene_status(
            scene_id=scene_id,
            status=task.status,
        )
        return task
    try:
        _ensure_composition(task)
        task.status = "ready"
        task.progress = 100
        update_scene_status(
            scene_id=scene_id,
            status=task.status,
            model_url=task.model_url,
        )
    except Exception as exc:
        task.status = "failed"
        task.error_message = str(exc)
        task.progress = int(100 * completed / total)
        update_scene_status(
            scene_id=scene_id,
            status=task.status,
            error_message=task.error_message,
        )
    return task


def download_scene_file(scene_id: str) -> FileResponse:
    task = SCENE_TASKS.get(scene_id)
    if task:
        task = refresh_scene_status(scene_id)
        if task.status != "ready":
            raise HTTPException(status_code=400, detail="Scene is not ready yet")
        if task.local_path and os.path.exists(task.local_path):
            ext = os.path.splitext(task.local_path)[1] or ".glb"
            return FileResponse(
                task.local_path,
                media_type=_get_media_type(ext),
                filename=f"{scene_id}{ext}",
            )
        if not task.objects:
            raise HTTPException(status_code=500, detail="No objects available for scene")
        for obj in task.objects:
            if obj.status != "ready":
                continue
            _download_object_model(scene_id, obj)
        first_ready = next((o for o in task.objects if o.local_path), None)
        if not first_ready:
            raise HTTPException(status_code=500, detail="No ready object models to download")
        task.local_path = first_ready.local_path
        ext = os.path.splitext(task.local_path)[1] or ".glb"
        return FileResponse(
            task.local_path,
            media_type=_get_media_type(ext),
            filename=f"{scene_id}{ext}",
        )
    base_dir = _ensure_storage_dir(scene_id)
    if not os.path.exists(base_dir):
        raise HTTPException(status_code=404, detail="Scene not found")
    for name in os.listdir(base_dir):
        if name.lower().endswith((".glb", ".fbx", ".obj", ".stl", ".usdz")):
            local_path = os.path.join(base_dir, name)
            if os.path.isfile(local_path):
                ext = os.path.splitext(name)[1]
                return FileResponse(
                    local_path,
                    media_type=_get_media_type(ext),
                    filename=f"{scene_id}{ext}",
                )
    raise HTTPException(status_code=404, detail="Scene file not found")


def download_object_file(scene_id: str, object_id: str) -> FileResponse:
    task = SCENE_TASKS.get(scene_id)
    if task:
        task = refresh_scene_status(scene_id)
        for obj in task.objects:
            if obj.object_id == object_id:
                if obj.status != "ready":
                    raise HTTPException(status_code=400, detail="Object is not ready yet")
                _download_object_model(scene_id, obj)
                if not obj.local_path:
                    raise HTTPException(status_code=500, detail="Object model not available")
                ext = os.path.splitext(obj.local_path)[1] or ".glb"
                return FileResponse(
                    obj.local_path,
                    media_type=_get_media_type(ext),
                    filename=f"{scene_id}-{object_id}{ext}",
                )
        raise HTTPException(status_code=404, detail="Object not found")
    base_dir = _ensure_storage_dir(scene_id)
    for name in os.listdir(base_dir):
        if name.startswith(object_id) and name.lower().endswith((".glb", ".fbx", ".obj", ".stl", ".usdz")):
            local_path = os.path.join(base_dir, name)
            if os.path.isfile(local_path):
                ext = os.path.splitext(name)[1]
                return FileResponse(
                    local_path,
                    media_type=_get_media_type(ext),
                    filename=f"{scene_id}-{object_id}{ext}",
                )
    raise HTTPException(status_code=404, detail="Object not found")
