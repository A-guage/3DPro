"""
Unreal Engine 集成模块
处理将 3D 场景导入到 UE 项目的逻辑，以及读取 UE 输出日志

相比 Unity，UE 的优势：
1. 输出日志是纯文本文件，直接可读，不存在"编译错误导致无法获取日志"的问题
2. UE Editor Scripting 不会因蓝图编译错误而失效
3. 可以通过命令行工具和 Python 脚本操作编辑器
"""
import requests
import os
import re
import subprocess
import glob
import time
from pathlib import Path
from typing import Optional, List, Dict
from fastapi import HTTPException


# UE 插件/服务配置
UE_PLUGIN_URL = os.getenv("UE_PLUGIN_URL", "http://localhost:3030")

# UE 项目路径（可通过环境变量配置）
UE_PROJECT_PATH = os.getenv("UE_PROJECT_PATH", "")

# UE 命令桥接配置
BRIDGE_DIR_NAME = "_bridge"
BRIDGE_POLL_INTERVAL = 0.5
BRIDGE_RESULT_TIMEOUT = 300  # 等待执行结果的最大时间（秒），UE 资产操作可能需要数分钟


def find_ue_project_path() -> Optional[str]:
    """
    自动搜索常见的 UE 项目路径
    查找 .uproject 文件
    """
    # 如果环境变量指定了，直接用
    if UE_PROJECT_PATH:
        if os.path.exists(UE_PROJECT_PATH):
            return UE_PROJECT_PATH

    # 常见搜索路径
    search_paths = [
        "C:\\UE_project",
        "D:\\UE_project",
        "C:\\Unreal Projects",
        "D:\\Unreal Projects",
        os.path.expanduser("~\\Documents\\Unreal Projects"),
    ]

    for base in search_paths:
        if not os.path.exists(base):
            continue
        for root, dirs, files in os.walk(base):
            # 不要搜索太深
            depth = root.replace(base, "").count(os.sep)
            if depth > 3:
                dirs.clear()
                continue
            for f in files:
                if f.endswith(".uproject"):
                    return os.path.join(root, f)

    return None


def find_ue_output_log(project_path: Optional[str] = None) -> Optional[str]:
    """
    查找 UE 输出日志文件

    UE 的日志位于项目目录下的 Saved/Logs/ 文件夹中
    主要文件: Saved/Logs/<ProjectName>.log
    """
    if not project_path:
        project_path = find_ue_project_path()

    if not project_path:
        return None

    project_dir = os.path.dirname(project_path)
    log_dir = os.path.join(project_dir, "Saved", "Logs")

    if not os.path.exists(log_dir):
        return None

    # 查找最新的 .log 文件
    log_files = glob.glob(os.path.join(log_dir, "*.log"))
    if not log_files:
        return None

    # 按修改时间排序，取最新的
    log_files.sort(key=lambda x: os.path.getmtime(x), reverse=True)
    return log_files[0]


def get_bridge_dir(ue_project_path: Optional[str] = None) -> Optional[str]:
    """
    获取 UE 命令桥接的命令目录路径
    
    Args:
        ue_project_path: UE .uproject 文件路径，不填则自动搜索
    
    Returns:
        桥接命令目录路径，找不到 UE 项目则返回 None
    """
    if not ue_project_path:
        ue_project_path = find_ue_project_path()
    if not ue_project_path:
        return None
    
    project_dir = os.path.dirname(ue_project_path)
    bridge_dir = os.path.join(project_dir, "Content", BRIDGE_DIR_NAME)
    return bridge_dir


