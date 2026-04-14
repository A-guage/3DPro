"""
Unity 集成模块
处理将 3D 场景导入到 Unity 项目的逻辑
"""
import requests
import base64
import os
import re
from pathlib import Path
from typing import Optional, List, Dict
from fastapi import HTTPException

# Unity 插件配置
UNITY_PLUGIN_URL = "http://localhost:3030"

# Unity Editor 日志文件路径（Windows）
UNITY_EDITOR_LOG_PATH = os.path.join(
    os.environ.get("LOCALAPPDATA", ""),
    "Unity", "Editor", "Editor.log"
)


def parse_unity_editor_log(log_path: str, log_type: str = "Error") -> dict:
    """
    直接解析 Unity Editor.log 文件获取错误/警告
    
    这是在 Unity 插件无法运行（如编译错误时）的备选方案。
    
    Args:
        log_path: Editor.log 文件路径
        log_type: "Error", "Warning", "All"
    
    Returns:
        包含错误/警告列表的字典
    """
    if not os.path.exists(log_path):
        return {
            "success": False,
            "errors": [],
            "warnings": [],
            "error_count": 0,
            "warning_count": 0,
            "message": f"Unity Editor.log 不存在: {log_path}",
            "source": "editor_log"
        }
    
    try:
        # 只读取最后 2000 行，避免大文件超时
        max_lines = 2000
        lines = []
        
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            # 使用 deque 高效读取最后 N 行
            from collections import deque
            lines = list(deque(f, max_lines))
        
        errors = []
        warnings = []
        
        # 匹配编译错误格式: file(line,col): error code: message
        compile_error_pattern = r'^(Assets/[^\s]+\.cs)\((\d+),(\d+)\):\s*(error|warning)\s+([A-Z]+\d+):\s*(.+)$'
        
        # 匹配 Unity 日志格式: [error] 或 [warning] 开头
        log_format_pattern = r'^\[(error|warning|Error|Warning)\]\s*(.+)$'
        
        # 匹配 CompilerError 格式
        compiler_error_pattern = r'^\[CompilerError\]\s*(.+)$'
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # 尝试匹配编译错误格式
            match = re.match(compile_error_pattern, line, re.IGNORECASE)
            if match:
                file_path = match.group(1)
                line_num = int(match.group(2))
                col_num = int(match.group(3))
                level = match.group(4).lower()
                error_code = match.group(5)
                message = match.group(6)
                
                entry = {
                    "type": "Error" if level == "error" else "Warning",
                    "file": file_path,
                    "line": line_num,
                    "column": col_num,
                    "code": error_code,
                    "message": f"{error_code}: {message}"
                }
                
                if level == "error":
                    errors.append(entry)
                else:
                    warnings.append(entry)
                continue
            
            # 尝试匹配日志格式 [error] message
            match = re.match(log_format_pattern, line, re.IGNORECASE)
            if match:
                level = match.group(1).lower()
                message = match.group(2)
                
                # 尝试从消息中提取文件和行号
                file_match = re.search(r'(Assets/[^\s:]+\.cs)[\(:](\d+)', message)
                file_path = file_match.group(1) if file_match else ""
                line_num = int(file_match.group(2)) if file_match else 0
                
                entry = {
                    "type": "Error" if level == "error" else "Warning",
                    "file": file_path,
                    "line": line_num,
                    "message": message
                }
                
                if level == "error":
                    errors.append(entry)
                else:
                    warnings.append(entry)
                continue
            
            # 匹配 [CompilerError]
            match = re.match(compiler_error_pattern, line, re.IGNORECASE)
            if match:
                message = match.group(1)
                # 尝试提取文件信息
                file_match = re.search(r'(Assets/[^\s:]+\.cs)[\(:](\d+)', message)
                entry = {
                    "type": "Error",
                    "file": file_match.group(1) if file_match else "",
                    "line": int(file_match.group(2)) if file_match else 0,
                    "message": message
                }
                errors.append(entry)
        
        # 根据请求类型过滤
        if log_type == "Error":
            warnings = []
        elif log_type == "Warning":
            errors = []
        
        # 只返回最近的错误（最后 50 条）
        errors = errors[-50:] if len(errors) > 50 else errors
        warnings = warnings[-50:] if len(warnings) > 50 else warnings
        
        return {
            "success": True,
            "errors": errors,
            "warnings": warnings,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "source": "editor_log"
        }
        
    except Exception as e:
        return {
            "success": False,
            "errors": [],
            "warnings": [],
            "error_count": 0,
            "warning_count": 0,
            "message": f"解析 Editor.log 失败: {str(e)}",
            "source": "editor_log"
        }


