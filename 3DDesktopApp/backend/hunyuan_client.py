"""
腾讯混元生3D API 客户端（使用腾讯云官方 SDK - CommonClient 版本）。

参考文档：
- https://cloud.tencent.com/document/product/1804/123463 (提交任务)
- https://cloud.tencent.com/document/product/1804/123464 (查询任务)
- https://github.com/TencentCloud/tencentcloud-sdk-python (SDK)
"""

import sys
from typing import Any, Dict

# 尝试从两个可能的位置导入 CommonClient
try:
    # 新版本SDK的可能位置
    from tencentcloud.common.common_client import CommonClient
    from tencentcloud.common import credential
    from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
except ImportError:
    # 如果上述导入失败，尝试备用路径（某些旧版本）
    try:
        from tencentcloud.common.common_client import CommonClient
        from tencentcloud.common.credential import Credential
        credential = sys.modules[__name__]  # 创建一个模拟模块
        credential.Credential = Credential
        from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
        from tencentcloud.common.profile.client_profile import ClientProfile
        from tencentcloud.common.profile.http_profile import HttpProfile
    except ImportError:
        raise ImportError(
            "无法导入腾讯云SDK，请确保已安装: pip install tencentcloud-sdk-python\n"
            "如果已安装但仍报错，请尝试升级: pip install --upgrade tencentcloud-sdk-python"
        )

from config import (
    TENCENT_REGION,
    TENCENT_SECRET_ID,
    TENCENT_SECRET_KEY,
    HUNYUAN_ENDPOINT,
    HUNYUAN_VERSION,
    HUNYUAN_3D_CREATE_ACTION,
    HUNYUAN_3D_STATUS_ACTION,
)

# 全局客户端实例（单例）
_client_instance: CommonClient | None = None


def _get_client() -> CommonClient:
    """获取或创建全局 CommonClient 实例"""
    global _client_instance
    
    if _client_instance is None:
        try:
            # 1. 创建凭证
            cred = credential.Credential(
                secret_id=TENCENT_SECRET_ID,
                secret_key=TENCENT_SECRET_KEY,
            )
            
            # 2. 配置 HTTP 参数
            http_profile = HttpProfile()
            http_profile.endpoint = HUNYUAN_ENDPOINT  # 例如 "ai3d.tencentcloudapi.com"
            http_profile.reqMethod = "POST"
            http_profile.reqTimeout = 30  # 请求超时时间（秒）
            
            # 3. 配置客户端
            client_profile = ClientProfile()
            client_profile.httpProfile = http_profile
            client_profile.signMethod = "TC3-HMAC-SHA256"  # 必须为此签名方法
            
            # 4. 创建 CommonClient - 关键修复！
            # 根据官方示例，使用位置参数而非关键字参数
            # 参数顺序: product, version, credential, region, profile
            # 如果仍有问题，尝试删除 profile 参数
            
            # 方案A：按照官方示例使用位置参数（推荐先尝试）
            try:
                print(f"[DEBUG] 尝试方案A: 位置参数初始化")
                _client_instance = CommonClient(
                    "ai3d",            # product - 必须是 "ai3d" 而不是从endpoint提取
                    HUNYUAN_VERSION,   # version
                    cred,              # credential
                    TENCENT_REGION,    # region
                    client_profile     # profile (可选)
                )
            except TypeError as e:
                # 方案B：如果位置参数也不对，尝试另一种常见的参数顺序
                print(f"[DEBUG] 方案A失败: {e}, 尝试方案B")
                _client_instance = CommonClient(
                    "ai3d",            # product/module
                    HUNYUAN_VERSION,   # version
                    cred,              # credential
                    TENCENT_REGION,    # region
                    profile=client_profile  # 使用关键字参数
                )
            
            print(f"[DEBUG] CommonClient 初始化成功")
            
        except Exception as e:
            raise RuntimeError(f"初始化腾讯云客户端失败: {e}") from e
    
    return _client_instance


