import os
from dotenv import dotenv_values

# 直接从 .env 文件读取配置，不依赖系统环境变量
env_path = os.path.join(os.path.dirname(__file__), ".env")
env_config = dotenv_values(env_path)

"""
Global configuration and key management.
"""

TENCENT_SECRET_ID = env_config.get("TENCENT_SECRET_ID", "") or os.getenv("TENCENT_SECRET_ID", "")
TENCENT_SECRET_KEY = env_config.get("TENCENT_SECRET_KEY", "") or os.getenv("TENCENT_SECRET_KEY", "")

# Allow running without Tencent keys (DeepSeek only mode)
if not TENCENT_SECRET_ID or not TENCENT_SECRET_KEY:
    print("[WARNING] TENCENT_SECRET_ID / TENCENT_SECRET_KEY not configured. 3D generation will be disabled.")
    TENCENT_SECRET_ID = TENCENT_SECRET_ID or ""
    TENCENT_SECRET_KEY = TENCENT_SECRET_KEY or ""

TENCENT_REGION = env_config.get("TENCENT_REGION", "") or os.getenv("TENCENT_REGION", "ap-guangzhou")

# Tencent Hunyuan 3D API Configuration
HUNYUAN_ENDPOINT = env_config.get("HUNYUAN_ENDPOINT", "") or os.getenv("HUNYUAN_ENDPOINT", "ai3d.tencentcloudapi.com")
HUNYUAN_SERVICE = env_config.get("HUNYUAN_SERVICE", "") or os.getenv("HUNYUAN_SERVICE", "ai3d")
HUNYUAN_VERSION = env_config.get("HUNYUAN_VERSION", "") or os.getenv("HUNYUAN_VERSION", "2025-05-13")

# Hunyuan 3D Rapid API Actions
HUNYUAN_3D_CREATE_ACTION = env_config.get("HUNYUAN_3D_CREATE_ACTION", "") or os.getenv("HUNYUAN_3D_CREATE_ACTION", "SubmitHunyuanTo3DRapidJob")
HUNYUAN_3D_STATUS_ACTION = env_config.get("HUNYUAN_3D_STATUS_ACTION", "") or os.getenv("HUNYUAN_3D_STATUS_ACTION", "QueryHunyuanTo3DRapidJob")
