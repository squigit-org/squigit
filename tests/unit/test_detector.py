import pytest
from launcher import identify_display_environment, get_monitor_count
from unittest.mock import MagicMock, patch

class TestDetector:
    def test_identify_display_environment_windows(self, mock_platform, mock_os_environ):
        mock_platform.return_value = "Windows"
        assert identify_display_environment() == "win32"

    def test_identify_display_environment_macos(self, mock_platform, mock_os_environ):
        mock_platform.return_value = "Darwin"
        assert identify_display_environment() == "darwin"

    def test_identify_display_environment_linux_x11(self, mock_platform, mock_os_environ):
        mock_platform.return_value = "Linux"
        mock_os_environ["DISPLAY"] = ":0"
        mock_os_environ["XDG_SESSION_TYPE"] = "x11"
        mock_os_environ["WAYLAND_DISPLAY"] = ""
        assert identify_display_environment() == "x11"

    def test_identify_display_environment_linux_wayland(self, mock_platform, mock_os_environ):
        mock_platform.return_value = "Linux"
        mock_os_environ["WAYLAND_DISPLAY"] = "wayland-0"
        mock_os_environ["XDG_SESSION_TYPE"] = "wayland"
        mock_os_environ["DISPLAY"] = ""
        assert identify_display_environment() == "wayland"

    def test_identify_display_environment_unknown(self, mock_platform, mock_os_environ):
        mock_platform.return_value = "UnknownOS"
        assert identify_display_environment() == "unknown"

    @patch('launcher.identify_display_environment')
    @patch('launcher._run_process')
    @patch('pathlib.Path.exists', return_value=True)
    def test_get_monitor_count_success(self, mock_exists, mock_run_process, mock_identify_env):
        mock_run_process.return_value = (True, '2\n', '')
        
        mock_identify_env.return_value = 'win32'
        assert get_monitor_count() == 2

        mock_identify_env.return_value = 'darwin'
        assert get_monitor_count() == 2

        mock_identify_env.return_value = 'x11'
        assert get_monitor_count() == 2

    @patch('launcher.identify_display_environment', return_value='unknown')
    def test_get_monitor_count_unsupported_os(self, mock_identify_env):
        assert get_monitor_count() == 1

    @patch('launcher.identify_display_environment', return_value='win32')
    @patch('pathlib.Path.exists', return_value=False)
    def test_get_monitor_count_script_not_found(self, mock_exists, mock_identify_env):
        assert get_monitor_count() == 1

    @patch('launcher.identify_display_environment', return_value='win32')
    @patch('launcher._run_process', return_value=(False, '', 'error'))
    @patch('pathlib.Path.exists', return_value=True)
    def test_get_monitor_count_process_fails(self, mock_exists, mock_run_process, mock_identify_env):
        assert get_monitor_count() == 1

    @patch('launcher.identify_display_environment', return_value='win32')
    @patch('launcher._run_process', return_value=(True, 'not-a-number', ''))
    @patch('pathlib.Path.exists', return_value=True)
    def test_get_monitor_count_parse_error(self, mock_exists, mock_run_process, mock_identify_env):
        assert get_monitor_count() == 1