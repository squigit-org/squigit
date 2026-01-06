/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "OverlayWindow.h"
#include "SquiggleCanvas.h"
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

OverlayWindow::OverlayWindow(int displayNum, const QImage &bgImage, const QRect &geo, QScreen *screen, QWidget *parent)
    : QMainWindow(parent), 
      m_displayNum(displayNum),
      m_displayCallbackRegistered(false)
{
    m_canvas = new SquiggleCanvas(bgImage, this);
    setCentralWidget(m_canvas);

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
    m_canvas->setContentsMargins(0, 0, 0, 0);

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

OverlayWindow::~OverlayWindow()
{
    if (m_displayCallbackRegistered) {
        qDebug() << "Unregistering display reconfiguration callback.";
        CGDisplayRemoveReconfigurationCallback(DisplayReconfigurationCallBack, this);
    }
}

void OverlayWindow::closeEvent(QCloseEvent *event)
{
    QApplication::exit(1);
    QMainWindow::closeEvent(event);
}