def check_bridge_status(ue_project_path: Optional[str] = None) -> dict:
    """
    检查 UE 命令桥接是否正在运行
    
    检查方式：查看桥接目录下是否有 .bridge_status 文件且内容有效
    
    Returns:
        {"running": bool, "bridge_dir": str, "message": str}
    """
    bridge_dir = get_bridge_dir(ue_project_path)
    if not bridge_dir:
        return {
            "running": False,
            "bridge_dir": "",
            "message": "未找到 UE 项目，无法定位桥接目录"
        }
    
    status_file = os.path.join(bridge_dir, ".bridge_status")
    
    if not os.path.exists(status_file):
        return {
            "running": False,
            "bridge_dir": bridge_dir,
            "message": "命令桥接未启动。请在 UE Python Console 中运行桥接脚本。"
        }
    
    try:
        import json
        # 检查状态文件的修改时间（5秒内才认为有效）
        mtime = os.path.getmtime(status_file)
        if time.time() - mtime > 10:
            return {
                "running": False,
                "bridge_dir": bridge_dir,
                "message": "命令桥接状态文件过期，桥接可能已停止。"
            }
        
        with open(status_file, "r", encoding="utf-8") as f:
            status = json.load(f)
        
        return {
            "running": status.get("running", False),
            "bridge_dir": bridge_dir,
            "pid": status.get("pid"),
            "message": "命令桥接正在运行" if status.get("running") else "命令桥接已停止"
        }
    except Exception as e:
        return {
            "running": False,
            "bridge_dir": bridge_dir,
            "message": f"读取桥接状态失败: {str(e)}"
        }


def mcp_import_model(source_path: str, destination_path: str = "/Game/imported", asset_name: str = None) -> dict:
    """
    通过 MCP TCP 连接直接调用 UE 的 import_model 命令

    Args:
        source_path: 源文件完整路径
        destination_path: UE Content 目标路径
        asset_name: 可选的资产名称

    Returns:
        {"success": bool, "message": str, "ue_asset_path": str}
    """
    import socket
    import json

    MCP_HOST = "127.0.0.1"
    MCP_PORT = 55557
    SOCKET_TIMEOUT = 120

    print(f"[mcp_import_model] Step 3a: source_path={source_path}, dest={destination_path}, asset={asset_name}")

    try:
        print(f"[mcp_import_model] Step 3b: Creating TCP socket to {MCP_HOST}:{MCP_PORT}")
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(SOCKET_TIMEOUT)
        sock.connect((MCP_HOST, MCP_PORT))
        print(f"[mcp_import_model] Step 3c: Connected to UE MCP server")

        params = {
            "source_path": source_path,
            "destination_path": destination_path,
        }
        if asset_name:
            params["asset_name"] = asset_name

        command_obj = {
            "type": "import_model",
            "params": params
        }

        command_json = json.dumps(command_obj)
        print(f"[mcp_import_model] Step 3d: Sending command: {command_json}")
        sock.sendall(command_json.encode('utf-8'))

        print(f"[mcp_import_model] Step 3e: Waiting for response...")
        chunks = []
        while True:
            try:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk)
                data = b''.join(chunks)
                decoded = data.decode('utf-8')
                try:
                    json.loads(decoded)
                    break
                except json.JSONDecodeError:
                    continue
            except socket.timeout:
                print(f"[mcp_import_model] Step 3e TIMEOUT: Socket timeout after {SOCKET_TIMEOUT}s")
                break

        sock.close()
        print(f"[mcp_import_model] Step 3f: Received {len(chunks)} bytes")

        if chunks:
            response = json.loads(b''.join(chunks).decode('utf-8'))
            print(f"[mcp_import_model] Step 3g: Response status={response.get('status')}")
            if response.get("status") == "success":
                result = response.get("result", {})
                inner_success = result.get("success", False)
                if not inner_success:
                    err_msg = result.get("message", "UE reported import failure")
                    print(f"[mcp_import_model] Step 3g FAILED (inner): {err_msg}")
                    return {"success": False, "message": err_msg, "ue_asset_path": None}
                return {
                    "success": True,
                    "message": result.get("message", "Import successful"),
                    "ue_asset_path": result.get("full_path"),
                }
            else:
                err_msg = response.get("error", response.get("message", "Import failed"))
                print(f"[mcp_import_model] Step 3g FAILED (outer): {err_msg}")
                return {"success": False, "message": err_msg, "ue_asset_path": None}

        print(f"[mcp_import_model] Step 3f FAILED: No response from UE")
        return {"success": False, "message": "No response from UE", "ue_asset_path": None}

    except socket.timeout:
        print(f"[mcp_import_model] Step 3 ERROR: MCP request timeout ({SOCKET_TIMEOUT}s)")
        return {"success": False, "message": f"MCP request timeout ({SOCKET_TIMEOUT}s)", "ue_asset_path": None}
    except ConnectionRefusedError:
        print(f"[mcp_import_model] Step 3 ERROR: Connection refused - UE MCP server not running")
        return {"success": False, "message": "UE MCP server not running. Please start UnrealMCP plugin.", "ue_asset_path": None}
    except Exception as e:
        print(f"[mcp_import_model] Step 3 ERROR: {e}")
        return {"success": False, "message": f"MCP error: {str(e)}", "ue_asset_path": None}


