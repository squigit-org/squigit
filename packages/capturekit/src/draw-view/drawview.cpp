/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

#include "drawview.h"
#include <QApplication>
#include <QImage>
#include <QMouseEvent>
#include <QPainter>
#include <QDebug>
#include <QDir>
#include <QConicalGradient>
#include <QCloseEvent>

DrawView::DrawView(int displayNum, const QString &imagePath, const QString &tmpPath, QWidget *parent)
    : QWidget(parent),
      m_displayNum(displayNum),
      m_tmpPath(tmpPath),
      m_background(imagePath),
      m_smoothedPoint(0, 0),
      m_currentMousePos(0, 0),
      m_gradientOpacity(0.0),
      m_animation(nullptr)
{

    if (m_background.isNull())
    {
        qWarning() << "Failed to load image:" << imagePath;
        return;
    }

    setMouseTracking(true);
    setCursor(Qt::CrossCursor);
    setContentsMargins(0, 0, 0, 0);
    setFixedSize(m_background.size());

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

qreal DrawView::gradientOpacity() const
{
    return m_gradientOpacity;
}

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

        cropAndSave();
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

    painter.drawImage(0, 0, m_background);

    QLinearGradient gradient(0, 0, 0, height());
    gradient.setColorAt(0.0, QColor(0, 0, 0, static_cast<int>(128 * m_gradientOpacity)));
    gradient.setColorAt(1.0, QColor(0, 0, 0, 0));
    painter.setCompositionMode(QPainter::CompositionMode_SourceOver);
    painter.fillRect(rect(), gradient);

    const int glowLayers = 5;
    const qreal maxGlowWidth = m_brushSize + m_glowAmount * 2.0;
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
    {
        drawCursorCircle(painter, m_currentMousePos);
    }
}

void DrawView::drawCursorCircle(QPainter &painter, const QPointF &center)
{
    painter.setRenderHint(QPainter::Antialiasing, true);

    const qreal circleRadius = 28.0;
    const qreal glowRadius = 10;

    const int glowLayers = 8;

    for (int i = glowLayers; i > 0; --i)
    {
        qreal currentRadius = glowRadius * (i / static_cast<qreal>(glowLayers));
        qreal opacity = 70 * (i / static_cast<qreal>(glowLayers));

        QConicalGradient gradient(center, -90);
        gradient.setColorAt(0.0, QColor(76, 88, 91, opacity));
        gradient.setColorAt(0.25, QColor(126, 153, 163, opacity));
        gradient.setColorAt(0.5, QColor(165, 191, 204, opacity));
        gradient.setColorAt(0.75, QColor(244, 237, 211, opacity));
        gradient.setColorAt(1.0, QColor(76, 88, 91, opacity));

        QPen glowPen;
        glowPen.setBrush(QBrush(gradient));
        glowPen.setWidthF(currentRadius * 2.0);
        glowPen.setCapStyle(Qt::RoundCap);

        painter.setPen(glowPen);
        painter.setCompositionMode(QPainter::CompositionMode_Screen);
        painter.drawPoint(center);
    }

    QRadialGradient haloGradient(center, glowRadius);
    haloGradient.setColorAt(0.0, QColor(255, 255, 255, 0));
    haloGradient.setColorAt(0.7, QColor(200, 220, 255, 40));
    haloGradient.setColorAt(1.0, QColor(150, 180, 255, 0));

    painter.setPen(Qt::NoPen);
    painter.setBrush(QBrush(haloGradient));
    painter.setCompositionMode(QPainter::CompositionMode_Plus);
    painter.drawEllipse(center, glowRadius, glowRadius);

    painter.setPen(Qt::NoPen);
    painter.setBrush(Qt::white);
    painter.setCompositionMode(QPainter::CompositionMode_SourceOver);
    painter.drawEllipse(center, circleRadius / 2, circleRadius / 2);

    QRadialGradient innerGlow(center, circleRadius);
    innerGlow.setColorAt(0.0, QColor(255, 255, 255, 150));
    innerGlow.setColorAt(1.0, QColor(255, 255, 255, 0));

    painter.setBrush(QBrush(innerGlow));
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
    m_minX = m_background.width();
    m_maxX = 0;
    m_minY = m_background.height();
    m_maxY = 0;
    update();
}

void DrawView::cropAndSave()
{
    qreal width = m_maxX - m_minX;
    qreal height = m_maxY - m_minY;
    qreal clampedX = qMax(0.0, m_minX);
    qreal clampedY = qMax(0.0, m_minY);
    qreal clampedWidth = qMin(width, static_cast<qreal>(m_background.width()) - clampedX);
    qreal clampedHeight = qMin(height, static_cast<qreal>(m_background.height()) - clampedY);

    if (clampedWidth <= 0 || clampedHeight <= 0)
    {
        qWarning() << "Invalid crop dimensions, quitting without save";
        QApplication::exit(1);
        return;
    }

    QString outputPath = QDir(m_tmpPath).filePath(QString("o%1.png").arg(m_displayNum));

    QImage cropped = m_background.copy(clampedX, clampedY, clampedWidth, clampedHeight);
    if (!cropped.save(outputPath, "PNG", 100))
    {
        qWarning() << "Failed to save cropped image:" << outputPath;
        QApplication::exit(1);
    }
    else
    {
        qDebug() << "Cropped image saved to:" << outputPath;
        QApplication::exit(0);
    }
}
