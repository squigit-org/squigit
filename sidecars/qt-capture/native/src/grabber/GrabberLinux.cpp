/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "ScreenGrabber.h"
#include <QGuiApplication>
#include <QScreen>
#include <QPixmap>
#include <QDebug>
#if defined(Q_OS_LINUX)
#include <QDBusInterface>
#include <QDBusReply>
#include <QDBusConnection>
#include <QDBusObjectPath>
#include <QEventLoop>
#include <QUuid>
#include <QUrl>
#include <QFile>
#include <QTimer>
#endif
#include <cmath>
#if defined(Q_OS_LINUX)
class PortalHelper : public QObject
{
    Q_OBJECT
public:
    QString savedUri;
    bool success = false;

public slots:
    void handleResponse(uint response, const QVariantMap &results)
    {
        if (response == 0)
        {
            savedUri = results.value("uri").toString();
            success = !savedUri.isEmpty();
        }
        else
        {
            qWarning() << "Portal request failed (Response Code:" << response << ")";
            success = false;
        }
        emit finished();
    }

signals:
    void finished();
};
#endif
class ScreenGrabberUnix : public ScreenGrabber
{
public:
    ScreenGrabberUnix(QObject *parent = nullptr) : ScreenGrabber(parent) {}

    std::vector<CapturedFrame> captureAll() override
    {
#if defined(Q_OS_LINUX)
        // Check XDG_SESSION_TYPE — on Wayland we MUST use the portal because
        // XWayland root grab returns a black screen.
        // Note: main.cpp forces QT_QPA_PLATFORM=xcb for window overlays,
        // but the portal is a pure D-Bus call and works regardless.
        QString sessionType = qgetenv("XDG_SESSION_TYPE").toLower();
        if (sessionType == "wayland")
        {
            qDebug() << "Wayland session detected, using Portal capture.";
            return captureWayland();
        }
        else
        {
            qDebug() << "X11 session detected, using standard capture.";
            return captureStandard();
        }
#else
        qDebug() << "Non-Linux Unix OS, using standard capture.";
        return captureStandard();
#endif
    }

private:
    std::vector<CapturedFrame> captureStandard()
    {
        std::vector<CapturedFrame> frames;
        const auto screens = QGuiApplication::screens();
        int index = 0;

        for (QScreen *screen : screens)
        {
            if (!screen)
                continue;
            QPixmap pixmap = screen->grabWindow(0);
            if (pixmap.isNull())
                continue;

            CapturedFrame frame;
            frame.image = pixmap.toImage();
            frame.geometry = screen->geometry();
            frame.devicePixelRatio = screen->devicePixelRatio();
            frame.image.setDevicePixelRatio(frame.devicePixelRatio);
            frame.name = screen->name();
            frame.index = index++;
            frames.push_back(frame);
        }
        ScreenGrabber::sortLeftToRight(frames);
        return frames;
    }

#if defined(Q_OS_LINUX)
    std::vector<CapturedFrame> captureWayland()
    {
        std::vector<CapturedFrame> frames;

        QDBusInterface portal(
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Screenshot");

        if (!portal.isValid())
        {
            qCritical() << "Portal interface not found.";
            return frames;
        }

        QString token = QUuid::createUuid().toString().remove('{').remove('}').remove('-');
        QVariantMap options;
        options["handle_token"] = token;
        options["interactive"] = false;

        // Subscribe to the response signal BEFORE making the call to avoid
        // a race condition where the portal responds before we connect.
        // Predict the response path from our D-Bus sender name + token.
        PortalHelper helper;
        QEventLoop loop;

        QString sender = QDBusConnection::sessionBus().baseService();
        sender = sender.mid(1).replace('.', '_');
        QString expectedPath = QString("/org/freedesktop/portal/desktop/request/%1/%2")
                                   .arg(sender)
                                   .arg(token);

        QDBusConnection::sessionBus().connect(
            "org.freedesktop.portal.Desktop", expectedPath,
            "org.freedesktop.portal.Request", "Response",
            &helper, SLOT(handleResponse(uint, QVariantMap)));
        QObject::connect(&helper, &PortalHelper::finished, &loop, &QEventLoop::quit);

        QDBusReply<QDBusObjectPath> reply = portal.call("Screenshot", "", options);
        if (!reply.isValid())
        {
            qCritical() << "Portal call failed:" << reply.error().message();
            return frames;
        }

        QTimer::singleShot(5000, &loop, &QEventLoop::quit);

        loop.exec();

        if (!helper.success)
        {
            qWarning() << "Portal request failed or timed out.";
            return frames;
        }

        QString localPath = QUrl(helper.savedUri).toLocalFile();
        QImage fullDesktop(localPath);

        if (!QFile::remove(localPath))
        {
            qWarning() << "Failed to remove temporary portal file:" << localPath;
        }

        if (fullDesktop.isNull())
        {
            qCritical() << "Downloaded image is null.";
            return frames;
        }

        QRect logicalBounds;
        for (QScreen *screen : QGuiApplication::screens())
        {
            logicalBounds = logicalBounds.united(screen->geometry());
        }

        double scaleFactor = 1.0;
        if (logicalBounds.width() > 0)
        {
            scaleFactor = (double)fullDesktop.width() / (double)logicalBounds.width();
        }

        qDebug() << "Capture Info: Image" << fullDesktop.size()
                 << "Logical" << logicalBounds
                 << "Scale" << scaleFactor;

        int index = 0;
        for (QScreen *screen : QGuiApplication::screens())
        {
            QRect geo = screen->geometry();

            int cropX = std::round((geo.x() - logicalBounds.x()) * scaleFactor);
            int cropY = std::round((geo.y() - logicalBounds.y()) * scaleFactor);
            int cropW = std::round(geo.width() * scaleFactor);
            int cropH = std::round(geo.height() * scaleFactor);

            if (cropX < 0)
                cropX = 0;
            if (cropY < 0)
                cropY = 0;
            if (cropX + cropW > fullDesktop.width())
                cropW = fullDesktop.width() - cropX;
            if (cropY + cropH > fullDesktop.height())
                cropH = fullDesktop.height() - cropY;

            QImage screenImg = fullDesktop.copy(cropX, cropY, cropW, cropH);
            screenImg.setDevicePixelRatio(scaleFactor);

            CapturedFrame frame;
            frame.image = screenImg;
            frame.geometry = geo;
            frame.devicePixelRatio = scaleFactor;
            frame.name = screen->name();
            frame.index = index++;

            frames.push_back(frame);
        }

        ScreenGrabber::sortLeftToRight(frames);
        return frames;
    }
#endif
};

#if defined(Q_OS_LINUX)
#include "GrabberLinux.moc"

extern "C" ScreenGrabber *createUnixEngine(QObject *parent)
{
    return new ScreenGrabberUnix(parent);
}
#endif