def _call_hunyuan_api(action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    调用腾讯混元生3D API
    
    Args:
        action: API 动作名，如 "SubmitHunyuanTo3DRapidJob"
        params: 请求参数
        
    Returns:
        API 响应中的 Response 部分
        
    Raises:
        RuntimeError: API 调用失败
    """
    try:
        client = _get_client()
        
        print(f"[DEBUG] 调用API: {action}, 参数: {params}")
        
        # 调用 API
        # CommonClient.call_json 返回完整响应，包含 Response 和 RequestId
        full_response = client.call_json(action, params)
        
        # 检查响应结构
        if "Response" not in full_response:
            raise RuntimeError(f"API返回格式异常，缺少Response字段: {full_response}")
        
        resp = full_response["Response"]
        
        # 检查错误
        if "Error" in resp:
            err = resp["Error"]
            code = err.get("Code", "Unknown")
            message = err.get("Message", "Unknown error")
            request_id = full_response.get("RequestId", "Unknown")
            raise RuntimeError(
                f"腾讯混元API调用失败，Code={code}, Message={message}, RequestId={request_id}"
            )
        
        print(f"[DEBUG] API调用成功，RequestId: {full_response.get('RequestId')}")
        return resp
        
    except TencentCloudSDKException as e:
        raise RuntimeError(f"腾讯云SDK异常: {e}") from e
    except Exception as e:
        raise RuntimeError(f"调用腾讯混元API时发生未知错误: {e}") from e


def create_3d_job(
    prompt: str,
    result_format: str = "GLB",
    enable_pbr: bool = False,
    enable_geometry: bool = False,
) -> str:
    """
    创建混元生3D极速版任务
    
    Args:
        prompt: 文生3D的描述文本，中文正向提示词，最多200个字符
        result_format: 生成模型格式，可选：OBJ, GLB, STL, USDZ, FBX, MP4
        enable_pbr: 是否开启PBR材质生成
        enable_geometry: 是否开启单几何生成（白模）
    
    Returns:
        任务ID (JobId)
    """
    params = {
        "Prompt": prompt,
        "ResultFormat": result_format,
        "EnablePBR": enable_pbr,
        "EnableGeometry": enable_geometry,
    }
    
    resp = _call_hunyuan_api(HUNYUAN_3D_CREATE_ACTION, params)
    
    job_id = resp.get("JobId")
    if not job_id:
        raise RuntimeError(f"API响应中未找到JobId字段: {resp}")
    
    print(f"[DEBUG] 3D任务创建成功，JobId: {job_id}")
    return job_id


def get_3d_job_status(job_id: str) -> Dict[str, Any]:
    """
    查询混元生3D极速版任务状态

    Args:
        job_id: 任务ID

    Returns:
        状态字典:
        {
            "status": "PROCESSING" | "DONE" | "FAILED" | "UNKNOWN",
            "model_url": "模型URL（如果已生成）",
            "file_type": "FBX" | "GLB" | "OBJ" | ...,
            "raw": 原始响应数据
        }
    """
    params = {"JobId": job_id}

    resp = _call_hunyuan_api(HUNYUAN_3D_STATUS_ACTION, params)

    status = resp.get("Status", "UNKNOWN")

    model_url = None
    file_type = None
    result_files = resp.get("ResultFile3Ds", [])

    if result_files:
        for file_info in result_files:
            file_type = file_info.get("Type")
            if file_type:
                model_url = file_info.get("Url")
                break

        if not model_url and result_files:
            model_url = result_files[0].get("Url")

    return {
        "status": status,
        "model_url": model_url,
        "file_type": file_type,
        "raw": resp,
    }


# 可选：简单的自测代码
if __name__ == "__main__":
    print("=== 测试腾讯混元生3D SDK ===")
    
    try:
        # 测试1：创建任务
        print("\n1. 测试创建任务...")
        test_job_id = create_3d_job(
            prompt="一个简单的立方体",
            result_format="FBX",
            enable_pbr=False,
            enable_geometry=False
        )
        print(f"   创建成功！JobId: {test_job_id}")
        
        # 测试2：查询状态
        print("\n2. 测试查询状态...")
        status_info = get_3d_job_status(test_job_id)
        print(f"   任务状态: {status_info['status']}")
        if status_info['model_url']:
            print(f"   模型URL: {status_info['model_url']}")
        
        print("\n=== 所有测试通过！===")
        
    except Exception as e:
        print(f"\n!!! 测试失败: {e}")
        print("\n请检查：")
        print("1. 是否已安装 tencentcloud-sdk-python (pip install tencentcloud-sdk-python)")
        print("2. 环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY 是否正确设置")
        print("3. 密钥是否有混元生3D产品的权限")