def execute_ue_command(
    python_code: str,
    ue_project_path: Optional[str] = None,
    timeout: int = BRIDGE_RESULT_TIMEOUT,
) -> dict:
    """
    通过命令桥接在 UE 中执行 Python 代码

    流程：
    1. 将 Python 代码写入命令文件（cmd_{timestamp}.json）
    2. UE 端的桥接脚本检测到后自动执行
    3. 执行结果写入响应文件（cmd_{timestamp}.json.result）
    4. 本函数轮询读取响应文件并返回结果

    Args:
        python_code: 要在 UE 中执行的 Python 代码
        ue_project_path: UE .uproject 文件路径，不填则自动搜索
        timeout: 等待执行结果的最大时间（秒），默认 300s

    Returns:
        {"success": bool, "output": str, "error": str, "execution_time": float}
    """
    import json
    import time
    import uuid
    
    bridge_dir = get_bridge_dir(ue_project_path)
    if not bridge_dir:
        return {
            "success": False,
            "output": "",
            "error": "未找到 UE 项目，无法发送命令。请确认 UE 项目存在或提供 ue_project_path。",
            "execution_time": 0,
        }
    
    # 创建桥接目录
    os.makedirs(bridge_dir, exist_ok=True)
    
    # 生成唯一命令 ID
    cmd_id = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
    cmd_filename = f"cmd_{cmd_id}.json"
    cmd_filepath = os.path.join(bridge_dir, cmd_filename)
    result_filepath = cmd_filepath + ".result"
    
    # 写入命令文件
    command = {
        "id": cmd_id,
        "code": python_code,
        "timestamp": time.time(),
    }
    
    try:
        with open(cmd_filepath, "w", encoding="utf-8") as f:
            json.dump(command, f, ensure_ascii=False)
        
        print(f"[UE Bridge] Command sent: {cmd_id} ({len(python_code)} chars)")
    except Exception as e:
        return {
            "success": False,
            "output": "",
            "error": f"写入命令文件失败: {str(e)}",
            "execution_time": 0,
        }
    
    # 轮询等待结果
    start_time = time.time()
    poll_count = 0
    _user_notified = False
    
    while time.time() - start_time < timeout:
        poll_count += 1
        
        # 检查响应文件
        if os.path.exists(result_filepath):
            try:
                with open(result_filepath, "r", encoding="utf-8") as f:
                    result = json.load(f)
                
                execution_time = time.time() - start_time
                
                # 清理文件
                try:
                    os.remove(result_filepath)
                except:
                    pass
                
                print(f"[UE Bridge] Result received: {cmd_id} ({execution_time:.1f}s, {poll_count} polls)")
                
                return {
                    "success": result.get("success", False),
                    "output": result.get("output", ""),
                    "error": result.get("error", ""),
                    "execution_time": round(execution_time, 2),
                    "cmd_id": cmd_id,
                }
            except json.JSONDecodeError:
                # 响应文件可能还在写入中
                pass
        
        # v7 手动模式：命令文件存在超过 3 秒仍未有结果，提示用户手动执行
        if not _user_notified and (time.time() - start_time) > 3:
            if os.path.exists(cmd_filepath):
                _user_notified = True
                print(f"[UE Bridge] 等待用户在 UE Cmd 选项卡运行 process_now()...")
                print(f"[UE Bridge] UE 日志中应已显示提示。命令文件: {cmd_filename}")
        
        time.sleep(BRIDGE_POLL_INTERVAL)
    
    # 超时
    execution_time = time.time() - start_time

    print(f"[UE Bridge] Command timeout: {cmd_id} ({execution_time:.1f}s)")

    # 超时后不删除命令文件，process_now() 仍可处理
    # 只清理可能存在的旧 result 文件，避免读到过期结果
    try:
        if os.path.exists(result_filepath):
            os.remove(result_filepath)
    except Exception:
        pass

    return {
        "success": False,
        "output": "",
        "error": (
            f"命令执行超时（{int(execution_time)}秒）。\n\n"
            "请在 UE Output Log → Cmd 选项卡中运行以下命令：\n"
            "py import sys; sys.path.append(r'd:\\3DPro\\3DDesktopApp\\backend'); "
            "import ue_command_bridge; ue_command_bridge.process_now()\n\n"
            "运行后请重新调用此工具。"
        ),
        "execution_time": round(execution_time, 2),
        "cmd_id": cmd_id,
    }


