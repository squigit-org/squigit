/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "Capture.h"
#include <QGuiApplication>
#include <QScreen>
#include <QPixmap>
#include <QDebug>
#include <QOperatingSystemVersion>
#include <QMessageBox>
#include <QPushButton>

#import <CoreGraphics/CoreGraphics.h>
#import <AppKit/AppKit.h>

class CaptureEngineMac : public CaptureEngine
{
public:
    CaptureEngineMac(QObject *parent = nullptr) : CaptureEngine(parent) {}

    std::vector<CapturedFrame> captureAll() override {
        std::vector<CapturedFrame> frames;

        // --------------------------------------------------------------------
        // 1. Permission Check
        // --------------------------------------------------------------------
        if (QOperatingSystemVersion::current() >= QOperatingSystemVersion::MacOSCatalina) {
            if (!CGPreflightScreenCaptureAccess()) {
                CGRequestScreenCaptureAccess();

                QMessageBox msgBox;
                msgBox.setIcon(QMessageBox::Information);
                msgBox.setWindowTitle(tr("Screen Recording Permission"));
                msgBox.setText(tr("Engine requires screen recording permission to take screenshots."));
                msgBox.setInformativeText(tr("Please grant permission in System Settings. The application will close after."));
                
                QPushButton *openSettingsButton = msgBox.addButton(tr("Open System Settings"), QMessageBox::ActionRole);
                msgBox.setStandardButtons(QMessageBox::Cancel);
                msgBox.setDefaultButton(openSettingsButton);

                msgBox.exec();

                if (msgBox.clickedButton() == openSettingsButton) {
                    [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenRecording"]];
                }

                return frames;
            }
        }

        // --------------------------------------------------------------------
        // Implementation Strategy Adapted from Flameshot
        // --------------------------------------------------------------------
        // The following logic (delegating to Qt's grabWindow) is based on the 
        // implementation found in the Flameshot project.
        //
        // Source: src/utils/screengrabber.cpp
        // Link:   https://github.com/flameshot-org/flameshot/blob/master/src/utils/screengrabber.cpp
        //
        // Flameshot License: GPLv3
        // Copyright (C) 2017-2019 Alejandro Sirgo Rica & Contributors
        // --------------------------------------------------------------------
        
        const auto screens = QGuiApplication::screens();
        int index = 0;
        
        for (QScreen* screen : screens) {
            if (!screen) continue;

            // grabWindow(0) captures the root window (the entire screen).
            // This abstraction allows Qt to handle the underlying OS calls 
            // (legacy CGWindowList or modern ScreenCaptureKit) automatically.
            QPixmap pixmap = screen->grabWindow(0);

            if (pixmap.isNull()) {
                qWarning() << "Failed to capture screen:" << screen->name();
                continue;
            }

            CapturedFrame frame;
            frame.image = pixmap.toImage();
            frame.geometry = screen->geometry();
            frame.devicePixelRatio = screen->devicePixelRatio();
            frame.image.setDevicePixelRatio(frame.devicePixelRatio);
            frame.name = screen->name();
            frame.index = index++;
            
            frames.push_back(frame);
        }
        
        CaptureEngine::sortLeftToRight(frames);
        return frames;
    }
};

extern "C" CaptureEngine* createUnixEngine(QObject* parent) {
    return new CaptureEngineMac(parent);
}
