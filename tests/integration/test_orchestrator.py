import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path

from launcher import run_screenshot_capture, launch_squiggle, launch_electron

# Use the mock_launcher_paths fixture to avoid FileNotFoundError on constants
pytestmark = pytest.mark.usefixtures("mock_launcher_paths")

@patch('launcher._run_process')
def test_run_screenshot_capture_success(mock_run_process):
    """Test successful screenshot capture for different environments."""
    mock_run_process.return_value = (True, "", "")
    
    # Test Wayland (uses ycaptool binary)
    success, _ = run_screenshot_capture('wayland', 1)
    assert success
    mock_run_process.assert_called_with(['/mock/ycaptool'])

    # Test X11 (uses script)
    success, _ = run_screenshot_capture('x11', 1)
    assert success
    mock_run_process.assert_called_with(['/bin/bash', '/mock/sc_grabber.sh'])

@patch('launcher.YCAPTOOL_BINARY', MagicMock(spec=Path, exists=lambda: False))
def test_run_screenshot_capture_wayland_no_binary():
    """Test Wayland screenshot capture when ycaptool binary is missing."""
    success, _ = run_screenshot_capture('wayland', 1)
    assert success is False

@patch('launcher._run_process')
def test_launch_squiggle_success(mock_run_process):
    """Test successful launch of Squiggle."""
    mock_run_process.return_value = (True, "", "")
    assert launch_squiggle() is True
    mock_run_process.assert_called_with(['/mock/squiggle'])

@patch('launcher.SQUIGGLE_BINARY', MagicMock(spec=Path, exists=lambda: False))
def test_launch_squiggle_binary_missing():
    """Test Squiggle launch when the binary is missing."""
    assert launch_squiggle() is False

@patch('launcher._run_process')
def test_launch_electron_success(mock_run_process):
    """Test successful launch of Electron."""
    mock_run_process.return_value = (True, "", "")
    assert launch_electron(Path('dummy.png')) is True

@patch('launcher.ELECTRON_NODE', MagicMock(spec=Path, exists=lambda: False))
def test_launch_electron_project_missing():
    """Test Electron launch when the project (package.json) is missing."""
    assert launch_electron(Path('dummy.png')) is False
