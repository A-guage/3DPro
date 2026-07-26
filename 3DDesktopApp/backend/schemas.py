from typing import Optional, Literal, List

from pydantic import BaseModel, Field


class UserRequest(BaseModel):
    text: str = Field(..., description="3D内容的描述，中文正向提示词，最多200个utf-8字符")
    result_format: Optional[Literal["OBJ", "GLB", "STL", "USDZ", "FBX", "MP4"]] = Field(
        default="GLB",
        description="生成模型的格式，默认GLB",
    )
    enable_pbr: bool = Field(default=False, description="是否开启PBR材质生成")
    enable_geometry: bool = Field(
        default=False,
        description="是否开启单几何生成（白模），开启时不支持OBJ格式",
    )


class Generate3DResponse(BaseModel):
    task_id: str
    status: str


class TaskStatusResponse(BaseModel):
    status: str
    model_url: Optional[str] = None


class GenerateSceneRequest(BaseModel):
    description: str = Field(..., description="场景描述，中文")
    quality: Literal["low", "medium", "high"] = Field(
        default="medium",
        description="生成质量：low/medium/high",
    )
    user_id: Optional[str] = Field(
        default=None,
        description="用户ID，用于将生成记录与账号关联",
    )
    session_id: Optional[str] = Field(
        default=None,
        description="关联的会话ID",
    )


class GenerateObjectRequest(BaseModel):
    name: str
    description: str
    session_id: str
    user_id: Optional[str] = None


class GenerateSceneResponse(BaseModel):
    scene_id: str
    status: str
    estimated_time: int


class ObjectStatus(BaseModel):
    object_id: str
    status: Literal["pending", "processing", "ready", "failed"]
    model_url: Optional[str] = None


class ChatSessionSaveRequest(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    title: str
    messages: List[dict]


class ChatSessionResponse(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str


class SessionDetailResponse(BaseModel):
    session: Optional[dict] = None
    scenes: List[dict] = []
    objects: List[dict] = []


class SceneStatusResponse(BaseModel):
    scene_id: str
    status: str
    model_url: Optional[str] = None
    error_message: Optional[str] = None
    progress: Optional[int] = None
    objects: List[ObjectStatus] = []
    current_object: Optional[str] = None


class HistoryObject(BaseModel):
    object_id: str
    status: str
    model_url: Optional[str] = None


class SceneHistoryItem(BaseModel):
    scene_id: str
    description: str
    quality: str
    status: str
    model_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    updated_at: str


class HistoryDetail(BaseModel):
    scene: SceneHistoryItem
    objects: List[HistoryObject]


class ImportToEngineRequest(BaseModel):
    sceneUrl: str = Field(..., description="场景文件 URL")
    sceneId: str = Field(..., description="场景 ID")
    enginePath: Optional[str] = Field(
        default=None,
        description="UE 项目路径，可选"
    )


class ImportToEngineResponse(BaseModel):
    success: bool
    message: str
    filePath: Optional[str] = None


# 保持旧名称的别名，兼容性
ImportToUnityRequest = ImportToEngineRequest
ImportToUnityResponse = ImportToEngineResponse

