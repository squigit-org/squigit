/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef AUDMGR_H
#define AUDMGR_H

#include <string>

class audmgr
{
public:
    audmgr();
    void mute_audio();
    void restore_audio();

private:
    std::string m_audio_backend;
    std::string m_prev_mute_state;
    bool m_audio_muted_by_script = false;
};

#endif // AUDMGR_H