def parse_ue_output_log(log_path: str, log_type: str = "Error") -> dict:
    """
    解析 UE 输出日志文件获取错误/警告

    UE 日志格式示例：
    LogUObjectHash: Compiling FUObjectHashTables...
    LogOutputDevice: Warning: ...
    LogInit: Error: ...
    Error: ...
    Warning: ...
    """
    if not os.path.exists(log_path):
        return {
            "success": False,
            "errors": [],
            "warnings": [],
            "error_count": 0,
            "warning_count": 0,
            "message": f"UE 输出日志不存在: {log_path}",
            "source": "output_log"
        }

    try:
        from collections import deque

        # 只读取最后 3000 行
        lines = []
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = list(deque(f, 3000))

        errors = []
        warnings = []

        # UE 日志错误模式
        # 格式1: LogCategory: Error: message
        error_pattern_1 = r'^(?:Log\w+):\s*Error:\s*(.+)$'
        # 格式2: Error: message
        error_pattern_2 = r'^Error:\s*(.+)$'
        # 格式3: Error (行号): message  (编译错误)
        error_pattern_3 = r'^Error\s*\(([^)]+)\):\s*(.+)$'
        # 格式4: [文件路径]: Error: message
        error_pattern_4 = r'^(.+?)\((\d+)\):\s*Error\s*(.+)$'

        # UE 日志警告模式
        warning_pattern_1 = r'^(?:Log\w+):\s*Warning:\s*(.+)$'
        warning_pattern_2 = r'^Warning:\s*(.+)$'

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 尝试匹配各种错误格式
            match = re.match(error_pattern_4, line)
            if match:
                errors.append({
                    "type": "Error",
                    "file": match.group(1).strip(),
                    "line": int(match.group(2)),
                    "message": match.group(3).strip()
                })
                continue

            match = re.match(error_pattern_3, line)
            if match:
                errors.append({
                    "type": "Error",
                    "line": match.group(1).strip(),
                    "message": match.group(2).strip()
                })
                continue

            match = re.match(error_pattern_1, line, re.IGNORECASE)
            if match:
                errors.append({
                    "type": "Error",
                    "message": match.group(1).strip()
                })
                continue

            match = re.match(error_pattern_2, line, re.IGNORECASE)
            if match:
                errors.append({
                    "type": "Error",
                    "message": match.group(1).strip()
                })
                continue

            # 尝试匹配警告格式
            match = re.match(warning_pattern_1, line, re.IGNORECASE)
            if match:
                warnings.append({
                    "type": "Warning",
                    "message": match.group(1).strip()
                })
                continue

            match = re.match(warning_pattern_2, line, re.IGNORECASE)
            if match:
                warnings.append({
                    "type": "Warning",
                    "message": match.group(1).strip()
                })
                continue

        # 根据请求类型过滤
        if log_type == "Error":
            warnings = []
        elif log_type == "Warning":
            errors = []

        # 只返回最近的 50 条
        errors = errors[-50:] if len(errors) > 50 else errors
        warnings = warnings[-50:] if len(warnings) > 50 else warnings

        return {
            "success": True,
            "errors": errors,
            "warnings": warnings,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "source": "output_log"
        }

    except Exception as e:
        return {
            "success": False,
            "errors": [],
            "warnings": [],
            "error_count": 0,
            "warning_count": 0,
            "message": f"解析 UE 输出日志失败: {str(e)}",
            "source": "output_log"
        }


