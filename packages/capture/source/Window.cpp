/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "Window.h"
#include "DrawView.h"
#include <QApplication>
#include <QCloseEvent>
#include <QDebug>
#include <QScreen>

#ifdef Q_OS_WIN
#include <windows.h>
#include <dwmapi.h>
#endif

MainWindow::MainWindow(int displayNum, const QImage &bgImage, const QRect &geo, QScreen *screen, QWidget *parent)
    : QMainWindow(parent),
      m_displayNum(displayNum),
      m_drawView(new DrawView(bgImage, this))
{
    setCentralWidget(m_drawView);
    m_drawView->setFocus();

    setWindowFlags(Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint | Qt::Tool | Qt::Popup);
    setAttribute(Qt::WA_ShowWithoutActivating);
    setAttribute(Qt::WA_TranslucentBackground, false);

    if (screen)
    {
        setScreen(screen);
    }

    setGeometry(geo);

    showFullScreen();

    setContentsMargins(0, 0, 0, 0);
    m_drawView->setContentsMargins(0, 0, 0, 0);

#ifdef Q_OS_WIN
    BOOL attrib = TRUE;
    DwmSetWindowAttribute(reinterpret_cast<HWND>(winId()), DWMWA_TRANSITIONS_FORCEDISABLED, &attrib, sizeof(attrib));
#endif
}

MainWindow::~MainWindow() {}

void MainWindow::closeEvent(QCloseEvent *event)
{
    QApplication::exit(1);
    QMainWindow::closeEvent(event);
}

#ifdef Q_OS_WIN
bool MainWindow::nativeEvent(const QByteArray &eventType, void *message, qintptr *result)
{
    MSG *msg = static_cast<MSG *>(message);
    if (msg->message == WM_DISPLAYCHANGE)
    {
        QApplication::exit(1);
        return true;
    }
    return QMainWindow::nativeEvent(eventType, message, result);
}
#endif
