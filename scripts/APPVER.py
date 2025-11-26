import sys
import json
import re
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

    print("\n✨ All files updated successfully.")
