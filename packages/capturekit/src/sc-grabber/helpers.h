/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef HELPERS_H
#define HELPERS_H
 
#include <QRect>
#include <QPixmap>
#include <string>

class Shell
{
public:
    static std::string run_and_get_output(const std::string &cmd);
    static int run_silent(const std::string &cmd);
    static bool command_exists(const std::string &cmd_name);
};

QRect desktopGeometry();
QRect logicalDesktopGeometry();
bool processFullPixmap(const QPixmap &fullDesktop);
bool tryWlroots();

#endif // HELPERS_H
