import pytest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
import subprocess
import time

# Assuming launcher.py is in the python path
from launcher import _run_process, clear_tmp, wait_for_file, get_tmp_path

@patch('subprocess.run')
def test_run_process_success(mock_run):
    """Test _run_process for a successful command execution."""
    mock_run.return_value = MagicMock(returncode=0, stdout="Success", stderr="", check_returncode=lambda: None)
    success, stdout, stderr = _run_process(["echo", "hello"])
    assert success is True
    assert stdout == "Success"
    assert stderr == ""

@patch('subprocess.run')
def test_run_process_failure(mock_run):
    """Test _run_process for a failed command execution."""
    error = subprocess.CalledProcessError(1, ["bad_command"])
    error.stdout = ""
    error.stderr = "Error"
    mock_run.side_effect = error
    success, stdout, stderr = _run_process(["bad_command"])
    assert success is False
    assert stderr == "Error"

@patch('subprocess.run')
def test_run_process_file_not_found(mock_run):
    """Test _run_process for FileNotFoundError."""
    mock_run.side_effect = FileNotFoundError("Command not found")
    success, stdout, stderr = _run_process(["non_existent_command"])
    assert success is False
    assert stderr == "File not found"

@patch('shutil.rmtree')
@patch('pathlib.Path.mkdir')
@patch('pathlib.Path.exists')
def test_clear_tmp_exists(mock_exists, mock_mkdir, mock_rmtree):
    """Test clear_tmp when the temp directory already exists."""
    mock_exists.return_value = True
    tmp_path = get_tmp_path()
    returned_path = clear_tmp()
    mock_rmtree.assert_called_once_with(tmp_path)
    mock_mkdir.assert_called_once_with(parents=True, exist_ok=True)
    assert returned_path == tmp_path

@patch('shutil.rmtree')
@patch('pathlib.Path.mkdir')
@patch('pathlib.Path.exists')
def test_clear_tmp_not_exists(mock_exists, mock_mkdir, mock_rmtree):
    """Test clear_tmp when the temp directory does not exist."""
    mock_exists.return_value = False
    tmp_path = get_tmp_path()
    returned_path = clear_tmp()
    mock_rmtree.assert_not_called()
    mock_mkdir.assert_called_once_with(parents=True, exist_ok=True)
    assert returned_path == tmp_path

@patch('time.sleep')
@patch('pathlib.Path.exists')
def test_wait_for_file_success(mock_exists, mock_sleep):
    """Test wait_for_file for a file that appears in time."""
    mock_exists.side_effect = [False, False, True] # File appears on the 3rd check
    test_file = Path("/tmp/test.file")
    assert wait_for_file(test_file, timeout_sec=5) is True
    assert mock_exists.call_count == 3

@patch('time.sleep')
@patch('time.time')
@patch('pathlib.Path.exists')
def test_wait_for_file_timeout(mock_exists, mock_time, mock_sleep):
    """Test wait_for_file for a file that does not appear in time."""
    mock_exists.return_value = False
    mock_time.side_effect = iter(range(20))
    test_file = Path("/tmp/test.file")
    assert wait_for_file(test_file, timeout_sec=5) is False