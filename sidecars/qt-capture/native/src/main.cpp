/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include <QCommandLineParser>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QHash>
#include <QQuickImageProvider>
#include <QQuickWindow>
#include <QScreen>
#include <QString>
#include <QByteArray>
#include <iostream>
#include <atomic>
#include <chrono>
#include <vector>

#include "config.h"
#include "controller/CaptureController.h"
#include "core/CaptureMode.h"
#include "core/ScreenGrabber.h"

#ifdef Q_OS_WIN
#include <dwmapi.h>
#include <windows.h>
#endif

#ifdef Q_OS_MAC
#include <objc/message.h>
#include <objc/runtime.h>
#endif

extern "C" ScreenGrabber *createWindowsEngine(QObject *parent);
extern "C" ScreenGrabber *createUnixEngine(QObject *parent);

class BackgroundImageProvider : public QQuickImageProvider {
public:
  BackgroundImageProvider() : QQuickImageProvider(QQuickImageProvider::Image) {}

  void setImage(int displayIndex, const QImage &image) {
    m_images.insert(QString::number(displayIndex), image);
  }

  QImage requestImage(const QString &id, QSize *size,
                      const QSize &requestedSize) override {
    Q_UNUSED(requestedSize);
    const QImage image = m_images.value(id);
    if (size) {
      *size = image.size();
    }
    return image;
  }

private:
  QHash<QString, QImage> m_images;
};

static bool isTimingEnabled() {
  static const bool enabled = []() {
    const QByteArray raw = qgetenv("SQUIGIT_CAPTURE_TIMING");
    if (raw.isEmpty()) {
      return false;
    }
    const QString normalized = QString::fromUtf8(raw).trimmed().toLower();
    return normalized == "1" || normalized == "true" || normalized == "yes" ||
           normalized == "on";
  }();
  return enabled;
}

static void logTimingStage(const char *stage,
                           const std::chrono::steady_clock::time_point &start) {
  if (!isTimingEnabled()) {
    return;
  }

  const auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                             std::chrono::steady_clock::now() - start)
                             .count();
  std::cerr << "TIMING " << stage << " " << elapsedMs << "ms" << std::endl;
}

static void applyPlatformWindowHacks(QQuickWindow *window) {
#ifdef Q_OS_WIN
  HWND hwnd = reinterpret_cast<HWND>(window->winId());
  BOOL attrib = TRUE;
  DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, &attrib,
                        sizeof(attrib));
#endif

#ifdef Q_OS_MAC
  WId nativeId = window->winId();
  id nsView = reinterpret_cast<id>(nativeId);
  if (nsView) {
    id nsWindow =
        ((id(*)(id, SEL))objc_msgSend)(nsView, sel_registerName("window"));
    if (nsWindow) {
      ((void (*)(id, SEL, long))objc_msgSend)(
          nsWindow, sel_registerName("setAnimationBehavior:"), 2);
      ((void (*)(id, SEL, BOOL))objc_msgSend)(
          nsWindow, sel_registerName("setHasShadow:"), NO);
      ((void (*)(id, SEL, long))objc_msgSend)(nsWindow,
                                              sel_registerName("setLevel:"), 5);
    }
  }
#endif
}