class UnityIntegration:
    """Unity 集成服务类"""

    def __init__(self, plugin_url: str = UNITY_PLUGIN_URL):
        self.plugin_url = plugin_url

    def check_plugin_status(self) -> bool:
        """检查 Unity 插件是否可用"""
        try:
            response = requests.get(
                f"{self.plugin_url}/api/health",
                timeout=2
            )
            return response.status_code == 200
        except requests.RequestException:
            return False

    def import_scene_to_unity(
        self,
        scene_url: str,
        scene_id: str,
        unity_path: Optional[str] = None
    ) -> dict:
        """
        将场景导入到 Unity 项目

        Args:
            scene_url: 场景文件 URL
            scene_id: 场景 ID
            unity_path: Unity 项目路径

        Returns:
            包含导入结果的字典
        """
        try:
            # 下载 GLB 文件
            response = requests.get(scene_url, timeout=30)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"下载场景文件失败: {response.status_code}"
                )

            # 转换为 Base64
            glb_data = response.content
            base64_data = base64.b64encode(glb_data).decode('utf-8')

            # 构建请求数据
            request_data = {
                "fileName": f"scene_{scene_id}.glb",
                "fileData": base64_data,
                "autoRefresh": True
            }

            if unity_path:
                request_data["unityPath"] = unity_path

            # 调用 Unity 插件 API
            unity_response = requests.post(
                f"{self.plugin_url}/api/import-scene",
                json=request_data,
                timeout=60
            )

            if unity_response.status_code != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Unity 插件导入失败: {unity_response.status_code}"
                )

            result = unity_response.json()
            return {
                "success": True,
                "message": result.get("message", "导入成功"),
                "filePath": result.get("filePath")
            }

        except requests.Timeout:
            raise HTTPException(
                status_code=504,
                detail="请求超时，请检查网络连接或 Unity 插件状态"
            )
        except requests.RequestException as e:
            raise HTTPException(
                status_code=500,
                detail=f"Unity 插件通信失败: {str(e)}"
            )

    def get_console_errors(
        self,
        log_type: str = "Error",
        clear_after_read: bool = True,
        unity_project_path: Optional[str] = None
    ) -> dict:
        """
        获取 Unity Console 中的错误/警告日志

        优先尝试通过 Unity 插件 HTTP API 获取，
        如果插件不可用（如编译错误导致脚本未加载），
        则直接读取 Unity Editor.log 文件。

        Args:
            log_type: 日志类型，"Error"(仅错误), "Warning"(仅警告), "All"(全部)
            clear_after_read: 读取后是否清空 Console（仅插件模式有效）
            unity_project_path: Unity 项目路径（用于定位对应的 Editor.log）

        Returns:
            包含日志信息的字典: { success, has_errors, errors, has_warnings, warnings, source }
        """
        # 方案1：尝试通过 Unity 插件 HTTP API 获取
        try:
            response = requests.post(
                f"{self.plugin_url}/api/console-errors",
                json={
                    "logType": log_type,
                    "clearAfterRead": clear_after_read,
                },
                timeout=5  # 缩短超时，快速回退
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
                    "source": "unity_plugin",
                }
        except requests.Timeout:
            pass  # 继续尝试备选方案
        except requests.RequestException:
            pass  # 继续尝试备选方案

        # 方案2：直接读取 Unity Editor.log 文件
        # 这是在 Unity 有编译错误、插件无法运行时的备选方案
        result = parse_unity_editor_log(UNITY_EDITOR_LOG_PATH, log_type)
        
        if result.get("success"):
            result["has_errors"] = len(result.get("errors", [])) > 0
            result["has_warnings"] = len(result.get("warnings", [])) > 0
            result["message"] = "Unity 插件未运行，已从 Editor.log 读取（可能包含历史记录）"
        else:
            result["has_errors"] = False
            result["has_warnings"] = False
            result["errors"] = []
            result["warnings"] = []
            result["error_count"] = 0
            result["warning_count"] = 0
        
        return result

    def generate_unity_script(
        self,
        scene_description: str,
        quality: str,
        script_type: str = "scene_controller"
    ) -> dict:
        """
        生成 Unity 脚本

        Args:
            scene_description: 场景描述
            quality: 生成质量
            script_type: 脚本类型

        Returns:
            包含生成的脚本内容
        """
        # 这里可以调用 AI 生成脚本
        # 当前返回基础脚本模板
        script_templates = {
            "scene_controller": '''using UnityEngine;
using System.Collections.Generic;

public class SceneController : MonoBehaviour
{
    // 场景控制逻辑
    void Start()
    {
        Debug.Log("场景已加载");
    }

    void Update()
    {
        // 更新逻辑
    }
}
''',
            "object_behavior": '''using UnityEngine;

public class ObjectBehavior : MonoBehaviour
{
    // 对象行为逻辑
    void Start()
    {
        Debug.Log("对象已就绪");
    }
}
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
            "fileName": f"{script_type}.cs"
        }


# 创建全局实例
unity_integration = UnityIntegration()
