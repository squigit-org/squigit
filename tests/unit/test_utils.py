
import pytest
import subprocess
from unittest.mock import MagicMock, patch
import logging
import os
import sys

# Add the path to the root directory to the system path to import setup.py
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from setup import _execute_command, BuildError

class TestExecuteCommand:

    @patch('subprocess.run')
    def test_successful_command(self, mock_run):
        mock_run.return_value = MagicMock(
            stdout="Success output",
            stderr="",
            returncode=0
        )
        with patch('logging.info') as mock_logging_info:
            _execute_command(["echo", "hello"], ".", "test_component")
            mock_run.assert_called_once()
            mock_logging_info.assert_any_call("[test_component] STDOUT | Success output")

    @patch('subprocess.run')
    def test_failed_command(self, mock_run):
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd=["bad_command"],
            output="",
            stderr="Error output"
        )
        with patch('logging.error') as mock_logging_error:
            with pytest.raises(BuildError) as excinfo:
                _execute_command(["bad_command"], ".", "test_component")
            mock_run.assert_called_once()
            mock_logging_error.assert_any_call("[test_component] FAILED STDERR | Error output")
            assert "Command failed with exit code 1" in str(excinfo.value)

    @patch('subprocess.run')
    def test_command_not_found(self, mock_run):
        mock_run.side_effect = FileNotFoundError
        with pytest.raises(BuildError) as excinfo:
            _execute_command(["non_existent_command"], ".", "test_component")
        mock_run.assert_called_once()
        assert "Command `non_existent_command` not found" in str(excinfo.value)

    @patch('subprocess.run')
    def test_command_with_env_vars(self, mock_run):
        mock_run.return_value = MagicMock(
            stdout="",
            stderr="",
            returncode=0
        )
        env_vars = {"MY_VAR": "my_value"}
        _execute_command(["printenv"], ".", "test_component", env=env_vars)
        mock_run.assert_called_once()
        # Check if env was passed correctly. subprocess.run is called with env={**os.environ, **env}
        # So we can't directly check for env_vars, but we can check if it was passed.
        assert mock_run.call_args.kwargs['env'] is not None
        assert mock_run.call_args.kwargs['env']['MY_VAR'] == 'my_value'
