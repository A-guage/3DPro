from datetime import datetime
from typing import List, Optional

from sqlmodel import SQLModel, Field, Session, create_engine, select, delete
from sqlalchemy.exc import OperationalError


DATABASE_URL = "sqlite:///./history.db"
engine = create_engine(DATABASE_URL, echo=False)


class ChatSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True, unique=True)
    user_id: Optional[str] = Field(default=None, index=True)
    title: str
    messages_json: str  # 存储 JSON 序列化后的消息列表
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SceneHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    scene_id: str = Field(index=True, unique=True)
    session_id: Optional[str] = Field(default=None, index=True)  # 关联到 ChatSession
    user_id: Optional[str] = Field(default=None, index=True)
    description: str
    quality: str
    status: str
    model_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SceneObjectRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    scene_id: str = Field(index=True)
    session_id: Optional[str] = Field(default=None, index=True)
    object_id: str
    object_name: Optional[str] = None
    status: str
    model_url: Optional[str] = None
    local_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    try:
        with engine.connect() as conn:
            table = SceneObjectRecord.__tablename__
            cols = [r[1] for r in conn.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()]
            if "session_id" not in cols:
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN session_id TEXT")
    except Exception:
        pass
    try:
        with engine.connect() as conn:
            table = SceneHistory.__tablename__
            cols = [r[1] for r in conn.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()]
            if "session_id" not in cols:
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN session_id TEXT")
    except Exception:
        pass
    try:
        with engine.connect() as conn:
            table = SceneObjectRecord.__tablename__
            cols = [r[1] for r in conn.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()]
            if "local_path" not in cols:
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN local_path TEXT")
    except Exception:
        pass
    try:
        backfill_session_ids_by_time()
    except Exception:
        pass


def _pick_nearest_session_id(target: datetime, sessions: List[ChatSession]) -> Optional[str]:
    if not sessions:
        return None
    best: Optional[ChatSession] = None
    best_delta: Optional[float] = None
    for s in sessions:
        base = s.updated_at or s.created_at
        delta = abs((base - target).total_seconds())
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best = s
    return best.session_id if best else None


def backfill_session_ids_by_time() -> None:
    with Session(engine) as session:
        sessions = list(session.exec(select(ChatSession).order_by(ChatSession.updated_at.desc())).all())
        if not sessions:
            return

        objects = list(session.exec(select(SceneObjectRecord).where(SceneObjectRecord.session_id == None)).all())
        changed = False
        for obj in objects:
            sid = _pick_nearest_session_id(obj.created_at, sessions)
            if sid:
                obj.session_id = sid
                session.add(obj)
                changed = True

        scenes = list(session.exec(select(SceneHistory).where(SceneHistory.session_id == None)).all())
        for sc in scenes:
            base_time = sc.updated_at or sc.created_at
            sid = _pick_nearest_session_id(base_time, sessions)
            if sid:
                sc.session_id = sid
                session.add(sc)
                changed = True

        if changed:
            session.commit()


def create_scene_history(scene_id: str, user_id: Optional[str], description: str, quality: str) -> None:
    now = datetime.utcnow()
    with Session(engine) as session:
        existing = session.exec(select(SceneHistory).where(SceneHistory.scene_id == scene_id)).first()
        if existing:
            return
        record = SceneHistory(
            scene_id=scene_id,
            user_id=user_id,
            description=description,
            quality=quality,
            status="processing",
            created_at=now,
            updated_at=now,
        )
        session.add(record)
        session.commit()


