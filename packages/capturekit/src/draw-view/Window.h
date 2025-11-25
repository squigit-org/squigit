/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef WINDOW_H
#define WINDOW_H

#include <QMainWindow>
#include <QWidget>
#include <QPainterPath>
#include <QScreen>
#include <QPropertyAnimation>
#include <QCloseEvent>

#include "drawview.h"

class MainWindow : public QMainWindow
{
    Q_OBJECT
public:
    MainWindow(int displayNum, const QString &imagePath, const QString &tmpPath, QScreen *screen, QWidget *parent = nullptr);
    ~MainWindow();
    int displayNumber() const { return m_displayNum; }

protected:
    void closeEvent(QCloseEvent *event) override;

#ifdef Q_OS_WIN
    bool nativeEvent(const QByteArray &eventType, void *message, qintptr *result) override;
#endif

private:
    int m_displayNum;
    DrawView *m_drawView;

#ifdef Q_OS_MAC
    void *m_displayChangeHandle;
#endif
};

#endif
