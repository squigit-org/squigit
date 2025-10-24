import pytest
from launcher import run_screenshot_capture, launch_squiggle, launch_electron, clear_tmp, main
from pathlib import Path
from unittest.mock import MagicMock, patch

PRJKT_ROOT = Path(__file__).resolve().parent.parent.parent

class TestOrchestrator:
    @pytest.mark.parametrize("env,script_path,expected_count", [
        ("win32", PRJKT_ROOT / "platform/win32/sc-grabber.ps1", 2),
        ("darwin", PRJKT_ROOT / "platform/darwin/sc-grabber.sh", 2),
        ("x11", PRJKT_ROOT / "platform/linux/sc-grabber.sh", 2),
        ("wayland", PRJKT_ROOT / "packages/ycaptool/bin/ycaptool", 1),
    ])
    def test_run_screenshot_capture(
        self, env, script_path, expected_count, 
        mock_subprocess_run, mock_path_exists, tmp_path_platform, mock_platform
    ):
        mock_platform.return_value = "Windows" if env == "win32" else "Darwin" if env == "darwin" else "Linux"
        mock_path_exists.return_value = True
        # The test calls with monitor_count=2, which is important for wayland
        success, count = run_screenshot_capture(env, tmp_path_platform, 2)
        assert success
        assert count == expected_count

        if env == "win32":
            command = ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(script_path)]
        elif env in ("darwin", "x11"):
            command = ["bash", str(script_path)]
        elif env == "wayland":
            # With monitor_count=2, it should use --multi
            command = [str(script_path), "--multi"]
        
        mock_subprocess_run.assert_called_with(
            command,
            cwd=None, check=True, capture_output=True, text=True, encoding="utf-8"
        )

    def test_run_screenshot_capture_missing_script(self, mock_path_exists, tmp_path_platform):
        mock_path_exists.return_value = False
        success, count = run_screenshot_capture("win32", tmp_path_platform, 2)
        assert not success
        assert count == 0

    @pytest.mark.parametrize("platform_system", ["Linux", "Windows"])
    def test_launch_squiggle_success(self, platform_system, mock_subprocess_run, mock_path_exists, tmp_path_platform, mock_platform):
        mock_platform.return_value = platform_system
        ext = ".exe" if platform_system == "Windows" else ""
        expected_path = PRJKT_ROOT / f"packages/squiggle/dist/squiggle{ext}"
        with patch("launcher.SQUIGGLE_BINARY", expected_path):
            mock_path_exists.return_value = True
            output_png = launch_squiggle(tmp_path_platform, None)
            assert output_png == tmp_path_platform / "output.png"

            mock_subprocess_run.assert_called_with(
                [str(expected_path)],
                cwd=None, check=True, capture_output=True, text=True, encoding="utf-8"
            )

    @pytest.mark.parametrize("platform_system", ["Linux", "Windows"])
    def test_launch_squiggle_with_monitor(self, platform_system, mock_subprocess_run, mock_path_exists, tmp_path_platform, mock_platform):
        mock_platform.return_value = platform_system
        ext = ".exe" if platform_system == "Windows" else ""
        expected_path = PRJKT_ROOT / f"packages/squiggle/dist/squiggle{ext}"
        with patch("launcher.SQUIGGLE_BINARY", expected_path):
            mock_path_exists.return_value = True
            output_png = launch_squiggle(tmp_path_platform, 2)
            assert output_png == tmp_path_platform / "output.png"

            mock_subprocess_run.assert_called_with(
                [str(expected_path), "--", "2"],
                cwd=None, check=True, capture_output=True, text=True, encoding="utf-8"
            )

    def test_launch_squiggle_missing_binary(self, mock_path_exists, tmp_path_platform):
        mock_path_exists.return_value = False
        output_png = launch_squiggle(tmp_path_platform, None)
        assert output_png is None

    def test_launch_electron_success(self, mock_subprocess_popen, mock_path_exists, tmp_path_platform):
        mock_path_exists.return_value = True
        success = launch_electron(tmp_path_platform / "output.png")
        assert success
        mock_subprocess_popen.assert_called_with(
            ["npm", "start", "--", str(tmp_path_platform / "output.png")],
            cwd=PRJKT_ROOT / "packages/spatialshot"
        )

    def test_launch_electron_missing_project(self, mock_subprocess_popen, mock_path_exists, tmp_path_platform):
        mock_path_exists.return_value = False
        success = launch_electron(tmp_path_platform / "output.png")
        assert not success

    def test_clear_tmp(self, mock_shutil, mock_path_exists, tmp_path_platform):
        mock_rmtree, mock_mkdir = mock_shutil
        mock_path_exists.return_value = True
        tmp_path = clear_tmp()
        assert tmp_path == tmp_path_platform
        mock_rmtree.assert_called_with(tmp_path)
        mock_mkdir.assert_called_with(parents=True, exist_ok=True)

    @pytest.mark.parametrize("env,monitor_count", [
        ("win32", 2),
        ("darwin", 2),
        ("x11", 2),
        ("wayland", 1),
        ("wayland", 2),
    ])
    def test_main_flow(
        self, env, monitor_count,
        mock_platform, mock_os_environ, mock_subprocess_run, mock_subprocess_popen,
        mock_path_exists, mock_time, tmp_path_platform, mock_sys_exit
    ):
        mock_platform.return_value = "Windows" if env == "win32" else "Darwin" if env == "darwin" else "Linux"
        
        wayland_files = []
        if env == "wayland":
            mock_os_environ["WAYLAND_DISPLAY"] = "wayland-0"
            wayland_files = [tmp_path_platform / "1.png"]

        mock_path_exists.return_value = True
        
        with patch("pathlib.Path.glob", return_value=wayland_files), \
             patch("launcher.identify_display_environment", return_value=env), \
             patch("launcher.probe_monitor_count", return_value=monitor_count), \
             patch("launcher.wait_for_file", return_value=True):
            main()
        
        mock_sys_exit.assert_not_called()