/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "DrawView.h"
#include <QApplication>
#include <QMouseEvent>
#include <QPainter>
#include <QDebug>
#include <QConicalGradient>
#include <iostream>
#include <QDir>
#include <cmath>

DrawView::DrawView(const QImage &background, QWidget *parent)
    : QWidget(parent),
      m_background(background),
      m_smoothedPoint(0, 0),
      m_currentMousePos(0, 0),
      m_gradientOpacity(0.0),
      m_animation(nullptr)
{
    setMouseTracking(true);
    setCursor(Qt::CrossCursor);
    setContentsMargins(0, 0, 0, 0);

    qreal dpr = m_background.devicePixelRatio();
    if (dpr <= 0.0) dpr = 1.0;

    setFixedSize(qRound(m_background.width() / dpr), qRound(m_background.height() / dpr));

    m_animation = new QPropertyAnimation(this, "gradientOpacity");
    m_animation->setDuration(200);
    m_animation->setStartValue(0.0);
    m_animation->setEndValue(1.0);

    clearCanvas();
}

void DrawView::showEvent(QShowEvent *event)
{
    QWidget::showEvent(event);
    m_animation->start();
}

qreal DrawView::gradientOpacity() const { return m_gradientOpacity; }
void DrawView::setGradientOpacity(qreal opacity)
{
    m_gradientOpacity = opacity;
    update();
}

void DrawView::mousePressEvent(QMouseEvent *event)
{
    if (event->button() == Qt::LeftButton)
    {
        if (m_hasDrawing)
            clearCanvas();
        m_isDrawing = true;
        m_smoothedPoint = event->pos();
        m_currentMousePos = event->pos();
        m_path.moveTo(m_smoothedPoint);
        updateBounds(m_smoothedPoint.x(), m_smoothedPoint.y());
        update();
    }
}

void DrawView::mouseMoveEvent(QMouseEvent *event)
{
    m_currentMousePos = event->pos();
    if (!m_isDrawing)
    {
        update();
        return;
    }
    QPointF currentPoint = event->pos();
    QPointF newSmoothedPoint = (m_smoothedPoint * (1.0 - m_smoothingFactor)) + (currentPoint * m_smoothingFactor);
    QPointF midPoint = (m_smoothedPoint + newSmoothedPoint) / 2.0;
    m_path.quadTo(m_smoothedPoint, midPoint);
    m_smoothedPoint = newSmoothedPoint;
    updateBounds(m_smoothedPoint.x(), m_smoothedPoint.y());
    update();
}

void DrawView::mouseReleaseEvent(QMouseEvent *event)
{
    if (event->button() == Qt::LeftButton && m_isDrawing)
    {
        m_path.lineTo(m_smoothedPoint);
        m_isDrawing = false;
        m_hasDrawing = true;
        cropAndFinish();
    }
}

void DrawView::keyPressEvent(QKeyEvent *event)
{
    if (event->key() == Qt::Key_Escape || event->key() == Qt::Key_Q)
    {
        QApplication::exit(1);
    }
}

void DrawView::paintEvent(QPaintEvent *event)
{
    QPainter painter(this);

    painter.setRenderHint(QPainter::Antialiasing, true);
    painter.setRenderHint(QPainter::SmoothPixmapTransform, true);

    painter.drawImage(rect(), m_background);

    QLinearGradient gradient(0, 0, 0, height());
    gradient.setColorAt(0.0, QColor(0, 0, 0, static_cast<int>(128 * m_gradientOpacity)));
    gradient.setColorAt(1.0, QColor(0, 0, 0, 0));
    painter.setCompositionMode(QPainter::CompositionMode_SourceOver);
    painter.fillRect(rect(), gradient);

    const int glowLayers = 5;
    for (int i = glowLayers; i >= 0; --i)
    {
        qreal glowWidth = m_brushSize + (m_glowAmount * 2.0 * i / static_cast<qreal>(glowLayers));
        int alpha = 50 + (150 * (glowLayers - i) / static_cast<qreal>(glowLayers));
        QColor glowColor(Qt::white);
        glowColor.setAlpha(alpha);
        QPen glowPen(glowColor, glowWidth, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin);
        painter.setPen(glowPen);
        painter.setCompositionMode(QPainter::CompositionMode_Screen);
        painter.drawPath(m_path);
    }

    QPen mainPen(m_brushColor, m_brushSize, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin);
    mainPen.setColor(Qt::white);
    painter.setPen(mainPen);
    painter.setCompositionMode(QPainter::CompositionMode_SourceOver);
    painter.drawPath(m_path);

    if (m_isDrawing)
        drawCursorCircle(painter, m_currentMousePos);
}

void DrawView::drawCursorCircle(QPainter &painter, const QPointF &center)
{
    painter.setRenderHint(QPainter::Antialiasing, true);
    const qreal circleRadius = 28.0;
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(255, 255, 255, 50));
    painter.drawEllipse(center, circleRadius, circleRadius);
}

void DrawView::updateBounds(qreal x, qreal y)
{
    qreal brushRadius = m_brushSize / 2 + m_glowAmount / 2;
    m_minX = qMin(m_minX, x - brushRadius);
    m_maxX = qMax(m_maxX, x + brushRadius);
    m_minY = qMin(m_minY, y - brushRadius);
    m_maxY = qMax(m_maxY, y + brushRadius);
}

void DrawView::clearCanvas()
{
    m_path = QPainterPath();
    m_isDrawing = false;
    m_hasDrawing = false;
    m_minX = width();
    m_maxX = 0;
    m_minY = height();
    m_maxY = 0;
    update();
}

void DrawView::cropAndFinish()
{
    qreal logicalX = qMax(0.0, m_minX);
    qreal logicalY = qMax(0.0, m_minY);
    qreal logicalW = m_maxX - m_minX;
    qreal logicalH = m_maxY - m_minY;

    qreal dpr = m_background.devicePixelRatio();
    if (dpr <= 0.0) dpr = 1.0;

    int physX = qRound(logicalX * dpr);
    int physY = qRound(logicalY * dpr);
    int physW = qRound(logicalW * dpr);
    int physH = qRound(logicalH * dpr);

    if (physX < 0)
        physX = 0;
    if (physY < 0)
        physY = 0;
    if (physX + physW > m_background.width())
        physW = m_background.width() - physX;
    if (physY + physH > m_background.height())
        physH = m_background.height() - physY;

    if (physW <= 0 || physH <= 0)
    {
        QApplication::exit(1);
        return;
    }

    QImage cropped = m_background.copy(physX, physY, physW, physH);

    cropped.setDevicePixelRatio(1.0);

    QString finalPath = QDir::temp().filePath("spatial_capture.png");
    if (cropped.save(finalPath, "PNG", -1))
    {
        std::cout << finalPath.toStdString() << std::endl;
        QApplication::exit(0);
    }
    else
    {
        QApplication::exit(1);
    }
}
