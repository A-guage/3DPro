#!/usr/bin/env python3
"""
调试 import_asset_file 函数
在 UE 的 Cmd 选项卡中运行此脚本
"""

import sys
sys.path.append(r"d:\3DPro\3DDesktopApp\backend")

# 直接在 UE 中测试 import_asset_file 函数
import unreal
import os
import re

def test_import_asset_file(file_path, destination_path="/Game/Imports"):
    """测试导入函数并打印详细日志"""
    print(f"=" * 60)
    print(f"测试导入文件: {file_path}")
    print(f"目标路径: {destination_path}")
    print(f"=" * 60)
    
    # 检查文件是否存在
    print(f"1. 检查文件是否存在...")
    if not os.path.exists(file_path):
        print(f"   ❌ 文件不存在: {file_path}")
        return None
    print(f"   ✅ 文件存在")
    
    # 确保目标路径存在
    print(f"2. 检查目标路径是否存在...")
    if not unreal.EditorAssetLibrary.does_directory_exist(destination_path):
        print(f"   路径不存在，创建中...")
        unreal.EditorAssetLibrary.make_directory(destination_path)
        print(f"   ✅ 路径已创建: {destination_path}")
    else:
        print(f"   ✅ 路径已存在: {destination_path}")
    
    # 构建资产名称
    print(f"3. 构建资产名称...")
    file_name = os.path.basename(file_path)
    print(f"   文件名: {file_name}")
    asset_name = os.path.splitext(file_name)[0]
    print(f"   资产名（去扩展名）: {asset_name}")
    
    # 清理非法字符
    print(f"4. 清理非法字符...")
    asset_name = re.sub(r'[^a-zA-Z0-9_]', '_', asset_name)
    print(f"   清理后: {asset_name}")
    
    # 构建完整资产路径
    asset_path = f"{destination_path}/{asset_name}"
    print(f"   完整资产路径: {asset_path}")
    
    # 检查资产是否已存在
    print(f"5. 检查资产是否已存在...")
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        print(f"   ✅ 资产已存在: {asset_path}")
        return asset_path
    print(f"   资产不存在，准备导入...")
    
    # 执行导入
    print(f"6. 执行导入任务...")
    try:
        import_task = unreal.AssetImportTask()
        import_task.set_editor_property("filename", file_path)
        import_task.set_editor_property("destination_path", destination_path)
        import_task.set_editor_property("destination_name", asset_name)
        import_task.set_editor_property("automated", True)
        import_task.set_editor_property("save", True)
        
        print(f"   导入任务配置完成:")
        print(f"   - 文件名: {file_path}")
        print(f"   - 目标路径: {destination_path}")
        print(f"   - 资产名: {asset_name}")
        
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([import_task])
        print(f"   ✅ import_asset_tasks 执行完成")
        
        # 检查导入结果
        print(f"7. 检查导入结果...")
        imported_paths = import_task.get_editor_property("imported_object_paths")
        print(f"   imported_object_paths: {imported_paths}")
        
        if imported_paths:
            imported_path = imported_paths[0]
            print(f"   ✅ 导入成功: {imported_path}")
            return imported_path
        else:
            print(f"   ❌ 导入失败: 没有生成资产路径")
            
            # 检查是否有错误
            errors = import_task.get_editor_property("errors")
            if errors:
                print(f"   错误信息: {errors}")
            
            return None
    except Exception as e:
        print(f"   ❌ 导入异常: {e}")
        import traceback
        traceback.print_exc()
        return None

# 测试用例
if __name__ == "__main__":
    print("\n")
    print("=" * 60)
    print("DEBUG: import_asset_file 函数测试")
    print("=" * 60)
    
    # 你需要修改这个路径为实际存在的文件
    test_file = r"D:\test_model.fbx"  # 修改为实际文件路径
    
    if os.path.exists(test_file):
        result = test_import_asset_file(test_file)
        print(f"\n最终结果: {result}")
    else:
        print(f"\n测试文件不存在: {test_file}")
        print("请修改脚本中的 test_file 变量为实际文件路径")
    
    print("\n")
