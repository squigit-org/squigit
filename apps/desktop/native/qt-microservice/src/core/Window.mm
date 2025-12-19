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
#include <QWindow>
#include <Cocoa/Cocoa.h>
#include <CoreGraphics/CoreGraphics.h>

static void DisplayReconfigurationCallBack(
    CGDirectDisplayID display,
    CGDisplayChangeSummaryFlags flags,
    void *userInfo)
{
    if (flags & kCGDisplayAddFlag || flags & kCGDisplayRemoveFlag) {
        qWarning() << "Display configuration changed! Exiting capture.";
        QApplication::exit(1);
    }
}

MainWindow::MainWindow(int displayNum, const QImage &bgImage, const QRect &geo, QScreen *screen, QWidget *parent)
    : QMainWindow(parent), 
      m_displayNum(displayNum),
      m_displayCallbackRegistered(false)
{
    m_drawView = new DrawView(bgImage, this);
    setCentralWidget(m_drawView);

    setWindowFlags(Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint | Qt::Tool | Qt::Popup);
    setAttribute(Qt::WA_ShowWithoutActivating);    
    setAttribute(Qt::WA_TranslucentBackground, false);
    
    if (screen) {
        setScreen(screen);
        setGeometry(screen->geometry());
    } else {
        setGeometry(geo);
    }
    
    setContentsMargins(0, 0, 0, 0);
    m_drawView->setContentsMargins(0, 0, 0, 0);

    WId nativeId = this->winId(); 
    
    NSView *nativeView = reinterpret_cast<NSView *>(nativeId);
    if (nativeView) {
        NSWindow *nswindow = [nativeView window];
        if (nswindow) {
            [nswindow setAnimationBehavior: NSWindowAnimationBehaviorNone];
            [nswindow setHasShadow:NO];
            [nswindow setLevel:NSFloatingWindowLevel]; 
            [nswindow setStyleMask:NSWindowStyleMaskBorderless];
        } else {
             qWarning() << "Could not retrieve NSWindow from NSView.";
        }
    } else {
        qWarning() << "Could not retrieve native view handle.";
    }

    CGError err = CGDisplayRegisterReconfigurationCallback(DisplayReconfigurationCallBack, this);
    if (err != kCGErrorSuccess) {
        qWarning() << "Failed to register display reconfiguration callback:" << err;
    } else {
        qDebug() << "Successfully registered display reconfiguration callback.";
        m_displayCallbackRegistered = true;
    }
}

MainWindow::~MainWindow()
{
    if (m_displayCallbackRegistered) {
        qDebug() << "Unregistering display reconfiguration callback.";
        CGDisplayRemoveReconfigurationCallback(DisplayReconfigurationCallBack, this);
    }
}

void MainWindow::closeEvent(QCloseEvent *event)
{
    QApplication::exit(1);
    QMainWindow::closeEvent(event);
}
