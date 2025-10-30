/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 **/

#include "audmgr.h"
#include "helpers.h"

audmgr::audmgr() = default;

void audmgr::mute_audio()
{
#ifdef Q_OS_MACOS
    m_audio_backend = "osascript";
    m_prev_mute_state = Shell::run_and_get_output("osascript -e 'output muted of (get volume settings)'");
    if (m_prev_mute_state == "false")
    {
        Shell::run_silent("osascript -e 'set volume with output muted'");
        m_audio_muted_by_script = true;
    }
#else
    if (Shell::command_exists("pactl"))
    {
        m_audio_backend = "pactl";
        m_prev_mute_state = Shell::run_and_get_output("pactl get-sink-mute @DEFAULT_SINK@");
        if (m_prev_mute_state.find("yes") == std::string::npos)
        {
            Shell::run_silent("pactl set-sink-mute @DEFAULT_SINK@ 1");
            m_audio_muted_by_script = true;
        }
    }
    else if (Shell::command_exists("wpctl"))
    {
        m_audio_backend = "wpctl";
        m_prev_mute_state = Shell::run_and_get_output("wpctl get-mute @DEFAULT_AUDIO_SINK@");
        if (m_prev_mute_state.find("MUTED") == std::string::npos)
        {
            Shell::run_silent("wpctl set-mute @DEFAULT_AUDIO_SINK@ 1");
            m_audio_muted_by_script = true;
        }
    }
    else if (Shell::command_exists("amixer"))
    {
        m_audio_backend = "amixer";
        m_prev_mute_state = Shell::run_and_get_output("amixer get Master");
        if (m_prev_mute_state.find("[on]") != std::string::npos)
        {
            Shell::run_silent("amixer set Master mute");
            m_audio_muted_by_script = true;
        }
    }
#endif
}

void audmgr::restore_audio()
{
    if (!m_audio_muted_by_script)
        return;
#ifdef Q_OS_MACOS
    if (m_audio_backend == "osascript")
    {
        if (m_prev_mute_state == "false")
        {
            Shell::run_silent("osascript -e 'set volume without output muted'");
        }
    }
#else
    if (m_audio_backend == "pactl")
    {
        if (m_prev_mute_state.find("yes") == std::string::npos)
        {
            Shell::run_silent("pactl set-sink-mute @DEFAULT_SINK@ 0");
        }
    }
    else if (m_audio_backend == "wpctl")
    {
        if (m_prev_mute_state.find("MUTED") == std::string::npos)
        {
            Shell::run_silent("wpctl set-mute @DEFAULT_AUDIO_SINK@ 0");
        }
    }
    else if (m_audio_backend == "amixer")
    {
        if (m_prev_mute_state.find("[on]") != std::string::npos)
        {
            Shell::run_silent("amixer set Master unmute");
        }
    }
#endif
}
