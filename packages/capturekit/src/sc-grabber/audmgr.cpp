/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

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