class UEIntegration:
    """Unreal Engine 集成服务类"""

    def __init__(self, plugin_url: str = UE_PLUGIN_URL):
        self.plugin_url = plugin_url

    def check_plugin_status(self) -> bool:
        """
        检查 UE 插件是否可用

        与 Unity 不同，即使 UE 插件不可用，
        我们仍然可以通过直接读取日志文件来获取错误信息。
        """
        try:
            response = requests.get(
                f"{self.plugin_url}/api/health",
                timeout=2
            )
            return response.status_code == 200
        except requests.RequestException:
            return False

    def _resolve_local_file_path(self, scene_id: str) -> Optional[str]:
        """
        尝试从数据库和本地存储中解析模型文件的本地路径。

        优先级：
        1. SceneHistory 的 local_path（场景级别）
        2. SceneObjectRecord 中第一个 ready 对象的 local_path
        3. storage/object_files/{object_id}.cached
        4. 场景存储目录中的文件
        """
        import os
        try:
            from history_models import get_object_record, SceneHistory, Session as DBSession, select, engine

            # 优先级1: 查 SceneHistory
            with DBSession(engine) as db:
                scene = db.exec(select(SceneHistory).where(SceneHistory.scene_id == scene_id)).first()
                if scene and getattr(scene, "local_path", None) and os.path.exists(scene.local_path):
                    return scene.local_path

            # 优先级2: 查 SceneObjectRecord 中该场景下的 ready 对象
            with DBSession(engine) as db:
                from history_models import SceneObjectRecord as SOR
                records = db.exec(
                    select(SOR).where(
                        SOR.scene_id == scene_id,
                        SOR.status == "ready"
                    ).limit(10)
                ).all()
                for r in records:
                    lp = getattr(r, "local_path", None)
                    if lp and os.path.exists(lp):
                        return lp

            # 优先级3: 检查 object_files 缓存
            storage_dir = Path(__file__).resolve().parent / "storage" / "object_files"
            if storage_dir.exists():
                for f in storage_dir.iterdir():
                    if f.suffix in (".glb", ".fbx", ".obj", ".stl") and f.stat().st_size > 0:
                        return str(f)

            # 优先级4: 检查场景存储目录
            base_dir = Path(__file__).resolve().parent / "storage" / "scenes" / scene_id
            if base_dir.exists():
                for f in base_dir.iterdir():
                    if f.suffix in (".glb", ".fbx", ".obj", ".stl") and f.is_file():
                        return str(f)

        except Exception as e:
            print(f"[UE Integration] _resolve_local_file_path error: {e}")

        return None

    def import_scene_to_ue(
        self,
        scene_url: str,
        scene_id: str,
        ue_path: Optional[str] = None
    ) -> dict:
        """
        将场景导入到 UE 项目

        Args:
            scene_url: 场景文件 URL（GLB/FBX/OBJ 等）或本地路径
            scene_id: 场景 ID
            ue_path: UE 项目路径

        Returns:
            包含导入结果的字典
        """
        # 先检查插件是否可用
        if not self.check_plugin_status():
            return {
                "success": False,
                "message": "UE 插件服务不可用（端口 3030）。请确认 UE 编辑器已打开并在 Python 控制台中运行了 ue_plugin_server.py",
            }

        try:
            file_data: bytes

            # 尝试从数据库获取本地路径（避免 URL 过期问题）
            local_file_path = self._resolve_local_file_path(scene_id)
            if local_file_path and os.path.exists(local_file_path):
                print(f"[UE Integration] Using local file: {local_file_path}")
                with open(local_file_path, "rb") as f:
                    file_data = f.read()
            else:
                # 回退到从 URL 下载
                print(f"[UE Integration] Downloading model from: {scene_url}")
                response = requests.get(scene_url, timeout=60)
                if response.status_code != 200:
                    return {
                        "success": False,
                        "message": f"下载模型文件失败 (HTTP {response.status_code})",
                    }
                file_data = response.content

            print(f"[UE Integration] Got {len(file_data)} bytes")
            
            import base64
            base64_data = base64.b64encode(file_data).decode('utf-8')

            request_data = {
                "fileName": f"scene_{scene_id}.glb",
                "fileData": base64_data,
                "autoImport": True
            }

            if ue_path:
                request_data["uePath"] = ue_path

            # 调用 UE 插件 API
            print(f"[UE Integration] Calling UE plugin /api/import-scene...")
            ue_response = requests.post(
                f"{self.plugin_url}/api/import-scene",
                json=request_data,
                timeout=120  # 导入可能需要较长时间
            )

            if ue_response.status_code != 200:
                return {
                    "success": False,
                    "message": f"UE 插件返回错误 (HTTP {ue_response.status_code})",
                }

            result = ue_response.json()
            return {
                "success": result.get("success", True),
                "message": result.get("message", "导入成功"),
                "filePath": result.get("filePath")
            }

        except requests.Timeout:
            return {
                "success": False,
                "message": "请求 UE 插件超时，模型文件可能过大或 UE 正在处理中",
            }
        except requests.RequestException as e:
            return {
                "success": False,
                "message": f"UE 插件通信失败: {str(e)}",
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"导入过程出错: {str(e)}",
            }

    def get_output_log_errors(
        self,
        log_type: str = "Error",
        ue_project_path: Optional[str] = None
    ) -> dict:
        """
        获取 UE 输出日志中的错误/警告

        UE 的优势：即使有编译错误，日志文件仍然可读。
        不需要像 Unity 那样依赖插件 API。

        策略：
        1. 先尝试通过 UE 插件 HTTP API 获取（如果插件可用）
        2. 无论插件是否可用，都直接读取 Output.log 文件作为主要来源

        Args:
            log_type: 日志类型，"Error"(仅错误), "Warning"(仅警告), "All"(全部)
            ue_project_path: UE 项目路径

        Returns:
            包含日志信息的字典
        """
        # 确定项目路径
        project_path = ue_project_path or find_ue_project_path()

        # 方案1：尝试通过 UE 插件 API 获取（如果可用）
        try:
            response = requests.post(
                f"{self.plugin_url}/api/console-errors",
                json={
                    "logType": log_type,
                },
                timeout=5
            )

            if response.status_code == 200:
                data = response.json()
                errors = data.get("errors", [])
                warnings = data.get("warnings", [])
                return {
                    "success": True,
                    "has_errors": len(errors) > 0,
                    "errors": errors,
                    "has_warnings": len(warnings) > 0,
                    "warnings": warnings,
                    "error_count": len(errors),
                    "warning_count": len(warnings),
                    "source": "ue_plugin",
                }
        except (requests.Timeout, requests.RequestException):
            pass  # 回退到直接读日志文件

        # 方案2：直接读取 UE Output.log 文件
        # 这是 UE 的主要方案，比 Unity 的 Editor.log 更可靠
        log_path = find_ue_output_log(project_path)

        if not log_path:
            return {
                "success": False,
                "has_errors": False,
                "errors": [],
                "has_warnings": False,
                "warnings": [],
                "error_count": 0,
                "warning_count": 0,
                "message": "未找到 UE 输出日志。请确认 UE 编辑器已打开，或设置 UE_PROJECT_PATH 环境变量。",
                "source": "output_log"
            }

        result = parse_ue_output_log(log_path, log_type)

        if result.get("success"):
            result["has_errors"] = len(result.get("errors", [])) > 0
            result["has_warnings"] = len(result.get("warnings", [])) > 0
            if not result.get("message"):
                result["message"] = f"已从 UE 输出日志读取: {os.path.basename(log_path)}"
        else:
            result["has_errors"] = False
            result["has_warnings"] = False
            result["errors"] = []
            result["warnings"] = []
            result["error_count"] = 0
            result["warning_count"] = 0

        return result

    def get_project_info(self) -> dict:
        """
        获取 UE 项目信息

        Returns:
            包含项目路径、UE 版本等信息的字典
        """
        project_path = find_ue_project_path()

        info = {
            "project_found": project_path is not None,
            "project_path": project_path,
        }

        if project_path and os.path.exists(project_path):
            try:
                import json
                with open(project_path, "r", encoding="utf-8") as f:
                    uproject = json.load(f)
                info["engine_version"] = uproject.get("EngineAssociation", "Unknown")
                info["project_name"] = os.path.splitext(os.path.basename(project_path))[0]
            except Exception:
                pass

        # 检查插件状态
        info["plugin_available"] = self.check_plugin_status()

        return info


# 创建全局实例
ue_integration = UEIntegration()
