import pytest
from unittest.mock import patch, MagicMock

from launcher import main

@patch('launcher.identify_display_environment')
@patch('launcher.get_monitor_count')
@patch('launcher.clear_tmp')
@patch('launcher.run_screenshot_capture')
@patch('launcher.wait_for_file')
@patch('launcher.launch_squiggle')
@patch('launcher.launch_electron')
@patch('launcher.re')
@patch('signal.signal')
def test_main_flow_success(mock_signal, mock_re, mock_launch_electron, mock_launch_squiggle, mock_wait_for_file, mock_run_screenshot, mock_clear_tmp, mock_get_monitor_count, mock_identify_display_env):
    """Test the main function for a successful end-to-end workflow."""
    mock_identify_display_env.return_value = 'linux'
    mock_get_monitor_count.return_value = 1
    mock_clear_tmp.return_value = MagicMock()
    mock_run_screenshot.return_value = (True, 1)
    mock_wait_for_file.return_value = True
    mock_launch_squiggle.return_value = True
    mock_launch_electron.return_value = True

    mock_tmp_path = MagicMock()
    mock_tmp_path.glob.return_value = [MagicMock(name='o1.png')]
    mock_clear_tmp.return_value = mock_tmp_path
    
    mock_match = MagicMock()
    mock_match.group.return_value = "1"
    mock_re.search.return_value = mock_match

    # Successful run should not exit
    with patch('sys.exit') as mock_exit:
        main()
        mock_exit.assert_not_called()

@patch('launcher.identify_display_environment')
def test_main_unsupported_os(mock_identify_display_env):
    """Test the main function for an unsupported OS, expecting sys.exit."""
    mock_identify_display_env.return_value = 'unknown'
    with patch('sys.exit') as mock_exit:
        mock_exit.side_effect = SystemExit # Raise exception to halt execution
        with pytest.raises(SystemExit):
            main()
        mock_exit.assert_called_once_with(1)

@patch('launcher.identify_display_environment')
@patch('launcher.get_monitor_count')
@patch('launcher.clear_tmp')
@patch('launcher.run_screenshot_capture')
def test_main_flow_screenshot_fails(mock_run_screenshot, mock_clear_tmp, mock_get_monitor_count, mock_identify_display_env):
    """Test the main function when screenshot capture fails, expecting sys.exit."""
    mock_identify_display_env.return_value = 'linux'
    mock_get_monitor_count.return_value = 1
    mock_clear_tmp.return_value = MagicMock()
    mock_run_screenshot.return_value = (False, 1)
    with patch('sys.exit') as mock_exit:
        mock_exit.side_effect = SystemExit
        with pytest.raises(SystemExit):
            main()
        mock_exit.assert_called_with(1)