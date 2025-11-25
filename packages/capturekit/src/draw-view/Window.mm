/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "Window.h"
#include "drawview.h"
#include <QApplication>
#include <QCloseEvent>
#include <QDebug>
#include <Cocoa/Cocoa.h>
#include <CoreGraphics/CoreGraphics.h>

static void DisplayReconfigurationCallBack(
    CGDirectDisplayID display,
    CGDisplayChangeSummaryFlags flags,
    void *userInfo)
{
    if (flags & kCGDisplayAddFlag || flags & kCGDisplayRemoveFlag) {
        qWarning() << "Display configuration changed! Exiting drawview.";
        QApplication::exit(1);
    }
}

MainWindow::MainWindow(int displayNum, const QString& imagePath, const QString& tmpPath, QScreen* screen, QWidget* parent)
    : QMainWindow(parent), 
      m_displayNum(displayNum), 
      m_drawView(new DrawView(m_displayNum, imagePath, tmpPath, this)),
      m_displayChangeHandle(nullptr)
{
    setCentralWidget(m_drawView);
    setWindowFlags(Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint | Qt::Tool | Qt::Popup);
    setAttribute(Qt::WA_ShowWithoutActivating);   
    setAttribute(Qt::WA_TranslucentBackground, false);
    setScreen(screen);
    setGeometry(screen->geometry());
    
    setContentsMargins(0, 0, 0, 0);
    m_drawView->setContentsMargins(0, 0, 0, 0);


    NSView *nsview = reinterpret_cast<NSView *>(winId());
    NSWindow *nswindow = [nsview window];
    [nswindow setAnimationBehavior: NSWindowAnimationBehaviorNone];

    CGError err = CGDisplayRegisterReconfigurationCallback(DisplayReconfigurationCallBack, this);
    if (err != kCGErrorSuccess) {
        qWarning() << "Failed to register display reconfiguration callback:" << err;
    } else {
        qDebug() << "Successfully registered display reconfiguration callback.";
        m_displayChangeHandle = (void*)DisplayReconfigurationCallBack;
    }

    showFullScreen();
}

MainWindow::~MainWindow()
{
    if (m_displayChangeHandle) {
        qDebug() << "Unregistering display reconfiguration callback.";
        CGDisplayRemoveReconfigurationCallback(DisplayReconfigurationCallBack, this);
    }
}

void MainWindow::closeEvent(QCloseEvent *event)
{
    QApplication::exit(1);
    QMainWindow::closeEvent(event);
}
