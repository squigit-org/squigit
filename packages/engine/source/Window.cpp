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
#include <QScreen> // Ensure this is included

#ifdef Q_OS_WIN
#include <windows.h>
#include <dwmapi.h>
#endif

// Update constructor implementation
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

    // FIX START ------------------------------------------
    
    // 1. Explicitly associate this window with the physical screen
    if (screen) {
        setScreen(screen);
    }

    // 2. Force geometry on ALL platforms (Linux needs this before showFullScreen for correct placement)
    setGeometry(geo); 

    // 3. Show full screen
    showFullScreen();
    
    // FIX END --------------------------------------------

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