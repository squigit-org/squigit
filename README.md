# <img src=".assets/header.svg" alt="logo">

[![SpatialShot CI](https://github.com/a7mddra/spatialshot/actions/workflows/distribute.yml/badge.svg?branch=v1.0.0)](https://github.com/a7mddra/spatialshot/actions/workflows/distribute.yml)
[![SpatialShot Installers](https://github.com/a7mddra/spatialshot/actions/workflows/installers.yml/badge.svg)](https://github.com/a7mddra/spatialshot/actions/workflows/installers.yml)
[![spatialshot](https://img.shields.io/github/package-json/v/a7mddra/spatialshot?filename=packages%2Fspatialshot%2Fpackage.json&label=spatialshot&color=orange)](https://github.com/a7mddra/spatialshot/blob/main/packages/spatialshot/package.json)
[![License](https://img.shields.io/github/license/a7mddra/spatialshot)](https://github.com/a7mddra/spatialshot/blob/main/LICENSE)

![SpatialShot Screenshot](.assets/)

SpatialShot is an open-source "Circle to Search" desktop utility that brings the power of AI vision directly to your screen. It provides seamless screen capture, analysis, and visual search capabilities with a single hotkey.

Explore detailed guides and architecture in our [documentation](https://github.com/a7mddra/spatialshot/tree/main/docs).

## 🚀 Why SpatialShot?

- **🎯 Native Performance**: Polyglot architecture with C++ capture, Rust orchestration, and Electron UI.
- **🔗 Bring Your Own Key (BYOK)**: No middleman. Plug your own Gemini and ImgBB API keys for direct, cost-effective access.
- **⚡ Instant Global Hotkey**: `Super/Cmd/Win + Shift + A` freezes your desktop for instant capture from anywhere.
- **🧠 Multi-Model Support**: Switch between Gemini 2.5 Flash (speed), 2.5 Pro (power), and 1.5 Lite.
- **🪄 Google Lens Integration**: One-click visual search by automatically hosting images and launching Google Lens.
- **🔒 Local-First Security**: Your API keys, images, and conversations never leave your machine.

## 📦 Installation

### Pre-requisites before installation

- Windows 10+, macOS 12+, or Linux (X11/Wayland)
- 64-bit system

### Quick Install

Download the appropriate installer for your operating system:

#### Windows

Download [`SpatialShot_Installer.exe`](https://github.com/a7mddra/spatialshot/releases/download/installers/spatialshot-installer-win-x64.zip).

#### macOS

Download [`spatialshot-installer.dmg`](https://github.com/a7mddra/spatialshot/releases/download/installers/spatialshot-installer-mac-x64.zip).

#### Linux

Download [`spatialshot-installer`](https://github.com/a7mddra/spatialshot/releases/download/installers/spatialshot-installer-linux-x64.zip).

## ⭐ Key Features

### Instant Screen Capture & Analysis

- Press `Super/Cmd/Win + Shift + A` anywhere to freeze your screen
- Draw any shape around content with intelligent cropping
- Get immediate AI analysis powered by Google Gemini models
- Continue conversations with follow-up questions

### Multi-Modal AI Integration

- **Direct Gemini API Access**: Your prompts go straight to Google's models with zero hops
- **Visual Context Injection**: Screenshots are automatically included in chat context
- **Model Hot-Swapping**: Instantly switch between Gemini models for different tasks

### Cross-Platform Visual Search

- **One-Click Google Lens**: Upload screenshots to ImgBB and open in Google Lens
- **Secure Image Handling**: Local encryption with AES-256 for API keys
- **Privacy-First**: No central server, no data collection

### Advanced Desktop Integration

- **Global Hotkey Registration**: Works across all applications
- **Multi-Monitor Support**: Captures and manages all displays simultaneously
- **Platform-Optimized Capture**: Different strategies for X11, Wayland, Windows, and macOS

## 🔐 Authentication: Bring Your Own Key ([BYOK](docs/06-policies/BYOK.md))

SpatialShot operates on a zero-trust, local-first model where you provide your own API keys.

### Setup Process

1. **Launch SpatialShot** and signup
2. **Generate API Keys** on the official provider sites:
   - **Gemini**: [Google AI Studio](https://aistudio.google.com/app/apikey)
   - **ImgBB**: [ImgBB API](https://api.imgbb.com/)
3. **Copy to Clipboard** - SpatialShot automatically detects and securely stores your keys

### Security Guarantees

- **Local Storage**: Keys encrypted with AES-256 and stored in your user directory
- **Direct Communication**: No proxy servers - requests go directly to `generativelanguage.googleapis.com` and `api.imgbb.com`
- **Clipboard Safety**: Keys are never manually pasted; automatic detection prevents keylogging exposure
- **Revocable Access**: You control and can revoke keys anytime via provider dashboards

## 🚀 Getting Started

### Basic Usage

#### Instant Capture (Hotkey Method)

1. Press `Super/Cmd/Win + Shift + A`
2. Draw a shape around the content you want to analyze
3. Release to capture and open SpatialShot with AI analysis

#### Direct Application Launch

1. Open SpatialShot from your applications menu
2. Drag & drop an image or use the file dialog
3. Chat with the AI about your uploaded image

#### Google Lens Integration

1. Capture or upload an image
2. Click the "Google Lens" button in the chat interface
3. Visual search opens in your default browser

### Quick Examples

#### Analyze Code from Screen

```bash
# 1. Press Super+Shift+A
# 2. Draw around the code snippet
# 3. Ask: "Explain this function and suggest improvements"
```

#### Research Web Content

```bash
# 1. Press Super+Shift+A on an article
# 2. Draw around the text
# 3. Ask: "Summarize the key points and find related sources"
```

#### Visual Product Search

```bash
# 1. Press Super+Shift+A on a product image
# 2. Draw around the product
# 3. Click "Google Lens" to find it online
```

## 📚 Documentation

### Getting Started

- [**Quick Start Guide**](docs/01-getting-started/QUICKSTART.md) - First-time setup and basic usage
- [**Installation Guide**](docs/01-getting-started/INSTALLATION.md) - Detailed installation instructions
- [**BYOK Model**](docs/06-policies/BYOK.md) - Understanding Bring Your Own Key

### Architecture & Development

- [**System Architecture**](docs/02-architecture/ARCHITECTURE.md) - High-level overview with diagrams
- [**Build System**](docs/02-architecture/BUILD.md) - Compilation and packaging
- [**CaptureKit**](docs/02-architecture/CAPTUREKIT.md) - Screen capture engine (C++/Qt6)
- [**Orchestrator**](docs/02-architecture/ORCHESTRATOR.md) - Core lifecycle manager (Rust)
- [**SpatialShot App**](docs/02-architecture/SPATIALSHOT.md) - Electron/React application

### Development & Contribution

- [**Development Guide**](docs/03-development/DEVELOPMENT.md) - Setting up your dev environment
- [**Contributing Guide**](docs/03-development/CONTRIBUTING.md) - How to contribute
- [**Debugging Guide**](docs/03-development/DEBUGGING.md) - Troubleshooting and diagnostics

### Deployment & Operations

- [**CI/CD Architecture**](docs/04-deployment/CI_ARCHITECTURE.md) - Automated build pipelines
- [**Installer Architecture**](docs/04-deployment/INSTALLERS.md) - Cross-platform deployment
- [**Release Strategy**](docs/04-deployment/RELEASE_STRATEGY.md) - Version control and updates

### API Reference

- [**Configuration Guide**](docs/05-api-reference/CONFIGURATION.md) - Runtime configuration files
- [**IPC Protocol**](docs/05-api-reference/IPC_PROTOCOL.md) - Inter-process communication

### Policies

- [**Code of Conduct**](docs/06-policies/CODE_OF_CONDUCT.md) - Community guidelines
- [**Security Policy**](docs/06-policies/SECURITY.md) - Vulnerability reporting and practices

## 🤝 Contributing

We welcome contributions! SpatialShot is fully open source, and we encourage the community to:

- Report bugs and suggest features
- Improve documentation
- Submit code improvements
- Share platform-specific optimizations

See our [Contributing Guide](docs/03-development/CONTRIBUTING.md) for development setup, coding standards, and how to submit pull requests.

Check our [TODO List](TODO.md) for planned features and priorities.

## 📖 Resources

- **[Documentation](https://github.com/a7mddra/spatialshot/tree/main/docs)** - Complete documentation hub
- **[GitHub Issues](https://github.com/a7mddra/spatialshot/issues)** - Report bugs or request features
- **[Security Policy](docs/06-policies/SECURITY.md)** - Security updates and reporting

## 📄 Legal

- **License**: [Apache License 2.0](LICENSE)
- **Security**: [Security Policy](docs/06-policies/SECURITY.md)
- **Privacy**: No data collection, local-only operation

---

<p align="center">
  Built with ❤️ by the open source community
</p>
