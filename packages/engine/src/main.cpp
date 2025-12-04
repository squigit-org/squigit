/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include <QApplication>
#include <QDebug>
#include <vector>
#include "config.h"
#include "Window.h"
#include "Capture.h"

extern "C" CaptureEngine *createWindowsEngine(QObject *parent);
extern "C" CaptureEngine *createUnixEngine(QObject *parent);

int main(int argc, char *argv[])
{
#ifdef Q_OS_LINUX
    qputenv("QT_QPA_PLATFORM", "xcb");
#endif
    QApplication app(argc, argv);
    app.setApplicationName(APP_NAME);
    app.setOrganizationName(ORG_NAME);
    app.setApplicationVersion(APP_VERSION);
    app.setQuitOnLastWindowClosed(true);
    CaptureEngine *engine = nullptr;
#ifdef Q_OS_WIN
    engine = createWindowsEngine(&app);
#else
    engine = createUnixEngine(&app);
#endif

    if (!engine)
    {
        qCritical() << "FATAL: Failed to initialize Capture Engine.";
        return 1;
    }

    std::vector<CapturedFrame> frames = engine->captureAll();

    if (frames.empty())
    {
        qCritical() << "FATAL: No screens captured.";
        return 1;
    }

    QList<MainWindow *> windows;

    for (const auto &frame : frames)
    {
        qDebug() << "Display" << frame.index
                 << "|" << frame.name
                 << "|" << frame.geometry
                 << "| DPR:" << frame.devicePixelRatio;
        MainWindow *win = new MainWindow(frame.index, frame.image, frame.geometry);
        windows.append(win);
        win->show();
    }

    return app.exec();
}
