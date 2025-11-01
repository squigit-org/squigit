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

#include "watchdog.h"
#include <QApplication>
#include <QDebug>

Watchdog::Watchdog(QObject *parent)
    : QObject(parent), m_process(new QProcess(this))
{
    connect(m_process, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this, &Watchdog::onProcessFinished);
}

Watchdog::~Watchdog()
{
    if (m_process->state() != QProcess::NotRunning) {
        m_process->terminate();
        m_process->waitForFinished(1000);
    }
}

void Watchdog::start()
{
    if (m_process->state() != QProcess::NotRunning) {
        qWarning() << "Watchdog process already running.";
        return;
    }

    QString script = R"___(
#!/bin/bash
#
# mwatch.linux.sh
#
# Constantly monitors the number of connected displays on Linux.
# If the count changes (up or down), it exits with code 1.
# Exits with code 0 if interrupted (Ctrl+C).

# --- Trap SIGINT (Ctrl+C) for a clean exit ---
trap 'echo "Monitor watch stopped."; exit 0' SIGINT SIGTERM

# --- Helper Function ---
is_cmd() {
    command -v "$1" >/dev/null 2>&1
}

# --- Linux Monitor Count Logic ---
probe_xrandr_listmonitors() {
    if ! is_cmd xrandr; then return 1; fi
    if output=$(DISPLAY=$DISPLAY xrandr --listmonitors 2>/dev/null); then
        first_line=$(echo "$output" | head -n 1)
        if [[ $first_line == *"Monitors:"* ]]; then
            count=$(echo "$first_line" | awk '{print $2}')
            if [[ $count =~ ^[0-9]+$ ]] && [ "$count" -ge 1 ]; then
                echo "$count"
                return 0
            fi
        fi
    fi
    return 1
}

probe_xrandr_grep() {
    if ! is_cmd xrandr; then return 1; fi
    if count=$(DISPLAY=$DISPLAY xrandr 2>/dev/null | grep -c " connected [0-9]"); then
        if [ "$count" -ge 1 ]; then
            echo "$count"
            return 0
        fi
    fi
    return 1
}

probe_swaymsg() {
    if ! is_cmd swaymsg; then return 1; fi
    if count=$(swaymsg -t get_outputs 2>/dev/null | grep -c '"active": true'); then
        if [ "$count" -ge 1 ]; then
            echo "$count"
            return 0
        fi
    fi
    return 1
}

probe_kscreen() {
    if ! is_cmd kscreen-doctor; then return 1; fi
    if count=$(kscreen-doctor -o 2>/dev/null | grep -c 'Enabled: yes'); then
        if [ "$count" -ge 1 ]; then
            echo "$count"
            return 0
        fi
    fi
    return 1
}

probe_wlr_randr() {
    if ! is_cmd wlr-randr; then return 1; fi
    if count=$(wlr-randr 2>/dev/null | grep -c 'Enabled: yes'); then
        if [ "$count" -ge 1 ]; then
            echo "$count"
            return 0
        fi
    fi
    return 1
}

probe_drm_sysfs() {
    count=0
    for status_file in /sys/class/drm/*/status; do
        if [ -f "$status_file" ]; then
            # Check if this is a connector (e.g., card0-DP-1)
            if [[ "$status_file" == *"/drm/card"*"-".*"/status" ]]; then
                status=$(cat "$status_file" 2>/dev/null | tr -d '[:space:]')
                if [ "$status" = "connected" ]; then
                    count=$((count + 1))
                fi
            fi
        fi
    done
    if [ "$count" -ge 1 ]; then
        echo "$count"
        return 0
    fi
    return 1
}

get_monitor_count() {
    if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
        probe_swaymsg && return
        probe_kscreen && return
        probe_wlr_randr && return
    fi

    if [ -n "$DISPLAY" ]; then
        probe_xrandr_listmonitors && return
        probe_xrandr_grep && return
    fi
    
    probe_drm_sysfs && return

    echo 1 # Fallback
}

# --- Main Execution Loop ---
echo "Starting monitor watch (Linux)... (Press Ctrl+C to stop)"
prev_count=$(get_monitor_count)

if ! [[ $prev_count =~ ^[0-9]+$ ]]; then
    echo "Error: Initial monitor count is not a number: '$prev_count'" >&2
    prev_count=1
fi

echo "Initial monitor count: $prev_count"

while true; do
    sleep 1
    curr_count=$(get_monitor_count)
    
    if ! [[ $curr_count =~ ^[0-9]+$ ]]; then
        echo "Warning: Failed to get valid count, retrying..." >&2
        continue
    fi

    if [ "$curr_count" -ne "$prev_count" ]; then
        echo "Monitor count changed from $prev_count to $curr_count. Exiting." >&2
        exit 1
    fi
    
    prev_count=$curr_count
done
)___";

    qDebug() << "Starting watchdog script.";
    m_process->start("bash", QStringList() << "-c" << script);
}

void Watchdog::onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus)
{
    if (exitStatus == QProcess::CrashExit) {
        qWarning() << "Watchdog script crashed.";
        return;
    }

    qDebug() << "Watchdog script finished with exit code:" << exitCode;
    if (exitCode == 1) {
        qWarning() << "Watchdog detected monitor change, exiting application.";
        QApplication::exit(1);
    }
}