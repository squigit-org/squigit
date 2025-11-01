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

#include "Window.h"
#include "drawview.h"
#include <QApplication>
#include <QCloseEvent>
#include <QDebug>

#ifdef Q_OS_WIN
#include <windows.h>
#include <dwmapi.h>
#endif

MainWindow::MainWindow(int displayNum, const QString &imagePath, const QString &tmpPath, QScreen *screen, QWidget *parent)
    : QMainWindow(parent),
      m_displayNum(displayNum),
      m_drawView(new DrawView(m_displayNum, imagePath, tmpPath, this))
{

  setCentralWidget(m_drawView);
  m_drawView->setFocus();
  setWindowFlags(Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint | Qt::Tool | Qt::Popup);
  setAttribute(Qt::WA_ShowWithoutActivating);
  setAttribute(Qt::WA_TranslucentBackground, false);
  setScreen(screen);
  setGeometry(screen->geometry());

  setContentsMargins(0, 0, 0, 0);
  m_drawView->setContentsMargins(0, 0, 0, 0);

#ifdef Q_OS_WIN
  BOOL attrib = TRUE;
  DwmSetWindowAttribute(reinterpret_cast<HWND>(winId()), DWMWA_TRANSITIONS_FORCEDISABLED, &attrib, sizeof(attrib));
  qDebug() << "Successfully registered display change listener (nativeEvent).";
#endif

  showFullScreen();
}

MainWindow::~MainWindow()
{
}

void MainWindow::closeEvent(QCloseEvent *event)
{
  QApplication::exit(1);
  QMainWindow::closeEvent(event);
}

#ifdef Q_OS_WIN
bool MainWindow::nativeEvent(const QByteArray &eventType, void *message, qintptr *result)
{
  MSG *msg = static_cast<MSG *>(message);

  if (msg->message == WM_DISPLAYCHANGE)
  {
    qWarning() << "Display configuration changed (WM_DISPLAYCHANGE)! Exiting drawview.";
    QApplication::exit(1);
    return true;
  }

  return QMainWindow::nativeEvent(eventType, message, result);
}
#endif