int main(int argc, char *argv[]) {
  const auto timingStart = std::chrono::steady_clock::now();

#if QT_VERSION < QT_VERSION_CHECK(6, 0, 0)
  QCoreApplication::setAttribute(Qt::AA_EnableHighDpiScaling);
  QCoreApplication::setAttribute(Qt::AA_UseHighDpiPixmaps);
#endif
#if QT_VERSION >= QT_VERSION_CHECK(5, 14, 0)
  QGuiApplication::setHighDpiScaleFactorRoundingPolicy(
      Qt::HighDpiScaleFactorRoundingPolicy::PassThrough);
#endif

#ifdef Q_OS_WIN
  HMODULE user32 = LoadLibraryW(L"user32.dll");
  if (user32) {
    using SetProcessDpiAwarenessContextFn = BOOL(WINAPI *)(HANDLE);
    auto fn = reinterpret_cast<SetProcessDpiAwarenessContextFn>(
        GetProcAddress(user32, "SetProcessDpiAwarenessContext"));
    if (fn) {
      fn(reinterpret_cast<HANDLE>(-4));
    } else {
      HMODULE shcore = LoadLibraryW(L"Shcore.dll");
      if (shcore) {
        using SetProcessDpiAwarenessFn = HRESULT(WINAPI *)(int);
        auto fn2 = reinterpret_cast<SetProcessDpiAwarenessFn>(
            GetProcAddress(shcore, "SetProcessDpiAwareness"));
        if (fn2) {
          constexpr int PROCESS_PER_MONITOR_DPI_AWARE = 2;
          fn2(PROCESS_PER_MONITOR_DPI_AWARE);
        }
        FreeLibrary(shcore);
      } else {
        using SetProcessDPIAwareFn = BOOL(WINAPI *)();
        auto fn3 = reinterpret_cast<SetProcessDPIAwareFn>(
            GetProcAddress(user32, "SetProcessDPIAware"));
        if (fn3)
          fn3();
      }
    }
    FreeLibrary(user32);
  }
#endif

#ifdef Q_OS_LINUX
  qputenv("QT_QPA_PLATFORM", "xcb");
#endif

  QGuiApplication app(argc, argv);

  app.setApplicationName(APP_NAME);
  app.setDesktopFileName("squigit");
  app.setOrganizationName(ORG_NAME);
  app.setApplicationVersion(APP_VERSION);
  app.setQuitOnLastWindowClosed(true);

  QCommandLineParser parser;
  parser.setApplicationDescription("Screen capture tool with selection modes");
  parser.addHelpOption();
  parser.addVersionOption();

  QCommandLineOption freeshapeOption(
      QStringList() << "f"
                    << "freeshape",
      "Use freeshape (squiggle) selection mode (default)");
  parser.addOption(freeshapeOption);

  QCommandLineOption rectangleOption(QStringList() << "r"
                                                   << "rectangle",
                                     "Use rectangle selection mode");
  parser.addOption(rectangleOption);

  parser.process(app);

  QString captureMode = "freeshape";
  if (parser.isSet(rectangleOption)) {
    captureMode = "rectangle";
  }

  ScreenGrabber *engine = nullptr;
#ifdef Q_OS_WIN
  engine = createWindowsEngine(&app);
#else
  engine = createUnixEngine(&app);
#endif

  if (!engine) {
    std::cerr << "CAPTURE_NATIVE_ERROR: failed to create platform screen grabber"
              << std::endl;
    return 1;
  }

  std::vector<CapturedFrame> frames = engine->captureAll();
  logTimingStage("capture_all_done", timingStart);

  if (frames.empty()) {
    std::cerr << "CAPTURE_NATIVE_ERROR: no frames captured from display backend"
              << std::endl;
    return 1;
  }

  QList<QScreen *> qtScreens = app.screens();
  QQmlApplicationEngine qmlEngine;
  auto *backgroundProvider = new BackgroundImageProvider();
  qmlEngine.addImageProvider("backgrounds", backgroundProvider);

  QQmlComponent component(&qmlEngine,
                          QUrl("qrc:/CaptureQml/qml/CaptureWindow.qml"));
  if (component.isError()) {
    const auto errors = component.errors();
    for (const QQmlError &err : errors) {
      std::cerr << "CAPTURE_NATIVE_ERROR: QML component error: "
                << err.toString().toStdString() << std::endl;
    }
    return 1;
  }
  logTimingStage("qml_component_ready", timingStart);

  std::vector<CaptureController *> controllers;
  std::vector<QQuickWindow *> windows;
  std::atomic<bool> firstFrameLogged{false};

  for (const auto &frame : frames) {
    QScreen *targetScreen = nullptr;
    for (QScreen *s : qtScreens) {
      if (s->name() == frame.name) {
        targetScreen = s;
        break;
      }
    }
    if (!targetScreen) {
      for (QScreen *s : qtScreens) {
        if (s->geometry() == frame.geometry) {
          targetScreen = s;
          break;
        }
      }
    }

    backgroundProvider->setImage(frame.index, frame.image);

    auto *controller = new CaptureController(&app);
    controller->setDisplayIndex(frame.index);
    controller->setCaptureMode(captureMode);
    controller->setBackgroundImage(frame.image, frame.devicePixelRatio);
    controller->setDisplayGeometry(frame.geometry);
    controllers.push_back(controller);

    QVariantMap properties;
    properties["controller"] = QVariant::fromValue(controller);

    QObject *obj = component.createWithInitialProperties(properties);
    QQuickWindow *window = qobject_cast<QQuickWindow *>(obj);

    if (!window) {
      std::cerr << "CAPTURE_NATIVE_ERROR: QML root is not a QQuickWindow"
                << std::endl;
      return 1;
    }

    windows.push_back(window);

    if (targetScreen) {
      window->setScreen(targetScreen);
      window->setGeometry(targetScreen->geometry());
    } else {
      window->setGeometry(frame.geometry);
    }

    applyPlatformWindowHacks(window);
    QObject::connect(
        window, &QQuickWindow::frameSwapped, window,
        [timingStart, &firstFrameLogged]() {
          bool expected = false;
          if (firstFrameLogged.compare_exchange_strong(expected, true)) {
            logTimingStage("first_frame_swapped", timingStart);
          }
        });
    window->showFullScreen();
  }

  logTimingStage("windows_shown", timingStart);

  return app.exec();
}
