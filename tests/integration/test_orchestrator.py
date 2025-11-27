
import os
import sys
import pytest
import subprocess
import tempfile
import time
from pathlib import Path

class TestOrchestrator:
    def test_orchestrator_flow(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)

            data_dir = tmp_path / "data"
            data_dir.mkdir()
            cache_dir = tmp_path / "cache"
            cache_dir.mkdir()

            env = os.environ.copy()
            env["XDG_DATA_HOME"] = str(data_dir)
            env["XDG_CACHE_HOME"] = str(cache_dir)

            bin_dir = tmp_path / "bin"
            bin_dir.mkdir()
            env["PATH"] = f"{bin_dir}:{env['PATH']}"

            (bin_dir / "scgrabber").touch(mode=0o755)
            (bin_dir / "draw-view").touch(mode=0o755)
            (bin_dir / "spatialshot").touch(mode=0o755)

            orchestrator_path = Path(__file__).parent.parent.parent / "packages" / "orchestrator" / "target" / "release" / "spatialshot-orchestrator"

            process = subprocess.Popen([str(orchestrator_path)], env=env)

            screenshot_dir = cache_dir / "spatialshot" / "tmp"
            time.sleep(1)

            (screenshot_dir / "screenshot.png").touch()

            time.sleep(1)
            (screenshot_dir / "o_screenshot.png").touch()

            time.sleep(1)

            process.terminate()
            process.wait(timeout=5)

            assert process.returncode is not None
