"""
                   ◆ Spatialshot Build & Test Orchestrator ◆
                                        
           This script automates the complete build pipeline for all
       Spatialshot components — Engine, Orchestrator, and UI layers.
                                        
       It ensures proper environment setup, handles cross-platform builds
      (Windows, Linux, macOS), and executes the full test suite afterward.
                                        
          Each component is built in isolation with detailed logging,
        allowing partial rebuilds and granular error tracking for CI/CD.
                                        
       NOTE: Requires system dependencies like Cargo, Node.js, and Bash.
            For Windows users, PowerShell (pwsh) must be installed.
                       HACK: View latest GitHub Release ↴
             https://github.com/a7mddra/spatialshot/releases/latest
"""