/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "config.h"
#include "Window.h"
#include <QApplication>
#include <QScreen>
#include <QDir>
#include <QDebug>
#include <QStandardPaths>
#include <QFileInfo>
#include <algorithm>

#ifdef Q_OS_LINUX
#include "watchdog.h"
#endif

int main(int argc, char *argv[])
{

#ifdef Q_OS_LINUX
    qputenv("QT_QPA_PLATFORM", "xcb");
#endif

    QApplication app(argc, argv);
    app.setApplicationName("drawview");
    app.setOrganizationName(ORG_NAME);  
    app.setApplicationVersion(APP_VERSION);

#ifdef Q_OS_LINUX
    Watchdog *watcher = new Watchdog(&app);
    QObject::connect(&app, &QApplication::aboutToQuit, watcher, &Watchdog::stop);
    watcher->start();
#endif

    QString tmpPath;
    QString cacheBase;

#ifdef Q_OS_WIN
    cacheBase = QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation);
#else
    cacheBase = QStandardPaths::writableLocation(QStandardPaths::GenericCacheLocation);
#endif

    if (cacheBase.isEmpty())
    {
        qCritical() << "FATAL: Could not determine standard cache location.";
        return 1;
    }

    tmpPath = QDir(cacheBase).filePath("spatialshot/tmp");

    QDir tmpDir(tmpPath);
    if (!tmpDir.exists())
    {
        qWarning() << "Temporary directory does not exist, attempting to create:" << tmpPath;
        if (!tmpDir.mkpath("."))
        {
            qCritical() << "FATAL: Could not create temporary directory:" << tmpPath;
            return 1;
        }
    }

    QList<QScreen *> screens = QGuiApplication::screens();
    std::sort(screens.begin(), screens.end(), [](QScreen *a, QScreen *b)
              { return a->name() < b->name(); });
    QScreen *primaryScreen = QGuiApplication::primaryScreen();

    qDebug() << "Spatialshot started. Using tmp path:" << tmpPath;
    qDebug() << "Available displays:";
    for (int i = 0; i < screens.size(); ++i)
    {
        QScreen *screen = screens[i];
        qDebug() << QString("  Display %1 (Qt Index %2): %3, bounds: %4x%5+%6+%7, primary: %8")
                        .arg(i + 1)
                        .arg(i)
                        .arg(screen->name().isEmpty() ? "Unnamed" : screen->name())
                        .arg(screen->geometry().width())
                        .arg(screen->geometry().height())
                        .arg(screen->geometry().x())
                        .arg(screen->geometry().y())
                        .arg(screen == primaryScreen);
    }

    QList<MainWindow *> windows;
    for (int i = 0; i < screens.size(); ++i)
    {
        QScreen *screen = screens[i];
        int currentMonitorNum = i + 1;

        QString imagePath = QDir(tmpPath).filePath(QString("%1.png").arg(currentMonitorNum));
        if (!QFileInfo::exists(imagePath))
        {
            qWarning() << "Screenshot PNG not found for monitor" << currentMonitorNum << ":" << imagePath;
            continue;
        }

        qDebug() << "Creating window for monitor" << currentMonitorNum << "(Qt Index" << i << ") with image" << imagePath;

        MainWindow *win = new MainWindow(currentMonitorNum, imagePath, tmpPath, screen);

        windows.append(win);
        win->show();
    }

    if (windows.isEmpty())
    {
        qCritical() << "FATAL: Could not create any windows. No valid monitors or PNGs found.";
        return 1;
    }

    qDebug() << "Entering Qt event loop...";
    int result = app.exec();
    qDebug() << "Exiting Qt event loop with code" << result;
    return result;
}
