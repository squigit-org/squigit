/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#pragma once

#ifndef WINDOW_H
#define WINDOW_H

#include <QMainWindow>
#include <QImage>
#include <QRect>
#include <QWidget>
#include <QScreen>

class DrawView;

class MainWindow : public QMainWindow
{
    Q_OBJECT
public:
    MainWindow(int displayNum, const QImage &bgImage, const QRect &geo, QScreen *screen, QWidget *parent = nullptr);
    ~MainWindow();

protected:
    void closeEvent(QCloseEvent *event) override;

#ifdef Q_OS_WIN
    bool nativeEvent(const QByteArray &eventType, void *message, qintptr *result) override;
#endif

private:
    int m_displayNum;
    DrawView *m_drawView;

#ifdef Q_OS_MAC
    bool m_displayCallbackRegistered;
#endif
};

#endif // WINDOW_H
