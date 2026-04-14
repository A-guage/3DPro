import json
import os
import re
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def _load_api_key() -> str:
    key = os.getenv("DEEPSEEK_API_KEY")
    if key:
        return key
    key_file = os.path.join(os.path.dirname(__file__), "deepseek_key")
    if os.path.exists(key_file):
        with open(key_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    raise RuntimeError("未配置 DeepSeek API Key，请设置环境变量 DEEPSEEK_API_KEY 或在项目根目录创建 deepseek_key 文件。")


DEEPSEEK_API_KEY = _load_api_key()


def _chat_completion(messages: List[Dict[str, str]], temperature: float = 0.7) -> str:
    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": temperature,
    }
    resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=60)
    resp.raise_for_status()
    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except Exception as e:
        raise RuntimeError(f"解析 DeepSeek 返回结果失败：{data}") from e
    return content.strip()


def extract_json_from_response(response_text: str) -> Dict[str, Any]:
    """
    从DeepSeek响应中提取JSON对象。
    支持两种格式：
    1. 纯JSON字符串：直接解析
    2. Markdown代码块包裹的JSON：提取并解析
    
    Args:
        response_text: DeepSeek API返回的文本内容（通常是content字段）
        
    Returns:
        解析后的Python字典
        
    Raises:
        ValueError: 无法提取或解析JSON时抛出
        json.JSONDecodeError: JSON格式错误时抛出
    """
    if not response_text:
        raise ValueError("响应文本为空")
    
    # 清理文本，去除首尾空白
    text = response_text.strip()
    
    # 方法1：尝试直接解析（如果是纯JSON）
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass  # 如果不是纯JSON，继续尝试方法2
    
    # 方法2：尝试从markdown代码块中提取JSON
    # 匹配格式：```json ... ``` 或 ``` ... ```
    json_patterns = [
        r'```json\s*(.*?)\s*```',  # 匹配 ```json { ... } ```
        r'```\s*(.*?)\s*```',      # 匹配 ``` { ... } ```
    ]
    
    for pattern in json_patterns:
        match = re.search(pattern, text, re.DOTALL)  # re.DOTALL让.匹配换行符
        if match:
            json_str = match.group(1).strip()
            try:
                return json.loads(json_str)
            except json.JSONDecodeError as e:
                # 记录但继续尝试其他模式
                print(f"[DEBUG] 模式 '{pattern}' 匹配到内容但JSON解析失败: {e}")
                continue
    
    # 如果以上方法都失败，尝试查找第一个{和最后一个}之间的内容
    start = text.find('{')
    end = text.rfind('}')
    
    if start != -1 and end != -1 and start < end:
        json_str = text[start:end+1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
    
    # 所有方法都失败，抛出详细错误
    raise ValueError(
        f"无法从响应中提取有效JSON。响应前200字符: {text[:200]}..."
    )


def refine_scene_prompt(description: str, quality: str = "medium") -> str:
    system_prompt = f"""
你是一个3D场景设计助理，负责把中文场景描述转换成适合3D生成模型的英文提示词。
请根据不同质量档位控制细节：
- low: 低多边形风格，细节较少，适合快速预览
- medium: 适中细节，兼顾质量与速度
- high: 高细节，适合最终展示

输出要求：
- 使用英文
- 一段简洁的描述，重点描述场景主体、风格、光照氛围等
- 不要输出多余解释，只输出描述本身
当前质量档位：{quality}
""".strip()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": description},
    ]
    return _chat_completion(messages, temperature=0.7)


def plan_scene_objects(description: str, quality: str = "medium") -> Dict[str, Any]:
    """
    场景规划：使用DeepSeek将场景描述分解为物体清单
    
    Args:
        description: 场景中文描述
        quality: 生成质量
        
    Returns:
        物体清单JSON
    """
    system_prompt = """
你是一个3D场景规划专家。请将用户的场景描述分解为独立的、可生成的3D模型组件。
输出严格符合JSON格式，仅输出JSON字符串。
JSON结构为：
{
  "objects": [
    {
      "object_id": "sofa_001",
      "description": "一个简约的灰色布艺三人沙发，长度约2米，高度0.7米，材质为布料",
      "label": "furniture.sofa.living_room",
      "estimated_size": {"x": 2.0, "y": 0.7, "z": 0.9},
      "default_position": {"x": 0.0, "y": 0.0, "z": -2.0},
      "priority": 1
    }
  ]
}
请根据质量档位控制物体数量与细节，但始终保证JSON语法正确且可被解析。
""".strip()
    user_content = f"质量档位：{quality}\n场景描述：{description}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    content = _chat_completion(messages, temperature=0.4)
    
    # 使用增强的JSON提取函数替换原来的直接解析
    try:
        data = extract_json_from_response(content)
    except (ValueError, json.JSONDecodeError) as e:
        raise RuntimeError(f"DeepSeek 场景分解结果解析失败: {str(e)}\n原始响应:\n{content[:500]}") from e
    
    # 验证必要的字段
    if not isinstance(data, dict) or "objects" not in data or not isinstance(data["objects"], list):
        raise RuntimeError(f"DeepSeek 场景分解结果结构不符合预期：{data}")
    
    return data


def compose_scene_layout(objects_info: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    场景合成：使用DeepSeek生成场景布局
    
    Args:
        objects_info: 已生成物体的信息列表
        
    Returns:
        场景布局JSON
    """
    system_prompt = """
所有3D物体模型已生成完成，现在需要将它们组合成一个完整的场景。
根据物体的类型、估计尺寸和默认位置，为每个物体生成合理的最终位置、旋转和缩放。
输出严格符合JSON格式，仅输出JSON字符串：
{
  "scene_composition": {
    "objects": [
      {
        "object_id": "sofa_001",
        "position": {"x": 1.5, "y": 0.0, "z": -2.0},
        "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
        "scale": {"x": 1.0, "y": 1.0, "z": 1.0}
      }
    ]
  }
}
""".strip()
    objects_json = json.dumps(objects_info, ensure_ascii=False)
    user_content = f"可用物体列表：{objects_json}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    content = _chat_completion(messages, temperature=0.4)
    
    # 使用增强的JSON提取函数替换原来的直接解析
    try:
        data = extract_json_from_response(content)
    except (ValueError, json.JSONDecodeError) as e:
        raise RuntimeError(f"DeepSeek 场景合成结果解析失败: {str(e)}\n原始响应:\n{content[:500]}") from e
    
    # 验证必要的字段
    if (
        not isinstance(data, dict)
        or "scene_composition" not in data
        or not isinstance(data["scene_composition"], dict)
        or "objects" not in data["scene_composition"]
    ):
        raise RuntimeError(f"DeepSeek 场景合成结果结构不符合预期：{data}")
    
    return data


# 测试函数
def test_json_extraction():
    """测试JSON提取功能"""
    test_cases = [
        # 纯JSON
        '{"objects": [{"object_id": "test"}]}',
        # 带json标记的代码块
        '```json\n{"objects": [{"object_id": "test"}]}\n```',
        # 不带标记的代码块
        '```\n{"objects": [{"object_id": "test"}]}\n```',
        # 包含额外文本的响应
        '这是DeepSeek的回复：\n```json\n{"objects": [{"object_id": "test"}]}\n```\n希望这对你有帮助。',
    ]
    
    for i, test_case in enumerate(test_cases):
        try:
            result = extract_json_from_response(test_case)
            print(f"测试用例 {i+1} 成功: {result}")
        except Exception as e:
            print(f"测试用例 {i+1} 失败: {e}")


if __name__ == "__main__":
    print("测试JSON提取功能...")
    test_json_extraction()