def update_scene_status(
    scene_id: str,
    status: Optional[str] = None,
    model_url: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    now = datetime.utcnow()
    with Session(engine) as session:
        record = session.exec(select(SceneHistory).where(SceneHistory.scene_id == scene_id)).first()
        if not record:
            return
        if status is not None:
            record.status = status
        if model_url is not None:
            record.model_url = model_url
        if error_message is not None:
            record.error_message = error_message
        record.updated_at = now
        session.add(record)
        session.commit()


def create_object_record(session_id: str, object_id: str, object_name: str, status: str = "processing") -> None:
    """
    为单个 3D 物品创建一条记录。

    兼容旧版 history.db：
    - 旧库可能没有 session_id 列，此时带 session_id 插入会导致
      "table SceneObjectRecord has no column named session_id" 的错误。
    - 捕获该错误后，退化为不写 session_id 字段，避免整体任务失败。
    """
    with Session(engine) as session:
        try:
            record = SceneObjectRecord(
                scene_id="individual_object",  # 单个生成的物体不一定属于某个场景
                session_id=session_id,
                object_id=object_id,
                object_name=object_name,
                status=status,
            )
            session.add(record)
            session.commit()
        except OperationalError:
            # 回退方案：不写 session_id 字段，仅保存最基本信息
            record = SceneObjectRecord(
                scene_id="individual_object",
                object_id=object_id,
                object_name=object_name,
                status=status,
            )
            session.add(record)
            session.commit()


def update_object_status(object_id: str, status: str, model_url: Optional[str] = None, local_path: Optional[str] = None) -> None:
    with Session(engine) as session:
        record = session.exec(select(SceneObjectRecord).where(SceneObjectRecord.object_id == object_id)).first()
        if record:
            record.status = status
            if model_url:
                record.model_url = model_url
            if local_path:
                record.local_path = local_path
            session.add(record)
            session.commit()


def get_object_record(object_id: str) -> Optional[SceneObjectRecord]:
    with Session(engine) as session:
        return session.exec(select(SceneObjectRecord).where(SceneObjectRecord.object_id == object_id)).first()


def replace_scene_objects(scene_id: str, objects: List["SceneObjectRecord"], session_id: Optional[str] = None) -> None:
    with Session(engine) as session:
        session.exec(delete(SceneObjectRecord).where(SceneObjectRecord.scene_id == scene_id))
        for obj in objects:
            record = SceneObjectRecord(
                scene_id=scene_id,
                session_id=session_id or obj.session_id,
                object_id=obj.object_id,
                object_name=obj.object_name,
                status=obj.status,
                model_url=obj.model_url,
                local_path=obj.local_path,
            )
            session.add(record)
        session.commit()


# ===== ChatSession 相关函数 =====

def save_chat_session(session_id: str, user_id: Optional[str], title: str, messages: List[dict]) -> None:
    import json
    now = datetime.utcnow()
    with Session(engine) as session:
        record = session.exec(select(ChatSession).where(ChatSession.session_id == session_id)).first()
        if record:
            record.title = title
            record.messages_json = json.dumps(messages)
            record.updated_at = now
        else:
            record = ChatSession(
                session_id=session_id,
                user_id=user_id,
                title=title,
                messages_json=json.dumps(messages),
                created_at=now,
                updated_at=now,
            )
        session.add(record)
        session.commit()


def get_chat_sessions(user_id: str, limit: int = 20) -> List[ChatSession]:
    with Session(engine) as session:
        statement = (
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc())
            .limit(limit)
        )
        return list(session.exec(statement).all())


def get_session_detail(session_id: str) -> dict:
    with Session(engine) as session:
        chat = session.exec(select(ChatSession).where(ChatSession.session_id == session_id)).first()
        # 兼容旧版本数据库中可能缺少 session_id 列的情况
        try:
            scenes = session.exec(select(SceneHistory).where(SceneHistory.session_id == session_id)).all()
        except OperationalError:
            scenes = []
        try:
            objects = session.exec(select(SceneObjectRecord).where(SceneObjectRecord.session_id == session_id)).all()
        except OperationalError:
            objects = []
        import json

        session_payload = None
        if chat is not None:
            # 某些旧数据可能 messages_json 为空，做兼容处理
            try:
                messages = json.loads(chat.messages_json) if chat.messages_json else []
            except Exception:
                messages = []
            session_payload = {
                "session_id": chat.session_id,
                "title": chat.title,
                "messages": messages,
                "created_at": chat.created_at,
                "updated_at": chat.updated_at,
            }

        return {
            "session": session_payload,
            "scenes": list(scenes),
            "objects": list(objects),
        }


def delete_chat_session(session_id: str) -> bool:
    """
    删除会话及其关联资产记录（objects / scenes）。
    返回：是否删除到了会话记录。
    """
    with Session(engine) as session:
        chat = session.exec(select(ChatSession).where(ChatSession.session_id == session_id)).first()
        if not chat:
            return False

        # 先删除关联表，避免残留脏数据。
        # 对于旧版 history.db 可能没有 session_id 列，出现错误时忽略关联删除，只删除会话本身。
        try:
            session.exec(delete(SceneObjectRecord).where(SceneObjectRecord.session_id == session_id))
            session.exec(delete(SceneHistory).where(SceneHistory.session_id == session_id))
        except OperationalError:
            pass

        session.delete(chat)
        session.commit()
        return True


def rename_chat_session(session_id: str, new_title: str) -> bool:
    """
    重命名会话标题并更新时间。
    返回：是否找到了会话记录。
    """
    cleaned = (new_title or "").strip()
    if not cleaned:
        cleaned = "新对话"

    with Session(engine) as session:
        chat = session.exec(select(ChatSession).where(ChatSession.session_id == session_id)).first()
        if not chat:
            return False
        chat.title = cleaned
        chat.updated_at = datetime.utcnow()
        session.add(chat)
        session.commit()
        return True


def get_history_list(user_id: str, limit: int = 20) -> List[SceneHistory]:
    with Session(engine) as session:
        statement = (
            select(SceneHistory)
            .where(SceneHistory.user_id == user_id)
            .order_by(SceneHistory.created_at.desc())
            .limit(limit)
        )
        results = session.exec(statement).all()
        return list(results)


def get_history_detail(scene_id: str) -> tuple[Optional[SceneHistory], List[SceneObjectRecord]]:
    with Session(engine) as session:
        history = session.exec(select(SceneHistory).where(SceneHistory.scene_id == scene_id)).first()
        objects = session.exec(select(SceneObjectRecord).where(SceneObjectRecord.scene_id == scene_id)).all()
        return history, list(objects)
