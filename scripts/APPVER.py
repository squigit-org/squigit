import sys
import json
import re
import subprocess
from pathlib import Path

PKGS_DIR = Path(__file__).resolve().parent.parent / "packages"

TARGETS = {
    "core_react": {
        "path": PKGS_DIR / "core" / "package.json",
        "type": "json"
    },
    "electron": {
        "path": PKGS_DIR / "spatialshot" / "package.json",
        "type": "json"
    },
    "capturekit_cpp": {
        "path": PKGS_DIR / "capturekit" / "package.json",
        "type": "json"
    },
    "orchestrator_rust": {
        "path": PKGS_DIR / "orchestrator" / "Cargo.toml",
        "type": "toml"
    }
}

def run_git(command):
    """Runs a git command and handles errors."""
    try:
        print(f"   > {command}")
        subprocess.run(command, check=True, shell=True)
    except subprocess.CalledProcessError:
        print(f"Error running git command: {command}")
        sys.exit(1)

def update_json(file_path, new_version):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        old_version = data.get('version', 'unknown')
        data['version'] = new_version
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
            
        print(f"[JSON] {file_path.name}: {old_version} -> {new_version}")
    except FileNotFoundError:
        print(f"[JSON] File not found: {file_path}")
        sys.exit(1)

def update_toml(file_path, new_version):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        pattern = r'(^version\s*=\s*")([\d\.]+.*)(")'

        match = re.search(pattern, content, re.MULTILINE)
        if match:
            old_version = match.group(2)
            new_content = re.sub(pattern, f'\\g<1>{new_version}\\g<3>', content, count=1, flags=re.MULTILINE)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"[TOML] {file_path.name}: {old_version} -> {new_version}")
        else:
            print(f"[TOML] Could not find 'version' key in {file_path.name}")
            
    except FileNotFoundError:
        print(f"[TOML] File not found: {file_path}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python APPVER.py <new_version>")
        print("Example: python APPVER.py 1.2.0")
        sys.exit(1)

    NEW_VERSION = sys.argv[1]
    TAG_NAME = f"v{NEW_VERSION}"

    if not re.match(r'^\d+\.\d+\.\d+', NEW_VERSION):
        print("Warning: Version format doesn't look like X.Y.Z (e.g., 1.0.0)")
        confirm = input("Continue anyway? (y/n): ")
        if confirm.lower() != 'y':
            sys.exit(0)

    print(f"Bumping Monorepo to version: {NEW_VERSION}\n")

    for key, info in TARGETS.items():
        if info["type"] == "json":
            update_json(info["path"], NEW_VERSION)
        elif info["type"] == "toml":
            update_toml(info["path"], NEW_VERSION)

    print("\n✨ Files updated.")

    print(f"\n   READY TO RELEASE: {TAG_NAME}")
    print("This will:")
    print("  1. git add .")
    print(f"  2. git commit -m 'chore: bump version to {NEW_VERSION}'")
    print("  3. git push origin main")
    print(f"  4. git tag {TAG_NAME}")
    print(f"  5. git push origin {TAG_NAME} (Triggers CI)")
    
    do_git = input("\nExecute Git commands? (y/n): ")

    if do_git.lower() == 'y':
        run_git("git add .")
        run_git(f'git commit -m "chore: bump version to {NEW_VERSION}"')
        run_git("git push origin main")
        run_git(f"git tag {TAG_NAME}")
        run_git(f"git push origin {TAG_NAME}")
        print(f"\nDONE! Release {TAG_NAME} is building on GitHub.")
    else:
        print("\nSkipped Git operations. Files are updated locally.")
