/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef OVERLAYWINDOW_H
#define OVERLAYWINDOW_H

#include <QMainWindow>
#include <QImage>
#include <QRect>
#include <QWidget>
#include <QScreen>

class SquiggleCanvas;

class OverlayWindow : public QMainWindow
{
    Q_OBJECT
public:
    OverlayWindow(int displayNum, const QImage &bgImage, const QRect &geo, QScreen *screen, QWidget *parent = nullptr);
    ~OverlayWindow();

protected:
    void closeEvent(QCloseEvent *event) override;

#ifdef Q_OS_WIN
    bool nativeEvent(const QByteArray &eventType, void *message, qintptr *result) override;
#endif

private:
    int m_displayNum;
    SquiggleCanvas *m_canvas;

#ifdef Q_OS_MAC
    bool m_displayCallbackRegistered;
#endif
};

#endif // OVERLAYWINDOW_H