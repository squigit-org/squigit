/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include <QApplication>
#include <QDebug>
#include <QScreen>
#include <vector>
#include "config.h"
#include "Window.h"
#include "Capture.h"

#ifdef Q_OS_WIN
#include <windows.h>
#endif

extern "C" CaptureEngine *createWindowsEngine(QObject *parent);
extern "C" CaptureEngine *createUnixEngine(QObject *parent);

int main(int argc, char *argv[])
{
    QCoreApplication::setAttribute(Qt::AA_EnableHighDpiScaling);
    QCoreApplication::setAttribute(Qt::AA_UseHighDpiPixmaps);
#if QT_VERSION >= QT_VERSION_CHECK(5, 14, 0)
    QApplication::setHighDpiScaleFactorRoundingPolicy(Qt::HighDpiScaleFactorRoundingPolicy::PassThrough);
#endif

#ifdef Q_OS_WIN
    HMODULE user32 = LoadLibraryW(L"user32.dll");
    if (user32) {
        using SetProcessDpiAwarenessContextFn = BOOL(WINAPI *)(HANDLE);
        auto fn = reinterpret_cast<SetProcessDpiAwarenessContextFn>(GetProcAddress(user32, "SetProcessDpiAwarenessContext"));
        if (fn) {
            fn(reinterpret_cast<HANDLE>(-4));
        } else {
            HMODULE shcore = LoadLibraryW(L"Shcore.dll");
            if (shcore) {
                using SetProcessDpiAwarenessFn = HRESULT(WINAPI *)(int /*PROCESS_DPI_AWARENESS*/);
                auto fn2 = reinterpret_cast<SetProcessDpiAwarenessFn>(GetProcAddress(shcore, "SetProcessDpiAwareness"));
                if (fn2) {
                    constexpr int PROCESS_PER_MONITOR_DPI_AWARE = 2;
                    fn2(PROCESS_PER_MONITOR_DPI_AWARE);
                }
                FreeLibrary(shcore);
            } else {
                using SetProcessDPIAwareFn = BOOL(WINAPI *)();
                auto fn3 = reinterpret_cast<SetProcessDPIAwareFn>(GetProcAddress(user32, "SetProcessDPIAware"));
                if (fn3) fn3();
            }
        }
        FreeLibrary(user32);
    }
#endif

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

    QList<QScreen *> qtScreens = app.screens();

    for (const auto &frame : frames)
    {
        qDebug() << "Display" << frame.index
                 << "|" << frame.name
                 << "|" << frame.geometry
                 << "| DPR:" << frame.devicePixelRatio;

        QScreen *targetScreen = nullptr;

        for (QScreen *s : qtScreens)
        {
            if (s->name() == frame.name)
            {
                targetScreen = s;
                break;
            }
        }

        if (!targetScreen)
        {
            for (QScreen *s : qtScreens)
            {
                if (s->geometry() == frame.geometry)
                {
                    targetScreen = s;
                    break;
                }
            }
        }

        MainWindow *win = new MainWindow(frame.index, frame.image, frame.geometry, targetScreen);
        windows.append(win);
        win->show();
    }

    return app.exec();
}
