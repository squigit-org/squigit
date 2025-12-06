/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "Capture.h"
#include <QGuiApplication>
#include <QScreen>
#include <QDebug>
#include <QOperatingSystemVersion>
#include <QMessageBox>
#include <QPushButton>

#import <CoreGraphics/CoreGraphics.h>
#import <AppKit/AppKit.h>

static QImage convertCGImageRefToQImage(CGImageRef imageRef, CGDirectDisplayID displayID)
{
    if (!imageRef) return QImage();

    size_t width = CGImageGetWidth(imageRef);
    size_t height = CGImageGetHeight(imageRef);
    
    if (width == 0 || height == 0) {
        return QImage();
    }

    size_t bytesPerPixel = 4;
    size_t bytesPerRow = bytesPerPixel * width;
    std::vector<unsigned char> buffer(bytesPerRow * height);

    CGColorSpaceRef colorSpace = CGDisplayCopyColorSpace(displayID);
    if (!colorSpace) {
        qWarning() << "Could not get display color space, falling back to sRGB.";
        colorSpace = CGColorSpaceCreateDeviceRGB();
        if (!colorSpace) {
            qWarning() << "Failed to create any color space!";
            return QImage();
        }
    }

    CGContextRef ctx = CGBitmapContextCreate(buffer.data(), width, height, 8, bytesPerRow, colorSpace,
                                             kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little);
    
    if (!ctx) {
        qWarning() << "Failed to create CGBitmapContext";
        CGColorSpaceRelease(colorSpace);
        return QImage();
    }

    CGContextDrawImage(ctx, CGRectMake(0, 0, width, height), imageRef);

    CGContextRelease(ctx);
    CGColorSpaceRelease(colorSpace);

    QImage img(buffer.data(), static_cast<int>(width), static_cast<int>(height),
               static_cast<int>(bytesPerRow), QImage::Format_ARGB32_Premultiplied);

#ifndef NDEBUG
    if (width > 0 && height > 0) {
        QRgb p = img.pixel(0, 0);
        qDebug() << "Captured pixel (ARGB):" << qAlpha(p) << qRed(p) << qGreen(p) << qBlue(p);
    }
#endif
    
    return img.copy();
}

class CaptureEngineMac : public CaptureEngine
{
public:
    CaptureEngineMac(QObject *parent = nullptr) : CaptureEngine(parent) {}

    std::vector<CapturedFrame> captureAll() override {
        std::vector<CapturedFrame> frames;

        if (QOperatingSystemVersion::current() >= QOperatingSystemVersion::MacOSCatalina) {
            if (!CGPreflightScreenCaptureAccess()) {
                CGRequestScreenCaptureAccess();

                QMessageBox msgBox;
                msgBox.setIcon(QMessageBox::Information);
                msgBox.setWindowTitle(tr("Screen Recording Permission"));
                msgBox.setText(tr("Engine requires screen recording permission to take screenshots."));
                msgBox.setInformativeText(tr("Please grant permission in System Settings. The application will close after. A restart may be required."));
                
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

        int index = 0;
        const auto screens = QGuiApplication::screens();
        
        for (QScreen* screen : screens) {
            CGDirectDisplayID displayID = 0;

            const int maxDisplays = 16;
            CGDirectDisplayID displays[maxDisplays];
            uint32_t displayCount = 0;

            if (CGGetActiveDisplayList(maxDisplays, displays, &displayCount) == kCGErrorSuccess) {
                bool foundMatch = false;
                for (uint32_t i = 0; i < displayCount; ++i) {
                    CGRect cgRect = CGDisplayBounds(displays[i]);
                    QRect qtRect(static_cast<int>(cgRect.origin.x), static_cast<int>(cgRect.origin.y),
                                 static_cast<int>(cgRect.size.width), static_cast<int>(cgRect.size.height));

                    if (qtRect == screen->geometry()) {
                        displayID = displays[i];
                        foundMatch = true;
                        break;
                    }
                }
                
                if (!foundMatch) {
                    qWarning() << "Could not match screen geometry for:" << screen->name() << ". Skipping.";
                    index++;
                    continue;
                }
            } else {
                 qWarning() << "Failed to get active display list.";
                 index++;
                 continue;
            }
            
            CGImageRef imgRef = CGDisplayCreateImage(displayID);
            if (!imgRef) {
                qWarning() << "Failed to capture display ID:" << displayID;
                index++;
                continue;
            }

            QImage qtImage = convertCGImageRefToQImage(imgRef, displayID);
            CGImageRelease(imgRef);

            if (qtImage.isNull()) {
                qWarning() << "Failed to convert CGImage to QImage.";
                index++;
                continue;
            }

            qtImage.setDevicePixelRatio(screen->devicePixelRatio());
            
            CapturedFrame frame;
            frame.image = qtImage;
            frame.geometry = screen->geometry();
            frame.devicePixelRatio = screen->devicePixelRatio();
            frame.index = index;
            frame.name = screen->name();
            
            frames.push_back(frame);
            index++;
        }
        
        CaptureEngine::sortLeftToRight(frames);
        return frames;
    }
};

extern "C" CaptureEngine* createUnixEngine(QObject* parent) {
    return new CaptureEngineMac(parent);
}