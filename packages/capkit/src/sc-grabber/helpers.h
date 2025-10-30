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
