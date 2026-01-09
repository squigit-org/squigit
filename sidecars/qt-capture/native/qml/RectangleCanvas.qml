// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

import QtQuick
import Qt5Compat.GraphicalEffects

/**
 * Rectangle selection canvas.
 * 
 * Features:
 * - Sharp corner at cursor position, rounded elsewhere
 * - 65% brightness dim overlay outside selection
 * - Gradient stroke for shine/sparkle effect
 * - Smooth outer glow
 */

Item {
    id: root
    anchors.fill: parent
    focus: true
    
    property var controller
    
    property point startPoint: Qt.point(0, 0)
    property point endPoint: Qt.point(0, 0)
    property bool isDrawing: false
    property bool hasSelection: false
    
    readonly property real selX: Math.min(startPoint.x, endPoint.x)
    readonly property real selY: Math.min(startPoint.y, endPoint.y)
    readonly property real selW: Math.abs(endPoint.x - startPoint.x)
    readonly property real selH: Math.abs(endPoint.y - startPoint.y)
    
    property real glowIntensity: 0.0
    readonly property real targetGlowIntensity: {
        if (!isDrawing && !hasSelection) return 0.0
        var area = selW * selH
        var maxArea = root.width * root.height
        var normalizedArea = Math.min(area / maxArea, 1.0)
        return 0.3 + (1.0 - normalizedArea) * 0.5
    }
    
    Behavior on glowIntensity {
        NumberAnimation {
            duration: 800
            easing.type: Easing.InOutCubic
        }
    }
    
    onTargetGlowIntensityChanged: {
        glowIntensity = targetGlowIntensity
    }
    
    Canvas {
        id: dimCanvas
        anchors.fill: parent
        opacity: 0

        NumberAnimation on opacity {
            from: 0; to: 1
            duration: 200
            running: true
            easing.type: Easing.OutQuad
        }
        
        onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            
            ctx.fillStyle = Qt.rgba(0, 0, 0, 0.35)
            ctx.fillRect(0, 0, width, height)
            
            if (root.isDrawing || root.hasSelection) {
                ctx.globalCompositeOperation = "destination-out"
                ctx.fillStyle = "white"
                root.drawSelectionPath(ctx, root.selX, root.selY, root.selW, root.selH)
                ctx.fill()
            }
        }
    }
    
    Connections {
        target: root
        function onStartPointChanged() { dimCanvas.requestPaint() }
        function onEndPointChanged() { dimCanvas.requestPaint() }
        function onIsDrawingChanged() { dimCanvas.requestPaint() }
    }
    
    function drawSelectionPath(ctx, x, y, w, h) {
        var baseRadius = Math.min(24, Math.min(w, h) / 2)
        
        var tl = baseRadius, tr = baseRadius, br = baseRadius, bl = baseRadius
        
        if (root.endPoint.x >= root.startPoint.x) {
            if (root.endPoint.y >= root.startPoint.y) br = 0
            else tr = 0
        } else {
            if (root.endPoint.y >= root.startPoint.y) bl = 0
            else tl = 0
        }
        
        ctx.beginPath()
        
        ctx.moveTo(x + tl, y)
        ctx.lineTo(x + w - tr, y)
        if (tr > 0) ctx.quadraticCurveTo(x + w, y, x + w, y + tr)
        
        ctx.lineTo(x + w, y + h - br)
        if (br > 0) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
        
        ctx.lineTo(x + bl, y + h)
        if (bl > 0) ctx.quadraticCurveTo(x, y + h, x, y + h - bl)
        
        ctx.lineTo(x, y + tl)
        if (tl > 0) ctx.quadraticCurveTo(x, y, x + tl, y)
        
        ctx.closePath()
    }

    Canvas {
        id: selectionBorderCanvas
        anchors.fill: parent
        visible: root.isDrawing || root.hasSelection
        
        onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            
            var centerX = root.selX + root.selW / 2
            var centerY = root.selY + root.selH / 2
            var maxDim = Math.max(root.selW, root.selH)
            
            var gradient = ctx.createRadialGradient(
                centerX, centerY, 0,
                centerX, centerY, maxDim * 0.8
            )
            
            gradient.addColorStop(0.0, Qt.rgba(1, 1, 1, 0.95))
            gradient.addColorStop(0.5, Qt.rgba(0.9, 0.9, 0.9, 0.8))
            gradient.addColorStop(1.0, Qt.rgba(0.7, 0.7, 0.7, 0.6))
            
            ctx.lineWidth = 2
            ctx.strokeStyle = gradient
            
            root.drawSelectionPath(ctx, root.selX, root.selY, root.selW, root.selH)
            ctx.stroke()
        }
        
        Connections {
            target: root
            function onStartPointChanged() { selectionBorderCanvas.requestPaint() }
            function onEndPointChanged() { selectionBorderCanvas.requestPaint() }
            function onIsDrawingChanged() { selectionBorderCanvas.requestPaint() }
        }
    }
    
    Canvas {
        id: glowMask
        anchors.fill: parent
        visible: false
        
        onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            
            ctx.fillStyle = "black"
            ctx.fillRect(0, 0, width, height)
            
            if (root.isDrawing || root.hasSelection) {
                ctx.globalCompositeOperation = "destination-out"
                ctx.fillStyle = "white"
                root.drawSelectionPath(ctx, root.selX, root.selY, root.selW, root.selH)
                ctx.fill()
            }
        }
        
        Connections {
            target: root
            function onStartPointChanged() { glowMask.requestPaint() }
            function onEndPointChanged() { glowMask.requestPaint() }
            function onIsDrawingChanged() { glowMask.requestPaint() }
        }
    }

    Item {
        id: glowWrapper
        anchors.fill: parent
        visible: selectionBorderCanvas.visible
        opacity: root.glowIntensity
        
        Behavior on opacity {
            NumberAnimation {
                duration: 800
                easing.type: Easing.InOutCubic
            }
        }
        
        Glow {
            anchors.fill: selectionBorderCanvas
            source: selectionBorderCanvas
            radius: 48 * root.glowIntensity
            samples: 64
            color: Qt.rgba(255, 255, 255, 0.6)
            spread: 0.0
            transparentBorder: true
            
            Behavior on radius {
                NumberAnimation {
                    duration: 800
                    easing.type: Easing.InOutCubic
                }
            }
        }

        Glow {
            anchors.fill: selectionBorderCanvas
            source: selectionBorderCanvas
            radius: 20 * root.glowIntensity
            samples: 32
            color: Qt.rgba(255, 255, 255, 0.8)
            spread: 0.15
            transparentBorder: true
            
            Behavior on radius {
                NumberAnimation {
                    duration: 800
                    easing.type: Easing.InOutCubic
                }
            }
        }
        
        Glow {
            anchors.fill: selectionBorderCanvas
            source: selectionBorderCanvas
            radius: 8
            samples: 16
            color: Qt.rgba(255, 255, 255, 0.9)
            spread: 0.3
            transparentBorder: true
        }
        
        layer.enabled: true
        layer.effect: OpacityMask {
            maskSource: glowMask
        }
    }

    MouseArea {
        id: mouseArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.CrossCursor
        
        onPressed: function(mouse) {
            root.startPoint = Qt.point(mouse.x, mouse.y)
            root.endPoint = root.startPoint
            root.isDrawing = true
            root.hasSelection = false
        }
        
        onPositionChanged: function(mouse) {
            if (root.isDrawing) {
                root.endPoint = Qt.point(mouse.x, mouse.y)
            }
        }
        
        onReleased: function(mouse) {
            if (root.isDrawing) {
                root.endPoint = Qt.point(mouse.x, mouse.y)
                root.isDrawing = false
                root.hasSelection = true
                root.controller.finishRectCapture(root.startPoint, root.endPoint)
            }
        }
    }
    
    Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Escape || event.key === Qt.Key_Q) {
            root.controller.cancel()
            event.accepted = true
        }
    }
}
