/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 **/

#include <QGuiApplication>
#include <QDebug>
#include <QDir>
#include <QStandardPaths>
#include <QDBusInterface>
#include <QDBusReply>
#include <QDBusConnection>
#include <QEventLoop>
#include <QVariantMap>
#include <QScreen>
#include <QPixmap>
#include <QtPlugin>
#include "audiomanager.h"
#include "receiver.h"
#include "utils.h"
#include "shell.h"

// For static builds: Link static platform plugins if needed
#if defined(Q_OS_LINUX)
Q_IMPORT_PLUGIN(QXcbIntegrationPlugin)
Q_IMPORT_PLUGIN(QWaylandIntegrationPlugin)
Q_IMPORT_PLUGIN(QWaylandEglPlatformIntegrationPlugin)
Q_IMPORT_PLUGIN(QWaylandXdgShellIntegrationPlugin)
#elif defined(Q_OS_MACOS)
Q_IMPORT_PLUGIN(QCocoaIntegrationPlugin)
#endif

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QString platform = app.platformName();
    qDebug() << "Detected platform:" << platform;

    QString savePath = qgetenv("SC_SAVE_PATH");
    if (savePath.isEmpty())
    {
        savePath = QStandardPaths::writableLocation(QStandardPaths::GenericCacheLocation) + "/spatialshot/tmp";
    }
    if (savePath.isEmpty())
    {
        qWarning() << "Error: savePath is empty.";
        return 1;
    }
    QDir homeDir = QDir::home();
    if (savePath == "/" || savePath == homeDir.path() || savePath == homeDir.path() + "/")
    {
        qWarning() << "Error: Refusing to remove critical path: " << savePath;
        return 1;
    }
    QDir dir(savePath);
    if (dir.exists())
    {
        if (!dir.removeRecursively())
        {
            qWarning() << "Error: Failed to remove existing save path.";
            return 1;
        }
    }
    if (!QDir().mkpath(savePath))
    {
        qWarning() << "Error: Failed to create save path.";
        return 1;
    }
    if (!QDir::setCurrent(savePath))
    {
        qWarning() << "Error: Failed to set current directory to save path.";
        return 1;
    }
    qDebug() << "Saving screenshots to: " << savePath;
    AudioManager am;
    am.mute_audio();

    bool success = false;
    if (platform.startsWith("wayland")) {
        qDebug() << "Wayland detected — using portal or wlroots fallback...";
        QDBusInterface portal(
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Screenshot");
        QVariantMap options;
        options["interactive"] = false;
        QDBusReply<QDBusObjectPath> request_path_reply = portal.call("Screenshot", "", options);
        if (!request_path_reply.isValid())
        {
            qWarning() << "D-Bus call failed:" << request_path_reply.error().message();
        }
        bool portalSuccess = false;
        if (request_path_reply.isValid())
        {
            QDBusObjectPath request_path = request_path_reply.value();
            qDebug() << "Got request object path:" << request_path.path();
            Receiver receiver;
            QEventLoop loop;
            QDBusConnection::sessionBus().connect(
                "org.freedesktop.portal.Desktop",
                request_path.path(),
                "org.freedesktop.portal.Request",
                "Response",
                &receiver,
                SLOT(handleResponse(uint, const QVariantMap &)));
            QObject::connect(&receiver, &Receiver::finished, &loop, [&loop, &portalSuccess](bool s)
                             {
                portalSuccess = s;
                loop.quit(); });
            qDebug() << "Waiting for portal response...";
            loop.exec();
        }
        if (!portalSuccess)
        {
            if (!tryWlroots())
            {
                qWarning() << "Both portal and wlroots fallback failed.";
                am.restore_audio();
                return 1;
            }
        }
        success = true;
    } else if (platform == "xcb" || platform == "cocoa") {
        qDebug() << "Direct capture supported (X11 or macOS).";
        QList<QScreen *> screens = app.screens();
        std::sort(screens.begin(), screens.end(), [](QScreen *a, QScreen *b) {
            return a->name() < b->name();
        });
        qDebug() << "Detected" << screens.count() << "monitor(s). Starting capture...";
        int counter = 1;
        success = true;
        for (QScreen *screen : screens)
        {
            QString fileName = QString("%1.png").arg(counter);
            QPixmap pixmap = screen->grabWindow(0);
            if (pixmap.isNull())
            {
                qWarning() << "Failed to capture monitor " << counter << " (" << screen->name() << ")";
                success = false;
                continue;
            }
            if (!pixmap.save(fileName))
            {
                qWarning() << "Failed to save " << fileName;
                success = false;
                continue;
            }
            qDebug() << "-> Captured monitor " << counter << " (" << screen->name() << ") to '" << fileName << "'";
            counter++;
        }
    } else {
        qWarning() << "Unsupported platform: " << platform;
        am.restore_audio();
        return 1;
    }

    am.restore_audio();
    qDebug() << "Helper finished.";
    return success ? 0 : 1;
}
