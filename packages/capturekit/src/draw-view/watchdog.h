/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef WATCHDOG_H
#define WATCHDOG_H

#include <QObject>
#include <QProcess>

class Watchdog : public QObject
{
    Q_OBJECT

public:
    explicit Watchdog(QObject *parent = nullptr);
    ~Watchdog();

    void start();
    void stop();

private slots:
    void onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus);

private:
    QProcess *m_process;
};

#endif // WATCHDOG_H
