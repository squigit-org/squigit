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

#include "shell.h"
#include <array>
#include <memory>
#include <iostream>
#include <cstdio>

std::string Shell::run_and_get_output(const std::string &cmd)
{
    std::array<char, 128> buffer;
    std::string result;
    using Deleter = int (*)(FILE *);
    std::unique_ptr<FILE, Deleter> pipe(popen(cmd.c_str(), "r"), pclose);
    if (!pipe)
    {
        std::cerr << "popen() failed for command: " << cmd << std::endl;
        return "";
    }
    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr)
    {
        result += buffer.data();
    }
    if (!result.empty() && result.back() == '\n')
    {
        result.pop_back();
    }
    return result;
}

int Shell::run_silent(const std::string &cmd)
{
    return system((cmd + " > /dev/null 2>&1").c_str());
}

bool Shell::command_exists(const std::string &cmd_name)
{
    return run_silent("command -v " + cmd_name) == 0;
}
