"""
Build script for packaging Python formatter with PyInstaller
"""
import os
import sys
import shutil
import subprocess
import platform
from pathlib import Path

def main():
    # 确定项目根目录
    project_root = Path(__file__).parent
    python_dir = project_root / "python"
    dist_dir = project_root / "dist"
    
    print("=" * 60)
    print("Building MAA Pipeline Formatter Python Executable")
    print("=" * 60)
    
    # 检查 Python 脚本是否存在
    script_path = python_dir / "format_pipeline.py"
    if not script_path.exists():
        print(f"[FAIL] Python script not found: {script_path}")
        sys.exit(1)
    
    # 清理之前的构建
    if dist_dir.exists():
        print(f"[INFO] Cleaning previous build: {dist_dir}")
        shutil.rmtree(dist_dir)
    
    # 创建 dist 目录
    dist_dir.mkdir(exist_ok=True)
    
    # 确定可执行文件名
    system = platform.system().lower()
    if system == "windows":
        exe_name = "format_pipeline.exe"
    else:
        exe_name = "format_pipeline"
    
    print(f"[INFO] Target platform: {system}")
    print(f"[INFO] Executable name: {exe_name}")
    
    # PyInstaller 命令
    pyinstaller_args = [
        "pyinstaller",
        "--onefile",                    # 单文件打包
        "--name", "format_pipeline",    # 可执行文件名
        "--distpath", str(dist_dir),    # 输出目录
        "--workpath", str(project_root / "build"),  # 临时文件目录
        "--specpath", str(project_root),            # spec 文件位置
        "--clean",                      # 清理缓存
        "--noconfirm",                  # 不确认覆盖
        str(script_path)                # Python 脚本路径
    ]
    
    print(f"[INFO] Running PyInstaller...")
    print(f"[CMD]  {' '.join(pyinstaller_args)}")
    
    try:
        result = subprocess.run(pyinstaller_args, cwd=project_root, check=True)
        
        # 检查生成的可执行文件
        exe_path = dist_dir / exe_name
        if exe_path.exists():
            file_size = exe_path.stat().st_size
            print(f"[OK]   Executable created: {exe_path}")
            print(f"[INFO] File size: {file_size / 1024 / 1024:.2f} MB")
            
            # 测试可执行文件
            print(f"[TEST] Testing executable...")
            test_json = '{"test": "value"}'
            test_result = subprocess.run(
                [str(exe_path)], 
                input=test_json, 
                text=True, 
                capture_output=True
            )
            
            if test_result.returncode == 0:
                print(f"[OK]   Executable test passed")
            else:
                print(f"[WARN] Executable test failed: {test_result.stderr}")
            
        else:
            print(f"[FAIL] Executable not found: {exe_path}")
            sys.exit(1)
            
    except subprocess.CalledProcessError as e:
        print(f"[FAIL] PyInstaller failed: {e}")
        sys.exit(1)
    
    print("=" * 60)
    print("Build completed successfully!")
    print("=" * 60)

if __name__ == "__main__":
    main()